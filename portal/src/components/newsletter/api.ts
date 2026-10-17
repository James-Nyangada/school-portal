import { BACKEND_URL } from '@/lib/backend';
import { ApiError } from '@/lib/finance';
import { NewsletterDoc } from './extensions';

export type Audience =
	| 'ALL_STUDENTS'
	| 'CLASS_STUDENTS'
	| 'ALL_TEACHERS'
	| 'ALL_PARENTS'
	| 'DEBTOR_PARENTS'
	| 'CLASS_PARENTS';

export const AUDIENCES: { value: Audience; label: string; needsClass?: boolean }[] = [
	{ value: 'ALL_STUDENTS', label: 'All students' },
	{ value: 'CLASS_STUDENTS', label: 'Students of a class', needsClass: true },
	{ value: 'ALL_TEACHERS', label: 'All teachers' },
	{ value: 'ALL_PARENTS', label: 'All parents' },
	{ value: 'DEBTOR_PARENTS', label: 'Parents with unpaid fees' },
	{ value: 'CLASS_PARENTS', label: 'Parents of a class', needsClass: true }
];

export const needsClass = (a: Audience) => AUDIENCES.some((x) => x.value === a && x.needsClass);

/** Admin list row (GET /api/newsletters) */
export type NewsletterRow = {
	id: string;
	subject: string;
	preview: string;
	audience: Audience;
	audienceLabel: string;
	classId: string | null;
	status: 'DRAFT' | 'SENT';
	sentAt: string | null;
	editedAt: string | null;
	updatedAt: string;
	sentBy: string | null;
	recipients: number;
	opened: number;
};

export type NewsletterFull = {
	id: string;
	subject: string;
	content: NewsletterDoc;
	audience: Audience;
	classId: string | null;
	status: 'DRAFT' | 'SENT';
};

export type Recipient = { id: string; name: string; role: string; detail: string | null; openedAt: string | null };

/** Inbox row (GET /api/newsletters/inbox) */
export type InboxItem = {
	id: string;
	subject: string;
	preview: string;
	sentAt: string;
	editedAt: string | null;
	sentBy: string | null;
	openedAt: string | null;
	showBanner: boolean;
};

export type InboxMessage = {
	id: string;
	subject: string;
	content: NewsletterDoc;
	sentAt: string;
	editedAt: string | null;
	sentBy: string | null;
};

/** Messages page for the signed-in role. */
export const messagesHref = (role: string | undefined) =>
	role === 'TEACHER' ? '/teacher/messages' : role === 'PARENT' ? '/parent/messages' : '/student/messages';

export function formatDateTime(value: string) {
	return new Date(value).toLocaleString('en-KE', {
		day: 'numeric',
		month: 'short',
		year: 'numeric',
		hour: 'numeric',
		minute: '2-digit'
	});
}

/** Downloads the newsletter PDF (needs the auth header, so it can't be a plain link). */
export async function downloadNewsletterPdf(token: string, id: string, subject: string) {
	const res = await fetch(`${BACKEND_URL}/api/newsletters/${id}/pdf`, {
		headers: { Authorization: `Bearer ${token}` },
		cache: 'no-store'
	});

	if (!res.ok) {
		const body = await res.json().catch(() => null);
		throw new ApiError(body?.error || `Could not download the PDF (${res.status})`);
	}

	const url = URL.createObjectURL(await res.blob());
	const a = document.createElement('a');
	a.href = url;
	a.download = `${subject.replace(/[^\w-]+/g, '_').slice(0, 60) || 'newsletter'}.pdf`;
	a.click();
	setTimeout(() => URL.revokeObjectURL(url), 1000);
}
