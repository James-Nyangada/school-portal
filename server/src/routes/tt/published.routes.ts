import { Router } from 'express';
import { z } from 'zod';
import { AuthRequest } from '../../middleware/auth';
import { feeAccess, lockMessage } from '../../services/fees';
import { HttpError, prisma } from '../../services/tt/db';
import { filterCells, GridCell, loadCells, scheduleDto } from '../../services/tt/grid.service';

const router = Router();

/** The most recently published timetable (one per term; newest term wins). */
async function currentPublished() {
	return prisma.ttTimetable.findFirst({ where: { status: 'published' }, orderBy: { publishedAt: 'desc' } });
}

/** Who is asking, and whose timetable should they see? Enforces the fee gate for students. */
async function resolveViewer(req: AuthRequest, studentIdParam?: string) {
	const user = await prisma.user.findUnique({ where: { id: req.user!.id }, include: { parentLinks: true } });

	if (!user) throw new HttpError(401, 'Unknown user');

	if (user.role === 'TEACHER') return { view: 'teacher' as const, resourceId: user.id, name: 'My teaching timetable' };

	let studentId: string | null = null;

	if (user.role === 'STUDENT') studentId = user.id;

	if (user.role === 'PARENT') {
		const linked = user.parentLinks.map((l) => l.studentId);
		studentId = studentIdParam && linked.includes(studentIdParam) ? studentIdParam : (linked[0] ?? null);

		if (!studentId) throw new HttpError(404, 'No student is linked to this account.');
	}

	if (!studentId) throw new HttpError(403, 'Timetables are available to teachers, students and parents.');

	const student = await prisma.user.findUnique({ where: { id: studentId }, include: { class: true } });

	if (!student?.classId) throw new HttpError(404, 'This student has not been placed in a class yet.');

	const access = await feeAccess(studentId, 'Timetable');
	if (!access.allowed) {
		throw new HttpError(402, lockMessage(access, 'Timetable'), { locked: true, access });
	}

	return {
		view: 'class' as const,
		resourceId: student.classId,
		name: `${student.firstName ?? ''} ${student.lastName ?? ''}`.trim() + ` · ${student.class?.name ?? ''}`
	};
}

router.get('/me', async (req: AuthRequest, res) => {
	const studentId = typeof req.query.studentId === 'string' ? req.query.studentId : undefined;
	const viewer = await resolveViewer(req, studentId);
	const tt = await currentPublished();

	if (!tt) return res.json({ timetable: null, days: [], periods: [], cells: [], viewer });

	const { cells, schedule } = await loadCells(tt.id);
	res.json({
		timetable: { id: tt.id, name: tt.name, term: tt.term, publishedAt: tt.publishedAt },
		viewer,
		...scheduleDto(schedule),
		cells: filterCells(cells, viewer.view, viewer.resourceId)
	});
});

/** "Today's lessons" for the dashboard widget, plus any cover duties for teachers. */
router.get('/today', async (req: AuthRequest, res) => {
	const studentId = typeof req.query.studentId === 'string' ? req.query.studentId : undefined;
	const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().parse(req.query.date);
	const viewer = await resolveViewer(req, studentId).catch((e) => {
		if (e instanceof HttpError && e.status === 402) return null; // locked → empty widget, page shows the gate

		throw e;
	});
	const tt = await currentPublished();

	if (!tt || !viewer) return res.json({ lessons: [], covers: [], locked: !viewer });

	const day = date ? new Date(`${date}T00:00:00Z`) : new Date();
	const weekday = (day.getUTCDay() + 6) % 7; // Monday = 0
	const { cells, schedule } = await loadCells(tt.id);
	const dto = scheduleDto(schedule);
	const dayRow = dto.days[weekday];

	const toLesson = (c: GridCell, extra: Record<string, unknown> = {}) => {
		const start = dto.periods.find((p) => p.index === c.periodIndex);
		const end = dto.periods.find((p) => p.index === c.periodIndex + c.length - 1);

		return {
			cardKey: c.cardKey,
			periodIndex: c.periodIndex,
			length: c.length,
			startTime: start?.startTime ?? '',
			endTime: end?.endTime ?? '',
			period: start?.name ?? '',
			lessons: c.lessons,
			...extra
		};
	};

	const mine = dayRow ? filterCells(cells, viewer.view, viewer.resourceId).filter((c) => c.dayIndex === dayRow.index) : [];
	let covers: ReturnType<typeof toLesson>[] = [];

	if (viewer.view === 'teacher') {
		const isoDate = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate()));
		const subs = await prisma.ttSubstitution.findMany({ where: { date: isoDate, OR: [{ coverTeacherId: viewer.resourceId }, { absentTeacherId: viewer.resourceId }] } });
		const byEntry = new Map(cells.map((c) => [c.entryId, c]));
		covers = subs
			.filter((s) => s.coverTeacherId === viewer.resourceId)
			.map((s) => byEntry.get(s.entryId))
			.filter((c): c is GridCell => Boolean(c))
			.map((c) => toLesson(c, { cover: true }));
		const away = new Set(subs.filter((s) => s.absentTeacherId === viewer.resourceId).map((s) => s.entryId));
		mine.forEach((c) => away.has(c.entryId) && ((c as GridCell & { coveredByOther?: boolean }).coveredByOther = true));
	}

	res.json({
		day: dayRow?.name ?? null,
		periods: dto.periods,
		lessons: mine.map((c) => toLesson(c, { coveredByOther: (c as GridCell & { coveredByOther?: boolean }).coveredByOther ?? false })),
		covers,
		locked: false
	});
});

export default router;
