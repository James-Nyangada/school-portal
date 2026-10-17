import { buildModel, DEFAULT_RULES } from '../../timetable-core';
import type { Lesson, Model, Rules } from '../../timetable-core';
import type { ModelInput } from '../../timetable-core/load';
import { prisma, Tx } from './db';
import type { PrismaClient } from '@prisma/client';

type Db = Tx | PrismaClient;

/**
 * Small in-process cache for data that rarely changes (bell schedule, subjects, teachers,
 * rooms, rules, unavailability, and each timetable's lessons). Every timetable write path
 * calls invalidate(); a short TTL covers edits made elsewhere in the portal (e.g. a new teacher).
 * Placed entries are never cached — they are always read fresh.
 */
const CACHE_TTL_MS = 30_000;
const cache = new Map<string, { at: number; value: Promise<unknown> }>();

function cached<T>(key: string, load: () => Promise<T>, fresh = false): Promise<T> {
	const hit = cache.get(key);

	if (!fresh && hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value as Promise<T>;

	const value = load();
	cache.set(key, { at: Date.now(), value });
	value.catch(() => cache.delete(key));

	return value;
}

/** Drop cached data. No argument = everything; 'setup' = shared setup data; a timetable id = its lessons. */
export function invalidate(scope?: string) {
	if (!scope) return cache.clear();

	[...cache.keys()].filter((k) => k.startsWith(scope === 'setup' ? 'setup:' : `lessons:${scope}`)).forEach((k) => cache.delete(k));
}

export const initials = (first?: string | null, last?: string | null, fallback = '?') =>
	`${(first ?? '').charAt(0)}${(last ?? '').slice(0, 2)}`.toUpperCase() || fallback;

export async function getSettings(db: Db = prisma, fresh = false): Promise<{ ignoreGeneralRooms: boolean; rules: Rules }> {
	const row = await cached('setup:settings', () => db.ttSettings.findUnique({ where: { id: 1 } }), fresh);

	return {
		ignoreGeneralRooms: row?.ignoreGeneralRooms ?? true,
		rules: { ...DEFAULT_RULES, ...((row?.rules as Partial<Rules> | null) ?? {}) }
	};
}

/** Display metadata the UI needs for every subject, teacher, class and room. */
export async function loadLookups(db: Db = prisma, fresh = false) {
	return cached('setup:lookups', () => queryLookups(db), fresh);
}

async function queryLookups(db: Db) {
	const [subjects, teachers, classes, rooms] = await Promise.all([
		db.subject.findMany({ include: { ttInfo: true }, orderBy: { name: 'asc' } }),
		db.user.findMany({
			where: { role: 'TEACHER' },
			select: {
				id: true,
				firstName: true,
				lastName: true,
				email: true,
				status: true,
				ttTeacherInfo: true,
				teachesSubjects: { select: { subjectId: true } }
			},
			orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }]
		}),
		db.class.findMany({ orderBy: [{ level: 'asc' }, { name: 'asc' }] }),
		db.ttRoom.findMany({ orderBy: { name: 'asc' } })
	]);

	return {
		subjects: subjects.map((s) => ({
			id: s.id,
			name: s.name,
			code: s.code,
			short: s.ttInfo?.short ?? s.code,
			color: s.ttInfo?.color ?? '#3b82f6',
			roomType: s.ttInfo?.roomType ?? null
		})),
		teachers: teachers.map((t) => ({
			id: t.id,
			name: [t.firstName, t.lastName].filter(Boolean).join(' ') || t.email || 'Teacher',
			email: t.email,
			status: t.status,
			short: t.ttTeacherInfo?.short ?? initials(t.firstName, t.lastName),
			maxPerDay: t.ttTeacherInfo?.maxPerDay ?? null,
			maxPerWeek: t.ttTeacherInfo?.maxPerWeek ?? null,
			subjectIds: t.teachesSubjects.map((s) => s.subjectId)
		})),
		classes: classes.map((c) => ({ id: c.id, name: c.name, level: c.level })),
		rooms: rooms.map((r) => ({ id: r.id, name: r.name, short: r.short, type: r.type, capacity: r.capacity }))
	};
}

export type Lookups = Awaited<ReturnType<typeof queryLookups>>;

export async function loadSchedule(db: Db = prisma, fresh = false) {
	return cached(
		'setup:schedule',
		async () => {
			const [days, periods, breaks] = await Promise.all([
				db.ttDay.findMany({ orderBy: { index: 'asc' } }),
				db.ttPeriod.findMany({ orderBy: { index: 'asc' } }),
				db.ttBreak.findMany({ orderBy: { afterIndex: 'asc' } })
			]);

			return { days, periods, breaks };
		},
		fresh
	);
}

export async function loadUnavailability(db: Db = prisma, fresh = false) {
	return cached('setup:unavailability', () => db.ttUnavailability.findMany(), fresh);
}

export async function loadLessons(db: Db, timetableId: string, fresh = false): Promise<Lesson[]> {
	return cached(`lessons:${timetableId}`, () => queryLessons(db, timetableId), fresh);
}

async function queryLessons(db: Db, timetableId: string): Promise<Lesson[]> {
	const rows = await db.ttLesson.findMany({
		where: { timetableId },
		include: { classes: true, teachers: true, subject: { include: { ttInfo: true } } },
		orderBy: { createdAt: 'asc' }
	});

	return rows.map((l) => ({
		id: l.id,
		subjectId: l.subjectId,
		classIds: l.classes.map((c) => c.classId),
		teacherIds: l.teachers.map((t) => t.teacherId),
		periodsPerWeek: l.periodsPerWeek,
		doublesPerWeek: l.doublesPerWeek,
		roomType: l.roomType ?? l.subject.ttInfo?.roomType ?? null,
		groupId: l.groupId
	}));
}

export type EntryMode = 'all' | 'locked' | 'none';

/**
 * Load everything the core needs for one timetable straight from the database.
 * `entries`: which saved entries become fixed placements ('locked' for generation).
 */
export async function loadModel(
	timetableId: string,
	opts: { entries?: EntryMode; db?: Db } = {}
): Promise<{ model: Model; input: ModelInput; lookups: Lookups; schedule: Awaited<ReturnType<typeof loadSchedule>> }> {
	const db = opts.db ?? prisma;
	const mode = opts.entries ?? 'all';

	const [schedule, lookups, lessons, unavailability, settings, entries] = await Promise.all([
		loadSchedule(db),
		loadLookups(db),
		loadLessons(db, timetableId),
		loadUnavailability(db),
		getSettings(db),
		mode === 'none' ? Promise.resolve([]) : db.ttEntry.findMany({ where: { timetableId, ...(mode === 'locked' ? { locked: true } : {}) } })
	]);

	const input: ModelInput = {
		days: schedule.days.map((d) => ({ index: d.index, name: d.name })),
		periods: schedule.periods.map((p) => ({ index: p.index, name: p.name, block: p.block })),
		lessons,
		rooms: lookups.rooms.map((r) => ({ id: r.id, type: r.type })),
		unavailability,
		teacherMaxPerDay: Object.fromEntries(lookups.teachers.filter((t) => t.maxPerDay).map((t) => [t.id, t.maxPerDay!])),
		teacherMaxPerWeek: Object.fromEntries(lookups.teachers.filter((t) => t.maxPerWeek).map((t) => [t.id, t.maxPerWeek!])),
		rules: settings.rules,
		ignoreGeneralRooms: settings.ignoreGeneralRooms,
		entries: entries.map((e) => ({
			cardKey: e.cardKey,
			dayIndex: e.dayIndex,
			periodIndex: e.periodIndex,
			roomIds: (e.roomIds as (string | null)[]) ?? [],
			locked: e.locked
		})),
		names: {
			teachers: Object.fromEntries(lookups.teachers.map((t) => [t.id, t.short])),
			classes: Object.fromEntries(lookups.classes.map((c) => [c.id, c.name])),
			rooms: Object.fromEntries(lookups.rooms.map((r) => [r.id, r.short || r.name])),
			subjects: Object.fromEntries(lookups.subjects.map((s) => [s.id, s.short]))
		}
	};

	return { model: buildModel(input), input, lookups, schedule };
}
