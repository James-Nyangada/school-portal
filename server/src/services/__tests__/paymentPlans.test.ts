import { describe, expect, it } from 'vitest';
import { FULL_PLAN, paymentPlanSchema, planFor, planSchedule, plansOf } from '../paymentPlans';
import { clearanceOutcome } from '../clearance';

const threeWay = {
  code: 'INSTALLMENTS_3',
  name: 'Three installments',
  milestones: [
    { week: 2, percent: 30 },
    { week: 6, percent: 65 },
    { week: 10, percent: 100 }
  ]
};

describe('planSchedule', () => {
  it('dates milestone n at the start of week n of the term', () => {
    const s = planSchedule({ plan: threeWay, billed: 30_000, paid: 0, termStart: '2026-01-05', today: '2026-01-05' });
    expect(s.milestones.map((m) => m.dueDate)).toEqual(['2026-01-12', '2026-02-09', '2026-03-09']);
    expect(s.milestones.map((m) => m.amountDue)).toEqual([9_000, 19_500, 30_000]);
  });

  it('is on track before the first milestone is due', () => {
    const s = planSchedule({ plan: threeWay, billed: 30_000, paid: 0, termStart: '2026-01-05', today: '2026-01-10' });
    expect(s.dueToDate).toBe(0);
    expect(s.behindBy).toBe(0);
    expect(s.milestones.some((m) => m.overdue)).toBe(false);
  });

  it('reports how far behind the schedule a student is once a milestone passes', () => {
    const s = planSchedule({ plan: threeWay, billed: 30_000, paid: 12_000, termStart: '2026-01-05', today: '2026-02-10' });
    expect(s.dueToDate).toBe(19_500);
    expect(s.behindBy).toBe(7_500);
    expect(s.milestones.map((m) => [m.met, m.overdue])).toEqual([
      [true, false],
      [false, true],
      [false, false]
    ]);
    expect(s.next?.percent).toBe(65);
  });

  it('has no dates or overdue milestones when the term has no opening date', () => {
    const s = planSchedule({ plan: threeWay, billed: 30_000, paid: 0, termStart: null, today: '2026-06-01' });
    expect(s.milestones.every((m) => m.dueDate === null && !m.overdue)).toBe(true);
    expect(s.behindBy).toBe(0);
  });

  it('a fully paid bill meets every milestone', () => {
    const s = planSchedule({ plan: threeWay, billed: 30_000, paid: 30_000, termStart: '2026-01-05', today: '2026-04-01' });
    expect(s.next).toBeNull();
    expect(s.behindBy).toBe(0);
  });
});

describe('payment plan templates', () => {
  it('accepts the default templates', () => {
    expect(paymentPlanSchema.safeParse([FULL_PLAN, threeWay]).success).toBe(true);
  });

  it('rejects milestones that do not end at 100%', () => {
    const bad = { ...threeWay, milestones: [{ week: 2, percent: 50 }] };
    expect(paymentPlanSchema.safeParse([FULL_PLAN, bad]).success).toBe(false);
  });

  it('rejects milestones that go backwards', () => {
    const bad = { ...threeWay, milestones: [{ week: 6, percent: 50 }, { week: 4, percent: 100 }] };
    expect(paymentPlanSchema.safeParse([FULL_PLAN, bad]).success).toBe(false);
  });

  it('requires the FULL plan', () => {
    expect(paymentPlanSchema.safeParse([threeWay]).success).toBe(false);
  });

  it('falls back to the full plan for unknown codes or broken settings', () => {
    expect(planFor([FULL_PLAN, threeWay], 'NOPE').code).toBe('FULL');
    expect(plansOf({ paymentPlans: 'garbage' })).toEqual([FULL_PLAN]);
  });
});

describe('clearanceOutcome (§3.7)', () => {
  it('clears a student with no balance and no holds', () => {
    expect(clearanceOutcome({ balance: 0, libraryHold: false, disciplinaryHold: false })).toEqual({ cleared: true, blockers: [] });
  });

  it('lists every reason clearance is blocked', () => {
    const r = clearanceOutcome({ balance: 1_500, libraryHold: true, disciplinaryHold: true });
    expect(r.cleared).toBe(false);
    expect(r.blockers).toHaveLength(3);
    expect(r.blockers[0]).toContain('1,500');
  });
});
