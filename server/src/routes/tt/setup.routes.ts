import { Router } from 'express';
import { z } from 'zod';
import { requireRole, AuthRequest } from '../../middleware/auth';
import { audit, HttpError, prisma } from '../../services/tt/db';
import { normalizeOptionalRoomType, normalizeRoomType, CLASSROOM } from '../../services/tt/roomTypes';
import { getSettings, invalidate, loadLookups, loadSchedule, loadUnavailability } from '../../services/tt/model.service';

const router = Router();
const admin = requireRole('ADMIN');

// Any write here changes shared setup data — drop the cache before and after handling it.
router.use((req, res, next) => {
	if (req.method !== 'GET') {
		invalidate('setup');
		res.on('finish', () => invalidate('setup'));
	}

	next();
});

const time = z.string().regex(/^\d{2}:\d{2}$/, 'Use HH:MM');

/** Everything the setup screens need in one call. */
router.get('/', admin, async (_req, res) => {
	const [schedule, lookups, settings, unavailability] = await Promise.all([
		loadSchedule(prisma, true),
		loadLookups(prisma, true),
		getSettings(prisma, true),
		loadUnavailability(prisma, true)
	]);
	res.json({ ...schedule, ...lookups, settings, unavailability });
});

// ── Bell schedule ───────────────────────────────────────────
// Days and periods are saved as whole lists; indexes are rewritten 0..n-1 so the grid stays
// contiguous. Changing them invalidates placements, so it's refused while entries exist.

async function assertNoEntries() {
	const n = await prisma.ttEntry.count();

	if (n > 0) {
		throw new HttpError(409, 'Timetables already have lessons placed. Clear or archive them before changing days or periods.', { entries: n });
	}
}

const daysSchema = z.object({ days: z.array(z.object({ name: z.string().min(1), short: z.string().min(1).max(5) })).min(1).max(7) });

router.put('/days', admin, async (req: AuthRequest, res) => {
	const { days } = daysSchema.parse(req.body);
	const current = await prisma.ttDay.findMany({ orderBy: { index: 'asc' } });
	const sameShape = current.length === days.length;

	if (!sameShape) await assertNoEntries();

	await prisma.$transaction(async (tx) => {
		await tx.ttDay.deleteMany();
		await tx.ttDay.createMany({ data: days.map((d, index) => ({ index, name: d.name, short: d.short })) });
		// Unavailability for days that no longer exist is meaningless.
		await tx.ttUnavailability.deleteMany({ where: { dayIndex: { gte: days.length } } });
	});
	await audit(prisma, req.user?.id, 'TT_DAYS_UPDATED', null, { days: days.length });
	res.json(await loadSchedule(prisma, true));
});

const periodsSchema = z.object({
	periods: z
		.array(z.object({ name: z.string().min(1), startTime: time, endTime: time, block: z.number().int().min(0) }))
		.min(1)
		.max(16),
	// Named breaks with their own times; afterIndex = the period the break follows.
	breaks: z
		.array(z.object({ afterIndex: z.number().int().min(0), name: z.string().trim().min(1).max(40), startTime: time, endTime: time }))
		.max(15)
		.optional()
});

/** "13:05" → "1:05 PM", so messages match what the time boxes show. */
const ampm = (t: string) => {
	const [h, m] = t.split(':').map(Number) as [number, number];

	return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
};

/** A hint for an end time that is not after the start — usually AM picked instead of PM. */
function endBeforeStartHint(name: string, start: string, end: string) {
	const [h, m] = end.split(':').map(Number) as [number, number];
	const pm = h < 12 ? `${String(h + 12).padStart(2, '0')}:${String(m).padStart(2, '0')}` : null;
	const fix = pm && pm > start ? ` Did you mean ${ampm(pm)}? Check the AM/PM part of the end time.` : ' Set an end time later than the start.';

	return `${name} ends at ${ampm(end)}, which is before it starts at ${ampm(start)}.${fix}`;
}

router.put('/periods', admin, async (req: AuthRequest, res) => {
	const { periods, breaks = [] } = periodsSchema.parse(req.body);

	// Every slot in the day, in order, so overlaps between periods and breaks are caught too.
	const slots: { name: string; startTime: string; endTime: string }[] = [];
	periods.forEach((p, i) => {
		slots.push(p);
		const b = breaks.find((x) => x.afterIndex === i);

		if (b) slots.push(b);
	});

	breaks.forEach((b) => {
		const next = periods[b.afterIndex + 1];

		if (!next) throw new HttpError(400, `"${b.name}" must sit between two periods. Move it or remove it.`);

		if (next.block === periods[b.afterIndex]!.block) throw new HttpError(400, `"${b.name}" has no break marked after ${periods[b.afterIndex]!.name}.`);
	});

	if (new Set(breaks.map((b) => b.afterIndex)).size !== breaks.length) throw new HttpError(400, 'Two breaks follow the same period. Merge them into one break.');

	slots.forEach((p, i) => {
		if (p.endTime <= p.startTime) throw new HttpError(400, endBeforeStartHint(p.name, p.startTime, p.endTime));

		const prev = slots[i - 1];

		if (prev && p.startTime < prev.endTime) {
			throw new HttpError(
				400,
				`${p.name} starts at ${ampm(p.startTime)}, before ${prev.name} ends at ${ampm(prev.endTime)}. Start ${p.name} at ${ampm(prev.endTime)} or later, or end ${prev.name} earlier.`
			);
		}
	});

	const current = await prisma.ttPeriod.findMany({ orderBy: { index: 'asc' } });
	const blocksChanged = current.length !== periods.length || current.some((c, i) => c.block !== periods[i]!.block);

	if (blocksChanged) await assertNoEntries();

	await prisma.$transaction(async (tx) => {
		await tx.ttPeriod.deleteMany();
		await tx.ttPeriod.createMany({ data: periods.map((p, index) => ({ index, ...p })) });
		await tx.ttBreak.deleteMany();
		await tx.ttBreak.createMany({ data: breaks.map((b) => ({ afterIndex: b.afterIndex, name: b.name, startTime: b.startTime, endTime: b.endTime })) });
		await tx.ttUnavailability.deleteMany({ where: { periodIndex: { gte: periods.length } } });
	});
	await audit(prisma, req.user?.id, 'TT_PERIODS_UPDATED', null, { periods: periods.length, breaks: breaks.length });
	res.json(await loadSchedule(prisma, true));
});

// ── Subjects & teachers: timetable-specific info on existing records ──

export const SUBJECT_SHORT_MAX = 8;

const subjectInfo = z.object({
	short: z.string().trim().min(1, 'Short name is required').max(SUBJECT_SHORT_MAX, `Short name can be at most ${SUBJECT_SHORT_MAX} characters`),
	color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
	roomType: z.string().min(1).max(30).nullable().transform(normalizeOptionalRoomType)
});

router.put('/subjects/:id', admin, async (req, res) => {
	const data = subjectInfo.parse(req.body);
	const subjectId = req.params.id as string;
	await prisma.ttSubjectInfo.upsert({ where: { subjectId }, create: { subjectId, ...data }, update: data });
	res.json({ ok: true });
});

const teacherInfo = z.object({
	short: z.string().min(1).max(6),
	maxPerDay: z.number().int().min(1).max(16).nullable(),
	maxPerWeek: z.number().int().min(1).max(80).nullable()
});

router.put('/teachers/:id', admin, async (req, res) => {
	const data = teacherInfo.parse(req.body);
	const teacherId = req.params.id as string;
	const teacher = await prisma.user.findFirst({ where: { id: teacherId, role: 'TEACHER' } });

	if (!teacher) throw new HttpError(404, 'Teacher not found');

	await prisma.ttTeacherInfo.upsert({ where: { teacherId }, create: { teacherId, ...data }, update: data });
	res.json({ ok: true });
});

// ── Rooms ───────────────────────────────────────────────────

const roomSchema = z.object({
	name: z.string().min(1).max(60),
	short: z.string().min(1).max(8),
	type: z.string().min(1).max(30).default(CLASSROOM).transform(normalizeRoomType),
	capacity: z.number().int().positive().nullable().optional()
});

router.post('/rooms', admin, async (req, res) => {
	const data = roomSchema.parse(req.body);
	res.status(201).json(await prisma.ttRoom.create({ data: { ...data, capacity: data.capacity ?? null } }));
});

router.patch('/rooms/:id', admin, async (req, res) => {
	const data = roomSchema.partial().parse(req.body);
	res.json(
		await prisma.ttRoom.update({
			where: { id: req.params.id as string },
			data: Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined))
		})
	);
});

router.delete('/rooms/:id', admin, async (req, res) => {
	const id = req.params.id as string;
	const used = await prisma.ttOccupancy.count({ where: { resourceType: 'room', resourceId: id } });

	if (used > 0) throw new HttpError(409, `This room is used by ${used} placed lesson periods. Move them first.`);

	await prisma.$transaction([
		prisma.ttUnavailability.deleteMany({ where: { resourceType: 'room', resourceId: id } }),
		prisma.ttRoom.delete({ where: { id } })
	]);
	res.json({ ok: true });
});

// ── Unavailability: replace the full set for one resource ───

const unavailSchema = z.object({
	slots: z.array(z.object({ dayIndex: z.number().int().min(0), periodIndex: z.number().int().min(0) })).max(200)
});

router.put('/unavailability/:type/:id', admin, async (req, res) => {
	const type = z.enum(['teacher', 'class', 'room']).parse(req.params.type);
	const resourceId = req.params.id as string;
	const { slots } = unavailSchema.parse(req.body);
	const unique = [...new Map(slots.map((s) => [`${s.dayIndex}:${s.periodIndex}`, s])).values()];

	await prisma.$transaction(async (tx) => {
		await tx.ttUnavailability.deleteMany({ where: { resourceType: type, resourceId } });
		await tx.ttUnavailability.createMany({ data: unique.map((s) => ({ resourceType: type, resourceId, ...s })) });
	});
	res.json({ ok: true, count: unique.length });
});

// ── Generator rules ─────────────────────────────────────────

const settingsSchema = z.object({
	ignoreGeneralRooms: z.boolean(),
	rules: z.object({
		spreadSubjects: z.boolean(),
		noSameSubjectTwiceADay: z.boolean(),
		minimiseTeacherGaps: z.boolean(),
		respectMaxPerDay: z.boolean(),
		preferMorning: z.boolean()
	})
});

router.get('/settings', admin, async (_req, res) => {
	res.json(await getSettings());
});

router.put('/settings', admin, async (req: AuthRequest, res) => {
	const data = settingsSchema.parse(req.body);
	await prisma.ttSettings.upsert({ where: { id: 1 }, create: { id: 1, ...data }, update: data });
	await audit(prisma, req.user?.id, 'TT_SETTINGS_UPDATED', null, data);
	res.json(await getSettings(prisma, true));
});

export default router;
