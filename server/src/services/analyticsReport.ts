import PDFDocument from 'pdfkit';
import { chronicAbsentees, comparison, performance } from './analytics';
import { getSchoolProfile } from './school';

const kes = (n: number) => `KES ${Math.round(n).toLocaleString('en-KE')}`;
const pct = (n: number | null) => (n === null ? '—' : `${n}%`);
// Built-in PDF fonts have no arrow glyphs, so trends are written as signed numbers
const delta = (n: number | null, unit = '') => (n === null ? '—' : n > 0 ? `up ${n}${unit}` : n < 0 ? `down ${-n}${unit}` : 'no change');

/**
 * Term report for board meetings (dashboard spec §2.6): headline figures with their trend against the
 * previous term, subject and class performance, fee collection, and chronic absence counts per class.
 * Individual absentees are not named: the report leaves the school.
 */
export async function renderBoardReport(term?: string): Promise<Buffer> {
  const [cmp, perf, absentees, profile] = await Promise.all([comparison(term), performance(term), chronicAbsentees(), getSchoolProfile()]);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 48 });
    const chunks: Buffer[] = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const left = doc.page.margins.left;
    const right = doc.page.width - doc.page.margins.right;
    const width = right - left;
    const grey = '#6b7280';
    const dark = '#111827';
    const green = '#047857';
    const red = '#b91c1c';

    const ensureSpace = (h: number) => {
      if (doc.y + h > doc.page.height - doc.page.margins.bottom) doc.addPage();
    };
    const heading = (text: string) => {
      ensureSpace(48);
      doc.moveDown(0.8).font('Helvetica-Bold').fontSize(12).fillColor(dark).text(text, left);
      doc.moveDown(0.3);
    };
    const note = (text: string) => doc.font('Helvetica').fontSize(9).fillColor(grey).text(text, left, doc.y, { width });
    /** One table row; columns are [label, ...values] with the label taking the remaining width. */
    const row = (cells: string[], opts: { bold?: boolean; colors?: (string | undefined)[] } = {}) => {
      ensureSpace(18);
      const y = doc.y;
      const valueWidth = 90;
      const labelWidth = width - valueWidth * (cells.length - 1);
      doc.font(opts.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9.5);
      cells.forEach((c, i) => {
        doc.fillColor(opts.colors?.[i] ?? dark);
        if (i === 0) doc.text(c, left, y, { width: labelWidth - 8 });
        else doc.text(c, left + labelWidth + valueWidth * (i - 1), y, { width: valueWidth, align: 'right' });
      });
      doc.y = Math.max(doc.y, y + 14);
      doc.moveDown(0.2);
    };
    const trendColor = (n: number | null) => (n === null || n === 0 ? grey : n > 0 ? green : red);

    // Header
    doc.font('Helvetica-Bold').fontSize(18).fillColor(dark).text(profile.name || process.env.SCHOOL_NAME || 'School', left);
    doc.font('Helvetica').fontSize(11).fillColor(grey).text(`Term report · ${cmp.term}${cmp.previousTerm ? ` compared with ${cmp.previousTerm}` : ''}`);
    doc.text(`Generated ${new Date().toLocaleDateString('en-KE', { day: 'numeric', month: 'long', year: 'numeric' })}`);

    heading('Headline figures');
    row(['', cmp.term, cmp.previousTerm ?? 'Previous', 'Change'], { bold: true, colors: [grey, grey, grey, grey] });
    row(['Average score (published numeric grades)', pct(cmp.averageScore.current), pct(cmp.averageScore.previous), delta(cmp.averageScore.change, ' pts')], {
      colors: [undefined, undefined, grey, trendColor(cmp.averageScore.change)]
    });
    row(['Attendance rate', pct(cmp.attendanceRate.current), pct(cmp.attendanceRate.previous), delta(cmp.attendanceRate.change, ' pts')], {
      colors: [undefined, undefined, grey, trendColor(cmp.attendanceRate.change)]
    });
    row(['Fee collection rate', pct(cmp.collectionRate.current), pct(cmp.collectionRate.previous), delta(cmp.collectionRate.change, ' pts')], {
      colors: [undefined, undefined, grey, trendColor(cmp.collectionRate.change)]
    });
    if (cmp.attendanceRate.current === null) note('Attendance needs the term\'s opening and closing dates in School Settings → Academic Calendar.');

    heading('Performance by subject');
    if (!perf.subjects.length) note('No published numeric grades for this term.');
    else {
      row(['Subject', 'Average', perf.previousTerm ?? 'Previous', 'Change'], { bold: true, colors: [grey, grey, grey, grey] });
      for (const s of perf.subjects) {
        row([s.name, pct(s.average), pct(s.previousAverage), delta(s.change, ' pts')], { colors: [undefined, undefined, grey, trendColor(s.change)] });
      }
    }

    heading('Performance by class');
    if (!perf.classes.length) note('No published numeric grades for this term.');
    else {
      row(['Class', 'Average', perf.previousTerm ?? 'Previous', 'Change'], { bold: true, colors: [grey, grey, grey, grey] });
      for (const c of perf.classes) {
        row([c.name, pct(c.average), pct(c.previousAverage), delta(c.change, ' pts')], { colors: [undefined, undefined, grey, trendColor(c.change)] });
      }
    }

    heading('Fee collection');
    row(['', cmp.term, cmp.previousTerm ?? 'Previous'], { bold: true, colors: [grey, grey, grey] });
    row(['Billed', kes(cmp.fees.current.billed), kes(cmp.fees.previous.billed)]);
    row(['Collected', kes(cmp.fees.current.collected), kes(cmp.fees.previous.collected)], { colors: [undefined, green, grey] });
    row(['Outstanding', kes(cmp.fees.current.billed - cmp.fees.current.collected), kes(cmp.fees.previous.billed - cmp.fees.previous.collected)], {
      colors: [undefined, red, grey]
    });

    heading(`Chronic absence · ${absentees.month}`);
    if (!absentees.students.length) note('No students below the attendance threshold this month.');
    else {
      const perClass = new Map<string, number>();
      for (const s of absentees.students) perClass.set(s.className ?? 'No class', (perClass.get(s.className ?? 'No class') ?? 0) + 1);
      row(['Class', 'Students'], { bold: true, colors: [grey, grey] });
      for (const [name, n] of [...perClass].sort((a, b) => b[1] - a[1])) row([name, String(n)]);
      row(['Total', String(absentees.students.length)], { bold: true });
      note(`Counted when attendance this month is under ${absentees.threshold}% or a student missed ${absentees.streak}+ lessons in a row.`);
    }

    doc.moveDown(1.5);
    ensureSpace(30);
    note('All figures are computed from the portal\'s live grade, attendance and fee records at the time this report was generated.');
    doc.end();
  });
}
