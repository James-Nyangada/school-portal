import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { requireAuth, requireRole, AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { getSettings } from '../services/grading';
import { HttpError, ttErrorHandler } from '../services/tt/db';
import { MAX_FEE_STRUCTURE_REVISIONS, billStructure, structureTotal } from '../services/fees';

/**
 * Fee structures: the admin itemises each term's fees per class. Drafts are editable; publishing bills every
 * student in the chosen classes. After publishing, item changes are capped (parents may already have paid),
 * each one needs a reason and re-bills the students; payments already made are kept and re-allocated.
 */
const router = Router();

const canRead = [requireAuth, requireRole('ADMIN', 'FINANCE')];
const canEdit = [requireAuth, requireRole('ADMIN')];
const TX_OPTIONS = { timeout: 120_000, maxWait: 10_000 };

const itemSchema = z.object({
  name: z.string().trim().min(1, 'Every fee item needs a name').max(80),
  amount: z.coerce.number().min(0, 'Amounts cannot be negative').max(10_000_000)
});

const bodySchema = z.object({
  name: z.string().trim().min(1, 'Give the fee structure a name').max(120),
  term: z.string().trim().min(1).max(40),
  notes: z.string().trim().max(1000).optional().nullable(),
  items: z.array(itemSchema).max(40),
  classIds: z.array(z.string().min(1)).max(500)
});

const include = {
  items: { orderBy: { sortOrder: 'asc' } },
  classes: { include: { class: { select: { id: true, name: true, level: true } } } },
  revisions: { orderBy: { revisionNumber: 'asc' } }
} satisfies Prisma.FeeStructureInclude;

type Full = Prisma.FeeStructureGetPayload<{ include: typeof include }>;

const itemsSnapshot = (items: { name: string; amount: number }[]) => items.map((i) => ({ name: i.name, amount: i.amount }));
const sameItems = (a: { name: string; amount: number }[], b: { name: string; amount: number }[]) =>
  JSON.stringify(itemsSnapshot(a)) === JSON.stringify(itemsSnapshot(b));

async function dto(s: Full) {
  const classIds = s.classes.map((c) => c.classId);
  const studentCount = classIds.length
    ? await prisma.user.count({ where: { role: 'STUDENT', classId: { in: classIds } } })
    : 0;
  return {
    id: s.id,
    name: s.name,
    term: s.term,
    status: s.status,
    notes: s.notes,
    items: s.items.map((i) => ({ id: i.id, name: i.name, amount: i.amount })),
    total: structureTotal(s.items),
    classes: s.classes.map((c) => c.class).sort((a, b) => (a.level ?? 0) - (b.level ?? 0) || a.name.localeCompare(b.name)),
    studentCount,
    revisionCount: s.revisionCount,
    revisionsLeft: s.status === 'PUBLISHED' ? Math.max(0, MAX_FEE_STRUCTURE_REVISIONS - s.revisionCount) : null,
    revisions: s.revisions.map((r) => ({
      revisionNumber: r.revisionNumber,
      reason: r.reason,
      previousItems: r.previousItems,
      newItems: r.newItems,
      previousTotal: r.previousTotal,
      newTotal: r.newTotal,
      createdAt: r.createdAt
    })),
    publishedAt: s.publishedAt,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt
  };
}

/** Each class can belong to only one structure per term. */
async function assertClassesFree(tx: Prisma.TransactionClient, term: string, classIds: string[], structureId?: string) {
  const clashes = await tx.feeStructureClass.findMany({
    where: { term, classId: { in: classIds }, ...(structureId ? { structureId: { not: structureId } } : {}) },
    include: { class: { select: { name: true } }, structure: { select: { name: true } } }
  });
  if (clashes.length) {
    const list = clashes.map((c) => `${c.class.name} (in "${c.structure.name}")`).join(', ');
    throw new HttpError(409, `These classes already have a fee structure for ${term}: ${list}`);
  }
  const found = await tx.class.count({ where: { id: { in: classIds } } });
  if (found !== new Set(classIds).size) throw new HttpError(400, 'One or more classes no longer exist');
}

async function replaceItems(tx: Prisma.TransactionClient, structureId: string, items: { name: string; amount: number }[]) {
  await tx.feeStructureItem.deleteMany({ where: { structureId } });
  if (items.length) {
    await tx.feeStructureItem.createMany({ data: items.map((i, idx) => ({ structureId, name: i.name, amount: i.amount, sortOrder: idx })) });
  }
}

async function replaceClasses(tx: Prisma.TransactionClient, structureId: string, term: string, classIds: string[]) {
  await tx.feeStructureClass.deleteMany({ where: { structureId } });
  if (classIds.length) {
    await tx.feeStructureClass.createMany({ data: [...new Set(classIds)].map((classId) => ({ structureId, classId, term })) });
  }
}

/** Tells the parents (and the students) whose bills changed. */
async function notifyFamilies(tx: Prisma.TransactionClient, studentIds: string[], title: string, message: string, senderId: string) {
  if (!studentIds.length) return;
  const links = await tx.studentParent.findMany({ where: { studentId: { in: studentIds } }, select: { parentId: true } });
  const parentIds = [...new Set(links.map((l) => l.parentId))];
  await tx.notification.createMany({
    data: [
      ...parentIds.map((userId) => ({ userId, type: 'FEE_STRUCTURE', title, message, link: '/parent/fees', senderId })),
      ...studentIds.map((userId) => ({ userId, type: 'FEE_STRUCTURE', title, message, link: '/student/fees', senderId }))
    ]
  });
}

const load = (id: string, db: Prisma.TransactionClient | typeof prisma = prisma) =>
  db.feeStructure.findUnique({ where: { id }, include });

// GET /api/fee-structures/meta — classes and which structure covers each one this term
router.get('/meta', ...canRead, async (req: AuthRequest, res) => {
  const settings = await getSettings();
  const term = typeof req.query.term === 'string' && req.query.term ? req.query.term : settings.currentTerm;
  const [classes, links, terms] = await Promise.all([
    prisma.class.findMany({ select: { id: true, name: true, level: true, _count: { select: { students: true } } }, orderBy: [{ level: 'asc' }, { name: 'asc' }] }),
    prisma.feeStructureClass.findMany({ where: { term }, include: { structure: { select: { id: true, name: true, status: true } } } }),
    prisma.feeStructure.findMany({ distinct: ['term'], select: { term: true }, orderBy: { createdAt: 'asc' } })
  ]);
  const byClass = new Map(links.map((l) => [l.classId, l.structure]));

  res.json({
    currentTerm: settings.currentTerm,
    term,
    terms: [...new Set([...terms.map((t) => t.term), settings.currentTerm])],
    maxRevisions: MAX_FEE_STRUCTURE_REVISIONS,
    classes: classes.map((c) => ({ id: c.id, name: c.name, level: c.level, studentCount: c._count.students, structure: byClass.get(c.id) ?? null }))
  });
});

// GET /api/fee-structures?term=
router.get('/', ...canRead, async (req: AuthRequest, res) => {
  const term = typeof req.query.term === 'string' && req.query.term && req.query.term !== 'ALL' ? req.query.term : undefined;
  const list = await prisma.feeStructure.findMany({ where: term ? { term } : {}, include, orderBy: [{ createdAt: 'desc' }] });
  res.json({ structures: await Promise.all(list.map(dto)) });
});

// GET /api/fee-structures/:id
router.get('/:id', ...canRead, async (req: AuthRequest, res) => {
  const s = await load(req.params.id as string);
  if (!s) throw new HttpError(404, 'Fee structure not found');
  res.json(await dto(s));
});

// POST /api/fee-structures — new draft
router.post('/', ...canEdit, async (req: AuthRequest, res) => {
  const body = bodySchema.parse(req.body);

  const created = await prisma.$transaction(async (tx) => {
    await assertClassesFree(tx, body.term, body.classIds);
    const s = await tx.feeStructure.create({
      data: { name: body.name, term: body.term, notes: body.notes || null, createdById: req.user!.id }
    });
    await replaceItems(tx, s.id, body.items);
    await replaceClasses(tx, s.id, body.term, body.classIds);
    return s;
  }, TX_OPTIONS);

  res.status(201).json(await dto((await load(created.id))!));
});

// PUT /api/fee-structures/:id — drafts: anything. Published: name/notes freely, add classes, and up to
// MAX_FEE_STRUCTURE_REVISIONS item changes, each with a reason.
router.put('/:id', ...canEdit, async (req: AuthRequest, res) => {
  const body = bodySchema.extend({ reason: z.string().trim().max(500).optional() }).parse(req.body);
  const id = req.params.id as string;

  const result = await prisma.$transaction(async (tx) => {
    const current = await load(id, tx);
    if (!current) throw new HttpError(404, 'Fee structure not found');

    if (current.status === 'DRAFT') {
      await assertClassesFree(tx, body.term, body.classIds, id);
      await tx.feeStructure.update({ where: { id }, data: { name: body.name, term: body.term, notes: body.notes || null } });
      await replaceItems(tx, id, body.items);
      await replaceClasses(tx, id, body.term, body.classIds);
      return { rebilled: 0 };
    }

    // ---- Published ----
    if (body.term !== current.term) throw new HttpError(400, 'The term of a published fee structure cannot be changed');

    const existingClassIds = current.classes.map((c) => c.classId);
    const removed = existingClassIds.filter((c) => !body.classIds.includes(c));
    if (removed.length) {
      throw new HttpError(400, 'Classes cannot be removed from a published fee structure because their students have already been billed');
    }
    const added = body.classIds.filter((c) => !existingClassIds.includes(c));
    const itemsChanged = !sameItems(current.items, body.items);

    if (itemsChanged) {
      if (current.revisionCount >= MAX_FEE_STRUCTURE_REVISIONS) {
        throw new HttpError(409, `This fee structure has already been changed ${MAX_FEE_STRUCTURE_REVISIONS} times since it was published and is now locked`);
      }
      if (!body.reason || body.reason.length < 5) throw new HttpError(400, 'Explain why the published fees are changing (parents will see this)');
      if (structureTotal(body.items) <= 0) throw new HttpError(400, 'A published fee structure must have a total above zero');
    }

    if (added.length) await assertClassesFree(tx, current.term, added, id);

    await tx.feeStructure.update({
      where: { id },
      data: { name: body.name, notes: body.notes || null, ...(itemsChanged ? { revisionCount: { increment: 1 } } : {}) }
    });

    let rebilledIds: string[] = [];
    if (itemsChanged) {
      const revisionNumber = current.revisionCount + 1;
      await tx.feeStructureRevision.create({
        data: {
          structureId: id,
          revisionNumber,
          reason: body.reason!,
          previousItems: itemsSnapshot(current.items),
          newItems: itemsSnapshot(body.items),
          previousTotal: structureTotal(current.items),
          newTotal: structureTotal(body.items),
          changedById: req.user!.id
        }
      });
      await replaceItems(tx, id, body.items);
    }
    if (added.length) {
      await tx.feeStructureClass.createMany({ data: added.map((classId) => ({ structureId: id, classId, term: current.term })) });
    }

    if (itemsChanged || added.length) {
      rebilledIds = (await billStructure(tx, id, itemsChanged ? undefined : added)).studentIds;
      const newTotal = structureTotal(itemsChanged ? body.items : current.items);
      await notifyFamilies(
        tx,
        rebilledIds,
        itemsChanged ? `${current.term} fees updated` : `${current.term} fees published`,
        itemsChanged
          ? `The ${current.term} fees are now KES ${newTotal.toLocaleString('en-KE')} (was KES ${structureTotal(current.items).toLocaleString('en-KE')}). Reason: ${body.reason}. Payments already made still count.`
          : `The ${current.term} fees are KES ${newTotal.toLocaleString('en-KE')}. See the Fees page for the breakdown.`,
        req.user!.id
      );
      await tx.auditLog.create({
        data: {
          actorId: req.user!.id,
          action: itemsChanged ? 'FEE_STRUCTURE_REVISED' : 'FEE_STRUCTURE_CLASSES_ADDED',
          details: itemsChanged
            ? `Revised "${current.name}" (${current.term}) ${current.revisionCount + 1}/${MAX_FEE_STRUCTURE_REVISIONS}: KES ${structureTotal(current.items)} → ${structureTotal(body.items)}. ${body.reason}`
            : `Added ${added.length} class(es) to "${current.name}" (${current.term})`
        }
      });
    }
    return { rebilled: rebilledIds.length };
  }, TX_OPTIONS);

  res.json({ ...(await dto((await load(id))!)), rebilled: result.rebilled });
});

// POST /api/fee-structures/:id/publish — bills every student in the classes
router.post('/:id/publish', ...canEdit, async (req: AuthRequest, res) => {
  const id = req.params.id as string;

  const result = await prisma.$transaction(async (tx) => {
    const s = await load(id, tx);
    if (!s) throw new HttpError(404, 'Fee structure not found');
    if (s.status !== 'DRAFT') throw new HttpError(409, 'This fee structure is already published');
    if (!s.items.length || structureTotal(s.items) <= 0) throw new HttpError(400, 'Add at least one fee item with an amount before publishing');
    if (!s.classes.length) throw new HttpError(400, 'Choose the classes this fee structure applies to before publishing');

    const claimed = await tx.feeStructure.updateMany({
      where: { id, status: 'DRAFT' },
      data: { status: 'PUBLISHED', publishedAt: new Date(), publishedById: req.user!.id }
    });
    if (claimed.count === 0) throw new HttpError(409, 'This fee structure is already published');

    const { studentIds } = await billStructure(tx, id);
    const total = structureTotal(s.items);
    await notifyFamilies(
      tx,
      studentIds,
      `${s.term} fees published`,
      `The ${s.term} fees are KES ${total.toLocaleString('en-KE')}. See the Fees page for the breakdown and to pay.`,
      req.user!.id
    );
    await tx.auditLog.create({
      data: {
        actorId: req.user!.id,
        action: 'FEE_STRUCTURE_PUBLISHED',
        details: `Published "${s.name}" (${s.term}, KES ${total}) for ${s.classes.map((c) => c.class.name).join(', ')}; billed ${studentIds.length} student(s)`
      }
    });
    return { billed: studentIds.length };
  }, TX_OPTIONS);

  res.json({ ...(await dto((await load(id))!)), billed: result.billed });
});

// POST /api/fee-structures/:id/duplicate — copy items into a new draft (no classes, so it can target others)
router.post('/:id/duplicate', ...canEdit, async (req: AuthRequest, res) => {
  const body = z.object({ term: z.string().trim().min(1).max(40).optional(), name: z.string().trim().min(1).max(120).optional() }).parse(req.body ?? {});
  const source = await load(req.params.id as string);
  if (!source) throw new HttpError(404, 'Fee structure not found');

  const copy = await prisma.$transaction(async (tx) => {
    const s = await tx.feeStructure.create({
      data: { name: body.name ?? `${source.name} (copy)`, term: body.term ?? source.term, notes: source.notes, createdById: req.user!.id }
    });
    await replaceItems(tx, s.id, source.items);
    return s;
  });

  res.status(201).json(await dto((await load(copy.id))!));
});

// DELETE /api/fee-structures/:id — drafts only
router.delete('/:id', ...canEdit, async (req: AuthRequest, res) => {
  const s = await prisma.feeStructure.findUnique({ where: { id: req.params.id as string } });
  if (!s) throw new HttpError(404, 'Fee structure not found');
  if (s.status !== 'DRAFT') throw new HttpError(409, 'Published fee structures cannot be deleted because students have been billed');
  await prisma.feeStructure.delete({ where: { id: s.id } });
  res.json({ ok: true });
});

router.use(ttErrorHandler);

export default router;
