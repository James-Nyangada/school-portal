import PDFDocument from 'pdfkit';
import { ClearanceRequest } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { feeAccess } from './fees';
import { getSchoolProfile } from './school';

/** school-dashboard-spec §3.7 requestClearance: fees fully paid, no library or disciplinary hold. */
export function clearanceOutcome(input: { balance: number; libraryHold: boolean; disciplinaryHold: boolean }) {
  const blockers: string[] = [];
  if (input.balance > 0) blockers.push(`Fee balance of KES ${input.balance.toLocaleString('en-KE')} must be cleared before certificate release`);
  if (input.libraryHold) blockers.push('Library items are still outstanding');
  if (input.disciplinaryHold) blockers.push('A disciplinary hold is in place');
  return { cleared: blockers.length === 0, blockers };
}

/** A clearance request with its live fee position and whether it can be released now. */
export async function clearanceStatus(request: ClearanceRequest) {
  const fees = await feeAccess(request.studentId, 'Certificates');
  return { ...request, balance: fees.balance, percentPaid: fees.percentPaid, ...clearanceOutcome({ balance: fees.balance, ...request }) };
}

/** Next leaving certificate number for the year, e.g. LC-2026-0007. */
export async function nextCertificateNumber(year = new Date().getFullYear()) {
  const prefix = `LC-${year}-`;
  const last = await prisma.clearanceRequest.findFirst({
    where: { certificateNumber: { startsWith: prefix } },
    orderBy: { certificateNumber: 'desc' },
    select: { certificateNumber: true }
  });
  const n = last?.certificateNumber ? Number(last.certificateNumber.slice(prefix.length)) + 1 : 1;
  return `${prefix}${String(n).padStart(4, '0')}`;
}

const longDate = (d: Date) => d.toLocaleDateString('en-KE', { day: 'numeric', month: 'long', year: 'numeric' });

/** The leaving certificate for a released clearance. */
export async function renderLeavingCertificate(requestId: string): Promise<Buffer | null> {
  const request = await prisma.clearanceRequest.findUnique({
    where: { id: requestId },
    include: {
      student: { select: { firstName: true, lastName: true, admissionNumber: true, nemisNumber: true, createdAt: true, class: { select: { name: true } } } }
    }
  });
  if (!request || request.status !== 'RELEASED' || !request.releasedAt) return null;
  const profile = await getSchoolProfile();
  const s = request.student;
  const name = [s.firstName, s.lastName].filter(Boolean).join(' ') || 'Student';

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 56 });
    const chunks: Buffer[] = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const left = doc.page.margins.left;
    const width = doc.page.width - left - doc.page.margins.right;
    const dark = '#111827';
    const grey = '#4b5563';

    doc.rect(36, 36, doc.page.width - 72, doc.page.height - 72).lineWidth(1.5).strokeColor('#1e3a8a').stroke();

    doc.moveDown(1.5);
    doc.font('Helvetica-Bold').fontSize(20).fillColor('#1e3a8a').text((profile.name || process.env.SCHOOL_NAME || 'School').toUpperCase(), left, doc.y, { width, align: 'center' });
    const contact = [profile.postalAddress, profile.phone, profile.email].filter(Boolean).join('  ·  ');
    if (contact) doc.font('Helvetica').fontSize(9).fillColor(grey).text(contact, { width, align: 'center' });
    if (profile.motto) doc.font('Helvetica-Oblique').fontSize(9).text(profile.motto, { width, align: 'center' });

    doc.moveDown(2);
    doc.font('Helvetica-Bold').fontSize(16).fillColor(dark).text('SCHOOL LEAVING CERTIFICATE', { width, align: 'center' });
    doc.font('Helvetica').fontSize(10).fillColor(grey).text(`Certificate No. ${request.certificateNumber}`, { width, align: 'center' });

    doc.moveDown(2);
    const field = (label: string, value: string) => {
      const y = doc.y;
      doc.font('Helvetica-Bold').fontSize(11).fillColor(dark).text(label, left, y, { width: 170 });
      doc.font('Helvetica').text(value, left + 170, y, { width: width - 170 });
      doc.moveDown(0.6);
    };
    field('Name of student', name);
    field('Admission number', s.admissionNumber || '—');
    if (s.nemisNumber) field('NEMIS / UPI number', s.nemisNumber);
    field('Date of admission', longDate(s.createdAt));
    field('Last class attended', s.class?.name || '—');
    field('Reason for leaving', request.leavingStatus === 'TRANSFERRED' ? 'Transfer to another school' : 'Completed studies');
    field('Date of leaving', longDate(request.releasedAt!));

    doc.moveDown(1.5);
    doc
      .font('Helvetica')
      .fontSize(11)
      .fillColor(dark)
      .text(
        `This is to certify that the above-named student has been cleared by the school: all fees have been paid and no library or disciplinary matters are outstanding.`,
        left,
        doc.y,
        { width, align: 'justify' }
      );

    doc.moveDown(4);
    const y = doc.y;
    doc.moveTo(left, y).lineTo(left + 200, y).strokeColor(grey).lineWidth(0.8).stroke();
    doc.moveTo(left + width - 200, y).lineTo(left + width, y).stroke();
    doc.font('Helvetica').fontSize(10).fillColor(grey);
    doc.text(profile.principalName ? `${profile.principalName}, ${profile.principalTitle || 'Principal'}` : 'Principal', left, y + 6, { width: 200 });
    doc.text('School stamp', left + width - 200, y + 6, { width: 200, align: 'right' });

    doc.font('Helvetica').fontSize(8).fillColor(grey).text(`Issued ${longDate(request.releasedAt!)} through the school portal.`, left, doc.page.height - 90, {
      width,
      align: 'center'
    });
    doc.end();
  });
}
