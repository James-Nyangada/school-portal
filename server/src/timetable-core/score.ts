import type { Card, Model } from './types';
import { coveredSlots, dayOf, periodOf } from './slots';
import { rkey, State } from './state';

/** Penalty weights. Lower total score = better timetable. */
export const WEIGHTS = {
	sameSubjectSameDay: 50,
	adjacentDays: 2,
	teacherGap: 2,
	latePeriod: 1
};

/** The lesson/group a card belongs to: "lessonId#2" → "lessonId", "G:x#1" → "G:x". */
export const cardFamily = (cardId: string) => cardId.slice(0, cardId.lastIndexOf('#'));

function teacherGaps(row: (string | null)[] | undefined, day: number, ppd: number, extra?: Set<number>): number {
	let first = -1;
	let last = -1;
	let busy = 0;

	for (let p = 0; p < ppd; p++) {
		const s = day * ppd + p;

		if (row?.[s] || extra?.has(s)) {
			if (first < 0) first = p;

			last = p;
			busy++;
		}
	}

	return first < 0 ? 0 : last - first + 1 - busy;
}

/** Cards (other than `cardId`) of the same family/subject for a class on a day. */
function classDayCards(model: Model, state: State, classId: string, day: number, exclude: string): string[] {
	const row = state.busy.get(rkey('class', classId));
	const ppd = model.config.periodsPerDay;
	const ids = new Set<string>();

	for (let p = 0; p < ppd; p++) {
		const occ = row?.[day * ppd + p];

		if (occ && occ !== exclude) ids.add(occ);
	}

	return [...ids];
}

/** Soft penalty of placing `card` at `slot` given the current state (card must not be placed). */
export function softDelta(model: Model, state: State, card: Card, slot: number): number {
	const { rules, config } = model;
	const ppd = config.periodsPerDay;
	const day = dayOf(slot, ppd);
	const family = cardFamily(card.id);
	let penalty = 0;

	if (rules.noSameSubjectTwiceADay || rules.spreadSubjects) {
		for (const c of card.classIds) {
			for (const other of classDayCards(model, state, c, day, card.id)) {
				const o = state.cardById.get(other);

				if (!o) continue;

				if (rules.noSameSubjectTwiceADay && (cardFamily(other) === family || o.subjectIds.some((s) => card.subjectIds.includes(s)))) {
					penalty += WEIGHTS.sameSubjectSameDay;
				}
			}

			if (rules.spreadSubjects) {
				for (const d of [day - 1, day + 1]) {
					if (d < 0 || d >= config.days) continue;

					if (classDayCards(model, state, c, d, card.id).some((o) => cardFamily(o) === family)) {
						penalty += WEIGHTS.adjacentDays;
					}
				}
			}
		}
	}

	if (rules.minimiseTeacherGaps) {
		const extra = new Set(coveredSlots(slot, card.length));

		for (const t of card.teacherIds) {
			const row = state.busy.get(rkey('teacher', t));
			penalty += WEIGHTS.teacherGap * (teacherGaps(row, day, ppd, extra) - teacherGaps(row, day, ppd));
		}
	}

	if (rules.preferMorning && periodOf(slot, ppd) + card.length > ppd - 2) {
		penalty += WEIGHTS.latePeriod;
	}

	return penalty;
}

/** Total soft penalty of the whole state. */
export function softScore(model: Model, state: State): number {
	const { rules, config } = model;
	const ppd = config.periodsPerDay;
	let penalty = 0;

	const classIds = new Set(model.cards.flatMap((c) => c.classIds));
	const teacherIds = new Set(model.cards.flatMap((c) => c.teacherIds));

	for (let day = 0; day < config.days; day++) {
		if (rules.noSameSubjectTwiceADay || rules.spreadSubjects) {
			for (const c of classIds) {
				const today = classDayCards(model, state, c, day, '');

				if (rules.noSameSubjectTwiceADay) {
					const seen = new Map<string, number>();

					for (const id of today) {
						const card = state.cardById.get(id);
						const keys = new Set([cardFamily(id), ...(card?.subjectIds ?? [])]);
						let clash = false;

						keys.forEach((k) => {
							if (seen.has(k)) clash = true;

							seen.set(k, (seen.get(k) ?? 0) + 1);
						});

						if (clash) penalty += WEIGHTS.sameSubjectSameDay;
					}
				}

				if (rules.spreadSubjects && day + 1 < config.days) {
					const tomorrow = new Set(classDayCards(model, state, c, day + 1, '').map(cardFamily));
					today.forEach((id) => {
						if (tomorrow.has(cardFamily(id))) penalty += WEIGHTS.adjacentDays;
					});
				}
			}
		}

		if (rules.minimiseTeacherGaps) {
			for (const t of teacherIds) {
				penalty += WEIGHTS.teacherGap * teacherGaps(state.busy.get(rkey('teacher', t)), day, ppd);
			}
		}
	}

	if (rules.preferMorning) {
		state.placements.forEach((p) => {
			const card = state.cardById.get(p.cardId);

			if (card && periodOf(p.slot, ppd) + card.length > ppd - 2) penalty += WEIGHTS.latePeriod;
		});
	}

	return penalty;
}
