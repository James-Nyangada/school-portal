import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole, AuthRequest } from '../middleware/auth';
import { AttendanceStatus } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { raiseAbsenceAlerts } from '../services/attendanceAlerts';
import { HttpError, ttErrorHandler } from '../services/tt/db';
import { CellLesson, filterCells, GridCell, loadCells, scheduleDto } from '../services/tt/grid.service';

const router = Router();

const STAFF = ['TEACHER', 'ADMIN', 'SUPER_ADMIN'];
const isAdmin = (role?: string) => role === 'ADMIN' || role === 'SUPER_ADMIN';

// ============================================================
// Dates. Registers are keyed by calendar date, stored as UTC midnight.
// Day position i in the bell schedule (ordered by index) is Monday + i, as in /api/tt/published/today.
// ============================================================

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
const toIso = (d: Date) => d.toISOString().slice(0, 10);
const parseIso = (s: string) => new Date(`${s}T00:00:00Z`);
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);
const todayUtc = () => parseIso(toIso(new Date()));
const mondayOf = (d: Date) => addDays(d, -((d.getUTCDay() + 6) % 7));

// ============================================================
// Timetable lookups
// ============================================================

type Schedule = ReturnType<typeof scheduleDto>;

type Session = {
  entryId: string;
  dayIndex: number;
  dayName: string;
  dayPos: number;
  periodIndex: number;
  periodName: string;
  length: number;
  startTime: string;
  endTime: string;
  room: string | null;
};

async function currentPublished() {
  return prisma.ttTimetable.findFirst({ where: { status: 'published' }, orderBy: { publishedAt: 'desc' } });
}

function toSession(cell: GridCell, lesson: CellLesson, dto: Schedule): Session {
  const dayPos = dto.days.findIndex((d) => d.index === cell.dayIndex);
  const start = dto.periods.find((p) => p.index === cell.periodIndex);
  const end = dto.periods.find((p) => p.index === cell.periodIndex + cell.length - 1);

  return {
    entryId: cell.entryId,
    dayIndex: cell.dayIndex,
    dayName: dto.days[dayPos]?.name ?? '',
    dayPos,
    periodIndex: cell.periodIndex,
    periodName: cell.length > 1 && end ? `${start?.name ?? ''} – ${end.name}` : (start?.name ?? ''),
    length: cell.length,
    startTime: start?.startTime ?? '',
    endTime: end?.endTime ?? '',
    room: lesson.room
  };
}

/** The published timetable's lessons, each with the periods it is placed in. `teacherId` null = every lesson. */
export async function loadTeaching(teacherId: string | null) {
  const tt = await currentPublished();

  if (!tt) return null;

  const { cells, schedule, lessons } = await loadCells(tt.id);
  const dto = scheduleDto(schedule);
  const groups = new Map<string, { lesson: CellLesson; groupId: string | null; sessions: Session[] }>();
  const groupOf = new Map(lessons.map((l) => [l.id, l.groupId]));

  for (const cell of teacherId ? filterCells(cells, 'teacher', teacherId) : cells) {
    for (const lesson of cell.lessons) {
      const g = groups.get(lesson.lessonId) ?? { lesson, groupId: groupOf.get(lesson.lessonId) ?? null, sessions: [] };
      g.sessions.push(toSession(cell, lesson, dto));
      groups.set(lesson.lessonId, g);
    }
  }

  groups.forEach((g) => g.sessions.sort((a, b) => a.dayPos - b.dayPos || a.periodIndex - b.periodIndex));

  return { tt, dto, groups };
}

// ============================================================
// Class lists
// ============================================================

type RosterStudent = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  admissionNumber: string | null;
  passportPhotoUrl: string | null;
  classId: string | null;
  studentSubjects: { subjectId: string }[];
};

/** Current students of the given classes, with their enrolment in the given subjects (for option blocks). */
async function loadStudents(classIds: string[], subjectIds: string[]): Promise<RosterStudent[]> {
  if (classIds.length === 0) return [];

  return prisma.user.findMany({
    where: { role: 'STUDENT', classId: { in: classIds }, status: { notIn: ['TRANSFERRED', 'COMPLETED'] } },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      admissionNumber: true,
      passportPhotoUrl: true,
      classId: true,
      studentSubjects: { where: { subjectId: { in: subjectIds } }, select: { subjectId: true } }
    },
    orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }]
  });
}

/**
 * Who sits this lesson: everyone in its classes. In an option block the classes are split between
 * parallel lessons, so keep only students enrolled in the subject (whole class if nobody is enrolled yet).
 */
function rosterFor(lesson: CellLesson, groupId: string | null, students: RosterStudent[]) {
  const inClasses = students.filter((s) => s.classId && lesson.classIds.includes(s.classId));

  if (!groupId) return inClasses;

  const enrolled = inClasses.filter((s) => s.studentSubjects.some((x) => x.subjectId === lesson.subjectId));

  return enrolled.length > 0 ? enrolled : inClasses;
}

// ============================================================
// Register access
// ============================================================

const registerQuery = z.object({ lessonId: z.string().min(1), entryId: z.string().min(1), date: isoDate });

/**
 * Resolve one register (lesson × placed period × date) and check the caller may take it:
 * a teacher of the lesson, the cover teacher for that day, or an admin.
 */
async function openRegister(req: AuthRequest, q: z.infer<typeof registerQuery>) {
  const teaching = await loadTeaching(null);

  if (!teaching) throw new HttpError(404, 'No timetable has been published yet.');

  const g = teaching.groups.get(q.lessonId);
  const session = g?.sessions.find((s) => s.entryId === q.entryId);

  if (!g || !session) throw new HttpError(404, 'That lesson is not in this period on the published timetable.');

  const date = parseIso(q.date);

  if (date.getTime() > todayUtc().getTime()) throw new HttpError(400, 'You can only take a register on or after the day of the lesson.');

  if (date.getTime() - mondayOf(date).getTime() !== session.dayPos * 86_400_000) {
    throw new HttpError(400, `This period is on ${session.dayName}, but ${q.date} is a different day.`);
  }

  const userId = req.user!.id;

  if (!isAdmin(req.user!.role) && !g.lesson.teacherIds.includes(userId)) {
    const cover = await prisma.ttSubstitution.findFirst({ where: { entryId: q.entryId, date, coverTeacherId: userId } });

    if (!cover) throw new HttpError(403, 'Only the teacher of this lesson (or their cover) can take this register.');
  }

  const students = rosterFor(g.lesson, g.groupId, await loadStudents(g.lesson.classIds, [g.lesson.subjectId]));

  return { lesson: g.lesson, session, date, students };
}

const lessonDto = (l: CellLesson) => ({
  lessonId: l.lessonId,
  subjectId: l.subjectId,
  subject: l.subject,
  subjectName: l.subjectName,
  color: l.color,
  classes: l.classIds.map((id, i) => ({ id, name: l.classes[i] ?? '?' })),
  teachers: l.teachers
});

const tally = (statuses: AttendanceStatus[]) => ({
  present: statuses.filter((s) => s === 'PRESENT').length,
  late: statuses.filter((s) => s === 'LATE').length,
  absent: statuses.filter((s) => s === 'ABSENT').length,
  total: statuses.length
});

// ============================================================
// GET /api/attendance/lessons — the signed-in teacher's lessons, with today's registers
// ============================================================
router.get('/lessons', requireAuth, requireRole(...STAFF), async (req: AuthRequest, res) => {
  const teaching = await loadTeaching(req.user!.id);
  const today = todayUtc();

  if (!teaching) return res.json({ timetable: null, today: toIso(today), lessons: [] });

  const groups = [...teaching.groups.values()];
  const students = await loadStudents(
    [...new Set(groups.flatMap((g) => g.lesson.classIds))],
    [...new Set(groups.map((g) => g.lesson.subjectId))]
  );
  const todayPos = (today.getUTCDay() + 6) % 7;
  const marked = await prisma.attendanceRecord.groupBy({
    by: ['lessonId', 'entryId'],
    where: { date: today, lessonId: { in: groups.map((g) => g.lesson.lessonId) } },
    _count: { _all: true }
  });
  const markedCount = (lessonId: string, entryId: string) =>
    marked.find((m) => m.lessonId === lessonId && m.entryId === entryId)?._count._all ?? 0;

  res.json({
    timetable: { id: teaching.tt.id, name: teaching.tt.name, term: teaching.tt.term },
    today: toIso(today),
    dayName: teaching.dto.days[todayPos]?.name ?? null,
    lessons: groups
      .map((g) => ({
        ...lessonDto(g.lesson),
        studentCount: rosterFor(g.lesson, g.groupId, students).length,
        sessions: g.sessions,
        today: g.sessions
          .filter((s) => s.dayPos === todayPos)
          .map((s) => ({ ...s, date: toIso(today), marked: markedCount(g.lesson.lessonId, s.entryId) }))
      }))
      .sort((a, b) => a.subjectName.localeCompare(b.subjectName) || (a.classes[0]?.name ?? '').localeCompare(b.classes[0]?.name ?? ''))
  });
});

// ============================================================
// GET /api/attendance/lessons/:lessonId?week=YYYY-MM-DD — one lesson's periods in a week, with register status
// ============================================================
router.get('/lessons/:lessonId', requireAuth, requireRole(...STAFF), async (req: AuthRequest, res) => {
  const week = isoDate.optional().parse(req.query.week);
  const teaching = await loadTeaching(isAdmin(req.user!.role) ? null : req.user!.id);
  const g = teaching?.groups.get(req.params.lessonId as string);

  if (!teaching || !g) throw new HttpError(404, 'You do not teach this lesson on the published timetable.');

  const today = todayUtc();
  const monday = mondayOf(week ? parseIso(week) : today);
  const students = rosterFor(g.lesson, g.groupId, await loadStudents(g.lesson.classIds, [g.lesson.subjectId]));
  const records = await prisma.attendanceRecord.findMany({
    where: { lessonId: g.lesson.lessonId, date: { gte: monday, lte: addDays(monday, 6) } },
    select: { entryId: true, date: true, status: true, updatedAt: true }
  });

  res.json({
    lesson: { ...lessonDto(g.lesson), studentCount: students.length },
    today: toIso(today),
    week: {
      start: toIso(monday),
      end: toIso(addDays(monday, Math.max(teaching.dto.days.length, 1) - 1)),
      prev: toIso(addDays(monday, -7)),
      next: toIso(addDays(monday, 7)),
      isCurrent: monday.getTime() === mondayOf(today).getTime()
    },
    sessions: g.sessions.map((s) => {
      const date = addDays(monday, s.dayPos);
      const mine = records.filter((r) => r.entryId === s.entryId && r.date.getTime() === date.getTime());

      return {
        ...s,
        date: toIso(date),
        upcoming: date.getTime() > today.getTime(),
        summary: mine.length > 0 ? tally(mine.map((r) => r.status)) : null,
        markedAt: mine.length > 0 ? new Date(Math.max(...mine.map((r) => r.updatedAt.getTime()))) : null
      };
    })
  });
});

// ============================================================
// GET /api/attendance/register?lessonId&entryId&date — class list with any marks already saved
// ============================================================
router.get('/register', requireAuth, requireRole(...STAFF), async (req: AuthRequest, res) => {
  const q = registerQuery.parse(req.query);
  const { lesson, session, students } = await openRegister(req, q);
  const existing = await prisma.attendanceRecord.findMany({
    where: { lessonId: q.lessonId, entryId: q.entryId, date: parseIso(q.date) },
    select: { studentId: true, status: true, updatedAt: true, markedById: true }
  });
  const byStudent = new Map(existing.map((r) => [r.studentId, r]));
  const lastSaved = existing.reduce<(typeof existing)[number] | null>((a, r) => (!a || r.updatedAt > a.updatedAt ? r : a), null);
  const markedBy = lastSaved?.markedById
    ? await prisma.user.findUnique({ where: { id: lastSaved.markedById }, select: { firstName: true, lastName: true } })
    : null;
  const className = new Map(lesson.classIds.map((id, i) => [id, lesson.classes[i] ?? '']));

  res.json({
    lesson: lessonDto(lesson),
    session: { ...session, date: q.date },
    markedAt: lastSaved?.updatedAt ?? null,
    markedBy: markedBy ? [markedBy.firstName, markedBy.lastName].filter(Boolean).join(' ') : null,
    students: students.map((s) => ({
      id: s.id,
      name: [s.firstName, s.lastName].filter(Boolean).join(' ') || 'Unnamed student',
      admissionNumber: s.admissionNumber,
      photo: s.passportPhotoUrl,
      className: s.classId ? (className.get(s.classId) ?? '') : '',
      status: byStudent.get(s.id)?.status ?? null
    }))
  });
});

// ============================================================
// PUT /api/attendance/register — save (or correct) a register
// ============================================================
const saveBody = registerQuery.extend({
  records: z
    .array(z.object({ studentId: z.string().min(1), status: z.enum(['PRESENT', 'ABSENT', 'LATE']) }))
    .min(1, 'Mark at least one student')
});

router.put('/register', requireAuth, requireRole(...STAFF), async (req: AuthRequest, res) => {
  const body = saveBody.parse(req.body);
  const { lesson, session, date, students } = await openRegister(req, body);
  const onRoster = new Set(students.map((s) => s.id));
  const stranger = body.records.find((r) => !onRoster.has(r.studentId));

  if (stranger) throw new HttpError(400, 'One of the students is not in this class.');

  const records = [...new Map(body.records.map((r) => [r.studentId, r])).values()];
  const studentIds = records.map((r) => r.studentId);
  const where = { lessonId: lesson.lessonId, entryId: session.entryId, date, studentId: { in: studentIds } };
  const label = `${lesson.subjectName} · ${session.periodName}`;
  const counts = tally(records.map((r) => r.status as AttendanceStatus));

  const previous = await prisma.$transaction(async (tx) => {
    const before = await tx.attendanceRecord.findMany({ where, select: { studentId: true, status: true } });
    await tx.attendanceRecord.deleteMany({ where });
    await tx.attendanceRecord.createMany({
      data: records.map((r) => ({
        studentId: r.studentId,
        date,
        status: r.status as AttendanceStatus,
        lesson: label,
        lessonId: lesson.lessonId,
        entryId: session.entryId,
        subjectId: lesson.subjectId,
        markedById: req.user!.id
      }))
    });
    await tx.auditLog.create({
      data: {
        actorId: req.user!.id,
        action: before.length > 0 ? 'ATTENDANCE_UPDATED' : 'ATTENDANCE_MARKED',
        details: `${label} · ${lesson.classes.join(', ')} · ${toIso(date)}: ${counts.present} present, ${counts.late} late, ${counts.absent} absent`
      }
    });

    return new Map(before.map((r) => [r.studentId, r.status]));
  });

  // Alert parents of students who now have an absence streak or low monthly attendance (only when this save newly marks them absent)
  const newlyAbsent = records.filter((r) => r.status === 'ABSENT' && previous.get(r.studentId) !== 'ABSENT');
  const flags = await raiseAbsenceAlerts(newlyAbsent.map((r) => r.studentId), req.user!.id);

  res.json({ message: 'Attendance saved', saved: records.length, summary: counts, flags });
});

// POST /api/attendance — free-form records (not tied to a timetable period)
router.post('/', requireAuth, requireRole('TEACHER', 'ADMIN', 'SUPER_ADMIN'), async (req: AuthRequest, res) => {
  try {
    const { date, lesson, records } = req.body;
    // records: Array of { studentId, status }

    if (!date || !records || !Array.isArray(records)) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const attendanceDate = new Date(date);
    const absentIds: string[] = [];

    const result = await prisma.$transaction(async (tx) => {
      const createdRecords = [];

      for (const record of records) {
        const { studentId, status } = record;

        // 1. Create attendance record
        const newRecord = await tx.attendanceRecord.create({
          data: {
            studentId,
            date: attendanceDate,
            lesson,
            status: status as AttendanceStatus,
            markedById: req.user!.id
          }
        });
        createdRecords.push(newRecord);

        if (status === AttendanceStatus.ABSENT) absentIds.push(studentId);
      }

      return createdRecords;
    });

    const flags = (await raiseAbsenceAlerts(absentIds, req.user!.id)).map((id) => `Student ${id} has 3 consecutive absences.`);

    res.status(201).json({
      message: 'Attendance recorded successfully',
      records: result,
      flags
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/attendance — a student's records. Students see their own, parents their linked children. Never fee-gated.
router.get('/', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { startDate, endDate } = req.query;
    let studentId = typeof req.query.studentId === 'string' ? req.query.studentId : undefined;
    const role = req.user!.role;

    if (role === 'STUDENT') {
      studentId = req.user!.id;
    } else if (role === 'PARENT') {
      if (!studentId) {
        const firstLink = await prisma.studentParent.findFirst({
          where: { parentId: req.user!.id },
          select: { studentId: true }
        });
        studentId = firstLink?.studentId;
      } else {
        const link = await prisma.studentParent.findUnique({
          where: { studentId_parentId: { studentId, parentId: req.user!.id } }
        });

        if (!link) return res.status(403).json({ error: 'You can only view attendance for your own children.' });
      }

      if (!studentId) {
        return res.json([]);
      }
    } else if (!STAFF.includes(role)) {
      return res.status(403).json({ error: 'Forbidden: Insufficient permissions' });
    }

    const where: any = {};
    if (studentId) where.studentId = studentId;
    if (startDate && endDate) {
      where.date = {
        gte: new Date(startDate as string),
        lte: new Date(endDate as string)
      };
    }

    const records = await prisma.attendanceRecord.findMany({
      where,
      orderBy: [{ date: 'desc' }, { updatedAt: 'desc' }]
    });

    res.json(records);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.use(ttErrorHandler);

export default router;
