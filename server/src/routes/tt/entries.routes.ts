import { Router } from 'express';
import { z } from 'zod';
import { requireRole, AuthRequest } from '../../middleware/auth';
import { audit, HttpError, prisma, Tx, withTimetableLock } from '../../services/tt/db';
import { dbToSlot, deleteCards, insertPlacements, slotToDb } from '../../services/tt/entries.service';
import { filterCells, loadCells, scheduleDto } from '../../services/tt/grid.service';
import { loadModel } from '../../services/tt/model.service';
import { canPlace, cardLabel, commit, createState, explainUnplaced, softDelta, startSlots, undo } from '../../timetable-core';
import type { Model, State } from '../../timetable-core';

const router = Router();
const admin = requireRole('ADMIN');
const id = (v: unknown) => z.string().min(1).parse(v);

/** One query: the timetable must exist, not be archived, and have no generation job running. */
async function assertEditable(db: Tx, timetableId: string) {
	const tt = await db.ttTimetable.findUnique({
		where: { id: timetableId },
		include: { jobs: { where: { status: { in: ['queued', 'running'] } }, select: { id: true }, take: 1 } }
	});

	if (!tt) throw new HttpError(404, 'Timetable not found');

	if (tt.status === 'archived') throw new HttpError(409, 'Archived timetables are read-only. Duplicate it to make changes.');

	if (tt.jobs.length > 0) throw new HttpError(423, 'A generation job is running for this timetable. Wait for it to finish.');
}

/** Load the full current state inside the locked transaction (server-side source of truth). */
async function loadState(tx: Tx, timetableId: string) {
	const { model, schedule } = await loadModel(timetableId, { entries: 'all', db: tx });
	const state = createState(model);

	return { model, schedule, state };
}

function getCard(state: State, cardKey: string) {
	const card = state.cardById.get(cardKey);

	if (!card) throw new HttpError(404, 'That lesson card no longer exists — reload the editor.');

	return card;
}

// ── Read: everything the editor needs in one call ───────────

router.get('/:id/model', admin, async (req, res) => {
	const timetableId = id(req.params.id);
	const [tt, { model, input, lookups, schedule }, job] = await Promise.all([
		prisma.ttTimetable.findUnique({ where: { id: timetableId } }),
		loadModel(timetableId, { entries: 'all' }),
		prisma.ttJob.findFirst({ where: { timetableId, status: { in: ['queued', 'running'] } } })
	]);

	if (!tt) throw new HttpError(404, 'Timetable not found');

	const state = createState(model);
	const subjectColor = new Map(lookups.subjects.map((s) => [s.id, s.color]));

	res.json({
		timetable: tt,
		readOnly: Boolean(job) || tt.status === 'archived',
		jobId: job?.id ?? null,
		...scheduleDto(schedule),
		lookups,
		// The exact input the server validates with — the editor rebuilds the same model locally.
		input,
		cards: model.cards.map((c) => ({
			id: c.id,
			length: c.length,
			label: cardLabel(model, c),
			subjectIds: c.subjectIds,
			subjects: c.subjectIds.map((s) => model.names.subjects[s] ?? '?'),
			color: subjectColor.get(c.subjectIds[0] ?? '') ?? '#94a3b8',
			teacherIds: c.teacherIds,
			classIds: c.classIds,
			lessonIds: c.lessonIds
		})),
		placements: [...state.placements.values()].map((p) => ({ ...p, ...slotToDb(schedule, model, p.slot) })),
		dropped: state.dropped.map((p) => p.cardId)
	});
});

// ── Read: grid views ────────────────────────────────────────

router.get('/:id/grid', async (req: AuthRequest, res) => {
	const timetableId = id(req.params.id);
	const view = z.enum(['class', 'teacher', 'room']).parse(req.query.view);
	const rid = id(req.query.id);
	const tt = await prisma.ttTimetable.findUnique({ where: { id: timetableId } });

	if (!tt) throw new HttpError(404, 'Timetable not found');

	const isAdmin = ['ADMIN', 'SUPER_ADMIN'].includes(req.user?.role ?? '');

	if (!isAdmin && !(tt.status === 'published' && req.user?.role === 'TEACHER')) throw new HttpError(403, 'Not available');

	const { cells, schedule } = await loadCells(timetableId);
	res.json({ ...scheduleDto(schedule), cells: filterCells(cells, view, rid) });
});

router.get('/:id/master', admin, async (req, res) => {
	const timetableId = id(req.params.id);
	const { cells, schedule, lookups } = await loadCells(timetableId);
	res.json({ ...scheduleDto(schedule), classes: lookups.classes, cells });
});

// ── Drag start: where can this card go? ─────────────────────

router.get('/:id/cards/:cardKey/options', admin, async (req, res) => {
	const timetableId = id(req.params.id);
	const cardKey = decodeURIComponent(id(req.params.cardKey));
	const { model, schedule } = await loadModel(timetableId, { entries: 'all' });
	const state = createState(model);
	const card = getCard(state, cardKey);
	const current = state.placements.get(card.id);

	if (current) undo(state, card.id);

	const ppd = model.config.periodsPerDay;
	const options = [];

	for (let slot = 0; slot < state.nSlots; slot++) {
		const check = canPlace(model, state, card, slot, current ? { preferredRooms: current.roomIds } : {});
		const pos = slotToDb(schedule, model, slot);
		const penalty = check.ok ? softDelta(model, state, card, slot) : 0;
		// Same subject already that day → amber ("allowed, but breaks a quality rule").
		options.push({
			...pos,
			status: !check.ok ? 'blocked' : penalty >= 10 ? 'soft' : 'ok',
			penalty,
			reasons: [...new Set(check.reasons.map((r) => r.message))],
			// A blocked cell occupied by exactly one other card may be swappable.
			swapWith:
				!check.ok && check.reasons.every((r) => r.otherCardId) && new Set(check.reasons.map((r) => r.otherCardId)).size === 1
					? check.reasons[0]!.otherCardId
					: null
		});
	}

	res.json({ cardKey, length: card.length, periodsPerDay: ppd, options });
});

// ── Writes ──────────────────────────────────────────────────

const placeSchema = z.object({ cardKey: z.string().min(1), dayIndex: z.number().int(), periodIndex: z.number().int() });

/** Place an unplaced card, or move a placed one. Validated server-side under the timetable lock. */
async function moveCard(tx: Tx, model: Model, schedule: Awaited<ReturnType<typeof loadState>>['schedule'], state: State, timetableId: string, cardKey: string, slot: number) {
	const card = getCard(state, cardKey);
	const current = state.placements.get(card.id);

	if (current?.locked) throw new HttpError(409, 'This lesson is locked. Unlock it before moving it.', { reasons: ['Locked'] });

	if (current) undo(state, card.id);

	if (slot < 0) throw new HttpError(400, 'That day/period does not exist');

	const check = canPlace(model, state, card, slot, current ? { preferredRooms: current.roomIds } : {});

	if (!check.ok) {
		throw new HttpError(409, 'Cannot place here', { reasons: [...new Set(check.reasons.map((r) => r.message))] });
	}

	await deleteCards(tx, timetableId, [card.id]);
	const placement = { cardId: card.id, slot, roomIds: check.roomIds, locked: false };
	await insertPlacements(tx, timetableId, model, schedule, [placement]);
	state.placements.set(card.id, placement);

	return { cardKey: card.id, ...slotToDb(schedule, model, slot), roomIds: check.roomIds, moved: Boolean(current) };
}

router.post('/:id/entries/place', admin, async (req: AuthRequest, res) => {
	const timetableId = id(req.params.id);
	const body = placeSchema.parse(req.body);
	const result = await withTimetableLock(timetableId, async (tx) => {
		await assertEditable(tx, timetableId);
		const { model, schedule, state } = await loadState(tx, timetableId);

		return moveCard(tx, model, schedule, state, timetableId, body.cardKey, dbToSlot(schedule, model, body.dayIndex, body.periodIndex));
	});
	await audit(prisma, req.user?.id, result.moved ? 'ENTRY_MOVED' : 'ENTRY_PLACED', timetableId, { ...body });
	res.json({ ok: true, entry: result });
});

router.post('/:id/entries/swap', admin, async (req: AuthRequest, res) => {
	const timetableId = id(req.params.id);
	const { cardA, cardB } = z.object({ cardA: z.string().min(1), cardB: z.string().min(1) }).parse(req.body);
	const result = await withTimetableLock(timetableId, async (tx) => {
		await assertEditable(tx, timetableId);
		const { model, schedule, state } = await loadState(tx, timetableId);
		const a = state.placements.get(getCard(state, cardA).id);
		const b = state.placements.get(getCard(state, cardB).id);

		if (!a || !b) throw new HttpError(400, 'Both lessons must be on the grid to swap them.');

		if (a.locked || b.locked) throw new HttpError(409, 'Unlock both lessons before swapping them.', { reasons: ['Locked'] });

		undo(state, cardA);
		undo(state, cardB);
		const checkA = canPlace(model, state, state.cardById.get(cardA)!, b.slot, { preferredRooms: a.roomIds });

		if (!checkA.ok) throw new HttpError(409, 'Swap not possible', { reasons: checkA.reasons.map((r) => r.message) });

		const pa = { cardId: cardA, slot: b.slot, roomIds: checkA.roomIds, locked: false };
		// Commit A in the in-memory state so B is checked against it.
		commit(state, pa);
		const checkB = canPlace(model, state, state.cardById.get(cardB)!, a.slot, { preferredRooms: b.roomIds });

		if (!checkB.ok) throw new HttpError(409, 'Swap not possible', { reasons: checkB.reasons.map((r) => r.message) });

		const pb = { cardId: cardB, slot: a.slot, roomIds: checkB.roomIds, locked: false };
		await deleteCards(tx, timetableId, [cardA, cardB]);
		await insertPlacements(tx, timetableId, model, schedule, [pa, pb]);

		return [
			{ cardKey: cardA, ...slotToDb(schedule, model, pa.slot), roomIds: pa.roomIds },
			{ cardKey: cardB, ...slotToDb(schedule, model, pb.slot), roomIds: pb.roomIds }
		];
	});
	await audit(prisma, req.user?.id, 'ENTRY_SWAPPED', timetableId, { cardA, cardB });
	res.json({ ok: true, entries: result });
});

router.post('/:id/entries/unplace', admin, async (req: AuthRequest, res) => {
	const timetableId = id(req.params.id);
	const { cardKey } = z.object({ cardKey: z.string().min(1) }).parse(req.body);
	await withTimetableLock(timetableId, async (tx) => {
		await assertEditable(tx, timetableId);
		const entry = await tx.ttEntry.findUnique({ where: { timetableId_cardKey: { timetableId, cardKey } } });

		if (!entry) throw new HttpError(404, 'That lesson is not on the grid');

		if (entry.locked) throw new HttpError(409, 'This lesson is locked. Unlock it first.', { reasons: ['Locked'] });

		await tx.ttEntry.delete({ where: { id: entry.id } });
	});
	await audit(prisma, req.user?.id, 'ENTRY_UNPLACED', timetableId, { cardKey });
	res.json({ ok: true });
});

router.post('/:id/entries/lock', admin, async (req: AuthRequest, res) => {
	const timetableId = id(req.params.id);
	const { cardKey, locked } = z.object({ cardKey: z.string().min(1), locked: z.boolean() }).parse(req.body);
	await withTimetableLock(timetableId, async (tx) => {
		await assertEditable(tx, timetableId);
		await tx.ttEntry.update({ where: { timetableId_cardKey: { timetableId, cardKey } }, data: { locked } });
	});
	await audit(prisma, req.user?.id, locked ? 'ENTRY_LOCKED' : 'ENTRY_UNLOCKED', timetableId, { cardKey });
	res.json({ ok: true });
});

/** Lock or unlock every placed entry at once. */
router.post('/:id/entries/lock-all', admin, async (req: AuthRequest, res) => {
	const timetableId = id(req.params.id);
	const { locked } = z.object({ locked: z.boolean() }).parse(req.body);
	const n = await withTimetableLock(timetableId, async (tx) => {
		await assertEditable(tx, timetableId);

		return (await tx.ttEntry.updateMany({ where: { timetableId }, data: { locked } })).count;
	});
	await audit(prisma, req.user?.id, locked ? 'ENTRIES_LOCKED_ALL' : 'ENTRIES_UNLOCKED_ALL', timetableId, { count: n });
	res.json({ ok: true, count: n });
});

/** Remove every unlocked entry (start over, keeping locked lessons). */
router.post('/:id/entries/clear', admin, async (req: AuthRequest, res) => {
	const timetableId = id(req.params.id);
	const n = await withTimetableLock(timetableId, async (tx) => {
		await assertEditable(tx, timetableId);

		return (await tx.ttEntry.deleteMany({ where: { timetableId, locked: false } })).count;
	});
	await audit(prisma, req.user?.id, 'ENTRIES_CLEARED', timetableId, { count: n });
	res.json({ ok: true, count: n });
});

router.post('/:id/entries/room', admin, async (req: AuthRequest, res) => {
	const timetableId = id(req.params.id);
	const { cardKey, roomIds } = z.object({ cardKey: z.string().min(1), roomIds: z.array(z.string().nullable()) }).parse(req.body);
	const result = await withTimetableLock(timetableId, async (tx) => {
		await assertEditable(tx, timetableId);
		const { model, schedule, state } = await loadState(tx, timetableId);
		const card = getCard(state, cardKey);
		const current = state.placements.get(card.id);

		if (!current) throw new HttpError(400, 'Place the lesson on the grid before choosing a room.');

		if (roomIds.length !== card.roomNeeds.length) throw new HttpError(400, 'One room per lesson in this card is required.');

		roomIds.forEach((r) => {
			if (r && !model.rooms.some((x) => x.id === r)) throw new HttpError(400, 'Unknown room');
		});

		undo(state, card.id);
		// Validate the chosen rooms by checking against a model where only these rooms exist.
		const check = canPlace(model, state, card, current.slot, { preferredRooms: roomIds });
		const okRooms = check.roomIds.every((r, i) => r === roomIds[i] || roomIds[i] === null);

		if (!check.ok || !okRooms) {
			throw new HttpError(409, 'That room is not free or not the right type at this time', {
				reasons: check.ok ? ['Room is busy or the wrong type'] : check.reasons.map((r) => r.message)
			});
		}

		await deleteCards(tx, timetableId, [card.id]);
		await insertPlacements(tx, timetableId, model, schedule, [{ ...current, roomIds }]);

		return { cardKey, roomIds };
	});
	await audit(prisma, req.user?.id, 'ENTRY_ROOM_CHANGED', timetableId, result);
	res.json({ ok: true, ...result });
});

/** Unplaced cards with plain-English reasons (used by the editor tray and the generate page). */
router.get('/:id/unplaced', admin, async (req, res) => {
	const timetableId = id(req.params.id);
	const { model } = await loadModel(timetableId, { entries: 'all' });
	const state = createState(model);
	const unplaced = model.cards.filter((c) => !state.placements.has(c.id));
	res.json({
		total: model.cards.length,
		placed: state.placements.size,
		unplaced: unplaced.map((c) => explainUnplaced(model, state, c)),
		possibleStarts: { single: startSlots(model, 1).length, double: startSlots(model, 2).length }
	});
});

export default router;
