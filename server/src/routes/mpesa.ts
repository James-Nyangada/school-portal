import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole, AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { canViewStudentFees } from '../services/fees';
import { latestReconciliation, runMpesaReconciliation } from '../services/mpesaReconciliation';
import { getSettings } from '../services/grading';
import {
  isStillProcessing,
  MpesaError,
  mpesaConfig,
  normalizeKenyanPhone,
  settleMpesaRequest,
  stkPush,
  stkQuery
} from '../services/mpesa';

const router = Router();

const stkSchema = z.object({
  studentId: z.string().min(1),
  phone: z.string().min(9).max(20),
  amount: z.coerce.number().int('Whole shillings only').min(1).max(250_000),
  term: z.string().trim().max(40).optional()
});

// POST /api/mpesa/stk-push — prompt the payer's phone
router.post('/stk-push', requireAuth, async (req: AuthRequest, res) => {
  const parsed = stkSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid payment request' });
  }
  const { studentId, amount } = parsed.data;

  const phone = normalizeKenyanPhone(parsed.data.phone);
  if (!phone) return res.status(400).json({ error: 'Enter a valid Safaricom number, e.g. 0712345678' });

  if (!mpesaConfig().configured) {
    return res.status(503).json({ error: 'M-Pesa payments are not set up yet. Please pay by bank or contact the school office.' });
  }

  try {
    const settings = await getSettings();
    if (!settings.mpesaEnabled) {
      return res.status(503).json({ error: 'M-Pesa payments are switched off. Please pay by bank or contact the school office.' });
    }
    if (!(await canViewStudentFees(req.user!, studentId))) {
      return res.status(403).json({ error: 'You can only pay fees for your own children' });
    }
    const student = await prisma.user.findFirst({
      where: { id: studentId, role: 'STUDENT' },
      select: { admissionNumber: true, firstName: true, class: { select: { studentsCanPay: true } } }
    });
    if (!student) return res.status(404).json({ error: 'Student not found' });
    if (req.user!.role === 'STUDENT' && !student.class?.studentsCanPay) {
      return res.status(403).json({ error: 'Fee payments for your class are made by your parent or guardian.' });
    }

    const term = parsed.data.term || settings.currentTerm;
    const push = await stkPush({
      phone,
      amount,
      accountReference: student.admissionNumber || 'SCHOOLFEES',
      description: 'School fees'
    });

    const request = await prisma.mpesaRequest.create({
      data: {
        checkoutRequestId: push.CheckoutRequestID,
        merchantRequestId: push.MerchantRequestID,
        studentId,
        term,
        amount,
        phone,
        initiatedById: req.user!.id
      }
    });

    res.status(201).json({ id: request.id, checkoutRequestId: request.checkoutRequestId, status: request.status, message: push.CustomerMessage });
  } catch (error) {
    console.error('STK push failed:', error);
    if (error instanceof MpesaError) return res.status(error.status).json({ error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// The callback is often slow (sandbox, tunnels), so start asking Daraja soon after the prompt is sent,
// but at most once every few seconds per prompt to stay under Daraja's rate limits.
const STK_QUERY_AFTER_MS = 5_000;
const STK_QUERY_INTERVAL_MS = 3_000;
const lastStkQueryAt = new Map<string, number>();

// GET /api/mpesa/status/:checkoutRequestId — poll a prompt; asks Daraja directly if the callback is late
router.get('/status/:checkoutRequestId', requireAuth, async (req: AuthRequest, res) => {
  try {
    let request = await prisma.mpesaRequest.findUnique({ where: { checkoutRequestId: req.params.checkoutRequestId as string } });
    if (!request || !(await canViewStudentFees(req.user!, request.studentId))) {
      return res.status(404).json({ error: 'Payment request not found' });
    }

    const ageMs = Date.now() - request.createdAt.getTime();
    const lastQuery = lastStkQueryAt.get(request.checkoutRequestId) ?? 0;
    if (
      request.status === 'PENDING' &&
      ageMs > STK_QUERY_AFTER_MS &&
      Date.now() - lastQuery > STK_QUERY_INTERVAL_MS &&
      mpesaConfig().configured
    ) {
      lastStkQueryAt.set(request.checkoutRequestId, Date.now());
      try {
        const q = await stkQuery(request.checkoutRequestId);
        // ResultCode is only present once the customer has acted or the prompt expired — except 4999,
        // "still under processing", which means keep waiting
        if (q.ResultCode !== undefined && q.ResultCode !== null && q.ResultCode !== '' && !isStillProcessing(q)) {
          request = (await settleMpesaRequest(request.checkoutRequestId, {
            resultCode: Number(q.ResultCode),
            resultDesc: q.ResultDesc ?? ''
          })) ?? request;
        }
      } catch (e) {
        // "still processing" comes back as an error from Daraja; keep polling
        console.warn('STK query:', (e as Error).message);
      }
    }

    // Prompts expire after about a minute on the phone. Report that, but leave the row PENDING so a
    // late callback for a payment that did go through is still credited.
    const expired = request.status === 'PENDING' && ageMs > 3 * 60_000;
    if (request.status !== 'PENDING' || expired) lastStkQueryAt.delete(request.checkoutRequestId);

    res.json({
      status: expired ? 'EXPIRED' : request.status,
      resultDesc: expired ? 'No response from the phone. If you were charged, the payment will reflect shortly.' : request.resultDesc,
      amount: request.amount,
      receiptNumber: request.mpesaReceiptNumber
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/mpesa/callback — Daraja's result webhook (no user auth; checked by token + known CheckoutRequestID)
router.post('/callback', async (req, res) => {
  // Always acknowledge so Safaricom doesn't retry; problems are logged instead
  const ack = () => res.json({ ResultCode: 0, ResultDesc: 'Accepted' });

  const { callbackSecret } = mpesaConfig();
  if (callbackSecret && req.query.token !== callbackSecret) {
    console.warn('M-Pesa callback rejected: bad token');
    return res.status(403).json({ ResultCode: 1, ResultDesc: 'Forbidden' });
  }

  try {
    const cb = req.body?.Body?.stkCallback;
    if (!cb?.CheckoutRequestID) {
      console.warn('M-Pesa callback without CheckoutRequestID');
      return ack();
    }

    const items: { Name: string; Value?: string | number }[] = cb.CallbackMetadata?.Item ?? [];
    const item = (name: string) => items.find((i) => i.Name === name)?.Value;

    const settled = await settleMpesaRequest(cb.CheckoutRequestID, {
      resultCode: Number(cb.ResultCode),
      resultDesc: String(cb.ResultDesc ?? ''),
      amount: item('Amount') !== undefined ? Number(item('Amount')) : null,
      receiptNumber: item('MpesaReceiptNumber') !== undefined ? String(item('MpesaReceiptNumber')) : null
    });
    if (!settled) console.warn(`M-Pesa callback for unknown request ${cb.CheckoutRequestID}`);

    ack();
  } catch (error) {
    console.error('M-Pesa Callback Error:', error);
    res.status(500).json({ ResultCode: 1, ResultDesc: 'Temporary error' });
  }
});

// POST /api/mpesa/reconcile — run the reconciliation job now (it also runs nightly)
router.post('/reconcile', requireAuth, requireRole('FINANCE', 'ADMIN'), async (req: AuthRequest, res) => {
  try {
    res.json(await runMpesaReconciliation('MANUAL', req.user!.id));
  } catch (error) {
    console.error('M-Pesa reconciliation failed:', error);
    res.status(409).json({ error: (error as Error).message || 'Reconciliation failed' });
  }
});

// GET /api/mpesa/reconciliation — the latest run and what it flagged for review
router.get('/reconciliation', requireAuth, requireRole('FINANCE', 'ADMIN'), async (_req, res) => {
  try {
    res.json({ run: await latestReconciliation(), configured: mpesaConfig().configured });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
