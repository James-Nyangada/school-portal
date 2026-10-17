import { Router } from 'express';
import { requireAuth, requireRole, AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { getSchoolProfile, Term } from '../services/school';
import { latestReconciliation } from '../services/mpesaReconciliation';
import { MAX_FAILED_ATTEMPTS } from './auth';
import { loadTeaching } from './attendance';

const router = Router();

// Attendance registers are keyed by calendar date, stored as UTC midnight (see routes/attendance.ts)
const todayUtc = () => new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`);
const isoDay = (d: Date) => d.toISOString().slice(0, 10);
/** Current wall-clock time in Kenya (UTC+3, no DST) as HH:MM, to compare with bell times. */
const nowEat = () => new Date(Date.now() + 3 * 3_600_000).toISOString().slice(11, 16);

const serverStartedAt = new Date(Date.now() - process.uptime() * 1000);

type Alert = { key: string; severity: 'error' | 'warning' | 'info'; title: string; message: string; count: number; href: string };
type CalendarEvent = { date: string; title: string; kind: 'TERM_START' | 'HALF_TERM_START' | 'HALF_TERM_END' | 'TERM_END' };

/** Term dates (the only school calendar data kept so far) falling in [from, from + days). */
function upcomingTermEvents(terms: Term[], from: string, days: number): CalendarEvent[] {
  const until = isoDay(new Date(Date.parse(`${from}T00:00:00Z`) + days * 86_400_000));
  const events: CalendarEvent[] = terms.flatMap((t) => [
    { date: t.startDate, title: `${t.name} opens`, kind: 'TERM_START' as const },
    ...(t.halfTermStart ? [{ date: t.halfTermStart, title: `${t.name} half-term break begins`, kind: 'HALF_TERM_START' as const }] : []),
    ...(t.halfTermEnd ? [{ date: t.halfTermEnd, title: `${t.name} half-term break ends`, kind: 'HALF_TERM_END' as const }] : []),
    { date: t.endDate, title: `${t.name} closes`, kind: 'TERM_END' as const }
  ]);
  return events.filter((e) => e.date && e.date >= from && e.date < until).sort((a, b) => a.date.localeCompare(b.date));
}

// GET /api/dashboard/stats — Admin and Super Admin overview. Always live; never cached.
router.get('/stats', requireAuth, requireRole('ADMIN', 'SUPER_ADMIN'), async (req: AuthRequest, res) => {
  try {
    const settings = await prisma.schoolSettings.findUnique({ where: { id: 1 } });
    const currentTerm = settings?.currentTerm ?? 'Term 1';
    const slaHours = settings?.approvalSlaHours ?? 48;

    const now = new Date();
    const today = todayUtc();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const slaCutoff = new Date(now.getTime() - slaHours * 3_600_000);
    const dayAgo = new Date(now.getTime() - 24 * 3_600_000);
    const weekAgo = new Date(now.getTime() - 7 * 24 * 3_600_000);

    const profile = await getSchoolProfile();
    const terms = (profile.terms as Term[] | null) ?? [];
    const termStart = terms.find((t) => t.name === currentTerm)?.startDate;

    const dbStarted = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    const dbLatencyMs = Date.now() - dbStarted;

    const [
      roleCounts,
      recentAuditLogs,
      activeStudents,
      newStudentsThisMonth,
      newStudentsThisTerm,
      attendanceToday,
      absentToday,
      termFees,
      collectedToday,
      pendingGradeRequests,
      overdueGradeRequests,
      gradesAwaitingApproval,
      failedLogins,
      lockedAccounts,
      unmatchedPaybill,
      reconciliation,
      absenceFlags
    ] = await Promise.all([
      prisma.user.groupBy({ by: ['role'], _count: true }),
      prisma.auditLog.findMany({
        take: 5,
        orderBy: { createdAt: 'desc' },
        include: { actor: { select: { firstName: true, lastName: true } } }
      }),
      prisma.user.count({ where: { role: 'STUDENT', status: 'ACTIVE' } }),
      prisma.user.count({ where: { role: 'STUDENT', createdAt: { gte: monthStart } } }),
      termStart ? prisma.user.count({ where: { role: 'STUDENT', createdAt: { gte: new Date(`${termStart}T00:00:00Z`) } } }) : null,
      prisma.attendanceRecord.groupBy({ by: ['status'], where: { date: today }, _count: true }),
      prisma.attendanceRecord.findMany({
        where: { date: today, status: 'ABSENT' },
        distinct: ['studentId'],
        select: { studentId: true }
      }),
      prisma.feeRecord.aggregate({ where: { term: currentTerm }, _sum: { totalBilled: true, amountPaid: true } }),
      prisma.feeTransaction.aggregate({ where: { createdAt: { gte: today } }, _sum: { amount: true } }),
      prisma.gradeChangeRequest.count({ where: { status: 'PENDING' } }),
      prisma.gradeChangeRequest.count({ where: { status: 'PENDING', createdAt: { lt: slaCutoff } } }),
      prisma.grade.count({ where: { status: 'PENDING_APPROVAL', deletedAt: null } }),
      prisma.auditLog.groupBy({
        by: ['actorId'],
        where: { action: { in: ['LOGIN_FAILED', 'ACCOUNT_LOCKED'] }, createdAt: { gte: dayAgo } },
        _count: true
      }),
      prisma.user.count({ where: { status: 'LOCKED', lockedUntil: { gt: now } } }),
      prisma.mpesaC2BPayment.count({ where: { status: 'UNMATCHED' } }),
      latestReconciliation(),
      prisma.auditLog.count({ where: { action: { in: ['ATTENDANCE_FLAG', 'ATTENDANCE_FLAG_MONTHLY'] }, createdAt: { gte: weekAgo } } })
    ]);

    const usersByRole = Object.fromEntries(roleCounts.map((g) => [g.role, g._count])) as Record<string, number>;
    const marks = Object.fromEntries(attendanceToday.map((g) => [g.status, g._count]));
    const marked = (marks.PRESENT ?? 0) + (marks.LATE ?? 0) + (marks.ABSENT ?? 0);
    const billed = termFees._sum.totalBilled ?? 0;
    const collected = termFees._sum.amountPaid ?? 0;

    // Alert banner (dashboard spec §1.1): reconciliation mismatches, failed-login spikes, approvals past the SLA
    const alerts: Alert[] = [];
    const reconMismatches = Array.isArray(reconciliation?.mismatches) ? reconciliation.mismatches.length : 0;
    const reviewItems = Math.max(reconMismatches, unmatchedPaybill);
    if (reviewItems > 0) {
      alerts.push({
        key: 'mpesa-reconciliation',
        severity: 'error',
        title: 'M-Pesa payments need review',
        message: reconciliation
          ? `The last reconciliation (${reconciliation.startedAt.toISOString().slice(0, 10)}) flagged ${reviewItems} payment(s) that don't match the fee records.`
          : `${unmatchedPaybill} Paybill payment(s) could not be matched to a student.`,
        count: reviewItems,
        href: '/finance/dashboard'
      });
    }
    const spikeAccounts = failedLogins.filter((g) => g._count >= MAX_FAILED_ATTEMPTS).length;
    if (spikeAccounts > 0 || lockedAccounts > 0) {
      alerts.push({
        key: 'failed-logins',
        severity: 'warning',
        title: 'Repeated failed sign-ins',
        message: `${spikeAccounts} account(s) had ${MAX_FAILED_ATTEMPTS}+ failed sign-ins in the last 24 hours; ${lockedAccounts} account(s) are locked right now.`,
        count: Math.max(spikeAccounts, lockedAccounts),
        href: '/superadmin/audit-logs?action=LOGIN_FAILED'
      });
    }
    if (overdueGradeRequests > 0) {
      alerts.push({
        key: 'grade-approvals-sla',
        severity: 'warning',
        title: 'Grade approvals overdue',
        message: `${overdueGradeRequests} grade change request(s) have waited more than ${slaHours} hours for a decision.`,
        count: overdueGradeRequests,
        href: '/admin/grade-approvals'
      });
    }
    if (absenceFlags > 0) {
      alerts.push({
        key: 'absence-flags',
        severity: 'info',
        title: 'Students flagged for absence',
        message: `${absenceFlags} absence flag(s) this week (3 lessons missed in a row, or under 75% this month). Parents have been notified.`,
        count: absenceFlags,
        href: '/admin/analytics#absentees'
      });
    }

    res.json({
      totalUsers: Object.values(usersByRole).reduce((a, n) => a + n, 0),
      usersByRole: {
        SUPER_ADMIN: usersByRole.SUPER_ADMIN ?? 0,
        ADMIN: usersByRole.ADMIN ?? 0,
        STUDENT: usersByRole.STUDENT ?? 0,
        TEACHER: usersByRole.TEACHER ?? 0,
        FINANCE: usersByRole.FINANCE ?? 0,
        PARENT: usersByRole.PARENT ?? 0
      },
      recentAuditLogs,
      students: { active: activeStudents, newThisMonth: newStudentsThisMonth, newThisTerm: newStudentsThisTerm },
      attendanceToday: {
        marked,
        // Present or late, as a share of all lesson marks taken today; null before any register is marked
        rate: marked > 0 ? Math.round((((marks.PRESENT ?? 0) + (marks.LATE ?? 0)) / marked) * 100) : null,
        absentStudents: absentToday.length
      },
      fees: {
        term: currentTerm,
        // The term's target is everything billed for it
        billed,
        collected,
        outstanding: Math.max(0, billed - collected),
        collectionRate: billed > 0 ? Math.round((collected / billed) * 100) : 0,
        collectedToday: collectedToday._sum.amount ?? 0
      },
      approvals: {
        pending: pendingGradeRequests + gradesAwaitingApproval,
        overdue: overdueGradeRequests,
        slaHours
      },
      system: {
        apiStartedAt: serverStartedAt,
        apiUptimeSeconds: Math.round(process.uptime()),
        databaseLatencyMs: dbLatencyMs,
        // Database backups are taken by the hosting provider (Supabase), which doesn't report them to the app
        lastBackupAt: null,
        lastReconciliationAt: reconciliation?.finishedAt ?? null
      },
      alerts,
      upcomingEvents: upcomingTermEvents(terms, isoDay(today), 7)
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/dashboard/teacher — the signed-in teacher's day (dashboard spec §3.1)
router.get('/teacher', requireAuth, requireRole('TEACHER'), async (req: AuthRequest, res) => {
  try {
    const teacherId = req.user!.id;
    const today = todayUtc();
    const todayPos = (today.getUTCDay() + 6) % 7;
    const clock = nowEat();
    const settings = await prisma.schoolSettings.findUnique({ where: { id: 1 } });
    const currentTerm = settings?.currentTerm ?? 'Term 1';

    const teaching = await loadTeaching(teacherId);
    const todaySessions = teaching
      ? [...teaching.groups.values()].flatMap((g) =>
          g.sessions
            .filter((s) => s.dayPos === todayPos)
            .map((s) => ({ lessonId: g.lesson.lessonId, subject: g.lesson.subjectName, classes: g.lesson.classes, ...s }))
        )
      : [];
    todaySessions.sort((a, b) => a.startTime.localeCompare(b.startTime));

    // Only lessons that have already finished count as "not yet marked"
    const finished = todaySessions.filter((s) => s.endTime && s.endTime <= clock);
    const marked = finished.length
      ? await prisma.attendanceRecord.groupBy({
          by: ['lessonId', 'entryId'],
          where: { date: today, lessonId: { in: finished.map((s) => s.lessonId) } },
          _count: true
        })
      : [];
    const unmarked = finished.filter((s) => !marked.some((m) => m.lessonId === s.lessonId && m.entryId === s.entryId));

    const [ungraded, pairs] = await Promise.all([
      prisma.assignmentSubmission.count({ where: { status: 'PENDING', assignment: { teacherId } } }),
      prisma.teacherSubjectClass.findMany({ where: { teacherId }, select: { subjectId: true, classId: true, class: { select: { name: true } } } })
    ]);

    // Average of published numeric totals this term in the classes and subjects this teacher is assigned
    const grades = await prisma.grade.findMany({
      where: {
        term: currentTerm,
        deletedAt: null,
        status: { in: ['PUBLISHED', 'PENDING_APPROVAL'] },
        total: { not: null },
        ...(pairs.length
          ? { OR: pairs.map((p) => ({ subjectId: p.subjectId, student: { classId: p.classId } })) }
          : { enteredById: teacherId })
      },
      select: { total: true, student: { select: { classId: true } } }
    });
    const byClass = new Map<string, { sum: number; n: number }>();
    for (const g of grades) {
      const key = g.student.classId ?? '';
      const c = byClass.get(key) ?? { sum: 0, n: 0 };
      c.sum += g.total!;
      c.n++;
      byClass.set(key, c);
    }
    const className = new Map(pairs.map((p) => [p.classId, p.class.name]));
    const avg = (sum: number, n: number) => (n > 0 ? Math.round((sum / n) * 10) / 10 : null);

    res.json({
      term: currentTerm,
      date: isoDay(today),
      lessonsToday: todaySessions.length,
      lessons: todaySessions.map((s) => ({
        lessonId: s.lessonId,
        entryId: s.entryId,
        subject: s.subject,
        classes: s.classes,
        startTime: s.startTime,
        endTime: s.endTime,
        room: s.room,
        finished: !!s.endTime && s.endTime <= clock,
        marked: !unmarked.some((u) => u.lessonId === s.lessonId && u.entryId === s.entryId)
      })),
      unmarkedAttendance: unmarked.length,
      ungradedSubmissions: ungraded,
      averageScore: avg(
        grades.reduce((a, g) => a + g.total!, 0),
        grades.length
      ),
      classAverages: [...byClass.entries()]
        .map(([classId, c]) => ({ classId, className: className.get(classId) ?? 'Other', average: avg(c.sum, c.n), graded: c.n }))
        .sort((a, b) => a.className.localeCompare(b.className))
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
