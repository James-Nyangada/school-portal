import { prisma } from '../lib/prisma';
import { MIN_MONTHLY_MARKS, MONTHLY_THRESHOLD, STREAK_LENGTH } from './attendanceAlerts';
import { getSettings } from './grading';
import { getSchoolProfile, Term } from './school';

/**
 * School analytics (dashboard spec §2.6). Everything is computed from the live Grade, AttendanceRecord and
 * FeeRecord tables, and every headline figure is shown against the previous term.
 */

const round1 = (n: number) => Math.round(n * 10) / 10;
const avgOf = (sum: number, n: number) => (n > 0 ? round1(sum / n) : null);
const change = (current: number | null, previous: number | null) =>
  current !== null && previous !== null ? round1(current - previous) : null;

/** Terms in calendar order (School Settings), followed by any other term names found in grades or bills. */
export async function orderedTerms() {
  const [profile, settings, gradeTerms, feeTerms] = await Promise.all([
    getSchoolProfile(),
    getSettings(),
    prisma.grade.findMany({ distinct: ['term'], select: { term: true } }),
    prisma.feeRecord.findMany({ distinct: ['term'], select: { term: true }, orderBy: { createdAt: 'asc' } })
  ]);
  const calendar = (profile.terms as Term[] | null) ?? [];
  const names = [...calendar.map((t) => t.name)];
  for (const t of [...feeTerms.map((r) => r.term), ...gradeTerms.map((g) => g.term).sort(), settings.currentTerm]) {
    if (!names.includes(t)) names.push(t);
  }
  return { terms: names, calendar, currentTerm: settings.currentTerm };
}

export async function termContext(term?: string) {
  const ctx = await orderedTerms();
  const active = term && ctx.terms.includes(term) ? term : ctx.currentTerm;
  const i = ctx.terms.indexOf(active);
  return { ...ctx, term: active, previousTerm: i > 0 ? ctx.terms[i - 1]! : null };
}

/** Published numeric totals (CBC competency levels have no average) by subject and by the student's current class. */
async function gradeAverages(term: string | null) {
  if (!term) return { overall: null as number | null, bySubject: new Map<string, { name: string; avg: number | null; n: number }>(), byClass: new Map<string, { name: string; avg: number | null; n: number }>() };

  const grades = await prisma.grade.findMany({
    where: { term, deletedAt: null, status: { in: ['PUBLISHED', 'PENDING_APPROVAL'] }, total: { not: null } },
    select: { total: true, subject: { select: { id: true, name: true } }, student: { select: { class: { select: { id: true, name: true } } } } }
  });

  const bucket = <K>(map: Map<K, { name: string; sum: number; n: number }>, key: K, name: string, v: number) => {
    const b = map.get(key) ?? { name, sum: 0, n: 0 };
    b.sum += v;
    b.n++;
    map.set(key, b);
  };
  const subjects = new Map<string, { name: string; sum: number; n: number }>();
  const classes = new Map<string, { name: string; sum: number; n: number }>();
  let sum = 0;
  for (const g of grades) {
    sum += g.total!;
    bucket(subjects, g.subject.id, g.subject.name, g.total!);
    if (g.student.class) bucket(classes, g.student.class.id, g.student.class.name, g.total!);
  }
  const finish = (m: Map<string, { name: string; sum: number; n: number }>) =>
    new Map([...m].map(([k, v]) => [k, { name: v.name, avg: avgOf(v.sum, v.n), n: v.n }]));

  return { overall: avgOf(sum, grades.length), bySubject: finish(subjects), byClass: finish(classes) };
}

/** Present or late as a % of lesson marks between a term's opening and closing dates; null without dates or marks. */
async function attendanceRate(calendar: Term[], term: string | null) {
  const t = term ? calendar.find((c) => c.name === term) : null;
  if (!t?.startDate || !t.endDate) return null;
  const groups = await prisma.attendanceRecord.groupBy({
    by: ['status'],
    where: { date: { gte: new Date(`${t.startDate}T00:00:00Z`), lte: new Date(`${t.endDate}T00:00:00Z`) } },
    _count: true
  });
  const total = groups.reduce((a, g) => a + g._count, 0);
  const attended = groups.filter((g) => g.status !== 'ABSENT').reduce((a, g) => a + g._count, 0);
  return total > 0 ? round1((attended / total) * 100) : null;
}

async function feeCollection(term: string | null) {
  if (!term) return { billed: 0, collected: 0, rate: null as number | null };
  const agg = await prisma.feeRecord.aggregate({ where: { term }, _sum: { totalBilled: true, amountPaid: true } });
  const billed = agg._sum.totalBilled ?? 0;
  const collected = agg._sum.amountPaid ?? 0;
  return { billed, collected, rate: billed > 0 ? round1((collected / billed) * 100) : null };
}

const compareMaps = (cur: Map<string, { name: string; avg: number | null; n: number }>, prev: Map<string, { name: string; avg: number | null; n: number }>) =>
  [...cur]
    .map(([id, c]) => {
      const previous = prev.get(id)?.avg ?? null;
      return { id, name: c.name, average: c.avg, previousAverage: previous, change: change(c.avg, previous), graded: c.n };
    })
    .sort((a, b) => (b.average ?? 0) - (a.average ?? 0));

/** Subject and class averages for a term, each with the previous term's figure and the change. */
export async function performance(term?: string) {
  const ctx = await termContext(term);
  const [cur, prev] = await Promise.all([gradeAverages(ctx.term), gradeAverages(ctx.previousTerm)]);
  return {
    term: ctx.term,
    previousTerm: ctx.previousTerm,
    terms: ctx.terms,
    overall: { average: cur.overall, previousAverage: prev.overall, change: change(cur.overall, prev.overall) },
    subjects: compareMaps(cur.bySubject, prev.bySubject),
    classes: compareMaps(cur.byClass, prev.byClass)
  };
}

/** Headline figures for a term against the previous one. */
export async function comparison(term?: string) {
  const ctx = await termContext(term);
  const [curGrades, prevGrades, curAtt, prevAtt, curFees, prevFees] = await Promise.all([
    gradeAverages(ctx.term),
    gradeAverages(ctx.previousTerm),
    attendanceRate(ctx.calendar, ctx.term),
    attendanceRate(ctx.calendar, ctx.previousTerm),
    feeCollection(ctx.term),
    feeCollection(ctx.previousTerm)
  ]);
  const metric = (current: number | null, previous: number | null) => ({ current, previous, change: change(current, previous) });

  return {
    term: ctx.term,
    previousTerm: ctx.previousTerm,
    terms: ctx.terms,
    averageScore: metric(curGrades.overall, prevGrades.overall),
    attendanceRate: metric(curAtt, prevAtt),
    collectionRate: metric(curFees.rate, prevFees.rate),
    fees: { current: curFees, previous: prevFees }
  };
}

export type Absentee = {
  studentId: string;
  name: string;
  admissionNumber: string | null;
  className: string | null;
  marks: number;
  absences: number;
  rate: number;
  longestStreak: number;
  currentStreak: number;
  reasons: string[];
  parentPhones: string[];
};

/**
 * Chronic absentees for a calendar month (YYYY-MM, default this month): attendance under MONTHLY_THRESHOLD%
 * (once there are enough marks to judge) or STREAK_LENGTH+ lessons missed in a row.
 */
export async function chronicAbsentees(month?: string): Promise<{ month: string; threshold: number; streak: number; students: Absentee[] }> {
  const now = new Date();
  const key = month && /^\d{4}-\d{2}$/.test(month) ? month : now.toISOString().slice(0, 7);
  const start = new Date(`${key}-01T00:00:00Z`);
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));

  const records = await prisma.attendanceRecord.findMany({
    where: { date: { gte: start, lt: end } },
    orderBy: [{ date: 'asc' }, { updatedAt: 'asc' }],
    select: { studentId: true, status: true }
  });

  const stats = new Map<string, { marks: number; absences: number; run: number; longest: number }>();
  for (const r of records) {
    const s = stats.get(r.studentId) ?? { marks: 0, absences: 0, run: 0, longest: 0 };
    s.marks++;
    if (r.status === 'ABSENT') {
      s.absences++;
      s.run++;
      s.longest = Math.max(s.longest, s.run);
    } else s.run = 0;
    stats.set(r.studentId, s);
  }

  const flagged = [...stats].filter(([, s]) => {
    const rate = ((s.marks - s.absences) / s.marks) * 100;
    return (s.marks >= MIN_MONTHLY_MARKS && rate < MONTHLY_THRESHOLD) || s.longest >= STREAK_LENGTH;
  });
  const students = flagged.length
    ? await prisma.user.findMany({
        where: { id: { in: flagged.map(([id]) => id) } },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          admissionNumber: true,
          class: { select: { name: true } },
          childLinks: { select: { parent: { select: { phone: true } } } }
        }
      })
    : [];
  const byId = new Map(students.map((s) => [s.id, s]));

  return {
    month: key,
    threshold: MONTHLY_THRESHOLD,
    streak: STREAK_LENGTH,
    students: flagged
      .map(([id, s]) => {
        const u = byId.get(id);
        const rate = round1(((s.marks - s.absences) / s.marks) * 100);
        const reasons = [];
        if (s.marks >= MIN_MONTHLY_MARKS && rate < MONTHLY_THRESHOLD) reasons.push(`${rate}% attendance`);
        if (s.longest >= STREAK_LENGTH) reasons.push(`${s.longest} lessons missed in a row`);
        return {
          studentId: id,
          name: u ? [u.firstName, u.lastName].filter(Boolean).join(' ') || 'Unnamed student' : 'Unknown student',
          admissionNumber: u?.admissionNumber ?? null,
          className: u?.class?.name ?? null,
          marks: s.marks,
          absences: s.absences,
          rate,
          longestStreak: s.longest,
          currentStreak: s.run,
          reasons,
          parentPhones: (u?.childLinks ?? []).map((l) => l.parent.phone).filter((p): p is string => !!p)
        };
      })
      .sort((a, b) => a.rate - b.rate)
  };
}
