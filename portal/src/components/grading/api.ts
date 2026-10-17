'use client';

import { BACKEND_URL } from '@/lib/backend';
import { useTtApi } from '@/components/timetable/api';

export { errorMessage } from '@/components/timetable/api';

export type GradingMode = 'NUMERIC' | 'CBC';
export type GradeStatus = 'DRAFT' | 'PUBLISHED' | 'PENDING_APPROVAL';
export type CompetencyLevel = 'EE' | 'ME' | 'AE' | 'BE';
export type AssessmentType = 'FORMATIVE' | 'SUMMATIVE';
export type Boundary = { grade: string; min: number };

export const LEVELS: { value: CompetencyLevel; label: string; color: 'success' | 'info' | 'warning' | 'error' }[] = [
	{ value: 'EE', label: 'Exceeding expectations', color: 'success' },
	{ value: 'ME', label: 'Meeting expectations', color: 'info' },
	{ value: 'AE', label: 'Approaching expectations', color: 'warning' },
	{ value: 'BE', label: 'Below expectations', color: 'error' }
];

export const levelInfo = (l: string | null | undefined) => LEVELS.find((x) => x.value === l);

export const STATUS_CHIP: Record<GradeStatus, { label: string; color: 'default' | 'success' | 'warning' }> = {
	DRAFT: { label: 'Draft', color: 'default' },
	PUBLISHED: { label: 'Published', color: 'success' },
	PENDING_APPROVAL: { label: 'Pending approval', color: 'warning' }
};

export interface GradingSettings {
	gradingMode: GradingMode;
	currentTerm: string;
	catCount: number;
	catMaxScore: number;
	examMaxScore: number;
	catWeight: number;
	examWeight: number;
	gradeBoundaries: Boundary[];
	approvalSlaHours: number;
	feeGateThreshold: number;
}

export interface GradeChangeRequest {
	id: string;
	type: 'EDIT' | 'DELETE';
	status: 'PENDING' | 'APPROVED' | 'REJECTED';
	newValue: string | null;
	previousValue: string;
	reason: string;
	decisionReason: string | null;
	createdAt: string;
}

export interface GradeRecord {
	id: string;
	studentId: string;
	subjectId: string;
	term: string;
	mode: GradingMode;
	status: GradeStatus;
	value: string;
	teacherComment: string | null;
	catScores: number[];
	examScore: number | null;
	total: number | null;
	letterGrade: string | null;
	strand: string | null;
	subStrand: string | null;
	competencyLevel: CompetencyLevel | null;
	assessmentType: AssessmentType | null;
	updatedAt: string;
	pending: GradeChangeRequest | null;
	lastRejection: GradeChangeRequest | null;
}

export interface GradebookOption {
	classId: string;
	className: string;
	subjectId: string;
	subjectName: string;
	subjectCode: string;
	mode: GradingMode;
}

export interface GradebookResponse {
	mode: GradingMode;
	term: string;
	class: { id: string; name: string };
	subject: { id: string; name: string; code: string };
	canEditDirectly: boolean;
	settings: Pick<
		GradingSettings,
		'catCount' | 'catMaxScore' | 'examMaxScore' | 'catWeight' | 'examWeight' | 'gradeBoundaries'
	>;
	students: { id: string; name: string; admissionNumber: string | null }[];
	grades: GradeRecord[];
}

export interface HistoryEntry {
	id: string;
	action: string;
	previousValue: string | null;
	newValue: string;
	reason: string | null;
	changedBy: string;
	approvedBy: string | null;
	createdAt: string;
}

export interface ApprovalRequest {
	id: string;
	type: 'EDIT' | 'DELETE';
	status: 'PENDING' | 'APPROVED' | 'REJECTED';
	gradeId: string;
	mode: GradingMode;
	student: string;
	admissionNumber: string | null;
	className: string | null;
	subject: string;
	term: string;
	strand: string | null;
	subStrand: string | null;
	assessmentType: AssessmentType | null;
	previousData: Record<string, unknown>;
	newData: Record<string, unknown> | null;
	previousValue: string;
	newValue: string | null;
	reason: string;
	requestedBy: string;
	decidedBy: string | null;
	decidedAt: string | null;
	decisionReason: string | null;
	createdAt: string;
	daysPending: number;
	overdue: boolean;
}

export interface FeeAccess {
	allowed: boolean;
	percentPaid: number;
	threshold: number;
	totalBilled: number;
	totalPaid: number;
	balance: number;
	/** Unpaid fees carried over from earlier terms; must be cleared in full */
	arrears: number;
	currentTermBilled: number;
	amountNeeded: number;
	isLeaver: boolean;
}

export interface StudentGrade {
	id: string;
	subject: string;
	subjectCode: string;
	term: string;
	mode: GradingMode;
	catScores: number[];
	examScore: number | null;
	total: number | null;
	letterGrade: string | null;
	value: string;
	strand: string | null;
	subStrand: string | null;
	competencyLevel: CompetencyLevel | null;
	assessmentType: AssessmentType | null;
	teacherComment: string | null;
}

export interface StudentGradesResponse {
	access: FeeAccess;
	student: { name: string; admissionNumber: string | null; className: string | null };
	mode: GradingMode;
	currentTerm: string;
	settings: { catCount: number; catMaxScore: number; examMaxScore: number };
	terms: string[];
	grades: StudentGrade[];
}

/** Authenticated fetch for /api/grades. */
export const useGradesApi = () => useTtApi(`${BACKEND_URL}/api/grades`);

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Same rule as the server (services/grading.computeNumeric), for a live preview while typing. */
export function previewTotal(s: GradebookResponse['settings'], catScores: number[], examScore: number | null) {
	const parts: { pct: number; weight: number }[] = [];

	if (catScores.length > 0)
		parts.push({
			pct: (catScores.reduce((a, b) => a + b, 0) / catScores.length / s.catMaxScore) * 100,
			weight: s.catWeight
		});

	if (examScore !== null) parts.push({ pct: (examScore / s.examMaxScore) * 100, weight: s.examWeight });

	const weight = parts.reduce((a, p) => a + p.weight, 0);

	if (parts.length === 0 || weight === 0) return { total: null, letter: null };

	const total = round1(parts.reduce((a, p) => a + p.pct * p.weight, 0) / weight);

	return {
		total,
		letter: [...s.gradeBoundaries].sort((a, b) => b.min - a.min).find((b) => total >= b.min)?.grade ?? null
	};
}

/** "Mathematics · Number Operations · Fractions" style label for a CBC assessment. */
export const strandLabel = (g: { strand: string | null; subStrand: string | null }) =>
	[g.strand, g.subStrand].filter(Boolean).join(' › ');

export const kes = (n: number) => `KES ${Math.round(n).toLocaleString()}`;
