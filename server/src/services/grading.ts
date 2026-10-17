import { CompetencyLevel, Grade, GradingMode, Prisma, PrismaClient, SchoolSettings } from '@prisma/client';
import { prisma } from '../lib/prisma';

type Db = PrismaClient | Prisma.TransactionClient;

export type Boundary = { grade: string; min: number };

export const LEVELS: CompetencyLevel[] = ['EE', 'ME', 'AE', 'BE'];
export const LEVEL_POINTS: Record<CompetencyLevel, number> = { EE: 4, ME: 3, AE: 2, BE: 1 };

/** The single settings row, created with defaults on first use. */
export async function getSettings(db: Db = prisma): Promise<SchoolSettings> {
  return (await db.schoolSettings.findUnique({ where: { id: 1 } })) ?? db.schoolSettings.create({ data: { id: 1 } });
}

export const boundariesOf = (s: SchoolSettings): Boundary[] =>
  [...((s.gradeBoundaries as Boundary[] | null) ?? [])].sort((a, b) => b.min - a.min);

export const letterFor = (boundaries: Boundary[], total: number) => boundaries.find((b) => total >= b.min)?.grade ?? null;

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Weighted percentage of the components entered so far: CAT average (as % of catMaxScore) weighted by catWeight,
 * exam (as % of examMaxScore) weighted by examWeight. A missing component drops out and the remaining weight is
 * rescaled, so mid-term (CATs only) the total is the CAT percentage, and the full weighting applies once the exam is in.
 */
export function computeNumeric(s: SchoolSettings, catScores: number[], examScore: number | null) {
  const parts: { pct: number; weight: number }[] = [];

  if (catScores.length > 0) {
    const avg = catScores.reduce((a, b) => a + b, 0) / catScores.length;
    parts.push({ pct: (avg / s.catMaxScore) * 100, weight: s.catWeight });
  }

  if (examScore !== null) parts.push({ pct: (examScore / s.examMaxScore) * 100, weight: s.examWeight });

  const weight = parts.reduce((a, p) => a + p.weight, 0);

  if (parts.length === 0 || weight === 0) return { total: null, letterGrade: null, value: '' };

  const total = round1(parts.reduce((a, p) => a + p.pct * p.weight, 0) / weight);

  return { total, letterGrade: letterFor(boundariesOf(s), total), value: String(total) };
}

/** The editable fields of a grade — what a change request snapshots and proposes. */
export type GradeData = {
  catScores?: number[];
  examScore?: number | null;
  competencyLevel?: CompetencyLevel | null | undefined;
  teacherComment?: string | null;
  /** Rows from before the numeric/CBC split only had a free-text value */
  value?: string | null;
};

export const snapshot = (g: Grade): GradeData =>
  g.mode === 'CBC'
    ? { competencyLevel: g.competencyLevel, teacherComment: g.teacherComment }
    : { catScores: g.catScores, examScore: g.examScore, teacherComment: g.teacherComment };

/** Fields to write for `data` applied on top of `g`, with the derived total / letter / display value recomputed. */
export function applyData(s: SchoolSettings, g: Pick<Grade, 'mode' | 'catScores' | 'examScore' | 'competencyLevel'>, data: GradeData) {
  const teacherComment = data.teacherComment === undefined ? {} : { teacherComment: data.teacherComment };

  if (g.mode === 'CBC') {
    const level = data.competencyLevel !== undefined ? data.competencyLevel : g.competencyLevel;
    const legacy = level ? {} : data.value ? { value: data.value } : {};

    return { competencyLevel: level, value: level ?? '', ...legacy, ...teacherComment };
  }

  // Legacy request carrying only a value: keep it as the total
  if (data.catScores === undefined && data.examScore === undefined && data.value != null) {
    const total = Number(data.value);

    return Number.isFinite(total)
      ? { total, letterGrade: letterFor(boundariesOf(s), total), value: data.value, ...teacherComment }
      : { value: data.value, ...teacherComment };
  }

  const catScores = data.catScores ?? g.catScores;
  const examScore = data.examScore !== undefined ? data.examScore : g.examScore;

  return { catScores, examScore, ...computeNumeric(s, catScores, examScore), ...teacherComment };
}

/** Short human-readable form of a grade's values, used in audit rows and the approval queue. */
export function describe(mode: GradingMode, d: GradeData, s: SchoolSettings): string {
  if (mode === 'CBC') return d.competencyLevel ?? d.value ?? '—';

  if (d.catScores === undefined && d.examScore === undefined) return d.value ?? '—';

  const cats = (d.catScores ?? []).map((c, i) => `CAT${i + 1} ${c}`);
  const exam = d.examScore != null ? [`Exam ${d.examScore}`] : [];
  const { total, letterGrade } = computeNumeric(s, d.catScores ?? [], d.examScore ?? null);

  return [...cats, ...exam, total !== null ? `Total ${total}${letterGrade ? ` (${letterGrade})` : ''}` : ''].filter(Boolean).join(' · ') || '—';
}

/** The class's own grading mode, or the school default. */
export const modeFor = (s: SchoolSettings, cls: { gradingMode: GradingMode | null } | null) => cls?.gradingMode ?? s.gradingMode;

/** Rounded mean competency level of a set of CBC entries (summative entries only, when there are any). */
export function aggregateLevel(entries: Pick<Grade, 'competencyLevel' | 'assessmentType'>[]): CompetencyLevel | null {
  const levelled = entries.filter((e) => e.competencyLevel);
  const summative = levelled.filter((e) => e.assessmentType === 'SUMMATIVE');
  const use = summative.length > 0 ? summative : levelled;

  if (use.length === 0) return null;

  const mean = use.reduce((a, e) => a + LEVEL_POINTS[e.competencyLevel!], 0) / use.length;

  return LEVELS.find((l) => LEVEL_POINTS[l] === Math.round(mean)) ?? null;
}
