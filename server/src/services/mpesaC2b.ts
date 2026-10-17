import { MpesaC2BPayment, PaymentMethod, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { applyPayment, FEE_TX } from './fees';
import { getSettings } from './grading';
import { settleMpesaRequestTx } from './mpesa';

type Db = Prisma.TransactionClient | typeof prisma;

/** Body Safaricom posts to the C2B confirmation and validation URLs. */
export type C2BPayload = {
  TransactionType?: string;
  TransID?: string;
  TransTime?: string;
  TransAmount?: string | number;
  BusinessShortCode?: string;
  BillRefNumber?: string;
  MSISDN?: string;
  FirstName?: string;
  MiddleName?: string;
  LastName?: string;
};

/** "adm 3165", "ADM-3165", "adm3165" → "ADM3165" */
export const normalizeAccount = (ref: string) => ref.toUpperCase().replace(/[^A-Z0-9]/g, '');

/** Daraja's yyyyMMddHHmmss in Kenyan time (UTC+3). */
export function parseTransTime(value?: string): Date | null {
  const m = value?.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/);
  if (!m) return null;
  const [, y, mo, d, h, mi, s] = m.map(Number);
  return new Date(Date.UTC(y!, mo! - 1, d!, h! - 3, mi!, s!));
}

/** The student whose admission number the payer typed, ignoring case, spaces and dashes. */
export async function findStudentByAccount(ref: string, db: Db = prisma): Promise<string | null> {
  const wanted = normalizeAccount(ref);
  if (!wanted) return null;

  const exact = await db.user.findFirst({
    where: { role: 'STUDENT', admissionNumber: { equals: ref.trim(), mode: 'insensitive' } },
    select: { id: true }
  });
  if (exact) return exact.id;

  const loose = await db.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "User"
    WHERE "role" = 'STUDENT'
      AND regexp_replace(upper(coalesce("admissionNumber", '')), '[^A-Z0-9]', '', 'g') = ${wanted}
    LIMIT 2`;
  return loose.length === 1 ? loose[0]!.id : null;
}

const payerNameOf = (p: C2BPayload) => [p.FirstName, p.MiddleName, p.LastName].filter(Boolean).join(' ').trim() || null;

/**
 * Credits a Paybill payment to a student, once. If the same money already came in through an app
 * prompt (STK push) for this student, that prompt is settled with this receipt instead of crediting twice.
 */
async function creditPayment(
  tx: Prisma.TransactionClient,
  payment: MpesaC2BPayment,
  studentId: string,
  assignedById: string | null
) {
  const already = await tx.feeTransaction.findUnique({ where: { receiptNumber: payment.transId } });
  if (already) {
    return tx.mpesaC2BPayment.update({
      where: { id: payment.id },
      data: { status: 'DUPLICATE', studentId, transactionId: already.id, assignedById }
    });
  }

  // A prompt for the same student and amount shortly before: it's the same payment
  const since = new Date((payment.transTime ?? payment.createdAt).getTime() - 15 * 60_000);
  const prompt = await tx.mpesaRequest.findFirst({
    where: {
      studentId,
      amount: payment.amount,
      createdAt: { gte: since },
      OR: [{ status: 'PENDING' }, { status: 'SUCCESS', mpesaReceiptNumber: null }]
    },
    orderBy: { createdAt: 'desc' }
  });
  if (prompt) {
    const settled = await settleMpesaRequestTx(tx, prompt.checkoutRequestId, {
      resultCode: 0,
      resultDesc: 'Confirmed by Paybill notification',
      amount: payment.amount,
      receiptNumber: payment.transId
    });
    return tx.mpesaC2BPayment.update({
      where: { id: payment.id },
      data: { status: 'DUPLICATE', studentId, transactionId: settled?.transactionId ?? null, assignedById }
    });
  }

  const { transaction } = await applyPayment(tx, {
    studentId,
    amount: payment.amount,
    method: PaymentMethod.MPESA,
    receiptNumber: payment.transId,
    term: (await getSettings(tx)).currentTerm,
    recordedById: assignedById
  });

  const parents = await tx.studentParent.findMany({ where: { studentId }, select: { parentId: true } });
  const message = `KES ${payment.amount.toLocaleString('en-KE')} paid by M-Pesa Paybill has been credited to school fees (${payment.transId}).`;
  await tx.notification.createMany({
    data: [
      { userId: studentId, type: 'FEE_PAYMENT_RECEIVED', title: 'M-Pesa payment received', message, link: '/student/fees' },
      ...parents.map((p) => ({
        userId: p.parentId,
        type: 'FEE_PAYMENT_RECEIVED',
        title: 'M-Pesa payment received',
        message,
        link: '/parent/fees'
      }))
    ]
  });

  return tx.mpesaC2BPayment.update({
    where: { id: payment.id },
    data: { status: 'CREDITED', studentId, transactionId: transaction.id, assignedById }
  });
}

const isUniqueViolation = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';

/**
 * Records a C2B confirmation. Safe to receive more than once: the M-Pesa receipt number (TransID) is unique,
 * so a resend returns the payment already stored.
 */
export async function recordC2BPayment(payload: C2BPayload) {
  const transId = String(payload.TransID ?? '').trim();
  const amount = Number(payload.TransAmount);
  if (!transId || !(amount > 0)) throw new Error(`Invalid C2B confirmation: ${JSON.stringify(payload)}`);

  const existing = await prisma.mpesaC2BPayment.findUnique({ where: { transId } });
  if (existing) return existing;

  const billRef = String(payload.BillRefNumber ?? '').trim();
  const studentId = await findStudentByAccount(billRef);

  try {
    return await prisma.$transaction(async (tx) => {
      const payment = await tx.mpesaC2BPayment.create({
        data: {
          transId,
          amount,
          billRef,
          shortcode: payload.BusinessShortCode ?? null,
          msisdn: payload.MSISDN ?? null,
          payerName: payerNameOf(payload),
          transTime: parseTransTime(payload.TransTime),
          raw: payload as Prisma.InputJsonValue
        }
      });
      return studentId ? creditPayment(tx, payment, studentId, null) : payment;
    }, FEE_TX);
  } catch (e) {
    // Two deliveries of the same confirmation at once (or a prompt callback crediting the same receipt)
    if (isUniqueViolation(e)) {
      const stored = await prisma.mpesaC2BPayment.findUnique({ where: { transId } });
      if (stored) return stored;
    }
    throw e;
  }
}

/** Finance: credit a payment whose account number didn't match any student. */
export async function assignC2BPayment(paymentId: string, studentId: string, assignedById: string) {
  return prisma.$transaction(async (tx) => {
    const claimed = await tx.mpesaC2BPayment.updateMany({
      where: { id: paymentId, status: 'UNMATCHED' },
      data: { assignedById }
    });
    if (claimed.count === 0) return null;

    const payment = await tx.mpesaC2BPayment.findUniqueOrThrow({ where: { id: paymentId } });
    return creditPayment(tx, payment, studentId, assignedById);
  }, FEE_TX);
}
