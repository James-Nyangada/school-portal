import { Router } from 'express';
import { z } from 'zod';
import { PaymentMethod } from '@prisma/client';
import { requireAuth, requireRole, AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { applyPayment, canViewStudentFees, feesPageFor, FEE_TX } from '../services/fees';
import { getSettings } from '../services/grading';
import { mpesaConfig } from '../services/mpesa';
import { buildStatement, renderStatementPdf } from '../services/feeStatement';
import { planFor, planSchedule, plansOf, termStartOf, todayIso } from '../services/paymentPlans';

const router = Router();

const FINANCE_ROLES = ['SUPER_ADMIN', 'ADMIN', 'FINANCE'];

// GET /api/fees/payment-options — how parents can pay (M-Pesa availability and the school's bank details)
router.get('/payment-options', requireAuth, async (req: AuthRequest, res) => {
  const mpesa = mpesaConfig();
  const settings = await getSettings();
  // Students may only start a payment when their class allows it (System Settings → classes); parents always can
  const studentClass =
    req.user!.role === 'STUDENT'
      ? (await prisma.user.findUnique({ where: { id: req.user!.id }, select: { class: { select: { studentsCanPay: true } } } }))?.class
      : null;
  res.json({
    currentTerm: settings.currentTerm,
    canPay: req.user!.role !== 'STUDENT' || !!studentClass?.studentsCanPay,
    mpesa: {
      enabled: mpesa.configured && settings.mpesaEnabled,
      // Paybill number parents can also use from the M-Pesa menu (account = admission number). Hidden in
      // sandbox: the test shortcode isn't the school's, so real money sent there never reaches it.
      paybill: mpesa.production && mpesa.transactionType === 'CustomerPayBillOnline' ? mpesa.partyB || null : null
    },
    bank: {
      bankName: process.env.SCHOOL_BANK_NAME || null,
      branch: process.env.SCHOOL_BANK_BRANCH || null,
      accountName: process.env.SCHOOL_BANK_ACCOUNT_NAME || null,
      accountNumber: process.env.SCHOOL_BANK_ACCOUNT_NUMBER || null
    }
  });
});

// GET /api/fees/student/:id — balances, per-term statement (with carry-forward) and payments
router.get('/student/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const studentId = req.params.id as string;

    if (!(await canViewStudentFees(req.user!, studentId))) {
      return res.status(403).json({ error: 'Forbidden: you cannot view this student\'s fees' });
    }

    const statement = await buildStatement(studentId);
    if (!statement) return res.status(404).json({ error: 'Student not found' });

    const [feeRecords, feeTransactions, settings] = await Promise.all([
      prisma.feeRecord.findMany({ where: { studentId }, orderBy: { createdAt: 'desc' } }),
      prisma.feeTransaction.findMany({ where: { studentId }, orderBy: { createdAt: 'desc' } }),
      getSettings()
    ]);
    // Installment milestones for the current term's bill
    const current = feeRecords.find((r) => r.term === settings.currentTerm && r.totalBilled > 0);
    const paymentPlan = current
      ? planSchedule({
          plan: planFor(plansOf(settings), current.paymentPlan),
          billed: current.totalBilled,
          paid: current.amountPaid,
          termStart: await termStartOf(current.term),
          today: todayIso()
        })
      : null;

    res.json({
      studentId,
      totalBilled: statement.totalBilled,
      totalPaid: statement.totalPaid,
      balance: statement.balance,
      feeRecords,
      feeTransactions,
      paymentPlan,
      statement
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/fees/student/:id/statement.pdf — downloadable fee statement
router.get('/student/:id/statement.pdf', requireAuth, async (req: AuthRequest, res) => {
  try {
    const studentId = req.params.id as string;
    if (!(await canViewStudentFees(req.user!, studentId))) {
      return res.status(403).json({ error: 'Forbidden: you cannot view this student\'s fees' });
    }

    const statement = await buildStatement(studentId);
    if (!statement) return res.status(404).json({ error: 'Student not found' });

    const pdf = await renderStatementPdf(statement);
    const safeName = (statement.student.admissionNumber || statement.student.name).replace(/[^\w-]+/g, '_');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="fee-statement-${safeName}.pdf"`);
    res.setHeader('Cache-Control', 'no-store');
    res.send(pdf);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

const manualPaymentSchema = z.object({
  studentId: z.string().min(1),
  amount: z.coerce.number().positive().max(10_000_000),
  // `source` is the original field name; `method` is what the portal form sends
  method: z.enum(PaymentMethod).optional(),
  source: z.enum(PaymentMethod).optional(),
  receiptNumber: z.string().trim().max(60).optional().nullable(),
  term: z.string().trim().max(40).optional().nullable()
});

// POST /api/fees/manual-payment
router.post('/manual-payment', requireAuth, requireRole('FINANCE', 'ADMIN'), async (req: AuthRequest, res) => {
  const parsed = manualPaymentSchema.safeParse(req.body);
  const method = parsed.success ? parsed.data.method ?? parsed.data.source : undefined;
  if (!parsed.success || !method) {
    return res.status(400).json({ error: 'Student, a positive amount and a payment method are required' });
  }
  const { studentId, amount, receiptNumber, term } = parsed.data;

  try {
    const student = await prisma.user.findFirst({ where: { id: studentId, role: 'STUDENT' }, select: { id: true } });
    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }

    const result = await prisma.$transaction(async (tx) => {
      const payment = await applyPayment(tx, {
        studentId,
        amount,
        method,
        receiptNumber: receiptNumber ?? null,
        term: term ?? null,
        recordedById: req.user!.id
      });

      await tx.auditLog.create({
        data: {
          actorId: req.user!.id,
          action: 'MANUAL_PAYMENT',
          targetId: studentId,
          details: `Logged manual payment of KES ${amount} via ${method} for ${payment.feeRecord.term} (Receipt: ${receiptNumber || 'none'})`
        }
      });

      return payment;
    }, FEE_TX);

    res.status(201).json({ transaction: result.transaction, updatedFeeRecord: result.feeRecord });
  } catch (error: any) {
    console.error(error);
    if (error.code === 'P2002') {
      return res.status(400).json({ error: 'Receipt number has already been used' });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================================
// Bank deposits reported by parents, verified by finance
// ============================================================

const normalizeCode = (code: string) => code.trim().toUpperCase().replace(/\s+/g, '');

const claimSchema = z.object({
  studentId: z.string().min(1),
  amount: z.coerce.number().positive().max(10_000_000),
  transactionCode: z.string().trim().min(4, 'Enter the full transaction code').max(60),
  bankName: z.string().trim().max(80).optional().nullable(),
  paidAt: z.coerce.date(),
  note: z.string().trim().max(500).optional().nullable(),
  term: z.string().trim().max(40).optional().nullable()
});

/** True if the code is already a recorded payment or sits on a claim that wasn't rejected. */
async function codeInUse(code: string, excludeClaimId?: string) {
  const [tx, claim] = await Promise.all([
    prisma.feeTransaction.findFirst({ where: { receiptNumber: { equals: code, mode: 'insensitive' } }, select: { id: true } }),
    prisma.bankPaymentClaim.findFirst({
      where: { transactionCode: code, status: { in: ['PENDING', 'APPROVED'] }, ...(excludeClaimId ? { id: { not: excludeClaimId } } : {}) },
      select: { id: true }
    })
  ]);
  return !!(tx || claim);
}

const claimInclude = {
  student: { select: { firstName: true, lastName: true, admissionNumber: true, class: { select: { name: true } } } }
} as const;

async function withPeople<T extends { submittedById: string; reviewedById: string | null }>(claims: T[]) {
  const ids = [...new Set(claims.flatMap((c) => [c.submittedById, c.reviewedById]).filter((id): id is string => !!id))];
  const people = await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, firstName: true, lastName: true, role: true } });
  const byId = new Map(people.map((p) => [p.id, p]));
  const name = (id: string | null) => {
    const p = id ? byId.get(id) : undefined;
    return p ? [p.firstName, p.lastName].filter(Boolean).join(' ') || p.role : null;
  };
  return claims.map((c) => ({ ...c, submittedBy: name(c.submittedById), reviewedBy: name(c.reviewedById) }));
}

// POST /api/fees/bank-claims — parent (or student) reports a bank deposit
router.post('/bank-claims', requireAuth, async (req: AuthRequest, res) => {
  const parsed = claimSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid bank payment details' });
  }
  const data = parsed.data;
  const code = normalizeCode(data.transactionCode);

  try {
    if (!(await canViewStudentFees(req.user!, data.studentId))) {
      return res.status(403).json({ error: 'You can only report payments for your own children' });
    }
    if (data.paidAt.getTime() > Date.now() + 24 * 60 * 60 * 1000) {
      return res.status(400).json({ error: 'Payment date cannot be in the future' });
    }
    if (await codeInUse(code)) {
      return res.status(409).json({ error: 'This transaction code has already been submitted' });
    }

    const term = data.term || (await getSettings()).currentTerm;
    const claim = await prisma.$transaction(async (tx) => {
      const created = await tx.bankPaymentClaim.create({
        data: {
          studentId: data.studentId,
          term,
          amount: data.amount,
          transactionCode: code,
          bankName: data.bankName || null,
          paidAt: data.paidAt,
          note: data.note || null,
          submittedById: req.user!.id
        },
        include: claimInclude
      });

      const financeUsers = await tx.user.findMany({ where: { role: 'FINANCE', status: 'ACTIVE' }, select: { id: true } });
      const studentName = [created.student.firstName, created.student.lastName].filter(Boolean).join(' ');
      if (financeUsers.length) {
        await tx.notification.createMany({
          data: financeUsers.map((u) => ({
            userId: u.id,
            type: 'BANK_PAYMENT_SUBMITTED',
            title: 'Bank payment to verify',
            message: `KES ${data.amount.toLocaleString('en-KE')} for ${studentName} (code ${code})`,
            link: '/finance/bank-payments',
            senderId: req.user!.id
          }))
        });
      }
      return created;
    }, FEE_TX);

    res.status(201).json(claim);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/fees/bank-claims?status=&studentId= — finance sees all; parents/students only their own children
router.get('/bank-claims', requireAuth, async (req: AuthRequest, res) => {
  try {
    const status = typeof req.query.status === 'string' && req.query.status !== 'ALL' ? req.query.status : undefined;
    const studentId = typeof req.query.studentId === 'string' ? req.query.studentId : undefined;
    const isFinance = FINANCE_ROLES.includes(req.user!.role);

    if (!isFinance) {
      if (!studentId) return res.status(400).json({ error: 'studentId is required' });
      if (!(await canViewStudentFees(req.user!, studentId))) return res.status(403).json({ error: 'Forbidden' });
    }

    const claims = await prisma.bankPaymentClaim.findMany({
      where: { ...(status ? { status } : {}), ...(studentId ? { studentId } : {}) },
      orderBy: [{ createdAt: 'desc' }],
      take: 500,
      include: claimInclude
    });

    res.json({ claims: await withPeople(claims) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

const reviewSchema = z.object({
  // finance may correct the amount to what actually reached the account
  amount: z.coerce.number().positive().max(10_000_000).optional(),
  term: z.string().trim().min(1).max(40).optional(),
  reason: z.string().trim().max(500).optional()
});

// POST /api/fees/bank-claims/:id/approve — code checked against the bank statement; credit the student
router.post('/bank-claims/:id/approve', requireAuth, requireRole('FINANCE', 'ADMIN'), async (req: AuthRequest, res) => {
  const parsed = reviewSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: 'Invalid amount or term' });

  try {
    const claim = await prisma.bankPaymentClaim.findUnique({ where: { id: req.params.id as string } });
    if (!claim) return res.status(404).json({ error: 'Claim not found' });
    if (claim.status !== 'PENDING') return res.status(409).json({ error: `This claim was already ${claim.status.toLowerCase()}` });

    const amount = parsed.data.amount ?? claim.amount;
    const term = parsed.data.term ?? claim.term;

    const updated = await prisma.$transaction(async (tx) => {
      // Guard against two reviewers approving at once
      const claimed = await tx.bankPaymentClaim.updateMany({
        where: { id: claim.id, status: 'PENDING' },
        data: { status: 'APPROVED', reviewedById: req.user!.id, reviewedAt: new Date(), amount, term }
      });
      if (claimed.count === 0) throw Object.assign(new Error('already reviewed'), { code: 'ALREADY_REVIEWED' });

      const { transaction } = await applyPayment(tx, {
        studentId: claim.studentId,
        amount,
        method: PaymentMethod.BANK,
        receiptNumber: claim.transactionCode,
        term,
        recordedById: req.user!.id
      });

      await tx.auditLog.create({
        data: {
          actorId: req.user!.id,
          action: 'BANK_PAYMENT_APPROVED',
          targetId: claim.studentId,
          details: `Verified bank payment of KES ${amount} for ${term} (code ${claim.transactionCode})${amount !== claim.amount ? `; parent reported KES ${claim.amount}` : ''}`
        }
      });

      await tx.notification.create({
        data: {
          userId: claim.submittedById,
          type: 'BANK_PAYMENT_APPROVED',
          title: 'Bank payment confirmed',
          message: `KES ${amount.toLocaleString('en-KE')} (code ${claim.transactionCode}) has been credited to school fees.`,
          link: await feesPageFor(claim.submittedById, tx),
          senderId: req.user!.id
        }
      });

      return tx.bankPaymentClaim.update({ where: { id: claim.id }, data: { transactionId: transaction.id }, include: claimInclude });
    }, FEE_TX);

    res.json(updated);
  } catch (error: any) {
    if (error.code === 'ALREADY_REVIEWED') return res.status(409).json({ error: 'This claim was already reviewed' });
    if (error.code === 'P2002') return res.status(409).json({ error: 'This transaction code is already recorded as a payment' });
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/fees/bank-claims/:id/reject — code not found on the statement, wrong amount, etc.
router.post('/bank-claims/:id/reject', requireAuth, requireRole('FINANCE', 'ADMIN'), async (req: AuthRequest, res) => {
  const parsed = reviewSchema.safeParse(req.body ?? {});
  const reason = parsed.success ? parsed.data.reason : undefined;
  if (!reason) return res.status(400).json({ error: 'Give the parent a reason for rejecting' });

  try {
    const claim = await prisma.bankPaymentClaim.findUnique({ where: { id: req.params.id as string } });
    if (!claim) return res.status(404).json({ error: 'Claim not found' });

    const updated = await prisma.$transaction(async (tx) => {
      const claimed = await tx.bankPaymentClaim.updateMany({
        where: { id: claim.id, status: 'PENDING' },
        data: { status: 'REJECTED', reviewedById: req.user!.id, reviewedAt: new Date(), rejectionReason: reason }
      });
      if (claimed.count === 0) throw Object.assign(new Error('already reviewed'), { code: 'ALREADY_REVIEWED' });

      await tx.auditLog.create({
        data: {
          actorId: req.user!.id,
          action: 'BANK_PAYMENT_REJECTED',
          targetId: claim.studentId,
          details: `Rejected bank payment claim of KES ${claim.amount} (code ${claim.transactionCode}): ${reason}`
        }
      });

      await tx.notification.create({
        data: {
          userId: claim.submittedById,
          type: 'BANK_PAYMENT_REJECTED',
          title: 'Bank payment could not be verified',
          message: `Code ${claim.transactionCode}: ${reason}`,
          link: await feesPageFor(claim.submittedById, tx),
          senderId: req.user!.id
        }
      });

      return tx.bankPaymentClaim.findUnique({ where: { id: claim.id }, include: claimInclude });
    }, FEE_TX);

    res.json(updated);
  } catch (error: any) {
    if (error.code === 'ALREADY_REVIEWED') return res.status(409).json({ error: 'This claim was already reviewed' });
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
