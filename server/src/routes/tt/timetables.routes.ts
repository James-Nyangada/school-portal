import { randomUUID } from 'crypto';
import { Router } from 'express';
import { z } from 'zod';
import { requireRole, AuthRequest } from '../../middleware/auth';
import { assertNotGenerating, audit, HttpError, prisma, Tx, withTimetableLock } from '../../services/tt/db';
import { deleteCardsOfLesson } from '../../services/tt/entries.service';
import { invalidate, loadLessons, loadLookups, loadSchedule } from '../../services/tt/model.service';
import { expandLessons } from '../../timetable-core';
import { normalizeOptionalRoomType } from '../../services/tt/roomTypes';

const router = Router();
const admin = requireRole('ADMIN');
const id = (v: unknown) => z.string().min(1).parse(v);

// Lesson writes change the cached lessons of that timetable.
router.use('/:id', (req, res, next) => {
	if (req.method !== 'GET') {
		const timetableId = req.params.id as string;
		invalidate(timetableId);
		res.on('finish', () => invalidate(timetableId));
	}

	next();
});

// ── Timetables ──────────────────────────────────────────────

router.get('/', admin, async (_req, res) => {
	const rows = await prisma.ttTimetable.findMany({
		orderBy: [{ createdAt: 'desc' }],
		include: { _count: { select: { lessons: true, entries: true } } }
	});
	res.json(rows);
});

const createSchema = z.object({
	name: z.string().min(1).max(80),
	term: z.string().min(1).max(40),
	copyFromId: z.string().optional(),
	includeEntries: z.boolean().optional()
});

/** Copy lessons, groups, lesson links (and optionally placed entries) into a new timetable. */
async function copyTimetable(tx: Tx, fromId: string, toId: string, includeEntries: boolean) {
	const groups = await tx.ttParallelGroup.findMany({ where: { timetableId: fromId } });
	const groupMap = new Map<string, string>();

	for (const g of groups) {
		const created = await tx.ttParallelGroup.create({ data: { timetableId: toId, name: g.name } });
		groupMap.set(g.id, created.id);
	}

	const lessons = await tx.ttLesson.findMany({ where: { timetableId: fromId }, include: { classes: true, teachers: true } });
	const lessonMap = new Map<string, string>();

	for (const l of lessons) {
		const created = await tx.ttLesson.create({
			data: {
				timetableId: toId,
				subjectId: l.subjectId,
				periodsPerWeek: l.periodsPerWeek,
				doublesPerWeek: l.doublesPerWeek,
				roomType: l.roomType,
				groupId: l.groupId ? (groupMap.get(l.groupId) ?? null) : null,
				classes: { create: l.classes.map((c) => ({ classId: c.classId })) },
				teachers: { create: l.teachers.map((t) => ({ teacherId: t.teacherId })) }
			}
		});
		lessonMap.set(l.id, created.id);
	}

	if (!includeEntries) return;

	const remapKey = (key: string) => {
		const hash = key.lastIndexOf('#');
		const head = key.slice(0, hash);
		const tail = key.slice(hash);

		return head.startsWith('G:') ? `G:${groupMap.get(head.slice(2))}${tail}` : `${lessonMap.get(head)}${tail}`;
	};

	const entries = await tx.ttEntry.findMany({ where: { timetableId: fromId }, include: { occupancy: true } });

	for (const e of entries) {
		await tx.ttEntry.create({
			data: {
				timetableId: toId,
				cardKey: remapKey(e.cardKey),
				dayIndex: e.dayIndex,
				periodIndex: e.periodIndex,
				length: e.length,
				roomIds: e.roomIds ?? [],
				locked: e.locked,
				occupancy: {
					create: e.occupancy.map((o) => ({
						timetableId: toId,
						resourceType: o.resourceType,
						resourceId: o.resourceId,
						dayIndex: o.dayIndex,
						periodIndex: o.periodIndex
					}))
				}
			}
		});
	}
}

router.post('/', admin, async (req: AuthRequest, res) => {
	const data = createSchema.parse(req.body);
	const timetable = await prisma.$transaction(
		async (tx) => {
			const created = await tx.ttTimetable.create({ data: { name: data.name, term: data.term, createdById: req.user?.id ?? null } });

			if (data.copyFromId) await copyTimetable(tx, data.copyFromId, created.id, Boolean(data.includeEntries));

			return created;
		},
		{ timeout: 60_000 }
	);
	await audit(prisma, req.user?.id, data.copyFromId ? 'TIMETABLE_DUPLICATED' : 'TIMETABLE_CREATED', timetable.id, {
		from: data.copyFromId ?? null
	});
	res.status(201).json(timetable);
});

router.get('/:id', async (req: AuthRequest, res) => {
	const tt = await prisma.ttTimetable.findUnique({
		where: { id: id(req.params.id) },
		include: { _count: { select: { lessons: true, entries: true } } }
	});

	if (!tt) throw new HttpError(404, 'Timetable not found');

	if (tt.status !== 'published' && !['ADMIN', 'SUPER_ADMIN'].includes(req.user?.role ?? '')) throw new HttpError(403, 'Not published');

	const job = await prisma.ttJob.findFirst({ where: { timetableId: tt.id }, orderBy: { createdAt: 'desc' } });
	res.json({ ...tt, latestJob: job });
});

router.patch('/:id', admin, async (req, res) => {
	const data = z.object({ name: z.string().min(1).max(80).optional(), term: z.string().min(1).max(40).optional() }).parse(req.body);
	res.json(
		await prisma.ttTimetable.update({
			where: { id: id(req.params.id) },
			data: Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined))
		})
	);
});

router.delete('/:id', admin, async (req: AuthRequest, res) => {
	const tt = await prisma.ttTimetable.findUnique({ where: { id: id(req.params.id) } });

	if (!tt) throw new HttpError(404, 'Timetable not found');

	if (tt.status === 'published') throw new HttpError(409, 'Unpublish or replace a published timetable before deleting it.');

	await prisma.ttTimetable.delete({ where: { id: tt.id } });
	await audit(prisma, req.user?.id, 'TIMETABLE_DELETED', null, { id: tt.id, name: tt.name });
	res.json({ ok: true });
});

// ── Lessons ─────────────────────────────────────────────────

router.get('/:id/lessons', admin, async (req, res) => {
	const timetableId = id(req.params.id);
	const rows = await prisma.ttLesson.findMany({
		where: { timetableId },
		include: { classes: true, teachers: true },
		orderBy: { createdAt: 'asc' }
	});
	const groups = await prisma.ttParallelGroup.findMany({ where: { timetableId }, orderBy: { name: 'asc' } });
	res.json({
		lessons: rows.map((l) => ({
			id: l.id,
			subjectId: l.subjectId,
			classIds: l.classes.map((c) => c.classId),
			teacherIds: l.teachers.map((t) => t.teacherId),
			periodsPerWeek: l.periodsPerWeek,
			doublesPerWeek: l.doublesPerWeek,
			roomType: l.roomType,
			groupId: l.groupId
		})),
		groups
	});
});

const lessonSchema = z
	.object({
		subjectId: z.string().min(1),
		classIds: z.array(z.string().min(1)).min(1),
		teacherIds: z.array(z.string().min(1)).min(1),
		periodsPerWeek: z.number().int().min(1).max(20),
		doublesPerWeek: z.number().int().min(0).max(10),
		roomType: z.string().min(1).max(30).nullable().optional().transform(normalizeOptionalRoomType),
		groupId: z.string().nullable().optional()
	})
	.refine((l) => l.doublesPerWeek * 2 <= l.periodsPerWeek, { message: 'Too many doubles for the periods per week', path: ['doublesPerWeek'] });

/**
 * Every teacher on a lesson must have its subject among their subjects (set on the staff page).
 * Checks any number of lessons with one query.
 */
async function assertTeachersTeach(db: Tx | typeof prisma, lessons: { subjectId: string; teacherIds: string[] }[]) {
	if (lessons.length === 0) return;

	const teacherIds = [...new Set(lessons.flatMap((l) => l.teacherIds))];
	const subjectIds = [...new Set(lessons.map((l) => l.subjectId))];
	const links = await db.teacherSubject.findMany({
		where: { teacherId: { in: teacherIds }, subjectId: { in: subjectIds } },
		select: { teacherId: true, subjectId: true }
	});
	const ok = new Set(links.map((l) => `${l.teacherId}|${l.subjectId}`));
	const bad = lessons.flatMap((l) => l.teacherIds.filter((t) => !ok.has(`${t}|${l.subjectId}`)).map((t) => ({ t, s: l.subjectId })));

	if (bad.length === 0) return;

	const [users, subjects] = await Promise.all([
		db.user.findMany({ where: { id: { in: bad.map((b) => b.t) } }, select: { id: true, firstName: true, lastName: true, email: true } }),
		db.subject.findMany({ where: { id: { in: bad.map((b) => b.s) } }, select: { id: true, name: true } })
	]);
	const who = (id: string) => {
		const u = users.find((x) => x.id === id);
		return (u && ([u.firstName, u.lastName].filter(Boolean).join(' ') || u.email)) || 'Unknown teacher';
	};
	const what = (id: string) => subjects.find((x) => x.id === id)?.name ?? 'this subject';
	const pairs = [...new Set(bad.map((b) => `${who(b.t)} does not teach ${what(b.s)}`))];

	throw new HttpError(400, `${pairs.slice(0, 5).join('; ')}${pairs.length > 5 ? ` (and ${pairs.length - 5} more)` : ''}. Assign the subject under Staff & Students → Edit details first.`);
}

async function writeLesson(tx: Tx, timetableId: string, lessonId: string | null, data: z.infer<typeof lessonSchema>) {
	await assertTeachersTeach(tx, [data]);

	if (data.groupId) {
		const g = await tx.ttParallelGroup.findFirst({ where: { id: data.groupId, timetableId } });

		if (!g) throw new HttpError(400, 'Option block not found in this timetable');
	}

	const fields = {
		subjectId: data.subjectId,
		periodsPerWeek: data.periodsPerWeek,
		doublesPerWeek: data.doublesPerWeek,
		roomType: data.roomType ?? null,
		groupId: data.groupId ?? null
	};

	if (lessonId) {
		await tx.ttLessonClass.deleteMany({ where: { lessonId } });
		await tx.ttLessonTeacher.deleteMany({ where: { lessonId } });

		return tx.ttLesson.update({
			where: { id: lessonId },
			data: {
				...fields,
				classes: { create: data.classIds.map((classId) => ({ classId })) },
				teachers: { create: data.teacherIds.map((teacherId) => ({ teacherId })) }
			}
		});
	}

	return tx.ttLesson.create({
		data: {
			timetableId,
			...fields,
			classes: { create: [...new Set(data.classIds)].map((classId) => ({ classId })) },
			teachers: { create: [...new Set(data.teacherIds)].map((teacherId) => ({ teacherId })) }
		}
	});
}

router.post('/:id/lessons', admin, async (req: AuthRequest, res) => {
	const timetableId = id(req.params.id);
	const data = lessonSchema.parse(req.body);
	const lesson = await withTimetableLock(timetableId, async (tx) => {
		await assertNotGenerating(tx, timetableId);

		// Adding a lesson to a group changes the group's combined cards.
		if (data.groupId) await deleteCardsOfLesson(tx, timetableId, '__none__', data.groupId);

		return writeLesson(tx, timetableId, null, data);
	});
	res.status(201).json(lesson);
});

router.patch('/:id/lessons/:lessonId', admin, async (req: AuthRequest, res) => {
	const timetableId = id(req.params.id);
	const lessonId = id(req.params.lessonId);
	const data = lessonSchema.parse(req.body);
	const lesson = await withTimetableLock(timetableId, async (tx) => {
		await assertNotGenerating(tx, timetableId);
		const old = await tx.ttLesson.findFirst({ where: { id: lessonId, timetableId } });

		if (!old) throw new HttpError(404, 'Lesson not found');

		// Changing a lesson invalidates its placed cards (and its old/new group's).
		await deleteCardsOfLesson(tx, timetableId, lessonId, old.groupId);

		if (data.groupId) await deleteCardsOfLesson(tx, timetableId, lessonId, data.groupId);

		return writeLesson(tx, timetableId, lessonId, data);
	});
	await audit(prisma, req.user?.id, 'LESSON_UPDATED', timetableId, { lessonId });
	res.json(lesson);
});

router.delete('/:id/lessons/:lessonId', admin, async (req: AuthRequest, res) => {
	const timetableId = id(req.params.id);
	const lessonId = id(req.params.lessonId);
	await withTimetableLock(timetableId, async (tx) => {
		await assertNotGenerating(tx, timetableId);
		const old = await tx.ttLesson.findFirst({ where: { id: lessonId, timetableId } });

		if (!old) throw new HttpError(404, 'Lesson not found');

		await deleteCardsOfLesson(tx, timetableId, lessonId, old.groupId);
		await tx.ttLesson.delete({ where: { id: lessonId } });
	});
	res.json({ ok: true });
});

/**
 * Matrix save: one row per class × subject (single-class, non-block lessons only).
 * periodsPerWeek 0 removes the lesson. Everything happens in one transaction.
 */
const matrixSchema = z.object({
	cells: z
		.array(
			z.object({
				classId: z.string().min(1),
				subjectId: z.string().min(1),
				periodsPerWeek: z.number().int().min(0).max(20),
				doublesPerWeek: z.number().int().min(0).max(10),
				// Several teachers = they all teach this class the subject at the same time (e.g. CRE/IRE/HRE)
				teacherIds: z.array(z.string().min(1)).max(10).optional(),
				teacherId: z.string().nullable().optional()
			})
		)
		.max(2000)
});

router.put('/:id/lessons-matrix', admin, async (req: AuthRequest, res) => {
	const timetableId = id(req.params.id);
	const { cells } = matrixSchema.parse(req.body);
	// Work out the changes first, then apply them with a fixed handful of bulk queries — one query
	// per cell is far too slow against the remote database and made the transaction time out.
	const result = await withTimetableLock(
		timetableId,
		async (tx) => {
			await assertNotGenerating(tx, timetableId);
			const existing = await tx.ttLesson.findMany({
				where: { timetableId, groupId: null },
				include: { classes: true, teachers: true }
			});
			const single = new Map(
				existing.filter((l) => l.classes.length === 1).map((l) => [`${l.classes[0]!.classId}|${l.subjectId}`, l])
			);
			const removeIds: string[] = [];
			const updates: { id: string; subjectId: string; teacherIds: string[]; periodsPerWeek: number; doublesPerWeek: number }[] = [];
			const creates: { id: string; classId: string; subjectId: string; teacherIds: string[]; periodsPerWeek: number; doublesPerWeek: number }[] = [];

			for (const c of cells) {
				const current = single.get(`${c.classId}|${c.subjectId}`);
				const doubles = Math.min(c.doublesPerWeek, Math.floor(c.periodsPerWeek / 2));
				const teacherIds = [...new Set(c.teacherIds ?? (c.teacherId ? [c.teacherId] : []))];

				if (c.periodsPerWeek === 0 || teacherIds.length === 0) {
					if (current && c.periodsPerWeek === 0) removeIds.push(current.id);

					continue;
				}

				const fields = { subjectId: c.subjectId, teacherIds, periodsPerWeek: c.periodsPerWeek, doublesPerWeek: doubles };

				if (!current) {
					creates.push({ id: randomUUID(), classId: c.classId, ...fields });
					continue;
				}

				const same =
					current.periodsPerWeek === c.periodsPerWeek &&
					current.doublesPerWeek === doubles &&
					current.teachers.length === teacherIds.length &&
					current.teachers.every((t) => teacherIds.includes(t.teacherId));

				if (!same) updates.push({ id: current.id, ...fields });
			}

			await assertTeachersTeach(tx, [...updates, ...creates]);

			// Changed or removed lessons lose their placed cards.
			const touched = [...removeIds, ...updates.map((u) => u.id)];

			if (touched.length) {
				await tx.ttEntry.deleteMany({
					where: { timetableId, OR: touched.map((lessonId) => ({ cardKey: { startsWith: `${lessonId}#` } })) }
				});
			}

			if (removeIds.length) await tx.ttLesson.deleteMany({ where: { id: { in: removeIds } } });

			if (updates.length) {
				// Class and subject stay the same (they are the cell's key); only counts and teachers change.
				const byCounts = new Map<string, string[]>();
				updates.forEach((u) => {
					const k = `${u.periodsPerWeek}|${u.doublesPerWeek}`;
					byCounts.set(k, [...(byCounts.get(k) ?? []), u.id]);
				});

				for (const [k, ids] of byCounts) {
					const [periodsPerWeek, doublesPerWeek] = k.split('|').map(Number) as [number, number];
					await tx.ttLesson.updateMany({ where: { id: { in: ids } }, data: { periodsPerWeek, doublesPerWeek } });
				}

				await tx.ttLessonTeacher.deleteMany({ where: { lessonId: { in: updates.map((u) => u.id) } } });
				await tx.ttLessonTeacher.createMany({
					data: updates.flatMap((u) => u.teacherIds.map((teacherId) => ({ lessonId: u.id, teacherId })))
				});
			}

			if (creates.length) {
				await tx.ttLesson.createMany({
					data: creates.map((c) => ({
						id: c.id,
						timetableId,
						subjectId: c.subjectId,
						periodsPerWeek: c.periodsPerWeek,
						doublesPerWeek: c.doublesPerWeek,
						roomType: null,
						groupId: null
					}))
				});
				await tx.ttLessonClass.createMany({ data: creates.map((c) => ({ lessonId: c.id, classId: c.classId })) });
				await tx.ttLessonTeacher.createMany({
					data: creates.flatMap((c) => c.teacherIds.map((teacherId) => ({ lessonId: c.id, teacherId })))
				});
			}

			return { created: creates.length, updated: updates.length, removed: removeIds.length };
		},
		60_000
	);
	await audit(prisma, req.user?.id, 'LESSONS_MATRIX_SAVED', timetableId, result);
	res.json(result);
});

router.post('/:id/groups', admin, async (req, res) => {
	const timetableId = id(req.params.id);
	const { name } = z.object({ name: z.string().min(1).max(60) }).parse(req.body);
	res.status(201).json(await prisma.ttParallelGroup.create({ data: { timetableId, name } }));
});

router.patch('/:id/groups/:groupId', admin, async (req, res) => {
	const { name } = z.object({ name: z.string().min(1).max(60) }).parse(req.body);
	res.json(await prisma.ttParallelGroup.update({ where: { id: id(req.params.groupId) }, data: { name } }));
});

router.delete('/:id/groups/:groupId', admin, async (req, res) => {
	const timetableId = id(req.params.id);
	const groupId = id(req.params.groupId);
	await withTimetableLock(timetableId, async (tx) => {
		await assertNotGenerating(tx, timetableId);
		await tx.ttEntry.deleteMany({ where: { timetableId, cardKey: { startsWith: `G:${groupId}#` } } });
		await tx.ttParallelGroup.delete({ where: { id: groupId } }); // lessons fall back to standalone (SetNull)
	});
	res.json({ ok: true });
});

// ── Teacher loads ───────────────────────────────────────────

router.get('/:id/teacher-loads', admin, async (req, res) => {
	const timetableId = id(req.params.id);
	const [lessons, lookups, schedule, unavail] = await Promise.all([
		loadLessons(prisma, timetableId),
		loadLookups(),
		loadSchedule(),
		prisma.ttUnavailability.findMany({ where: { resourceType: 'teacher' } })
	]);
	const slots = schedule.days.length * schedule.periods.length;
	const assigned = new Map<string, number>();
	expandLessons(lessons).forEach((card) => card.teacherIds.forEach((t) => assigned.set(t, (assigned.get(t) ?? 0) + card.length)));
	const blocked = new Map<string, number>();
	unavail.forEach((u) => blocked.set(u.resourceId, (blocked.get(u.resourceId) ?? 0) + 1));

	res.json(
		lookups.teachers.map((t) => {
			const available = Math.min(slots - (blocked.get(t.id) ?? 0), t.maxPerWeek ?? Infinity);

			return { teacherId: t.id, name: t.name, short: t.short, assigned: assigned.get(t.id) ?? 0, available };
		})
	);
});

export default router;
