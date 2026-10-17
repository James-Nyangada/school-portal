import { describe, expect, it } from 'vitest';
import { buildModel, ModelInput } from '../load';
import { coveredSlots, dayOf, mulberry32, slotIndex } from '../slots';
import { checkFeasibility } from '../feasibility';
import { generate } from '../generator/generate';
import { search } from '../generator/search';
import { cardFamily } from '../score';
import { createState, placementKeys } from '../state';
import { demoSchool } from '../fixtures/demoSchool';
import type { GenResult, Lesson, Model } from '../types';

/** Independent clash audit — does not use the validator under test. */
function assertNoClashes(model: Model, result: GenResult) {
	const seen = new Map<string, string>();
	const cards = new Map(model.cards.map((c) => [c.id, c]));

	for (const p of result.placements) {
		const card = cards.get(p.cardId)!;

		for (const s of coveredSlots(p.slot, card.length)) {
			for (const key of placementKeys(card, p.roomIds)) {
				const k = `${key}@${s}`;
				expect(seen.get(k), `${k} double-booked by ${p.cardId} and ${seen.get(k)}`).toBeUndefined();
				seen.set(k, p.cardId);
			}

			expect(dayOf(s, model.config.periodsPerDay)).toBe(dayOf(p.slot, model.config.periodsPerDay));
		}

		card.roomNeeds.forEach((need, i) => {
			if (need.roomType) expect(model.rooms.find((r) => r.id === p.roomIds[i])?.type).toBe(need.roomType);
		});
	}
}

/** Exact period counts: every lesson gets exactly periodsPerWeek periods. */
function assertPeriodCounts(model: Model, result: GenResult) {
	const counts = new Map<string, number>();
	const cards = new Map(model.cards.map((c) => [c.id, c]));
	result.placements.forEach((p) => {
		const card = cards.get(p.cardId)!;
		card.lessonIds.forEach((l) => counts.set(l, (counts.get(l) ?? 0) + card.length));
	});
	model.lessons.forEach((l) => expect(counts.get(l.id) ?? 0).toBe(l.periodsPerWeek));
}

/** A random school that is feasible by construction (loads well under capacity). */
function randomSchool(seed: number): ModelInput {
	const rng = mulberry32(seed);
	const nDays = 5;
	const ppd = 6 + Math.floor(rng() * 3);
	const nClasses = 2 + Math.floor(rng() * 4);
	const nTeachers = nClasses + 2 + Math.floor(rng() * 3);
	const lessons: Lesson[] = [];
	const teacherLoad = new Array(nTeachers).fill(0);

	for (let c = 0; c < nClasses; c++) {
		let classLoad = 0;
		const target = Math.floor(nDays * ppd * 0.6);
		let k = 0;

		while (classLoad < target) {
			const ppw = 1 + Math.floor(rng() * 4);

			if (classLoad + ppw > target) break;

			const t = teacherLoad.indexOf(Math.min(...teacherLoad));
			teacherLoad[t] += ppw;
			classLoad += ppw;
			lessons.push({
				id: `L${c}-${k++}`,
				subjectId: `S${k}`,
				classIds: [`C${c}`],
				teacherIds: [`T${t}`],
				periodsPerWeek: ppw,
				doublesPerWeek: ppw >= 3 && rng() < 0.4 ? 1 : 0,
				roomType: null,
				groupId: null
			});
		}
	}

	return {
		days: Array.from({ length: nDays }, (_, i) => ({ index: i, name: `D${i}` })),
		periods: Array.from({ length: ppd }, (_, i) => ({ index: i, name: `P${i}`, block: i < ppd / 2 ? 0 : 1 })),
		lessons,
		rooms: [],
		unavailability: [],
		rules: { respectMaxPerDay: false }
	};
}

describe('generator', () => {
	it('property: 50 random feasible schools → no clashes and exact period counts', () => {
		for (let seed = 1; seed <= 50; seed++) {
			const model = buildModel(randomSchool(seed));
			const result = generate(model, { timeLimitMs: 2000, seed, improveShare: 0.1 });
			expect(result.placed, `seed ${seed}: ${JSON.stringify(result.unplaced)}`).toBe(result.total);
			assertNoClashes(model, result);
			assertPeriodCounts(model, result);
		}
	}, 120_000);

	it('leaves locked entries untouched', () => {
		const input = randomSchool(7);
		const first = input.lessons[0]!;
		input.entries = [{ cardKey: `${first.id}#0`, dayIndex: 2, periodIndex: 4, roomIds: [null], locked: true }];
		const model = buildModel(input);
		const result = generate(model, { timeLimitMs: 2000, seed: 1 });
		const kept = result.placements.find((p) => p.cardId === `${first.id}#0`)!;
		expect(kept.slot).toBe(slotIndex(2, 4, model.config.periodsPerDay));
		expect(kept.locked).toBe(true);
		assertNoClashes(model, result);
	});

	it('search is reproducible from a seed', () => {
		const model = buildModel(randomSchool(3));
		const run = () =>
			search(model, createState(model), { rng: mulberry32(42), stepLimit: 50_000, deadline: Date.now() + 30_000 }).placements;
		expect(run()).toEqual(run());
	});

	it('the demo school solves fully, clash-free, in under 60 s', () => {
		const demo = demoSchool();
		const model = buildModel(demo.input);
		expect(checkFeasibility(model).filter((c) => c.level === 'error')).toEqual([]);
		const started = Date.now();
		const result = generate(model, { timeLimitMs: 30_000, seed: 2026 });
		expect(Date.now() - started).toBeLessThan(60_000);
		expect(result.placed, JSON.stringify(result.unplaced.slice(0, 3))).toBe(result.total);
		assertNoClashes(model, result);
		assertPeriodCounts(model, result);

		// Quality: no class has the same lesson twice in a day (doubles count as one card).
		const perClassDay = new Map<string, number>();
		const cards = new Map(model.cards.map((c) => [c.id, c]));
		result.placements.forEach((p) => {
			const card = cards.get(p.cardId)!;
			card.classIds.forEach((c) => {
				const key = `${c}|${dayOf(p.slot, model.config.periodsPerDay)}|${cardFamily(p.cardId)}`;
				perClassDay.set(key, (perClassDay.get(key) ?? 0) + 1);
			});
		});
		const repeats = [...perClassDay.values()].filter((n) => n > 1).length;
		expect(repeats).toBe(0);
	}, 90_000);

	it('reports a reason for every unplaced card when the school is infeasible', () => {
		const input = randomSchool(11);
		// Make one teacher available on Monday P1 only, with 3 lessons to teach.
		input.lessons.push({
			id: 'X',
			subjectId: 'SX',
			classIds: ['C0'],
			teacherIds: ['TX'],
			periodsPerWeek: 3,
			doublesPerWeek: 0,
			roomType: null,
			groupId: null
		});
		const ppd = input.periods.length;
		input.unavailability = Array.from({ length: 5 * ppd }, (_, s) => s)
			.filter((s) => s !== 0)
			.map((s) => ({ resourceType: 'teacher', resourceId: 'TX', dayIndex: Math.floor(s / ppd), periodIndex: s % ppd }));
		const model = buildModel(input);
		const result = generate(model, { timeLimitMs: 2000, seed: 5 });
		expect(result.placed).toBeLessThan(result.total);
		expect(result.unplaced.length).toBe(result.total - result.placed);
		result.unplaced.forEach((u) => expect(u.reasons.length).toBeGreaterThan(0));
		expect(result.unplaced.some((u) => u.reasons[0]!.includes('TX'))).toBe(true);
		assertNoClashes(model, result);
	});
});

describe('feasibility', () => {
	const base = (lessons: Lesson[], extra: Partial<ModelInput> = {}) =>
		buildModel({
			days: Array.from({ length: 5 }, (_, i) => ({ index: i, name: `D${i}` })),
			periods: Array.from({ length: 4 }, (_, i) => ({ index: i, name: `P${i}`, block: i })),
			lessons,
			rooms: [],
			unavailability: [],
			...extra
		});
	const l = (over: Partial<Lesson>): Lesson => ({
		id: 'L',
		subjectId: 'S',
		classIds: ['C'],
		teacherIds: ['T'],
		periodsPerWeek: 2,
		doublesPerWeek: 0,
		roomType: null,
		groupId: null,
		...over
	});
	const errors = (m: Model) => checkFeasibility(m).filter((c) => c.level === 'error').map((c) => c.message);

	it('flags an overloaded teacher', () => {
		const m = base([l({ id: 'a', periodsPerWeek: 12, classIds: ['A'] }), l({ id: 'b', periodsPerWeek: 12, classIds: ['B'] })]);
		expect(errors(m).join()).toMatch(/assigned 24 periods but is only available for 20/);
	});

	it('flags a missing lab', () => {
		expect(errors(base([l({ roomType: 'lab' })])).join()).toMatch(/needs a "lab" room/);
	});

	it('flags an impossible double (every period is its own block)', () => {
		expect(errors(base([l({ doublesPerWeek: 1 })])).join()).toMatch(/needs a double/);
	});

	it('flags mismatched option blocks', () => {
		const m = base([l({ id: 'a', groupId: 'g', periodsPerWeek: 3 }), l({ id: 'b', groupId: 'g', teacherIds: ['T2'], periodsPerWeek: 2 })]);
		expect(errors(m).join()).toMatch(/different periods\/doubles/);
	});

	it('flags lessons with no teacher', () => {
		expect(errors(base([l({ teacherIds: [] })])).join()).toMatch(/has no teacher/);
	});

	it('passes a sound school', () => {
		expect(errors(base([l({})]))).toEqual([]);
	});
});
