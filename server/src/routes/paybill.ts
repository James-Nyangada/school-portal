import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole, AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { mpesaConfig } from '../services/mpesa';
import { assignC2BPayment, C2BPayload, findStudentByAccount, recordC2BPayment } from '../services/mpesaC2b';

/**
 * Paybill payments made from the M-Pesa menu (Daraja C2B). Mounted at /api/payments/c2b — Daraja refuses
 * C2B URLs containing "mpesa", so these can't live under /api/mpesa.
 */
const router = Router();

/** Safaricom's requests carry MPESA_CALLBACK_SECRET as the last path segment. */
function checkSecret(req: Request, res: Response, next: NextFunction) {
  const { callbackSecret } = mpesaConfig();
  if (callbackSecret && req.params.token !== callbackSecret) {
    console.warn(`M-Pesa C2B ${req.path} rejected: bad token`);
    return res.status(403).json({ ResultCode: 1, ResultDesc: 'Forbidden' });
  }
  next();
}

// POST /api/payments/c2b/validation/:token — only called if Safaricom has enabled external validation
router.post(['/validation', '/validation/:token'], checkSecret, async (req, res) => {
  const accept = () => res.json({ ResultCode: '0', ResultDesc: 'Accepted' });
  try {
    if (!mpesaConfig().c2bRejectUnknownAccounts) return accept();

    const ref = String((req.body as C2BPayload)?.BillRefNumber ?? '');
    if (await findStudentByAccount(ref)) return accept();

    // C2B00012 = invalid account number; Safaricom tells the payer and doesn't take the money
    res.json({ ResultCode: 'C2B00012', ResultDesc: 'Rejected' });
  } catch (error) {
    console.error('M-Pesa C2B validation error:', error);
    accept(); // never block a payment because of our own error; finance can assign it
  }
});

// POST /api/payments/c2b/confirmation/:token — the money has been received
router.post(['/confirmation', '/confirmation/:token'], checkSecret, async (req, res) => {
  try {
    const payment = await recordC2BPayment(req.body as C2BPayload);
    if (payment.status === 'UNMATCHED') {
      console.warn(`M-Pesa Paybill ${payment.transId}: account "${payment.billRef}" matches no student`);
    }
    res.json({ ResultCode: 0, ResultDesc: 'Accepted' });
  } catch (error) {
    console.error('M-Pesa C2B confirmation error:', error, JSON.stringify(req.body));
    res.status(500).json({ ResultCode: 1, ResultDesc: 'Temporary error' });
  }
});

const STATUSES = ['UNMATCHED', 'CREDITED', 'DUPLICATE'] as const;
const financeStaff = [requireAuth, requireRole('FINANCE', 'ADMIN')];

// GET /api/payments/c2b?status=UNMATCHED|CREDITED|DUPLICATE|PROMPT|ALL
// PROMPT lists successful app prompts (STK push), which Safaricom doesn't report through the Paybill webhook.
router.get('/', ...financeStaff, async (req: AuthRequest, res) => {
  try {
    const status = STATUSES.find((s) => s === req.query.status);
    const wantPrompts = req.query.status === 'PROMPT' || req.query.status === 'ALL';
    const wantPaybill = req.query.status !== 'PROMPT';

    const [payments, prompts] = await Promise.all([
      wantPaybill
        ? prisma.mpesaC2BPayment.findMany({
            where: status ? { status } : {},
            orderBy: { createdAt: 'desc' },
            take: 500
          })
        : [],
      wantPrompts
        ? prisma.mpesaRequest.findMany({
            where: { status: 'SUCCESS' },
            orderBy: { updatedAt: 'desc' },
            take: 500
          })
        : []
    ]);

    const userIds = [
      ...new Set(
        [...payments.flatMap((p) => [p.studentId, p.assignedById]), ...prompts.flatMap((r) => [r.studentId, r.initiatedById])].filter(
          (id): id is string => !!id
        )
      )
    ];
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, firstName: true, lastName: true, admissionNumber: true }
    });
    const byId = new Map(users.map((u) => [u.id, u]));
    const nameOf = (id: string | null) => {
      const u = id ? byId.get(id) : null;
      return u ? [u.firstName, u.lastName].filter(Boolean).join(' ') || 'Unnamed' : null;
    };

    const unmatchedCount = await prisma.mpesaC2BPayment.count({ where: { status: 'UNMATCHED' } });

    const paybillRows = payments.map((p) => ({
      id: p.id,
      transId: p.transId,
      amount: p.amount,
      billRef: p.billRef,
      payerName: p.payerName,
      msisdn: p.msisdn,
      paidAt: (p.transTime ?? p.createdAt).toISOString(),
      status: p.status,
      studentId: p.studentId,
      studentName: nameOf(p.studentId),
      admissionNumber: p.studentId ? (byId.get(p.studentId)?.admissionNumber ?? null) : null,
      assignedBy: nameOf(p.assignedById)
    }));

    // Under ALL, a prompt Safaricom also reported as a Paybill payment is already listed as DUPLICATE
    const paybillReceipts = new Set(payments.map((p) => p.transId));
    const promptRows = prompts
      .filter((r) => !r.mpesaReceiptNumber || !paybillReceipts.has(r.mpesaReceiptNumber))
      .map((r) => ({
        id: r.id,
        transId: r.mpesaReceiptNumber ?? '',
        amount: r.amount,
        billRef: '',
        payerName: nameOf(r.initiatedById),
        msisdn: r.phone,
        paidAt: r.updatedAt.toISOString(),
        status: 'PROMPT',
        studentId: r.studentId,
        studentName: nameOf(r.studentId),
        admissionNumber: byId.get(r.studentId)?.admissionNumber ?? null,
        assignedBy: null
      }));

    res.json({
      unmatchedCount,
      payments: [...paybillRows, ...promptRows]
        .sort((a, b) => b.paidAt.localeCompare(a.paidAt))
        .slice(0, 500)
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/payments/c2b/:id/assign — credit an unmatched payment to the right student
router.post('/:id/assign', ...financeStaff, async (req: AuthRequest, res) => {
  const parsed = z.object({ studentId: z.string().min(1) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Choose a student' });

  try {
    const student = await prisma.user.findFirst({
      where: { id: parsed.data.studentId, role: 'STUDENT' },
      select: { id: true, firstName: true, lastName: true }
    });
    if (!student) return res.status(404).json({ error: 'Student not found' });

    const payment = await assignC2BPayment(req.params.id as string, student.id, req.user!.id);
    if (!payment) return res.status(409).json({ error: 'This payment has already been credited' });

    await prisma.auditLog.create({
      data: {
        actorId: req.user!.id,
        action: 'MPESA_PAYBILL_ASSIGNED',
        targetId: student.id,
        details: `${payment.transId} KES ${payment.amount} (account "${payment.billRef}")`
      }
    });
    res.json({ status: payment.status });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
