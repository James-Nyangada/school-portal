'use client';

import { useEffect, useMemo, useState } from 'react';
import useToast from '@/hooks/useToast';
import {
	Button,
	Chip,
	Dialog,
	DialogActions,
	DialogContent,
	DialogTitle,
	MenuItem,
	Paper,
	Table,
	TableBody,
	TableCell,
	TableContainer,
	TableHead,
	TableRow,
	TextField,
	Tooltip,
	Typography
} from '@mui/material';
import FusePageSimple from '@fuse/core/FusePageSimple';
import FuseSvgIcon from '@fuse/core/FuseSvgIcon';
import AuthGuardRedirect from '@auth/AuthGuardRedirect';
import { StatCard } from '@/components/dashboard/StatCard';
import { backendRequest, formatDate, useBackend } from '@/lib/finance';

type Person = { id: string; firstName: string | null; lastName: string | null; admissionNumber: string | null };

type Row = {
	student: Person;
	reportCard: {
		id: string;
		totalScore: number | null;
		average: number | null;
		rank: number | null;
		subjects: number;
		isPublished: boolean;
		updatedAt: string;
	} | null;
};

type ReportCardDetail = {
	id: string;
	term: string;
	totalScore: number | null;
	average: number | null;
	rank: number | null;
	isPublished: boolean;
	student: Person & { class: { name: string } | null };
	subjectGrades: {
		id: string;
		gradeValue: string;
		teacherRemark: string | null;
		subject: { id: string; name: string; code: string };
	}[];
};

const fullName = (p: Pick<Person, 'firstName' | 'lastName'>) =>
	[p.firstName, p.lastName].filter(Boolean).join(' ') || '—';

export default function AdminReportCards() {
	const { notify, confirm } = useToast();
	const classes = useBackend<{ id: string; name: string; level: number | null }[]>('/api/classes');
	const terms = useBackend<{ currentTerm: string; terms: string[] }>('/api/grading/report-cards/terms');

	const [classId, setClassId] = useState('');
	const [term, setTerm] = useState('');
	const [busy, setBusy] = useState(false);
	const [preview, setPreview] = useState<ReportCardDetail | null>(null);

	useEffect(() => {
		if (terms.data && !term) setTerm(terms.data.currentTerm);
	}, [terms.data, term]);

	const sortedClasses = useMemo(
		() =>
			[...(classes.data ?? [])].sort(
				(a, b) => (a.level ?? Infinity) - (b.level ?? Infinity) || a.name.localeCompare(b.name)
			),
		[classes.data]
	);

	const list = useBackend<Row[]>(
		classId && term
			? `/api/grading/report-cards?classId=${encodeURIComponent(classId)}&term=${encodeURIComponent(term)}`
			: null
	);
	const rows = list.data ?? [];
	const token = list.token ?? classes.token;

	const generated = rows.filter((r) => r.reportCard).length;
	const published = rows.filter((r) => r.reportCard?.isPublished).length;
	const drafts = generated - published;

	const run = async (action: () => Promise<void>) => {
		if (!token) return;

		setBusy(true);
		try {
			await action();
			list.reload();
		} catch (e) {
			notify((e as Error).message, 'error');
		} finally {
			setBusy(false);
		}
	};

	const handleGenerate = () =>
		run(async () => {
			const r = await backendRequest<{ generated: number; withoutGrades: number }>(
				token!,
				'/api/grading/report-cards/generate',
				{ method: 'POST', body: JSON.stringify({ classId, term }) }
			);
			notify(
				`Generated ${r.generated} report ${r.generated === 1 ? 'card' : 'cards'}` +
					(r.withoutGrades ? ` · ${r.withoutGrades} without published grades` : ''),
				'success'
			);
		});

	const handlePublishAll = async () => {
		const ok = await confirm(
			`Publish ${drafts} draft report ${drafts === 1 ? 'card' : 'cards'}? Students and parents will be able to see them.`,
			{ confirmText: 'Publish' }
		);

		if (!ok) return;

		await run(async () => {
			const r = await backendRequest<{ published: number }>(token!, '/api/grading/report-cards/publish', {
				method: 'POST',
				body: JSON.stringify({ classId, term })
			});
			notify(`Published ${r.published} report ${r.published === 1 ? 'card' : 'cards'}`, 'success');
		});
	};

	const setPublished = (id: string, publish: boolean) =>
		run(async () => {
			await backendRequest(
				token!,
				publish ? '/api/grading/report-cards/publish' : `/api/grading/report-cards/${id}/unpublish`,
				{ method: 'POST', body: JSON.stringify(publish ? { ids: [id] } : {}) }
			);
			setPreview(null);
		});

	const openPreview = async (id: string) => {
		if (!token) return;

		try {
			setPreview(await backendRequest<ReportCardDetail>(token, `/api/grading/report-cards/${id}`));
		} catch (e) {
			notify((e as Error).message, 'error');
		}
	};

	const className = sortedClasses.find((c) => c.id === classId)?.name;

	return (
		<AuthGuardRedirect auth={['SUPER_ADMIN', 'ADMIN']}>
			<FusePageSimple
				content={
					<div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8">
						<div>
							<Typography className="text-3xl font-extrabold tracking-tight">Report Cards</Typography>
							<Typography className="mt-1 text-sm text-gray-500">
								Generate a class&apos;s report cards from its published grades, review the drafts, then
								publish them to students and parents.
							</Typography>
						</div>

						<Paper className="flex flex-wrap items-center gap-3 rounded-2xl p-4 shadow">
							<TextField
								select
								size="small"
								label="Class"
								value={classId}
								onChange={(e) => setClassId(e.target.value)}
								className="w-full sm:w-56"
							>
								{sortedClasses.map((c) => (
									<MenuItem
										key={c.id}
										value={c.id}
									>
										{c.name}
									</MenuItem>
								))}
								{sortedClasses.length === 0 && (
									<MenuItem
										disabled
										value=""
									>
										{classes.loading ? 'Loading…' : 'No classes found'}
									</MenuItem>
								)}
							</TextField>
							<TextField
								select
								size="small"
								label="Term"
								value={term}
								onChange={(e) => setTerm(e.target.value)}
								className="w-full sm:w-44"
							>
								{(terms.data?.terms ?? []).map((t) => (
									<MenuItem
										key={t}
										value={t}
									>
										{t}
										{t === terms.data?.currentTerm ? ' (current)' : ''}
									</MenuItem>
								))}
							</TextField>
							<div className="flex flex-1 flex-wrap justify-end gap-2">
								<Button
									variant="outlined"
									className="rounded-full"
									onClick={handleGenerate}
									disabled={!classId || !term || busy}
									startIcon={<FuseSvgIcon size={16}>lucide:refresh-cw</FuseSvgIcon>}
								>
									{generated ? 'Regenerate' : 'Generate'} report cards
								</Button>
								<Button
									variant="contained"
									color="secondary"
									className="rounded-full"
									onClick={handlePublishAll}
									disabled={!drafts || busy}
									startIcon={<FuseSvgIcon size={16}>lucide:send</FuseSvgIcon>}
								>
									Publish {drafts ? `${drafts} draft${drafts === 1 ? '' : 's'}` : 'drafts'}
								</Button>
							</div>
						</Paper>

						{!classId ? (
							<Paper className="flex flex-col items-center gap-3 rounded-2xl px-6 py-16 text-center shadow">
								<FuseSvgIcon
									className="text-gray-400"
									size={40}
								>
									lucide:file-text
								</FuseSvgIcon>
								<Typography className="text-lg font-semibold">Choose a class to get started</Typography>
								<Typography className="max-w-md text-sm text-gray-500">
									You&apos;ll see every student in the class and whether their report card for the
									term has been generated and published.
								</Typography>
							</Paper>
						) : (
							<>
								<div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
									<StatCard
										icon="lucide:users"
										iconColor="text-blue-600"
										iconBg="bg-blue-50"
										label="Students"
										value={rows.length}
										caption={<span>In {className}</span>}
									/>
									<StatCard
										icon="lucide:file-pen"
										iconColor="text-amber-600"
										iconBg="bg-amber-50"
										label="Drafts"
										value={drafts}
										caption={<span>{rows.length - generated} not generated yet</span>}
									/>
									<StatCard
										icon="lucide:circle-check"
										iconColor="text-green-600"
										iconBg="bg-green-50"
										label="Published"
										value={published}
										caption={<span>Visible to students and parents</span>}
									/>
								</div>

								<Paper className="overflow-hidden rounded-2xl shadow">
									<TableContainer>
										<Table>
											<TableHead>
												<TableRow>
													<TableCell className="font-semibold">Student</TableCell>
													<TableCell className="font-semibold">Admission No.</TableCell>
													<TableCell
														className="font-semibold"
														align="right"
													>
														Subjects
													</TableCell>
													<TableCell
														className="font-semibold"
														align="right"
													>
														Total
													</TableCell>
													<TableCell
														className="font-semibold"
														align="right"
													>
														Average
													</TableCell>
													<TableCell
														className="font-semibold"
														align="right"
													>
														Rank
													</TableCell>
													<TableCell className="font-semibold">Status</TableCell>
													<TableCell
														className="font-semibold"
														align="right"
													>
														Actions
													</TableCell>
												</TableRow>
											</TableHead>
											<TableBody>
												{rows.map(({ student, reportCard: rc }) => (
													<TableRow
														key={student.id}
														hover
													>
														<TableCell className="font-medium">
															{fullName(student)}
														</TableCell>
														<TableCell>{student.admissionNumber ?? '—'}</TableCell>
														<TableCell align="right">{rc?.subjects ?? '—'}</TableCell>
														<TableCell align="right">{rc?.totalScore ?? '—'}</TableCell>
														<TableCell align="right">{rc?.average ?? '—'}</TableCell>
														<TableCell align="right">
															{rc?.rank ? `${rc.rank} / ${generated}` : '—'}
														</TableCell>
														<TableCell>
															{!rc && (
																<span className="text-sm text-gray-400">
																	Not generated
																</span>
															)}
															{rc && (
																<Chip
																	size="small"
																	variant="outlined"
																	label={rc.isPublished ? 'Published' : 'Draft'}
																	color={rc.isPublished ? 'success' : 'warning'}
																/>
															)}
														</TableCell>
														<TableCell
															align="right"
															className="whitespace-nowrap"
														>
															{rc && (
																<>
																	<Tooltip title="Preview">
																		<Button
																			size="small"
																			onClick={() => openPreview(rc.id)}
																		>
																			View
																		</Button>
																	</Tooltip>
																	{!rc.isPublished && (
																		<Button
																			size="small"
																			color="secondary"
																			disabled={busy}
																			onClick={() => setPublished(rc.id, true)}
																		>
																			Publish
																		</Button>
																	)}
																</>
															)}
														</TableCell>
													</TableRow>
												))}
												{rows.length === 0 && (
													<TableRow>
														<TableCell
															colSpan={8}
															align="center"
															className="py-12 text-gray-500"
														>
															{list.loading
																? 'Loading…'
																: (list.error ?? 'No students in this class')}
														</TableCell>
													</TableRow>
												)}
											</TableBody>
										</Table>
									</TableContainer>
								</Paper>
								{rows.length > 0 && generated > 0 && (
									<Typography className="text-xs text-gray-500">
										Last generated{' '}
										{formatDate(
											rows
												.map((r) => r.reportCard?.updatedAt)
												.filter((d): d is string => !!d)
												.sort()
												.at(-1)!
										)}
										. Regenerate after grades change to refresh totals and ranks.
									</Typography>
								)}
							</>
						)}

						<Dialog
							open={!!preview}
							onClose={() => setPreview(null)}
							fullWidth
							maxWidth="md"
						>
							{preview && (
								<>
									<DialogTitle>
										{fullName(preview.student)}
										<Typography className="text-sm text-gray-500">
											{[
												preview.student.admissionNumber,
												preview.student.class?.name,
												preview.term
											]
												.filter(Boolean)
												.join(' · ')}
										</Typography>
									</DialogTitle>
									<DialogContent dividers>
										<div className="mb-4 flex flex-wrap gap-6">
											<div>
												<Typography className="text-xs text-gray-500">Total</Typography>
												<Typography className="text-xl font-bold">
													{preview.totalScore ?? '—'}
												</Typography>
											</div>
											<div>
												<Typography className="text-xs text-gray-500">Average</Typography>
												<Typography className="text-xl font-bold">
													{preview.average ?? '—'}
												</Typography>
											</div>
											<div>
												<Typography className="text-xs text-gray-500">Rank</Typography>
												<Typography className="text-xl font-bold">
													{preview.rank ?? '—'}
												</Typography>
											</div>
										</div>
										<Table size="small">
											<TableHead>
												<TableRow>
													<TableCell className="font-semibold">Subject</TableCell>
													<TableCell className="font-semibold">Grade</TableCell>
													<TableCell className="font-semibold">
														Teacher&apos;s remark
													</TableCell>
												</TableRow>
											</TableHead>
											<TableBody>
												{preview.subjectGrades.map((g) => (
													<TableRow key={g.id}>
														<TableCell>{g.subject.name}</TableCell>
														<TableCell className="font-medium">{g.gradeValue}</TableCell>
														<TableCell className="text-gray-600">
															{g.teacherRemark ?? '—'}
														</TableCell>
													</TableRow>
												))}
											</TableBody>
										</Table>
									</DialogContent>
									<DialogActions className="px-6 py-3">
										<Button onClick={() => setPreview(null)}>Close</Button>
										<Button
											variant="contained"
											color={preview.isPublished ? 'inherit' : 'secondary'}
											className="rounded-full"
											disabled={busy}
											onClick={() => setPublished(preview.id, !preview.isPublished)}
										>
											{preview.isPublished ? 'Unpublish' : 'Publish'}
										</Button>
									</DialogActions>
								</>
							)}
						</Dialog>
					</div>
				}
			/>
		</AuthGuardRedirect>
	);
}
