import PDFDocument from 'pdfkit';
import { NewsletterAudience, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { BILLABLE_STATUSES } from './fees';

// ============================================================
// Content: a Tiptap document limited to what both the portal and the PDF render
// ============================================================

export type TNode = {
  type: string;
  attrs?: Record<string, unknown>;
  content?: TNode[];
  text?: string;
  marks?: { type: string; attrs?: Record<string, unknown> }[];
};

const BLOCKS = new Set(['paragraph', 'heading', 'bulletList', 'orderedList', 'listItem', 'blockquote', 'horizontalRule']);
const INLINE = new Set(['text', 'hardBreak']);
const MARKS = new Set(['bold', 'italic', 'underline', 'strike', 'link']);
const ALIGNS = new Set(['left', 'center', 'right', 'justify']);

const safeHref = (href: unknown) =>
  typeof href === 'string' && /^(https?:\/\/|mailto:)/i.test(href.trim()) ? href.trim() : null;

function cleanNode(n: unknown): TNode | null {
  if (!n || typeof n !== 'object') return null;
  const node = n as TNode;

  if (node.type === 'text') {
    if (typeof node.text !== 'string' || !node.text) return null;
    const marks = (node.marks ?? [])
      .filter((m) => MARKS.has(m?.type))
      .map((m) => {
        if (m.type !== 'link') return { type: m.type };
        const href = safeHref(m.attrs?.href);
        return href ? { type: 'link', attrs: { href, target: '_blank', rel: 'noopener noreferrer nofollow' } } : null;
      })
      .filter((m): m is NonNullable<typeof m> => m !== null);
    return { type: 'text', text: node.text, ...(marks.length ? { marks } : {}) };
  }

  if (node.type === 'hardBreak') return { type: 'hardBreak' };
  if (!BLOCKS.has(node.type)) return null;

  const attrs: Record<string, unknown> = {};
  if (node.type === 'heading') attrs.level = Math.min(3, Math.max(1, Number(node.attrs?.level) || 1));
  if (node.type === 'paragraph' || node.type === 'heading') {
    attrs.textAlign = ALIGNS.has(String(node.attrs?.textAlign)) ? node.attrs!.textAlign : 'left';
  }
  if (node.type === 'orderedList') attrs.start = Math.max(1, Number(node.attrs?.start) || 1);

  const content = (node.content ?? []).map(cleanNode).filter((c): c is TNode => c !== null);
  return { type: node.type, ...(Object.keys(attrs).length ? { attrs } : {}), ...(content.length ? { content } : {}) };
}

/** Strips anything the newsletter renderers don't support (unknown nodes, unsafe links). Null when not a document. */
export function cleanContent(doc: unknown): TNode | null {
  if (!doc || typeof doc !== 'object' || (doc as TNode).type !== 'doc') return null;
  const content = ((doc as TNode).content ?? []).map(cleanNode).filter((c): c is TNode => c !== null && !INLINE.has(c.type));
  return { type: 'doc', content };
}

/** The document as plain text, e.g. for previews. */
export function plainText(node: TNode, max = Infinity): string {
  const parts: string[] = [];
  const walk = (n: TNode) => {
    if (n.type === 'text') parts.push(n.text ?? '');
    else if (n.type === 'hardBreak') parts.push(' ');
    n.content?.forEach(walk);
    if (BLOCKS.has(n.type)) parts.push(' ');
  };
  walk(node);
  const text = parts.join('').replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

export const isEmptyContent = (doc: TNode) => plainText(doc).length === 0;

// ============================================================
// Audience
// ============================================================

export const AUDIENCE_LABEL: Record<NewsletterAudience, string> = {
  ALL_STUDENTS: 'All students',
  CLASS_STUDENTS: 'Students of a class',
  ALL_TEACHERS: 'All teachers',
  ALL_PARENTS: 'All parents',
  DEBTOR_PARENTS: 'Parents with unpaid fees',
  CLASS_PARENTS: 'Parents of a class',
};

export const needsClass = (a: NewsletterAudience) => a === 'CLASS_STUDENTS' || a === 'CLASS_PARENTS';

/** Current members of the school (not those who completed or transferred). */
const current = { status: { in: [...BILLABLE_STATUSES] } } satisfies Prisma.UserWhereInput;

const parentsOf = async (students: Prisma.UserWhereInput) =>
  prisma.user.findMany({
    where: { role: 'PARENT', ...current, parentLinks: { some: { student: { ...students, ...current } } } },
    select: { id: true },
  });

/** User ids the newsletter goes to. */
export async function resolveAudience(audience: NewsletterAudience, classId: string | null): Promise<string[]> {
  let users: { id: string }[] = [];

  switch (audience) {
    case 'ALL_STUDENTS':
    case 'ALL_TEACHERS':
    case 'ALL_PARENTS':
      users = await prisma.user.findMany({
        where: { role: audience === 'ALL_STUDENTS' ? 'STUDENT' : audience === 'ALL_TEACHERS' ? 'TEACHER' : 'PARENT', ...current },
        select: { id: true },
      });
      break;
    case 'CLASS_STUDENTS':
      users = await prisma.user.findMany({ where: { role: 'STUDENT', classId: classId!, ...current }, select: { id: true } });
      break;
    case 'CLASS_PARENTS':
      users = await parentsOf({ classId: classId! });
      break;
    case 'DEBTOR_PARENTS': {
      // Students whose total billed exceeds total paid, across all terms
      const totals = await prisma.feeRecord.groupBy({ by: ['studentId'], _sum: { totalBilled: true, amountPaid: true } });
      const debtorIds = totals
        .filter((t) => (t._sum.totalBilled ?? 0) - (t._sum.amountPaid ?? 0) > 0.005)
        .map((t) => t.studentId);
      users = debtorIds.length ? await parentsOf({ id: { in: debtorIds } }) : [];
      break;
    }
  }

  return [...new Set(users.map((u) => u.id))];
}

// ============================================================
// PDF: draws the same document the portal shows
// ============================================================

const FONT = { regular: 'Helvetica', bold: 'Helvetica-Bold', italic: 'Helvetica-Oblique', boldItalic: 'Helvetica-BoldOblique' };
const HEADING_SIZE: Record<number, number> = { 1: 20, 2: 16, 3: 13 };
const BODY = 11;
const DARK = '#111827';
const GREY = '#6b7280';
const LINK = '#2563eb';

export function renderNewsletterPdf(input: {
  schoolName: string;
  subject: string;
  date: Date;
  edited: boolean;
  content: TNode;
}): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 56, info: { Title: input.subject } });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const left = doc.page.margins.left;
    const fullWidth = doc.page.width - left - doc.page.margins.right;

    // Header
    doc.font(FONT.bold).fontSize(10).fillColor(GREY).text(input.schoolName.toUpperCase(), left, doc.y, { characterSpacing: 1 });
    doc.moveDown(0.3);
    doc.font(FONT.bold).fontSize(22).fillColor(DARK).text(input.subject);
    doc.moveDown(0.2);
    const dateLabel = input.date.toLocaleDateString('en-KE', { day: 'numeric', month: 'long', year: 'numeric' });
    doc.font(FONT.regular).fontSize(10).fillColor(GREY).text(input.edited ? `${dateLabel} · Updated` : dateLabel);
    doc.moveDown(0.6);
    doc.moveTo(left, doc.y).lineTo(left + fullWidth, doc.y).strokeColor('#e5e7eb').lineWidth(1).stroke();
    doc.moveDown(1);

    /** Writes a run of inline nodes as one flowing paragraph. */
    const inline = (nodes: TNode[], x: number, width: number, size: number, opts: { bold?: boolean; align?: string; color?: string | undefined }) => {
      const runs: { text: string; marks: Set<string>; href?: string | undefined }[] = [];
      for (const n of nodes) {
        if (n.type === 'hardBreak') runs.push({ text: '\n', marks: new Set() });
        else if (n.type === 'text') {
          const marks = new Set((n.marks ?? []).map((m) => m.type));
          const href = n.marks?.find((m) => m.type === 'link')?.attrs?.href as string | undefined;
          runs.push({ text: n.text ?? '', marks, href });
        }
      }
      if (runs.length === 0) runs.push({ text: ' ', marks: new Set() });

      const align = (opts.align ?? 'left') as 'left' | 'center' | 'right' | 'justify';
      doc.x = x;
      runs.forEach((r, i) => {
        const bold = opts.bold || r.marks.has('bold');
        const italic = r.marks.has('italic');
        doc
          .font(bold && italic ? FONT.boldItalic : bold ? FONT.bold : italic ? FONT.italic : FONT.regular)
          .fontSize(size)
          .fillColor(r.href ? LINK : (opts.color ?? DARK));
        const style = {
          continued: i < runs.length - 1,
          underline: r.marks.has('underline') || !!r.href,
          strike: r.marks.has('strike'),
          link: r.href ?? null,
        };
        // Layout options only on the first run: repeating them on continued text starts a new line
        if (i === 0) doc.text(r.text, x, doc.y, { ...style, width, align, lineGap: 3 });
        else doc.text(r.text, style);
      });
    };

    const block = (n: TNode, x: number, width: number, color?: string) => {
      const align = (n.attrs?.textAlign as string) ?? 'left';
      switch (n.type) {
        case 'paragraph':
          inline(n.content ?? [], x, width, BODY, { align, color });
          doc.moveDown(0.6);
          break;
        case 'heading': {
          const level = Number(n.attrs?.level) || 1;
          doc.moveDown(level === 1 ? 0.4 : 0.2);
          inline(n.content ?? [], x, width, HEADING_SIZE[level] ?? BODY, { bold: true, align, color });
          doc.moveDown(0.4);
          break;
        }
        case 'bulletList':
        case 'orderedList': {
          let index = Number(n.attrs?.start) || 1;
          for (const item of n.content ?? []) {
            const marker = n.type === 'bulletList' ? '•' : `${index++}.`;
            const y = doc.y;
            doc.font(FONT.regular).fontSize(BODY).fillColor(color ?? DARK).text(marker, x, y, { width: 18, align: 'right' });
            doc.y = y;
            (item.content ?? []).forEach((child, i) => {
              block(child, x + 24, width - 24, color);
              // Tighter spacing between a list item's paragraphs and the next item
              if (i === (item.content?.length ?? 0) - 1) doc.moveDown(-0.3);
            });
          }
          doc.moveDown(0.5);
          break;
        }
        case 'blockquote': {
          const top = doc.y;
          (n.content ?? []).forEach((child) => block(child, x + 16, width - 16, '#374151'));
          const bottom = doc.y - 6;
          doc.save().moveTo(x + 2, top).lineTo(x + 2, bottom).lineWidth(3).strokeColor('#d1d5db').stroke().restore();
          break;
        }
        case 'horizontalRule':
          doc.moveDown(0.3);
          doc.moveTo(x, doc.y).lineTo(x + width, doc.y).strokeColor('#e5e7eb').lineWidth(1).stroke();
          doc.moveDown(0.8);
          break;
      }
    };

    for (const n of input.content.content ?? []) block(n, left, fullWidth);

    doc.end();
  });
}
