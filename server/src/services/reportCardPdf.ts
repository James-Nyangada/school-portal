import PDFDocument from 'pdfkit';
import { prisma } from '../lib/prisma';
import { getSchoolProfile } from './school';

/** Renders a professional A4 report card as a PDF buffer using PDFKit. */
export async function renderReportCardPdf(reportCardId: string): Promise<Buffer> {
  const card = await prisma.reportCard.findUnique({
    where: { id: reportCardId },
    include: {
      student: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          admissionNumber: true,
          class: { select: { id: true, name: true } }
        }
      },
      subjectGrades: {
        include: {
          subject: { select: { id: true, name: true, code: true } }
        }
      }
    }
  });

  if (!card) {
    throw new Error('Report card not found');
  }

  const profile = await getSchoolProfile().catch(() => null);
  const schoolName = profile?.name || process.env.SCHOOL_NAME || 'School Academy';
  const schoolAddress = profile?.postalAddress || profile?.physicalAddress || '';
  const schoolEmail = profile?.email || '';
  const schoolPhone = profile?.phone || '';

  // Get total class student count for rank display
  let classSize = 0;
  if (card.student.class?.id) {
    classSize = await prisma.user.count({
      where: { classId: card.student.class.id, role: 'STUDENT', status: 'ACTIVE' }
    });
  }

  // Sort subjects alphabetically
  const subjects = [...card.subjectGrades].sort((a, b) => a.subject.name.localeCompare(b.subject.name));

  // Compute average if numeric grades exist
  const numericScores = subjects
    .map((s) => {
      const match = s.gradeValue.match(/^(\d+(?:\.\d+)?)/);
      return match?.[1] ? parseFloat(match[1]) : NaN;
    })
    .filter((n) => !isNaN(n));

  const averageScore =
    numericScores.length > 0 ? (numericScores.reduce((a, b) => a + b, 0) / numericScores.length).toFixed(1) : null;

  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 40 });
    const chunks: Buffer[] = [];

    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const dark = '#111827';
    const grey = '#4B5563';
    const lightGrey = '#9CA3AF';
    const primary = '#1E3A8A';
    const borderGrey = '#E5E7EB';

    const pageWidth = doc.page.width - 80;
    const startX = 40;

    // Outer Decorative Border
    doc
      .rect(startX - 10, 30, pageWidth + 20, doc.page.height - 60)
      .lineWidth(1)
      .strokeColor(borderGrey)
      .stroke();

    // Header section
    doc
      .font('Helvetica-Bold')
      .fontSize(20)
      .fillColor(primary)
      .text(schoolName.toUpperCase(), startX, 48, { align: 'center', width: pageWidth });

    const contactLine = [schoolAddress, schoolPhone, schoolEmail].filter(Boolean).join('  |  ');
    if (contactLine) {
      doc
        .font('Helvetica')
        .fontSize(9)
        .fillColor(grey)
        .text(contactLine, startX, doc.y + 2, { align: 'center', width: pageWidth });
    }

    doc.moveDown(0.5);
    doc
      .font('Helvetica-Bold')
      .fontSize(13)
      .fillColor(dark)
      .text(`OFFICIAL STUDENT REPORT CARD — ${card.term.toUpperCase()}`, startX, doc.y, {
        align: 'center',
        width: pageWidth
      });

    doc.moveDown(0.8);

    // Student Info Box
    const infoY = doc.y;
    doc.rect(startX, infoY, pageWidth, 54).fillColor('#F9FAFB').fill().strokeColor(borderGrey).stroke();

    const col1 = startX + 15;
    const col2 = startX + 260;
    const studentFullName = [card.student.firstName, card.student.lastName].filter(Boolean).join(' ') || 'Student';

    doc.font('Helvetica-Bold').fontSize(9).fillColor(dark);
    doc.text('Student Name:', col1, infoY + 10);
    doc.font('Helvetica').text(studentFullName, col1 + 80, infoY + 10);

    doc.font('Helvetica-Bold').text('Admission No:', col1, infoY + 28);
    doc.font('Helvetica').text(card.student.admissionNumber || '—', col1 + 80, infoY + 28);

    doc.font('Helvetica-Bold').text('Class / Stream:', col2, infoY + 10);
    doc.font('Helvetica').text(card.student.class?.name || '—', col2 + 85, infoY + 10);

    doc.font('Helvetica-Bold').text('Academic Term:', col2, infoY + 28);
    doc.font('Helvetica').text(card.term, col2 + 85, infoY + 28);

    doc.y = infoY + 68;

    // Performance Summary Line
    doc.font('Helvetica-Bold').fontSize(11).fillColor(primary).text('Academic Performance', startX);
    doc.moveDown(0.4);

    // Subjects Table Header
    const tableTop = doc.y;
    const subColWidth = 180;
    const gradeColWidth = 110;
    const remarksColWidth = pageWidth - subColWidth - gradeColWidth;

    doc.rect(startX, tableTop, pageWidth, 22).fillColor('#EEF2FF').fill().strokeColor('#C7D2FE').stroke();

    doc.font('Helvetica-Bold').fontSize(9).fillColor(primary);
    doc.text('SUBJECT', startX + 10, tableTop + 6, { width: subColWidth });
    doc.text('SCORE / LEVEL', startX + subColWidth + 10, tableTop + 6, { width: gradeColWidth });
    doc.text('TEACHER REMARK', startX + subColWidth + gradeColWidth + 10, tableTop + 6, { width: remarksColWidth });

    let currentY = tableTop + 22;

    // Subjects Rows
    subjects.forEach((s, idx) => {
      const rowHeight = 24;
      const isAlt = idx % 2 === 1;

      if (isAlt) {
        doc.rect(startX, currentY, pageWidth, rowHeight).fillColor('#FAFAFA').fill();
      }

      doc.rect(startX, currentY, pageWidth, rowHeight).strokeColor(borderGrey).stroke();

      doc.font('Helvetica-Bold').fontSize(9).fillColor(dark);
      const subjectTitle = s.subject.code ? `${s.subject.name} (${s.subject.code})` : s.subject.name;
      doc.text(subjectTitle, startX + 10, currentY + 7, { width: subColWidth - 15, ellipsis: true });

      doc.font('Helvetica').fontSize(9).fillColor(dark);
      doc.text(s.gradeValue, startX + subColWidth + 10, currentY + 7, { width: gradeColWidth - 15 });

      doc.font('Helvetica').fontSize(8.5).fillColor(grey);
      doc.text(s.teacherRemark || '—', startX + subColWidth + gradeColWidth + 10, currentY + 7, {
        width: remarksColWidth - 15,
        ellipsis: true
      });

      currentY += rowHeight;
    });

    doc.y = currentY + 12;

    // Summary Box (Total, Average, Rank)
    const summaryBoxY = doc.y;
    doc.rect(startX, summaryBoxY, pageWidth, 42).fillColor('#F3F4F6').fill().strokeColor(borderGrey).stroke();

    const sumCol1 = startX + 20;
    const sumCol2 = startX + 190;
    const sumCol3 = startX + 360;

    doc.font('Helvetica-Bold').fontSize(9).fillColor(dark);
    doc.text('Total Score:', sumCol1, summaryBoxY + 15);
    doc
      .font('Helvetica-Bold')
      .fontSize(11)
      .fillColor(primary)
      .text(card.totalScore != null ? card.totalScore.toFixed(0) : '—', sumCol1 + 70, summaryBoxY + 14);

    doc.font('Helvetica-Bold').fontSize(9).fillColor(dark);
    doc.text('Mean Average:', sumCol2, summaryBoxY + 15);
    doc
      .font('Helvetica-Bold')
      .fontSize(11)
      .fillColor(primary)
      .text(averageScore ? `${averageScore}%` : 'CBC Assessment', sumCol2 + 80, summaryBoxY + 14);

    doc.font('Helvetica-Bold').fontSize(9).fillColor(dark);
    doc.text('Class Position:', sumCol3, summaryBoxY + 15);
    const rankText = card.rank != null ? (classSize > 0 ? `${card.rank} of ${classSize}` : `#${card.rank}`) : '—';
    doc.font('Helvetica-Bold').fontSize(11).fillColor(primary).text(rankText, sumCol3 + 80, summaryBoxY + 14);

    doc.y = summaryBoxY + 55;

    // Remarks and sign-off: only remarks the school actually entered are printed
    doc.moveDown(0.8);
    const signBoxY = doc.y;

    doc.rect(startX, signBoxY, pageWidth, 75).strokeColor(borderGrey).stroke();

    doc.font('Helvetica-Bold').fontSize(9).fillColor(dark);
    doc.text("Principal's Remarks:", startX + 12, signBoxY + 10);
    doc
      .font('Helvetica')
      .fontSize(9)
      .fillColor(grey)
      .text(card.adminRemark || '', startX + 140, signBoxY + 10, { width: pageWidth - 160, height: 40, ellipsis: true });

    const sigLineY = signBoxY + 60;
    doc.font('Helvetica').fontSize(8).fillColor(lightGrey);
    doc.text(`Generated: ${new Date().toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })}`, startX + 12, sigLineY);
    doc.text('Class Teacher Signature: _______________________', startX + 180, sigLineY);
    doc.text('School Stamp:', startX + 380, sigLineY);

    doc.end();
  });
}
