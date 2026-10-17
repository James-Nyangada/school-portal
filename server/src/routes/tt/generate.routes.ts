import { Router } from 'express';
import { z } from 'zod';
import { requireRole, AuthRequest } from '../../middleware/auth';
import { audit, HttpError, prisma } from '../../services/tt/db';
import { cancelJob, startGeneration } from '../../services/tt/jobs.service';
import { loadModel } from '../../services/tt/model.service';
import { checkFeasibility, createState } from '../../timetable-core';

const router = Router();
const admin = requireRole('ADMIN');
const id = (v: unknown) => z.string().min(1).parse(v);

router.get('/timetables/:id/feasibility', admin, async (req, res) => {
	const { model } = await loadModel(id(req.params.id), { entries: 'locked' });
	const checks = checkFeasibility(model);
	res.json({
		checks,
		canGenerate: !checks.some((c) => c.level === 'error'),
		cards: model.cards.length,
		periods: model.cards.reduce((n, c) => n + c.length, 0),
		locked: model.fixed.length
	});
});

router.post('/timetables/:id/generate', admin, async (req: AuthRequest, res) => {
	const timetableId = id(req.params.id);
	const opts = z
		.object({ keepLocked: z.boolean().default(true), timeLimitSec: z.number().int().min(5).max(600).optional(), force: z.boolean().optional() })
		.parse(req.body ?? {});

	if (!opts.force) {
		const { model } = await loadModel(timetableId, { entries: 'locked' });
		const errors = checkFeasibility(model).filter((c) => c.level === 'error');

		if (errors.length > 0) throw new HttpError(409, 'Fix the feasibility errors before generating.', { checks: errors });
	}

	const job = await startGeneration(timetableId, req.user?.id, {
		keepLocked: opts.keepLocked,
		...(opts.timeLimitSec ? { timeLimitSec: opts.timeLimitSec } : {})
	});
	res.status(202).json(job);
});

router.get('/timetables/:id/jobs/latest', admin, async (req, res) => {
	res.json(await prisma.ttJob.findFirst({ where: { timetableId: id(req.params.id) }, orderBy: { createdAt: 'desc' } }));
});

router.get('/jobs/:jobId', admin, async (req, res) => {
	const job = await prisma.ttJob.findUnique({ where: { id: id(req.params.jobId) } });

	if (!job) throw new HttpError(404, 'Job not found');

	res.json(job);
});

router.post('/jobs/:jobId/cancel', admin, async (req: AuthRequest, res) => {
	res.json(await cancelJob(id(req.params.jobId)));
});

// ── Publish ─────────────────────────────────────────────────

router.post('/timetables/:id/publish', admin, async (req: AuthRequest, res) => {
	const timetableId = id(req.params.id);
	const { force } = z.object({ force: z.boolean().optional() }).parse(req.body ?? {});
	const tt = await prisma.ttTimetable.findUnique({ where: { id: timetableId } });

	if (!tt) throw new HttpError(404, 'Timetable not found');

	const running = await prisma.ttJob.findFirst({ where: { timetableId, status: { in: ['queued', 'running'] } } });

	if (running) throw new HttpError(423, 'Wait for the generation job to finish before publishing.');

	const { model } = await loadModel(timetableId, { entries: 'all' });
	const state = createState(model);
	const unplaced = model.cards.length - state.placements.size;

	if (state.placements.size === 0) throw new HttpError(409, 'Nothing is placed on this timetable yet.');

	if (unplaced > 0 && !force) {
		throw new HttpError(409, `${unplaced} lesson cards are still unplaced. Place them, or publish anyway.`, { unplaced });
	}

	// One published timetable per term: archive the previous one in the same transaction.
	await prisma.$transaction([
		prisma.ttTimetable.updateMany({ where: { term: tt.term, status: 'published', NOT: { id: timetableId } }, data: { status: 'archived' } }),
		prisma.ttTimetable.update({ where: { id: timetableId }, data: { status: 'published', publishedAt: new Date() } })
	]);
	await audit(prisma, req.user?.id, 'TIMETABLE_PUBLISHED', timetableId, { unplaced, forced: Boolean(force) });
	res.json({ ok: true, unplaced });
});

router.post('/timetables/:id/unpublish', admin, async (req: AuthRequest, res) => {
	const timetableId = id(req.params.id);
	await prisma.ttTimetable.update({ where: { id: timetableId }, data: { status: 'draft', publishedAt: null } });
	await audit(prisma, req.user?.id, 'TIMETABLE_UNPUBLISHED', timetableId);
	res.json({ ok: true });
});

router.get('/timetables/:id/audit', admin, async (req, res) => {
	res.json(await prisma.ttAudit.findMany({ where: { timetableId: id(req.params.id) }, orderBy: { createdAt: 'desc' }, take: 200 }));
});

export default router;
