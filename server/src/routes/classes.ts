import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { requireAuth, requireRole, AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';

const router = Router();

/** A class teacher must be an existing TEACHER account. Returns an error message, or null when valid. */
async function invalidClassTeacher(classTeacherId: unknown): Promise<string | null> {
  if (!classTeacherId) return null;
  const teacher = await prisma.user.findUnique({
    where: { id: String(classTeacherId) },
    select: { role: true },
  });
  return teacher?.role === 'TEACHER' ? null : 'Class teacher must be a teacher account';
}

/** classTeacherId is unique, so a teacher can lead only one class. */
async function classTeacherConflict(error: unknown, classTeacherId: unknown): Promise<string | null> {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002' || !classTeacherId) {
    return null;
  }
  const existing = await prisma.class.findUnique({
    where: { classTeacherId: String(classTeacherId) },
    select: { name: true },
  });
  return `This teacher is already the class teacher of ${existing?.name ?? 'another class'}`;
}

const DAY_MS = 86_400_000;
const todayUtc = () => new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`);

// The signed-in teacher's own class (the one they are class teacher of), or null
router.get('/mine', requireAuth, requireRole('TEACHER'), async (req: AuthRequest, res) => {
  try {
    const classRecord = await prisma.class.findUnique({
      where: { classTeacherId: req.user!.id },
      include: {
        students: {
          where: { role: 'STUDENT' },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            admissionNumber: true,
            status: true,
            passportPhotoUrl: true,
            childLinks: {
              select: {
                relationship: true,
                parent: { select: { id: true, firstName: true, lastName: true, phone: true, email: true } },
              },
            },
          },
          orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
        },
        subjects: { include: { subject: { select: { id: true, name: true, code: true } } } },
        teacherSubjects: {
          select: {
            subjectId: true,
            teacher: { select: { id: true, firstName: true, lastName: true } },
          },
        },
      },
    });

    if (!classRecord) return res.json(null);

    const studentIds = classRecord.students.map((s) => s.id);
    const today = todayUtc();
    const since = new Date(today.getTime() - 29 * DAY_MS);

    const records = studentIds.length
      ? await prisma.attendanceRecord.findMany({
          where: { studentId: { in: studentIds }, date: { gte: since } },
          select: { studentId: true, date: true, status: true },
        })
      : [];

    // Per student: today's status (worst mark across today's lessons) and 30-day attendance rate
    const rank = { PRESENT: 0, LATE: 1, ABSENT: 2 } as const;
    const todayStatus = new Map<string, keyof typeof rank>();
    const totals = new Map<string, { marked: number; attended: number }>();

    for (const r of records) {
      const t = totals.get(r.studentId) ?? { marked: 0, attended: 0 };
      t.marked += 1;
      if (r.status !== 'ABSENT') t.attended += 1;
      totals.set(r.studentId, t);

      if (r.date.getTime() === today.getTime()) {
        const prev = todayStatus.get(r.studentId);
        if (prev === undefined || rank[r.status] > rank[prev]) todayStatus.set(r.studentId, r.status);
      }
    }

    const teachersBySubject = new Map<string, { id: string; firstName: string | null; lastName: string | null }[]>();
    for (const ts of classRecord.teacherSubjects) {
      teachersBySubject.set(ts.subjectId, [...(teachersBySubject.get(ts.subjectId) ?? []), ts.teacher]);
    }

    res.json({
      id: classRecord.id,
      name: classRecord.name,
      level: classRecord.level,
      students: classRecord.students.map(({ childLinks, ...s }) => {
        const t = totals.get(s.id);
        return {
          ...s,
          parents: childLinks.map((l) => ({ ...l.parent, relationship: l.relationship })),
          todayStatus: todayStatus.get(s.id) ?? null,
          attendanceRate: t && t.marked ? Math.round((t.attended / t.marked) * 100) : null,
        };
      }),
      subjects: classRecord.subjects.map(({ subject }) => ({
        ...subject,
        teachers: teachersBySubject.get(subject.id) ?? [],
      })),
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch your class' });
  }
});

// Get all classes
router.get('/', requireAuth, async (req, res) => {
  try {
    const classes = await prisma.class.findMany({
      include: {
        classTeacher: {
          select: { id: true, firstName: true, lastName: true },
        },
        _count: {
          select: { students: true },
        },
      },
    });
    res.json(classes);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch classes' });
  }
});

// Get class by id
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const id = req.params.id as string;
    const classRecord = await prisma.class.findUnique({
      where: { id },
      include: {
        classTeacher: {
          select: { id: true, firstName: true, lastName: true },
        },
        _count: {
          select: { students: true },
        },
      },
    });
    if (!classRecord) {
      return res.status(404).json({ error: 'Class not found' });
    }
    res.json(classRecord);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch class' });
  }
});

// Create a class
router.post('/', requireAuth, requireRole('ADMIN'), async (req, res) => {
  try {
    const { name, level, classTeacherId } = req.body;
    const invalid = await invalidClassTeacher(classTeacherId);
    if (invalid) return res.status(400).json({ error: invalid });

    const newClass = await prisma.class.create({
      data: {
        name,
        level: level !== undefined && level !== null ? parseInt(level as string, 10) : null,
        classTeacherId: classTeacherId || null,
      },
    });
    res.status(201).json(newClass);
  } catch (error) {
    const conflict = await classTeacherConflict(error, req.body.classTeacherId);
    if (conflict) return res.status(409).json({ error: conflict });
    console.error(error);
    res.status(400).json({ error: 'Failed to create class' });
  }
});

// Update a class
router.patch('/:id', requireAuth, requireRole('ADMIN'), async (req: AuthRequest, res) => {
  try {
    const id = req.params.id as string;
    const { name, level, classTeacherId, studentsCanPay } = req.body;
    if (studentsCanPay !== undefined && typeof studentsCanPay !== 'boolean') {
      return res.status(400).json({ error: 'studentsCanPay must be true or false' });
    }
    const invalid = await invalidClassTeacher(classTeacherId);
    if (invalid) return res.status(400).json({ error: invalid });

    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (level !== undefined) {
      updateData.level = level !== null ? parseInt(level as string, 10) : null;
    }
    if (classTeacherId !== undefined) {
      updateData.classTeacherId = classTeacherId || null;
    }
    if (studentsCanPay !== undefined) updateData.studentsCanPay = studentsCanPay;

    const updatedClass = await prisma.class.update({
      where: { id },
      data: updateData,
    });
    if (studentsCanPay !== undefined) {
      await prisma.auditLog.create({
        data: {
          actorId: req.user!.id,
          action: 'CLASS_FEE_PAYMENT_PERMISSION',
          details: `${updatedClass.name}: students ${studentsCanPay ? 'can now pay fees themselves' : 'are view-only for fees'}`
        }
      });
    }
    res.json(updatedClass);
  } catch (error) {
    const conflict = await classTeacherConflict(error, req.body.classTeacherId);
    if (conflict) return res.status(409).json({ error: conflict });
    console.error(error);
    res.status(400).json({ error: 'Failed to update class' });
  }
});

// Delete a class
router.delete('/:id', requireAuth, requireRole('ADMIN'), async (req, res) => {
  try {
    const id = req.params.id as string;
    await prisma.class.delete({
      where: { id },
    });
    res.status(204).send();
  } catch (error) {
    console.error(error);
    res.status(400).json({ error: 'Failed to delete class' });
  }
});

// Get subjects for a class
router.get('/:id/subjects', requireAuth, async (req, res) => {
  try {
    const id = req.params.id as string;
    const classSubjects = await prisma.classSubject.findMany({
      where: { classId: id },
      include: {
        subject: true,
      },
    });
    res.json(classSubjects.map(cs => cs.subject));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch class subjects' });
  }
});

// Assign subjects to a class
router.post('/:id/subjects', requireAuth, requireRole('ADMIN'), async (req, res) => {
  try {
    const id = req.params.id as string;
    const { subjectIds } = req.body; // array of subject IDs

    if (!Array.isArray(subjectIds)) {
      return res.status(400).json({ error: 'subjectIds must be an array' });
    }

    await prisma.$transaction(async (tx) => {
      await tx.classSubject.deleteMany({
        where: { classId: id },
      });

      if (subjectIds.length > 0) {
        await tx.classSubject.createMany({
          data: subjectIds.map((subjectId: string) => ({
            classId: id,
            subjectId,
          })),
        });
      }
    });

    const updatedSubjects = await prisma.classSubject.findMany({
      where: { classId: id },
      include: { subject: true },
    });

    res.json(updatedSubjects.map(cs => cs.subject));
  } catch (error) {
    console.error(error);
    res.status(400).json({ error: 'Failed to assign class subjects' });
  }
});

export default router;
