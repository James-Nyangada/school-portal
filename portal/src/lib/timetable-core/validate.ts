// GENERATED from server/src/timetable-core by server/scripts/sync-tt-core.js — do not edit.
/* eslint-disable */
import type { Card, CheckResult, Model, Reason } from './types';
import { coveredSlots, dayOf, validStart } from './slots';
import { isUnavailable, occupant, rkey, State } from './state';

const nameOf = (model: Model, type: 'teacher' | 'class' | 'room', id: string) =>
	(type === 'teacher' ? model.names.teachers : type === 'class' ? model.names.classes : model.names.rooms)[id] ?? id;

/** Number of slots a teacher is busy on a given day (optionally ignoring one card). */
export function teacherDayLoad(model: Model, state: State, teacherId: string, day: number, ignoreCardId?: string): number {
	const row = state.busy.get(rkey('teacher', teacherId));

	if (!row) return 0;

	const ppd = model.config.periodsPerDay;
	let n = 0;

	for (let p = 0; p < ppd; p++) {
		const occ = row[day * ppd + p];

		if (occ && occ !== ignoreCardId) n++;
	}

	return n;
}

/** Effective room type a lesson needs, or null when it needs no room at all. */
export function neededRoomType(model: Model, roomType: string | null): string | null {
	if (roomType) return roomType;

	return model.ignoreGeneralRooms ? null : 'general';
}

/**
 * Pick a free room for every room need of the card at this slot. Prefers `preferred` rooms
 * (keeps a lesson in its current room when it moves). Returns null for a need that can't be met.
 */
export function findRooms(
	model: Model,
	state: State,
	card: Card,
	slot: number,
	preferred: (string | null)[] = []
): { roomIds: (string | null)[]; missing: string[] } {
	const slots = coveredSlots(slot, card.length);
	const taken = new Set<string>();
	const roomIds: (string | null)[] = [];
	const missing: string[] = [];

	card.roomNeeds.forEach((need, i) => {
		const type = neededRoomType(model, need.roomType);

		if (!type) {
			roomIds.push(null);
			return;
		}

		const free = (roomId: string) =>
			!taken.has(roomId) &&
			slots.every((s) => {
				const key = rkey('room', roomId);
				const occ = occupant(state, key, s);

				return !isUnavailable(state, key, s) && (!occ || occ === card.id);
			});

		const pref = preferred[i];
		const candidates = model.rooms.filter((r) => r.type === type);
		const chosen = pref && candidates.some((r) => r.id === pref) && free(pref) ? pref : candidates.find((r) => free(r.id))?.id;

		if (chosen) {
			taken.add(chosen);
			roomIds.push(chosen);
		} else {
			roomIds.push(null);
			missing.push(type);
		}
	});

	return { roomIds, missing };
}

/**
 * The single source of truth for "can this card go here?". Used by the editor, the generator
 * and every server write path. A card already placed is treated as lifted off the grid.
 */
export function canPlace(
	model: Model,
	state: State,
	card: Card,
	slot: number,
	opts: { preferredRooms?: (string | null)[]; stopAtFirst?: boolean } = {}
): CheckResult {
	const reasons: Reason[] = [];
	const cfg = model.config;
	const start = validStart(cfg, slot, card.length);

	if (start !== 'ok') {
		const message =
			start === 'double_day_end'
				? 'A double lesson cannot start in the last period of the day'
				: start === 'double_break'
					? 'A double lesson cannot run across a break'
					: 'Outside the timetable';

		return { ok: false, reasons: [{ code: start, message }], roomIds: [] };
	}

	const slots = coveredSlots(slot, card.length);
	const done = () => opts.stopAtFirst && reasons.length > 0;

	for (const s of slots) {
		for (const t of card.teacherIds) {
			const key = rkey('teacher', t);

			if (isUnavailable(state, key, s)) {
				reasons.push({
					code: 'teacher_unavailable',
					resourceType: 'teacher',
					resourceId: t,
					message: `${nameOf(model, 'teacher', t)} is unavailable at this time`
				});
			} else {
				const occ = occupant(state, key, s);

				if (occ && occ !== card.id) {
					reasons.push({
						code: 'teacher_busy',
						resourceType: 'teacher',
						resourceId: t,
						otherCardId: occ,
						message: `${nameOf(model, 'teacher', t)} is already teaching at this time`
					});
				}
			}

			if (done()) return { ok: false, reasons, roomIds: [] };
		}

		for (const c of card.classIds) {
			const key = rkey('class', c);

			if (isUnavailable(state, key, s)) {
				reasons.push({
					code: 'class_unavailable',
					resourceType: 'class',
					resourceId: c,
					message: `${nameOf(model, 'class', c)} is unavailable at this time`
				});
			} else {
				const occ = occupant(state, key, s);

				if (occ && occ !== card.id) {
					reasons.push({
						code: 'class_busy',
						resourceType: 'class',
						resourceId: c,
						otherCardId: occ,
						message: `${nameOf(model, 'class', c)} already has a lesson at this time`
					});
				}
			}

			if (done()) return { ok: false, reasons, roomIds: [] };
		}
	}

	if (model.rules.respectMaxPerDay) {
		const day = dayOf(slot, cfg.periodsPerDay);

		for (const t of card.teacherIds) {
			const max = model.teacherMaxPerDay[t];

			if (max && teacherDayLoad(model, state, t, day, card.id) + card.length > max) {
				reasons.push({
					code: 'teacher_max_day',
					resourceType: 'teacher',
					resourceId: t,
					message: `${nameOf(model, 'teacher', t)} would exceed ${max} lessons on ${cfg.dayNames[day] ?? 'this day'}`
				});
			}
		}

		if (done()) return { ok: false, reasons, roomIds: [] };
	}

	const rooms = findRooms(model, state, card, slot, opts.preferredRooms);

	for (const type of rooms.missing) {
		reasons.push({ code: 'room_none', resourceType: 'room', message: `No free ${type} room at this time` });
	}

	return { ok: reasons.length === 0, reasons, roomIds: rooms.roomIds };
}

/** Plain-English summary of why a card can't go at a slot. */
export function explain(result: CheckResult): string {
	return result.ok ? 'OK' : [...new Set(result.reasons.map((r) => r.message))].join('; ');
}
