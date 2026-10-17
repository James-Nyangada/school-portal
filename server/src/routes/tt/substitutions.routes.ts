import { Router } from 'express';
import { z } from 'zod';
import { requireRole, AuthRequest } from '../../middleware/auth';
import { audit, HttpError, prisma } from '../../services/tt/db';
import { loadCells, scheduleDto } from '../../services/tt/grid.service';
import { loadLookups } from '../../services/tt/model.service';

const router = Router();
const admin = requireRole('ADMIN');
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');

const toDate = (iso: string) => new Date(`${iso}T00:00:00Z`);
const weekdayOf = (d: Date) => (d.getUTCDay() + 6) % 7; // Monday = 0

async function publishedTimetable() {
	const tt = await prisma.ttTimetable.findFirst({ where: { status: 'published' }, orderBy: { publishedAt: 'desc' } });

	if (!tt) throw new HttpError(409, 'Publish a timetable before planning substitutions.');

	return tt;
}

/** Mark a teacher absent for a date: one substitution row per lesson they teach that day. */
router.post('/absence', admin, async (req: AuthRequest, res) => {
	const { teacherId, date } = z.object({ teacherId: z.string().min(1), date: dateSchema }).parse(req.body);
	const tt = await publishedTimetable();
	const day = toDate(date);
	const days = await prisma.ttDay.findMany({ orderBy: { index: 'asc' } });
	const dayRow = days[weekdayOf(day)];

	if (!dayRow) throw new HttpError(400, 'That date is not a school day on the timetable.');

	const entryIds = await prisma.ttOccupancy.findMany({
		where: { timetableId: tt.id, resourceType: 'teacher', resourceId: teacherId, dayIndex: dayRow.index },
		select: { entryId: true },
		distinct: ['entryId']
	});

	await prisma.ttSubstitution.createMany({
		data: entryIds.map((e) => ({ timetableId: tt.id, date: day, entryId: e.entryId, absentTeacherId: teacherId })),
		skipDuplicates: true
	});
	await audit(prisma, req.user?.id, 'TEACHER_ABSENT', tt.id, { teacherId, date, lessons: entryIds.length });
	res.json({ ok: true, lessons: entryIds.length });
});

/**
 * Affected lessons for a date, each with free teachers ranked by:
 * (a) teaches the same subject, (b) fewest lessons that day, (c) fewest covers this week.
 */
router.get('/', admin, async (req, res) => {
	const date = dateSchema.parse(req.query.date);
	const tt = await prisma.ttTimetable.findFirst({ where: { status: 'published' }, orderBy: { publishedAt: 'desc' } });

	if (!tt) return res.json({ timetable: null, rows: [], days: [], periods: [] });

	const day = toDate(date);
	const monday = new Date(day);
	monday.setUTCDate(day.getUTCDate() - weekdayOf(day));
	const sunday = new Date(monday);
	sunday.setUTCDate(monday.getUTCDate() + 6);

	const [subs, weekCovers, lookups, { cells, schedule }, unavailable] = await Promise.all([
		prisma.ttSubstitution.findMany({ where: { timetableId: tt.id, date: day } }),
		prisma.ttSubstitution.findMany({ where: { date: { gte: monday, lte: sunday }, coverTeacherId: { not: null } } }),
		loadLookups(),
		loadCells(tt.id),
		prisma.ttUnavailability.findMany({ where: { resourceType: 'teacher' } })
	]);

	const dto = scheduleDto(schedule);
	const dayRow = dto.days[weekdayOf(day)];
	const byEntry = new Map(cells.map((c) => [c.entryId, c]));
	const todayCells = dayRow ? cells.filter((c) => c.dayIndex === dayRow.index) : [];

	// Teacher busy periods today = their own lessons + covers already assigned today.
	const busy = new Map<string, Set<number>>();
	const mark = (t: string, from: number, len: number) => {
		const set = busy.get(t) ?? new Set<number>();

		for (let p = from; p < from + len; p++) set.add(p);

		busy.set(t, set);
	};
	todayCells.forEach((c) => c.lessons.forEach((l) => l.teacherIds.forEach((t) => mark(t, c.periodIndex, c.length))));
	subs.forEach((s) => {
		const c = byEntry.get(s.entryId);

		if (c && s.coverTeacherId) mark(s.coverTeacherId, c.periodIndex, c.length);
	});

	const lessonsToday = new Map<string, number>();
	todayCells.forEach((c) => c.lessons.forEach((l) => l.teacherIds.forEach((t) => lessonsToday.set(t, (lessonsToday.get(t) ?? 0) + c.length))));
	const coversThisWeek = new Map<string, number>();
	weekCovers.forEach((s) => coversThisWeek.set(s.coverTeacherId!, (coversThisWeek.get(s.coverTeacherId!) ?? 0) + 1));
	const subjectsTaught = new Map<string, Set<string>>();
	cells.forEach((c) => c.lessons.forEach((l) => l.teacherIds.forEach((t) => subjectsTaught.set(t, (subjectsTaught.get(t) ?? new Set()).add(l.subjectId)))));
	const absentToday = new Set(subs.map((s) => s.absentTeacherId));

	const rows = subs
		.map((s) => {
			const cell = byEntry.get(s.entryId);

			if (!cell) return null;

			const subjectIds = new Set(cell.lessons.map((l) => l.subjectId));
			const span = Array.from({ length: cell.length }, (_, i) => cell.periodIndex + i);
			const suggestions = lookups.teachers
				.filter((t) => t.status === 'ACTIVE' || t.status === 'PENDING_ACTIVATION')
				.filter((t) => !absentToday.has(t.id))
				.filter((t) => t.id === s.coverTeacherId || !span.some((p) => busy.get(t.id)?.has(p)))
				.filter((t) => !span.some((p) => unavailable.some((u) => u.resourceId === t.id && u.dayIndex === cell.dayIndex && u.periodIndex === p)))
				.map((t) => ({
					teacherId: t.id,
					name: t.name,
					short: t.short,
					sameSubject: [...subjectIds].some((sid) => subjectsTaught.get(t.id)?.has(sid)),
					lessonsToday: lessonsToday.get(t.id) ?? 0,
					coversThisWeek: coversThisWeek.get(t.id) ?? 0
				}))
				.sort(
					(a, b) =>
						Number(b.sameSubject) - Number(a.sameSubject) || a.lessonsToday - b.lessonsToday || a.coversThisWeek - b.coversThisWeek
				)
				.slice(0, 15);

			const lesson = cell.lessons.find((l) => l.teacherIds.includes(s.absentTeacherId)) ?? cell.lessons[0]!;

			return {
				id: s.id,
				entryId: s.entryId,
				absentTeacherId: s.absentTeacherId,
				absentTeacher: lookups.teachers.find((t) => t.id === s.absentTeacherId)?.name ?? '?',
				coverTeacherId: s.coverTeacherId,
				note: s.note,
				periodIndex: cell.periodIndex,
				length: cell.length,
				period: dto.periods.find((p) => p.index === cell.periodIndex),
				subject: lesson.subjectName,
				subjectShort: lesson.subject,
				color: lesson.color,
				classes: lesson.classes,
				room: lesson.room,
				suggestions
			};
		})
		.filter((r): r is NonNullable<typeof r> => Boolean(r))
		.sort((a, b) => a.periodIndex - b.periodIndex);

	res.json({ timetable: { id: tt.id, name: tt.name }, day: dayRow?.name ?? null, rows, ...dto });
});

router.post('/:id/assign', admin, async (req: AuthRequest, res) => {
	const { coverTeacherId, note } = z.object({ coverTeacherId: z.string().nullable(), note: z.string().max(200).optional() }).parse(req.body);
	const sub = await prisma.ttSubstitution.findUnique({ where: { id: req.params.id as string }, include: { entry: true } });

	if (!sub) throw new HttpError(404, 'Substitution not found');

	if (coverTeacherId) {
		if (coverTeacherId === sub.absentTeacherId) throw new HttpError(400, 'The absent teacher cannot cover their own lesson.');

		// The cover must be free for every period of the lesson (own lessons + other covers).
		const span = Array.from({ length: sub.entry.length }, (_, i) => sub.entry.periodIndex + i);
		const own = await prisma.ttOccupancy.count({
			where: {
				timetableId: sub.timetableId,
				resourceType: 'teacher',
				resourceId: coverTeacherId,
				dayIndex: sub.entry.dayIndex,
				periodIndex: { in: span }
			}
		});
		const otherCovers = await prisma.ttSubstitution.findMany({
			where: { date: sub.date, coverTeacherId, NOT: { id: sub.id } },
			include: { entry: true }
		});
		const clash = otherCovers.some((o) => span.some((p) => p >= o.entry.periodIndex && p < o.entry.periodIndex + o.entry.length));

		if (own > 0 || clash) throw new HttpError(409, 'That teacher is not free for this lesson.');
	}

	const updated = await prisma.ttSubstitution.update({
		where: { id: sub.id },
		data: { coverTeacherId, ...(note !== undefined ? { note } : {}) }
	});
	await audit(prisma, req.user?.id, 'COVER_ASSIGNED', sub.timetableId, { substitutionId: sub.id, coverTeacherId });
	res.json(updated);
});

router.delete('/:id', admin, async (req, res) => {
	await prisma.ttSubstitution.delete({ where: { id: req.params.id as string } });
	res.json({ ok: true });
});

/** Remove a whole absence (all of a teacher's rows for a date). */
router.post('/absence/remove', admin, async (req, res) => {
	const { teacherId, date } = z.object({ teacherId: z.string().min(1), date: dateSchema }).parse(req.body);
	const r = await prisma.ttSubstitution.deleteMany({ where: { absentTeacherId: teacherId, date: toDate(date) } });
	res.json({ ok: true, removed: r.count });
});

export default router;
