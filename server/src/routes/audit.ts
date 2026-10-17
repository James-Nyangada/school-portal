import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { requireAuth, requireRole, AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';

const router = Router();

/** Most rows one CSV export will contain; narrow the filters for more. */
const MAX_EXPORT_ROWS = 50_000;

const filterSchema = z.object({
  action: z.string().trim().max(80).optional(),
  /** Free text matched against the actor's / target's name, email or phone */
  actor: z.string().trim().max(100).optional(),
  target: z.string().trim().max(100).optional(),
  /** Free text matched against the details column */
  search: z.string().trim().max(200).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(25)
});

const personMatch = (q: string): Prisma.UserWhereInput => ({
  OR: [
    { firstName: { contains: q, mode: 'insensitive' } },
    { lastName: { contains: q, mode: 'insensitive' } },
    { email: { contains: q, mode: 'insensitive' } },
    { phone: { contains: q } }
  ]
});

/** Date-only bounds cover whole days: the end date includes everything up to its midnight. */
function whereOf(f: z.infer<typeof filterSchema>): Prisma.AuditLogWhereInput {
  const where: Prisma.AuditLogWhereInput = {};
  if (f.action && f.action !== 'All') where.action = f.action;
  if (f.actor) where.actor = personMatch(f.actor);
  if (f.target) where.target = personMatch(f.target);
  if (f.search) where.details = { contains: f.search, mode: 'insensitive' };

  const start = f.startDate ? new Date(f.startDate) : null;
  const end = f.endDate ? new Date(f.endDate) : null;
  if (end && /^\d{4}-\d{2}-\d{2}$/.test(f.endDate!)) end.setUTCDate(end.getUTCDate() + 1);
  if ((start && !isNaN(start.getTime())) || (end && !isNaN(end.getTime()))) {
    where.createdAt = {
      ...(start && !isNaN(start.getTime()) ? { gte: start } : {}),
      ...(end && !isNaN(end.getTime()) ? { lt: end } : {})
    };
  }
  return where;
}

const person = { select: { firstName: true, lastName: true, email: true, phone: true, role: true } } as const;

// GET /api/audit-logs
router.get('/', requireAuth, requireRole('SUPER_ADMIN'), async (req, res) => {
  const parsed = filterSchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid filters' });
  const f = parsed.data;

  try {
    const where = whereOf(f);
    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        skip: (f.page - 1) * f.limit,
        take: f.limit,
        include: { actor: person, target: person },
        orderBy: { createdAt: 'desc' }
      }),
      prisma.auditLog.count({ where })
    ]);

    res.json({ logs, total, page: f.page, limit: f.limit });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/audit-logs/actions — every action type recorded so far, for the filter
router.get('/actions', requireAuth, requireRole('SUPER_ADMIN'), async (_req, res) => {
  try {
    const rows = await prisma.auditLog.findMany({ distinct: ['action'], select: { action: true }, orderBy: { action: 'asc' } });
    res.json(rows.map((r) => r.action));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

const csvCell = (v: unknown) => {
  const s = v == null ? '' : v instanceof Date ? v.toISOString() : String(v);
  // Quote everything; neutralise spreadsheet formulas
  return `"${(/^[=+\-@\t\r]/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"`;
};
const nameOf = (u: { firstName: string | null; lastName: string | null; email: string | null; phone: string | null } | null) =>
  u ? [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email || u.phone || '' : '';

// GET /api/audit-logs/export.csv — the filtered log as CSV, for offline records or board reporting
router.get('/export.csv', requireAuth, requireRole('SUPER_ADMIN'), async (req: AuthRequest, res) => {
  const parsed = filterSchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid filters' });

  try {
    const where = whereOf(parsed.data);
    const logs = await prisma.auditLog.findMany({
      where,
      take: MAX_EXPORT_ROWS,
      include: { actor: person, target: person },
      orderBy: { createdAt: 'desc' }
    });

    const header = ['Timestamp (UTC)', 'Actor', 'Actor role', 'Action', 'Target', 'Details', 'IP address', 'Device / user agent'];
    const lines = logs.map((l) =>
      [l.createdAt, nameOf(l.actor), l.actor?.role, l.action, nameOf(l.target), l.details, l.ipAddress, l.userAgent].map(csvCell).join(',')
    );

    await prisma.auditLog.create({
      data: {
        actorId: req.user!.id,
        action: 'AUDIT_LOG_EXPORTED',
        details: `Exported ${logs.length} audit log entries to CSV`,
        ipAddress: req.ip ?? null,
        userAgent: req.get('user-agent')?.slice(0, 300) ?? null
      }
    });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="audit-log-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.setHeader('Cache-Control', 'no-store');
    res.send(`﻿${[header.map(csvCell).join(','), ...lines].join('\r\n')}`);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
