import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { requireAuth, requireRole } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

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
    const newClass = await prisma.class.create({
      data: {
        name,
        level: level !== undefined && level !== null ? parseInt(level as string, 10) : null,
        classTeacherId: classTeacherId || null,
      },
    });
    res.status(201).json(newClass);
  } catch (error) {
    console.error(error);
    res.status(400).json({ error: 'Failed to create class' });
  }
});

// Update a class
router.patch('/:id', requireAuth, requireRole('ADMIN'), async (req, res) => {
  try {
    const id = req.params.id as string;
    const { name, level, classTeacherId } = req.body;

    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (level !== undefined) {
      updateData.level = level !== null ? parseInt(level as string, 10) : null;
    }
    if (classTeacherId !== undefined) {
      updateData.classTeacherId = classTeacherId || null;
    }

    const updatedClass = await prisma.class.update({
      where: { id },
      data: updateData,
    });
    res.json(updatedClass);
  } catch (error) {
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
