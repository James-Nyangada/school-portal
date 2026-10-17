import { Router } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';

const router = Router();

// GET /api/notifications?unread=true — the signed-in user's alerts, newest first
router.get('/', requireAuth, async (req: AuthRequest, res) => {
  try {
    const notifications = await prisma.notification.findMany({
      where: {
        userId: req.user!.id,
        ...(req.query.unread === 'true' ? { readAt: null } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    res.json(notifications);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

// PATCH /api/notifications/:id/read
router.patch('/:id/read', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { count } = await prisma.notification.updateMany({
      where: { id: req.params.id as string, userId: req.user!.id, readAt: null },
      data: { readAt: new Date() },
    });
    res.json({ updated: count });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to update notification' });
  }
});

export default router;
