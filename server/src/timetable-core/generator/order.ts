import type { Card, Model } from '../types';
import { totalSlots, validStart } from '../slots';
import { canPlace } from '../validate';
import type { State } from '../state';

/** Cards that share a teacher or class with each card — placing one shrinks the others' domains. */
export function buildNeighbours(cards: Card[]): Map<string, string[]> {
	const byResource = new Map<string, string[]>();

	for (const c of cards) {
		[...c.teacherIds.map((t) => `t:${t}`), ...c.classIds.map((k) => `c:${k}`)].forEach((key) => {
			byResource.set(key, [...(byResource.get(key) ?? []), c.id]);
		});
	}

	const neighbours = new Map<string, string[]>();

	for (const c of cards) {
		const set = new Set<string>();
		[...c.teacherIds.map((t) => `t:${t}`), ...c.classIds.map((k) => `c:${k}`)].forEach((key) =>
			byResource.get(key)?.forEach((id) => id !== c.id && set.add(id))
		);
		neighbours.set(c.id, [...set]);
	}

	return neighbours;
}

/** Start slots where a card of this length can begin at all. */
export function startSlots(model: Model, length: number): number[] {
	const out: number[] = [];

	for (let s = 0; s < totalSlots(model.config); s++) {
		if (validStart(model.config, s, length) === 'ok') out.push(s);
	}

	return out;
}

/** Live domain size: how many slots this card could go into right now. */
export function domainSize(model: Model, state: State, card: Card, starts: number[], cap = Infinity): number {
	let n = 0;

	for (const s of starts) {
		if (canPlace(model, state, card, s, { stopAtFirst: true }).ok) {
			n++;

			if (n >= cap) break;
		}
	}

	return n;
}

/**
 * Minimum-remaining-values pick. Ties: doubles first, then cards using more resources
 * (harder to fit), then random jitter so restarts explore different orders.
 */
export function pickCard(candidates: Card[], domains: Map<string, number>, rng: () => number): Card | null {
	let best: Card | null = null;
	let bestKey = Infinity;

	for (const c of candidates) {
		const d = domains.get(c.id) ?? Infinity;
		const weight = c.teacherIds.length + c.classIds.length + c.roomNeeds.length;
		const key = d * 1000 - c.length * 100 - weight * 10 + rng();

		if (key < bestKey) {
			bestKey = key;
			best = c;
		}
	}

	return best;
}
