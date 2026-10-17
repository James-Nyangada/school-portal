import { describe, expect, it } from 'vitest';
import { buildModel, cardLengths, expandLessons, ModelInput } from '../load';
import { sameBlock, slotIndex, validStart } from '../slots';
import { clone, commit, createState, rkey, undo } from '../state';
import { canPlace, explain, findRooms } from '../validate';
import type { Lesson } from '../types';

const days = ['Mon', 'Tue', 'Wed'].map((name, index) => ({ index, name }));
// 6 periods: block 0 = P1-P3, break, block 1 = P4-P6
const periods = Array.from({ length: 6 }, (_, i) => ({ index: i, name: `P${i + 1}`, block: i < 3 ? 0 : 1 }));

const lesson = (over: Partial<Lesson> & { id: string }): Lesson => ({
	subjectId: 'MAT',
	classIds: ['1A'],
	teacherIds: ['T1'],
	periodsPerWeek: 1,
	doublesPerWeek: 0,
	roomType: null,
	groupId: null,
	...over
});

const model = (lessons: Lesson[], extra: Partial<ModelInput> = {}) =>
	buildModel({ days, periods, lessons, rooms: [], unavailability: [], ...extra });

describe('slot math', () => {
	const cfg = model([]).config;

	it('computes slot indexes', () => {
		expect(slotIndex(1, 2, 6)).toBe(8);
	});

	it('a double never wraps to the next day', () => {
		expect(validStart(cfg, slotIndex(0, 5, 6), 2)).toBe('double_day_end');
		expect(validStart(cfg, slotIndex(2, 5, 6), 2)).toBe('double_day_end');
	});

	it('a double across a break is rejected', () => {
		expect(sameBlock(cfg, slotIndex(0, 2, 6))).toBe(false);
		expect(validStart(cfg, slotIndex(0, 2, 6), 2)).toBe('double_break');
		expect(validStart(cfg, slotIndex(0, 1, 6), 2)).toBe('ok');
	});

	it('rejects slots outside the week', () => {
		expect(validStart(cfg, 999, 1)).toBe('out_of_range');
	});
});

describe('card expansion', () => {
	it('5 periods with 1 double → [2,1,1,1]', () => {
		expect(cardLengths({ periodsPerWeek: 5, doublesPerWeek: 1 })).toEqual([2, 1, 1, 1]);
	});

	it('zips a parallel group into combined cards', () => {
		const cards = expandLessons([
			lesson({ id: 'a', subjectId: 'PHY', teacherIds: ['T1'], classIds: ['3A', '3B'], periodsPerWeek: 2, groupId: 'g' }),
			lesson({ id: 'b', subjectId: 'GEO', teacherIds: ['T2'], classIds: ['3A', '3B'], periodsPerWeek: 2, groupId: 'g' })
		]);
		expect(cards).toHaveLength(2);
		expect(cards[0]!.teacherIds).toEqual(['T1', 'T2']);
		expect(cards[0]!.classIds).toEqual(['3A', '3B']);
		expect(cards[0]!.roomNeeds).toHaveLength(2);
	});
});

describe('canPlace', () => {
	it('rejects a teacher clash with the right reason', () => {
		const m = model([lesson({ id: 'a' }), lesson({ id: 'b', classIds: ['1B'] })]);
		const s = createState(m);
		commit(s, { cardId: 'a#0', slot: 0, roomIds: [null], locked: false });
		const r = canPlace(m, s, s.cardById.get('b#0')!, 0);
		expect(r.ok).toBe(false);
		expect(r.reasons[0]!.code).toBe('teacher_busy');
		expect(r.reasons[0]!.otherCardId).toBe('a#0');
	});

	it('rejects a class clash', () => {
		const m = model([lesson({ id: 'a' }), lesson({ id: 'b', teacherIds: ['T2'] })]);
		const s = createState(m);
		commit(s, { cardId: 'a#0', slot: 3, roomIds: [null], locked: false });
		const r = canPlace(m, s, s.cardById.get('b#0')!, 3);
		expect(r.reasons.map((x) => x.code)).toEqual(['class_busy']);
	});

	it('rejects a room clash when only one room of the type exists', () => {
		const m = model(
			[lesson({ id: 'a', roomType: 'lab' }), lesson({ id: 'b', roomType: 'lab', classIds: ['1B'], teacherIds: ['T2'] })],
			{ rooms: [{ id: 'L1', type: 'lab' }] }
		);
		const s = createState(m);
		const first = canPlace(m, s, s.cardById.get('a#0')!, 0);
		expect(first.roomIds).toEqual(['L1']);
		commit(s, { cardId: 'a#0', slot: 0, roomIds: first.roomIds, locked: false });
		const r = canPlace(m, s, s.cardById.get('b#0')!, 0);
		expect(r.reasons.map((x) => x.code)).toEqual(['room_none']);
	});

	it('respects unavailability', () => {
		const m = model([lesson({ id: 'a' })], {
			unavailability: [{ resourceType: 'teacher', resourceId: 'T1', dayIndex: 0, periodIndex: 0 }]
		});
		const s = createState(m);
		expect(canPlace(m, s, s.cardById.get('a#0')!, 0).reasons[0]!.code).toBe('teacher_unavailable');
		expect(canPlace(m, s, s.cardById.get('a#0')!, 1).ok).toBe(true);
	});

	it('a double checks both periods', () => {
		const m = model([lesson({ id: 'a', periodsPerWeek: 2, doublesPerWeek: 1 }), lesson({ id: 'b', teacherIds: ['T2'] })]);
		const s = createState(m);
		commit(s, { cardId: 'b#0', slot: 1, roomIds: [null], locked: false });
		expect(canPlace(m, s, s.cardById.get('a#0')!, 0).ok).toBe(false);
		expect(canPlace(m, s, s.cardById.get('a#0')!, 3).ok).toBe(true);
	});

	it('a parallel group occupies the class once, all teachers, one room each', () => {
		const m = model(
			[
				lesson({ id: 'a', subjectId: 'PHY', teacherIds: ['T1'], classIds: ['3A'], roomType: 'lab', groupId: 'g' }),
				lesson({ id: 'b', subjectId: 'CHE', teacherIds: ['T2'], classIds: ['3A'], roomType: 'lab', groupId: 'g' })
			],
			{ rooms: [{ id: 'L1', type: 'lab' }, { id: 'L2', type: 'lab' }] }
		);
		const s = createState(m);
		const card = s.cardById.get('G:g#0')!;
		const r = canPlace(m, s, card, 0);
		expect(r.ok).toBe(true);
		expect(new Set(r.roomIds)).toEqual(new Set(['L1', 'L2']));
		commit(s, { cardId: card.id, slot: 0, roomIds: r.roomIds, locked: false });
		expect(s.busy.get(rkey('class', '3A'))![0]).toBe('G:g#0');
		expect(s.busy.get(rkey('teacher', 'T1'))![0]).toBe('G:g#0');
		expect(s.busy.get(rkey('teacher', 'T2'))![0]).toBe('G:g#0');
	});

	it('combined classes (two classes, one lesson) block both classes', () => {
		const m = model([lesson({ id: 'a', classIds: ['1A', '1B'] }), lesson({ id: 'b', classIds: ['1B'], teacherIds: ['T2'] })]);
		const s = createState(m);
		commit(s, { cardId: 'a#0', slot: 0, roomIds: [null], locked: false });
		expect(canPlace(m, s, s.cardById.get('b#0')!, 0).reasons[0]!.code).toBe('class_busy');
	});

	it('respects a teacher daily maximum', () => {
		const m = model([lesson({ id: 'a', periodsPerWeek: 3 })], { teacherMaxPerDay: { T1: 2 } });
		const s = createState(m);
		commit(s, { cardId: 'a#0', slot: 0, roomIds: [null], locked: false });
		commit(s, { cardId: 'a#1', slot: 1, roomIds: [null], locked: false });
		expect(canPlace(m, s, s.cardById.get('a#2')!, 2).reasons[0]!.code).toBe('teacher_max_day');
		expect(canPlace(m, s, s.cardById.get('a#2')!, 6).ok).toBe(true);
	});
});

describe('state', () => {
	it('commit followed by undo restores the exact previous state', () => {
		const m = model([lesson({ id: 'a' }), lesson({ id: 'b', classIds: ['1B'], teacherIds: ['T2'] })]);
		const s = createState(m);
		commit(s, { cardId: 'a#0', slot: 2, roomIds: [null], locked: false });
		const before = clone(s);
		commit(s, { cardId: 'b#0', slot: 2, roomIds: [null], locked: false });
		undo(s, 'b#0');
		expect([...s.placements.keys()]).toEqual([...before.placements.keys()]);
		s.busy.forEach((row, key) => expect(row).toEqual(before.busy.get(key) ?? row.map(() => null)));
	});

	it('refuses to commit a clash', () => {
		const m = model([lesson({ id: 'a' }), lesson({ id: 'b', classIds: ['1B'] })]);
		const s = createState(m);
		commit(s, { cardId: 'a#0', slot: 0, roomIds: [null], locked: false });
		expect(() => commit(s, { cardId: 'b#0', slot: 0, roomIds: [null], locked: false })).toThrow();
	});

	it('drops saved entries that now clash instead of corrupting state', () => {
		const m = model([lesson({ id: 'a' }), lesson({ id: 'b', classIds: ['1B'] })], {
			entries: [
				{ cardKey: 'a#0', dayIndex: 0, periodIndex: 0, roomIds: [null], locked: true },
				{ cardKey: 'b#0', dayIndex: 0, periodIndex: 0, roomIds: [null], locked: false }
			]
		});
		const s = createState(m);
		expect(s.placements.size).toBe(1);
		expect(s.dropped).toHaveLength(1);
	});
});

describe('edge cases', () => {
	it('respects class unavailability and explains it', () => {
		const m = model([lesson({ id: 'a' })], {
			unavailability: [{ resourceType: 'class', resourceId: '1A', dayIndex: 1, periodIndex: 0 }],
			names: { classes: { '1A': 'Form 1A' } }
		});
		const s = createState(m);
		const r = canPlace(m, s, s.cardById.get('a#0')!, 6);
		expect(r.reasons[0]!.code).toBe('class_unavailable');
		expect(explain(r)).toBe('Form 1A is unavailable at this time');
		expect(explain(canPlace(m, s, s.cardById.get('a#0')!, 0))).toBe('OK');
	});

	it('needs a general room when general rooms are not ignored', () => {
		const m = model([lesson({ id: 'a' })], { ignoreGeneralRooms: false, rooms: [{ id: 'R1', type: 'general' }] });
		const s = createState(m);
		expect(canPlace(m, s, s.cardById.get('a#0')!, 0).roomIds).toEqual(['R1']);
	});

	it('keeps a preferred room when it is free', () => {
		const m = model([lesson({ id: 'a', roomType: 'lab' })], { rooms: [{ id: 'L1', type: 'lab' }, { id: 'L2', type: 'lab' }] });
		const s = createState(m);
		expect(findRooms(m, s, s.cardById.get('a#0')!, 0, ['L2']).roomIds).toEqual(['L2']);
	});

	it('stops at the first reason when asked', () => {
		const m = model([lesson({ id: 'a', teacherIds: ['T1', 'T2'] })], {
			unavailability: [
				{ resourceType: 'teacher', resourceId: 'T1', dayIndex: 0, periodIndex: 0 },
				{ resourceType: 'teacher', resourceId: 'T2', dayIndex: 0, periodIndex: 0 }
			]
		});
		const s = createState(m);
		expect(canPlace(m, s, s.cardById.get('a#0')!, 0, { stopAtFirst: true }).reasons).toHaveLength(1);
		expect(canPlace(m, s, s.cardById.get('a#0')!, 0).reasons).toHaveLength(2);
	});

	it('guards commit and undo against bad input', () => {
		const m = model([lesson({ id: 'a' })]);
		const s = createState(m);
		expect(() => commit(s, { cardId: 'nope', slot: 0, roomIds: [], locked: false })).toThrow(/Unknown card/);
		commit(s, { cardId: 'a#0', slot: 0, roomIds: [null], locked: false });
		expect(() => commit(s, { cardId: 'a#0', slot: 1, roomIds: [null], locked: false })).toThrow(/already placed/);
		expect(undo(s, 'nope')).toBeNull();
		expect(undo(s, 'a#0')?.slot).toBe(0);
	});
});

