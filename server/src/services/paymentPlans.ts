import { SchoolSettings } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { BILLABLE_STATUSES } from './fees';
import { getSettings } from './grading';
import { getSchoolProfile, Term } from './school';

/** Installment plans offered at admission. Milestone percentages are cumulative shares of the term's bill. */
export const paymentPlanSchema = z
  .array(
    z.object({
      code: z
        .string()
        .trim()
        .regex(/^[A-Z0-9_]{2,30}$/, 'Plan codes use capital letters, digits and underscores'),
      name: z.string().trim().min(1, 'Every plan needs a name').max(60),
      milestones: z
        .array(z.object({ week: z.number().int().min(1).max(20), percent: z.number().min(1).max(100) }))
        .min(1, 'Every plan needs at least one milestone')
        .max(6)
    })
  )
  .min(1, 'Keep at least one payment plan')
  .max(8)
  .superRefine((plans, ctx) => {
    if (new Set(plans.map((p) => p.code)).size !== plans.length)
      ctx.addIssue({ code: 'custom', message: 'Each plan code can only be used once' });
    if (!plans.some((p) => p.code === 'FULL'))
      ctx.addIssue({ code: 'custom', message: 'Keep the FULL plan: it is the default for students who did not choose one' });
    plans.forEach((p, i) => {
      const ordered = p.milestones.every(
        (m, j) => j === 0 || (m.week > p.milestones[j - 1]!.week && m.percent > p.milestones[j - 1]!.percent)
      );
      if (!ordered)
        ctx.addIssue({ code: 'custom', path: [i], message: `${p.name}: milestones must go up in both week and percentage` });
      if (p.milestones[p.milestones.length - 1]!.percent !== 100)
        ctx.addIssue({ code: 'custom', path: [i], message: `${p.name}: the last milestone must be 100%` });
    });
  });

export type PaymentPlan = z.infer<typeof paymentPlanSchema>[number];

export const FULL_PLAN: PaymentPlan = { code: 'FULL', name: 'Full term', milestones: [{ week: 2, percent: 100 }] };

export function plansOf(settings: Pick<SchoolSettings, 'paymentPlans'>): PaymentPlan[] {
  const parsed = paymentPlanSchema.safeParse(settings.paymentPlans);
  return parsed.success ? parsed.data : [FULL_PLAN];
}

export const planFor = (plans: PaymentPlan[], code: string | null | undefined) =>
  plans.find((p) => p.code === code) ?? plans.find((p) => p.code === 'FULL') ?? FULL_PLAN;

export type MilestoneStatus = {
  week: number;
  percent: number;
  /** YYYY-MM-DD; null when the term has no opening date set */
  dueDate: string | null;
  /** Cumulative KES that should be paid towards this term by dueDate */
  amountDue: number;
  met: boolean;
  overdue: boolean;
};

export type PlanSchedule = {
  plan: { code: string; name: string };
  milestones: MilestoneStatus[];
  /** KES that should have been paid by today under the plan */
  dueToDate: number;
  /** How far behind the schedule the student is today (0 when on track) */
  behindBy: number;
  next: MilestoneStatus | null;
};

const round2 = (n: number) => Math.round(n * 100) / 100;
const addDays = (iso: string, days: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
export const todayIso = () => new Date().toISOString().slice(0, 10);

/**
 * Where one term's bill stands against its installment plan. `paid` is what has been allocated to this term
 * (payments clear arrears first, so this is FeeRecord.amountPaid). Milestone n is due at the start of week n.
 */
export function planSchedule(input: { plan: PaymentPlan; billed: number; paid: number; termStart: string | null; today: string }): PlanSchedule {
  const { plan, billed, paid, termStart, today } = input;
  const milestones = plan.milestones.map((m) => {
    const dueDate = termStart ? addDays(termStart, (m.week - 1) * 7) : null;
    const amountDue = round2((billed * m.percent) / 100);
    const met = paid + 0.005 >= amountDue;
    return { week: m.week, percent: m.percent, dueDate, amountDue, met, overdue: !met && !!dueDate && dueDate <= today };
  });
  const dueToDate = milestones.filter((m) => m.dueDate && m.dueDate <= today).reduce((a, m) => Math.max(a, m.amountDue), 0);

  return {
    plan: { code: plan.code, name: plan.name },
    milestones,
    dueToDate,
    behindBy: Math.max(0, round2(dueToDate - paid)),
    next: milestones.find((m) => !m.met) ?? null
  };
}

/** Opening date of a term from the academic calendar (School Settings), if set. */
export async function termStartOf(term: string): Promise<string | null> {
  const terms = ((await getSchoolProfile()).terms as Term[] | null) ?? [];
  return terms.find((t) => t.name === term)?.startDate || null;
}

export type StudentPlanRow = PlanSchedule & {
  studentId: string;
  studentName: string;
  admissionNumber: string | null;
  className: string | null;
  term: string;
  billed: number;
  paid: number;
};

/** Every billed student's position against their installment plan for a term (finance's milestone tracker). */
export async function paymentPlansOverview(term?: string) {
  const settings = await getSettings();
  const activeTerm = term || settings.currentTerm;
  const [plans, termStart, records] = await Promise.all([
    Promise.resolve(plansOf(settings)),
    termStartOf(activeTerm),
    prisma.feeRecord.findMany({
      where: { term: activeTerm, totalBilled: { gt: 0 }, student: { status: { in: [...BILLABLE_STATUSES] } } },
      include: { student: { select: { id: true, firstName: true, lastName: true, admissionNumber: true, class: { select: { name: true } } } } }
    })
  ]);
  const today = todayIso();

  const rows: StudentPlanRow[] = records.map((r) => ({
    studentId: r.studentId,
    studentName: [r.student.firstName, r.student.lastName].filter(Boolean).join(' ') || 'Unnamed student',
    admissionNumber: r.student.admissionNumber,
    className: r.student.class?.name ?? null,
    term: activeTerm,
    billed: r.totalBilled,
    paid: r.amountPaid,
    ...planSchedule({ plan: planFor(plans, r.paymentPlan), billed: r.totalBilled, paid: r.amountPaid, termStart, today })
  }));
  rows.sort((a, b) => b.behindBy - a.behindBy || a.studentName.localeCompare(b.studentName));

  return {
    term: activeTerm,
    termStart,
    plans,
    onInstallments: rows.filter((r) => r.plan.code !== 'FULL').length,
    behindSchedule: rows.filter((r) => r.behindBy > 0).length,
    amountBehind: round2(rows.reduce((a, r) => a + r.behindBy, 0)),
    rows
  };
}
