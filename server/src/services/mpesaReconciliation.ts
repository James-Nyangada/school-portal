import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { isStillProcessing, mpesaConfig, settleMpesaRequest, stkQuery } from './mpesa';

/**
 * Reconciliation safety net (school-dashboard-spec §3.3 step 9). Every night, STK prompts whose callback
 * never arrived are re-checked with Daraja's STK query API and settled (crediting payments the callback
 * dropped). Whatever still doesn't line up is saved on the run for finance to review, and raises the
 * reconciliation alert on the Super Admin overview.
 */

export type Mismatch = {
  type: 'UNRESOLVED_PROMPT' | 'SUCCESS_NOT_CREDITED' | 'UNMATCHED_PAYBILL';
  /** CheckoutRequestID or M-Pesa receipt number */
  reference: string;
  amount: number;
  studentId: string | null;
  detail: string;
};

/** Prompts younger than this are left to the live callback and status polling. */
const SETTLE_AFTER_MS = 10 * 60_000;
/** Daraja only answers STK queries for a few days; older prompts are flagged instead of queried. */
const QUERY_WINDOW_MS = 5 * 24 * 3_600_000;
/** Pause between Daraja queries to stay under its rate limits. */
const QUERY_GAP_MS = 400;
const NIGHTLY_AT_EAT = { hour: 2, minute: 0 };

const kes = (n: number) => `KES ${n.toLocaleString('en-KE')}`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let running: Promise<unknown> | null = null;

export async function runMpesaReconciliation(trigger: 'SCHEDULED' | 'MANUAL', actorId?: string) {
  if (running) throw new Error('A reconciliation run is already in progress');

  const job = reconcile(trigger, actorId);
  running = job;
  try {
    return await job;
  } finally {
    running = null;
  }
}

async function reconcile(trigger: 'SCHEDULED' | 'MANUAL', actorId?: string) {
  const run = await prisma.mpesaReconciliationRun.create({ data: { trigger } });
  const mismatches: Mismatch[] = [];
  let checked = 0;
  let recovered = 0;
  let failed = 0;

  try {
    const now = Date.now();
    const configured = mpesaConfig().configured;
    const pending = await prisma.mpesaRequest.findMany({
      where: { status: 'PENDING', createdAt: { lte: new Date(now - SETTLE_AFTER_MS) } },
      orderBy: { createdAt: 'asc' }
    });

    for (const request of pending) {
      const age = now - request.createdAt.getTime();
      let outcome: string | null = null;

      if (configured && age <= QUERY_WINDOW_MS) {
        checked++;
        try {
          const q = await stkQuery(request.checkoutRequestId);
          if (q.ResultCode !== undefined && q.ResultCode !== null && q.ResultCode !== '' && !isStillProcessing(q)) {
            const settled = await settleMpesaRequest(request.checkoutRequestId, { resultCode: Number(q.ResultCode), resultDesc: q.ResultDesc ?? '' });
            if (settled?.status === 'SUCCESS') recovered++;
            else failed++;
            continue;
          }
          outcome = 'Safaricom still reports it as processing';
        } catch (e) {
          outcome = `Status query failed: ${(e as Error).message}`;
        }
        await sleep(QUERY_GAP_MS);
      } else {
        outcome = configured ? 'Too old to query with Daraja' : 'M-Pesa is not configured, so it could not be checked';
      }

      mismatches.push({
        type: 'UNRESOLVED_PROMPT',
        reference: request.checkoutRequestId,
        amount: request.amount,
        studentId: request.studentId,
        detail: `Prompt to ${request.phone} for ${kes(request.amount)} on ${request.createdAt.toISOString().slice(0, 10)} has no result. ${outcome}. Check the M-Pesa statement.`
      });
    }

    // Successful prompts that never became a fee payment (should not happen; catches partial failures)
    const uncredited = await prisma.mpesaRequest.findMany({ where: { status: 'SUCCESS', transactionId: null } });
    for (const r of uncredited) {
      mismatches.push({
        type: 'SUCCESS_NOT_CREDITED',
        reference: r.mpesaReceiptNumber ?? r.checkoutRequestId,
        amount: r.amount,
        studentId: r.studentId,
        detail: `Safaricom confirmed ${kes(r.amount)}${r.mpesaReceiptNumber ? ` (${r.mpesaReceiptNumber})` : ''} but no fee payment was recorded. Record it manually after checking the statement.`
      });
    }

    // Paybill payments whose account number matched no student; finance assigns them on the Paybill page
    const unmatched = await prisma.mpesaC2BPayment.findMany({ where: { status: 'UNMATCHED' }, orderBy: { createdAt: 'asc' } });
    for (const p of unmatched) {
      mismatches.push({
        type: 'UNMATCHED_PAYBILL',
        reference: p.transId,
        amount: p.amount,
        studentId: null,
        detail: `Paybill payment ${p.transId} of ${kes(p.amount)}${p.payerName ? ` from ${p.payerName}` : ''} used account "${p.billRef}", which matches no student. Assign it to a student.`
      });
    }

    const saved = await prisma.mpesaReconciliationRun.update({
      where: { id: run.id },
      data: { finishedAt: new Date(), checked, recovered, failed, mismatches: mismatches as unknown as Prisma.InputJsonValue }
    });

    if (actorId) {
      await prisma.auditLog.create({
        data: {
          actorId,
          action: 'MPESA_RECONCILIATION_RUN',
          details: `Checked ${checked} prompt(s): ${recovered} recovered, ${failed} failed · ${mismatches.length} item(s) to review`
        }
      });
    }

    return saved;
  } catch (error) {
    await prisma.mpesaReconciliationRun.update({
      where: { id: run.id },
      data: { finishedAt: new Date(), checked, recovered, failed, error: (error as Error).message }
    });
    throw error;
  }
}

export const latestReconciliation = () => prisma.mpesaReconciliationRun.findFirst({ orderBy: { startedAt: 'desc' } });

/** Milliseconds until the next 02:00 in Kenya (UTC+3, no DST). */
function msUntilNightly(now = new Date()) {
  const next = new Date(now);
  next.setUTCHours(NIGHTLY_AT_EAT.hour - 3, NIGHTLY_AT_EAT.minute, 0, 0);
  if (next.getTime() <= now.getTime()) next.setUTCDate(next.getUTCDate() + 1);
  return next.getTime() - now.getTime();
}

/** Starts the nightly run. Call once when the server boots. */
export function scheduleNightlyReconciliation() {
  const tick = () => {
    runMpesaReconciliation('SCHEDULED').catch((e) => console.error('[M-Pesa reconciliation]', (e as Error).message));
    setTimeout(tick, msUntilNightly()).unref();
  };
  setTimeout(tick, msUntilNightly()).unref();
}
