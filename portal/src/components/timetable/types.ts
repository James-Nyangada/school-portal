export interface TtDay {
	index: number;
	name: string;
	short: string;
}

export interface TtPeriod {
	index: number;
	name: string;
	startTime: string;
	endTime: string;
	block: number;
}

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

/** A named break with its own times; it follows the period with index afterIndex. */
export interface TtBreak {
	afterIndex: number;
	name: string;
	startTime: string;
	endTime: string;
}

export interface GridCell {
	entryId: string;
	cardKey: string;
	dayIndex: number;
	periodIndex: number;
	length: number;
	locked: boolean;
	lessons: CellLesson[];
	cover?: boolean;
	coveredByOther?: boolean;
}

export interface GridData {
	days: TtDay[];
	periods: TtPeriod[];
	cells: GridCell[];
}

export type GridView = 'class' | 'teacher' | 'room';

export interface Lookups {
	subjects: { id: string; name: string; code: string; short: string; color: string; roomType: string | null }[];
	teachers: {
		id: string;
		name: string;
		email: string | null;
		status: string;
		short: string;
		maxPerDay: number | null;
		maxPerWeek: number | null;
		/** Subjects this teacher teaches (set on the staff page). */
		subjectIds: string[];
	}[];
	classes: { id: string; name: string; level: number | null }[];
	rooms: { id: string; name: string; short: string; type: string; capacity: number | null }[];
}

export interface Timetable {
	id: string;
	name: string;
	term: string;
	status: 'draft' | 'published' | 'archived';
	publishedAt: string | null;
	createdAt: string;
	updatedAt: string;
	_count?: { lessons: number; entries: number };
	latestJob?: Job | null;
}

export interface UnplacedReport {
	cardId: string;
	label: string;
	reasons: string[];
}

export interface Job {
	id: string;
	timetableId: string;
	status: 'queued' | 'running' | 'done' | 'failed' | 'cancelled';
	progress: number;
	placed: number | null;
	total: number | null;
	error: string | null;
	createdAt: string;
	finishedAt: string | null;
	result: {
		placed: number;
		total: number;
		score: number;
		attempts: number;
		elapsedMs: number;
		unplaced: UnplacedReport[];
	} | null;
}

/** A period index → block lookup that says whether a break follows period p. */
export const breakAfter = (periods: TtPeriod[], i: number) =>
	i + 1 < periods.length && periods[i]!.block !== periods[i + 1]!.block;
