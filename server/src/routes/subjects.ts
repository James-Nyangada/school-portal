import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth';
import { prisma } from '../lib/prisma';

const router = Router();

// Get all subjects
router.get('/', requireAuth, async (req, res) => {
  try {
    const subjects = await prisma.subject.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { taughtBy: true, classSubjects: true } } },
    });
    res.json(subjects);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch subjects' });
  }
});

// Get the subjects the signed-in teacher teaches (set on the staff page)
router.get('/mine', requireAuth, async (req: any, res) => {
  try {
    const subjects = await prisma.subject.findMany({
      where: { taughtBy: { some: { teacherId: req.user.id } } },
      orderBy: { name: 'asc' },
    });
    res.json(subjects);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch subjects' });
  }
});

// Get a single subject
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const id = req.params.id as string;
    const subject = await prisma.subject.findUnique({
      where: { id },
    });
    if (!subject) {
      return res.status(404).json({ error: 'Subject not found' });
    }
    res.json(subject);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch subject' });
  }
});

// Create a subject
router.post('/', requireAuth, requireRole('ADMIN'), async (req, res) => {
  try {
    const { name, code } = req.body;
    if (!name || !code) {
      return res.status(400).json({ error: 'Name and code are required' });
    }
    const newSubject = await prisma.subject.create({
      data: { name, code },
    });
    res.status(201).json(newSubject);
  } catch (error) {
    console.error(error);
    res.status(400).json({ error: 'Failed to create subject. Code may already exist.' });
  }
});

// Update a subject
router.patch('/:id', requireAuth, requireRole('ADMIN'), async (req, res) => {
  try {
    const id = req.params.id as string;
    const { name, code } = req.body;
    const updatedSubject = await prisma.subject.update({
      where: { id },
      data: { name, code },
    });
    res.json(updatedSubject);
  } catch (error) {
    console.error(error);
    res.status(400).json({ error: 'Failed to update subject' });
  }
});

// Delete a subject
router.delete('/:id', requireAuth, requireRole('ADMIN'), async (req, res) => {
  try {
    const id = req.params.id as string;
    await prisma.subject.delete({
      where: { id },
    });
    res.status(204).send();
  } catch (error) {
    console.error(error);
    res.status(400).json({ error: 'Failed to delete subject' });
  }
});

export default router;
