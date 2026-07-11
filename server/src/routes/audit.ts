import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

// GET /api/audit-logs
router.get('/', requireAuth, requireRole('SUPER_ADMIN'), async (req, res) => {
  try {
    const { action, startDate, endDate, page = '1', limit = '10' } = req.query;
    const pageNumber = parseInt(page as string, 10);
    const limitNumber = parseInt(limit as string, 10);
    const skip = (pageNumber - 1) * limitNumber;

    const where: any = {};
    if (action && action !== 'All') where.action = action;
    if (startDate && endDate) {
      where.createdAt = {
        gte: new Date(startDate as string),
        lte: new Date(endDate as string)
      };
    }

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        skip,
        take: limitNumber,
        include: {
          actor: { select: { firstName: true, lastName: true, email: true } },
          target: { select: { firstName: true, lastName: true, email: true } }
        },
        orderBy: { createdAt: 'desc' }
      }),
      prisma.auditLog.count({ where })
    ]);

    res.json({ logs, total, page: pageNumber, limit: limitNumber });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
