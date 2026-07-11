import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { requireAuth, requireRole } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

// Get assignments for a teacher
router.get('/:teacherId', requireAuth, async (req, res) => {
  try {
    const teacherId = req.params.teacherId as string;
    const assignments = await prisma.teacherSubjectClass.findMany({
      where: { teacherId },
      include: {
        subject: true,
        class: true,
      },
    });
    res.json(assignments);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch teacher assignments' });
  }
});

// Assign a teacher to a class + subject
router.post('/', requireAuth, requireRole('ADMIN'), async (req, res) => {
  try {
    const { teacherId, subjectId, classId } = req.body;
    
    if (!teacherId || !subjectId || !classId) {
      return res.status(400).json({ error: 'teacherId, subjectId, and classId are required' });
    }

    // Upsert or create
    const assignment = await prisma.teacherSubjectClass.upsert({
      where: {
        teacherId_subjectId_classId: {
          teacherId,
          subjectId,
          classId,
        }
      },
      update: {},
      create: {
        teacherId,
        subjectId,
        classId,
      },
      include: {
        subject: true,
        class: true,
      }
    });

    res.status(201).json(assignment);
  } catch (error) {
    console.error(error);
    res.status(400).json({ error: 'Failed to create teacher assignment' });
  }
});

// Remove an assignment
router.delete('/:id', requireAuth, requireRole('ADMIN'), async (req, res) => {
  try {
    const id = req.params.id as string;
    await prisma.teacherSubjectClass.delete({
      where: { id },
    });
    res.status(204).send();
  } catch (error) {
    console.error(error);
    res.status(400).json({ error: 'Failed to delete teacher assignment' });
  }
});

export default router;
