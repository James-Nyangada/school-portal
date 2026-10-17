// GENERATED from server/src/timetable-core by server/scripts/sync-tt-core.js — do not edit.
/* eslint-disable */
/**
 * Core timetable types. Pure data — no database or HTTP concerns live here.
 *
 * A "slot" is a flat index: slot = day * periodsPerDay + period.
 */

export type ResourceType = 'teacher' | 'class' | 'room';

export interface SchoolConfig {
	days: number;
	periodsPerDay: number;
	/** blockOf[period] — periods in the same block have no break between them. */
	blockOf: number[];
	dayNames: string[];
	periodNames: string[];
}

export interface Rules {
	spreadSubjects: boolean;
	noSameSubjectTwiceADay: boolean;
	minimiseTeacherGaps: boolean;
	respectMaxPerDay: boolean;
	preferMorning: boolean;
}

export const DEFAULT_RULES: Rules = {
	spreadSubjects: true,
	noSameSubjectTwiceADay: true,
	minimiseTeacherGaps: true,
	respectMaxPerDay: true,
	preferMorning: true
};

/** A lesson as entered by the admin: subject × classes × teachers, N periods a week. */
export interface Lesson {
	id: string;
	subjectId: string;
	classIds: string[];
	teacherIds: string[];
	periodsPerWeek: number;
	doublesPerWeek: number;
	/** Room type needed (e.g. "lab"). null = any general room (or none if general rooms are ignored). */
	roomType: string | null;
	groupId: string | null;
}

/** What has to be found for one lesson inside a card. */
export interface RoomNeed {
	lessonId: string;
	roomType: string | null;
}

/** The atomic unit that gets placed onto the grid. Parallel groups become one combined card. */
export interface Card {
	id: string;
	lessonIds: string[];
	subjectIds: string[];
	length: 1 | 2;
	teacherIds: string[];
	classIds: string[];
	roomNeeds: RoomNeed[];
}

export interface Room {
	id: string;
	type: string;
}

export interface Placement {
	cardId: string;
	slot: number;
	/** One entry per card.roomNeeds, aligned by index. null = no room needed. */
	roomIds: (string | null)[];
	locked: boolean;
}

export interface Names {
	teachers: Record<string, string>;
	classes: Record<string, string>;
	rooms: Record<string, string>;
	subjects: Record<string, string>;
}

export interface Model {
	config: SchoolConfig;
	rules: Rules;
	ignoreGeneralRooms: boolean;
	lessons: Lesson[];
	cards: Card[];
	rooms: Room[];
	/** key = `${type}:${id}` → unavailable slots */
	unavailable: Record<string, number[]>;
	teacherMaxPerDay: Record<string, number>;
	teacherMaxPerWeek: Record<string, number>;
	/** Entries already on the grid that must be kept (locked, or all entries when editing). */
	fixed: Placement[];
	names: Names;
}

export type ReasonCode =
	| 'out_of_range'
	| 'double_day_end'
	| 'double_break'
	| 'teacher_busy'
	| 'teacher_unavailable'
	| 'teacher_max_day'
	| 'class_busy'
	| 'class_unavailable'
	| 'room_none';

export interface Reason {
	code: ReasonCode;
	resourceType?: ResourceType;
	resourceId?: string;
	otherCardId?: string;
	message: string;
}

export interface CheckResult {
	ok: boolean;
	reasons: Reason[];
	roomIds: (string | null)[];
}

export interface Progress {
	placed: number;
	total: number;
	percent: number;
	attempt: number;
}

export interface UnplacedReport {
	cardId: string;
	label: string;
	reasons: string[];
}

export interface GenResult {
	placements: Placement[];
	placed: number;
	total: number;
	score: number;
	unplaced: UnplacedReport[];
	attempts: number;
	elapsedMs: number;
}
