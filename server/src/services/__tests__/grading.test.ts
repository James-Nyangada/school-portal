import { describe as suite, expect, it } from 'vitest';
import type { SchoolSettings } from '@prisma/client';
import { aggregateLevel, applyData, computeNumeric, describe, letterFor, boundariesOf } from '../grading';

const settings = {
  id: 1,
  gradingMode: 'NUMERIC',
  currentTerm: 'Term 1',
  catCount: 2,
  catMaxScore: 30,
  examMaxScore: 100,
  catWeight: 30,
  examWeight: 70,
  gradeBoundaries: [
    { grade: 'E', min: 0 },
    { grade: 'A', min: 80 },
    { grade: 'B', min: 65 },
    { grade: 'C', min: 50 }
  ],
  approvalSlaHours: 48,
  feeGateThreshold: 50,
  mpesaEnabled: true,
  smsEnabled: true,
  newsletterEnabled: true,
  assignmentsEnabled: true,
  paymentPlans: [],
  updatedAt: new Date()
} as SchoolSettings;

suite('computeNumeric', () => {
  it('weights the CAT average and the exam', () => {
    // CATs avg 24/30 = 80% × 30 + exam 70% × 70 = 24 + 49 = 73
    expect(computeNumeric(settings, [24, 24], 70)).toEqual({ total: 73, letterGrade: 'B', value: '73' });
  });

  it('uses the CAT percentage alone before the exam is entered', () => {
    expect(computeNumeric(settings, [15, 21], null).total).toBe(60);
  });

  it('uses the exam alone when there are no CATs', () => {
    expect(computeNumeric(settings, [], 85)).toMatchObject({ total: 85, letterGrade: 'A' });
  });

  it('is empty with no components', () => {
    expect(computeNumeric(settings, [], null)).toEqual({ total: null, letterGrade: null, value: '' });
  });
});

suite('letterFor', () => {
  it('picks the highest boundary reached, whatever order they are stored in', () => {
    const b = boundariesOf(settings);
    expect(letterFor(b, 80)).toBe('A');
    expect(letterFor(b, 79.9)).toBe('B');
    expect(letterFor(b, 0)).toBe('E');
  });
});

suite('applyData', () => {
  const base = { mode: 'NUMERIC' as const, catScores: [20], examScore: null, competencyLevel: null };

  it('merges a partial change and recomputes the total', () => {
    expect(applyData(settings, base, { examScore: 50 })).toMatchObject({ catScores: [20], examScore: 50, total: 55, letterGrade: 'C' });
  });

  it('keeps a legacy value-only request as the total', () => {
    expect(applyData(settings, base, { value: '81' })).toMatchObject({ total: 81, letterGrade: 'A', value: '81' });
  });

  it('sets the CBC level as the display value', () => {
    expect(applyData(settings, { ...base, mode: 'CBC' }, { competencyLevel: 'ME' })).toMatchObject({ competencyLevel: 'ME', value: 'ME' });
  });
});

suite('describe', () => {
  it('summarises numeric components', () => {
    expect(describe('NUMERIC', { catScores: [24, 24], examScore: 70 }, settings)).toBe('CAT1 24 · CAT2 24 · Exam 70 · Total 73 (B)');
  });
});

suite('aggregateLevel', () => {
  it('prefers summative entries', () => {
    expect(
      aggregateLevel([
        { competencyLevel: 'BE', assessmentType: 'FORMATIVE' },
        { competencyLevel: 'EE', assessmentType: 'SUMMATIVE' },
        { competencyLevel: 'ME', assessmentType: 'SUMMATIVE' }
      ])
    ).toBe('EE'); // mean 3.5 rounds to 4
  });

  it('falls back to formative entries', () => {
    expect(aggregateLevel([{ competencyLevel: 'AE', assessmentType: 'FORMATIVE' }])).toBe('AE');
  });
});
