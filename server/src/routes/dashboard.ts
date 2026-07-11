import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

// GET /api/dashboard/stats
router.get('/stats', requireAuth, requireRole('ADMIN', 'SUPER_ADMIN'), async (req, res) => {
  try {
    const [
      totalUsers,
      totalStudents,
      totalTeachers,
      totalFinance,
      totalParents,
      recentAuditLogs
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { role: 'STUDENT' } }),
      prisma.user.count({ where: { role: 'TEACHER' } }),
      prisma.user.count({ where: { role: 'FINANCE' } }),
      prisma.user.count({ where: { role: 'PARENT' } }),
      prisma.auditLog.findMany({
        take: 5,
        orderBy: { createdAt: 'desc' },
        include: { actor: { select: { firstName: true, lastName: true } } }
      })
    ]);

    res.json({
      totalUsers,
      usersByRole: {
        STUDENT: totalStudents,
        TEACHER: totalTeachers,
        FINANCE: totalFinance,
        PARENT: totalParents,
      },
      recentAuditLogs
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
