import { DEFAULT_RULES } from './types';
import type { Card, Lesson, Model, Names, Placement, Room, Rules, SchoolConfig } from './types';
import { slotIndex } from './slots';

export interface ModelInput {
	days: { index: number; name: string }[];
	periods: { index: number; name: string; block: number }[];
	lessons: Lesson[];
	rooms: Room[];
	unavailability: { resourceType: string; resourceId: string; dayIndex: number; periodIndex: number }[];
	teacherMaxPerDay?: Record<string, number>;
	teacherMaxPerWeek?: Record<string, number>;
	rules?: Partial<Rules>;
	ignoreGeneralRooms?: boolean;
	/** Entries already on the grid, keyed by card id. */
	entries?: { cardKey: string; dayIndex: number; periodIndex: number; roomIds: (string | null)[]; locked: boolean }[];
	names?: Partial<Names>;
}

/** 5 periods with 1 double → card lengths [2,1,1,1]. */
export function cardLengths(l: Pick<Lesson, 'periodsPerWeek' | 'doublesPerWeek'>): (1 | 2)[] {
	const doubles = Math.max(0, Math.min(l.doublesPerWeek, Math.floor(l.periodsPerWeek / 2)));
	const singles = l.periodsPerWeek - 2 * doubles;

	return [...Array<1 | 2>(doubles).fill(2), ...Array<1 | 2>(Math.max(0, singles)).fill(1)];
}

const uniq = <T>(xs: T[]) => [...new Set(xs)];

/**
 * Expand lessons into cards. Lessons in the same parallel group are zipped by index into
 * one combined card (they must share the same periods/doubles pattern — see feasibility).
 */
export function expandLessons(lessons: Lesson[]): Card[] {
	const cards: Card[] = [];
	const groups = new Map<string, Lesson[]>();

	for (const l of lessons) {
		if (l.groupId) {
			const g = groups.get(l.groupId) ?? [];
			g.push(l);
			groups.set(l.groupId, g);
			continue;
		}

		cardLengths(l).forEach((length, i) => {
			cards.push({
				id: `${l.id}#${i}`,
				lessonIds: [l.id],
				subjectIds: [l.subjectId],
				length,
				teacherIds: uniq(l.teacherIds),
				classIds: uniq(l.classIds),
				roomNeeds: [{ lessonId: l.id, roomType: l.roomType }]
			});
		});
	}

	for (const [groupId, members] of groups) {
		// Use the first member's pattern; mismatches are reported by feasibility and truncated here.
		const lengths = cardLengths(members[0]!);

		lengths.forEach((length, i) => {
			const active = members.filter((m) => cardLengths(m)[i] === length);
			cards.push({
				id: `G:${groupId}#${i}`,
				lessonIds: active.map((m) => m.id),
				subjectIds: uniq(active.map((m) => m.subjectId)),
				length,
				teacherIds: uniq(active.flatMap((m) => m.teacherIds)),
				classIds: uniq(active.flatMap((m) => m.classIds)),
				roomNeeds: active.map((m) => ({ lessonId: m.id, roomType: m.roomType }))
			});
		});
	}

	return cards;
}

export function buildModel(input: ModelInput): Model {
	const days = [...input.days].sort((a, b) => a.index - b.index);
	const periods = [...input.periods].sort((a, b) => a.index - b.index);
	const ppd = periods.length;

	const config: SchoolConfig = {
		days: days.length,
		periodsPerDay: ppd,
		blockOf: periods.map((p) => p.block),
		dayNames: days.map((d) => d.name),
		periodNames: periods.map((p) => p.name)
	};

	// Map stored day/period indexes onto 0-based positions.
	const dayPos = new Map(days.map((d, i) => [d.index, i]));
	const periodPos = new Map(periods.map((p, i) => [p.index, i]));

	const unavailable: Record<string, number[]> = {};

	for (const u of input.unavailability) {
		const d = dayPos.get(u.dayIndex);
		const p = periodPos.get(u.periodIndex);

		if (d === undefined || p === undefined) continue;

		const key = `${u.resourceType}:${u.resourceId}`;
		(unavailable[key] ??= []).push(slotIndex(d, p, ppd));
	}

	const cards = expandLessons(input.lessons);
	const cardIds = new Set(cards.map((c) => c.id));

	const fixed: Placement[] = [];

	for (const e of input.entries ?? []) {
		const d = dayPos.get(e.dayIndex);
		const p = periodPos.get(e.periodIndex);

		if (d === undefined || p === undefined || !cardIds.has(e.cardKey)) continue;

		fixed.push({ cardId: e.cardKey, slot: slotIndex(d, p, ppd), roomIds: e.roomIds, locked: e.locked });
	}

	return {
		config,
		rules: { ...DEFAULT_RULES, ...(input.rules ?? {}) },
		ignoreGeneralRooms: input.ignoreGeneralRooms ?? true,
		lessons: input.lessons,
		cards,
		rooms: input.rooms,
		unavailable,
		teacherMaxPerDay: input.teacherMaxPerDay ?? {},
		teacherMaxPerWeek: input.teacherMaxPerWeek ?? {},
		fixed,
		names: {
			teachers: input.names?.teachers ?? {},
			classes: input.names?.classes ?? {},
			rooms: input.names?.rooms ?? {},
			subjects: input.names?.subjects ?? {}
		}
	};
}

/** Human label for a card, e.g. "MAT · 3E (OTI)". */
export function cardLabel(model: Model, card: Card): string {
	const subj = card.subjectIds.map((s) => model.names.subjects[s] ?? s).join('/');
	const cls = card.classIds.map((c) => model.names.classes[c] ?? c).join(', ');
	const tch = card.teacherIds.map((t) => model.names.teachers[t] ?? t).join(', ');

	return `${subj} · ${cls}${tch ? ` (${tch})` : ''}${card.length === 2 ? ' · double' : ''}`;
}
