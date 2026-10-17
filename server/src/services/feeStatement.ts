import PDFDocument from 'pdfkit';
import { PaymentMethod } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { getSettings } from './grading';
import { FeeAccessResult, ensureStudentBilled, feeAccess, statementTerms, FEE_TX } from './fees';

const METHOD_LABEL: Record<PaymentMethod, string> = { MPESA: 'M-Pesa', BANK: 'Bank', CASH: 'Cash' };

export type FeeStatement = {
  student: { id: string; name: string; admissionNumber: string | null; className: string | null; status: string };
  currentTerm: string;
  generatedAt: Date;
  totalBilled: number;
  totalPaid: number;
  /** Positive = owed; negative = credit in the student's favour */
  balance: number;
  pendingBankClaims: number;
  terms: (ReturnType<typeof statementTerms>[number] & { items: { name: string; amount: number }[]; structureName: string | null })[];
  payments: { id: string; date: Date; amount: number; method: PaymentMethod; receiptNumber: string | null }[];
  access: { grades: FeeAccessResult; timetable: FeeAccessResult };
};

/** Everything a fee statement shows. Brings the current-term bill up to date with the class's fee structure first. */
export async function buildStatement(studentId: string): Promise<FeeStatement | null> {
  await prisma.$transaction((tx) => ensureStudentBilled(tx, studentId), FEE_TX);

  const [student, records, payments, pending, settings] = await Promise.all([
    prisma.user.findFirst({
      where: { id: studentId, role: 'STUDENT' },
      select: { id: true, firstName: true, lastName: true, admissionNumber: true, status: true, class: { select: { name: true } } }
    }),
    prisma.feeRecord.findMany({
      where: { studentId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      include: { feeStructure: { select: { name: true, items: { orderBy: { sortOrder: 'asc' }, select: { name: true, amount: true } } } } }
    }),
    prisma.feeTransaction.findMany({ where: { studentId }, orderBy: { createdAt: 'asc' } }),
    prisma.bankPaymentClaim.aggregate({ where: { studentId, status: 'PENDING' }, _sum: { amount: true } }),
    getSettings()
  ]);
  if (!student) return null;

  const [grades, timetable] = await Promise.all([feeAccess(studentId, 'Grades'), feeAccess(studentId, 'Timetable')]);

  // Label the statement with a term the student was actually billed for, even if the school's current-term setting lags behind
  const currentTerm =
    !records.length || records.some((r) => r.term === settings.currentTerm) ? settings.currentTerm : records[records.length - 1]!.term;
  const lines = statementTerms(records);
  const totalBilled = records.reduce((a, r) => a + r.totalBilled, 0);
  const totalPaid = records.reduce((a, r) => a + r.amountPaid, 0);

  return {
    student: {
      id: student.id,
      name: [student.firstName, student.lastName].filter(Boolean).join(' ') || 'Student',
      admissionNumber: student.admissionNumber,
      className: student.class?.name ?? null,
      status: student.status
    },
    currentTerm,
    generatedAt: new Date(),
    totalBilled,
    totalPaid,
    balance: Math.round((totalBilled - totalPaid) * 100) / 100,
    pendingBankClaims: pending._sum.amount ?? 0,
    terms: lines.map((line, i) => {
      const r = records[i]!;
      const fromStructure = r.feeStructure && !r.manualOverride;
      return {
        ...line,
        structureName: fromStructure ? r.feeStructure!.name : null,
        items: fromStructure
          ? r.feeStructure!.items
          : r.totalBilled > 0
            ? [{ name: r.manualOverride ? 'Term fees (adjusted by the finance office)' : 'Term fees', amount: r.totalBilled }]
            : []
      };
    }),
    payments: payments.map((p) => ({ id: p.id, date: p.createdAt, amount: p.amount, method: p.source, receiptNumber: p.receiptNumber })),
    access: { grades, timetable }
  };
}

const kes = (n: number) => `KES ${Math.round(n).toLocaleString('en-KE')}`;
const day = (d: Date) => d.toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' });

/** A4 PDF: header, summary, per-term breakdown with balances brought/carried forward, then every payment. */
export function renderStatementPdf(s: FeeStatement): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50, info: { Title: `Fee statement - ${s.student.name}` } });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const left = doc.page.margins.left;
    const right = doc.page.width - doc.page.margins.right;
    const width = right - left;
    const grey = '#6b7280';
    const dark = '#111827';

    const ensureSpace = (h: number) => {
      if (doc.y + h > doc.page.height - doc.page.margins.bottom) doc.addPage();
    };
    const row = (label: string, value: string, opts: { bold?: boolean; color?: string; indent?: number } = {}) => {
      ensureSpace(18);
      const y = doc.y;
      doc.font(opts.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(10).fillColor(opts.color ?? dark);
      doc.text(label, left + (opts.indent ?? 0), y, { width: width * 0.65 - (opts.indent ?? 0) });
      doc.text(value, left + width * 0.65, y, { width: width * 0.35, align: 'right' });
      doc.moveDown(0.35);
    };
    const rule = () => {
      ensureSpace(10);
      doc.moveTo(left, doc.y).lineTo(right, doc.y).strokeColor('#e5e7eb').lineWidth(1).stroke();
      doc.moveDown(0.5);
    };
    const heading = (text: string) => {
      ensureSpace(40);
      doc.moveDown(0.8).font('Helvetica-Bold').fontSize(12).fillColor(dark).text(text, left);
      doc.moveDown(0.4);
    };

    // Header
    doc.font('Helvetica-Bold').fontSize(18).fillColor(dark).text(process.env.SCHOOL_NAME || 'School Fees', left);
    doc.font('Helvetica').fontSize(11).fillColor(grey).text('Fee Statement');
    doc.moveDown(0.8);

    row('Student', s.student.name, { bold: true });
    if (s.student.admissionNumber) row('Admission number', s.student.admissionNumber);
    if (s.student.className) row('Class', s.student.className);
    row('Current term', s.currentTerm);
    row('Statement date', day(s.generatedAt));
    rule();

    // Summary
    heading('Summary');
    row('Total fees billed', kes(s.totalBilled));
    row('Total paid', kes(s.totalPaid), { color: '#047857' });
    if (s.balance >= 0) row('Balance remaining', kes(s.balance), { bold: true, color: s.balance > 0 ? '#b91c1c' : dark });
    else row('Credit (overpaid)', kes(-s.balance), { bold: true, color: '#1d4ed8' });
    if (s.pendingBankClaims > 0) row('Bank payments awaiting verification (not yet included)', kes(s.pendingBankClaims), { color: grey });
    const cleared = s.totalBilled > 0 ? Math.min(100, Math.round((s.totalPaid / s.totalBilled) * 100)) : 100;
    row('Fees cleared', `${cleared}%`);

    // Terms
    heading('Breakdown by term');
    if (!s.terms.length) doc.font('Helvetica').fontSize(10).fillColor(grey).text('No fees have been billed yet.');
    for (const t of s.terms) {
      ensureSpace(80);
      doc.font('Helvetica-Bold').fontSize(11).fillColor(dark).text(t.term + (t.structureName ? `  ·  ${t.structureName}` : ''), left);
      doc.moveDown(0.3);
      if (t.broughtForward !== 0) {
        row(t.broughtForward > 0 ? 'Balance brought forward' : 'Credit brought forward', kes(Math.abs(t.broughtForward)), { color: grey });
      }
      for (const item of t.items) row(item.name, kes(item.amount), { indent: 10 });
      row('Term fees', kes(t.billed), { bold: true });
      row('Paid towards this term', kes(t.paid), { color: '#047857' });
      const owed = t.carriedForward;
      row(owed > 0 ? 'Balance carried forward' : owed < 0 ? 'Credit carried forward' : 'Cleared', owed === 0 ? '—' : kes(Math.abs(owed)), {
        bold: true,
        color: owed > 0 ? '#b91c1c' : owed < 0 ? '#1d4ed8' : '#047857'
      });
      rule();
    }

    // Payments
    heading('Payments received');
    if (!s.payments.length) {
      doc.font('Helvetica').fontSize(10).fillColor(grey).text('No payments yet.');
    } else {
      for (const p of s.payments) {
        row(`${day(p.date)}  ·  ${METHOD_LABEL[p.method]}${p.receiptNumber ? `  ·  ${p.receiptNumber}` : ''}`, kes(p.amount));
      }
      rule();
      row('Total paid', kes(s.totalPaid), { bold: true });
    }

    doc.moveDown(1.5);
    ensureSpace(30);
    doc
      .font('Helvetica')
      .fontSize(8)
      .fillColor(grey)
      .text(
        'Payments are applied to the oldest outstanding term first. Unpaid balances are carried forward to the next term until cleared. ' +
          'This statement was generated by the school portal and does not require a signature.',
        left,
        doc.y,
        { width }
      );

    doc.end();
  });
}
