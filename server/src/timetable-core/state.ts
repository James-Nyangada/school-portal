import type { Card, Model, Placement, ResourceType } from './types';
import { coveredSlots, totalSlots } from './slots';

export const rkey = (type: ResourceType, id: string) => `${type}:${id}`;

/**
 * Mutable placement state. busy[key][slot] holds the id of the card occupying that resource
 * at that slot, or null. Everything is reversible via undo().
 */
export interface State {
	nSlots: number;
	busy: Map<string, (string | null)[]>;
	unavailable: Map<string, Uint8Array>;
	placements: Map<string, Placement>;
	cardById: Map<string, Card>;
	/** Fixed placements that could not be applied (data changed since they were saved). */
	dropped: Placement[];
}

function busyRow(state: State, key: string): (string | null)[] {
	let row = state.busy.get(key);

	if (!row) {
		row = new Array<string | null>(state.nSlots).fill(null);
		state.busy.set(key, row);
	}

	return row;
}

export function isUnavailable(state: State, key: string, slot: number): boolean {
	return state.unavailable.get(key)?.[slot] === 1;
}

export function occupant(state: State, key: string, slot: number): string | null {
	return state.busy.get(key)?.[slot] ?? null;
}

/** All resource keys a placement occupies (teachers, classes, chosen rooms) — de-duplicated. */
export function placementKeys(card: Card, roomIds: (string | null)[]): string[] {
	const keys = new Set<string>();
	card.teacherIds.forEach((t) => keys.add(rkey('teacher', t)));
	card.classIds.forEach((c) => keys.add(rkey('class', c)));
	roomIds.forEach((r) => r && keys.add(rkey('room', r)));

	return [...keys];
}

export function createState(model: Model, opts: { applyFixed?: boolean } = {}): State {
	const nSlots = totalSlots(model.config);
	const unavailable = new Map<string, Uint8Array>();

	for (const [key, slots] of Object.entries(model.unavailable)) {
		const mask = new Uint8Array(nSlots);
		slots.forEach((s) => {
			if (s >= 0 && s < nSlots) mask[s] = 1;
		});
		unavailable.set(key, mask);
	}

	const state: State = {
		nSlots,
		busy: new Map(),
		unavailable,
		placements: new Map(),
		cardById: new Map(model.cards.map((c) => [c.id, c])),
		dropped: []
	};

	if (opts.applyFixed !== false) {
		for (const p of model.fixed) {
			const card = state.cardById.get(p.cardId);

			if (!card || !canOccupy(state, card, p.slot, p.roomIds)) {
				state.dropped.push(p);
				continue;
			}

			commit(state, p);
		}
	}

	return state;
}

/** Pure occupancy check (no rules, no unavailability) — used when re-applying saved entries. */
function canOccupy(state: State, card: Card, slot: number, roomIds: (string | null)[]): boolean {
	if (state.placements.has(card.id)) return false;

	for (const s of coveredSlots(slot, card.length)) {
		if (s >= state.nSlots) return false;

		for (const key of placementKeys(card, roomIds)) {
			if (occupant(state, key, s)) return false;
		}
	}

	return true;
}

export function commit(state: State, placement: Placement): void {
	const card = state.cardById.get(placement.cardId);

	if (!card) throw new Error(`Unknown card ${placement.cardId}`);

	if (state.placements.has(card.id)) throw new Error(`Card ${card.id} is already placed`);

	for (const s of coveredSlots(placement.slot, card.length)) {
		for (const key of placementKeys(card, placement.roomIds)) {
			const row = busyRow(state, key);

			if (row[s]) throw new Error(`Clash on ${key} at slot ${s}`);

			row[s] = card.id;
		}
	}

	state.placements.set(card.id, placement);
}

/** Remove a card from the grid. Returns the placement removed (for redo), or null. */
export function undo(state: State, cardId: string): Placement | null {
	const placement = state.placements.get(cardId);
	const card = state.cardById.get(cardId);

	if (!placement || !card) return null;

	for (const s of coveredSlots(placement.slot, card.length)) {
		for (const key of placementKeys(card, placement.roomIds)) {
			const row = state.busy.get(key);

			if (row && row[s] === cardId) row[s] = null;
		}
	}

	state.placements.delete(cardId);

	return placement;
}

export function clone(state: State): State {
	const busy = new Map<string, (string | null)[]>();
	state.busy.forEach((row, key) => busy.set(key, [...row]));

	return {
		nSlots: state.nSlots,
		busy,
		unavailable: state.unavailable,
		placements: new Map([...state.placements].map(([k, v]) => [k, { ...v, roomIds: [...v.roomIds] }])),
		cardById: state.cardById,
		dropped: [...state.dropped]
	};
}
