'use client';

import { BACKEND_URL } from '@/lib/backend';
import { useTtApi } from '@/components/timetable/api';

export { errorMessage } from '@/components/timetable/api';

export type AttendanceStatus = 'PRESENT' | 'LATE' | 'ABSENT';

/** One placed period of a lesson on the published timetable (recurs weekly). */
export interface Session {
	entryId: string;
	dayIndex: number;
	dayName: string;
	dayPos: number;
	periodIndex: number;
	periodName: string;
	length: number;
	startTime: string;
	endTime: string;
	room: string | null;
}

export interface LessonInfo {
	lessonId: string;
	subjectId: string;
	subject: string;
	subjectName: string;
	color: string;
	classes: { id: string; name: string }[];
	teachers: string[];
}

export interface Tally {
	present: number;
	late: number;
	absent: number;
	total: number;
}

export interface LessonsResponse {
	timetable: { id: string; name: string; term: string } | null;
	today: string;
	dayName: string | null;
	lessons: (LessonInfo & {
		studentCount: number;
		sessions: Session[];
		today: (Session & { date: string; marked: number })[];
	})[];
}

export interface LessonWeekResponse {
	lesson: LessonInfo & { studentCount: number };
	today: string;
	week: { start: string; end: string; prev: string; next: string; isCurrent: boolean };
	sessions: (Session & { date: string; upcoming: boolean; summary: Tally | null; markedAt: string | null })[];
}

export interface RegisterStudent {
	id: string;
	name: string;
	admissionNumber: string | null;
	photo: string | null;
	className: string;
	status: AttendanceStatus | null;
}

export interface RegisterResponse {
	lesson: LessonInfo;
	session: Session & { date: string };
	markedAt: string | null;
	markedBy: string | null;
	students: RegisterStudent[];
}

/** Authenticated fetch for /api/attendance. */
export const useAttendanceApi = () => useTtApi(`${BACKEND_URL}/api/attendance`);

export const classNames = (l: Pick<LessonInfo, 'classes'>) => l.classes.map((c) => c.name).join(', ');

export const registerHref = (lessonId: string, entryId: string, date: string) =>
	`/teacher/attendance/${lessonId}/${entryId}?date=${date}`;
