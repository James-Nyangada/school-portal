'use client';

import { useEffect, useState } from 'react';
import {
	Alert,
	Button,
	CircularProgress,
	Dialog,
	DialogActions,
	DialogContent,
	DialogTitle,
	MenuItem,
	TextField,
	Typography
} from '@mui/material';
import {
	errorMessage,
	LEVELS,
	previewTotal,
	useGradesApi,
	type CompetencyLevel,
	type GradebookResponse,
	type GradeRecord,
	type HistoryEntry
} from './api';

export type GradeChange = {
	catScores?: number[];
	examScore?: number | null;
	competencyLevel?: CompetencyLevel | null;
	teacherComment?: string | null;
};

const num = (s: string) => (s.trim() === '' ? null : Number(s));

/**
 * Change or delete an existing grade. For a published grade a teacher sends a request (reason required) and the
 * live value stays until an admin approves; an admin's change applies at once and is logged.
 */
export function EditGradeDialog({
	grade,
	studentName,
	book,
	onClose,
	onSubmit,
	onDelete
}: {
	grade: GradeRecord | null;
	studentName: string;
	book: GradebookResponse;
	onClose: () => void;
	onSubmit: (change: GradeChange, reason: string) => Promise<void>;
	onDelete: (reason: string) => Promise<void>;
}) {
	const [cats, setCats] = useState<string[]>([]);
	const [exam, setExam] = useState('');
	const [level, setLevel] = useState<CompetencyLevel | ''>('');
	const [comment, setComment] = useState('');
	const [reason, setReason] = useState('');
	const [deleting, setDeleting] = useState(false);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState('');

	useEffect(() => {
		if (!grade) return;

		setCats(Array.from({ length: book.settings.catCount }, (_, i) => grade.catScores[i]?.toString() ?? ''));
		setExam(grade.examScore?.toString() ?? '');
		setLevel(grade.competencyLevel ?? '');
		setComment(grade.teacherComment ?? '');
		setReason('');
		setDeleting(false);
		setError('');
	}, [grade, book.settings.catCount]);

	if (!grade) return null;

	const published = grade.status === 'PUBLISHED';
	const direct = !published || book.canEditDirectly;
	const needsReason = published;
	const catValues = cats.map(num).filter((c): c is number => c !== null);
	const preview = previewTotal(book.settings, catValues, num(exam));
	const label = book.mode === 'CBC' ? [grade.strand, grade.subStrand].filter(Boolean).join(' › ') : book.subject.name;

	const submit = async () => {
		setBusy(true);
		setError('');
		try {
			if (deleting) {
				await onDelete(reason.trim());
			} else {
				const change: GradeChange = { teacherComment: comment.trim() || null };

				if (book.mode === 'CBC') change.competencyLevel = level || null;
				else {
					change.catScores = catValues;
					change.examScore = num(exam);
				}

				await onSubmit(change, reason.trim());
			}

			onClose();
		} catch (e) {
			setError(errorMessage(e));
		} finally {
			setBusy(false);
		}
	};

	const title = deleting
		? direct
			? 'Delete grade'
			: 'Request deletion'
		: published
			? direct
				? 'Edit published grade'
				: 'Request grade change'
			: 'Edit draft';

	return (
		<Dialog
			open
			onClose={busy ? undefined : onClose}
			fullWidth
			maxWidth="sm"
		>
			<DialogTitle>{title}</DialogTitle>
			<DialogContent className="flex flex-col gap-4">
				<Typography color="text.secondary">
					{studentName} · {label} · {grade.term}
				</Typography>

				{published && !direct && (
					<Alert severity="info">
						Students and parents keep seeing the current value (<b>{grade.value || '—'}</b>) until an admin
						approves this {deleting ? 'deletion' : 'change'}.
					</Alert>
				)}
				{published && direct && (
					<Alert severity="warning">
						This applies immediately and is recorded in the audit log under your name.
					</Alert>
				)}

				{!deleting && book.mode === 'NUMERIC' && (
					<div className="flex flex-wrap gap-3">
						{cats.map((c, i) => (
							<TextField
								key={i}
								label={`CAT ${i + 1} (/${book.settings.catMaxScore})`}
								value={c}
								onChange={(e) => setCats((p) => p.map((x, j) => (j === i ? e.target.value : x)))}
								type="number"
								size="small"
								className="w-36"
								slotProps={{ htmlInput: { min: 0, max: book.settings.catMaxScore, step: 0.5 } }}
							/>
						))}
						<TextField
							label={`Exam (/${book.settings.examMaxScore})`}
							value={exam}
							onChange={(e) => setExam(e.target.value)}
							type="number"
							size="small"
							className="w-36"
							slotProps={{ htmlInput: { min: 0, max: book.settings.examMaxScore, step: 0.5 } }}
						/>
						<div className="flex flex-col justify-center">
							<Typography
								variant="caption"
								color="text.secondary"
							>
								New total
							</Typography>
							<Typography className="font-semibold">
								{preview.total ?? '—'}
								{preview.letter ? ` (${preview.letter})` : ''}
							</Typography>
						</div>
					</div>
				)}

				{!deleting && book.mode === 'CBC' && (
					<TextField
						select
						label="Competency level"
						value={level}
						onChange={(e) => setLevel(e.target.value as CompetencyLevel)}
						size="small"
					>
						{LEVELS.map((l) => (
							<MenuItem
								key={l.value}
								value={l.value}
							>
								{l.value} — {l.label}
							</MenuItem>
						))}
					</TextField>
				)}

				{!deleting && (
					<TextField
						label="Teacher comment"
						value={comment}
						onChange={(e) => setComment(e.target.value)}
						multiline
						minRows={2}
						size="small"
						slotProps={{ htmlInput: { maxLength: 500 } }}
					/>
				)}

				{needsReason && (
					<TextField
						label={deleting ? 'Reason for deleting' : 'Reason for the change'}
						value={reason}
						onChange={(e) => setReason(e.target.value)}
						required
						multiline
						minRows={2}
						size="small"
						helperText="Shown to the admin and kept in the grade's history"
						slotProps={{ htmlInput: { maxLength: 500 } }}
					/>
				)}

				{error && <Alert severity="error">{error}</Alert>}
			</DialogContent>
			<DialogActions className="justify-between px-6 pb-4">
				<Button
					color="error"
					onClick={() => setDeleting((d) => !d)}
					disabled={busy}
				>
					{deleting ? 'Back to editing' : 'Delete…'}
				</Button>
				<div className="flex gap-2">
					<Button
						onClick={onClose}
						disabled={busy}
					>
						Cancel
					</Button>
					<Button
						variant="contained"
						color={deleting ? 'error' : 'primary'}
						onClick={submit}
						disabled={busy || (needsReason && reason.trim().length < 3)}
						startIcon={busy ? <CircularProgress size={16} /> : undefined}
					>
						{deleting
							? direct
								? 'Delete'
								: 'Send delete request'
							: published && !direct
								? 'Send for approval'
								: 'Save'}
					</Button>
				</div>
			</DialogActions>
		</Dialog>
	);
}

const ACTION_LABEL: Record<string, string> = {
	CREATED: 'Created (draft)',
	DRAFT_UPDATED: 'Draft edited',
	PUBLISHED: 'Published',
	EDIT_REQUESTED: 'Change requested',
	DELETE_REQUESTED: 'Deletion requested',
	EDIT_APPROVED: 'Change approved',
	EDIT_REJECTED: 'Change rejected',
	DELETE_APPROVED: 'Deletion approved',
	DELETE_REJECTED: 'Deletion rejected',
	ADMIN_EDITED: 'Edited by admin',
	DELETED: 'Deleted'
};

/** Every write and decision on one grade, newest first. */
export function GradeHistoryDialog({ gradeId, onClose }: { gradeId: string | null; onClose: () => void }) {
	const api = useGradesApi();
	const [rows, setRows] = useState<HistoryEntry[] | null>(null);
	const [error, setError] = useState('');

	useEffect(() => {
		if (!gradeId || !api.ready) return;

		setRows(null);
		setError('');
		api.get<HistoryEntry[]>(`/${gradeId}/history`)
			.then(setRows)
			.catch((e) => setError(errorMessage(e)));
	}, [gradeId, api]);

	return (
		<Dialog
			open={Boolean(gradeId)}
			onClose={onClose}
			fullWidth
			maxWidth="sm"
		>
			<DialogTitle>Grade history</DialogTitle>
			<DialogContent>
				{error && <Alert severity="error">{error}</Alert>}
				{!rows && !error && (
					<div className="flex justify-center py-8">
						<CircularProgress size={24} />
					</div>
				)}
				{rows && (
					<ol className="flex flex-col gap-3">
						{rows.map((r) => (
							<li
								key={r.id}
								className="border-divider border-l-2 pl-3"
							>
								<Typography className="font-semibold">{ACTION_LABEL[r.action] ?? r.action}</Typography>
								<Typography
									variant="body2"
									color="text.secondary"
								>
									{new Date(r.createdAt).toLocaleString()} · {r.changedBy}
									{r.approvedBy && r.approvedBy !== r.changedBy
										? ` · decided by ${r.approvedBy}`
										: ''}
								</Typography>
								<Typography variant="body2">
									{r.previousValue ? `${r.previousValue} → ` : ''}
									{r.newValue}
								</Typography>
								{r.reason && (
									<Typography
										variant="body2"
										color="text.secondary"
									>
										“{r.reason}”
									</Typography>
								)}
							</li>
						))}
					</ol>
				)}
			</DialogContent>
			<DialogActions>
				<Button onClick={onClose}>Close</Button>
			</DialogActions>
		</Dialog>
	);
}
