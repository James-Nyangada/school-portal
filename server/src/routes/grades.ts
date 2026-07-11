import { Router } from 'express';
import { requireAuth, requireRole, AuthRequest, checkAccess } from '../middleware/auth';
import { PrismaClient, GradeStatus } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

// GET /api/grades
router.get('/', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { studentId, status } = req.query;
    
    // If user is a student or parent viewing grades, enforce fee-gating
    if (req.user?.role === 'STUDENT') {
      if (studentId && req.user.id !== studentId) {
        return res.status(403).json({ error: 'Forbidden' });
      }
      const canAccess = await checkAccess(req.user.id, 'Grades');
      if (!canAccess) {
        return res.status(403).json({ error: 'Fee balance too high. Access to grades denied.' });
      }
    }
    // (Parent check would also go here if we verify parent-student relationship)

    const where: any = {};
    if (studentId) where.studentId = studentId as string;
    if (status) where.status = status as GradeStatus;

    const grades = await prisma.grade.findMany({
      where,
      include: {
        student: { select: { firstName: true, lastName: true, admissionNumber: true } },
        subject: { select: { name: true, code: true } }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json(grades);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/grades
router.post('/', requireAuth, requireRole('TEACHER', 'ADMIN', 'SUPER_ADMIN'), async (req: AuthRequest, res) => {
  try {
    const { studentId, subjectId, term, value, teacherComment } = req.body;

    if (!studentId || !subjectId || !term || !value) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Check if grade already exists
    const existingGrade = await prisma.grade.findFirst({
      where: { studentId, subjectId, term }
    });

    if (existingGrade) {
      // If editing an existing PUBLISHED grade -> PENDING_APPROVAL and GradeAuditLog
      if (existingGrade.status === GradeStatus.PUBLISHED) {
        const result = await prisma.$transaction(async (tx) => {
          const updatedGrade = await tx.grade.update({
            where: { id: existingGrade.id },
            data: { status: GradeStatus.PENDING_APPROVAL } // actual value doesn't change yet, waiting for approval
          });

          await tx.gradeAuditLog.create({
            data: {
              gradeId: existingGrade.id,
              previousValue: existingGrade.value,
              newValue: value,
              changedById: req.user!.id,
              status: 'PENDING',
              reason: 'Teacher edited published grade'
            }
          });

          return updatedGrade;
        });
        return res.json({ message: 'Grade edit submitted for approval', grade: result });
      } else {
        // If it's DRAFT or already PENDING_APPROVAL, maybe just update it?
        // Let's assume teacher can update drafts directly
        const updatedGrade = await prisma.grade.update({
          where: { id: existingGrade.id },
          data: { value, teacherComment, status: GradeStatus.DRAFT }
        });
        return res.json({ message: 'Grade updated', grade: updatedGrade });
      }
    } else {
      // Create new grade
      const newGrade = await prisma.grade.create({
        data: {
          studentId,
          subjectId,
          term,
          value,
          teacherComment,
          status: GradeStatus.DRAFT
        }
      });
      return res.status(201).json({ message: 'Grade created', grade: newGrade });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/grades/:id/approve
router.patch('/:id/approve', requireAuth, requireRole('ADMIN', 'SUPER_ADMIN'), async (req: AuthRequest, res) => {
  try {
    const { action } = req.body; // 'APPROVE' or 'REJECT'
    const gradeId = req.params.id as string;

    if (action !== 'APPROVE' && action !== 'REJECT') {
      return res.status(400).json({ error: 'Invalid action' });
    }

    const pendingLog = await prisma.gradeAuditLog.findFirst({
      where: { gradeId, status: 'PENDING' },
      orderBy: { createdAt: 'desc' }
    });

    if (!pendingLog) {
      return res.status(404).json({ error: 'No pending edit found for this grade' });
    }

    const result = await prisma.$transaction(async (tx) => {
      if (action === 'APPROVE') {
        const updatedGrade = await tx.grade.update({
          where: { id: gradeId },
          data: {
            value: pendingLog.newValue,
            status: GradeStatus.PUBLISHED
          }
        });

        await tx.gradeAuditLog.update({
          where: { id: pendingLog.id },
          data: {
            status: 'APPROVED',
            approvedById: req.user!.id
          }
        });
        return updatedGrade;
      } else {
        const revertedGrade = await tx.grade.update({
          where: { id: gradeId },
          data: {
            status: GradeStatus.PUBLISHED
          }
        });

        await tx.gradeAuditLog.update({
          where: { id: pendingLog.id },
          data: {
            status: 'REJECTED',
            approvedById: req.user!.id
          }
        });
        return revertedGrade;
      }
    });

    res.json({ message: `Grade edit ${action.toLowerCase()}d successfully`, grade: result });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
