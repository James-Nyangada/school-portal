import type { PrismaClient } from '@prisma/client';
import { expandLessons } from '../../timetable-core';
import { prisma, Tx } from './db';
import { loadLessons, loadLookups, loadSchedule, Lookups } from './model.service';

type Db = Tx | PrismaClient;

export interface CellLesson {
	lessonId: string;
	subjectId: string;
	subject: string;
	subjectName: string;
	color: string;
	teacherIds: string[];
	teachers: string[];
	classIds: string[];
	classes: string[];
	roomId: string | null;
	room: string | null;
}

export interface GridCell {
	entryId: string;
	cardKey: string;
	dayIndex: number;
	periodIndex: number;
	length: number;
	locked: boolean;
	lessons: CellLesson[];
}

export type GridView = 'class' | 'teacher' | 'room';

/** All placed entries of a timetable, expanded to per-lesson detail with display names. */
export async function loadCells(timetableId: string, db: Db = prisma, lookups?: Lookups) {
	const [lk, schedule, lessons, entries] = await Promise.all([
		lookups ? Promise.resolve(lookups) : loadLookups(db),
		loadSchedule(db),
		loadLessons(db, timetableId),
		db.ttEntry.findMany({ where: { timetableId }, orderBy: [{ dayIndex: 'asc' }, { periodIndex: 'asc' }] })
	]);

	const subjects = new Map(lk.subjects.map((s) => [s.id, s]));
	const teachers = new Map(lk.teachers.map((t) => [t.id, t]));
	const classes = new Map(lk.classes.map((c) => [c.id, c]));
	const rooms = new Map(lk.rooms.map((r) => [r.id, r]));
	const lessonById = new Map(lessons.map((l) => [l.id, l]));
	const cards = new Map(expandLessons(lessons).map((c) => [c.id, c]));

	const cells: GridCell[] = [];

	for (const e of entries) {
		const card = cards.get(e.cardKey);

		if (!card) continue; // stale entry for a deleted lesson

		const roomIds = (e.roomIds as (string | null)[]) ?? [];
		cells.push({
			entryId: e.id,
			cardKey: e.cardKey,
			dayIndex: e.dayIndex,
			periodIndex: e.periodIndex,
			length: e.length,
			locked: e.locked,
			lessons: card.roomNeeds.map((need, i) => {
				const l = lessonById.get(need.lessonId)!;
				const s = subjects.get(l.subjectId);
				const roomId = roomIds[i] ?? null;

				return {
					lessonId: l.id,
					subjectId: l.subjectId,
					subject: s?.short ?? '?',
					subjectName: s?.name ?? 'Unknown subject',
					color: s?.color ?? '#94a3b8',
					teacherIds: l.teacherIds,
					teachers: l.teacherIds.map((t) => teachers.get(t)?.short ?? '?'),
					classIds: l.classIds,
					classes: l.classIds.map((c) => classes.get(c)?.name ?? '?'),
					roomId,
					room: roomId ? (rooms.get(roomId)?.short || rooms.get(roomId)?.name || null) : null
				};
			})
		});
	}

	return { cells, schedule, lookups: lk, lessons, cards };
}

/** Cells for one class, teacher or room — keeping only the lessons that involve it. */
export function filterCells(cells: GridCell[], view: GridView, id: string): GridCell[] {
	return cells
		.map((c) => ({
			...c,
			lessons: c.lessons.filter((l) =>
				view === 'class' ? l.classIds.includes(id) : view === 'teacher' ? l.teacherIds.includes(id) : l.roomId === id
			)
		}))
		.filter((c) => c.lessons.length > 0);
}

export function scheduleDto(schedule: Awaited<ReturnType<typeof loadSchedule>>) {
	return {
		days: schedule.days.map((d) => ({ index: d.index, name: d.name, short: d.short })),
		periods: schedule.periods.map((p) => ({ index: p.index, name: p.name, startTime: p.startTime, endTime: p.endTime, block: p.block }))
	};
}
