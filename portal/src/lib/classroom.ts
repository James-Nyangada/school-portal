export type AttendanceStatus = 'PRESENT' | 'LATE' | 'ABSENT';

export type ClassroomPerson = { id: string; firstName: string | null; lastName: string | null };

export type ClassroomParent = ClassroomPerson & {
	phone: string | null;
	email: string | null;
	relationship: string | null;
};

export type ClassroomStudent = ClassroomPerson & {
	admissionNumber: string | null;
	status: string;
	passportPhotoUrl: string | null;
	parents: ClassroomParent[];
	/** Worst mark across today's lessons; null when no register has been taken today */
	todayStatus: AttendanceStatus | null;
	/** Share of marked lessons attended (present or late) over the last 30 days; null when nothing marked */
	attendanceRate: number | null;
};

export type ClassroomSubject = { id: string; name: string; code: string; teachers: ClassroomPerson[] };

/** GET /api/classes/mine: the class the signed-in teacher is class teacher of, or null */
export type Classroom = {
	id: string;
	name: string;
	level: number | null;
	students: ClassroomStudent[];
	subjects: ClassroomSubject[];
};

export const fullName = (p: ClassroomPerson) => [p.firstName, p.lastName].filter(Boolean).join(' ') || '—';

export function classroomSummary(c: Classroom) {
	const count = (s: AttendanceStatus) => c.students.filter((st) => st.todayStatus === s).length;
	const rates = c.students.map((s) => s.attendanceRate).filter((r): r is number => r !== null);

	return {
		students: c.students.length,
		present: count('PRESENT'),
		late: count('LATE'),
		absent: count('ABSENT'),
		unmarked: c.students.filter((s) => s.todayStatus === null).length,
		averageRate: rates.length ? Math.round(rates.reduce((a, b) => a + b, 0) / rates.length) : null
	};
}
