import { describe, expect, it } from 'vitest';
import { allocatePayments, computeAccess, feeStatus, statementTerms } from '../fees';

const bills = (...amounts: number[]) => amounts.map((totalBilled) => ({ totalBilled }));

describe('allocatePayments (oldest term first)', () => {
  it('clears arrears before the current term', () => {
    expect(allocatePayments(bills(10_000, 15_000), 12_000)).toEqual([10_000, 2_000]);
  });

  it('phased payments add up until the whole balance is gone', () => {
    let paid = 0;
    for (const instalment of [5_000, 5_000, 5_000, 10_000]) paid += instalment;
    expect(allocatePayments(bills(10_000, 15_000), paid)).toEqual([10_000, 15_000]);
  });

  it('keeps an overpayment as credit on the newest bill', () => {
    expect(allocatePayments(bills(10_000, 15_000), 27_500)).toEqual([10_000, 17_500]);
  });

  it('a raised bill pulls credit back from later terms', () => {
    // Term 1 revised from 10k to 12k after the parent paid 20k in total
    expect(allocatePayments(bills(12_000, 15_000), 20_000)).toEqual([12_000, 8_000]);
  });

  it('a lowered bill leaves the excess as credit', () => {
    expect(allocatePayments(bills(8_000), 10_000)).toEqual([10_000]);
  });

  it('handles nothing paid and no bills', () => {
    expect(allocatePayments(bills(10_000, 5_000), 0)).toEqual([0, 0]);
    expect(allocatePayments([], 5_000)).toEqual([]);
  });

  it('a payment made before any bill sits on a zero bill, then moves to the real bill', () => {
    // [payment placeholder billed 0] then structure published for the same term updates that record
    expect(allocatePayments(bills(0), 3_000)).toEqual([3_000]);
    expect(allocatePayments(bills(20_000), 3_000)).toEqual([3_000]);
  });
});

describe('statementTerms (carry forward)', () => {
  it('brings each term’s unpaid balance into the next', () => {
    const lines = statementTerms([
      { term: 'Term 1', totalBilled: 10_000, amountPaid: 6_000, feeStructureId: 'a', manualOverride: false },
      { term: 'Term 2', totalBilled: 12_000, amountPaid: 0, feeStructureId: 'b', manualOverride: false }
    ]);
    expect(lines.map((l) => [l.term, l.broughtForward, l.carriedForward])).toEqual([
      ['Term 1', 0, 4_000],
      ['Term 2', 4_000, 16_000]
    ]);
  });

  it('shows credit as a negative carry', () => {
    const [t1] = statementTerms([{ term: 'Term 1', totalBilled: 10_000, amountPaid: 11_000, feeStructureId: null, manualOverride: false }]);
    expect(t1!.carriedForward).toBe(-1_000);
  });
});

describe('computeAccess (fee lock)', () => {
  const base = { currentTerm: 'Term 2', threshold: 50, fullClearance: false, isLeaver: false };

  it('nothing billed → open', () => {
    expect(computeAccess({ ...base, records: [] }).allowed).toBe(true);
  });

  it('current term at the threshold with no arrears → open', () => {
    const a = computeAccess({ ...base, records: [{ term: 'Term 2', totalBilled: 20_000, amountPaid: 10_000 }] });
    expect(a.allowed).toBe(true);
    expect(a.amountNeeded).toBe(0);
  });

  it('current term below the threshold → locked, says how much is needed', () => {
    const a = computeAccess({ ...base, records: [{ term: 'Term 2', totalBilled: 20_000, amountPaid: 4_000 }] });
    expect(a.allowed).toBe(false);
    expect(a.amountNeeded).toBe(6_000);
  });

  it('arrears must be cleared in full on top of the threshold', () => {
    // Term 1 billed 10k, Term 2 billed 20k, paid 12k total → 10k covers arrears, only 2k on Term 2 (< 50%)
    const records = [
      { term: 'Term 1', totalBilled: 10_000, amountPaid: 10_000 },
      { term: 'Term 2', totalBilled: 20_000, amountPaid: 2_000 }
    ];
    const a = computeAccess({ ...base, records });
    expect(a.allowed).toBe(false);
    expect(a.amountNeeded).toBe(8_000);
    expect(a.arrears).toBe(0);
  });

  it('unpaid arrears lock even with no bill this term yet', () => {
    const a = computeAccess({ ...base, records: [{ term: 'Term 1', totalBilled: 10_000, amountPaid: 9_000 }] });
    expect(a.allowed).toBe(false);
    expect(a.arrears).toBe(1_000);
    expect(a.amountNeeded).toBe(1_000);
  });

  it('full clearance (certificates / leavers) needs every shilling', () => {
    const records = [{ term: 'Term 2', totalBilled: 20_000, amountPaid: 19_999 }];
    expect(computeAccess({ ...base, fullClearance: true, records }).allowed).toBe(false);
    expect(computeAccess({ ...base, fullClearance: true, records: [{ ...records[0]!, amountPaid: 20_000 }] }).allowed).toBe(true);
  });

  it('a threshold of 100% behaves as full clearance', () => {
    const a = computeAccess({ ...base, threshold: 100, records: [{ term: 'Term 2', totalBilled: 20_000, amountPaid: 15_000 }] });
    expect(a.allowed).toBe(false);
    expect(a.amountNeeded).toBe(5_000);
  });

  it('credit from overpaying counts', () => {
    const a = computeAccess({ ...base, records: [{ term: 'Term 2', totalBilled: 20_000, amountPaid: 25_000 }] });
    expect(a.allowed).toBe(true);
    expect(a.balance).toBe(0);
  });
});

describe('feeStatus', () => {
  it.each([
    [0, 0, 'NOT_BILLED'],
    [100, 0, 'UNPAID'],
    [100, 40, 'PARTIAL'],
    [100, 100, 'PAID'],
    [100, 120, 'PAID']
  ] as const)('billed %d paid %d → %s', (billed, paid, status) => {
    expect(feeStatus(billed, paid)).toBe(status);
  });
});
