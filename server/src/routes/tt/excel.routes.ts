import { Router } from 'express';
import ExcelJS from 'exceljs';
import multer from 'multer';
import { z } from 'zod';
import { requireRole, AuthRequest } from '../../middleware/auth';
import { audit, HttpError, prisma, withTimetableLock } from '../../services/tt/db';
import { filterCells, GridCell, loadCells, scheduleDto } from '../../services/tt/grid.service';
import { invalidate } from '../../services/tt/model.service';
import { CLASSROOM, normalizeRoomType } from '../../services/tt/roomTypes';

const router = Router();
const admin = requireRole('ADMIN');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

const HEADERS = {
	Subjects: ['Code', 'Name', 'Short', 'Colour', 'RoomType'],
	Classes: ['Name', 'Level'],
	Rooms: ['Name', 'Short', 'Type', 'Capacity'],
	Teachers: ['Email', 'Short', 'MaxPerDay', 'MaxPerWeek'],
	Lessons: ['Classes', 'SubjectCode', 'TeacherEmails', 'PeriodsPerWeek', 'Doubles', 'RoomType', 'OptionBlock']
} as const;

const NOTES: Record<keyof typeof HEADERS, string> = {
	Subjects: 'Existing subjects are matched by Code. RoomType: leave blank for a normal classroom, or e.g. "lab", "computer", "field".',
	Classes: 'Existing classes are matched by Name.',
	Rooms: 'Existing rooms are matched by Name. Type: "classroom" (default), "field", or the RoomType used by subjects (e.g. "lab").',
	Teachers: 'Teachers must already have an account (create them under Staff & Students). Matched by Email.',
	Lessons: 'Classes and TeacherEmails can hold several values separated by commas. OptionBlock groups lessons that run at the same time.'
};

router.get('/import/template.xlsx', admin, async (_req, res) => {
	const wb = new ExcelJS.Workbook();
	const examples: Record<keyof typeof HEADERS, (string | number)[]> = {
		Subjects: ['MAT', 'Mathematics', 'MAT', '#3b82f6', ''],
		Classes: ['1E', 1],
		Rooms: ['Lab 1', 'LAB1', 'lab', 45],
		Teachers: ['t.wanjiru@school.ac.ke', 'WAN', 6, 30],
		Lessons: ['1E', 'MAT', 't.wanjiru@school.ac.ke', 6, 1, '', '']
	};

	(Object.keys(HEADERS) as (keyof typeof HEADERS)[]).forEach((name) => {
		const ws = wb.addWorksheet(name);
		ws.addRow([...HEADERS[name]]).font = { bold: true };
		ws.addRow(examples[name]);
		ws.columns.forEach((c) => (c.width = 22));
		ws.getCell('A4').value = NOTES[name];
		ws.getCell('A4').font = { italic: true, color: { argb: 'FF64748B' } };
	});

	res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
	res.setHeader('Content-Disposition', 'attachment; filename="timetable-import-template.xlsx"');
	await wb.xlsx.write(res);
	res.end();
});

type RowError = { sheet: string; row: number; message: string };

function readSheet(wb: ExcelJS.Workbook, name: keyof typeof HEADERS) {
	const ws = wb.getWorksheet(name);

	if (!ws) return [];

	const header = (ws.getRow(1).values as unknown[]).slice(1).map((v) => String(v ?? '').trim());
	const rows: { row: number; data: Record<string, string> }[] = [];

	ws.eachRow((r, n) => {
		if (n === 1) return;

		const values = (r.values as unknown[]).slice(1);
		const data: Record<string, string> = {};
		header.forEach((h, i) => {
			const v = values[i];
			data[h] = v === null || v === undefined ? '' : typeof v === 'object' && 'text' in (v as object) ? String((v as { text: unknown }).text) : String(v).trim();
		});

		// Skip blank rows and the italic help note.
		if (Object.values(data).every((v) => !v) || (data[header[0]!] ?? '').length > 60) return;

		rows.push({ row: n, data });
	});

	return rows;
}

const list = (v: string) =>
	v
		.split(',')
		.map((x) => x.trim())
		.filter(Boolean);

/** Validate every row first; only if there are no errors is anything written (one transaction). */
router.post('/timetables/:id/import', admin, upload.single('file'), async (req: AuthRequest, res) => {
	const timetableId = z.string().min(1).parse(req.params.id);

	if (!req.file) throw new HttpError(400, 'Attach the filled-in template as "file".');

	const wb = new ExcelJS.Workbook();

	try {
		await wb.xlsx.load(req.file.buffer as unknown as ArrayBuffer);
	} catch {
		throw new HttpError(400, 'That file is not a readable .xlsx workbook.');
	}

	const errors: RowError[] = [];
	const [subjects, classes, rooms, teachers] = await Promise.all([
		prisma.subject.findMany(),
		prisma.class.findMany(),
		prisma.ttRoom.findMany(),
		prisma.user.findMany({
			where: { role: 'TEACHER' },
			select: { id: true, email: true, teachesSubjects: { select: { subject: { select: { code: true } } } } }
		})
	]);

	const subjectRows = readSheet(wb, 'Subjects');
	const classRows = readSheet(wb, 'Classes');
	const roomRows = readSheet(wb, 'Rooms');
	const teacherRows = readSheet(wb, 'Teachers');
	const lessonRows = readSheet(wb, 'Lessons');

	const subjectCodes = new Set(subjects.map((s) => s.code.toUpperCase()));
	const classNames = new Set(classes.map((c) => c.name.toUpperCase()));
	const teacherEmails = new Map(teachers.filter((t) => t.email).map((t) => [t.email!.toLowerCase(), t.id]));
	const teacherSubjectCodes = new Map(
		teachers.filter((t) => t.email).map((t) => [t.email!.toLowerCase(), new Set(t.teachesSubjects.map((ts) => ts.subject.code.toUpperCase()))])
	);

	subjectRows.forEach(({ row, data }) => {
		if (!data.Code) errors.push({ sheet: 'Subjects', row, message: 'Code is required' });

		if (!subjectCodes.has(data.Code!.toUpperCase()) && !data.Name) errors.push({ sheet: 'Subjects', row, message: 'Name is required for a new subject' });

		if (data.Colour && !/^#[0-9a-fA-F]{6}$/.test(data.Colour)) errors.push({ sheet: 'Subjects', row, message: 'Colour must look like #3b82f6' });

		subjectCodes.add((data.Code ?? '').toUpperCase());
	});
	classRows.forEach(({ row, data }) => {
		if (!data.Name) errors.push({ sheet: 'Classes', row, message: 'Name is required' });

		if (data.Level && Number.isNaN(Number(data.Level))) errors.push({ sheet: 'Classes', row, message: 'Level must be a number' });

		classNames.add((data.Name ?? '').toUpperCase());
	});
	roomRows.forEach(({ row, data }) => {
		if (!data.Name || !data.Short) errors.push({ sheet: 'Rooms', row, message: 'Name and Short are required' });
	});
	teacherRows.forEach(({ row, data }) => {
		if (!teacherEmails.has((data.Email ?? '').toLowerCase())) errors.push({ sheet: 'Teachers', row, message: `No teacher account with email "${data.Email}"` });
	});
	lessonRows.forEach(({ row, data }) => {
		const ppw = Number(data.PeriodsPerWeek);
		const dbl = Number(data.Doubles || 0);

		if (!list(data.Classes ?? '').length) errors.push({ sheet: 'Lessons', row, message: 'At least one class is required' });

		list(data.Classes ?? '').forEach((c) => !classNames.has(c.toUpperCase()) && errors.push({ sheet: 'Lessons', row, message: `Unknown class "${c}"` }));

		if (!subjectCodes.has((data.SubjectCode ?? '').toUpperCase())) errors.push({ sheet: 'Lessons', row, message: `Unknown subject code "${data.SubjectCode}"` });

		if (!list(data.TeacherEmails ?? '').length) errors.push({ sheet: 'Lessons', row, message: 'At least one teacher is required' });

		list(data.TeacherEmails ?? '').forEach((e) => {
			const code = (data.SubjectCode ?? '').toUpperCase();

			if (!teacherEmails.has(e.toLowerCase())) errors.push({ sheet: 'Lessons', row, message: `No teacher account with email "${e}"` });
			else if (code && !teacherSubjectCodes.get(e.toLowerCase())?.has(code))
				errors.push({ sheet: 'Lessons', row, message: `"${e}" does not teach ${code}. Assign the subject on the staff page first.` });
		});

		if (!Number.isInteger(ppw) || ppw < 1 || ppw > 20) errors.push({ sheet: 'Lessons', row, message: 'PeriodsPerWeek must be 1–20' });

		if (!Number.isInteger(dbl) || dbl < 0 || dbl * 2 > ppw) errors.push({ sheet: 'Lessons', row, message: 'Doubles must be a whole number and at most half of PeriodsPerWeek' });
	});

	if (errors.length > 0) return res.status(400).json({ error: 'The file has problems. Nothing was imported.', rowErrors: errors });

	const counts = await withTimetableLock(
		timetableId,
		async (tx) => {
			const subjectId = new Map(subjects.map((s) => [s.code.toUpperCase(), s.id]));
			const classId = new Map(classes.map((c) => [c.name.toUpperCase(), c.id]));

			for (const { data } of subjectRows) {
				const code = data.Code!.toUpperCase();
				const s = subjectId.get(code)
					? await tx.subject.update({ where: { id: subjectId.get(code)! }, data: data.Name ? { name: data.Name } : {} })
					: await tx.subject.create({ data: { code, name: data.Name! } });
				subjectId.set(code, s.id);
				const info = { short: (data.Short || code).slice(0, 8), color: data.Colour || '#3b82f6', roomType: data.RoomType ? normalizeRoomType(data.RoomType) : null };
				await tx.ttSubjectInfo.upsert({ where: { subjectId: s.id }, create: { subjectId: s.id, ...info }, update: info });
			}

			for (const { data } of classRows) {
				const key = data.Name!.toUpperCase();

				if (!classId.has(key)) {
					const c = await tx.class.create({ data: { name: data.Name!, level: data.Level ? Number(data.Level) : null } });
					classId.set(key, c.id);
				}
			}

			for (const { data } of roomRows) {
				const existing = rooms.find((r) => r.name.toLowerCase() === data.Name!.toLowerCase());
				const fields = { short: data.Short!, type: data.Type ? normalizeRoomType(data.Type) : CLASSROOM, capacity: data.Capacity ? Number(data.Capacity) : null };

				if (existing) await tx.ttRoom.update({ where: { id: existing.id }, data: fields });
				else await tx.ttRoom.create({ data: { name: data.Name!, ...fields } });
			}

			for (const { data } of teacherRows) {
				const teacherId = teacherEmails.get(data.Email!.toLowerCase())!;
				const info = {
					short: data.Short || data.Email!.slice(0, 3).toUpperCase(),
					maxPerDay: data.MaxPerDay ? Number(data.MaxPerDay) : null,
					maxPerWeek: data.MaxPerWeek ? Number(data.MaxPerWeek) : null
				};
				await tx.ttTeacherInfo.upsert({ where: { teacherId }, create: { teacherId, ...info }, update: info });
			}

			const groupId = new Map<string, string>();

			for (const g of await tx.ttParallelGroup.findMany({ where: { timetableId } })) groupId.set(g.name.toLowerCase(), g.id);

			for (const { data } of lessonRows) {
				let gid: string | null = null;

				if (data.OptionBlock) {
					const key = data.OptionBlock.toLowerCase();

					if (!groupId.has(key)) groupId.set(key, (await tx.ttParallelGroup.create({ data: { timetableId, name: data.OptionBlock } })).id);

					gid = groupId.get(key)!;
				}

				await tx.ttLesson.create({
					data: {
						timetableId,
						subjectId: subjectId.get(data.SubjectCode!.toUpperCase())!,
						periodsPerWeek: Number(data.PeriodsPerWeek),
						doublesPerWeek: Number(data.Doubles || 0),
						roomType: data.RoomType ? normalizeRoomType(data.RoomType) : null,
						groupId: gid,
						classes: { create: [...new Set(list(data.Classes!).map((c) => classId.get(c.toUpperCase())!))].map((id) => ({ classId: id })) },
						teachers: { create: [...new Set(list(data.TeacherEmails!).map((e) => teacherEmails.get(e.toLowerCase())!))].map((id) => ({ teacherId: id })) }
					}
				});
			}

			return { subjects: subjectRows.length, classes: classRows.length, rooms: roomRows.length, teachers: teacherRows.length, lessons: lessonRows.length };
		},
		120_000
	);

	invalidate();
	await audit(prisma, req.user?.id, 'TIMETABLE_IMPORTED', timetableId, counts);
	res.json({ ok: true, imported: counts });
});

// ── Export ──────────────────────────────────────────────────

const cellText = (c: GridCell | undefined, view: 'class' | 'teacher' | 'room' | 'master') => {
	if (!c) return '';

	return c.lessons
		.map((l) =>
			view === 'teacher'
				? `${l.subject} ${l.classes.join(',')}${l.room ? ` ${l.room}` : ''}`
				: view === 'room'
					? `${l.subject} ${l.classes.join(',')} ${l.teachers.join(',')}`
					: view === 'master'
						? `${l.subject} ${l.teachers.join(',')}`
						: `${l.subject} ${l.teachers.join(',')}${l.room ? ` ${l.room}` : ''}`
		)
		.join(' / ');
};

router.get('/timetables/:id/export.xlsx', admin, async (req, res) => {
	const timetableId = z.string().min(1).parse(req.params.id);
	const tt = await prisma.ttTimetable.findUnique({ where: { id: timetableId } });

	if (!tt) throw new HttpError(404, 'Timetable not found');

	const { cells, schedule, lookups } = await loadCells(timetableId);
	const { days, periods } = scheduleDto(schedule);
	const wb = new ExcelJS.Workbook();
	wb.creator = 'School Portal';
	const thin = { style: 'thin' as const, color: { argb: 'FFCBD5E1' } };
	const border = { top: thin, left: thin, bottom: thin, right: thin };

	/** Days down the side, periods across the top; a double fills two merged cells. */
	const writeGrid = (ws: ExcelJS.Worksheet, startRow: number, title: string, gridCells: GridCell[], view: 'class' | 'teacher' | 'room') => {
		ws.getCell(startRow, 1).value = title;
		ws.getCell(startRow, 1).font = { bold: true, size: 13 };
		const head = ws.getRow(startRow + 1);
		head.getCell(1).value = '';
		periods.forEach((p, i) => {
			head.getCell(i + 2).value = `${p.name}\n${p.startTime}–${p.endTime}`;
			head.getCell(i + 2).alignment = { wrapText: true, horizontal: 'center' };
			head.getCell(i + 2).font = { bold: true };
			head.getCell(i + 2).border = border;
		});
		days.forEach((d, di) => {
			const r = ws.getRow(startRow + 2 + di);
			r.height = 36;
			r.getCell(1).value = d.name;
			r.getCell(1).font = { bold: true };
			r.getCell(1).border = border;
			periods.forEach((p, pi) => {
				const cell = r.getCell(pi + 2);
				cell.border = border;
				cell.alignment = { wrapText: true, vertical: 'middle', horizontal: 'center' };
				const c = gridCells.find((x) => x.dayIndex === d.index && x.periodIndex === p.index);

				if (!c) return;

				cell.value = cellText(c, view);
				const color = (c.lessons[0]?.color ?? '#e2e8f0').replace('#', '');
				cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `33${color}` } };

				if (c.length === 2 && pi + 3 <= periods.length + 1) ws.mergeCells(startRow + 2 + di, pi + 2, startRow + 2 + di, pi + 3);
			});
		});

		return startRow + 2 + days.length + 2;
	};

	for (const cls of lookups.classes) {
		const mine = filterCells(cells, 'class', cls.id);

		if (mine.length === 0) continue;

		const ws = wb.addWorksheet(cls.name.slice(0, 31).replace(/[\\/?*[\]:]/g, '-'));
		ws.columns = [{ width: 12 }, ...periods.map(() => ({ width: 16 }))];
		writeGrid(ws, 1, `${cls.name} — ${tt.name} (${tt.term})`, mine, 'class');
	}

	const teacherWs = wb.addWorksheet('Teachers');
	teacherWs.columns = [{ width: 12 }, ...periods.map(() => ({ width: 16 }))];
	let row = 1;

	for (const t of lookups.teachers) {
		const mine = filterCells(cells, 'teacher', t.id);

		if (mine.length > 0) row = writeGrid(teacherWs, row, `${t.name} (${t.short})`, mine, 'teacher');
	}

	const master = wb.addWorksheet('Master');
	master.getCell(1, 1).value = `${tt.name} — master timetable`;
	master.getCell(1, 1).font = { bold: true, size: 13 };
	const h1 = master.getRow(2);
	const h2 = master.getRow(3);
	days.forEach((d, di) =>
		periods.forEach((p, pi) => {
			const col = 2 + di * periods.length + pi;
			h1.getCell(col).value = pi === 0 ? d.short : '';
			h2.getCell(col).value = p.name;
			h2.getCell(col).font = { bold: true };
		})
	);
	lookups.classes.forEach((cls, ci) => {
		const r = master.getRow(4 + ci);
		r.getCell(1).value = cls.name;
		r.getCell(1).font = { bold: true };
		const mine = filterCells(cells, 'class', cls.id);
		days.forEach((d, di) =>
			periods.forEach((p, pi) => {
				const c = mine.find((x) => x.dayIndex === d.index && x.periodIndex <= p.index && p.index < x.periodIndex + x.length);
				const cell = r.getCell(2 + di * periods.length + pi);
				cell.value = cellText(c, 'master');
				cell.border = border;
				cell.alignment = { wrapText: true };
			})
		);
	});
	master.columns.forEach((c, i) => (c.width = i === 0 ? 10 : 9));

	res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
	res.setHeader('Content-Disposition', `attachment; filename="${tt.name.replace(/[^\w -]/g, '')}.xlsx"`);
	await wb.xlsx.write(res);
	res.end();
});

export default router;
