import { useCallback, useEffect, useRef, useState } from 'react';
import { signOut, useSession } from 'next-auth/react';
import { BACKEND_URL } from '@/lib/backend';

/** All school fees are in Kenyan shillings. */
export const CURRENCY = 'KES';

export function formatKES(value: number | null | undefined) {
	return `${CURRENCY} ${Math.round(value ?? 0).toLocaleString('en-KE')}`;
}

export type PaymentMethod = 'CASH' | 'BANK' | 'MPESA';

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
	CASH: 'Cash',
	BANK: 'Bank transfer',
	MPESA: 'M-Pesa'
};

export const PAYMENT_METHOD_ICONS: Record<PaymentMethod, string> = {
	CASH: 'lucide:banknote',
	BANK: 'lucide:landmark',
	MPESA: 'lucide:smartphone'
};

export type FeeStatus = 'PAID' | 'PARTIAL' | 'UNPAID' | 'NOT_BILLED';

export const FEE_STATUS: Record<FeeStatus, { label: string; color: 'success' | 'warning' | 'error' | 'default' }> = {
	PAID: { label: 'Paid', color: 'success' },
	PARTIAL: { label: 'Partial', color: 'warning' },
	UNPAID: { label: 'Unpaid', color: 'error' },
	NOT_BILLED: { label: 'Not billed', color: 'default' }
};

export type FeeRow = {
	studentId: string;
	studentName: string;
	admissionNumber: string | null;
	classId: string | null;
	className: string | null;
	studentStatus: string;
	totalBilled: number;
	amountPaid: number;
	balance: number;
	status: FeeStatus;
};

export type FeeRecordsResponse = {
	currentTerm: string;
	terms: string[];
	term: string;
	rows: FeeRow[];
};

export type Payment = {
	id: string;
	studentId: string;
	studentName: string;
	admissionNumber: string | null;
	amount: number;
	method: PaymentMethod;
	receiptNumber: string | null;
	status?: string;
	recordedBy?: string;
	date: string;
};

export type FinanceOverview = {
	currentTerm: string;
	totalBilled: number;
	totalCollected: number;
	totalOutstanding: number;
	collectionRate: number;
	term: { billed: number; collected: number; outstanding: number; collectionRate: number };
	debtorCount: number;
	pendingBankClaims: number;
	thisMonth: number;
	lastMonth: number;
	monthChange: number | null;
	trend: { month: string; label: string; collected: number }[];
	byMethod: { method: PaymentMethod; amount: number; count: number }[];
	recentPayments: Payment[];
};

export type ClaimStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export const CLAIM_STATUS: Record<ClaimStatus, { label: string; color: 'warning' | 'success' | 'error' }> = {
	PENDING: { label: 'Awaiting verification', color: 'warning' },
	APPROVED: { label: 'Confirmed', color: 'success' },
	REJECTED: { label: 'Rejected', color: 'error' }
};

export type BankClaim = {
	id: string;
	studentId: string;
	term: string;
	amount: number;
	transactionCode: string;
	bankName: string | null;
	paidAt: string;
	note: string | null;
	status: ClaimStatus;
	rejectionReason: string | null;
	reviewedAt: string | null;
	createdAt: string;
	submittedBy: string | null;
	reviewedBy: string | null;
	student: {
		firstName: string | null;
		lastName: string | null;
		admissionNumber: string | null;
		class: { name: string } | null;
	};
};

export type PaymentOptions = {
	currentTerm: string;
	/** False for students whose class is view-only for fees (a parent pays) */
	canPay: boolean;
	mpesa: { enabled: boolean; paybill: string | null };
	bank: { bankName: string | null; branch: string | null; accountName: string | null; accountNumber: string | null };
};

export type FeeAccess = {
	allowed: boolean;
	percentPaid: number;
	threshold: number;
	totalBilled: number;
	totalPaid: number;
	balance: number;
	arrears: number;
	currentTermBilled: number;
	amountNeeded: number;
	isLeaver: boolean;
};

export type StatementTerm = {
	term: string;
	broughtForward: number;
	billed: number;
	paid: number;
	balance: number;
	carriedForward: number;
	manualOverride: boolean;
	structureName: string | null;
	items: { name: string; amount: number }[];
};

export type FeeStatement = {
	student: { id: string; name: string; admissionNumber: string | null; className: string | null; status: string };
	currentTerm: string;
	totalBilled: number;
	totalPaid: number;
	/** Positive = owed, negative = credit */
	balance: number;
	pendingBankClaims: number;
	terms: StatementTerm[];
	payments: { id: string; date: string; amount: number; method: PaymentMethod; receiptNumber: string | null }[];
	access: { grades: FeeAccess; timetable: FeeAccess };
};

export type Milestone = {
	week: number;
	percent: number;
	dueDate: string | null;
	amountDue: number;
	met: boolean;
	overdue: boolean;
};

/** The current term's bill against its installment plan (server/src/services/paymentPlans.ts). */
export type PlanSchedule = {
	plan: { code: string; name: string };
	milestones: Milestone[];
	dueToDate: number;
	behindBy: number;
	next: Milestone | null;
};

export type StudentFees = {
	totalBilled: number;
	totalPaid: number;
	balance: number;
	paymentPlan: PlanSchedule | null;
	statement: FeeStatement;
};

export class ApiError extends Error {}

/** Authenticated JSON call to the Express API; signs out on an expired session. */
export async function backendRequest<T>(token: string, path: string, init: RequestInit = {}): Promise<T> {
	const res = await fetch(`${BACKEND_URL}${path}`, {
		...init,
		cache: 'no-store',
		headers: {
			Authorization: `Bearer ${token}`,
			...(init.body ? { 'Content-Type': 'application/json' } : {}),
			...init.headers
		}
	});

	if (res.status === 401) {
		void signOut({ callbackUrl: '/sign-in' });
		throw new ApiError('Your session has expired. Please sign in again.');
	}

	const body = await res.json().catch(() => null);

	if (!res.ok) throw new ApiError(body?.error || `Request failed (${res.status})`);

	return body as T;
}

/** Loads `path` once the session token is available; `reload` refetches. Pass null to skip. */
export function useBackend<T>(path: string | null) {
	const { data: session, status } = useSession();
	const token = (session as { backendToken?: string } | null)?.backendToken;
	const [data, setData] = useState<T | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(true);
	const [nonce, setNonce] = useState(0);
	const loadedPath = useRef<string | null>(null);

	useEffect(() => {
		if (status === 'loading' || !path) return;

		// A different resource: drop the old data so it's never shown under the new one. Reloads keep it.
		if (loadedPath.current !== path) {
			loadedPath.current = path;
			setData(null);
		}

		if (!token) {
			setError('You are not signed in.');
			setLoading(false);
			return;
		}

		let cancelled = false;
		setLoading(true);
		backendRequest<T>(token, path)
			.then((d) => {
				if (cancelled) return;

				setData(d);
				setError(null);
			})
			.catch((e: Error) => !cancelled && setError(e.message))
			.finally(() => !cancelled && setLoading(false));

		return () => {
			cancelled = true;
		};
	}, [path, token, status, nonce]);

	const reload = useCallback(() => setNonce((n) => n + 1), []);

	return { data, error, loading, reload, token };
}

/** Downloads rows as a CSV file (values are quoted so names with commas survive). */
export function downloadCsv(filename: string, headers: string[], rows: (string | number | null | undefined)[][]) {
	const escape = (v: string | number | null | undefined) => `"${String(v ?? '').replace(/"/g, '""')}"`;
	const csv = [headers, ...rows].map((r) => r.map(escape).join(',')).join('\n');
	const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
	const a = document.createElement('a');
	a.href = url;
	a.download = filename;
	a.click();
	URL.revokeObjectURL(url);
}

export function formatDate(value: string | Date) {
	return new Date(value).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Downloads the student's PDF fee statement (needs the auth header, so it can't be a plain link). */
export async function downloadStatementPdf(token: string, studentId: string, fileLabel: string) {
	const res = await fetch(`${BACKEND_URL}/api/fees/student/${studentId}/statement.pdf`, {
		headers: { Authorization: `Bearer ${token}` },
		cache: 'no-store'
	});

	if (!res.ok) {
		const body = await res.json().catch(() => null);
		throw new ApiError(body?.error || `Could not download the statement (${res.status})`);
	}

	const url = URL.createObjectURL(await res.blob());
	const a = document.createElement('a');
	a.href = url;
	a.download = `fee-statement-${fileLabel.replace(/[^\w-]+/g, '_')}.pdf`;
	a.click();
	setTimeout(() => URL.revokeObjectURL(url), 1000);
}
