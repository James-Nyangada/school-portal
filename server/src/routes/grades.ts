import { Router } from 'express';
import { z } from 'zod';
import { Grade, GradingMode, Prisma, SchoolSettings } from '@prisma/client';
import { requireAuth, requireRole, AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { HttpError, Tx, ttErrorHandler } from '../services/tt/db';
import { feeAccess, lockMessage } from '../services/fees';
import {
  applyData,
  boundariesOf,
  describe,
  getSettings,
  GradeData,
  LEVELS,
  modeFor,
  snapshot
} from '../services/grading';

/**
 * Grades (school-dashboard-spec 3.2, dashboard-full-ui-logic-spec 2.5 / 3.3 / 5.3 / 6.2).
 *
 *   DRAFT ──publish──> PUBLISHED ──teacher edit/delete──> PENDING_APPROVAL ──approve──> PUBLISHED (new value)
 *                                                                          └─reject───> PUBLISHED (original kept)
 *
 * The Grade row always holds the live value; a pending edit lives in GradeChangeRequest until an admin decides it,
 * so students and parents can only ever see published values. Admin edits apply at once but still go through a
 * self-approved request and the audit log. Grades are never hard-deleted.
 */
const router = Router();

const STAFF = ['TEACHER', 'ADMIN', 'SUPER_ADMIN'];
const isAdmin = (role?: string) => role === 'ADMIN' || role === 'SUPER_ADMIN';
const fullName = (u: { firstName: string | null; lastName: string | null } | null | undefined) =>
  u ? [u.firstName, u.lastName].filter(Boolean).join(' ') || 'Unnamed' : '—';

// ============================================================
// Helpers
// ============================================================

/** Teachers may only grade the subject + class pairs they are assigned to; admins may grade any. */
async function assertCanGrade(user: AuthRequest['user'], classId: string | null, subjectId: string) {
  if (isAdmin(user?.role)) return;

  const assigned =
    classId &&
    (await prisma.teacherSubjectClass.findFirst({ where: { teacherId: user!.id, classId, subjectId }, select: { id: true } }));

  if (!assigned) throw new HttpError(403, 'You are not assigned to teach this subject in this class');
}

/** Current students of a class who take the subject (the whole class when nobody has chosen it as an option). */
async function roster(classId: string, subjectId: string) {
  const students = await prisma.user.findMany({
    where: { role: 'STUDENT', classId, status: { notIn: ['TRANSFERRED', 'COMPLETED'] } },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      admissionNumber: true,
      studentSubjects: { where: { subjectId }, select: { subjectId: true } }
    },
    orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }]
  });
  const enrolled = students.filter((s) => s.studentSubjects.length > 0);

  return (enrolled.length > 0 ? enrolled : students).map((s) => ({
    id: s.id,
    name: fullName(s),
    admissionNumber: s.admissionNumber
  }));
}

/** Serialise concurrent writes to the same grade slot so two saves can't create duplicate rows. */
const lock = (tx: Tx, key: string) => tx.$queryRaw`SELECT 1 AS ok FROM (SELECT pg_advisory_xact_lock(hashtext(${key}))) AS l`;

type LogInput = {
  grade: Pick<Grade, 'id' | 'studentId'>;
  action: string;
  actorId: string;
  previousValue?: string | null | undefined;
  newValue: string;
  reason?: string | null | undefined;
  approvedById?: string | null | undefined;
  details: string;
};

/** Append to the grade's own history and to the school-wide audit log. */
async function logGrade(tx: Tx, l: LogInput) {
  await tx.gradeAuditLog.create({
    data: {
      gradeId: l.grade.id,
      action: l.action,
      previousValue: l.previousValue ?? null,
      newValue: l.newValue,
      changedById: l.actorId,
      approvedById: l.approvedById ?? null,
      reason: l.reason ?? null,
      status: l.action.endsWith('_REJECTED') ? 'REJECTED' : l.action.endsWith('_REQUESTED') ? 'PENDING' : 'APPROVED'
    }
  });
  await tx.auditLog.create({
    data: { actorId: l.actorId, action: `GRADE_${l.action}`, targetId: l.grade.studentId, details: l.details }
  });
}

async function notifyStudentAndParents(tx: Tx, studentId: string, title: string, message: string) {
  const parents = await tx.studentParent.findMany({ where: { studentId }, select: { parentId: true } });

  await tx.notification.createMany({
    data: [
      { userId: studentId, type: 'GRADE_UPDATED', title, message, link: '/student/grades' },
      ...parents.map((p) => ({ userId: p.parentId, type: 'GRADE_UPDATED', title, message, link: '/parent/grades' }))
    ]
  });
}

const gradeLabel = (g: { term: string; strand?: string | null; subStrand?: string | null; subject?: { name: string } | null }) =>
  [g.subject?.name, g.strand, g.subStrand, g.term].filter(Boolean).join(' · ');

// ============================================================
// Settings (System Settings → Grading)
// ============================================================

const boundarySchema = z.object({ grade: z.string().trim().min(1).max(4), min: z.number().min(0).max(100) });

const settingsSchema = z
  .object({
    gradingMode: z.enum(['NUMERIC', 'CBC']),
    currentTerm: z.string().trim().min(1).max(40),
    catCount: z.number().int().min(0).max(6),
    catMaxScore: z.number().positive().max(1000),
    examMaxScore: z.number().positive().max(1000),
    catWeight: z.number().min(0).max(100),
    examWeight: z.number().min(0).max(100),
    gradeBoundaries: z.array(boundarySchema).min(1).max(20),
    approvalSlaHours: z.number().int().min(1).max(24 * 30),
    feeGateThreshold: z.number().min(0).max(100)
  })
  .superRefine((s, ctx) => {
    if (Math.abs(s.catWeight + s.examWeight - 100) > 0.001)
      ctx.addIssue({ code: 'custom', path: ['catWeight'], message: 'CAT and exam weights must add up to 100' });

    if (s.catCount === 0 && s.catWeight > 0)
      ctx.addIssue({ code: 'custom', path: ['catWeight'], message: 'Set the CAT weight to 0 when there are no CATs' });

    if (!s.gradeBoundaries.some((b) => b.min === 0))
      ctx.addIssue({ code: 'custom', path: ['gradeBoundaries'], message: 'The lowest grade must start at 0' });

    if (new Set(s.gradeBoundaries.map((b) => b.grade)).size !== s.gradeBoundaries.length)
      ctx.addIssue({ code: 'custom', path: ['gradeBoundaries'], message: 'Each grade can only appear once' });
  });

const settingsDto = (s: SchoolSettings) => ({ ...s, gradeBoundaries: boundariesOf(s) });

router.get('/settings', requireAuth, async (_req, res) => {
  const [settings, classes] = await Promise.all([
    getSettings(),
    prisma.class.findMany({ select: { id: true, name: true, gradingMode: true }, orderBy: [{ level: 'asc' }, { name: 'asc' }] })
  ]);

  res.json({ settings: settingsDto(settings), classes });
});

router.put('/settings', requireAuth, requireRole('SUPER_ADMIN'), async (req: AuthRequest, res) => {
  const data = settingsSchema.parse(req.body);
  const settings = await prisma.$transaction(async (tx) => {
    await getSettings(tx);
    const updated = await tx.schoolSettings.update({ where: { id: 1 }, data });

    // Drafts follow the new weighting; published totals only change through the approval flow.
    const drafts = await tx.grade.findMany({ where: { status: 'DRAFT', mode: 'NUMERIC', deletedAt: null } });

    for (const g of drafts) await tx.grade.update({ where: { id: g.id }, data: applyData(updated, g, {}) });

    await tx.auditLog.create({
      data: { actorId: req.user!.id, action: 'SETTINGS_GRADING_UPDATED', details: JSON.stringify(data) }
    });

    return updated;
  });

  res.json({ settings: settingsDto(settings) });
});

router.put('/settings/classes/:classId', requireAuth, requireRole('SUPER_ADMIN'), async (req: AuthRequest, res) => {
  const { gradingMode } = z.object({ gradingMode: z.enum(['NUMERIC', 'CBC']).nullable() }).parse(req.body);
  const cls = await prisma.class.update({
    where: { id: req.params.classId as string },
    data: { gradingMode },
    select: { id: true, name: true, gradingMode: true }
  });

  await prisma.auditLog.create({
    data: { actorId: req.user!.id, action: 'SETTINGS_CLASS_GRADING_MODE', details: `${cls.name}: ${gradingMode ?? 'school default'}` }
  });
  res.json(cls);
});

// ============================================================
// Gradebook (Teacher 3.3)
// ============================================================

/** Class + subject pairs the user can grade, and the terms grades exist for. */
router.get('/gradebook/options', requireAuth, requireRole(...STAFF), async (req: AuthRequest, res) => {
  const settings = await getSettings();
  const pairs = isAdmin(req.user!.role)
    ? await prisma.classSubject.findMany({ include: { class: true, subject: true } })
    : await prisma.teacherSubjectClass.findMany({ where: { teacherId: req.user!.id }, include: { class: true, subject: true } });
  const terms = await prisma.grade.findMany({ distinct: ['term'], select: { term: true }, orderBy: { createdAt: 'asc' } });

  res.json({
    currentTerm: settings.currentTerm,
    terms: [...new Set([...terms.map((t) => t.term), settings.currentTerm])],
    options: pairs
      .map((p) => ({
        classId: p.classId,
        className: p.class.name,
        subjectId: p.subjectId,
        subjectName: p.subject.name,
        subjectCode: p.subject.code,
        mode: modeFor(settings, p.class)
      }))
      .sort((a, b) => a.className.localeCompare(b.className) || a.subjectName.localeCompare(b.subjectName))
  });
});

const selectionSchema = z.object({
  classId: z.string().min(1),
  subjectId: z.string().min(1),
  term: z.string().trim().min(1).max(40)
});

router.get('/gradebook', requireAuth, requireRole(...STAFF), async (req: AuthRequest, res) => {
  const { classId, subjectId, term } = selectionSchema.parse(req.query);

  await assertCanGrade(req.user, classId, subjectId);

  const [settings, cls, subject, students] = await Promise.all([
    getSettings(),
    prisma.class.findUnique({ where: { id: classId }, select: { id: true, name: true, gradingMode: true } }),
    prisma.subject.findUnique({ where: { id: subjectId }, select: { id: true, name: true, code: true } }),
    roster(classId, subjectId)
  ]);

  if (!cls || !subject) throw new HttpError(404, 'Class or subject not found');

  const mode = modeFor(settings, cls);
  const grades = await prisma.grade.findMany({
    where: { studentId: { in: students.map((s) => s.id) }, subjectId, term, mode, deletedAt: null },
    include: { changeRequests: { orderBy: { createdAt: 'desc' }, take: 1 } },
    orderBy: { createdAt: 'asc' }
  });

  res.json({
    mode,
    term,
    class: { id: cls.id, name: cls.name },
    subject,
    canEditDirectly: isAdmin(req.user!.role),
    settings: {
      catCount: settings.catCount,
      catMaxScore: settings.catMaxScore,
      examMaxScore: settings.examMaxScore,
      catWeight: settings.catWeight,
      examWeight: settings.examWeight,
      gradeBoundaries: boundariesOf(settings)
    },
    students,
    grades: grades.map(({ changeRequests, ...g }) => {
      const last = changeRequests[0];

      return {
        ...g,
        pending: last?.status === 'PENDING' ? last : null,
        // Show the teacher why their last request was turned down, until the grade changes again
        lastRejection: last?.status === 'REJECTED' ? last : null
      };
    })
  });
});

const entrySchema = selectionSchema.extend({
  studentId: z.string().min(1),
  catScores: z.array(z.number().min(0)).optional(),
  examScore: z.number().min(0).nullable().optional(),
  strand: z.string().trim().min(1).max(80).optional(),
  subStrand: z.string().trim().max(80).nullable().optional(),
  assessmentType: z.enum(['FORMATIVE', 'SUMMATIVE']).optional(),
  competencyLevel: z.enum(LEVELS as [string, ...string[]]).nullable().optional(),
  teacherComment: z.string().trim().max(500).nullable().optional(),
  reason: z.string().trim().max(500).optional()
});

/**
 * Create or change one grade. Numeric grades are keyed by student + subject + term; CBC grades also by strand,
 * sub-strand and assessment type. Drafts change in place; a published grade becomes an approval request
 * (teachers) or a logged, self-approved edit (admins).
 */
router.post('/entries', requireAuth, requireRole(...STAFF), async (req: AuthRequest, res) => {
  const body = entrySchema.parse(req.body);
  const actor = req.user!;

  await assertCanGrade(actor, body.classId, body.subjectId);

  const [settings, cls, student] = await Promise.all([
    getSettings(),
    prisma.class.findUnique({ where: { id: body.classId }, select: { gradingMode: true } }),
    prisma.user.findFirst({ where: { id: body.studentId, role: 'STUDENT', classId: body.classId }, select: { id: true } })
  ]);

  if (!student) throw new HttpError(400, 'This student is not in the selected class');

  const mode: GradingMode = modeFor(settings, cls);
  const data: GradeData = {};

  if (body.teacherComment !== undefined) data.teacherComment = body.teacherComment || null;

  if (mode === 'NUMERIC') {
    if (body.catScores !== undefined) {
      if (body.catScores.length > settings.catCount) throw new HttpError(400, `Only ${settings.catCount} CAT(s) are configured`);

      if (body.catScores.some((c) => c > settings.catMaxScore)) throw new HttpError(400, `CAT scores are out of ${settings.catMaxScore}`);

      data.catScores = body.catScores;
    }

    if (body.examScore !== undefined) {
      if (body.examScore !== null && body.examScore > settings.examMaxScore)
        throw new HttpError(400, `The exam is out of ${settings.examMaxScore}`);

      data.examScore = body.examScore;
    }
  } else {
    if (!body.strand || !body.assessmentType) throw new HttpError(400, 'CBC grades need a strand and an assessment type');

    if (body.competencyLevel !== undefined) data.competencyLevel = body.competencyLevel as GradeData['competencyLevel'];
  }

  const identity = {
    studentId: body.studentId,
    subjectId: body.subjectId,
    term: body.term,
    mode,
    ...(mode === 'CBC'
      ? { strand: body.strand!, subStrand: body.subStrand || null, assessmentType: body.assessmentType! }
      : {})
  };

  const result = await prisma.$transaction(async (tx) => {
    await lock(tx, JSON.stringify(identity));

    const existing = await tx.grade.findFirst({ where: { ...identity, deletedAt: null }, include: { subject: { select: { name: true } } } });

    if (!existing) {
      const base = { mode, catScores: [] as number[], examScore: null, competencyLevel: null };
      const fields = applyData(settings, base, data);

      if (!fields.value) throw new HttpError(400, 'Enter a score or level before saving');

      const grade = await tx.grade.create({
        data: { ...identity, ...fields, status: 'DRAFT', enteredById: actor.id },
        include: { subject: { select: { name: true } } }
      });

      await logGrade(tx, { grade, action: 'CREATED', actorId: actor.id, newValue: describe(mode, snapshot(grade), settings), details: `Draft ${gradeLabel(grade)}: ${grade.value}` });

      return { message: 'Saved as draft', grade };
    }

    const before = describe(mode, snapshot(existing), settings);
    const fields = applyData(settings, existing, data);
    const after = describe(mode, { ...snapshot(existing), ...data }, settings);

    if (existing.status === 'PENDING_APPROVAL')
      throw new HttpError(409, 'A change to this grade is already waiting for approval');

    if (existing.status === 'DRAFT') {
      const grade = await tx.grade.update({ where: { id: existing.id }, data: { ...fields, enteredById: actor.id } });

      await logGrade(tx, { grade, action: 'DRAFT_UPDATED', actorId: actor.id, previousValue: before, newValue: after, details: `Draft ${gradeLabel(existing)}: ${before} → ${after}` });

      return { message: 'Draft updated', grade };
    }

    // PUBLISHED
    if (before === after && (data.teacherComment === undefined || data.teacherComment === existing.teacherComment))
      throw new HttpError(400, 'Nothing has changed');

    if (!body.reason || body.reason.length < 3) throw new HttpError(400, 'Give a reason for changing a published grade');

    const request = {
      gradeId: existing.id,
      type: 'EDIT' as const,
      previousData: snapshot(existing) as Prisma.InputJsonValue,
      newData: { ...snapshot(existing), ...data } as Prisma.InputJsonValue,
      previousValue: before,
      newValue: after,
      reason: body.reason,
      requestedById: actor.id
    };

    if (isAdmin(actor.role)) {
      await tx.gradeChangeRequest.create({
        data: { ...request, status: 'APPROVED', decidedById: actor.id, decidedAt: new Date(), decisionReason: 'Admin edit (self-approved)' }
      });
      const grade = await tx.grade.update({ where: { id: existing.id }, data: fields });

      await logGrade(tx, { grade, action: 'ADMIN_EDITED', actorId: actor.id, approvedById: actor.id, previousValue: before, newValue: after, reason: body.reason, details: `${gradeLabel(existing)}: ${before} → ${after}` });
      await notifyStudentAndParents(tx, grade.studentId, 'Grade updated', `${gradeLabel(existing)} was updated.`);

      return { message: 'Grade updated', grade };
    }

    await tx.gradeChangeRequest.create({ data: request });
    const grade = await tx.grade.update({ where: { id: existing.id }, data: { status: 'PENDING_APPROVAL' } });

    await logGrade(tx, { grade, action: 'EDIT_REQUESTED', actorId: actor.id, previousValue: before, newValue: after, reason: body.reason, details: `${gradeLabel(existing)}: ${before} → ${after}` });

    return { message: 'Change sent to the admin for approval', grade };
  });

  res.json(result);
});

/** Publish every draft in a class + subject + term. */
router.post('/publish', requireAuth, requireRole(...STAFF), async (req: AuthRequest, res) => {
  const { classId, subjectId, term } = selectionSchema.parse(req.body);

  await assertCanGrade(req.user, classId, subjectId);

  const students = await roster(classId, subjectId);
  const settings = await getSettings();
  const cls = await prisma.class.findUnique({ where: { id: classId }, select: { name: true, gradingMode: true } });
  const subject = await prisma.subject.findUnique({ where: { id: subjectId }, select: { name: true } });

  const published = await prisma.$transaction(async (tx) => {
    const drafts = await tx.grade.findMany({
      where: { studentId: { in: students.map((s) => s.id) }, subjectId, term, mode: modeFor(settings, cls), status: 'DRAFT', deletedAt: null, value: { not: '' } }
    });

    if (drafts.length === 0) return 0;

    const now = new Date();

    await tx.grade.updateMany({ where: { id: { in: drafts.map((d) => d.id) } }, data: { status: 'PUBLISHED', publishedAt: now } });
    await tx.gradeAuditLog.createMany({
      data: drafts.map((d) => ({ gradeId: d.id, action: 'PUBLISHED', previousValue: null, newValue: d.value, changedById: req.user!.id, status: 'APPROVED' }))
    });
    await tx.auditLog.create({
      data: { actorId: req.user!.id, action: 'GRADES_PUBLISHED', details: `${subject?.name} · ${cls?.name} · ${term}: ${drafts.length} grade(s)` }
    });

    return drafts.length;
  });

  res.json({ message: published ? `Published ${published} grade(s)` : 'There are no drafts to publish', published });
});

/** Delete a grade. Drafts are soft-deleted at once; a published grade needs approval unless an admin deletes it. */
router.post('/:id/delete', requireAuth, requireRole(...STAFF), async (req: AuthRequest, res) => {
  const { reason } = z.object({ reason: z.string().trim().max(500).optional() }).parse(req.body);
  const actor = req.user!;
  const settings = await getSettings();

  const result = await prisma.$transaction(async (tx) => {
    const existing = await tx.grade.findFirst({
      where: { id: req.params.id as string, deletedAt: null },
      include: { subject: { select: { name: true } }, student: { select: { classId: true } } }
    });

    if (!existing) throw new HttpError(404, 'Grade not found');

    await assertCanGrade(actor, existing.student.classId, existing.subjectId);

    const before = describe(existing.mode, snapshot(existing), settings);

    if (existing.status === 'PENDING_APPROVAL') throw new HttpError(409, 'A change to this grade is already waiting for approval');

    if (existing.status === 'DRAFT' || isAdmin(actor.role)) {
      if (existing.status === 'PUBLISHED') {
        if (!reason || reason.length < 3) throw new HttpError(400, 'Give a reason for deleting a published grade');

        await tx.gradeChangeRequest.create({
          data: {
            gradeId: existing.id, type: 'DELETE', status: 'APPROVED', previousData: snapshot(existing) as Prisma.InputJsonValue,
            previousValue: before, reason, requestedById: actor.id, decidedById: actor.id, decidedAt: new Date(), decisionReason: 'Admin delete (self-approved)'
          }
        });
      }

      const grade = await tx.grade.update({ where: { id: existing.id }, data: { deletedAt: new Date() } });

      await logGrade(tx, { grade, action: 'DELETED', actorId: actor.id, approvedById: isAdmin(actor.role) ? actor.id : null, previousValue: before, newValue: '(deleted)', reason, details: `${gradeLabel(existing)}: ${before} deleted` });

      return { message: 'Grade deleted' };
    }

    if (!reason || reason.length < 3) throw new HttpError(400, 'Give a reason for deleting a published grade');

    await tx.gradeChangeRequest.create({
      data: { gradeId: existing.id, type: 'DELETE', previousData: snapshot(existing) as Prisma.InputJsonValue, previousValue: before, reason, requestedById: actor.id }
    });
    const grade = await tx.grade.update({ where: { id: existing.id }, data: { status: 'PENDING_APPROVAL' } });

    await logGrade(tx, { grade, action: 'DELETE_REQUESTED', actorId: actor.id, previousValue: before, newValue: '(delete)', reason, details: `${gradeLabel(existing)}: delete requested` });

    return { message: 'Delete request sent to the admin for approval' };
  });

  res.json(result);
});

/** Full edit and approval history of one grade. */
router.get('/:id/history', requireAuth, requireRole(...STAFF), async (req: AuthRequest, res) => {
  const grade = await prisma.grade.findUnique({ where: { id: req.params.id as string }, include: { student: { select: { classId: true } } } });

  if (!grade) throw new HttpError(404, 'Grade not found');

  await assertCanGrade(req.user, grade.student.classId, grade.subjectId);

  const logs = await prisma.gradeAuditLog.findMany({
    where: { gradeId: grade.id },
    include: {
      changedBy: { select: { firstName: true, lastName: true, role: true } },
      approvedBy: { select: { firstName: true, lastName: true } }
    },
    orderBy: { createdAt: 'desc' }
  });

  res.json(
    logs.map((l) => ({
      id: l.id,
      action: l.action,
      previousValue: l.previousValue,
      newValue: l.newValue,
      reason: l.reason,
      changedBy: fullName(l.changedBy),
      approvedBy: l.approvedBy ? fullName(l.approvedBy) : null,
      createdAt: l.createdAt
    }))
  );
});

// ============================================================
// Approval queue (Admin 2.5)
// ============================================================

const requestInclude = {
  requestedBy: { select: { firstName: true, lastName: true } },
  decidedBy: { select: { firstName: true, lastName: true } },
  grade: {
    include: {
      subject: { select: { name: true, code: true } },
      student: { select: { firstName: true, lastName: true, admissionNumber: true, class: { select: { name: true } } } }
    }
  }
} satisfies Prisma.GradeChangeRequestInclude;

type RequestRow = Prisma.GradeChangeRequestGetPayload<{ include: typeof requestInclude }>;

function requestDto(r: RequestRow, settings: SchoolSettings) {
  const end = r.decidedAt ?? new Date();
  const hoursPending = (end.getTime() - r.createdAt.getTime()) / 3_600_000;
  const g = r.grade;

  return {
    id: r.id,
    type: r.type,
    status: r.status,
    gradeId: g.id,
    mode: g.mode,
    student: fullName(g.student),
    admissionNumber: g.student.admissionNumber,
    className: g.student.class?.name ?? null,
    subject: g.subject.name,
    term: g.term,
    strand: g.strand,
    subStrand: g.subStrand,
    assessmentType: g.assessmentType,
    previousData: r.previousData,
    newData: r.newData,
    previousValue: r.previousValue,
    newValue: r.newValue,
    reason: r.reason,
    requestedBy: fullName(r.requestedBy),
    decidedBy: r.decidedBy ? fullName(r.decidedBy) : null,
    decidedAt: r.decidedAt,
    decisionReason: r.decisionReason,
    createdAt: r.createdAt,
    daysPending: Math.floor(hoursPending / 24),
    overdue: r.status === 'PENDING' && hoursPending > settings.approvalSlaHours
  };
}

router.get('/requests', requireAuth, requireRole('ADMIN', 'SUPER_ADMIN'), async (req: AuthRequest, res) => {
  const { status } = z.object({ status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'ALL']).default('PENDING') }).parse(req.query);
  const settings = await getSettings();
  const rows = await prisma.gradeChangeRequest.findMany({
    where: status === 'ALL' ? {} : { status },
    include: requestInclude,
    // Pending: oldest first, so the longest-waiting request is at the top. Decided: most recent first.
    orderBy: status === 'PENDING' ? { createdAt: 'asc' } : { decidedAt: 'desc' },
    ...(status === 'PENDING' ? {} : { take: 200 })
  });

  res.json({ slaHours: settings.approvalSlaHours, requests: rows.map((r) => requestDto(r, settings)) });
});

router.get('/requests/summary', requireAuth, requireRole('ADMIN', 'SUPER_ADMIN'), async (_req, res) => {
  const settings = await getSettings();
  const cutoff = new Date(Date.now() - settings.approvalSlaHours * 3_600_000);
  const [pending, overdue] = await Promise.all([
    prisma.gradeChangeRequest.count({ where: { status: 'PENDING' } }),
    prisma.gradeChangeRequest.count({ where: { status: 'PENDING', createdAt: { lt: cutoff } } })
  ]);

  res.json({ pending, overdue, slaHours: settings.approvalSlaHours });
});

async function decide(requestId: string, actorId: string, approve: boolean, decisionReason?: string) {
  const settings = await getSettings();

  return prisma.$transaction(async (tx) => {
    const r = await tx.gradeChangeRequest.findUnique({ where: { id: requestId }, include: { grade: { include: { subject: { select: { name: true } } } } } });

    if (!r) throw new HttpError(404, 'Request not found');

    if (r.status !== 'PENDING') throw new HttpError(409, 'This request has already been decided');

    const g = r.grade;
    const label = gradeLabel(g);
    const decided = { status: approve ? ('APPROVED' as const) : ('REJECTED' as const), decidedById: actorId, decidedAt: new Date(), decisionReason: decisionReason ?? null };

    await tx.gradeChangeRequest.update({ where: { id: r.id }, data: decided });

    if (!approve) {
      await tx.grade.update({ where: { id: g.id }, data: { status: 'PUBLISHED' } });
      await logGrade(tx, { grade: g, action: `${r.type}_REJECTED`, actorId, approvedById: actorId, previousValue: r.previousValue, newValue: r.newValue ?? '(delete)', reason: decisionReason, details: `${label}: ${r.type.toLowerCase()} rejected — ${decisionReason}` });
      await tx.notification.create({
        data: {
          userId: r.requestedById,
          type: 'GRADE_REQUEST_REJECTED',
          title: `Grade ${r.type === 'EDIT' ? 'change' : 'deletion'} rejected`,
          message: `${label}: ${decisionReason}`,
          link: '/teacher/gradebook'
        }
      });

      return r;
    }

    if (r.type === 'DELETE') {
      await tx.grade.update({ where: { id: g.id }, data: { status: 'PUBLISHED', deletedAt: new Date() } });
      await logGrade(tx, { grade: g, action: 'DELETE_APPROVED', actorId, approvedById: actorId, previousValue: r.previousValue, newValue: '(deleted)', reason: r.reason, details: `${label}: deletion approved` });
      await notifyStudentAndParents(tx, g.studentId, 'Grade removed', `${label} was removed by the school.`);
    } else {
      await tx.grade.update({ where: { id: g.id }, data: { ...applyData(settings, g, (r.newData ?? {}) as GradeData), status: 'PUBLISHED' } });
      await logGrade(tx, { grade: g, action: 'EDIT_APPROVED', actorId, approvedById: actorId, previousValue: r.previousValue, newValue: r.newValue ?? '', reason: r.reason, details: `${label}: ${r.previousValue} → ${r.newValue}` });
      await notifyStudentAndParents(tx, g.studentId, 'Grade updated', `${label} was updated.`);
    }

    await tx.notification.create({
      data: {
        userId: r.requestedById,
        type: 'GRADE_REQUEST_APPROVED',
        title: `Grade ${r.type === 'EDIT' ? 'change' : 'deletion'} approved`,
        message: label,
        link: '/teacher/gradebook'
      }
    });

    return r;
  });
}

router.post('/requests/:id/approve', requireAuth, requireRole('ADMIN', 'SUPER_ADMIN'), async (req: AuthRequest, res) => {
  await decide(req.params.id as string, req.user!.id, true);
  res.json({ message: 'Approved — the new value is live' });
});

router.post('/requests/:id/reject', requireAuth, requireRole('ADMIN', 'SUPER_ADMIN'), async (req: AuthRequest, res) => {
  const { reason } = z.object({ reason: z.string().trim().min(3, 'Give the teacher a reason').max(500) }).parse(req.body);

  await decide(req.params.id as string, req.user!.id, false, reason);
  res.json({ message: 'Rejected — the original value stays live' });
});

router.post('/requests/bulk-approve', requireAuth, requireRole('ADMIN', 'SUPER_ADMIN'), async (req: AuthRequest, res) => {
  const { ids } = z.object({ ids: z.array(z.string().min(1)).min(1).max(100) }).parse(req.body);
  const failed: { id: string; error: string }[] = [];

  for (const id of ids) {
    try {
      await decide(id, req.user!.id, true);
    } catch (e) {
      failed.push({ id, error: e instanceof Error ? e.message : 'Failed' });
    }
  }

  res.json({ approved: ids.length - failed.length, failed });
});

// ============================================================
// Student / parent view (5.3, 6.2) — published values only, fee-gated
// ============================================================

async function assertCanView(user: AuthRequest['user'], studentId: string) {
  if (STAFF.includes(user!.role)) return;

  if (user!.role === 'STUDENT' && user!.id === studentId) return;

  if (user!.role === 'PARENT') {
    const link = await prisma.studentParent.findFirst({ where: { parentId: user!.id, studentId }, select: { id: true } });

    if (link) return;
  }

  throw new HttpError(403, 'Forbidden');
}

const VISIBLE = { status: { in: ['PUBLISHED' as const, 'PENDING_APPROVAL' as const] }, deletedAt: null };

router.get('/student/:studentId', requireAuth, async (req: AuthRequest, res) => {
  const studentId = req.params.studentId as string;

  await assertCanView(req.user, studentId);

  const [settings, student] = await Promise.all([
    getSettings(),
    prisma.user.findFirst({
      where: { id: studentId, role: 'STUDENT' },
      select: { firstName: true, lastName: true, admissionNumber: true, class: { select: { name: true, gradingMode: true } } }
    })
  ]);

  if (!student) throw new HttpError(404, 'Student not found');

  const access = await feeAccess(studentId, 'Grades');
  const gated = !STAFF.includes(req.user!.role) && !access.allowed;
  const grades = gated
    ? []
    : await prisma.grade.findMany({
        where: { studentId, ...VISIBLE },
        include: { subject: { select: { name: true, code: true } } },
        orderBy: [{ createdAt: 'asc' }]
      });

  // Terms in the order they were first graded
  const terms = [...new Set(grades.map((g) => g.term))];

  res.json({
    access: { ...access, allowed: !gated },
    student: { name: fullName(student), admissionNumber: student.admissionNumber, className: student.class?.name ?? null },
    mode: modeFor(settings, student.class),
    currentTerm: settings.currentTerm,
    settings: { catCount: settings.catCount, catMaxScore: settings.catMaxScore, examMaxScore: settings.examMaxScore },
    terms,
    grades: grades.map((g) => ({
      id: g.id,
      subject: g.subject.name,
      subjectCode: g.subject.code,
      term: g.term,
      mode: g.mode,
      catScores: g.catScores,
      examScore: g.examScore,
      total: g.total,
      letterGrade: g.letterGrade,
      value: g.value,
      strand: g.strand,
      subStrand: g.subStrand,
      competencyLevel: g.competencyLevel,
      assessmentType: g.assessmentType,
      teacherComment: g.teacherComment
    }))
  });
});

// GET /api/grades?studentId= — flat list of visible grades (dashboards). Same access rules as above.
router.get('/', requireAuth, async (req: AuthRequest, res) => {
  const { studentId } = z.object({ studentId: z.string().optional() }).parse(req.query);
  const role = req.user!.role;

  if (!isAdmin(role) && !studentId) throw new HttpError(400, 'studentId is required');

  if (studentId) {
    await assertCanView(req.user, studentId);

    if (!STAFF.includes(role)) {
      const access = await feeAccess(studentId, 'Grades');
      if (!access.allowed) throw new HttpError(402, lockMessage(access, 'Grades'), { locked: true, access });
    }
  }

  const grades = await prisma.grade.findMany({
    where: { ...(studentId ? { studentId } : {}), ...VISIBLE },
    include: {
      student: { select: { firstName: true, lastName: true, admissionNumber: true } },
      subject: { select: { name: true, code: true } }
    },
    orderBy: { createdAt: 'desc' }
  });

  res.json(grades);
});

router.use(ttErrorHandler);

export default router;
