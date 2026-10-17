import { prisma } from '../lib/prisma';
import { sendSms, smsSummary } from './sms';

/** Absence patterns that flag a student to the office and alert their parents (school-dashboard-spec §3.4). */
export const STREAK_LENGTH = 3;
export const MONTHLY_THRESHOLD = 75;
/** Don't judge a month on its first couple of registers */
export const MIN_MONTHLY_MARKS = 10;

const schoolName = () => process.env.SCHOOL_NAME?.trim() || 'School';
const fullName = (u: { firstName: string | null; lastName: string | null }) => [u.firstName, u.lastName].filter(Boolean).join(' ') || 'Your child';

/** Present or late, as a % of the student's lesson marks this calendar month. */
export async function monthlyAttendance(studentId: string, now = new Date()) {
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const groups = await prisma.attendanceRecord.groupBy({
    by: ['status'],
    where: { studentId, date: { gte: monthStart } },
    _count: true
  });
  const marks = groups.reduce((a, g) => a + g._count, 0);
  const attended = groups.filter((g) => g.status !== 'ABSENT').reduce((a, g) => a + g._count, 0);
  return { marks, rate: marks > 0 ? Math.round((attended / marks) * 100) : null, monthStart };
}

async function hasStreak(studentId: string) {
  const recent = await prisma.attendanceRecord.findMany({
    where: { studentId },
    orderBy: [{ date: 'desc' }, { updatedAt: 'desc' }],
    take: STREAK_LENGTH,
    select: { status: true }
  });
  return recent.length === STREAK_LENGTH && recent.every((r) => r.status === 'ABSENT');
}

async function alertParents(studentId: string, message: string, title: string) {
  const links = await prisma.studentParent.findMany({
    where: { studentId },
    select: { parent: { select: { id: true, phone: true } } }
  });
  if (links.length > 0) {
    await prisma.notification.createMany({
      data: links.map((l) => ({ userId: l.parent.id, type: 'ATTENDANCE_ALERT', title, message, link: '/parent/attendance' }))
    });
  }
  return smsSummary(await sendSms(links.map((l) => l.parent.phone), `${schoolName()}: ${message}`));
}

/**
 * Run after a register is saved, for the students it newly marked absent. Flags (audit log + parent
 * notification + SMS) anyone who has now missed STREAK_LENGTH lessons in a row, and anyone whose
 * attendance this month has dropped below MONTHLY_THRESHOLD% (at most once per student per month).
 * Returns the ids of students flagged for a streak.
 */
export async function raiseAbsenceAlerts(studentIds: string[], actorId: string): Promise<string[]> {
  const flagged: string[] = [];

  for (const studentId of [...new Set(studentIds)]) {
    const student = await prisma.user.findUnique({ where: { id: studentId }, select: { firstName: true, lastName: true } });
    if (!student) continue;
    const name = fullName(student);

    if (await hasStreak(studentId)) {
      flagged.push(studentId);
      const outcome = await alertParents(
        studentId,
        `${name} has been marked absent for ${STREAK_LENGTH} lessons in a row. Please contact the school if there is a reason we should know about.`,
        'Repeated absence'
      );
      await prisma.auditLog.create({
        data: { actorId, action: 'ATTENDANCE_FLAG', targetId: studentId, details: `Flagged for ${STREAK_LENGTH} consecutive absences · ${outcome}` }
      });
    }

    const month = await monthlyAttendance(studentId);
    if (month.rate !== null && month.marks >= MIN_MONTHLY_MARKS && month.rate < MONTHLY_THRESHOLD) {
      const already = await prisma.auditLog.count({
        where: { action: 'ATTENDANCE_FLAG_MONTHLY', targetId: studentId, createdAt: { gte: month.monthStart } }
      });
      if (already === 0) {
        const outcome = await alertParents(
          studentId,
          `${name}'s attendance this month is ${month.rate}%, below the school's ${MONTHLY_THRESHOLD}% minimum. Please contact the school.`,
          'Low attendance this month'
        );
        await prisma.auditLog.create({
          data: {
            actorId,
            action: 'ATTENDANCE_FLAG_MONTHLY',
            targetId: studentId,
            details: `Monthly attendance ${month.rate}% (${month.marks} lesson marks) · ${outcome}`
          }
        });
      }
    }
  }

  return flagged;
}
