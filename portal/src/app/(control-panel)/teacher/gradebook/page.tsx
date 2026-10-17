'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
	Alert,
	Button,
	Chip,
	CircularProgress,
	Dialog,
	DialogActions,
	DialogContent,
	DialogContentText,
	DialogTitle,
	MenuItem,
	Paper,
	TextField,
	Typography
} from '@mui/material';
import { useSnackbar } from 'notistack';
import FusePageSimple from '@fuse/core/FusePageSimple';
import FuseSvgIcon from '@fuse/core/FuseSvgIcon';
import AuthGuardRedirect from '@auth/AuthGuardRedirect';
import {
	errorMessage,
	useGradesApi,
	type GradebookOption,
	type GradebookResponse,
	type GradeRecord
} from '@/components/grading/api';
import { CbcGradebook, NumericGradebook, type EntryPayload } from '@/components/grading/GradebookGrids';
import { EditGradeDialog, GradeHistoryDialog, type GradeChange } from '@/components/grading/GradeDialogs';

type Options = { currentTerm: string; terms: string[]; options: GradebookOption[] };

const pairKey = (o: Pick<GradebookOption, 'classId' | 'subjectId'>) => `${o.classId}:${o.subjectId}`;

/**
 * Teacher gradebook (dashboard-full-ui-logic-spec 3.3): enter grades as drafts, publish them, and request
 * admin approval for any change to a published grade.
 */
export default function GradebookPage() {
	const api = useGradesApi();
	const { enqueueSnackbar } = useSnackbar();

	const [opts, setOpts] = useState<Options | null>(null);
	const [pair, setPair] = useState('');
	const [term, setTerm] = useState('');
	const [book, setBook] = useState<GradebookResponse | null>(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState('');
	const [saving, setSaving] = useState(false);
	const [dirty, setDirty] = useState(0);
	const [confirmPublish, setConfirmPublish] = useState(false);
	const [editing, setEditing] = useState<{ grade: GradeRecord; studentName: string } | null>(null);
	const [historyId, setHistoryId] = useState<string | null>(null);

	useEffect(() => {
		if (!api.ready) return;

		api.get<Options>('/gradebook/options')
			.then((o) => {
				setOpts(o);
				setTerm(o.currentTerm);

				if (o.options[0]) setPair(pairKey(o.options[0]));
			})
			.catch((e) => setError(errorMessage(e)));
	}, [api]);

	const selected = useMemo(() => opts?.options.find((o) => pairKey(o) === pair), [opts, pair]);

	const load = useCallback(async () => {
		if (!selected || !term) return;

		setLoading(true);
		setError('');
		try {
			const q = new URLSearchParams({ classId: selected.classId, subjectId: selected.subjectId, term });
			setBook(await api.get<GradebookResponse>(`/gradebook?${q}`));
		} catch (e) {
			setError(errorMessage(e));
			setBook(null);
		} finally {
			setLoading(false);
		}
	}, [api, selected, term]);

	useEffect(() => {
		void load();
	}, [load]);

	const confirmLeave = () => dirty === 0 || window.confirm('You have unsaved changes. Discard them?');

	const selection = selected && { classId: selected.classId, subjectId: selected.subjectId, term };

	const saveEntries = async (entries: EntryPayload[]) => {
		if (!selection) return;

		setSaving(true);
		const failed: string[] = [];

		for (const entry of entries) {
			try {
				await api.post('/entries', { ...selection, ...entry });
			} catch (e) {
				const name = book?.students.find((s) => s.id === entry.studentId)?.name ?? 'A student';
				failed.push(`${name}: ${errorMessage(e)}`);
			}
		}

		setSaving(false);

		if (failed.length > 0)
			enqueueSnackbar(`Some grades were not saved — ${failed.join('; ')}`, { variant: 'error' });
		else if (entries.length > 0)
			enqueueSnackbar(`Saved ${entries.length} draft ${entries.length === 1 ? 'grade' : 'grades'}`, {
				variant: 'success'
			});

		await load();
	};

	const publish = async () => {
		if (!selection) return;

		setConfirmPublish(false);
		setSaving(true);
		try {
			const r = await api.post<{ message: string }>('/publish', selection);
			enqueueSnackbar(r.message, { variant: 'success' });
			await load();
		} catch (e) {
			enqueueSnackbar(errorMessage(e), { variant: 'error' });
		} finally {
			setSaving(false);
		}
	};

	const submitChange = async (change: GradeChange, reason: string) => {
		const g = editing!.grade;
		const r = await api.post<{ message: string }>('/entries', {
			...selection,
			studentId: g.studentId,
			...(g.strand ? { strand: g.strand, subStrand: g.subStrand, assessmentType: g.assessmentType } : {}),
			...change,
			...(reason ? { reason } : {})
		});
		enqueueSnackbar(r.message, { variant: 'success' });
		await load();
	};

	const submitDelete = async (reason: string) => {
		const r = await api.post<{ message: string }>(`/${editing!.grade.id}/delete`, reason ? { reason } : {});
		enqueueSnackbar(r.message, { variant: 'success' });
		await load();
	};

	const drafts = book?.grades.filter((g) => g.status === 'DRAFT' && g.value).length ?? 0;
	const pending = book?.grades.filter((g) => g.status === 'PENDING_APPROVAL').length ?? 0;
	const s = book?.settings;

	const Grid = book?.mode === 'CBC' ? CbcGradebook : NumericGradebook;

	return (
		<AuthGuardRedirect auth={['SUPER_ADMIN', 'ADMIN', 'TEACHER']}>
			<FusePageSimple
				content={
					<div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8">
						<div className="flex flex-col gap-2">
							<Typography className="text-4xl font-extrabold tracking-tight">Gradebook</Typography>
							<Typography color="text.secondary">
								Enter grades as drafts, then publish them to students and parents. Changes to a
								published grade go to an admin for approval — the published value stays live until then.
							</Typography>
						</div>

						<Paper
							variant="outlined"
							className="flex flex-col gap-4 rounded-2xl p-4 sm:flex-row sm:items-center"
						>
							<TextField
								select
								label="Class & subject"
								value={opts?.options.length ? pair : ''}
								onChange={(e) => confirmLeave() && setPair(e.target.value)}
								size="small"
								className="sm:min-w-72"
								disabled={!opts?.options.length}
							>
								{opts?.options.map((o) => (
									<MenuItem
										key={pairKey(o)}
										value={pairKey(o)}
									>
										{o.className} · {o.subjectName}
									</MenuItem>
								))}
							</TextField>
							<TextField
								select
								label="Term"
								value={opts ? term : ''}
								onChange={(e) => confirmLeave() && setTerm(e.target.value)}
								size="small"
								className="sm:min-w-44"
								disabled={!opts}
							>
								{opts?.terms.map((t) => (
									<MenuItem
										key={t}
										value={t}
									>
										{t}
										{t === opts.currentTerm ? ' (current)' : ''}
									</MenuItem>
								))}
							</TextField>
							{book && s && (
								<Chip
									variant="outlined"
									icon={
										<FuseSvgIcon size={16}>
											{book.mode === 'CBC' ? 'lucide:layers' : 'lucide:calculator'}
										</FuseSvgIcon>
									}
									label={
										book.mode === 'CBC'
											? 'CBC — competency levels'
											: s.catCount > 0
												? `Numeric — CATs ${s.catWeight}% · Exam ${s.examWeight}%`
												: 'Numeric — exam only'
									}
								/>
							)}
							<div className="flex-1" />
							<Button
								variant="contained"
								color="secondary"
								disabled={!book || drafts === 0 || dirty > 0 || saving}
								onClick={() => setConfirmPublish(true)}
								startIcon={<FuseSvgIcon size={18}>lucide:send</FuseSvgIcon>}
							>
								Publish {drafts > 0 ? `${drafts} draft${drafts === 1 ? '' : 's'}` : 'drafts'}
							</Button>
						</Paper>

						{error && <Alert severity="error">{error}</Alert>}

						{opts && opts.options.length === 0 && (
							<Alert severity="warning">
								You are not assigned to any class and subject yet. Ask an admin to assign you in Staff
								&amp; Students.
							</Alert>
						)}

						{book && pending > 0 && (
							<Alert severity="info">
								{pending} {pending === 1 ? 'grade has a change' : 'grades have changes'} waiting for
								admin approval. Students and parents still see the published value.
							</Alert>
						)}
						{book && dirty > 0 && drafts > 0 && (
							<Typography
								variant="body2"
								color="text.secondary"
							>
								Save your changes before publishing.
							</Typography>
						)}

						{loading && !book && (
							<div className="flex justify-center py-16">
								<CircularProgress />
							</div>
						)}

						{book && book.students.length === 0 && (
							<Alert severity="info">There are no students in {book.class.name} for this subject.</Alert>
						)}

						{book && book.students.length > 0 && (
							<Grid
								book={book}
								saving={saving}
								onSave={saveEntries}
								onOpenGrade={(grade, studentName) => setEditing({ grade, studentName })}
								onHistory={setHistoryId}
								onDirtyChange={setDirty}
							/>
						)}

						{book && (
							<EditGradeDialog
								grade={editing?.grade ?? null}
								studentName={editing?.studentName ?? ''}
								book={book}
								onClose={() => setEditing(null)}
								onSubmit={submitChange}
								onDelete={submitDelete}
							/>
						)}
						<GradeHistoryDialog
							gradeId={historyId}
							onClose={() => setHistoryId(null)}
						/>

						<Dialog
							open={confirmPublish}
							onClose={() => setConfirmPublish(false)}
						>
							<DialogTitle>Publish {drafts} grades?</DialogTitle>
							<DialogContent>
								<DialogContentText>
									Students and parents will see these grades in {book?.subject.name} ·{' '}
									{book?.class.name} · {term}. After publishing, any change needs admin approval.
								</DialogContentText>
							</DialogContent>
							<DialogActions>
								<Button onClick={() => setConfirmPublish(false)}>Cancel</Button>
								<Button
									variant="contained"
									onClick={publish}
								>
									Publish
								</Button>
							</DialogActions>
						</Dialog>
					</div>
				}
			/>
		</AuthGuardRedirect>
	);
}
