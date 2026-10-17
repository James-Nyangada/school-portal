import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole, AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { canViewStudentFees, feeAccess } from '../services/fees';
import { clearanceOutcome, clearanceStatus, nextCertificateNumber, renderLeavingCertificate } from '../services/clearance';

/** Final clearance for leavers (school-dashboard-spec §3.7): fees, library and discipline, then the leaving certificate. */
const router = Router();

const student = { select: { id: true, firstName: true, lastName: true, admissionNumber: true, status: true, class: { select: { name: true } } } } as const;

// GET /api/clearance — every request with its live fee position
router.get('/', requireAuth, requireRole('ADMIN'), async (_req, res) => {
  try {
    const requests = await prisma.clearanceRequest.findMany({ orderBy: [{ status: 'asc' }, { createdAt: 'desc' }], include: { student } });
    res.json(await Promise.all(requests.map(async (r) => ({ ...(await clearanceStatus(r)), student: r.student }))));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/clearance/check/:studentId — what would block clearance, without opening a request
router.get('/check/:studentId', requireAuth, requireRole('ADMIN'), async (req, res) => {
  try {
    const studentId = req.params.studentId as string;
    const fees = await feeAccess(studentId, 'Certificates');
    res.json({ balance: fees.balance, ...clearanceOutcome({ balance: fees.balance, libraryHold: false, disciplinaryHold: false }) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

const createSchema = z.object({ studentId: z.string().min(1), leavingStatus: z.enum(['COMPLETED', 'TRANSFERRED']) });

// POST /api/clearance — open a clearance request for a leaver
router.post('/', requireAuth, requireRole('ADMIN'), async (req: AuthRequest, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' });

  try {
    const s = await prisma.user.findFirst({ where: { id: parsed.data.studentId, role: 'STUDENT' }, select: { firstName: true, lastName: true } });
    if (!s) return res.status(404).json({ error: 'Student not found' });
    if (await prisma.clearanceRequest.findUnique({ where: { studentId: parsed.data.studentId } })) {
      return res.status(409).json({ error: 'This student already has a clearance request' });
    }

    const request = await prisma.clearanceRequest.create({ data: { ...parsed.data, requestedById: req.user!.id }, include: { student } });
    await prisma.auditLog.create({
      data: {
        actorId: req.user!.id,
        action: 'CLEARANCE_REQUESTED',
        targetId: parsed.data.studentId,
        details: `Clearance opened (${parsed.data.leavingStatus === 'TRANSFERRED' ? 'transfer' : 'completed studies'})`
      }
    });
    res.status(201).json({ ...(await clearanceStatus(request)), student: request.student });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

const holdSchema = z
  .object({
    libraryHold: z.boolean(),
    libraryNote: z.string().trim().max(300).nullable(),
    disciplinaryHold: z.boolean(),
    disciplinaryNote: z.string().trim().max(300).nullable(),
    leavingStatus: z.enum(['COMPLETED', 'TRANSFERRED'])
  })
  .partial();

// PATCH /api/clearance/:id — set or lift the library and disciplinary holds
router.patch('/:id', requireAuth, requireRole('ADMIN'), async (req: AuthRequest, res) => {
  const parsed = holdSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid update' });

  try {
    const existing = await prisma.clearanceRequest.findUnique({ where: { id: req.params.id as string } });
    if (!existing) return res.status(404).json({ error: 'Clearance request not found' });
    if (existing.status === 'RELEASED') return res.status(400).json({ error: 'This clearance has already been released' });

    const data = Object.fromEntries(Object.entries(parsed.data).filter(([, v]) => v !== undefined));
    const updated = await prisma.clearanceRequest.update({ where: { id: existing.id }, data, include: { student } });
    const changes = [
      parsed.data.libraryHold !== undefined && parsed.data.libraryHold !== existing.libraryHold && `library hold ${parsed.data.libraryHold ? 'set' : 'lifted'}`,
      parsed.data.disciplinaryHold !== undefined &&
        parsed.data.disciplinaryHold !== existing.disciplinaryHold &&
        `disciplinary hold ${parsed.data.disciplinaryHold ? 'set' : 'lifted'}`
    ].filter(Boolean);
    if (changes.length) {
      await prisma.auditLog.create({
        data: { actorId: req.user!.id, action: 'CLEARANCE_UPDATED', targetId: existing.studentId, details: changes.join(', ') }
      });
    }
    res.json({ ...(await clearanceStatus(updated)), student: updated.student });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/clearance/:id/release — issue the leaving certificate and mark the student as left
router.post('/:id/release', requireAuth, requireRole('ADMIN'), async (req: AuthRequest, res) => {
  try {
    const existing = await prisma.clearanceRequest.findUnique({ where: { id: req.params.id as string } });
    if (!existing) return res.status(404).json({ error: 'Clearance request not found' });
    if (existing.status === 'RELEASED') return res.status(400).json({ error: 'This clearance has already been released' });

    const status = await clearanceStatus(existing);
    if (!status.cleared) return res.status(400).json({ error: status.blockers.join('. '), blockers: status.blockers });

    const certificateNumber = await nextCertificateNumber();
    const released = await prisma.$transaction(async (tx) => {
      const r = await tx.clearanceRequest.update({
        where: { id: existing.id },
        data: { status: 'RELEASED', releasedAt: new Date(), releasedById: req.user!.id, certificateNumber },
        include: { student }
      });
      await tx.user.update({ where: { id: existing.studentId }, data: { status: existing.leavingStatus } });
      await tx.auditLog.create({
        data: {
          actorId: req.user!.id,
          action: 'CLEARANCE_RELEASED',
          targetId: existing.studentId,
          details: `Leaving certificate ${certificateNumber} issued; student marked ${existing.leavingStatus.toLowerCase()}`
        }
      });
      return r;
    });
    res.json({ ...(await clearanceStatus(released)), student: released.student });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/clearance/:id — withdraw a request that hasn't been released
router.delete('/:id', requireAuth, requireRole('ADMIN'), async (req: AuthRequest, res) => {
  try {
    const existing = await prisma.clearanceRequest.findUnique({ where: { id: req.params.id as string } });
    if (!existing) return res.status(404).json({ error: 'Clearance request not found' });
    if (existing.status === 'RELEASED') return res.status(400).json({ error: 'A released clearance cannot be withdrawn' });

    await prisma.clearanceRequest.delete({ where: { id: existing.id } });
    await prisma.auditLog.create({
      data: { actorId: req.user!.id, action: 'CLEARANCE_WITHDRAWN', targetId: existing.studentId, details: 'Clearance request withdrawn' }
    });
    res.json({ message: 'Clearance request withdrawn' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/clearance/:id/certificate.pdf — the leaving certificate (office, or the student's parents once released)
router.get('/:id/certificate.pdf', requireAuth, async (req: AuthRequest, res) => {
  try {
    const request = await prisma.clearanceRequest.findUnique({ where: { id: req.params.id as string } });
    if (!request || !(await canViewStudentFees(req.user!, request.studentId)) || req.user!.role === 'FINANCE') {
      return res.status(404).json({ error: 'Certificate not found' });
    }

    const pdf = await renderLeavingCertificate(request.id);
    if (!pdf) return res.status(400).json({ error: 'The leaving certificate is issued once clearance is released' });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="leaving-certificate-${request.certificateNumber}.pdf"`);
    res.setHeader('Cache-Control', 'no-store');
    res.send(pdf);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
