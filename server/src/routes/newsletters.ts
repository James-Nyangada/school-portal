import { Router } from 'express';
import { z } from 'zod';
import { NewsletterAudience } from '@prisma/client';
import { requireAuth, requireRole, requireFeature, AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { getSchoolProfile } from '../services/school';
import {
  AUDIENCE_LABEL,
  cleanContent,
  isEmptyContent,
  needsClass,
  plainText,
  renderNewsletterPdf,
  resolveAudience,
  TNode,
} from '../services/newsletter';

/**
 * Newsletters: admins compose rich-text newsletters for an audience and send them; recipients read them on their
 * Messages page (or download a PDF) and see a banner on their dashboard until they open or dismiss it.
 * Editing a sent newsletter updates it for everyone it went to and shows the banner again.
 */
const router = Router();

const ADMIN = ['ADMIN', 'SUPER_ADMIN'];
const isAdmin = (role?: string) => role === 'ADMIN' || role === 'SUPER_ADMIN';
const fullName = (u: { firstName: string | null; lastName: string | null } | null) =>
  [u?.firstName, u?.lastName].filter(Boolean).join(' ') || null;

const MAX_CONTENT_BYTES = 200_000;

const body = z.object({
  subject: z.string().trim().min(1, 'Subject is required').max(200),
  content: z.unknown(),
  audience: z.nativeEnum(NewsletterAudience).optional(),
  classId: z.string().nullish(),
  send: z.boolean().optional(),
});

/** Validated subject + cleaned content, or an error message. */
function parseBody(raw: unknown) {
  const parsed = body.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid newsletter' } as const;

  const content = cleanContent(parsed.data.content);
  if (!content) return { error: 'Content must be a rich-text document' } as const;
  if (JSON.stringify(content).length > MAX_CONTENT_BYTES) return { error: 'The newsletter is too long' } as const;

  return { data: { ...parsed.data, content } } as const;
}

async function checkAudience(audience: NewsletterAudience, classId: string | null | undefined) {
  if (!needsClass(audience)) return null;
  if (!classId) return 'Choose a class for this audience';
  const cls = await prisma.class.findUnique({ where: { id: classId }, select: { id: true } });
  return cls ? null : 'Class not found';
}

/** Resolves the audience and records the recipients; returns how many there are. */
async function deliver(newsletterId: string, audience: NewsletterAudience, classId: string | null) {
  const userIds = await resolveAudience(audience, classId);
  if (userIds.length === 0) return 0;

  await prisma.$transaction([
    prisma.newsletterRecipient.createMany({
      data: userIds.map((userId) => ({ newsletterId, userId })),
      skipDuplicates: true,
    }),
    prisma.newsletter.update({ where: { id: newsletterId }, data: { status: 'SENT', sentAt: new Date() } }),
  ]);
  return userIds.length;
}

// ============================================================
// Recipient inbox (any signed-in user)
// ============================================================

/** Newsletters sent to the signed-in user, newest first. `showBanner` marks ones not yet opened or dismissed. */
router.get('/inbox', requireAuth, async (req: AuthRequest, res) => {
  try {
    const rows = await prisma.newsletterRecipient.findMany({
      where: { userId: req.user!.id, newsletter: { status: 'SENT' } },
      include: {
        newsletter: {
          select: {
            id: true,
            subject: true,
            content: true,
            sentAt: true,
            editedAt: true,
            sentBy: { select: { firstName: true, lastName: true } },
          },
        },
      },
      orderBy: { newsletter: { sentAt: 'desc' } },
      take: 100,
    });

    res.json(
      rows.map(({ newsletter: n, openedAt, dismissedAt }) => ({
        id: n.id,
        subject: n.subject,
        preview: plainText(n.content as TNode, 180),
        sentAt: n.sentAt,
        editedAt: n.editedAt,
        sentBy: fullName(n.sentBy),
        openedAt,
        showBanner: dismissedAt === null,
      }))
    );
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

/** Opens a newsletter: returns its content and records the open (which also clears its banner). */
router.get('/inbox/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const key = { newsletterId_userId: { newsletterId: req.params.id as string, userId: req.user!.id } };
    const recipient = await prisma.newsletterRecipient.findUnique({
      where: key,
      include: { newsletter: { include: { sentBy: { select: { firstName: true, lastName: true } } } } },
    });
    if (!recipient || recipient.newsletter.status !== 'SENT') return res.status(404).json({ error: 'Message not found' });

    const now = new Date();
    await prisma.newsletterRecipient.update({
      where: key,
      data: { openedAt: recipient.openedAt ?? now, dismissedAt: now },
    });

    const n = recipient.newsletter;
    res.json({
      id: n.id,
      subject: n.subject,
      content: n.content,
      sentAt: n.sentAt,
      editedAt: n.editedAt,
      sentBy: fullName(n.sentBy),
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to open message' });
  }
});

/** Hides the dashboard banner without opening the newsletter. */
router.post('/inbox/:id/dismiss', requireAuth, async (req: AuthRequest, res) => {
  try {
    await prisma.newsletterRecipient.updateMany({
      where: { newsletterId: req.params.id as string, userId: req.user!.id },
      data: { dismissedAt: new Date() },
    });
    res.json({ ok: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to dismiss message' });
  }
});

/** PDF of a newsletter, for its recipients and for admins. */
router.get('/:id/pdf', requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = req.params.id as string;
    const n = await prisma.newsletter.findUnique({ where: { id } });
    if (!n) return res.status(404).json({ error: 'Newsletter not found' });

    if (!isAdmin(req.user!.role)) {
      const recipient = await prisma.newsletterRecipient.findUnique({
        where: { newsletterId_userId: { newsletterId: id, userId: req.user!.id } },
      });
      if (!recipient || n.status !== 'SENT') return res.status(404).json({ error: 'Newsletter not found' });
    }

    const school = await getSchoolProfile();
    const pdf = await renderNewsletterPdf({
      schoolName: school.name || process.env.SCHOOL_NAME || 'School Newsletter',
      subject: n.subject,
      date: n.sentAt ?? n.updatedAt,
      edited: !!n.editedAt,
      content: n.content as TNode,
    });

    const safeName = n.subject.replace(/[^\w-]+/g, '_').slice(0, 60) || 'newsletter';
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}.pdf"`);
    res.setHeader('Cache-Control', 'no-store');
    res.send(pdf);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to create the PDF' });
  }
});

// ============================================================
// Admin
// ============================================================

/** All newsletters with their audience, recipient count and how many recipients opened them. */
router.get('/', requireAuth, requireRole(...ADMIN), async (_req, res) => {
  try {
    const newsletters = await prisma.newsletter.findMany({
      orderBy: [{ updatedAt: 'desc' }],
      include: {
        class: { select: { name: true } },
        sentBy: { select: { firstName: true, lastName: true } },
        _count: { select: { recipients: true } },
      },
    });
    const opened = await prisma.newsletterRecipient.groupBy({
      by: ['newsletterId'],
      where: { openedAt: { not: null } },
      _count: { _all: true },
    });
    const openedBy = new Map(opened.map((o) => [o.newsletterId, o._count._all]));

    res.json(
      newsletters.map((n) => ({
        id: n.id,
        subject: n.subject,
        preview: plainText(n.content as TNode, 120),
        audience: n.audience,
        audienceLabel: n.class ? `${AUDIENCE_LABEL[n.audience]}: ${n.class.name}` : AUDIENCE_LABEL[n.audience],
        classId: n.classId,
        status: n.status,
        sentAt: n.sentAt,
        editedAt: n.editedAt,
        updatedAt: n.updatedAt,
        sentBy: fullName(n.sentBy),
        recipients: n._count.recipients,
        opened: openedBy.get(n.id) ?? 0,
      }))
    );
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch newsletters' });
  }
});

/** How many people an audience would reach right now (for the compose form). */
router.get('/audience-size', requireAuth, requireRole(...ADMIN), async (req, res) => {
  try {
    const audience = z.nativeEnum(NewsletterAudience).safeParse(req.query.audience);
    if (!audience.success) return res.status(400).json({ error: 'Unknown audience' });
    const classId = typeof req.query.classId === 'string' ? req.query.classId : null;
    if (needsClass(audience.data) && !classId) return res.json({ count: 0 });

    res.json({ count: (await resolveAudience(audience.data, classId)).length });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to count recipients' });
  }
});

router.get('/:id', requireAuth, requireRole(...ADMIN), async (req, res) => {
  try {
    const n = await prisma.newsletter.findUnique({ where: { id: req.params.id as string } });
    if (!n) return res.status(404).json({ error: 'Newsletter not found' });
    res.json(n);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch newsletter' });
  }
});

/** Who a sent newsletter went to, and whether each person has opened it. */
router.get('/:id/recipients', requireAuth, requireRole(...ADMIN), async (req, res) => {
  try {
    const rows = await prisma.newsletterRecipient.findMany({
      where: { newsletterId: req.params.id as string },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            role: true,
            email: true,
            phone: true,
            admissionNumber: true,
            class: { select: { name: true } },
          },
        },
      },
    });

    res.json(
      rows
        .map((r) => ({
          id: r.user.id,
          name: fullName(r.user) ?? r.user.email ?? r.user.phone ?? 'Unknown',
          role: r.user.role,
          detail: r.user.admissionNumber ?? r.user.class?.name ?? r.user.email ?? r.user.phone ?? null,
          openedAt: r.openedAt,
        }))
        .sort((a, b) => a.name.localeCompare(b.name))
    );
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch recipients' });
  }
});

/** Creates a newsletter as a draft, or sends it straight away with `send: true`. */
router.post('/', requireAuth, requireRole(...ADMIN), requireFeature('newsletterEnabled', 'Newsletters'), async (req: AuthRequest, res) => {
  try {
    const parsed = parseBody(req.body);
    if ('error' in parsed) return res.status(400).json({ error: parsed.error });
    const { subject, content, audience, classId, send } = parsed.data;

    if (!audience) return res.status(400).json({ error: 'Choose who to send the newsletter to' });
    const audienceError = await checkAudience(audience, classId);
    if (audienceError) return res.status(400).json({ error: audienceError });
    if (send && isEmptyContent(content)) return res.status(400).json({ error: 'Write the newsletter before sending it' });

    const n = await prisma.newsletter.create({
      data: {
        subject,
        content: content as object,
        audience,
        classId: needsClass(audience) ? classId! : null,
        sentById: req.user!.id,
      },
    });

    if (send) {
      const count = await deliver(n.id, audience, n.classId);
      if (count === 0) {
        return res.status(400).json({ error: 'Nobody is in this audience yet. The newsletter was saved as a draft.', id: n.id });
      }
      return res.status(201).json({ id: n.id, sent: true, recipients: count });
    }

    res.status(201).json({ id: n.id, sent: false });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to save newsletter' });
  }
});

/**
 * Edits a newsletter. Drafts can change audience and be sent with `send: true`. A sent newsletter keeps its
 * recipients: the edit shows for all of them and its dashboard banner appears again.
 */
router.patch('/:id', requireAuth, requireRole(...ADMIN), requireFeature('newsletterEnabled', 'Newsletters'), async (req: AuthRequest, res) => {
  try {
    const id = req.params.id as string;
    const existing = await prisma.newsletter.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: 'Newsletter not found' });

    const parsed = parseBody(req.body);
    if ('error' in parsed) return res.status(400).json({ error: parsed.error });
    const { subject, content, send } = parsed.data;

    if (existing.status === 'SENT') {
      if (isEmptyContent(content)) return res.status(400).json({ error: 'A sent newsletter cannot be empty' });

      await prisma.$transaction([
        prisma.newsletter.update({ where: { id }, data: { subject, content: content as object, editedAt: new Date() } }),
        prisma.newsletterRecipient.updateMany({ where: { newsletterId: id }, data: { dismissedAt: null } }),
      ]);
      return res.json({ id, sent: true, edited: true });
    }

    const audience = parsed.data.audience ?? existing.audience;
    const classId = needsClass(audience) ? (parsed.data.classId ?? existing.classId) : null;
    const audienceError = await checkAudience(audience, classId);
    if (audienceError) return res.status(400).json({ error: audienceError });
    if (send && isEmptyContent(content)) return res.status(400).json({ error: 'Write the newsletter before sending it' });

    await prisma.newsletter.update({ where: { id }, data: { subject, content: content as object, audience, classId } });

    if (send) {
      const count = await deliver(id, audience, classId);
      if (count === 0) return res.status(400).json({ error: 'Nobody is in this audience yet. The newsletter was saved as a draft.' });
      return res.json({ id, sent: true, recipients: count });
    }

    res.json({ id, sent: false });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to save newsletter' });
  }
});

/** Deletes a newsletter; it disappears from every recipient's messages. */
router.delete('/:id', requireAuth, requireRole(...ADMIN), async (req, res) => {
  try {
    await prisma.newsletter.delete({ where: { id: req.params.id as string } });
    res.status(204).send();
  } catch (error) {
    console.error(error);
    res.status(400).json({ error: 'Failed to delete newsletter' });
  }
});

export default router;
