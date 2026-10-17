'use client';

import { useSession } from 'next-auth/react';
import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Typography from '@mui/material/Typography';
import Paper from '@mui/material/Paper';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import TextField from '@mui/material/TextField';
import IconButton from '@mui/material/IconButton';
import Radio from '@mui/material/Radio';
import RadioGroup from '@mui/material/RadioGroup';
import FormControlLabel from '@mui/material/FormControlLabel';
import FormControl from '@mui/material/FormControl';
import FormLabel from '@mui/material/FormLabel';
import LinearProgress from '@mui/material/LinearProgress';
import CircularProgress from '@mui/material/CircularProgress';
import Divider from '@mui/material/Divider';
import Alert from '@mui/material/Alert';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import Skeleton from '@mui/material/Skeleton';
import FusePageSimple from '@fuse/core/FusePageSimple';
import AuthGuardRedirect from '@auth/AuthGuardRedirect';
import FuseSvgIcon from '@fuse/core/FuseSvgIcon';
import { useSnackbar } from 'notistack';
import { BACKEND_URL } from '@/lib/backend';
import { downloadAssignmentFile } from '@/lib/assignments';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type QuestionOption = {
	label: string;
	value: string;
};

type Question = {
	id: string;
	text: string;
	type: 'MCQ' | 'OPEN_ENDED';
	options?: string; // JSON-stringified QuestionOption[] for MCQ
	points?: number;
};

type Submission = {
	id: string;
	status: 'PENDING' | 'AUTO_GRADED' | 'MANUALLY_GRADED';
	score?: number;
	feedback?: string;
	fileUrl?: string;
	textContent?: string;
	submittedAt?: string;
	answers?: { questionId: string; answer: string; isCorrect?: boolean }[];
};

type Assignment = {
	id: string;
	title: string;
	subject?: { name?: string; code?: string } | string;
	description?: string;
	dueDate: string;
	type: 'QUIZ' | 'FILE_UPLOAD';
	maxScore: number;
	attachmentUrl?: string | null;
	attachmentName?: string | null;
	status?: string;
	isOpen?: boolean;
	questions?: Question[];
	submission?: Submission | null;
};

/* ------------------------------------------------------------------ */
/*  Status helpers                                                     */
/* ------------------------------------------------------------------ */

function getSubmissionLabel(a: Assignment): string {
	if (!a.submission) return 'Not Submitted';

	switch (a.submission.status) {
		case 'PENDING':
			return a.type === 'FILE_UPLOAD' ? 'Handed In' : 'Pending Review';
		case 'AUTO_GRADED':
			return 'Auto-Graded';
		case 'MANUALLY_GRADED':
			return 'Graded';
		default:
			return a.submission.status;
	}
}

function getSubmissionColor(a: Assignment): 'default' | 'warning' | 'info' | 'success' {
	if (!a.submission) return 'default';

	switch (a.submission.status) {
		case 'PENDING':
			return 'warning';
		case 'AUTO_GRADED':
			return 'info';
		case 'MANUALLY_GRADED':
			return 'success';
		default:
			return 'default';
	}
}

function getTypeIcon(type: string) {
	switch (type) {
		case 'QUIZ':
			return 'lucide:brain';
		case 'FILE_UPLOAD':
			return 'lucide:file-down';
		default:
			return 'lucide:file-text';
	}
}

function getTypeLabel(type: string) {
	switch (type) {
		case 'QUIZ':
			return 'Quiz';
		case 'FILE_UPLOAD':
			return 'Download & Hand In';
		default:
			return 'Written';
	}
}

function isDueSoon(dueDate: string): boolean {
	const now = new Date();
	const due = new Date(dueDate);
	const diff = due.getTime() - now.getTime();
	return diff > 0 && diff < 48 * 60 * 60 * 1000;
}

function isOverdue(dueDate: string): boolean {
	return new Date(dueDate) < new Date();
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function StudentAssignments() {
	const { data: session, status: sessionStatus } = useSession();
	const token = (session as any)?.backendToken;
	const studentId = (session?.user as any)?.id;
	const { enqueueSnackbar } = useSnackbar();
	const router = useRouter();
	const deepLinkHandled = useRef(false);

	const [assignments, setAssignments] = useState<Assignment[]>([]);
	const [loading, setLoading] = useState(true);
	const [tabValue, setTabValue] = useState(0);

	// Quiz dialog
	const [quizOpen, setQuizOpen] = useState(false);
	const [quizAssignment, setQuizAssignment] = useState<Assignment | null>(null);
	const [quizAnswers, setQuizAnswers] = useState<Record<string, string>>({});
	const [submittingQuiz, setSubmittingQuiz] = useState(false);
	const [quizResult, setQuizResult] = useState<Submission | null>(null);

	// File assignments: downloaded, done on paper, handed in to the teacher
	const [downloadingId, setDownloadingId] = useState<string | null>(null);

	// Results dialog
	const [resultsOpen, setResultsOpen] = useState(false);
	const [resultsAssignment, setResultsAssignment] = useState<Assignment | null>(null);

	/* ---------- Fetch assignments ---------- */
	const fetchAssignments = useCallback(async () => {
		if (!token || !studentId) return;

		setLoading(true);
		try {
			const res = await fetch(`${BACKEND_URL}/api/assignments?studentId=${studentId}`, {
				headers: { Authorization: `Bearer ${token}` }
			});

			if (!res.ok) throw new Error('Failed to fetch');

			const data = await res.json();
			const list = Array.isArray(data) ? data : data.assignments || [];
			setAssignments(list.filter((a: Assignment) => a.status === 'PUBLISHED'));
		} catch (err) {
			console.error(err);
			enqueueSnackbar('Could not load assignments', { variant: 'error' });
		} finally {
			setLoading(false);
		}
	}, [token, studentId, enqueueSnackbar]);

	useEffect(() => {
		if (sessionStatus === 'loading') return;

		fetchAssignments();
	}, [sessionStatus, fetchAssignments]);

	/* ---------- Filtered lists ---------- */
	const pendingAssignments = useMemo(() => assignments.filter((a) => !a.submission), [assignments]);
	const submittedAssignments = useMemo(
		() => assignments.filter((a) => a.submission && a.submission.status === 'PENDING'),
		[assignments]
	);
	const gradedAssignments = useMemo(
		() =>
			assignments.filter(
				(a) =>
					a.submission && (a.submission.status === 'AUTO_GRADED' || a.submission.status === 'MANUALLY_GRADED')
			),
		[assignments]
	);

	const tabAssignments = [pendingAssignments, submittedAssignments, gradedAssignments, assignments];

	/* ---------- Quiz handlers ---------- */
	const openQuiz = (assignment: Assignment) => {
		setQuizAssignment(assignment);
		setQuizAnswers({});
		setQuizResult(null);
		setQuizOpen(true);
	};

	const handleQuizAnswerChange = (questionId: string, answer: string) => {
		setQuizAnswers((prev) => ({ ...prev, [questionId]: answer }));
	};

	const submitQuiz = async () => {
		if (!quizAssignment || !token) return;

		const questions = quizAssignment.questions || [];
		const unanswered = questions.filter((q) => !quizAnswers[q.id]);

		if (unanswered.length > 0) {
			enqueueSnackbar(`Please answer all ${unanswered.length} remaining question(s)`, {
				variant: 'warning'
			});
			return;
		}

		setSubmittingQuiz(true);
		try {
			const body = {
				answers: questions.map((q) => ({
					questionId: q.id,
					answer: quizAnswers[q.id] || ''
				}))
			};
			const res = await fetch(`${BACKEND_URL}/api/assignments/${quizAssignment.id}/submit`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${token}`
				},
				body: JSON.stringify(body)
			});

			if (!res.ok) throw new Error('Submission failed');

			const result = await res.json();
			setQuizResult(result);
			enqueueSnackbar(
				result.status === 'AUTO_GRADED'
					? `Quiz graded! Score: ${result.score}/${quizAssignment.maxScore}`
					: 'Quiz submitted successfully!',
				{ variant: 'success' }
			);
			fetchAssignments();
		} catch (err) {
			console.error(err);
			enqueueSnackbar('Failed to submit quiz', { variant: 'error' });
		} finally {
			setSubmittingQuiz(false);
		}
	};

	/* ---------- File download ---------- */
	const downloadFile = async (assignment: Assignment) => {
		if (!token) return;

		setDownloadingId(assignment.id);
		try {
			await downloadAssignmentFile(token, assignment);
		} catch (err) {
			enqueueSnackbar((err as Error).message, { variant: 'error' });
		} finally {
			setDownloadingId(null);
		}
	};

	/* ---------- Results dialog ---------- */
	const openResults = (assignment: Assignment) => {
		setResultsAssignment(assignment);
		setResultsOpen(true);
	};

	/* ---------- Card click handler ---------- */
	const handleCardAction = (assignment: Assignment) => {
		if (
			assignment.submission &&
			(assignment.submission.status === 'AUTO_GRADED' || assignment.submission.status === 'MANUALLY_GRADED')
		) {
			openResults(assignment);
			return;
		}

		if (assignment.isOpen === false) {
			enqueueSnackbar('This assignment is locked by your teacher', { variant: 'info' });
			return;
		}

		if (assignment.submission) return; // Already submitted, pending review

		if (assignment.type === 'QUIZ') {
			openQuiz(assignment);
		} else {
			downloadFile(assignment);
		}
	};

	// Notification links land here as /student/assignments?open=<id>
	useEffect(() => {
		if (loading || deepLinkHandled.current) return;

		const id = new URLSearchParams(window.location.search).get('open');

		if (!id) return;

		deepLinkHandled.current = true;
		router.replace('/student/assignments');
		const target = assignments.find((a) => a.id === id);

		if (!target) {
			enqueueSnackbar('That assignment is no longer available', { variant: 'warning' });
		} else if (target.submission && target.submission.status === 'PENDING') {
			enqueueSnackbar('You have already submitted this assignment', { variant: 'info' });
		} else {
			handleCardAction(target);
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [loading, assignments]);

	const getActionLabel = (a: Assignment) => {
		const graded = a.submission?.status === 'AUTO_GRADED' || a.submission?.status === 'MANUALLY_GRADED';

		if (a.isOpen === false && !graded) return 'Locked';

		if (!a.submission) {
			if (a.type === 'QUIZ') return 'Take Quiz';

			return downloadingId === a.id ? 'Downloading…' : 'Download Assignment';
		}

		if (a.submission.status === 'PENDING')
			return a.type === 'FILE_UPLOAD' ? 'Handed In · Awaiting Marks' : 'Awaiting Review';

		return 'View Results';
	};

	/* ---------- Parse MCQ options ---------- */
	const parseOptions = (optStr?: string): QuestionOption[] => {
		if (!optStr) return [];

		try {
			const parsed = JSON.parse(optStr);

			if (Array.isArray(parsed)) {
				return parsed.map((o: any, i: number) => {
					if (typeof o === 'string') {
						return { label: String.fromCharCode(65 + i), value: o };
					}

					return { label: o.label || String.fromCharCode(65 + i), value: o.value || o };
				});
			}
		} catch {
			// fallback: try comma-separated
			return optStr.split(',').map((o, i) => ({
				label: String.fromCharCode(65 + i),
				value: o.trim()
			}));
		}
		return [];
	};

	/* ---------- Loading state ---------- */
	if (sessionStatus === 'loading' || loading) {
		return (
			<AuthGuardRedirect auth={['STUDENT']}>
				<FusePageSimple
					content={
						<div className="mx-auto flex w-full max-w-7xl flex-col gap-6 p-6">
							<Skeleton
								variant="text"
								width={300}
								height={48}
							/>
							<Skeleton
								variant="text"
								width={400}
								height={24}
							/>
							<div className="mt-4 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
								{[1, 2, 3, 4, 5, 6].map((i) => (
									<Skeleton
										key={i}
										variant="rounded"
										height={220}
										sx={{ borderRadius: '16px' }}
									/>
								))}
							</div>
						</div>
					}
				/>
			</AuthGuardRedirect>
		);
	}

	return (
		<AuthGuardRedirect auth={['STUDENT']}>
			<FusePageSimple
				content={
					<div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8">
						{/* ---- Header ---- */}
						<Box className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
							<div>
								<Typography className="text-4xl font-extrabold tracking-tight">
									Assignments &amp; Coursework
								</Typography>
								<Typography color="text.secondary">
									View your assignments, take quizzes, and track your grades.
								</Typography>
							</div>
							<div className="flex flex-wrap items-center gap-2">
								{[
									{
										label: 'To do',
										value: pendingAssignments.length,
										icon: 'lucide:clipboard-list',
										cls: 'bg-indigo-50 text-indigo-700 border-indigo-100'
									},
									{
										label: 'Submitted',
										value: submittedAssignments.length,
										icon: 'lucide:send',
										cls: 'bg-amber-50 text-amber-700 border-amber-100'
									},
									{
										label: 'Graded',
										value: gradedAssignments.length,
										icon: 'lucide:award',
										cls: 'bg-emerald-50 text-emerald-700 border-emerald-100'
									}
								].map((p) => (
									<div
										key={p.label}
										className={`flex items-center gap-2 rounded-full border px-4 py-2 ${p.cls}`}
									>
										<FuseSvgIcon size={16}>{p.icon}</FuseSvgIcon>
										<span className="text-lg leading-none font-bold">{p.value}</span>
										<span className="text-sm font-medium">{p.label}</span>
									</div>
								))}
							</div>
						</Box>

						{/* ---- Tabs ---- */}
						<Paper
							className="rounded-2xl shadow-sm"
							elevation={0}
						>
							<Tabs
								value={tabValue}
								onChange={(_, v) => setTabValue(v)}
								variant="scrollable"
								scrollButtons="auto"
								sx={{ '& .MuiTab-root': { textTransform: 'none', fontWeight: 600, minHeight: 44 } }}
							>
								<Tab
									label={`To Do (${pendingAssignments.length})`}
									icon={<FuseSvgIcon size={18}>lucide:clock</FuseSvgIcon>}
									iconPosition="start"
								/>
								<Tab
									label={`Submitted (${submittedAssignments.length})`}
									icon={<FuseSvgIcon size={18}>lucide:send</FuseSvgIcon>}
									iconPosition="start"
								/>
								<Tab
									label={`Graded (${gradedAssignments.length})`}
									icon={<FuseSvgIcon size={18}>lucide:award</FuseSvgIcon>}
									iconPosition="start"
								/>
								<Tab
									label={`All (${assignments.length})`}
									icon={<FuseSvgIcon size={18}>lucide:layers</FuseSvgIcon>}
									iconPosition="start"
								/>
							</Tabs>
						</Paper>

						{/* ---- Assignment Cards ---- */}
						{tabAssignments[tabValue].length === 0 ? (
							<Paper className="flex min-h-[240px] flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed p-12 text-center">
								<FuseSvgIcon
									size={56}
									color="disabled"
								>
									{tabValue === 0
										? 'lucide:party-popper'
										: tabValue === 1
											? 'lucide:clock'
											: tabValue === 2
												? 'lucide:chart-column'
												: 'lucide:inbox'}
								</FuseSvgIcon>
								<Typography
									variant="h6"
									fontWeight="bold"
								>
									{tabValue === 0
										? 'All caught up!'
										: tabValue === 1
											? 'No pending submissions'
											: tabValue === 2
												? 'No graded assignments yet'
												: 'No assignments found'}
								</Typography>
								<Typography color="text.secondary">
									{tabValue === 0
										? 'You have no pending assignments. Great job!'
										: 'Nothing to show here right now.'}
								</Typography>
							</Paper>
						) : (
							<div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
								{tabAssignments[tabValue].map((assignment) => {
									const locked = assignment.isOpen === false;
									const overdue = !locked && !assignment.submission && isOverdue(assignment.dueDate);
									const dueSoon = !locked && !assignment.submission && isDueSoon(assignment.dueDate);
									const graded =
										assignment.submission?.status === 'AUTO_GRADED' ||
										assignment.submission?.status === 'MANUALLY_GRADED';
									const scorePercent =
										graded && assignment.submission?.score != null
											? Math.round((assignment.submission.score / assignment.maxScore) * 100)
											: null;

									return (
										<Paper
											key={assignment.id}
											className="flex flex-col overflow-hidden rounded-2xl shadow-sm transition-shadow hover:shadow-md"
											sx={{
												opacity: locked && !graded ? 0.75 : 1,
												border: overdue ? '2px solid' : dueSoon ? '2px solid' : '1px solid',
												borderColor: overdue
													? 'error.main'
													: dueSoon
														? 'warning.main'
														: 'divider'
											}}
										>
											{/* Card header band */}
											<Box
												sx={{
													background: graded
														? 'linear-gradient(135deg, #10b981 0%, #059669 100%)'
														: locked
															? 'linear-gradient(135deg, #64748b 0%, #475569 100%)'
															: assignment.type === 'QUIZ'
																? 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)'
																: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
													px: 2.5,
													py: 1.5,
													display: 'flex',
													alignItems: 'center',
													justifyContent: 'space-between'
												}}
											>
												<Box className="flex items-center gap-2">
													<FuseSvgIcon
														size={18}
														sx={{ color: 'white' }}
													>
														{locked && !graded
															? 'lucide:lock'
															: getTypeIcon(assignment.type)}
													</FuseSvgIcon>
													<Typography
														variant="caption"
														fontWeight={700}
														sx={{
															color: 'white',
															textTransform: 'uppercase',
															letterSpacing: 0.5
														}}
													>
														{getTypeLabel(assignment.type)}
														{locked && ' · Locked'}
													</Typography>
												</Box>
												<Chip
													label={getSubmissionLabel(assignment)}
													color={getSubmissionColor(assignment)}
													size="small"
													sx={{
														fontWeight: 600,
														fontSize: '0.7rem',
														...(getSubmissionColor(assignment) === 'default'
															? { bgcolor: 'rgba(255,255,255,0.2)', color: 'white' }
															: {})
													}}
												/>
											</Box>

											{/* Card body */}
											<Box className="flex flex-1 flex-col gap-3 p-5">
												<Typography
													variant="subtitle1"
													fontWeight={700}
													className="line-clamp-2"
												>
													{assignment.title}
												</Typography>

												<Box className="flex flex-wrap items-center gap-2">
													<Chip
														label={
															typeof assignment.subject === 'object' && assignment.subject
																? assignment.subject.name || '—'
																: (assignment.subject as string) || '—'
														}
														size="small"
														variant="outlined"
														sx={{ fontWeight: 500 }}
													/>
													{overdue && (
														<Chip
															label="Overdue"
															size="small"
															color="error"
															icon={
																<FuseSvgIcon size={14}>
																	lucide:triangle-alert
																</FuseSvgIcon>
															}
														/>
													)}
													{dueSoon && !overdue && (
														<Chip
															label="Due Soon"
															size="small"
															color="warning"
															icon={
																<FuseSvgIcon size={14}>lucide:circle-alert</FuseSvgIcon>
															}
														/>
													)}
												</Box>

												<Box className="mt-1 flex items-center gap-1.5">
													<FuseSvgIcon
														size={16}
														color="action"
													>
														lucide:calendar
													</FuseSvgIcon>
													<Typography
														variant="body2"
														color="text.secondary"
													>
														Due:{' '}
														{new Date(assignment.dueDate).toLocaleDateString('en-US', {
															weekday: 'short',
															month: 'short',
															day: 'numeric',
															year: 'numeric'
														})}
													</Typography>
												</Box>

												<Box className="flex items-center gap-1.5">
													<FuseSvgIcon
														size={16}
														color="action"
													>
														lucide:target
													</FuseSvgIcon>
													<Typography
														variant="body2"
														color="text.secondary"
													>
														Max Score: {assignment.maxScore} pts
													</Typography>
												</Box>

												{assignment.type === 'FILE_UPLOAD' && assignment.attachmentUrl && (
													<Box
														className="mt-1 flex items-start gap-1.5 rounded-xl p-2.5"
														sx={{ bgcolor: 'action.hover' }}
													>
														<FuseSvgIcon
															size={16}
															color="action"
															sx={{ mt: 0.25 }}
														>
															lucide:file-text
														</FuseSvgIcon>
														<Box className="min-w-0 flex-1">
															<Typography
																variant="body2"
																fontWeight={600}
																noWrap
															>
																{assignment.attachmentName || 'Assignment file'}
															</Typography>
															<Typography
																variant="caption"
																color="text.secondary"
															>
																Do it on paper and hand it in to your teacher.
															</Typography>
														</Box>
														{assignment.submission && !locked && (
															<IconButton
																size="small"
																aria-label="Download file"
																disabled={downloadingId === assignment.id}
																onClick={() => downloadFile(assignment)}
															>
																<FuseSvgIcon size={16}>lucide:download</FuseSvgIcon>
															</IconButton>
														)}
													</Box>
												)}

												{/* Score bar for graded */}
												{graded && scorePercent !== null && (
													<Box className="mt-2">
														<Box className="mb-1 flex items-center justify-between">
															<Typography
																variant="body2"
																fontWeight={600}
															>
																Score: {assignment.submission!.score}/
																{assignment.maxScore}
															</Typography>
															<Typography
																variant="body2"
																fontWeight={700}
																color={
																	scorePercent >= 80
																		? 'success.main'
																		: scorePercent >= 50
																			? 'warning.main'
																			: 'error.main'
																}
															>
																{scorePercent}%
															</Typography>
														</Box>
														<LinearProgress
															variant="determinate"
															value={scorePercent}
															sx={{
																height: 8,
																borderRadius: 4,
																bgcolor: 'grey.100',
																'& .MuiLinearProgress-bar': {
																	borderRadius: 4,
																	bgcolor:
																		scorePercent >= 80
																			? 'success.main'
																			: scorePercent >= 50
																				? 'warning.main'
																				: 'error.main'
																}
															}}
														/>
													</Box>
												)}

												{/* Spacer */}
												<Box className="flex-1" />

												{/* Action button */}
												<Button
													variant={
														!assignment.submission
															? 'contained'
															: graded
																? 'outlined'
																: 'text'
													}
													color={
														!assignment.submission
															? 'primary'
															: graded
																? 'success'
																: 'inherit'
													}
													fullWidth
													onClick={() => handleCardAction(assignment)}
													disabled={
														assignment.submission?.status === 'PENDING' ||
														(locked && !graded) ||
														downloadingId === assignment.id
													}
													sx={{
														mt: 1,
														borderRadius: '12px',
														textTransform: 'none',
														fontWeight: 600
													}}
													startIcon={
														<FuseSvgIcon size={18}>
															{locked && !graded
																? 'lucide:lock'
																: !assignment.submission
																	? assignment.type === 'QUIZ'
																		? 'lucide:play'
																		: 'lucide:download'
																	: graded
																		? 'lucide:eye'
																		: 'lucide:loader'}
														</FuseSvgIcon>
													}
												>
													{getActionLabel(assignment)}
												</Button>
											</Box>
										</Paper>
									);
								})}
							</div>
						)}

						{/* ================================================================ */}
						{/*  QUIZ TAKING DIALOG                                             */}
						{/* ================================================================ */}
						<Dialog
							open={quizOpen}
							onClose={() => !submittingQuiz && !quizResult && setQuizOpen(false)}
							maxWidth="md"
							fullWidth
							PaperProps={{ sx: { borderRadius: '16px' } }}
						>
							<DialogTitle
								sx={{
									background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
									color: 'white',
									display: 'flex',
									alignItems: 'center',
									gap: 1.5
								}}
							>
								<FuseSvgIcon sx={{ color: 'white' }}>lucide:brain</FuseSvgIcon>
								{quizResult ? 'Quiz Results' : quizAssignment?.title}
							</DialogTitle>

							<DialogContent sx={{ py: 3, px: 3 }}>
								{quizResult ? (
									/* ------- Results view ------- */
									<Box className="flex flex-col items-center gap-6 py-6">
										<Box
											sx={{
												width: 120,
												height: 120,
												borderRadius: '50%',
												display: 'flex',
												alignItems: 'center',
												justifyContent: 'center',
												background:
													quizResult.score != null &&
													quizResult.score / (quizAssignment?.maxScore || 1) >= 0.8
														? 'linear-gradient(135deg, #10b981, #059669)'
														: quizResult.score != null &&
															  quizResult.score / (quizAssignment?.maxScore || 1) >= 0.5
															? 'linear-gradient(135deg, #f59e0b, #d97706)'
															: 'linear-gradient(135deg, #ef4444, #dc2626)'
											}}
										>
											<Typography
												variant="h3"
												fontWeight={800}
												sx={{ color: 'white' }}
											>
												{quizResult.score ?? '—'}
											</Typography>
										</Box>
										<Typography
											variant="h6"
											fontWeight={600}
										>
											out of {quizAssignment?.maxScore} points
										</Typography>
										{quizResult.feedback && (
											<Alert
												severity="info"
												sx={{ width: '100%', borderRadius: '12px' }}
											>
												<Typography variant="body2">{quizResult.feedback}</Typography>
											</Alert>
										)}
									</Box>
								) : (
									/* ------- Question form ------- */
									<Box className="mt-4 flex flex-col gap-6">
										{(quizAssignment?.questions || []).map((q, idx) => {
											const options = parseOptions(q.options);
											return (
												<Paper
													key={q.id}
													variant="outlined"
													sx={{ p: 2.5, borderRadius: '12px' }}
												>
													<FormControl fullWidth>
														<FormLabel
															sx={{ fontWeight: 600, mb: 1.5, color: 'text.primary' }}
														>
															<Box className="flex items-center gap-2">
																<Chip
																	label={`Q${idx + 1}`}
																	size="small"
																	color="primary"
																	sx={{ fontWeight: 700, minWidth: 40 }}
																/>
																<Typography
																	component="span"
																	fontWeight={600}
																>
																	{q.text}
																</Typography>
																{q.points != null && (
																	<Typography
																		component="span"
																		variant="caption"
																		color="text.secondary"
																		sx={{ ml: 'auto' }}
																	>
																		({q.points} pts)
																	</Typography>
																)}
															</Box>
														</FormLabel>

														{q.type === 'MCQ' ? (
															<RadioGroup
																value={quizAnswers[q.id] || ''}
																onChange={(e) =>
																	handleQuizAnswerChange(q.id, e.target.value)
																}
															>
																{options.map((opt) => (
																	<FormControlLabel
																		key={opt.label}
																		value={opt.label}
																		control={<Radio />}
																		label={
																			<Typography variant="body2">
																				<strong>{opt.label}.</strong>{' '}
																				{opt.value}
																			</Typography>
																		}
																		sx={{
																			mx: 0,
																			py: 0.5,
																			px: 1.5,
																			borderRadius: '8px',
																			mb: 0.5,
																			'&:hover': { bgcolor: 'action.hover' },
																			...(quizAnswers[q.id] === opt.label
																				? {
																						bgcolor: 'primary.50',
																						border: '1px solid',
																						borderColor: 'primary.main'
																					}
																				: { border: '1px solid transparent' })
																		}}
																	/>
																))}
															</RadioGroup>
														) : (
															<TextField
																multiline
																rows={3}
																fullWidth
																placeholder="Type your answer here..."
																value={quizAnswers[q.id] || ''}
																onChange={(e) =>
																	handleQuizAnswerChange(q.id, e.target.value)
																}
																sx={{ mt: 1 }}
															/>
														)}
													</FormControl>
												</Paper>
											);
										})}
									</Box>
								)}
							</DialogContent>

							<Divider />
							<DialogActions sx={{ px: 3, py: 2 }}>
								{quizResult ? (
									<Button
										onClick={() => setQuizOpen(false)}
										variant="contained"
										sx={{ borderRadius: '10px' }}
									>
										Done
									</Button>
								) : (
									<>
										<Button
											onClick={() => setQuizOpen(false)}
											disabled={submittingQuiz}
										>
											Cancel
										</Button>
										<Button
											variant="contained"
											onClick={submitQuiz}
											disabled={submittingQuiz}
											startIcon={
												submittingQuiz ? (
													<CircularProgress
														size={18}
														color="inherit"
													/>
												) : (
													<FuseSvgIcon size={18}>lucide:send</FuseSvgIcon>
												)
											}
											sx={{ borderRadius: '10px', minWidth: 140 }}
										>
											{submittingQuiz ? 'Submitting...' : 'Submit Quiz'}
										</Button>
									</>
								)}
							</DialogActions>
						</Dialog>

						{/* ================================================================ */}
						{/*  VIEW RESULTS DIALOG                                            */}
						{/* ================================================================ */}
						<Dialog
							open={resultsOpen}
							onClose={() => setResultsOpen(false)}
							maxWidth="sm"
							fullWidth
							PaperProps={{ sx: { borderRadius: '16px' } }}
						>
							<DialogTitle
								sx={{
									background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
									color: 'white',
									display: 'flex',
									alignItems: 'center',
									gap: 1.5
								}}
							>
								<FuseSvgIcon sx={{ color: 'white' }}>lucide:award</FuseSvgIcon>
								Results: {resultsAssignment?.title}
							</DialogTitle>

							<DialogContent sx={{ py: 3, px: 3 }}>
								{resultsAssignment?.submission && (
									<Box className="mt-4 flex flex-col gap-6">
										{/* Score display */}
										<Box className="flex items-center justify-center gap-6">
											<Box
												sx={{
													width: 100,
													height: 100,
													borderRadius: '50%',
													display: 'flex',
													flexDirection: 'column',
													alignItems: 'center',
													justifyContent: 'center',
													background:
														(resultsAssignment.submission.score ?? 0) /
															resultsAssignment.maxScore >=
														0.8
															? 'linear-gradient(135deg, #10b981, #059669)'
															: (resultsAssignment.submission.score ?? 0) /
																		resultsAssignment.maxScore >=
																  0.5
																? 'linear-gradient(135deg, #f59e0b, #d97706)'
																: 'linear-gradient(135deg, #ef4444, #dc2626)'
												}}
											>
												<Typography
													variant="h4"
													fontWeight={800}
													sx={{ color: 'white' }}
												>
													{resultsAssignment.submission.score ?? '—'}
												</Typography>
												<Typography
													variant="caption"
													sx={{ color: 'rgba(255,255,255,0.8)' }}
												>
													/ {resultsAssignment.maxScore}
												</Typography>
											</Box>
										</Box>

										{/* Details */}
										<Box className="flex flex-col gap-3">
											<Paper
												variant="outlined"
												sx={{ p: 2, borderRadius: '12px' }}
											>
												<Box className="flex items-center justify-between">
													<Typography
														variant="body2"
														color="text.secondary"
													>
														Subject
													</Typography>
													<Typography
														variant="body2"
														fontWeight={600}
													>
														{typeof resultsAssignment.subject === 'object' &&
														resultsAssignment.subject
															? resultsAssignment.subject.name || '—'
															: (resultsAssignment.subject as string) || '—'}
													</Typography>
												</Box>
											</Paper>
											<Paper
												variant="outlined"
												sx={{ p: 2, borderRadius: '12px' }}
											>
												<Box className="flex items-center justify-between">
													<Typography
														variant="body2"
														color="text.secondary"
													>
														Status
													</Typography>
													<Chip
														label={
															resultsAssignment.submission.status === 'AUTO_GRADED'
																? 'Auto-Graded'
																: 'Manually Graded'
														}
														size="small"
														color="success"
													/>
												</Box>
											</Paper>
											{resultsAssignment.submission.submittedAt && (
												<Paper
													variant="outlined"
													sx={{ p: 2, borderRadius: '12px' }}
												>
													<Box className="flex items-center justify-between">
														<Typography
															variant="body2"
															color="text.secondary"
														>
															Submitted
														</Typography>
														<Typography
															variant="body2"
															fontWeight={600}
														>
															{new Date(
																resultsAssignment.submission.submittedAt
															).toLocaleString()}
														</Typography>
													</Box>
												</Paper>
											)}
										</Box>

										{/* Teacher feedback */}
										{resultsAssignment.submission.feedback && (
											<Box>
												<Typography
													variant="subtitle2"
													fontWeight={600}
													sx={{ mb: 1 }}
												>
													Teacher Feedback
												</Typography>
												<Paper
													sx={{
														p: 2,
														borderRadius: '12px',
														bgcolor: 'grey.50',
														borderLeft: '4px solid',
														borderColor: 'primary.main'
													}}
												>
													<Typography variant="body2">
														{resultsAssignment.submission.feedback}
													</Typography>
												</Paper>
											</Box>
										)}

										{resultsAssignment.attachmentUrl && (
											<Button
												variant="outlined"
												startIcon={<FuseSvgIcon size={18}>lucide:download</FuseSvgIcon>}
												onClick={() => downloadFile(resultsAssignment)}
												disabled={downloadingId === resultsAssignment.id}
												sx={{ borderRadius: '10px' }}
											>
												Download Assignment
											</Button>
										)}

										{/* File link */}
										{resultsAssignment.submission.fileUrl && (
											<Button
												variant="outlined"
												startIcon={<FuseSvgIcon size={18}>lucide:download</FuseSvgIcon>}
												href={resultsAssignment.submission.fileUrl}
												target="_blank"
												sx={{ borderRadius: '10px' }}
											>
												View Submitted File
											</Button>
										)}
									</Box>
								)}
							</DialogContent>

							<DialogActions sx={{ px: 3, py: 2 }}>
								<Button
									onClick={() => setResultsOpen(false)}
									variant="contained"
									sx={{ borderRadius: '10px' }}
								>
									Close
								</Button>
							</DialogActions>
						</Dialog>
					</div>
				}
			/>
		</AuthGuardRedirect>
	);
}
