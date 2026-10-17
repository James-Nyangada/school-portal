// GENERATED from server/src/timetable-core by server/scripts/sync-tt-core.js — do not edit.
/* eslint-disable */
import type { Model } from '../types';
import { canPlace } from '../validate';
import { commit, State, undo } from '../state';
import { cardFamily, softDelta } from '../score';
import { dayOf } from '../slots';
import { startSlots } from './order';

export interface ImproveOptions {
	rng: () => number;
	deadline: number;
	/** Stop after this many iterations without an improvement. */
	patience?: number;
	shouldStop?: () => boolean;
}

/**
 * Hill climbing after placement: lift a random unlocked card, try a handful of other valid
 * slots, and keep the move only if the local soft penalty drops. Also retries any unplaced
 * cards in case moves have opened space for them. Never creates a clash — every move goes
 * through canPlace.
 */
export function improve(model: Model, state: State, opts: ImproveOptions): { moves: number; iterations: number } {
	const patience = opts.patience ?? 3000;
	const starts = { 1: startSlots(model, 1), 2: startSlots(model, 2) };
	let sinceBetter = 0;
	let moves = 0;
	let iterations = 0;

	const retryUnplaced = () => {
		for (const card of model.cards) {
			if (state.placements.has(card.id)) continue;

			let bestSlot = -1;
			let bestRooms: (string | null)[] = [];
			let bestDelta = Infinity;

			for (const s of starts[card.length]) {
				const check = canPlace(model, state, card, s);

				if (!check.ok) continue;

				const d = softDelta(model, state, card, s);

				if (d < bestDelta) {
					bestDelta = d;
					bestSlot = s;
					bestRooms = check.roomIds;
				}
			}

			if (bestSlot >= 0) commit(state, { cardId: card.id, slot: bestSlot, roomIds: bestRooms, locked: false });
		}
	};

	/** Cards whose class already has the same lesson/subject that day — the worst offenders. */
	const offenders = (): string[] => {
		const ppd = model.config.periodsPerDay;
		const seen = new Map<string, string>();
		const bad = new Set<string>();

		state.placements.forEach((p) => {
			const card = state.cardById.get(p.cardId)!;
			const day = dayOf(p.slot, ppd);
			card.classIds.forEach((c) =>
				[cardFamily(card.id), ...card.subjectIds].forEach((k) => {
					const key = `${c}|${day}|${k}`;
					const other = seen.get(key);

					if (other && other !== card.id) {
						bad.add(card.id);
						bad.add(other);
					} else seen.set(key, card.id);
				})
			);
		});

		return [...bad].filter((id) => !state.placements.get(id)?.locked);
	};

	/** Try every slot for a card; keep the best one if it beats `before`. */
	const bestMove = (cardId: string): boolean => {
		const current = state.placements.get(cardId)!;
		const card = state.cardById.get(cardId)!;
		undo(state, cardId);
		const before = softDelta(model, state, card, current.slot);
		let best: { slot: number; roomIds: (string | null)[]; d: number } | null = null;

		for (const s of starts[card.length]) {
			if (s === current.slot) continue;

			const check = canPlace(model, state, card, s, { stopAtFirst: true });

			if (!check.ok) continue;

			const d = softDelta(model, state, card, s);

			if (d < before && (!best || d < best.d)) best = { slot: s, roomIds: check.roomIds, d };
		}

		commit(state, best ? { cardId, slot: best.slot, roomIds: best.roomIds, locked: false } : current);

		return Boolean(best);
	};

	/** Swap a card with another unlocked card of the same class; keep it if the pair improves. */
	const trySwap = (cardId: string): boolean => {
		const a = state.placements.get(cardId)!;
		const cardA = state.cardById.get(cardId)!;
		const partners = [...state.placements.values()].filter((p) => {
			const c = state.cardById.get(p.cardId)!;

			return !p.locked && p.cardId !== cardId && c.length === cardA.length && c.classIds.some((x) => cardA.classIds.includes(x));
		});

		for (const b of partners) {
			const cardB = state.cardById.get(b.cardId)!;
			undo(state, a.cardId);
			undo(state, b.cardId);
			const before = softDelta(model, state, cardA, a.slot) + softDelta(model, state, cardB, b.slot);
			const checkA = canPlace(model, state, cardA, b.slot, { stopAtFirst: true });

			if (checkA.ok) {
				const deltaA = softDelta(model, state, cardA, b.slot);
				commit(state, { cardId: a.cardId, slot: b.slot, roomIds: checkA.roomIds, locked: false });
				const checkB = canPlace(model, state, cardB, a.slot, { stopAtFirst: true });

				if (checkB.ok && deltaA + softDelta(model, state, cardB, a.slot) < before) {
					commit(state, { cardId: b.cardId, slot: a.slot, roomIds: checkB.roomIds, locked: false });

					return true;
				}

				undo(state, a.cardId);
			}

			commit(state, a);
			commit(state, b);
		}

		return false;
	};

	retryUnplaced();

	// Targeted pass: fix same-subject-same-day repeats first.
	for (let round = 0; round < 5 && Date.now() < opts.deadline; round++) {
		const bad = offenders();

		if (bad.length === 0) break;

		let fixed = 0;

		for (const id of bad) {
			if (Date.now() >= opts.deadline || opts.shouldStop?.()) break;

			if (!state.placements.has(id)) continue;

			if (bestMove(id) || trySwap(id)) {
				fixed++;
				moves++;
			}
		}

		if (fixed === 0) break;
	}

	while (sinceBetter < patience && Date.now() < opts.deadline && !opts.shouldStop?.()) {
		iterations++;
		const movable = [...state.placements.values()].filter((p) => !p.locked);

		if (movable.length === 0) break;

		const current = movable[Math.floor(opts.rng() * movable.length)]!;
		const card = state.cardById.get(current.cardId)!;

		undo(state, card.id);
		const before = softDelta(model, state, card, current.slot);
		let improved = false;

		for (let tries = 0; tries < 8; tries++) {
			const pool = starts[card.length];
			const s = pool[Math.floor(opts.rng() * pool.length)]!;

			if (s === current.slot) continue;

			const check = canPlace(model, state, card, s, { stopAtFirst: true });

			if (!check.ok) continue;

			if (softDelta(model, state, card, s) < before) {
				commit(state, { cardId: card.id, slot: s, roomIds: check.roomIds, locked: false });
				improved = true;
				break;
			}
		}

		if (improved) {
			moves++;
			sinceBetter = 0;

			if (moves % 50 === 0) retryUnplaced();
		} else {
			commit(state, current);
			sinceBetter++;
		}
	}

	retryUnplaced();

	return { moves, iterations };
}
