import { Router } from 'express';
import { z } from 'zod';
import { PaymentMethod } from '@prisma/client';
import { requireAuth, requireRole, AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { getSettings } from '../services/grading';
import { BILLABLE_STATUSES, ensureStudentBilled, feeStatus, reallocatePayments, FEE_TX } from '../services/fees';
import { feeReminderText, sendSms, smsSummary } from '../services/sms';
import { paymentPlanSchema, paymentPlansOverview, plansOf } from '../services/paymentPlans';

const router = Router();

// SUPER_ADMIN is always let through by requireRole
const financeStaff = [requireAuth, requireRole('FINANCE', 'ADMIN')];


const fullName = (u: { firstName: string | null; lastName: string | null } | null | undefined) =>
  [u?.firstName, u?.lastName].filter(Boolean).join(' ') || 'Unnamed student';

const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

async function knownTerms() {
  const [settings, terms] = await Promise.all([
    getSettings(),
    prisma.feeRecord.findMany({ distinct: ['term'], select: { term: true }, orderBy: { createdAt: 'asc' } })
  ]);
  return { currentTerm: settings.currentTerm, terms: [...new Set([...terms.map((t) => t.term), settings.currentTerm])] };
}

// ============================================================
// GET /api/finance/overview — dashboard stats
// ============================================================
router.get('/overview', ...financeStaff, async (_req: AuthRequest, res) => {
  try {
    const { currentTerm } = await knownTerms();

    const now = new Date();
    const trendStart = new Date(now.getFullYear(), now.getMonth() - 5, 1);
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);

    const [records, trendTx, recent, methodGroups, pendingBankClaims] = await Promise.all([
      prisma.feeRecord.findMany({ select: { studentId: true, term: true, totalBilled: true, amountPaid: true } }),
      prisma.feeTransaction.findMany({ where: { createdAt: { gte: trendStart } }, select: { amount: true, createdAt: true } }),
      prisma.feeTransaction.findMany({
        orderBy: { createdAt: 'desc' },
        take: 8,
        include: { student: { select: { firstName: true, lastName: true, admissionNumber: true } } }
      }),
      prisma.feeTransaction.groupBy({ by: ['source'], _sum: { amount: true }, _count: true }),
      prisma.bankPaymentClaim.count({ where: { status: 'PENDING' } })
    ]);

    let totalBilled = 0;
    let totalCollected = 0;
    let termBilled = 0;
    let termCollected = 0;
    const balanceByStudent = new Map<string, number>();

    for (const r of records) {
      totalBilled += r.totalBilled;
      totalCollected += r.amountPaid;
      if (r.term === currentTerm) {
        termBilled += r.totalBilled;
        termCollected += r.amountPaid;
      }
      balanceByStudent.set(r.studentId, (balanceByStudent.get(r.studentId) ?? 0) + r.totalBilled - r.amountPaid);
    }

    // Monthly collections for the last six months, including empty months
    const trend: { month: string; label: string; collected: number }[] = [];
    for (let i = 0; i < 6; i++) {
      const d = new Date(trendStart.getFullYear(), trendStart.getMonth() + i, 1);
      trend.push({ month: monthKey(d), label: d.toLocaleString('en-KE', { month: 'short' }), collected: 0 });
    }
    let thisMonth = 0;
    let lastMonth = 0;
    for (const t of trendTx) {
      const bucket = trend.find((b) => b.month === monthKey(t.createdAt));
      if (bucket) bucket.collected += t.amount;
      if (t.createdAt >= thisMonthStart) thisMonth += t.amount;
      else if (t.createdAt >= lastMonthStart) lastMonth += t.amount;
    }

    res.json({
      currentTerm,
      totalBilled,
      totalCollected,
      totalOutstanding: Math.max(0, totalBilled - totalCollected),
      collectionRate: totalBilled > 0 ? Math.round((totalCollected / totalBilled) * 100) : 0,
      term: {
        billed: termBilled,
        collected: termCollected,
        outstanding: Math.max(0, termBilled - termCollected),
        collectionRate: termBilled > 0 ? Math.round((termCollected / termBilled) * 100) : 0
      },
      debtorCount: [...balanceByStudent.values()].filter((b) => b > 0).length,
      pendingBankClaims,
      thisMonth,
      lastMonth,
      // null when there's nothing to compare against
      monthChange: lastMonth > 0 ? Math.round(((thisMonth - lastMonth) / lastMonth) * 100) : null,
      trend,
      byMethod: methodGroups.map((g) => ({ method: g.source, amount: g._sum.amount ?? 0, count: g._count })),
      recentPayments: recent.map((t) => ({
        id: t.id,
        studentId: t.studentId,
        studentName: fullName(t.student),
        admissionNumber: t.student?.admissionNumber ?? null,
        amount: t.amount,
        method: t.source,
        receiptNumber: t.receiptNumber,
        date: t.createdAt
      }))
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================================
// GET /api/finance/records?term= — one row per student (all terms when term is omitted)
// ============================================================
router.get('/records', ...financeStaff, async (req: AuthRequest, res) => {
  try {
    const term = typeof req.query.term === 'string' && req.query.term !== 'ALL' ? req.query.term : undefined;

    const [students, records, terms] = await Promise.all([
      prisma.user.findMany({
        where: { role: 'STUDENT' },
        select: { id: true, firstName: true, lastName: true, admissionNumber: true, status: true, class: { select: { id: true, name: true } } },
        orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }]
      }),
      prisma.feeRecord.findMany({ where: term ? { term } : {}, select: { studentId: true, totalBilled: true, amountPaid: true } }),
      knownTerms()
    ]);

    const totals = new Map<string, { billed: number; paid: number }>();
    for (const r of records) {
      const t = totals.get(r.studentId) ?? { billed: 0, paid: 0 };
      t.billed += r.totalBilled;
      t.paid += r.amountPaid;
      totals.set(r.studentId, t);
    }

    const rows = students.map((s) => {
      const t = totals.get(s.id) ?? { billed: 0, paid: 0 };
      return {
        studentId: s.id,
        studentName: fullName(s),
        admissionNumber: s.admissionNumber,
        classId: s.class?.id ?? null,
        className: s.class?.name ?? null,
        studentStatus: s.status,
        totalBilled: t.billed,
        amountPaid: t.paid,
        balance: t.billed - t.paid,
        status: feeStatus(t.billed, t.paid)
      };
    });

    res.json({ ...terms, term: term ?? 'ALL', rows });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================================
// GET /api/finance/transactions?from=&to=&method= — payment ledger
// ============================================================
router.get('/transactions', ...financeStaff, async (req: AuthRequest, res) => {
  const query = z
    .object({
      from: z.coerce.date().optional(),
      to: z.coerce.date().optional(),
      method: z.enum(PaymentMethod).optional()
    })
    .safeParse(req.query);
  if (!query.success) return res.status(400).json({ error: 'Invalid filters' });
  const { from, to, method } = query.data;

  try {
    // `to` is a calendar day, so include all of it
    const toEnd = to ? new Date(to.getTime() + 24 * 60 * 60 * 1000) : undefined;
    const txs = await prisma.feeTransaction.findMany({
      where: {
        ...(method ? { source: method } : {}),
        ...(from || toEnd ? { createdAt: { ...(from ? { gte: from } : {}), ...(toEnd ? { lt: toEnd } : {}) } } : {})
      },
      orderBy: { createdAt: 'desc' },
      take: 2000,
      include: { student: { select: { firstName: true, lastName: true, admissionNumber: true } } }
    });

    const recorderIds = [...new Set(txs.map((t) => t.recordedById).filter((id): id is string => !!id))];
    const recorders = await prisma.user.findMany({ where: { id: { in: recorderIds } }, select: { id: true, firstName: true, lastName: true } });
    const recorderName = new Map(recorders.map((r) => [r.id, fullName(r)]));

    res.json({
      transactions: txs.map((t) => ({
        id: t.id,
        studentId: t.studentId,
        studentName: fullName(t.student),
        admissionNumber: t.student?.admissionNumber ?? null,
        amount: t.amount,
        method: t.source,
        receiptNumber: t.receiptNumber,
        status: t.status,
        recordedBy: t.recordedById ? recorderName.get(t.recordedById) ?? 'Staff' : 'M-Pesa (automatic)',
        date: t.createdAt
      }))
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================================
// POST /api/finance/billing — override the term bill for a class or chosen students (bursaries,
// adjustments). Overridden bills ignore later fee-structure changes until reverted with useStructure.
// ============================================================
const billingSchema = z
  .object({
    term: z.string().trim().min(1).max(40),
    amount: z.coerce.number().min(0).max(10_000_000).optional(),
    /** Drop the override and bill from the class's published fee structure again */
    useStructure: z.boolean().optional(),
    reason: z.string().trim().max(300).optional(),
    classId: z.string().min(1).optional(),
    studentIds: z.array(z.string().min(1)).max(5000).optional()
  })
  .refine((b) => b.classId || b.studentIds?.length, { message: 'Choose a class or at least one student' })
  .refine((b) => b.useStructure || b.amount !== undefined, { message: 'Enter the amount to bill' });

router.post('/billing', ...financeStaff, async (req: AuthRequest, res) => {
  const parsed = billingSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid billing request' });
  }
  const { term, amount, useStructure, reason, classId, studentIds } = parsed.data;

  try {
    const students = await prisma.user.findMany({
      where: {
        role: 'STUDENT',
        status: { in: [...BILLABLE_STATUSES] },
        ...(classId ? { classId } : { id: { in: studentIds ?? [] } })
      },
      select: { id: true }
    });
    if (students.length === 0) {
      return res.status(400).json({ error: 'No billable students matched' });
    }

    let created = 0;
    let updated = 0;
    await prisma.$transaction(async (tx) => {
      for (const s of students) {
        const existing = await tx.feeRecord.findFirst({ where: { studentId: s.id, term }, orderBy: { createdAt: 'asc' } });

        if (useStructure) {
          if (existing?.manualOverride) {
            await tx.feeRecord.update({ where: { id: existing.id }, data: { manualOverride: false } });
            updated++;
          }
          continue;
        }

        if (existing) {
          await tx.feeRecord.update({ where: { id: existing.id }, data: { totalBilled: amount!, manualOverride: true } });
          updated++;
        } else {
          await tx.feeRecord.create({ data: { studentId: s.id, term, totalBilled: amount!, amountPaid: 0, manualOverride: true } });
          created++;
        }
        await reallocatePayments(tx, s.id);
      }

      if (useStructure) {
        // Re-bill from the structure (only affects the current term, which is what structures bill)
        for (const s of students) await ensureStudentBilled(tx, s.id);
      }

      const target = classId ? `class ${(await tx.class.findUnique({ where: { id: classId }, select: { name: true } }))?.name ?? classId}` : `${students.length} student(s)`;
      await tx.auditLog.create({
        data: {
          actorId: req.user!.id,
          action: useStructure ? 'FEE_OVERRIDE_REMOVED' : 'FEE_BILLING_OVERRIDE',
          details: useStructure
            ? `Reverted ${term} bills for ${target} to the fee structure`
            : `Set ${term} fee to KES ${amount} for ${target} (${created} new, ${updated} updated)${reason ? `: ${reason}` : ''}`
        }
      });
    }, FEE_TX);

    res.json({ billed: students.length, created, updated });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================================
// Prompt parent (§4.2): SMS the current balance to the student's parents; logged as a FeeReminder
// ============================================================
router.post('/records/:studentId/prompt-parent', ...financeStaff, async (req: AuthRequest, res) => {
  try {
    const studentId = req.params.studentId as string;
    const [student, settings] = await Promise.all([
      prisma.user.findFirst({
        where: { id: studentId, role: 'STUDENT' },
        select: {
          firstName: true,
          lastName: true,
          admissionNumber: true,
          feeRecords: { select: { totalBilled: true, amountPaid: true } },
          childLinks: { select: { parent: { select: { phone: true } } } }
        }
      }),
      getSettings()
    ]);
    if (!student) return res.status(404).json({ error: 'Student not found' });

    const balance = Math.round(student.feeRecords.reduce((a, r) => a + r.totalBilled - r.amountPaid, 0) * 100) / 100;
    if (balance <= 0) return res.status(400).json({ error: 'This student has no outstanding balance.' });

    const phones = student.childLinks.map((l) => l.parent.phone).filter((p): p is string => !!p);
    if (phones.length === 0) return res.status(400).json({ error: 'No parent or guardian phone number is linked to this student.' });

    const studentName = fullName(student);
    const message = feeReminderText({ studentName, balance, term: settings.currentTerm, admissionNumber: student.admissionNumber });
    const sms = await sendSms(phones, message);

    const reminder = await prisma.feeReminder.create({
      data: {
        studentId,
        term: settings.currentTerm,
        balance,
        message,
        phones: sms.sent.length ? sms.sent : phones,
        status: sms.status,
        error: sms.error ?? null,
        sentById: req.user!.id
      }
    });
    await prisma.auditLog.create({
      data: {
        actorId: req.user!.id,
        action: 'FEE_REMINDER_SENT',
        targetId: studentId,
        details: `Balance KES ${balance.toLocaleString('en-KE')} · ${smsSummary(sms)}`
      }
    });

    if (sms.status !== 'SENT') return res.status(502).json({ error: `Reminder not delivered: ${sms.error ?? 'unknown error'}`, reminder });
    res.json({ message: smsSummary(sms), reminder });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/finance/records/:studentId/reminders — reminder history shown beside the student's payments
router.get('/records/:studentId/reminders', ...financeStaff, async (req: AuthRequest, res) => {
  try {
    const reminders = await prisma.feeReminder.findMany({
      where: { studentId: req.params.studentId as string },
      orderBy: { createdAt: 'desc' },
      take: 50
    });
    const senders = await prisma.user.findMany({
      where: { id: { in: [...new Set(reminders.map((r) => r.sentById))] } },
      select: { id: true, firstName: true, lastName: true }
    });
    const nameOf = new Map(senders.map((u) => [u.id, fullName(u)]));
    res.json(reminders.map((r) => ({ ...r, sentBy: nameOf.get(r.sentById) ?? null })));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================================
// Installment plans (§4.2): milestone tracking against each student's plan
// ============================================================

// GET /api/finance/payment-plans?term= — every billed student against their plan's milestones
router.get('/payment-plans', ...financeStaff, async (req: AuthRequest, res) => {
  try {
    const term = typeof req.query.term === 'string' && req.query.term !== 'ALL' ? req.query.term : undefined;
    res.json(await paymentPlansOverview(term));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/finance/payment-plans/templates — the plans offered at admission
router.put('/payment-plans/templates', ...financeStaff, async (req: AuthRequest, res) => {
  const parsed = paymentPlanSchema.safeParse(req.body?.plans);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid payment plans' });

  try {
    await getSettings();
    await prisma.$transaction([
      prisma.schoolSettings.update({ where: { id: 1 }, data: { paymentPlans: parsed.data } }),
      prisma.auditLog.create({
        data: {
          actorId: req.user!.id,
          action: 'SETTINGS_PAYMENT_PLANS_UPDATED',
          details: parsed.data.map((p) => `${p.name}: ${p.milestones.map((m) => `${m.percent}% by week ${m.week}`).join(', ')}`).join(' · ')
        }
      })
    ]);
    res.json({ plans: parsed.data });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/finance/records/:studentId/plan — move a student's bill for a term onto another plan
const planChangeSchema = z.object({ term: z.string().trim().min(1).max(40), plan: z.string().trim().min(1).max(30) });

router.patch('/records/:studentId/plan', ...financeStaff, async (req: AuthRequest, res) => {
  const parsed = planChangeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid plan change' });
  const studentId = req.params.studentId as string;
  const { term, plan } = parsed.data;

  try {
    if (!plansOf(await getSettings()).some((p) => p.code === plan)) return res.status(400).json({ error: 'Unknown payment plan' });
    const updated = await prisma.feeRecord.updateMany({ where: { studentId, term }, data: { paymentPlan: plan } });
    if (updated.count === 0) return res.status(404).json({ error: `This student has no bill for ${term} yet` });

    await prisma.auditLog.create({
      data: { actorId: req.user!.id, action: 'FEE_PAYMENT_PLAN_CHANGED', targetId: studentId, details: `${term} payment plan set to ${plan}` }
    });
    res.json({ message: 'Payment plan updated' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
