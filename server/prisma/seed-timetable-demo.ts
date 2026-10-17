/**
 * OPT-IN demo data for the timetable module — never runs automatically.
 *
 *   npm run seed:timetable-demo            # create the demo school + "Demo timetable"
 *   npm run seed:timetable-demo -- --clean # remove everything this script created
 *
 * Creates (all clearly prefixed so --clean can find them): 16 "Demo 1E…4S" classes, 12 "D-…"
 * subjects, 45 demo teacher accounts (demo.teacherN@demo.school, cannot log in), 3 labs and a
 * computer room, and a timetable with ~150 lessons including Form 3/4 option blocks.
 * If no bell schedule exists it also creates Mon–Fri × 9 periods in 3 blocks.
 */
import { PrismaClient } from '@prisma/client';
import { randomBytes } from 'crypto';
import bcrypt from 'bcrypt';
import { demoSchool } from '../src/timetable-core/fixtures/demoSchool';

const prisma = new PrismaClient();
const TIMETABLE_NAME = 'Demo timetable';
const EMAIL_DOMAIN = '@demo.school';

async function clean() {
	const tts = await prisma.ttTimetable.findMany({ where: { name: TIMETABLE_NAME } });
	await prisma.ttTimetable.deleteMany({ where: { id: { in: tts.map((t) => t.id) } } });
	const teachers = await prisma.user.findMany({ where: { email: { endsWith: EMAIL_DOMAIN } }, select: { id: true } });
	await prisma.ttUnavailability.deleteMany({ where: { resourceId: { in: teachers.map((t) => t.id) } } });
	await prisma.user.deleteMany({ where: { id: { in: teachers.map((t) => t.id) } } });
	await prisma.class.deleteMany({ where: { name: { startsWith: 'Demo ' } } });
	await prisma.subject.deleteMany({ where: { code: { startsWith: 'D-' } } });
	await prisma.ttRoom.deleteMany({ where: { name: { startsWith: 'Demo ' } } });
	console.log(`Removed demo data (${tts.length} timetable, ${teachers.length} teachers).`);
}

async function seed() {
	const demo = demoSchool();

	// Bell schedule: create the demo one only if the school has none.
	const [days, periods] = await Promise.all([prisma.ttDay.count(), prisma.ttPeriod.count()]);

	if (days === 0 && periods === 0) {
		await prisma.ttDay.createMany({ data: demo.input.days.map((d) => ({ index: d.index, name: d.name, short: d.name.slice(0, 3) })) });
		const times = ['08:00', '08:40', '09:20', '10:20', '11:00', '11:40', '13:20', '14:00', '14:40'];
		await prisma.ttPeriod.createMany({
			data: demo.input.periods.map((p, i) => {
				const [h, m] = times[i]!.split(':').map(Number);
				const end = h! * 60 + m! + 40;

				return {
					index: p.index,
					name: p.name,
					startTime: times[i]!,
					endTime: `${String(Math.floor(end / 60)).padStart(2, '0')}:${String(end % 60).padStart(2, '0')}`,
					block: p.block
				};
			})
		});
		console.log('Created bell schedule: Mon–Fri, 9 periods in 3 blocks.');
	} else if (days !== 5 || periods !== 9) {
		console.warn(`Note: your bell schedule has ${days} days × ${periods} periods (demo was designed for 5 × 9). Continuing anyway.`);
	}

	const subjectId = new Map<string, string>();

	for (const s of demo.subjects) {
		const row = await prisma.subject.upsert({
			where: { code: `D-${s.code}` },
			create: { code: `D-${s.code}`, name: `${s.name} (demo)` },
			update: {}
		});
		await prisma.ttSubjectInfo.upsert({
			where: { subjectId: row.id },
			create: { subjectId: row.id, short: s.code, color: s.color, roomType: s.roomType },
			update: { short: s.code, color: s.color, roomType: s.roomType }
		});
		subjectId.set(`sub-${s.code}`, row.id);
	}

	const classId = new Map<string, string>();

	for (const c of demo.classes) {
		const row = await prisma.class.upsert({ where: { name: `Demo ${c.name}` }, create: { name: `Demo ${c.name}`, level: c.level }, update: {} });
		classId.set(c.id, row.id);
	}

	const roomId = new Map<string, string>();

	for (const r of demo.rooms) {
		const row = await prisma.ttRoom.upsert({
			where: { name: `Demo ${r.name}` },
			create: { name: `Demo ${r.name}`, short: r.name.replace(/\s/g, '').slice(0, 6).toUpperCase(), type: r.type },
			update: {}
		});
		roomId.set(r.id, row.id);
	}

	// Demo teachers get an unguessable password nobody knows — they exist only to be scheduled.
	const hash = await bcrypt.hash(randomBytes(24).toString('hex'), 10);
	const teacherId = new Map<string, string>();

	for (const [i, t] of demo.teachers.entries()) {
		const email = `demo.teacher${i + 1}${EMAIL_DOMAIN}`;
		const row = await prisma.user.upsert({
			where: { email },
			create: { email, role: 'TEACHER', status: 'ACTIVE', passwordHash: hash, firstName: t.firstName, lastName: `${t.lastName} (demo)` },
			update: {}
		});
		await prisma.ttTeacherInfo.upsert({
			where: { teacherId: row.id },
			create: { teacherId: row.id, short: t.short, maxPerDay: 7 },
			update: { short: t.short, maxPerDay: 7 }
		});
		teacherId.set(t.id, row.id);
	}

	await prisma.ttTimetable.deleteMany({ where: { name: TIMETABLE_NAME } });
	const tt = await prisma.ttTimetable.create({ data: { name: TIMETABLE_NAME, term: 'Demo term' } });
	const groupId = new Map<string, string>();

	for (const g of demo.groups) {
		groupId.set(g.id, (await prisma.ttParallelGroup.create({ data: { timetableId: tt.id, name: g.name } })).id);
	}

	for (const l of demo.input.lessons) {
		await prisma.ttLesson.create({
			data: {
				timetableId: tt.id,
				subjectId: subjectId.get(l.subjectId)!,
				periodsPerWeek: l.periodsPerWeek,
				doublesPerWeek: l.doublesPerWeek,
				roomType: null, // inherits from the subject
				groupId: l.groupId ? groupId.get(l.groupId)! : null,
				classes: { create: l.classIds.map((c) => ({ classId: classId.get(c)! })) },
				teachers: { create: l.teacherIds.map((t) => ({ teacherId: teacherId.get(t)! })) }
			}
		});
	}

	console.log(`Created "${TIMETABLE_NAME}" with ${demo.input.lessons.length} lessons for ${demo.classes.length} classes and ${demo.teachers.length} teachers.`);
	console.log('Open Timetable Builder → Demo timetable → Generate.');
}

(process.argv.includes('--clean') ? clean() : seed())
	.catch((e) => {
		console.error(e);
		process.exitCode = 1;
	})
	.finally(() => prisma.$disconnect());
