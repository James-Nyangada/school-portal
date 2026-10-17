import { randomUUID } from 'crypto';
import { coveredSlots, dayOf, periodOf, placementKeys } from '../../timetable-core';
import type { Card, Model, Placement } from '../../timetable-core';
import type { Tx } from './db';

type Schedule = { days: { index: number }[]; periods: { index: number }[] };

/** Core slot (0-based position) → stored day/period index. */
export function slotToDb(schedule: Schedule, model: Model, slot: number) {
	const ppd = model.config.periodsPerDay;

	return {
		dayIndex: schedule.days[dayOf(slot, ppd)]!.index,
		periodIndex: schedule.periods[periodOf(slot, ppd)]!.index
	};
}

/** Stored day/period index → core slot, or -1 if the schedule no longer has it. */
export function dbToSlot(schedule: Schedule, model: Model, dayIndex: number, periodIndex: number) {
	const d = schedule.days.findIndex((x) => x.index === dayIndex);
	const p = schedule.periods.findIndex((x) => x.index === periodIndex);

	return d < 0 || p < 0 ? -1 : d * model.config.periodsPerDay + p;
}

/** One occupancy row per resource per covered period — de-duplicated within the card. */
function occupancyRows(timetableId: string, entryId: string, card: Card, placement: Placement, schedule: Schedule, model: Model) {
	return coveredSlots(placement.slot, card.length).flatMap((s) => {
		const { dayIndex, periodIndex } = slotToDb(schedule, model, s);

		return placementKeys(card, placement.roomIds).map((key) => {
			const sep = key.indexOf(':');

			return {
				timetableId,
				entryId,
				resourceType: key.slice(0, sep),
				resourceId: key.slice(sep + 1),
				dayIndex,
				periodIndex
			};
		});
	});
}

/**
 * The only way entries are written. Entries and their occupancy go in together, inside the
 * caller's transaction. Occupancy has a unique key per resource+period, so a clash that slips
 * past the validator still fails with P2002 (→ 409) and rolls the whole write back.
 */
export async function insertPlacements(tx: Tx, timetableId: string, model: Model, schedule: Schedule, placements: Placement[]) {
	if (placements.length === 0) return;

	const cards = new Map(model.cards.map((c) => [c.id, c]));
	const entries = [];
	const occupancy = [];

	for (const p of placements) {
		const card = cards.get(p.cardId);

		if (!card) throw new Error(`Unknown card ${p.cardId}`);

		const id = randomUUID();
		const { dayIndex, periodIndex } = slotToDb(schedule, model, p.slot);
		entries.push({ id, timetableId, cardKey: card.id, dayIndex, periodIndex, length: card.length, roomIds: p.roomIds, locked: p.locked });
		occupancy.push(...occupancyRows(timetableId, id, card, p, schedule, model));
	}

	for (let i = 0; i < entries.length; i += 1000) {
		await tx.ttEntry.createMany({ data: entries.slice(i, i + 1000) });
	}

	for (let i = 0; i < occupancy.length; i += 2000) {
		await tx.ttOccupancy.createMany({ data: occupancy.slice(i, i + 2000) });
	}
}

/** Remove entries by card key (occupancy cascades). */
export async function deleteCards(tx: Tx, timetableId: string, cardKeys: string[]) {
	if (cardKeys.length === 0) return;

	await tx.ttEntry.deleteMany({ where: { timetableId, cardKey: { in: cardKeys } } });
}

/** Entries become stale when their lesson changes; drop every card of a lesson or group. */
export async function deleteCardsOfLesson(tx: Tx, timetableId: string, lessonId: string, groupId: string | null) {
	await tx.ttEntry.deleteMany({
		where: {
			timetableId,
			OR: [{ cardKey: { startsWith: `${lessonId}#` } }, ...(groupId ? [{ cardKey: { startsWith: `G:${groupId}#` } }] : [])]
		}
	});
}
