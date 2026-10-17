import { BACKEND_URL } from '@/lib/backend';

/** Downloads a FILE_UPLOAD assignment's handout through the API (auth-checked, keeps the original file name). */
export async function downloadAssignmentFile(
	token: string,
	assignment: { id: string; attachmentName?: string | null }
) {
	const res = await fetch(`${BACKEND_URL}/api/assignments/${assignment.id}/attachment`, {
		headers: { Authorization: `Bearer ${token}` }
	});

	if (!res.ok) {
		const err = await res.json().catch(() => ({}));
		throw new Error(err.error || 'Could not download the file');
	}

	const url = URL.createObjectURL(await res.blob());
	const link = document.createElement('a');
	link.href = url;
	link.download = assignment.attachmentName || 'assignment';
	document.body.appendChild(link);
	link.click();
	link.remove();
	setTimeout(() => URL.revokeObjectURL(url), 1000);
}
