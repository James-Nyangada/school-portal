import type { Card, Model, Placement, Progress } from '../types';
import { canPlace } from '../validate';
import { commit, State, undo } from '../state';
import { softDelta } from '../score';
import { buildNeighbours, domainSize, pickCard, startSlots } from './order';

export interface SearchOptions {
	rng: () => number;
	stepLimit: number;
	deadline: number;
	/** How many backtracks to spend on a dead end before giving up on that card. */
	backtrackBudget?: number;
	onProgress?: (p: Progress) => void;
	shouldStop?: () => boolean;
	attempt?: number;
}

export interface SearchResult {
	placements: Placement[];
	placed: number;
	skipped: string[];
	steps: number;
}

interface Frame {
	cardId: string;
	candidates: { slot: number; roomIds: (string | null)[] }[];
	next: number;
}

/**
 * Iterative backtracking with forward checking (explicit stack — no recursion, so 1,000+ cards
 * are safe). Each step places the most-constrained card in its best-scoring valid slot and
 * checks that no neighbouring card is left with an empty domain. On a dead end it backtracks;
 * after `backtrackBudget` fruitless backtracks the stuck card is skipped so a best partial
 * timetable is always produced.
 */
export function search(model: Model, state: State, opts: SearchOptions): SearchResult {
	const neighbours = buildNeighbours(model.cards);
	const starts = { 1: startSlots(model, 1), 2: startSlots(model, 2) };
	const budget = opts.backtrackBudget ?? 300;

	const unplaced = new Map<string, Card>(model.cards.filter((c) => !state.placements.has(c.id)).map((c) => [c.id, c]));
	const skipped = new Set<string>();
	const domains = new Map<string, number>();
	const dirty = new Set<string>(unplaced.keys());

	const stack: Frame[] = [];
	const total = model.cards.length;
	let best: Placement[] = [...state.placements.values()];
	let steps = 0;
	let backtracks = 0;
	let lastReport = 0;

	const refresh = () => {
		dirty.forEach((id) => {
			const c = unplaced.get(id);

			if (c) domains.set(id, domainSize(model, state, c, starts[c.length]));
		});
		dirty.clear();
	};

	const markNeighbours = (cardId: string) => neighbours.get(cardId)?.forEach((n) => unplaced.has(n) && dirty.add(n));

	const report = (force = false) => {
		if (!opts.onProgress) return;

		const now = Date.now();

		if (!force && now - lastReport < 250) return;

		lastReport = now;
		const placed = state.placements.size;
		opts.onProgress({ placed, total, percent: Math.round((placed / Math.max(total, 1)) * 100), attempt: opts.attempt ?? 1 });
	};

	/** Try the remaining candidates of the top frame. Returns true if one was committed. */
	const advance = (frame: Frame): boolean => {
		const card = state.cardById.get(frame.cardId)!;

		if (state.placements.has(card.id)) {
			undo(state, card.id);
			unplaced.set(card.id, card);
			markNeighbours(card.id);
		}

		while (frame.next < frame.candidates.length) {
			const cand = frame.candidates[frame.next++]!;
			const check = canPlace(model, state, card, cand.slot, { preferredRooms: cand.roomIds });

			if (!check.ok) continue;

			commit(state, { cardId: card.id, slot: cand.slot, roomIds: check.roomIds, locked: false });
			unplaced.delete(card.id);

			// Forward check: every unplaced neighbour must still have somewhere to go.
			let wipeout = false;

			for (const n of neighbours.get(card.id) ?? []) {
				const nc = unplaced.get(n);

				if (!nc || skipped.has(n)) continue;

				const d = domainSize(model, state, nc, starts[nc.length], 1);

				if (d === 0) {
					wipeout = true;
					break;
				}
			}

			if (!wipeout) {
				markNeighbours(card.id);

				return true;
			}

			undo(state, card.id);
			unplaced.set(card.id, card);
		}

		return false;
	};

	while (steps < opts.stepLimit && Date.now() < opts.deadline && !opts.shouldStop?.()) {
		steps++;
		refresh();

		const open = [...unplaced.values()].filter((c) => !skipped.has(c.id));

		if (open.length === 0) break;

		const card = pickCard(open, domains, opts.rng)!;

		if ((domains.get(card.id) ?? 0) === 0) {
			// Dead end. Backtrack through the stack while budget allows, else skip this card.
			let recovered = false;

			while (backtracks < budget && stack.length > 0) {
				backtracks++;
				const top = stack[stack.length - 1]!;

				if (advance(top)) {
					recovered = true;
					break;
				}

				stack.pop();
			}

			if (!recovered) {
				skipped.add(card.id);
				backtracks = 0;
			}

			continue;
		}

		const candidates: Frame['candidates'] = [];

		for (const s of starts[card.length]) {
			const check = canPlace(model, state, card, s, { stopAtFirst: true });

			if (check.ok) candidates.push({ slot: s, roomIds: check.roomIds });
		}

		const scored = candidates
			.map((c) => ({ c, key: softDelta(model, state, card, c.slot) + opts.rng() * 0.5 }))
			.sort((a, b) => a.key - b.key)
			.map((x) => x.c);

		const frame: Frame = { cardId: card.id, candidates: scored, next: 0 };

		if (advance(frame)) {
			stack.push(frame);

			if (state.placements.size > best.length) {
				best = [...state.placements.values()];
				backtracks = 0;
			}
		} else {
			// Every slot wiped out a neighbour — let the dead-end handling deal with it next step.
			domains.set(card.id, 0);
		}

		report();
	}

	// Return the best partial seen if we ended worse than it.
	if (state.placements.size < best.length) {
		[...state.placements.keys()].forEach((id) => undo(state, id));
		best.forEach((p) => commit(state, p));
	}

	report(true);

	return {
		placements: [...state.placements.values()],
		placed: state.placements.size,
		skipped: model.cards.filter((c) => !state.placements.has(c.id)).map((c) => c.id),
		steps
	};
}
