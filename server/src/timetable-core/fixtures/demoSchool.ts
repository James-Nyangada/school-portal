import type { Lesson, Room } from '../types';
import type { ModelInput } from '../load';

/**
 * The demo school from the implementation plan: 5 days, 9 periods in 3 blocks,
 * 16 classes (Form 1–4 × 4 streams), 45 teachers, 12 subjects, 3 labs + a computer room,
 * with an option block for Form 3 and Form 4. Used by tests and the opt-in seed script.
 */

export interface DemoSubject {
	code: string;
	name: string;
	color: string;
	roomType: string | null;
}

export const DEMO_SUBJECTS: DemoSubject[] = [
	{ code: 'MAT', name: 'Mathematics', color: '#3b82f6', roomType: null },
	{ code: 'ENG', name: 'English', color: '#ef4444', roomType: null },
	{ code: 'KIS', name: 'Kiswahili', color: '#f59e0b', roomType: null },
	{ code: 'BIO', name: 'Biology', color: '#10b981', roomType: null },
	{ code: 'CHE', name: 'Chemistry', color: '#8b5cf6', roomType: 'lab' },
	{ code: 'PHY', name: 'Physics', color: '#06b6d4', roomType: 'lab' },
	{ code: 'HIS', name: 'History', color: '#a16207', roomType: null },
	{ code: 'GEO', name: 'Geography', color: '#65a30d', roomType: null },
	{ code: 'CRE', name: 'CRE', color: '#db2777', roomType: null },
	{ code: 'BUS', name: 'Business Studies', color: '#0f766e', roomType: null },
	{ code: 'COM', name: 'Computer Studies', color: '#4f46e5', roomType: 'computer' },
	{ code: 'PE', name: 'Physical Education', color: '#ea580c', roomType: null }
];

export const DEMO_STREAMS = ['East', 'West', 'North', 'South'];

/** periods per week, doubles per week */
const FORM_1_2: [string, number, number][] = [
	['MAT', 6, 1], ['ENG', 6, 1], ['KIS', 5, 0], ['BIO', 4, 1], ['CHE', 4, 1], ['PHY', 4, 1],
	['HIS', 3, 0], ['GEO', 3, 0], ['CRE', 3, 0], ['COM', 2, 0], ['PE', 2, 0]
];
const FORM_3_4_CORE: [string, number, number][] = [
	['MAT', 6, 1], ['ENG', 6, 1], ['KIS', 5, 0], ['CHE', 4, 1], ['BIO', 4, 1], ['PE', 2, 0]
];
/** Option blocks: all lessons in a block run at the same time for the whole level. */
const BLOCK_A: [string, number, number][] = [['PHY', 4, 1], ['GEO', 4, 1], ['BUS', 4, 1]];
const BLOCK_B: [string, number, number][] = [['HIS', 3, 0], ['CRE', 3, 0], ['COM', 3, 0]];

export interface DemoSchool {
	input: ModelInput;
	subjects: DemoSubject[];
	classes: { id: string; name: string; level: number }[];
	teachers: { id: string; firstName: string; lastName: string; short: string }[];
	rooms: (Room & { name: string })[];
	groups: { id: string; name: string; level: number }[];
}

export function demoSchool(): DemoSchool {
	const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'].map((name, index) => ({ index, name }));
	const periods = Array.from({ length: 9 }, (_, i) => ({ index: i, name: `P${i + 1}`, block: Math.floor(i / 3) }));

	const classes = [1, 2, 3, 4].flatMap((level) =>
		DEMO_STREAMS.map((s) => ({ id: `cls-${level}${s[0]}`, name: `${level}${s[0]}`, level }))
	);

	const rooms = [
		{ id: 'room-lab1', name: 'Lab 1', type: 'lab' },
		{ id: 'room-lab2', name: 'Lab 2', type: 'lab' },
		{ id: 'room-lab3', name: 'Lab 3', type: 'lab' },
		{ id: 'room-comp', name: 'Computer Room', type: 'computer' }
	];

	const subjectById = (code: string) => DEMO_SUBJECTS.find((s) => s.code === code)!;

	// Raw lesson demand, teachers assigned afterwards.
	type Draft = { id: string; code: string; classIds: string[]; ppw: number; dpw: number; groupId: string | null };
	const drafts: Draft[] = [];
	const groups: DemoSchool['groups'] = [];

	for (const c of classes) {
		const plan = c.level <= 2 ? FORM_1_2 : FORM_3_4_CORE;
		plan.forEach(([code, ppw, dpw]) =>
			drafts.push({ id: `les-${c.name}-${code}`, code, classIds: [c.id], ppw, dpw, groupId: null })
		);
	}

	for (const level of [3, 4]) {
		const levelClasses = classes.filter((c) => c.level === level).map((c) => c.id);

		for (const [blockName, block] of [['A', BLOCK_A], ['B', BLOCK_B]] as const) {
			const groupId = `grp-${level}${blockName}`;
			groups.push({ id: groupId, name: `Form ${level} Option ${blockName}`, level });
			block.forEach(([code, ppw, dpw]) =>
				drafts.push({ id: `les-F${level}${blockName}-${code}`, code, classIds: levelClasses, ppw, dpw, groupId })
			);
		}
	}

	// 45 teachers, split across subjects in proportion to demand; each lesson goes to the
	// least-loaded teacher of its subject (never two members of one option block to the same teacher).
	const demand = new Map<string, number>();
	drafts.forEach((d) => demand.set(d.code, (demand.get(d.code) ?? 0) + d.ppw));
	const totalDemand = [...demand.values()].reduce((a, b) => a + b, 0);
	const codes = DEMO_SUBJECTS.map((s) => s.code);
	const perSubject = new Map(codes.map((c) => [c, Math.max(1, Math.floor(((demand.get(c) ?? 0) / totalDemand) * 45))]));
	let assigned = [...perSubject.values()].reduce((a, b) => a + b, 0);

	while (assigned < 45) {
		// Give spare teachers to the subjects with the highest load per teacher.
		const code = codes.reduce((best, c) =>
			(demand.get(c) ?? 0) / perSubject.get(c)! > (demand.get(best) ?? 0) / perSubject.get(best)! ? c : best
		);
		perSubject.set(code, perSubject.get(code)! + 1);
		assigned++;
	}

	const first = ['Otieno', 'Wanjiru', 'Kamau', 'Achieng', 'Mwangi', 'Njeri', 'Kiprop', 'Atieno', 'Mutua', 'Chebet', 'Omondi', 'Wambui', 'Kiptoo', 'Nyambura', 'Barasa'];
	const last = ['Ochieng', 'Kariuki', 'Mwende', 'Odhiambo', 'Koech', 'Muthoni'];
	const teachers: DemoSchool['teachers'] = [];
	const pool = new Map<string, string[]>();
	let ti = 0;

	for (const code of codes) {
		for (let k = 0; k < perSubject.get(code)!; k++) {
			const firstName = first[ti % first.length]!;
			const lastName = last[Math.floor(ti / first.length) % last.length]!;
			const id = `tch-${ti + 1}`;
			teachers.push({ id, firstName, lastName, short: `${firstName.slice(0, 2)}${lastName[0]}`.toUpperCase() + (ti + 1) });
			pool.set(code, [...(pool.get(code) ?? []), id]);
			ti++;
		}
	}

	const load = new Map<string, number>();
	const groupTeachers = new Map<string, Set<string>>();

	const lessons: Lesson[] = drafts.map((d) => {
		const candidates = [...pool.get(d.code)!].sort((a, b) => (load.get(a) ?? 0) - (load.get(b) ?? 0));
		const used = d.groupId ? (groupTeachers.get(d.groupId) ?? new Set<string>()) : new Set<string>();
		const teacher = candidates.find((t) => !used.has(t)) ?? candidates[0]!;
		load.set(teacher, (load.get(teacher) ?? 0) + d.ppw);

		if (d.groupId) groupTeachers.set(d.groupId, used.add(teacher));

		return {
			id: d.id,
			subjectId: `sub-${d.code}`,
			classIds: d.classIds,
			teacherIds: [teacher],
			periodsPerWeek: d.ppw,
			doublesPerWeek: d.dpw,
			roomType: subjectById(d.code).roomType,
			groupId: d.groupId
		};
	});

	return {
		subjects: DEMO_SUBJECTS,
		classes,
		teachers,
		rooms,
		groups,
		input: {
			days,
			periods,
			lessons,
			rooms: rooms.map(({ id, type }) => ({ id, type })),
			unavailability: [],
			teacherMaxPerDay: Object.fromEntries(teachers.map((t) => [t.id, 7])),
			ignoreGeneralRooms: true,
			names: {
				teachers: Object.fromEntries(teachers.map((t) => [t.id, t.short])),
				classes: Object.fromEntries(classes.map((c) => [c.id, c.name])),
				rooms: Object.fromEntries(rooms.map((r) => [r.id, r.name])),
				subjects: Object.fromEntries(DEMO_SUBJECTS.map((s) => [`sub-${s.code}`, s.code]))
			}
		}
	};
}
