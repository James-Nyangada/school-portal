// GENERATED from server/src/timetable-core by server/scripts/sync-tt-core.js — do not edit.
/* eslint-disable */
import type { Model } from './types';
import { cardLengths } from './load';
import { totalSlots } from './slots';
import { neededRoomType } from './validate';

export interface Check {
	level: 'ok' | 'warn' | 'error';
	message: string;
	/** Where in the UI the admin can fix it. */
	link?: { kind: 'lesson' | 'teacher' | 'class' | 'room' | 'setup' | 'group' | 'subject'; id?: string };
	/** A second way to fix it (e.g. add the missing room OR change the subject's room type). */
	altLink?: { kind: 'lesson' | 'teacher' | 'class' | 'room' | 'setup' | 'group' | 'subject'; id?: string };
}

/**
 * Pre-flight checks run before generation. Errors make a full timetable impossible and block
 * the Generate button; warnings flag things likely to leave cards unplaced.
 */
export function checkFeasibility(model: Model): Check[] {
	const checks: Check[] = [];
	const cfg = model.config;
	const n = totalSlots(cfg);
	const name = (kind: 'teachers' | 'classes' | 'subjects', id: string) => model.names[kind][id] ?? id;

	if (cfg.days === 0 || cfg.periodsPerDay === 0) {
		checks.push({ level: 'error', message: 'Set up school days and periods (bell schedule) first.', link: { kind: 'setup' } });

		return checks;
	}

	if (model.lessons.length === 0) {
		checks.push({ level: 'error', message: 'No lessons have been added to this timetable yet.', link: { kind: 'lesson' } });

		return checks;
	}

	const unavailableCount = (type: string, id: string) => new Set(model.unavailable[`${type}:${id}`] ?? []).size;

	// Lesson-level data problems.
	const hasDoubleSlot = cfg.blockOf.some((b, p) => p + 1 < cfg.periodsPerDay && cfg.blockOf[p + 1] === b);

	// Missing room types are reported once per subject, not once per class.
	const missingRoom = new Map<string, { subjectId: string; type: string; classes: string[] }>();

	for (const l of model.lessons) {
		const label = `${name('subjects', l.subjectId)} for ${l.classIds.map((c) => name('classes', c)).join(', ') || '(no class)'}`;

		if (l.teacherIds.length === 0) checks.push({ level: 'error', message: `${label} has no teacher.`, link: { kind: 'lesson', id: l.id } });

		if (l.classIds.length === 0) checks.push({ level: 'error', message: `${name('subjects', l.subjectId)} lesson has no class.`, link: { kind: 'lesson', id: l.id } });

		if (l.periodsPerWeek <= 0) checks.push({ level: 'error', message: `${label} has 0 periods per week.`, link: { kind: 'lesson', id: l.id } });

		if (l.doublesPerWeek * 2 > l.periodsPerWeek) {
			checks.push({ level: 'error', message: `${label}: ${l.doublesPerWeek} doubles need at least ${l.doublesPerWeek * 2} periods.`, link: { kind: 'lesson', id: l.id } });
		}

		if (l.doublesPerWeek > 0 && !hasDoubleSlot) {
			checks.push({ level: 'error', message: `${label} needs a double, but no two periods sit together without a break.`, link: { kind: 'setup' } });
		}

		const type = neededRoomType(model, l.roomType);

		if (type && !model.rooms.some((r) => r.type === type)) {
			const key = `${l.subjectId}|${type}`;
			const entry = missingRoom.get(key) ?? { subjectId: l.subjectId, type, classes: [] };
			entry.classes.push(...l.classIds.map((c) => name('classes', c)));
			missingRoom.set(key, entry);
		}

		if (model.rules.noSameSubjectTwiceADay && cardLengths(l).length > cfg.days) {
			checks.push({
				level: 'warn',
				message: `${label} has ${cardLengths(l).length} separate lessons but only ${cfg.days} days — the same subject will appear twice on some day.`,
				link: { kind: 'lesson', id: l.id }
			});
		}
	}

	missingRoom.forEach(({ subjectId, type, classes }) => {
		const subject = name('subjects', subjectId);
		const list = [...new Set(classes)];
		const shown = list.length > 4 ? `${list.slice(0, 4).join(', ')} and ${list.length - 4} more` : list.join(', ');
		checks.push({
			level: 'error',
			message: `${subject} needs a "${type}" room (${shown}), but no room has that type. Add a "${type}" room, or change ${subject}'s room type to classroom.`,
			link: { kind: 'room', id: type },
			altLink: { kind: 'subject', id: subjectId }
		});
	});

	// Parallel groups must share a pattern.
	const groups = new Map<string, typeof model.lessons>();
	model.lessons.forEach((l) => l.groupId && groups.set(l.groupId, [...(groups.get(l.groupId) ?? []), l]));
	groups.forEach((members, gid) => {
		const pattern = (l: (typeof members)[number]) => `${l.periodsPerWeek}/${l.doublesPerWeek}`;

		if (new Set(members.map(pattern)).size > 1) {
			checks.push({
				level: 'error',
				message: `Option block has lessons with different periods/doubles (${members.map(pattern).join(', ')}). All lessons in a block must match.`,
				link: { kind: 'group', id: gid }
			});
		}

		const teachers = members.flatMap((m) => m.teacherIds);

		if (new Set(teachers).size < teachers.length) {
			checks.push({ level: 'error', message: 'A teacher appears twice in the same option block — they cannot teach two groups at once.', link: { kind: 'group', id: gid } });
		}
	});

	// Load vs availability, per resource, counted per card (a group occupies a class once).
	const teacherLoad = new Map<string, number>();
	const classLoad = new Map<string, number>();
	const roomDemand = new Map<string, number>();

	for (const card of model.cards) {
		card.teacherIds.forEach((t) => teacherLoad.set(t, (teacherLoad.get(t) ?? 0) + card.length));
		card.classIds.forEach((c) => classLoad.set(c, (classLoad.get(c) ?? 0) + card.length));
		card.roomNeeds.forEach((need) => {
			const type = neededRoomType(model, need.roomType);

			if (type) roomDemand.set(type, (roomDemand.get(type) ?? 0) + card.length);
		});
	}

	teacherLoad.forEach((load, t) => {
		const available = n - unavailableCount('teacher', t);
		const maxWeek = model.teacherMaxPerWeek[t];
		const maxDay = model.teacherMaxPerDay[t];

		if (load > available) {
			checks.push({ level: 'error', message: `${name('teachers', t)} is assigned ${load} periods but is only available for ${available}.`, link: { kind: 'teacher', id: t } });
		} else if (maxWeek && load > maxWeek) {
			checks.push({ level: 'error', message: `${name('teachers', t)} is assigned ${load} periods, above their weekly maximum of ${maxWeek}.`, link: { kind: 'teacher', id: t } });
		} else if (model.rules.respectMaxPerDay && maxDay && load > maxDay * cfg.days) {
			checks.push({ level: 'error', message: `${name('teachers', t)} needs ${load} periods but can teach at most ${maxDay}/day × ${cfg.days} days.`, link: { kind: 'teacher', id: t } });
		} else if (load > available * 0.9) {
			checks.push({ level: 'warn', message: `${name('teachers', t)} is nearly fully booked (${load} of ${available} periods).`, link: { kind: 'teacher', id: t } });
		}
	});

	classLoad.forEach((load, c) => {
		const available = n - unavailableCount('class', c);

		if (load > available) {
			checks.push({ level: 'error', message: `${name('classes', c)} has ${load} periods of lessons but only ${available} periods in the week.`, link: { kind: 'class', id: c } });
		}
	});

	roomDemand.forEach((demand, type) => {
		const rooms = model.rooms.filter((r) => r.type === type);
		const capacity = rooms.reduce((sum, r) => sum + n - unavailableCount('room', r.id), 0);

		if (rooms.length > 0 && demand > capacity) {
			checks.push({ level: 'error', message: `"${type}" rooms are needed for ${demand} periods but only ${capacity} room-periods exist.`, link: { kind: 'room' } });
		} else if (rooms.length > 0 && demand > capacity * 0.85) {
			checks.push({ level: 'warn', message: `"${type}" rooms are ${Math.round((demand / capacity) * 100)}% booked — expect a tight fit.`, link: { kind: 'room' } });
		}
	});

	if (!checks.some((c) => c.level === 'error')) {
		checks.unshift({ level: 'ok', message: `${model.cards.length} lesson cards across ${classLoad.size} classes and ${teacherLoad.size} teachers look feasible.` });
	}

	return checks;
}
