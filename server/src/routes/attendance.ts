import { Router } from 'express';
import { requireAuth, requireRole, AuthRequest } from '../middleware/auth';
import { PrismaClient, AttendanceStatus } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

// POST /api/attendance
router.post('/', requireAuth, requireRole('TEACHER', 'ADMIN', 'SUPER_ADMIN'), async (req: AuthRequest, res) => {
  try {
    const { date, lesson, records } = req.body;
    // records: Array of { studentId, status }

    if (!date || !records || !Array.isArray(records)) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const attendanceDate = new Date(date);
    const flags: string[] = [];

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
            status: status as AttendanceStatus
          }
        });
        createdRecords.push(newRecord);

        // 2. Logic to flag 3 consecutive absences
        if (status === AttendanceStatus.ABSENT) {
          // Fetch last 3 records (including the one just created)
          const recentRecords = await tx.attendanceRecord.findMany({
            where: { studentId },
            orderBy: { date: 'desc' },
            take: 3
          });

          if (recentRecords.length === 3) {
            const allAbsent = recentRecords.every(r => r.status === AttendanceStatus.ABSENT);
            if (allAbsent) {
              flags.push(`Student ${studentId} has 3 consecutive absences.`);
              // Here we could also create a notification, audit log, or alert record depending on system design
              await tx.auditLog.create({
                data: {
                  actorId: req.user!.id,
                  action: 'ATTENDANCE_FLAG',
                  targetId: studentId,
                  details: 'Flagged for 3 consecutive absences'
                }
              });
            }
          }
        }
      }

      return createdRecords;
    });

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

// GET /api/attendance
router.get('/', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { studentId, startDate, endDate } = req.query;

    const where: any = {};
    if (studentId) where.studentId = studentId as string;
    if (startDate && endDate) {
      where.date = {
        gte: new Date(startDate as string),
        lte: new Date(endDate as string)
      };
    }

    const records = await prisma.attendanceRecord.findMany({
      where,
      orderBy: { date: 'desc' }
    });

    res.json(records);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
