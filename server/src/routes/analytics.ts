import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { requireAuth, requireRole, AuthRequest } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

// ============================================================
// GET /api/analytics/performance — Class/Subject performance
// ============================================================
router.get('/performance', requireAuth, requireRole('ADMIN'), async (req: AuthRequest, res) => {
  try {
    // Aggregate grades by subject
    const grades = await prisma.grade.findMany({
      where: { status: 'PUBLISHED' },
      include: { subject: { select: { name: true, code: true } } },
    });

    const subjectMap: Record<string, { total: number; count: number; name: string }> = {};
    for (const g of grades) {
      const subName = g.subject?.name || 'Unknown';
      if (!subjectMap[subName]) subjectMap[subName] = { total: 0, count: 0, name: subName };
      const subStats = subjectMap[subName]!;
      const numVal = parseFloat(g.value);
      if (!isNaN(numVal)) {
        subStats.total += numVal;
        subStats.count += 1;
      }
    }

    const subjectPerformance = Object.values(subjectMap).map((s) => ({
      subject: s.name,
      averageScore: s.count > 0 ? Math.round(s.total / s.count) : 0,
      totalGraded: s.count,
    }));

    res.json({ subjectPerformance });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================================
// GET /api/analytics/attendance — Attendance heatmap data
// ============================================================
router.get('/attendance', requireAuth, requireRole('ADMIN'), async (req: AuthRequest, res) => {
  try {
    const records = await prisma.attendanceRecord.findMany({
      orderBy: { date: 'asc' },
    });

    // Build daily attendance summary
    const dailyMap: Record<string, { present: number; absent: number; late: number; total: number }> = {};
    for (const rec of records) {
      const dateKey = rec.date.toISOString().split('T')[0] as string;
      if (!dailyMap[dateKey]) dailyMap[dateKey] = { present: 0, absent: 0, late: 0, total: 0 };
      const stats = dailyMap[dateKey]!;
      stats.total += 1;
      if (rec.status === 'PRESENT') stats.present += 1;
      else if (rec.status === 'ABSENT') stats.absent += 1;
      else if (rec.status === 'LATE') stats.late += 1;
    }

    const heatmapData = Object.entries(dailyMap).map(([date, stats]) => ({
      date,
      ...stats,
      rate: stats.total > 0 ? Math.round((stats.present / stats.total) * 100) : 0,
    }));

    // Also build day-of-week summary
    const dowMap: Record<string, { present: number; total: number }> = {
      Monday: { present: 0, total: 0 },
      Tuesday: { present: 0, total: 0 },
      Wednesday: { present: 0, total: 0 },
      Thursday: { present: 0, total: 0 },
      Friday: { present: 0, total: 0 },
    };
    for (const rec of records) {
      const dow = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][rec.date.getDay()] as string;
      const stats = dowMap[dow];
      if (stats) {
        stats.total += 1;
        if (rec.status === 'PRESENT') stats.present += 1;
      }
    }
    const dayOfWeekSummary = Object.entries(dowMap).map(([day, stats]) => ({
      day,
      rate: stats.total > 0 ? Math.round((stats.present / stats.total) * 100) : 0,
      total: stats.total,
    }));

    res.json({ heatmapData, dayOfWeekSummary });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================================
// GET /api/analytics/fees — Financial metrics
// ============================================================
router.get('/fees', requireAuth, requireRole('ADMIN', 'FINANCE'), async (req: AuthRequest, res) => {
  try {
    const feeRecords = await prisma.feeRecord.findMany();

    let totalBilled = 0;
    let totalCollected = 0;

    // Per-term aggregation
    const termMap: Record<string, { billed: number; collected: number }> = {};

    for (const rec of feeRecords) {
      totalBilled += rec.totalBilled;
      totalCollected += rec.amountPaid;

      if (!termMap[rec.term]) termMap[rec.term] = { billed: 0, collected: 0 };
      const termStats = termMap[rec.term]!;
      termStats.billed += rec.totalBilled;
      termStats.collected += rec.amountPaid;
    }

    const termBreakdown = Object.entries(termMap).map(([term, stats]) => ({
      term,
      billed: stats.billed,
      collected: stats.collected,
      outstanding: stats.billed - stats.collected,
      collectionRate: stats.billed > 0 ? Math.round((stats.collected / stats.billed) * 100) : 0,
    }));

    // Count debtors
    const debtorRecords = feeRecords.filter((r) => r.amountPaid < r.totalBilled);
    const uniqueDebtors = new Set(debtorRecords.map((r) => r.studentId));

    res.json({
      totalBilled,
      totalCollected,
      totalOutstanding: totalBilled - totalCollected,
      collectionRate: totalBilled > 0 ? Math.round((totalCollected / totalBilled) * 100) : 0,
      debtorCount: uniqueDebtors.size,
      termBreakdown,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================================
// GET /api/analytics/summary — Combined overview stats
// ============================================================
router.get('/summary', requireAuth, requireRole('ADMIN'), async (req: AuthRequest, res) => {
  try {
    const [totalStudents, totalTeachers, totalParents, totalAssignments] = await Promise.all([
      prisma.user.count({ where: { role: 'STUDENT' } }),
      prisma.user.count({ where: { role: 'TEACHER' } }),
      prisma.user.count({ where: { role: 'PARENT' } }),
      prisma.assignment.count(),
    ]);

    const attendanceRecords = await prisma.attendanceRecord.findMany();
    const totalAttendance = attendanceRecords.length;
    const presentCount = attendanceRecords.filter((r) => r.status === 'PRESENT').length;
    const overallAttendanceRate = totalAttendance > 0 ? Math.round((presentCount / totalAttendance) * 100) : 0;

    const feeRecords = await prisma.feeRecord.findMany();
    let totalBilled = 0;
    let totalCollected = 0;
    for (const r of feeRecords) {
      totalBilled += r.totalBilled;
      totalCollected += r.amountPaid;
    }

    res.json({
      totalStudents,
      totalTeachers,
      totalParents,
      totalAssignments,
      overallAttendanceRate,
      totalBilled,
      totalCollected,
      collectionRate: totalBilled > 0 ? Math.round((totalCollected / totalBilled) * 100) : 0,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
