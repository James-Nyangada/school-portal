// GENERATED from server/src/timetable-core by server/scripts/sync-tt-core.js — do not edit.
/* eslint-disable */
import type { GenResult, Model, Placement, Progress } from '../types';
import { mulberry32 } from '../slots';
import { commit, createState, State, undo } from '../state';
import { softScore } from '../score';
import { search } from './search';
import { improve } from './improve';
import { explainAllUnplaced } from './reasons';

export interface GenerateOptions {
	timeLimitMs: number;
	seed?: number;
	/** Share of the time budget kept for the quality pass once everything is placed. */
	improveShare?: number;
	stepLimit?: number;
	onProgress?: (p: Progress) => void;
	shouldStop?: () => boolean;
}

/**
 * Restarts search with different seeds until a full timetable is found or time runs out,
 * keeping the best partial. The winner then gets a hill-climbing quality pass.
 * `model.fixed` must hold only the entries to keep (locked ones) — everything else is regenerated.
 */
export function generate(model: Model, opts: GenerateOptions): GenResult {
	const started = Date.now();
	const deadline = started + opts.timeLimitMs;
	const improveMs = Math.min(10_000, opts.timeLimitMs * (opts.improveShare ?? 0.2));
	const searchDeadline = deadline - improveMs;
	const baseSeed = opts.seed ?? started;
	const total = model.cards.length;

	// Once a full timetable exists, keep restarting for up to this long to find a better-scoring one.
	const qualityUntil = started + Math.min(opts.timeLimitMs * 0.5, 20_000);

	let best: { placements: Placement[]; placed: number; score: number } | null = null;
	let attempt = 0;

	while (Date.now() < searchDeadline && !opts.shouldStop?.()) {
		const rng = mulberry32(baseSeed + attempt * 7919);
		attempt++;

		const state = createState(model);
		const result = search(model, state, {
			rng,
			stepLimit: opts.stepLimit ?? Math.max(20_000, total * 20),
			deadline: searchDeadline,
			attempt,
			...(opts.onProgress ? { onProgress: opts.onProgress } : {}),
			...(opts.shouldStop ? { shouldStop: opts.shouldStop } : {})
		});

		let score = Infinity;

		if (result.placed === total) {
			improve(model, state, {
				rng,
				deadline: Math.min(Date.now() + 3000, searchDeadline),
				patience: 1500,
				...(opts.shouldStop ? { shouldStop: opts.shouldStop } : {})
			});
			score = softScore(model, state);
		}

		const placed = state.placements.size;

		if (!best || placed > best.placed || (placed === best.placed && score < best.score)) {
			best = { placements: [...state.placements.values()], placed, score };
		}

		if (best.placed === total && (best.score === 0 || Date.now() >= qualityUntil)) break;
	}

	// Rebuild the best state and give it a final polish.
	const state = createState(model);

	if (best) {
		[...state.placements.keys()].forEach((id) => undo(state, id));
		best.placements.forEach((p) => commit(state, p));
	}

	improve(model, state, {
		rng: mulberry32(baseSeed ^ 0x9e3779b9),
		deadline: Math.max(Date.now() + 500, Math.min(deadline, Date.now() + improveMs)),
		...(opts.shouldStop ? { shouldStop: opts.shouldStop } : {})
	});

	return summarise(model, state, attempt, Date.now() - started);
}

export function summarise(model: Model, state: State, attempts: number, elapsedMs: number): GenResult {
	return {
		placements: [...state.placements.values()],
		placed: state.placements.size,
		total: model.cards.length,
		score: softScore(model, state),
		unplaced: explainAllUnplaced(model, state),
		attempts,
		elapsedMs
	};
}
