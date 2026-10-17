import { PaymentMethod, Prisma, PrismaClient } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { getSettings } from './grading';

type Db = PrismaClient | Prisma.TransactionClient;

/** Interactive transaction options for fee work: billing and allocation run several queries per student. */
export const FEE_TX = { timeout: 60_000, maxWait: 15_000 };

/** Changes allowed to a fee structure after it has been published. */
export const MAX_FEE_STRUCTURE_REVISIONS = 3;

/** Students who still get new bills (leavers and transfers keep their history and arrears). */
export const BILLABLE_STATUSES = ['ACTIVE', 'PENDING_ACTIVATION', 'PENDING_INVITE', 'SUSPENDED', 'LOCKED'] as const;

/** Shillings; avoids float dust like 0.0000001 counting as a balance. */
const EPSILON = 0.005;
const round2 = (n: number) => Math.round(n * 100) / 100;

export type FeeStatus = 'PAID' | 'PARTIAL' | 'UNPAID' | 'NOT_BILLED';

export function feeStatus(billed: number, paid: number): FeeStatus {
  if (billed <= 0) return 'NOT_BILLED';
  if (paid >= billed - EPSILON) return 'PAID';
  if (paid > 0) return 'PARTIAL';
  return 'UNPAID';
}

// ============================================================
// Pure ledger rules (unit tested)
// ============================================================

/**
 * Spreads everything a student has paid over their bills, oldest term first, so a payment always clears
 * arrears before the current term. Anything left after every bill is covered is an overpayment and stays on
 * the newest bill as a credit (amountPaid > totalBilled) that the next term's bill will absorb.
 * `records` must be oldest first.
 */
export function allocatePayments<T extends { totalBilled: number }>(records: T[], totalPaid: number): number[] {
  let remaining = Math.max(0, totalPaid);
  const paid = records.map((r) => {
    const share = Math.min(Math.max(0, r.totalBilled), remaining);
    remaining -= share;
    return round2(share);
  });
  if (remaining > EPSILON && paid.length > 0) paid[paid.length - 1] = round2(paid[paid.length - 1]! + remaining);
  return paid;
}

export type FeeAccessResult = {
  allowed: boolean;
  percentPaid: number;
  threshold: number;
  totalBilled: number;
  totalPaid: number;
  balance: number;
  /** Unpaid fees from terms before the current one */
  arrears: number;
  currentTermBilled: number;
  /** KES still to pay to unlock */
  amountNeeded: number;
  isLeaver: boolean;
};

/**
 * Fee gate. Arrears from earlier terms must be fully cleared, plus `threshold`% of the current term's bill.
 * With fullClearance (certificates, leavers' grades) the whole balance must be paid. No bills = allowed.
 */
export function computeAccess(input: {
  records: { term: string; totalBilled: number; amountPaid: number }[];
  currentTerm: string;
  threshold: number;
  fullClearance: boolean;
  isLeaver: boolean;
}): FeeAccessResult {
  const totalBilled = input.records.reduce((a, r) => a + r.totalBilled, 0);
  const totalPaid = input.records.reduce((a, r) => a + r.amountPaid, 0);
  const currentTermBilled = input.records.filter((r) => r.term === input.currentTerm).reduce((a, r) => a + r.totalBilled, 0);
  const priorBilled = totalBilled - currentTermBilled;
  const threshold = input.fullClearance ? 100 : input.threshold;

  const required = priorBilled + (currentTermBilled * threshold) / 100;
  const amountNeeded = Math.max(0, Math.ceil(required - totalPaid - EPSILON));
  const balance = Math.max(0, round2(totalBilled - totalPaid));

  return {
    allowed: totalBilled <= 0 || amountNeeded === 0,
    percentPaid: totalBilled > 0 ? Math.round(Math.min(100, (totalPaid / totalBilled) * 100) * 10) / 10 : 100,
    threshold,
    totalBilled: round2(totalBilled),
    totalPaid: round2(totalPaid),
    balance,
    arrears: Math.max(0, round2(priorBilled - totalPaid)),
    currentTermBilled: round2(currentTermBilled),
    amountNeeded,
    isLeaver: input.isLeaver
  };
}

export type StatementTerm = {
  term: string;
  broughtForward: number;
  billed: number;
  paid: number;
  /** Positive = owed for this term; negative = credit carried to the next */
  balance: number;
  carriedForward: number;
  feeStructureId: string | null;
  manualOverride: boolean;
};

/** Per-term statement lines, oldest first, with the running balance carried between terms. */
export function statementTerms(
  records: { term: string; totalBilled: number; amountPaid: number; feeStructureId: string | null; manualOverride: boolean }[]
): StatementTerm[] {
  let carried = 0;
  return records.map((r) => {
    const broughtForward = carried;
    carried = round2(carried + r.totalBilled - r.amountPaid);
    return {
      term: r.term,
      broughtForward,
      billed: r.totalBilled,
      paid: r.amountPaid,
      balance: round2(r.totalBilled - r.amountPaid),
      carriedForward: carried,
      feeStructureId: r.feeStructureId,
      manualOverride: r.manualOverride
    };
  });
}

// ============================================================
// Database operations
// ============================================================

const recordsOldestFirst = (db: Db, studentId: string) =>
  db.feeRecord.findMany({ where: { studentId }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });

/** Re-spreads a student's payments over their bills (oldest first). Call after any bill or payment change. */
export async function reallocatePayments(tx: Prisma.TransactionClient, studentId: string) {
  const records = await recordsOldestFirst(tx, studentId);
  const pool = records.reduce((a, r) => a + r.amountPaid, 0);
  const allocation = allocatePayments(records, pool);

  await Promise.all(
    records.map((r, i) =>
      Math.abs(r.amountPaid - allocation[i]!) > EPSILON
        ? tx.feeRecord.update({ where: { id: r.id }, data: { amountPaid: allocation[i]! } })
        : null
    )
  );
}

/**
 * Makes the student's current-term bill match their class's published fee structure (creating it if missing).
 * Bills finance overrode by hand are left alone. Returns true if anything changed.
 */
export async function ensureStudentBilled(tx: Prisma.TransactionClient, studentId: string): Promise<boolean> {
  const [settings, student] = await Promise.all([
    getSettings(tx),
    tx.user.findUnique({ where: { id: studentId }, select: { role: true, classId: true, status: true } })
  ]);
  if (!student || student.role !== 'STUDENT' || !student.classId) return false;
  if (!(BILLABLE_STATUSES as readonly string[]).includes(student.status)) return false;

  const link = await tx.feeStructureClass.findUnique({
    where: { classId_term: { classId: student.classId, term: settings.currentTerm } },
    include: { structure: { include: { items: true } } }
  });
  if (!link || link.structure.status !== 'PUBLISHED') return false;

  return billStudent(tx, studentId, link.structure.id, link.structure.term, structureTotal(link.structure.items));
}

export const structureTotal = (items: { amount: number }[]) => round2(items.reduce((a, i) => a + i.amount, 0));

/** Sets one student's bill for a structure's term. */
export async function billStudent(tx: Prisma.TransactionClient, studentId: string, structureId: string, term: string, total: number) {
  const existing = await tx.feeRecord.findFirst({ where: { studentId, term }, orderBy: { createdAt: 'asc' } });

  if (existing?.manualOverride) return false;
  if (existing && existing.feeStructureId === structureId && Math.abs(existing.totalBilled - total) < EPSILON) return false;

  if (existing) {
    await tx.feeRecord.update({ where: { id: existing.id }, data: { totalBilled: total, feeStructureId: structureId } });
  } else {
    await tx.feeRecord.create({ data: { studentId, term, totalBilled: total, amountPaid: 0, feeStructureId: structureId } });
  }
  await reallocatePayments(tx, studentId);
  return true;
}

/** Bills every billable student in the structure's classes. Returns how many bills changed. */
export async function billStructure(tx: Prisma.TransactionClient, structureId: string, onlyClassIds?: string[]) {
  const structure = await tx.feeStructure.findUniqueOrThrow({ where: { id: structureId }, include: { items: true, classes: true } });
  if (structure.status !== 'PUBLISHED') return { billed: 0, studentIds: [] as string[] };

  const classIds = structure.classes.map((c) => c.classId).filter((id) => !onlyClassIds || onlyClassIds.includes(id));
  const students = await tx.user.findMany({
    where: { role: 'STUDENT', classId: { in: classIds }, status: { in: [...BILLABLE_STATUSES] } },
    select: { id: true }
  });

  const total = structureTotal(structure.items);
  const changed: string[] = [];
  for (const s of students) {
    if (await billStudent(tx, s.id, structure.id, structure.term, total)) changed.push(s.id);
  }
  return { billed: changed.length, studentIds: changed };
}

export type PaymentInput = {
  studentId: string;
  amount: number;
  method: PaymentMethod;
  receiptNumber?: string | null;
  /** Bill to attach the money to if the student has none yet; allocation is always oldest-first */
  term?: string | null;
  recordedById?: string | null;
};

/** Logs a payment and reduces the student's outstanding balance, clearing the oldest term first. */
export async function applyPayment(tx: Prisma.TransactionClient, input: PaymentInput) {
  await ensureStudentBilled(tx, input.studentId);

  const transaction = await tx.feeTransaction.create({
    data: {
      studentId: input.studentId,
      amount: input.amount,
      source: input.method,
      receiptNumber: input.receiptNumber?.trim() || null,
      recordedById: input.recordedById ?? null
    }
  });

  const term = input.term?.trim() || (await getSettings(tx)).currentTerm;
  const target =
    (await tx.feeRecord.findFirst({ where: { studentId: input.studentId, term }, orderBy: { createdAt: 'asc' } })) ??
    (await tx.feeRecord.findFirst({ where: { studentId: input.studentId }, orderBy: { createdAt: 'desc' } })) ??
    (await tx.feeRecord.create({ data: { studentId: input.studentId, term, totalBilled: 0, amountPaid: 0 } }));

  await tx.feeRecord.update({ where: { id: target.id }, data: { amountPaid: { increment: input.amount } } });
  await reallocatePayments(tx, input.studentId);

  const feeRecord = await tx.feeRecord.findUniqueOrThrow({ where: { id: target.id } });
  return { transaction, feeRecord };
}

/** Fee gate for a student's grades, timetable or certificates. Attendance, calendar and assignments are never gated. */
export async function feeAccess(
  studentId: string,
  resource: 'Grades' | 'Timetable' | 'Certificates',
  db: Db = prisma
): Promise<FeeAccessResult> {
  const [records, student, settings] = await Promise.all([
    db.feeRecord.findMany({ where: { studentId }, select: { term: true, totalBilled: true, amountPaid: true } }),
    db.user.findUnique({ where: { id: studentId }, select: { status: true } }),
    getSettings(db)
  ]);
  const isLeaver = student?.status === 'COMPLETED';

  return computeAccess({
    records,
    currentTerm: settings.currentTerm,
    threshold: settings.feeGateThreshold,
    fullClearance: resource === 'Certificates' || (resource === 'Grades' && isLeaver),
    isLeaver
  });
}

/** Human explanation for a locked resource. */
export function lockMessage(access: FeeAccessResult, what: string) {
  const parts = [];
  if (access.arrears > 0) parts.push('clear the balance carried over from previous terms');
  if (access.threshold >= 100) parts.push('clear all fees');
  else if (access.currentTermBilled > 0) parts.push(`pay at least ${access.threshold}% of this term's fees`);
  return `${what} locked — ${parts.join(' and ') || 'clear outstanding fees'}. KES ${access.amountNeeded.toLocaleString('en-KE')} more is needed to unlock.`;
}

/** Staff with finance access see everyone; students see themselves; parents see their linked children. */
export async function canViewStudentFees(user: { id: string; role: string }, studentId: string, db: Db = prisma): Promise<boolean> {
  if (['SUPER_ADMIN', 'ADMIN', 'FINANCE'].includes(user.role)) return true;
  if (user.role === 'STUDENT') return user.id === studentId;
  if (user.role === 'PARENT') {
    const link = await db.studentParent.findUnique({ where: { studentId_parentId: { studentId, parentId: user.id } } });
    return !!link;
  }
  return false;
}

/** Where a fee notification should take this user. */
export async function feesPageFor(userId: string, db: Db = prisma) {
  const user = await db.user.findUnique({ where: { id: userId }, select: { role: true } });
  if (user?.role === 'STUDENT') return '/student/fees';
  if (user?.role === 'PARENT') return '/parent/fees';
  return '/finance/fee-records';
}
