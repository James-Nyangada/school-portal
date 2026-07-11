'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSession } from 'next-auth/react';
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
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import IconButton from '@mui/material/IconButton';
import Stepper from '@mui/material/Stepper';
import Step from '@mui/material/Step';
import StepLabel from '@mui/material/StepLabel';
import Divider from '@mui/material/Divider';
import CircularProgress from '@mui/material/CircularProgress';
import Tooltip from '@mui/material/Tooltip';
import Stack from '@mui/material/Stack';
import FusePageSimple from '@fuse/core/FusePageSimple';
import FuseSvgIcon from '@fuse/core/FuseSvgIcon';
import AuthGuardRedirect from '@auth/AuthGuardRedirect';
import { MaterialReactTable, type MRT_ColumnDef } from 'material-react-table';
import { useSnackbar } from 'notistack';

// ─── Types ───────────────────────────────────────────────────────────────────

type Assignment = {
	id: string;
	title: string;
	description?: string;
	type: 'QUIZ' | 'FILE_UPLOAD';
	subject?: { id: string; name: string };
	subjectId?: string;
	dueDate: string;
	maxScore: number;
	_count?: { submissions: number };
	submissionsCount?: number;
	createdAt?: string;
};

type Submission = {
	id: string;
	student?: { id: string; user?: { firstName: string; lastName: string } };
	studentName?: string;
	score?: number | null;
	status: 'PENDING' | 'AUTO_GRADED' | 'MANUALLY_GRADED';
	answers?: any;
	fileUrl?: string;
	feedback?: string | null;
	submittedAt?: string;
	createdAt?: string;
};

type QuizQuestion = {
	id: string;
	text: string;
	type: 'MCQ' | 'OPEN_ENDED';
	options: string[];
	correctAnswer: string;
	points: number;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

const statusColorMap: Record<string, 'warning' | 'info' | 'success'> = {
	PENDING: 'warning',
	AUTO_GRADED: 'info',
	MANUALLY_GRADED: 'success'
};

const formatDate = (dateStr?: string) => {
	if (!dateStr) return '—';

	try {
		return new Date(dateStr).toLocaleDateString('en-US', {
			year: 'numeric',
			month: 'short',
			day: 'numeric'
		});
	} catch {
		return dateStr;
	}
};

const generateId = () => Math.random().toString(36).substring(2, 10);

// ─── Component ───────────────────────────────────────────────────────────────

export default function TeacherAssignments() {
	const { data: session } = useSession();
	const token = (session as any)?.backendToken;
	const { enqueueSnackbar } = useSnackbar();

	// ── Assignment List State ──────────────────────────────────────────────────
	const [assignments, setAssignments] = useState<Assignment[]>([]);
	const [loading, setLoading] = useState(true);

	// ── Create Dialog State ────────────────────────────────────────────────────
	const [createOpen, setCreateOpen] = useState(false);
	const [createStep, setCreateStep] = useState(0);
	const [creating, setCreating] = useState(false);

	// Step 1 fields
	const [newTitle, setNewTitle] = useState('');
	const [newDescription, setNewDescription] = useState('');
	const [newType, setNewType] = useState<'QUIZ' | 'FILE_UPLOAD'>('QUIZ');
	const [newSubjectId, setNewSubjectId] = useState('');
	const [newClassId, setNewClassId] = useState('');
	const [newDueDate, setNewDueDate] = useState('');
	const [newMaxScore, setNewMaxScore] = useState('100');

	const [classes, setClasses] = useState<any[]>([]);
	const [subjects, setSubjects] = useState<any[]>([]);

	// Step 2 fields (Quiz questions)
	const [questions, setQuestions] = useState<QuizQuestion[]>([]);

	// ── Submissions Dialog State ───────────────────────────────────────────────
	const [subsOpen, setSubsOpen] = useState(false);
	const [subsLoading, setSubsLoading] = useState(false);
	const [selectedAssignment, setSelectedAssignment] = useState<Assignment | null>(null);
	const [submissions, setSubmissions] = useState<Submission[]>([]);

	// ── Grade Dialog State ─────────────────────────────────────────────────────
	const [gradeOpen, setGradeOpen] = useState(false);
	const [gradingSubmission, setGradingSubmission] = useState<Submission | null>(null);
	const [gradeScore, setGradeScore] = useState('');
	const [gradeFeedback, setGradeFeedback] = useState('');
	const [grading, setGrading] = useState(false);

	// ── Fetch Assignments ──────────────────────────────────────────────────────

	const fetchAssignments = useCallback(async () => {
		if (!token) return;

		setLoading(true);
		try {
			const res = await fetch('http://localhost:4000/api/assignments', {
				headers: { Authorization: `Bearer ${token}` }
			});

			if (res.ok) {
				const data = await res.json();
				setAssignments(Array.isArray(data) ? data : (data.data ?? data.assignments ?? []));
			} else {
				enqueueSnackbar('Failed to load assignments', { variant: 'error' });
			}
		} catch {
			enqueueSnackbar('Network error loading assignments', { variant: 'error' });
		} finally {
			setLoading(false);
		}
	}, [token, enqueueSnackbar]);

	useEffect(() => {
		fetchAssignments();
	}, [fetchAssignments]);

	useEffect(() => {
		if (!token) return;

		fetch('http://localhost:4000/api/classes', { headers: { Authorization: `Bearer ${token}` } })
			.then((res) => res.json())
			.then((data) => setClasses(data || []))
			.catch((err) => console.error(err));

		fetch('http://localhost:4000/api/subjects', { headers: { Authorization: `Bearer ${token}` } })
			.then((res) => res.json())
			.then((data) => setSubjects(data || []))
			.catch((err) => console.error(err));
	}, [token]);

	// ── Create Assignment Handlers ─────────────────────────────────────────────

	const resetCreateForm = () => {
		setCreateStep(0);
		setNewTitle('');
		setNewDescription('');
		setNewType('QUIZ');
		setNewSubjectId('');
		setNewClassId('');
		setNewDueDate('');
		setNewMaxScore('100');
		setQuestions([]);
	};

	const handleOpenCreate = () => {
		resetCreateForm();
		setCreateOpen(true);
	};

	const handleCloseCreate = () => {
		setCreateOpen(false);
		resetCreateForm();
	};

	const addQuestion = () => {
		setQuestions((prev) => [
			...prev,
			{
				id: generateId(),
				text: '',
				type: 'MCQ',
				options: ['', '', '', ''],
				correctAnswer: 'A',
				points: 10
			}
		]);
	};

	const updateQuestion = (id: string, updates: Partial<QuizQuestion>) => {
		setQuestions((prev) => prev.map((q) => (q.id === id ? { ...q, ...updates } : q)));
	};

	const removeQuestion = (id: string) => {
		setQuestions((prev) => prev.filter((q) => q.id !== id));
	};

	const updateOption = (questionId: string, optionIdx: number, value: string) => {
		setQuestions((prev) =>
			prev.map((q) => {
				if (q.id !== questionId) return q;

				const newOptions = [...q.options];
				newOptions[optionIdx] = value;
				return { ...q, options: newOptions };
			})
		);
	};

	const canProceedStep1 = newTitle.trim() && newDueDate && newClassId;

	const canSubmitCreate = () => {
		if (!canProceedStep1) return false;

		if (newType === 'QUIZ') {
			return questions.length > 0 && questions.every((q) => q.text.trim());
		}

		return true;
	};

	const handleCreateSubmit = async (status: 'DRAFT' | 'PUBLISHED') => {
		if (!token) return;

		setCreating(true);
		try {
			const body: any = {
				title: newTitle.trim(),
				description: newDescription.trim(),
				type: newType,
				subjectId: newSubjectId,
				classId: newClassId,
				status: status,
				dueDate: new Date(newDueDate).toISOString(),
				maxScore: Number(newMaxScore) || 100
			};

			if (newType === 'QUIZ') {
				body.questions = questions.map((q) => ({
					text: q.text,
					type: q.type,
					options: q.type === 'MCQ' ? q.options : [],
					correctAnswer: q.type === 'MCQ' ? q.correctAnswer : '',
					points: q.points
				}));
			}

			const res = await fetch('http://localhost:4000/api/assignments', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${token}`
				},
				body: JSON.stringify(body)
			});

			if (res.ok) {
				enqueueSnackbar('Assignment created successfully!', { variant: 'success' });
				handleCloseCreate();
				fetchAssignments();
			} else {
				const err = await res.json().catch(() => ({}));
				enqueueSnackbar(err.error || err.message || 'Failed to create assignment', {
					variant: 'error'
				});
			}
		} catch {
			enqueueSnackbar('Network error creating assignment', { variant: 'error' });
		} finally {
			setCreating(false);
		}
	};

	// ── View Submissions Handlers ──────────────────────────────────────────────

	const handleViewSubmissions = async (assignment: Assignment) => {
		if (!token) return;

		setSelectedAssignment(assignment);
		setSubsOpen(true);
		setSubsLoading(true);
		try {
			const res = await fetch(`http://localhost:4000/api/assignments/${assignment.id}/submissions`, {
				headers: { Authorization: `Bearer ${token}` }
			});

			if (res.ok) {
				const data = await res.json();
				setSubmissions(Array.isArray(data) ? data : (data.data ?? data.submissions ?? []));
			} else {
				enqueueSnackbar('Failed to load submissions', { variant: 'error' });
			}
		} catch {
			enqueueSnackbar('Network error loading submissions', { variant: 'error' });
		} finally {
			setSubsLoading(false);
		}
	};

	// ── Grade Handlers ─────────────────────────────────────────────────────────

	const handleOpenGrade = (sub: Submission) => {
		setGradingSubmission(sub);
		setGradeScore(sub.score != null ? String(sub.score) : '');
		setGradeFeedback(sub.feedback || '');
		setGradeOpen(true);
	};

	const handleSaveGrade = async () => {
		if (!token || !gradingSubmission) return;

		if (!gradeScore) {
			enqueueSnackbar('Please enter a score', { variant: 'error' });
			return;
		}

		setGrading(true);
		try {
			const res = await fetch(`http://localhost:4000/api/assignments/submissions/${gradingSubmission.id}/grade`, {
				method: 'PATCH',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${token}`
				},
				body: JSON.stringify({
					score: Number(gradeScore),
					feedback: gradeFeedback.trim()
				})
			});

			if (res.ok) {
				enqueueSnackbar('Grade saved successfully!', { variant: 'success' });
				setGradeOpen(false);
				// Refresh submissions list
				setSubmissions((prev) =>
					prev.map((s) =>
						s.id === gradingSubmission.id
							? {
									...s,
									score: Number(gradeScore),
									feedback: gradeFeedback,
									status: 'MANUALLY_GRADED' as const
								}
							: s
					)
				);
			} else {
				const err = await res.json().catch(() => ({}));
				enqueueSnackbar(err.error || err.message || 'Failed to save grade', {
					variant: 'error'
				});
			}
		} catch {
			enqueueSnackbar('Network error saving grade', { variant: 'error' });
		} finally {
			setGrading(false);
		}
	};

	// ── Table Columns ──────────────────────────────────────────────────────────

	const columns = useMemo<MRT_ColumnDef<Assignment>[]>(
		() => [
			{
				accessorKey: 'title',
				header: 'Title',
				size: 220,
				Cell: ({ row }) => (
					<Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
						<Box
							sx={{
								width: 36,
								height: 36,
								borderRadius: '10px',
								display: 'flex',
								alignItems: 'center',
								justifyContent: 'center',
								background:
									row.original.type === 'QUIZ'
										? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
										: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
								flexShrink: 0
							}}
						>
							<FuseSvgIcon
								size={18}
								sx={{ color: '#fff' }}
							>
								{row.original.type === 'QUIZ' ? 'lucide:file-question' : 'lucide:upload'}
							</FuseSvgIcon>
						</Box>
						<Typography
							variant="body2"
							fontWeight={600}
						>
							{row.original.title}
						</Typography>
					</Box>
				)
			},
			{
				accessorKey: 'type',
				header: 'Type',
				size: 130,
				Cell: ({ row }) => (
					<Chip
						label={row.original.type === 'QUIZ' ? 'Quiz' : 'File Upload'}
						variant="filled"
						size="small"
						sx={{
							fontWeight: 600,
							backgroundColor:
								row.original.type === 'QUIZ' ? 'rgba(102,126,234,0.12)' : 'rgba(245,87,108,0.12)',
							color: row.original.type === 'QUIZ' ? '#5c6bc0' : '#e91e63'
						}}
					/>
				)
			},
			{
				id: 'subjectName',
				header: 'Subject',
				size: 150,
				accessorFn: (row) => row.subject?.name || '—'
			},
			{
				accessorKey: 'dueDate',
				header: 'Due Date',
				size: 140,
				Cell: ({ row }) => {
					const due = row.original.dueDate;
					const isPast = due && new Date(due) < new Date();
					return (
						<Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
							<FuseSvgIcon
								size={16}
								sx={{ color: isPast ? 'error.main' : 'text.secondary' }}
							>
								lucide:calendar
							</FuseSvgIcon>
							<Typography
								variant="body2"
								sx={{ color: isPast ? 'error.main' : 'text.primary', fontWeight: isPast ? 600 : 400 }}
							>
								{formatDate(due)}
							</Typography>
						</Box>
					);
				}
			},
			{
				id: 'submissions',
				header: 'Submissions',
				size: 120,
				Cell: ({ row }) => {
					const count = row.original._count?.submissions ?? row.original.submissionsCount ?? 0;
					return (
						<Chip
							label={count}
							size="small"
							variant="outlined"
							icon={<FuseSvgIcon size={14}>lucide:users</FuseSvgIcon>}
							sx={{ fontWeight: 600 }}
						/>
					);
				}
			},
			{
				id: 'actions',
				header: 'Actions',
				size: 160,
				Cell: ({ row }) => (
					<Stack
						direction="row"
						spacing={1}
					>
						<Button
							variant="contained"
							size="small"
							onClick={() => handleViewSubmissions(row.original)}
							startIcon={<FuseSvgIcon size={16}>lucide:eye</FuseSvgIcon>}
							sx={{
								textTransform: 'none',
								borderRadius: '8px',
								boxShadow: 'none',
								fontSize: '0.8rem'
							}}
						>
							Submissions
						</Button>
					</Stack>
				)
			}
		],
		[]
	);

	// ── Create Dialog Steps ────────────────────────────────────────────────────

	const createSteps = newType === 'QUIZ' ? ['Basic Info', 'Questions'] : ['Basic Info'];
	const isLastStep = createStep === createSteps.length - 1;

	const renderStep1 = () => (
		<Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, mt: 1 }}>
			<TextField
				label="Assignment Title"
				value={newTitle}
				onChange={(e) => setNewTitle(e.target.value)}
				fullWidth
				required
				placeholder="e.g. Algebra Quiz — Chapter 5"
			/>

			<TextField
				label="Description"
				value={newDescription}
				onChange={(e) => setNewDescription(e.target.value)}
				fullWidth
				multiline
				rows={3}
				placeholder="Instructions for students…"
			/>

			<Box sx={{ display: 'flex', gap: 2 }}>
				<FormControl
					fullWidth
					required
				>
					<InputLabel>Assignment Type</InputLabel>
					<Select
						value={newType}
						label="Assignment Type"
						onChange={(e) => {
							setNewType(e.target.value as 'QUIZ' | 'FILE_UPLOAD');

							if (e.target.value === 'FILE_UPLOAD') {
								setQuestions([]);
							}
						}}
					>
						<MenuItem value="QUIZ">
							<Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
								<FuseSvgIcon size={18}>lucide:file-question</FuseSvgIcon>
								Quiz
							</Box>
						</MenuItem>
						<MenuItem value="FILE_UPLOAD">
							<Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
								<FuseSvgIcon size={18}>lucide:upload</FuseSvgIcon>
								File Upload
							</Box>
						</MenuItem>
					</Select>
				</FormControl>

				<FormControl
					fullWidth
					required
				>
					<InputLabel>Class</InputLabel>
					<Select
						value={newClassId}
						label="Class"
						onChange={(e) => setNewClassId(e.target.value)}
					>
						{classes.map((c) => (
							<MenuItem
								key={c.id}
								value={c.id}
							>
								{c.name}
							</MenuItem>
						))}
						{classes.length === 0 && (
							<MenuItem
								disabled
								value=""
							>
								No classes found
							</MenuItem>
						)}
					</Select>
				</FormControl>
			</Box>

			<Box sx={{ display: 'flex', gap: 2 }}>
				<FormControl
					fullWidth
					required
				>
					<InputLabel>Subject</InputLabel>
					<Select
						value={newSubjectId}
						label="Subject"
						onChange={(e) => setNewSubjectId(e.target.value)}
					>
						{subjects.map((s) => (
							<MenuItem
								key={s.id}
								value={s.id}
							>
								{s.name} ({s.code})
							</MenuItem>
						))}
						{subjects.length === 0 && (
							<MenuItem
								disabled
								value=""
							>
								No subjects found
							</MenuItem>
						)}
					</Select>
				</FormControl>
				<TextField
					label="Due Date"
					type="datetime-local"
					InputLabelProps={{ shrink: true }}
					value={newDueDate}
					onChange={(e) => setNewDueDate(e.target.value)}
					fullWidth
					required
				/>
			</Box>

			<Box sx={{ display: 'flex', gap: 2 }}>
				<TextField
					label="Max Score"
					type="number"
					value={newMaxScore}
					onChange={(e) => setNewMaxScore(e.target.value)}
					fullWidth
					required
					inputProps={{ min: 1 }}
				/>
			</Box>
		</Box>
	);

	const renderStep2Quiz = () => (
		<Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, mt: 1 }}>
			<Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
				<Typography
					variant="subtitle1"
					fontWeight={700}
				>
					Questions ({questions.length})
				</Typography>
				<Button
					variant="outlined"
					size="small"
					startIcon={<FuseSvgIcon size={16}>lucide:plus</FuseSvgIcon>}
					onClick={addQuestion}
					sx={{ textTransform: 'none', borderRadius: '8px' }}
				>
					Add Question
				</Button>
			</Box>

			{questions.length === 0 && (
				<Paper
					variant="outlined"
					sx={{
						p: 4,
						textAlign: 'center',
						borderStyle: 'dashed',
						borderRadius: 3,
						backgroundColor: 'action.hover'
					}}
				>
					<FuseSvgIcon
						size={40}
						sx={{ color: 'text.disabled', mb: 1 }}
					>
						lucide:help-circle
					</FuseSvgIcon>
					<Typography color="text.secondary">
						No questions yet. Click "Add Question" to start building your quiz.
					</Typography>
				</Paper>
			)}

			<Box sx={{ maxHeight: 400, overflowY: 'auto', pr: 1 }}>
				{questions.map((q, idx) => (
					<Paper
						key={q.id}
						elevation={0}
						sx={{
							p: 2.5,
							mb: 2,
							border: '1px solid',
							borderColor: 'divider',
							borderRadius: 3,
							position: 'relative',
							'&:hover': { borderColor: 'primary.main', boxShadow: '0 0 0 1px rgba(99,102,241,0.2)' }
						}}
					>
						<Box
							sx={{
								display: 'flex',
								justifyContent: 'space-between',
								alignItems: 'center',
								mb: 2
							}}
						>
							<Chip
								label={`Q${idx + 1}`}
								size="small"
								sx={{
									fontWeight: 700,
									background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
									color: '#fff'
								}}
							/>
							<Tooltip title="Remove question">
								<IconButton
									size="small"
									onClick={() => removeQuestion(q.id)}
									color="error"
								>
									<FuseSvgIcon size={18}>lucide:trash-2</FuseSvgIcon>
								</IconButton>
							</Tooltip>
						</Box>

						<TextField
							label="Question Text"
							value={q.text}
							onChange={(e) => updateQuestion(q.id, { text: e.target.value })}
							fullWidth
							required
							sx={{ mb: 2 }}
							placeholder="Enter your question..."
						/>

						<Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
							<FormControl
								size="small"
								sx={{ minWidth: 160 }}
							>
								<InputLabel>Question Type</InputLabel>
								<Select
									value={q.type}
									label="Question Type"
									onChange={(e) =>
										updateQuestion(q.id, { type: e.target.value as 'MCQ' | 'OPEN_ENDED' })
									}
								>
									<MenuItem value="MCQ">Multiple Choice</MenuItem>
									<MenuItem value="OPEN_ENDED">Open Ended</MenuItem>
								</Select>
							</FormControl>

							<TextField
								label="Points"
								type="number"
								size="small"
								value={q.points}
								onChange={(e) => updateQuestion(q.id, { points: Number(e.target.value) || 0 })}
								inputProps={{ min: 1 }}
								sx={{ width: 100 }}
							/>
						</Box>

						{q.type === 'MCQ' && (
							<Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
								{['A', 'B', 'C', 'D'].map((label, optIdx) => (
									<Box
										key={label}
										sx={{
											display: 'flex',
											alignItems: 'center',
											gap: 1,
											p: 1,
											borderRadius: 2,
											backgroundColor:
												q.correctAnswer === label ? 'success.lighter' : 'transparent',
											border: q.correctAnswer === label ? '1px solid' : '1px solid transparent',
											borderColor: q.correctAnswer === label ? 'success.light' : 'transparent'
										}}
									>
										<Chip
											label={label}
											size="small"
											variant={q.correctAnswer === label ? 'filled' : 'outlined'}
											color={q.correctAnswer === label ? 'success' : 'default'}
											sx={{ fontWeight: 700, minWidth: 32 }}
											onClick={() => updateQuestion(q.id, { correctAnswer: label })}
										/>
										<TextField
											value={q.options[optIdx]}
											onChange={(e) => updateOption(q.id, optIdx, e.target.value)}
											fullWidth
											size="small"
											placeholder={`Option ${label}`}
										/>
									</Box>
								))}
								<Typography
									variant="caption"
									color="text.secondary"
									sx={{ mt: 0.5 }}
								>
									Click a letter chip to mark it as the correct answer
								</Typography>
							</Box>
						)}

						{q.type === 'OPEN_ENDED' && (
							<Paper
								variant="outlined"
								sx={{
									p: 2,
									borderRadius: 2,
									backgroundColor: 'grey.50',
									borderStyle: 'dashed'
								}}
							>
								<Typography
									variant="body2"
									color="text.secondary"
								>
									<FuseSvgIcon
										size={14}
										sx={{ mr: 0.5, verticalAlign: 'middle' }}
									>
										lucide:info
									</FuseSvgIcon>
									Students will provide a free-text answer. This will require manual grading.
								</Typography>
							</Paper>
						)}
					</Paper>
				))}
			</Box>
		</Box>
	);

	// ── Submission helpers ─────────────────────────────────────────────────────

	const getStudentName = (sub: Submission) => {
		if (sub.studentName) return sub.studentName;

		if (sub.student?.user) return `${sub.student.user.firstName} ${sub.student.user.lastName}`;

		return 'Unknown Student';
	};

	// ── Render ─────────────────────────────────────────────────────────────────

	return (
		<AuthGuardRedirect auth={['TEACHER']}>
			<FusePageSimple
				content={
					<div className="mx-auto flex w-full max-w-7xl flex-col gap-32 px-24 py-32">
						{/* ── Page Header ────────────────────────────────────── */}
						<Box
							sx={{
								display: 'flex',
								justifyContent: 'space-between',
								alignItems: 'flex-start',
								flexWrap: 'wrap',
								gap: 2
							}}
						>
							<Box>
								<Typography className="text-4xl font-extrabold tracking-tight">Assignments</Typography>
								<Typography
									color="text.secondary"
									sx={{ mt: 0.5 }}
								>
									Create quizzes and file-upload tasks, then review and grade student submissions.
								</Typography>
							</Box>
							<Button
								variant="contained"
								startIcon={<FuseSvgIcon size={18}>lucide:plus</FuseSvgIcon>}
								onClick={handleOpenCreate}
								sx={{
									textTransform: 'none',
									borderRadius: '12px',
									px: 3,
									py: 1.2,
									fontWeight: 600,
									background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
									boxShadow: '0 4px 14px rgba(102,126,234,0.4)',
									'&:hover': {
										background: 'linear-gradient(135deg, #5a6fd6 0%, #6a4296 100%)',
										boxShadow: '0 6px 20px rgba(102,126,234,0.5)'
									}
								}}
							>
								Create Assignment
							</Button>
						</Box>

						{/* ── Assignments Table ──────────────────────────────── */}
						<Paper className="bg-card flex flex-auto flex-col rounded-2xl p-24 shadow">
							<MaterialReactTable
								columns={columns}
								data={assignments}
								enableDensityToggle={false}
								enableFullScreenToggle={false}
								enableColumnActions={false}
								state={{ isLoading: loading }}
								initialState={{ density: 'comfortable' }}
								muiTablePaperProps={{ elevation: 0, sx: { boxShadow: 'none' } }}
								muiTopToolbarProps={{ sx: { backgroundColor: 'transparent' } }}
								renderEmptyRowsFallback={() => (
									<Box sx={{ textAlign: 'center', py: 6 }}>
										<FuseSvgIcon
											size={48}
											sx={{ color: 'text.disabled', mb: 1 }}
										>
											lucide:clipboard-list
										</FuseSvgIcon>
										<Typography color="text.secondary">
											No assignments yet. Create your first one!
										</Typography>
									</Box>
								)}
							/>
						</Paper>

						{/* ─── Create Assignment Dialog ────────────────────────── */}
						<Dialog
							open={createOpen}
							onClose={handleCloseCreate}
							maxWidth="md"
							fullWidth
							PaperProps={{ sx: { borderRadius: 4 } }}
						>
							<DialogTitle
								sx={{
									background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
									color: '#fff',
									display: 'flex',
									alignItems: 'center',
									gap: 1.5,
									py: 2.5
								}}
							>
								<FuseSvgIcon sx={{ color: '#fff' }}>lucide:file-plus-2</FuseSvgIcon>
								Create New Assignment
							</DialogTitle>

							<DialogContent sx={{ pt: '24px !important', pb: 1 }}>
								{createSteps.length > 1 && (
									<Stepper
										activeStep={createStep}
										sx={{ mb: 3 }}
									>
										{createSteps.map((label) => (
											<Step key={label}>
												<StepLabel>{label}</StepLabel>
											</Step>
										))}
									</Stepper>
								)}

								{createStep === 0 && renderStep1()}
								{createStep === 1 && newType === 'QUIZ' && renderStep2Quiz()}
							</DialogContent>

							<Divider />
							<DialogActions sx={{ px: 3, py: 2 }}>
								<Button
									onClick={handleCloseCreate}
									sx={{ textTransform: 'none' }}
								>
									Cancel
								</Button>

								{createStep > 0 && (
									<Button
										onClick={() => setCreateStep((s) => s - 1)}
										sx={{ textTransform: 'none' }}
									>
										Back
									</Button>
								)}

								{!isLastStep && (
									<Button
										variant="contained"
										disabled={!canProceedStep1}
										onClick={() => {
											if (newType === 'QUIZ' && questions.length === 0) {
												addQuestion();
											}

											setCreateStep((s) => s + 1);
										}}
										sx={{ textTransform: 'none', borderRadius: '8px' }}
									>
										Next
									</Button>
								)}

								{isLastStep && (
									<>
										<Button
											variant="outlined"
											disabled={creating || !canSubmitCreate()}
											onClick={() => handleCreateSubmit('DRAFT')}
											sx={{ textTransform: 'none', borderRadius: '8px' }}
										>
											Save as Draft
										</Button>
										<Button
											variant="contained"
											disabled={creating || !canSubmitCreate()}
											onClick={() => handleCreateSubmit('PUBLISHED')}
											startIcon={
												creating ? (
													<CircularProgress
														size={16}
														color="inherit"
													/>
												) : null
											}
											sx={{
												textTransform: 'none',
												borderRadius: '8px',
												background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
											}}
										>
											{creating ? 'Creating…' : 'Publish'}
										</Button>
									</>
								)}
							</DialogActions>
						</Dialog>

						{/* ─── View Submissions Dialog ─────────────────────────── */}
						<Dialog
							open={subsOpen}
							onClose={() => setSubsOpen(false)}
							maxWidth="md"
							fullWidth
							PaperProps={{ sx: { borderRadius: 4 } }}
						>
							<DialogTitle
								sx={{
									display: 'flex',
									alignItems: 'center',
									gap: 1.5,
									borderBottom: '1px solid',
									borderColor: 'divider'
								}}
							>
								<FuseSvgIcon>lucide:inbox</FuseSvgIcon>
								<Box>
									<Typography
										variant="h6"
										fontWeight={700}
									>
										Submissions
									</Typography>
									<Typography
										variant="body2"
										color="text.secondary"
									>
										{selectedAssignment?.title}
									</Typography>
								</Box>
							</DialogTitle>

							<DialogContent sx={{ pt: '20px !important' }}>
								{subsLoading ? (
									<Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
										<CircularProgress />
									</Box>
								) : submissions.length === 0 ? (
									<Box sx={{ textAlign: 'center', py: 6 }}>
										<FuseSvgIcon
											size={48}
											sx={{ color: 'text.disabled', mb: 1 }}
										>
											lucide:inbox
										</FuseSvgIcon>
										<Typography color="text.secondary">No submissions received yet.</Typography>
									</Box>
								) : (
									<Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
										{submissions.map((sub) => (
											<Paper
												key={sub.id}
												elevation={0}
												sx={{
													p: 2.5,
													border: '1px solid',
													borderColor: 'divider',
													borderRadius: 3,
													transition: 'border-color 0.2s',
													'&:hover': { borderColor: 'primary.light' }
												}}
											>
												<Box
													sx={{
														display: 'flex',
														justifyContent: 'space-between',
														alignItems: 'center',
														mb: 1.5
													}}
												>
													<Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
														<Box
															sx={{
																width: 36,
																height: 36,
																borderRadius: '50%',
																background:
																	'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
																display: 'flex',
																alignItems: 'center',
																justifyContent: 'center',
																color: '#fff',
																fontWeight: 700,
																fontSize: '0.85rem'
															}}
														>
															{getStudentName(sub)
																.split(' ')
																.map((n) => n[0])
																.join('')
																.slice(0, 2)
																.toUpperCase()}
														</Box>
														<Box>
															<Typography
																variant="body1"
																fontWeight={600}
															>
																{getStudentName(sub)}
															</Typography>
															<Typography
																variant="caption"
																color="text.secondary"
															>
																Submitted:{' '}
																{formatDate(sub.submittedAt || sub.createdAt)}
															</Typography>
														</Box>
													</Box>

													<Chip
														label={sub.status.replace(/_/g, ' ')}
														size="small"
														color={statusColorMap[sub.status] || 'default'}
														sx={{ fontWeight: 600 }}
													/>
												</Box>

												{sub.score != null && (
													<Box
														sx={{
															display: 'flex',
															alignItems: 'center',
															gap: 2,
															mb: 1.5,
															p: 1.5,
															borderRadius: 2,
															backgroundColor: 'grey.50'
														}}
													>
														<Typography variant="body2">
															<strong>Score:</strong> {sub.score}
															{selectedAssignment?.maxScore
																? `/${selectedAssignment.maxScore}`
																: ''}
														</Typography>
														{sub.feedback && (
															<Typography
																variant="body2"
																color="text.secondary"
															>
																<strong>Feedback:</strong> {sub.feedback}
															</Typography>
														)}
													</Box>
												)}

												{sub.status === 'PENDING' && (
													<Button
														variant="contained"
														size="small"
														onClick={() => handleOpenGrade(sub)}
														startIcon={
															<FuseSvgIcon size={16}>lucide:check-circle</FuseSvgIcon>
														}
														sx={{
															textTransform: 'none',
															borderRadius: '8px',
															mt: 0.5,
															background:
																'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)',
															boxShadow: '0 2px 8px rgba(17,153,142,0.3)'
														}}
													>
														Grade Submission
													</Button>
												)}

												{sub.status !== 'PENDING' && (
													<Button
														variant="outlined"
														size="small"
														onClick={() => handleOpenGrade(sub)}
														startIcon={<FuseSvgIcon size={16}>lucide:edit</FuseSvgIcon>}
														sx={{
															textTransform: 'none',
															borderRadius: '8px',
															mt: 0.5
														}}
													>
														Edit Grade
													</Button>
												)}
											</Paper>
										))}
									</Box>
								)}
							</DialogContent>

							<DialogActions sx={{ px: 3, py: 2, borderTop: '1px solid', borderColor: 'divider' }}>
								<Button
									onClick={() => setSubsOpen(false)}
									sx={{ textTransform: 'none' }}
								>
									Close
								</Button>
							</DialogActions>
						</Dialog>

						{/* ─── Grade Submission Dialog ─────────────────────────── */}
						<Dialog
							open={gradeOpen}
							onClose={() => setGradeOpen(false)}
							maxWidth="xs"
							fullWidth
							PaperProps={{ sx: { borderRadius: 4 } }}
						>
							<DialogTitle
								sx={{
									display: 'flex',
									alignItems: 'center',
									gap: 1.5,
									background: 'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)',
									color: '#fff',
									py: 2.5
								}}
							>
								<FuseSvgIcon sx={{ color: '#fff' }}>lucide:award</FuseSvgIcon>
								Grade Submission
							</DialogTitle>

							<DialogContent sx={{ pt: '24px !important' }}>
								<Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
									<Paper
										variant="outlined"
										sx={{ p: 2, borderRadius: 2, backgroundColor: 'grey.50' }}
									>
										<Typography
											variant="body2"
											color="text.secondary"
										>
											<strong>Student:</strong>{' '}
											{gradingSubmission ? getStudentName(gradingSubmission) : ''}
										</Typography>
										<Typography
											variant="body2"
											color="text.secondary"
											sx={{ mt: 0.5 }}
										>
											<strong>Max Score:</strong> {selectedAssignment?.maxScore ?? '—'}
										</Typography>
									</Paper>

									<TextField
										label="Score"
										type="number"
										value={gradeScore}
										onChange={(e) => setGradeScore(e.target.value)}
										fullWidth
										required
										inputProps={{ min: 0, max: selectedAssignment?.maxScore }}
										placeholder={`Out of ${selectedAssignment?.maxScore ?? 100}`}
									/>

									<TextField
										label="Feedback (optional)"
										value={gradeFeedback}
										onChange={(e) => setGradeFeedback(e.target.value)}
										fullWidth
										multiline
										rows={3}
										placeholder="Great work! Consider reviewing…"
									/>
								</Box>
							</DialogContent>

							<Divider />
							<DialogActions sx={{ px: 3, py: 2 }}>
								<Button
									onClick={() => setGradeOpen(false)}
									sx={{ textTransform: 'none' }}
								>
									Cancel
								</Button>
								<Button
									variant="contained"
									onClick={handleSaveGrade}
									disabled={grading || !gradeScore}
									startIcon={
										grading ? (
											<CircularProgress
												size={16}
												color="inherit"
											/>
										) : (
											<FuseSvgIcon size={16}>lucide:save</FuseSvgIcon>
										)
									}
									sx={{
										textTransform: 'none',
										borderRadius: '8px',
										background: 'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)'
									}}
								>
									{grading ? 'Saving…' : 'Save Grade'}
								</Button>
							</DialogActions>
						</Dialog>
					</div>
				}
			/>
		</AuthGuardRedirect>
	);
}
