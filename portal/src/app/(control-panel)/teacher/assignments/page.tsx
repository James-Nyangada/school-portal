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
import Switch from '@mui/material/Switch';
import Avatar from '@mui/material/Avatar';
import LinearProgress from '@mui/material/LinearProgress';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import FusePageSimple from '@fuse/core/FusePageSimple';
import FuseSvgIcon from '@fuse/core/FuseSvgIcon';
import AuthGuardRedirect from '@auth/AuthGuardRedirect';
import { MaterialReactTable, type MRT_ColumnDef } from 'material-react-table';
import { useSnackbar } from 'notistack';
import { BACKEND_URL } from '@/lib/backend';
import { downloadAssignmentFile } from '@/lib/assignments';
import { StatCard } from '@/components/dashboard/StatCard';

// ─── Types ───────────────────────────────────────────────────────────────────

type Assignment = {
	id: string;
	title: string;
	description?: string;
	type: 'QUIZ' | 'FILE_UPLOAD';
	subject?: { id: string; name: string };
	subjectId?: string;
	classId?: string | null;
	class?: { name: string; level?: number | null } | null;
	dueDate: string;
	maxScore: number;
	isOpen: boolean;
	status: 'PUBLISHED' | 'DRAFT';
	attachmentUrl?: string | null;
	attachmentName?: string | null;
	questions?: {
		text: string;
		type: 'MCQ' | 'OPEN_ENDED';
		options?: string | null;
		correctAnswer?: string | null;
		points: number;
	}[];
	classSize?: number;
	submittedCount?: number;
	createdAt?: string;
};

type Submission = {
	id: string;
	score?: number | null;
	status: 'PENDING' | 'AUTO_GRADED' | 'MANUALLY_GRADED';
	fileUrl?: string | null;
	textContent?: string | null;
	feedback?: string | null;
	submittedAt?: string;
};

type RosterEntry = {
	student: {
		id: string;
		firstName: string | null;
		lastName: string | null;
		admissionNumber: string | null;
		passportPhotoUrl: string | null;
	};
	submission: Submission | null;
	lastRemindedAt: string | null;
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

// Handout formats students can download (must match the server's allow-list)
const ATTACHMENT_ACCEPT = '.pdf,.docx,.txt';
const MAX_ATTACHMENT_MB = 10;

const generateId = () => Math.random().toString(36).substring(2, 10);

const fullName = (s: RosterEntry['student']) =>
	[s.firstName, s.lastName].filter(Boolean).join(' ') || 'Unnamed student';

const initials = (name: string) =>
	name
		.split(' ')
		.map((n) => n[0])
		.join('')
		.slice(0, 2)
		.toUpperCase();

// "in 3 days", "2 days ago", "today"
const relativeDays = (dateStr: string) => {
	const days = Math.round((new Date(dateStr).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / 86400000);

	if (days === 0) return 'Today';

	if (days === 1) return 'Tomorrow';

	if (days === -1) return 'Yesterday';

	return days > 0 ? `In ${days} days` : `${-days} days ago`;
};

const timeAgo = (dateStr: string) => {
	const mins = Math.round((Date.now() - new Date(dateStr).getTime()) / 60000);

	if (mins < 1) return 'just now';

	if (mins < 60) return `${mins}m ago`;

	if (mins < 1440) return `${Math.round(mins / 60)}h ago`;

	return `${Math.round(mins / 1440)}d ago`;
};

// Value for <input type="datetime-local"> in the browser's timezone
const toLocalInput = (iso: string) => {
	const d = new Date(iso);
	return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};

const parseOptions = (raw?: string | null): string[] => {
	try {
		const parsed = JSON.parse(raw || '[]');
		return Array.isArray(parsed) ? parsed.map(String) : [];
	} catch {
		return [];
	}
};

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
	// Set when the dialog edits an existing assignment instead of creating one
	const [editing, setEditing] = useState<Assignment | null>(null);
	const questionsLocked = !!editing && (editing.submittedCount ?? 0) > 0;

	// Step 1 fields
	const [newTitle, setNewTitle] = useState('');
	const [newDescription, setNewDescription] = useState('');
	const [newType, setNewType] = useState<'QUIZ' | 'FILE_UPLOAD'>('QUIZ');
	const [newSubjectId, setNewSubjectId] = useState('');
	const [newClassId, setNewClassId] = useState('');
	const [newDueDate, setNewDueDate] = useState('');
	const [newMaxScore, setNewMaxScore] = useState('100');
	// FILE_UPLOAD handout, uploaded as soon as it's picked
	const [attachment, setAttachment] = useState<{ url: string; name: string } | null>(null);
	const [uploadingAttachment, setUploadingAttachment] = useState(false);

	const [classes, setClasses] = useState<any[]>([]);
	const [subjects, setSubjects] = useState<any[]>([]);

	// Step 2 fields (Quiz questions)
	const [questions, setQuestions] = useState<QuizQuestion[]>([]);

	// ── Roster Dialog State ────────────────────────────────────────────────────
	const [rosterOpen, setRosterOpen] = useState(false);
	const [rosterLoading, setRosterLoading] = useState(false);
	const [selectedAssignment, setSelectedAssignment] = useState<Assignment | null>(null);
	const [roster, setRoster] = useState<RosterEntry[]>([]);
	const [rosterFilter, setRosterFilter] = useState<'all' | 'done' | 'pending'>('all');
	const [remindingId, setRemindingId] = useState<string | null>(null);

	// ── Grade Dialog State ─────────────────────────────────────────────────────
	const [gradeOpen, setGradeOpen] = useState(false);
	const [gradingEntry, setGradingEntry] = useState<RosterEntry | null>(null);
	const gradingSubmission = gradingEntry?.submission ?? null;
	const [gradeScore, setGradeScore] = useState('');
	const [gradeFeedback, setGradeFeedback] = useState('');
	const [grading, setGrading] = useState(false);

	// ── Fetch Assignments ──────────────────────────────────────────────────────

	const fetchAssignments = useCallback(async () => {
		if (!token) return;

		setLoading(true);
		try {
			const res = await fetch(`${BACKEND_URL}/api/assignments`, {
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

		fetch(`${BACKEND_URL}/api/classes`, { headers: { Authorization: `Bearer ${token}` } })
			.then((res) => res.json())
			.then((data) => setClasses(data || []))
			.catch((err) => console.error(err));

		fetch(`${BACKEND_URL}/api/subjects/mine`, { headers: { Authorization: `Bearer ${token}` } })
			.then((res) => res.json())
			.then((data) => setSubjects(Array.isArray(data) ? data : []))
			.catch((err) => console.error(err));
	}, [token]);

	// ── Create Assignment Handlers ─────────────────────────────────────────────

	const resetCreateForm = () => {
		setEditing(null);
		setCreateStep(0);
		setNewTitle('');
		setNewDescription('');
		setNewType('QUIZ');
		// Teachers with a single subject get it prefilled
		setNewSubjectId(subjects.length === 1 ? subjects[0].id : '');
		setNewClassId('');
		setNewDueDate('');
		setNewMaxScore('100');
		setAttachment(null);
		setQuestions([]);
	};

	const handleOpenCreate = () => {
		resetCreateForm();
		setCreateOpen(true);
	};

	const handleOpenEdit = (a: Assignment) => {
		setEditing(a);
		setCreateStep(0);
		setNewTitle(a.title);
		setNewDescription(a.description || '');
		setNewType(a.type);
		setNewSubjectId(a.subjectId || '');
		setNewClassId(a.classId || '');
		setNewDueDate(toLocalInput(a.dueDate));
		setNewMaxScore(String(a.maxScore));
		setAttachment(a.attachmentUrl ? { url: a.attachmentUrl, name: a.attachmentName || 'assignment' } : null);
		setQuestions(
			(a.questions || []).map((q) => {
				const options = parseOptions(q.options);
				return {
					id: generateId(),
					text: q.text,
					type: q.type,
					options: q.type === 'MCQ' ? [0, 1, 2, 3].map((i) => options[i] ?? '') : ['', '', '', ''],
					correctAnswer: q.correctAnswer || 'A',
					points: q.points
				};
			})
		);
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

	const handleAttachmentPick = async (file: File | undefined) => {
		if (!file || !token) return;

		const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();

		if (!ATTACHMENT_ACCEPT.split(',').includes(ext)) {
			enqueueSnackbar('Only PDF, Word (.docx) or text (.txt) files can be attached', { variant: 'error' });
			return;
		}

		if (file.size > MAX_ATTACHMENT_MB * 1024 * 1024) {
			enqueueSnackbar(`File is too large (max ${MAX_ATTACHMENT_MB} MB)`, { variant: 'error' });
			return;
		}

		setUploadingAttachment(true);
		try {
			const formData = new FormData();
			formData.append('file', file);
			const res = await fetch(`${BACKEND_URL}/api/assignments/attachment`, {
				method: 'POST',
				headers: { Authorization: `Bearer ${token}` },
				body: formData
			});
			const data = await res.json().catch(() => ({}));

			if (res.ok) {
				setAttachment({ url: data.url, name: data.name });
			} else {
				enqueueSnackbar(data.error || 'Failed to upload file', { variant: 'error' });
			}
		} catch {
			enqueueSnackbar('Network error uploading file', { variant: 'error' });
		} finally {
			setUploadingAttachment(false);
		}
	};

	const handleDownloadAttachment = async (a: Assignment) => {
		try {
			await downloadAssignmentFile(token, a);
		} catch (err) {
			enqueueSnackbar((err as Error).message, { variant: 'error' });
		}
	};

	const canProceedStep1 = newTitle.trim() && newDueDate && newClassId;

	const canSubmitCreate = () => {
		if (!canProceedStep1) return false;

		if (newType === 'FILE_UPLOAD') return !!attachment && !uploadingAttachment;

		if (newType === 'QUIZ' && !questionsLocked) {
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

			if (newType === 'FILE_UPLOAD') {
				body.attachmentUrl = attachment?.url ?? null;
				body.attachmentName = attachment?.name ?? null;
			}

			if (newType === 'QUIZ' && !questionsLocked) {
				body.questions = questions.map((q) => ({
					text: q.text,
					type: q.type,
					options: q.type === 'MCQ' ? q.options : [],
					correctAnswer: q.type === 'MCQ' ? q.correctAnswer : '',
					points: q.points
				}));
			}

			const res = await fetch(`${BACKEND_URL}/api/assignments${editing ? `/${editing.id}` : ''}`, {
				method: editing ? 'PATCH' : 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${token}`
				},
				body: JSON.stringify(body)
			});

			if (res.ok) {
				enqueueSnackbar(editing ? 'Assignment updated' : 'Assignment created successfully!', {
					variant: 'success'
				});
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

	// ── Open / Closed ──────────────────────────────────────────────────────────

	const handleToggleOpen = async (a: Assignment) => {
		if (!token) return;

		const isOpen = !a.isOpen;
		setAssignments((prev) => prev.map((x) => (x.id === a.id ? { ...x, isOpen } : x)));
		try {
			const res = await fetch(`${BACKEND_URL}/api/assignments/${a.id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
				body: JSON.stringify({ isOpen })
			});

			if (!res.ok) throw new Error();

			enqueueSnackbar(isOpen ? `"${a.title}" is open to students` : `"${a.title}" is closed and locked`, {
				variant: 'success'
			});
		} catch {
			setAssignments((prev) => prev.map((x) => (x.id === a.id ? { ...x, isOpen: a.isOpen } : x)));
			enqueueSnackbar('Could not update assignment status', { variant: 'error' });
		}
	};

	// ── Roster Handlers ────────────────────────────────────────────────────────

	const handleOpenRoster = async (assignment: Assignment) => {
		if (!token) return;

		setSelectedAssignment(assignment);
		setRosterFilter('all');
		setRoster([]);
		setRosterOpen(true);
		setRosterLoading(true);
		try {
			const res = await fetch(`${BACKEND_URL}/api/assignments/${assignment.id}/roster`, {
				headers: { Authorization: `Bearer ${token}` }
			});

			if (res.ok) {
				setRoster(await res.json());
			} else {
				enqueueSnackbar('Failed to load class list', { variant: 'error' });
			}
		} catch {
			enqueueSnackbar('Network error loading class list', { variant: 'error' });
		} finally {
			setRosterLoading(false);
		}
	};

	const handleRemind = async (entry: RosterEntry) => {
		if (!token || !selectedAssignment) return;

		setRemindingId(entry.student.id);
		try {
			const res = await fetch(`${BACKEND_URL}/api/assignments/${selectedAssignment.id}/remind`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
				body: JSON.stringify({ studentId: entry.student.id })
			});

			if (res.ok) {
				const now = new Date().toISOString();
				setRoster((prev) =>
					prev.map((r) => (r.student.id === entry.student.id ? { ...r, lastRemindedAt: now } : r))
				);
				enqueueSnackbar(`Reminder sent to ${fullName(entry.student)}`, { variant: 'success' });
			} else {
				const err = await res.json().catch(() => ({}));
				enqueueSnackbar(err.error || 'Failed to send reminder', { variant: 'error' });
			}
		} catch {
			enqueueSnackbar('Network error sending reminder', { variant: 'error' });
		} finally {
			setRemindingId(null);
		}
	};

	const doneCount = roster.filter((r) => r.submission).length;
	const visibleRoster = roster.filter((r) =>
		rosterFilter === 'all' ? true : rosterFilter === 'done' ? !!r.submission : !r.submission
	);

	// ── Grade Handlers ─────────────────────────────────────────────────────────

	// File assignments are done on paper: the teacher records the hand-in (and marks) per student
	const isHandout = selectedAssignment?.type === 'FILE_UPLOAD';

	const handleOpenGrade = (entry: RosterEntry) => {
		const sub = entry.submission;
		setGradingEntry(entry);
		setGradeScore(sub?.score != null ? String(sub.score) : '');
		setGradeFeedback(sub?.feedback || '');
		setGradeOpen(true);
	};

	const recordHandIn = async (submitted: boolean) => {
		if (!token || !selectedAssignment || !gradingEntry) return;

		const max = selectedAssignment.maxScore;

		if (submitted && gradeScore !== '' && (Number(gradeScore) < 0 || Number(gradeScore) > max)) {
			enqueueSnackbar(`Score must be between 0 and ${max}`, { variant: 'error' });
			return;
		}

		setGrading(true);
		try {
			const res = await fetch(
				`${BACKEND_URL}/api/assignments/${selectedAssignment.id}/roster/${gradingEntry.student.id}`,
				{
					method: 'PUT',
					headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
					body: JSON.stringify({
						submitted,
						score: gradeScore === '' ? null : Number(gradeScore),
						feedback: gradeFeedback.trim()
					})
				}
			);

			if (res.ok) {
				const submission: Submission | null = await res.json();
				setRoster((prev) =>
					prev.map((r) => (r.student.id === gradingEntry.student.id ? { ...r, submission } : r))
				);
				const delta = (submission ? 1 : 0) - (gradingEntry.submission ? 1 : 0);

				if (delta) {
					setAssignments((prev) =>
						prev.map((a) =>
							a.id === selectedAssignment.id
								? { ...a, submittedCount: (a.submittedCount ?? 0) + delta }
								: a
						)
					);
				}

				enqueueSnackbar(
					!submitted
						? `${fullName(gradingEntry.student)} marked as not handed in`
						: submission?.score != null
							? 'Marks saved'
							: `${fullName(gradingEntry.student)} marked as handed in`,
					{ variant: 'success' }
				);
				setGradeOpen(false);
			} else {
				const err = await res.json().catch(() => ({}));
				enqueueSnackbar(err.error || 'Failed to save', { variant: 'error' });
			}
		} catch {
			enqueueSnackbar('Network error saving', { variant: 'error' });
		} finally {
			setGrading(false);
		}
	};

	const handleSaveGrade = async () => {
		if (isHandout) return recordHandIn(true);

		if (!token || !gradingSubmission) return;

		if (!gradeScore) {
			enqueueSnackbar('Please enter a score', { variant: 'error' });
			return;
		}

		setGrading(true);
		try {
			const res = await fetch(`${BACKEND_URL}/api/assignments/submissions/${gradingSubmission.id}/grade`, {
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
				setRoster((prev) =>
					prev.map((r) =>
						r.submission?.id === gradingSubmission.id
							? {
									...r,
									submission: {
										...r.submission,
										score: Number(gradeScore),
										feedback: gradeFeedback,
										status: 'MANUALLY_GRADED' as const
									}
								}
							: r
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
				header: 'Assignment',
				size: 300,
				Cell: ({ row }) => {
					const a = row.original;
					const isQuiz = a.type === 'QUIZ';
					return (
						<Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, minWidth: 0 }}>
							<Box
								sx={{
									width: 44,
									height: 44,
									borderRadius: '12px',
									display: 'flex',
									alignItems: 'center',
									justifyContent: 'center',
									background: isQuiz
										? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
										: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
									flexShrink: 0
								}}
							>
								<FuseSvgIcon
									size={20}
									sx={{ color: '#fff' }}
								>
									{isQuiz ? 'lucide:file-question' : 'lucide:file-down'}
								</FuseSvgIcon>
							</Box>
							<Box sx={{ minWidth: 0 }}>
								<Typography
									fontWeight={700}
									sx={{ fontSize: '0.95rem', lineHeight: 1.3 }}
									noWrap
								>
									{a.title}
								</Typography>
								<Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.25 }}>
									<Typography
										variant="caption"
										color="text.secondary"
									>
										{isQuiz
											? `Quiz · ${a.questions?.length ?? 0} questions`
											: 'File · hand in on paper'}{' '}
										· {a.maxScore} pts
									</Typography>
									{a.status === 'DRAFT' && (
										<Chip
											label="Draft"
											size="small"
											sx={{ height: 18, fontSize: '0.65rem', fontWeight: 700 }}
										/>
									)}
								</Box>
							</Box>
						</Box>
					);
				}
			},
			{
				id: 'className',
				header: 'Grade / Class',
				size: 150,
				accessorFn: (row) => row.class?.name || '—',
				Cell: ({ row }) =>
					row.original.class ? (
						<Chip
							label={row.original.class.name}
							icon={<FuseSvgIcon size={14}>lucide:school</FuseSvgIcon>}
							size="small"
							sx={{
								fontWeight: 600,
								bgcolor: 'rgba(59,130,246,0.1)',
								color: '#2563eb',
								'& .MuiChip-icon': { color: '#2563eb' }
							}}
						/>
					) : (
						<Typography color="text.disabled">—</Typography>
					)
			},
			{
				id: 'subjectName',
				header: 'Subject',
				size: 150,
				accessorFn: (row) => row.subject?.name || '—',
				Cell: ({ cell }) => (
					<Typography
						variant="body2"
						fontWeight={500}
					>
						{cell.getValue<string>()}
					</Typography>
				)
			},
			{
				accessorKey: 'dueDate',
				header: 'Due',
				size: 150,
				Cell: ({ row }) => {
					const due = row.original.dueDate;
					const isPast = new Date(due) < new Date();
					return (
						<Box>
							<Typography
								variant="body2"
								fontWeight={600}
							>
								{formatDate(due)}
							</Typography>
							<Typography
								variant="caption"
								sx={{ color: isPast ? 'error.main' : 'text.secondary', fontWeight: isPast ? 600 : 400 }}
							>
								{isPast ? `Past due · ${relativeDays(due)}` : relativeDays(due)}
							</Typography>
						</Box>
					);
				}
			},
			{
				id: 'completion',
				header: 'Submitted',
				size: 190,
				accessorFn: (row) => row.submittedCount ?? 0,
				Cell: ({ row }) => {
					const done = row.original.submittedCount ?? 0;
					const total = row.original.classSize ?? 0;
					const pct = total > 0 ? Math.round((done / total) * 100) : 0;
					return (
						<Tooltip title="View class list">
							<Box
								role="button"
								onClick={() => handleOpenRoster(row.original)}
								sx={{
									cursor: 'pointer',
									borderRadius: 2,
									px: 1.25,
									py: 0.75,
									mx: -1.25,
									width: '100%',
									'&:hover': { bgcolor: 'action.hover' }
								}}
							>
								<Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.5, mb: 0.5 }}>
									<Typography
										fontWeight={800}
										sx={{ fontSize: '1rem' }}
									>
										{done}
									</Typography>
									<Typography
										variant="body2"
										color="text.secondary"
									>
										/ {total} students
									</Typography>
								</Box>
								<LinearProgress
									variant="determinate"
									value={pct}
									sx={{
										height: 6,
										borderRadius: 3,
										bgcolor: 'action.selected',
										'& .MuiLinearProgress-bar': {
											borderRadius: 3,
											bgcolor: pct === 100 ? 'success.main' : 'primary.main'
										}
									}}
								/>
							</Box>
						</Tooltip>
					);
				}
			},
			{
				id: 'isOpen',
				header: 'Status',
				size: 130,
				accessorFn: (row) => (row.isOpen ? 'Open' : 'Closed'),
				Cell: ({ row }) => {
					const open = row.original.isOpen;
					return (
						<Tooltip
							title={
								open
									? 'Students can open this. Click to lock it.'
									: 'Locked for students. Click to open.'
							}
						>
							<Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
								<Switch
									size="small"
									checked={open}
									color="success"
									onChange={() => handleToggleOpen(row.original)}
								/>
								<Box
									sx={{
										display: 'flex',
										alignItems: 'center',
										gap: 0.5,
										color: open ? 'success.main' : 'text.secondary'
									}}
								>
									<FuseSvgIcon size={14}>{open ? 'lucide:lock-open' : 'lucide:lock'}</FuseSvgIcon>
									<Typography
										variant="body2"
										fontWeight={700}
									>
										{open ? 'Open' : 'Closed'}
									</Typography>
								</Box>
							</Box>
						</Tooltip>
					);
				}
			},
			{
				id: 'actions',
				header: '',
				size: 100,
				enableSorting: false,
				Cell: ({ row }) => (
					<Stack
						direction="row"
						spacing={0.5}
					>
						<Tooltip title="Edit assignment">
							<IconButton onClick={() => handleOpenEdit(row.original)}>
								<FuseSvgIcon size={18}>lucide:pencil</FuseSvgIcon>
							</IconButton>
						</Tooltip>
						<Tooltip title="Students & submissions">
							<IconButton
								color="primary"
								onClick={() => handleOpenRoster(row.original)}
							>
								<FuseSvgIcon size={18}>lucide:users</FuseSvgIcon>
							</IconButton>
						</Tooltip>
					</Stack>
				)
			}
		],
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[token]
	);

	const stats = useMemo(() => {
		const totalDone = assignments.reduce((n, a) => n + (a.submittedCount ?? 0), 0);
		const totalExpected = assignments.reduce((n, a) => n + (a.classSize ?? 0), 0);
		return {
			total: assignments.length,
			open: assignments.filter((a) => a.isOpen).length,
			rate: totalExpected > 0 ? Math.round((totalDone / totalExpected) * 100) : 0,
			dueThisWeek: assignments.filter((a) => {
				const ms = new Date(a.dueDate).getTime() - Date.now();
				return ms > 0 && ms < 7 * 86400000;
			}).length
		};
	}, [assignments]);

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
						disabled={questionsLocked}
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
								<FuseSvgIcon size={18}>lucide:file-down</FuseSvgIcon>
								File (PDF / Word / Text)
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
								No subjects assigned to you — ask an admin
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

			{newType === 'FILE_UPLOAD' && (
				<Box>
					<input
						id="assignment-attachment-input"
						type="file"
						accept={ATTACHMENT_ACCEPT}
						hidden
						onChange={(e) => {
							handleAttachmentPick(e.target.files?.[0]);
							e.target.value = '';
						}}
					/>
					{attachment ? (
						<Paper
							variant="outlined"
							sx={{ p: 2, borderRadius: 3, display: 'flex', alignItems: 'center', gap: 1.5 }}
						>
							<Box
								sx={{
									width: 40,
									height: 40,
									borderRadius: 2,
									display: 'flex',
									alignItems: 'center',
									justifyContent: 'center',
									bgcolor: 'rgba(99,102,241,0.1)',
									color: '#6366f1',
									flexShrink: 0
								}}
							>
								<FuseSvgIcon size={20}>lucide:file-text</FuseSvgIcon>
							</Box>
							<Box sx={{ flex: 1, minWidth: 0 }}>
								<Typography
									fontWeight={600}
									noWrap
								>
									{attachment.name}
								</Typography>
								<Typography
									variant="caption"
									color="text.secondary"
								>
									Students download this, do it on paper and hand it in to you.
								</Typography>
							</Box>
							{editing?.attachmentUrl === attachment.url && (
								<Tooltip title="Download">
									<IconButton onClick={() => handleDownloadAttachment(editing)}>
										<FuseSvgIcon size={18}>lucide:download</FuseSvgIcon>
									</IconButton>
								</Tooltip>
							)}
							<Button
								size="small"
								disabled={uploadingAttachment}
								onClick={() => document.getElementById('assignment-attachment-input')?.click()}
								sx={{ textTransform: 'none' }}
							>
								{uploadingAttachment ? 'Uploading…' : 'Replace'}
							</Button>
						</Paper>
					) : (
						<Paper
							variant="outlined"
							role="button"
							onClick={() =>
								!uploadingAttachment && document.getElementById('assignment-attachment-input')?.click()
							}
							sx={{
								p: 3,
								borderRadius: 3,
								borderStyle: 'dashed',
								textAlign: 'center',
								cursor: uploadingAttachment ? 'default' : 'pointer',
								'&:hover': { bgcolor: 'action.hover' }
							}}
						>
							{uploadingAttachment ? (
								<CircularProgress
									size={32}
									sx={{ mb: 1 }}
								/>
							) : (
								<FuseSvgIcon
									size={36}
									sx={{ color: 'text.disabled', mb: 1 }}
								>
									lucide:cloud-upload
								</FuseSvgIcon>
							)}
							<Typography fontWeight={600}>
								{uploadingAttachment ? 'Uploading…' : 'Attach the assignment file *'}
							</Typography>
							<Typography
								variant="caption"
								color="text.secondary"
							>
								PDF, Word (.docx) or text (.txt), up to {MAX_ATTACHMENT_MB} MB
							</Typography>
						</Paper>
					)}
				</Box>
			)}
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
						lucide:circle-help
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

	// ── Render ─────────────────────────────────────────────────────────────────

	return (
		<AuthGuardRedirect auth={['TEACHER']}>
			<FusePageSimple
				content={
					<div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8">
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
									Create quizzes or attach a file for students to download, then record hand-ins and
									grade.
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

						{/* ── Summary ────────────────────────────────────────── */}
						<div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
							<StatCard
								icon="lucide:clipboard-list"
								iconColor="text-indigo-600"
								iconBg="bg-indigo-50"
								label="Assignments"
								value={stats.total}
								caption="Created by you"
							/>
							<StatCard
								icon="lucide:lock-open"
								iconColor="text-emerald-600"
								iconBg="bg-emerald-50"
								label="Open"
								value={stats.open}
								caption={`${stats.total - stats.open} closed`}
							/>
							<StatCard
								icon="lucide:check-check"
								iconColor="text-blue-600"
								iconBg="bg-blue-50"
								label="Completion"
								value={`${stats.rate}%`}
								caption="Of students have submitted"
							/>
							<StatCard
								icon="lucide:calendar-clock"
								iconColor="text-amber-600"
								iconBg="bg-amber-50"
								label="Due this week"
								value={stats.dueThisWeek}
								caption="Next 7 days"
							/>
						</div>

						{/* ── Assignments Table ──────────────────────────────── */}
						<Paper className="flex flex-auto flex-col overflow-hidden rounded-2xl border border-gray-200 shadow-sm">
							<MaterialReactTable
								columns={columns}
								data={assignments}
								enableDensityToggle={false}
								enableFullScreenToggle={false}
								enableColumnActions={false}
								enableHiding={false}
								layoutMode="grid"
								state={{ isLoading: loading }}
								initialState={{ density: 'comfortable', pagination: { pageIndex: 0, pageSize: 10 } }}
								muiTablePaperProps={{ elevation: 0, sx: { boxShadow: 'none', borderRadius: 0 } }}
								muiTopToolbarProps={{ sx: { backgroundColor: 'transparent', px: 1.5, pt: 1.5 } }}
								muiBottomToolbarProps={{ sx: { boxShadow: 'none' } }}
								muiTableHeadCellProps={{
									sx: {
										bgcolor: 'action.hover',
										color: 'text.secondary',
										fontSize: '0.72rem',
										fontWeight: 700,
										textTransform: 'uppercase',
										letterSpacing: '0.04em',
										py: 1.5
									}
								}}
								muiTableBodyCellProps={{ sx: { py: 2, display: 'flex', alignItems: 'center' } }}
								muiTableBodyRowProps={{ hover: true }}
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
								<FuseSvgIcon sx={{ color: '#fff' }}>
									{editing ? 'lucide:pencil' : 'lucide:file-plus-2'}
								</FuseSvgIcon>
								{editing ? 'Edit Assignment' : 'Create New Assignment'}
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
								{createStep === 1 && newType === 'QUIZ' && questionsLocked && (
									<Paper
										variant="outlined"
										sx={{
											p: 3,
											mt: 1,
											borderRadius: 3,
											textAlign: 'center',
											borderStyle: 'dashed'
										}}
									>
										<FuseSvgIcon
											size={32}
											sx={{ color: 'text.disabled', mb: 1 }}
										>
											lucide:lock
										</FuseSvgIcon>
										<Typography color="text.secondary">
											{editing?.submittedCount} student(s) have already submitted, so the{' '}
											{questions.length} questions can no longer be changed. Other details will
											still be saved.
										</Typography>
									</Paper>
								)}
								{createStep === 1 && newType === 'QUIZ' && !questionsLocked && renderStep2Quiz()}
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
										{!(editing && editing.status === 'PUBLISHED') && (
											<Button
												variant="outlined"
												disabled={creating || !canSubmitCreate()}
												onClick={() => handleCreateSubmit('DRAFT')}
												sx={{ textTransform: 'none', borderRadius: '8px' }}
											>
												Save as Draft
											</Button>
										)}
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
											{creating
												? 'Saving…'
												: editing
													? editing.status === 'PUBLISHED'
														? 'Save Changes'
														: 'Save & Publish'
													: 'Publish'}
										</Button>
									</>
								)}
							</DialogActions>
						</Dialog>

						{/* ─── Class Roster Dialog ─────────────────────────────── */}
						<Dialog
							open={rosterOpen}
							onClose={() => setRosterOpen(false)}
							maxWidth="sm"
							fullWidth
							PaperProps={{ sx: { borderRadius: 4, height: { sm: '85vh' } } }}
						>
							<Box
								sx={{
									background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
									color: '#fff',
									px: 3,
									pt: 2.5,
									pb: 2
								}}
							>
								<Box
									sx={{
										display: 'flex',
										justifyContent: 'space-between',
										alignItems: 'flex-start',
										gap: 2
									}}
								>
									<Box sx={{ minWidth: 0 }}>
										<Typography
											variant="h6"
											fontWeight={800}
											noWrap
										>
											{selectedAssignment?.title}
										</Typography>
										<Typography sx={{ opacity: 0.85, fontSize: '0.85rem' }}>
											{[selectedAssignment?.class?.name, selectedAssignment?.subject?.name]
												.filter(Boolean)
												.join(' · ')}
											{selectedAssignment && ` · Due ${formatDate(selectedAssignment.dueDate)}`}
										</Typography>
									</Box>
									<Box sx={{ display: 'flex', mt: -0.5, mr: -1 }}>
										{selectedAssignment?.attachmentUrl && (
											<Tooltip title={`Download ${selectedAssignment.attachmentName || 'file'}`}>
												<IconButton
													onClick={() => handleDownloadAttachment(selectedAssignment)}
													sx={{ color: '#fff' }}
												>
													<FuseSvgIcon>lucide:download</FuseSvgIcon>
												</IconButton>
											</Tooltip>
										)}
										<IconButton
											onClick={() => setRosterOpen(false)}
											sx={{ color: '#fff' }}
										>
											<FuseSvgIcon>lucide:x</FuseSvgIcon>
										</IconButton>
									</Box>
								</Box>

								{!rosterLoading && roster.length > 0 && (
									<Box sx={{ mt: 2 }}>
										<Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.75 }}>
											<Typography
												fontWeight={700}
												sx={{ fontSize: '0.9rem' }}
											>
												{doneCount} of {roster.length} done
											</Typography>
											<Typography sx={{ fontSize: '0.9rem', opacity: 0.85 }}>
												{Math.round((doneCount / roster.length) * 100)}%
											</Typography>
										</Box>
										<LinearProgress
											variant="determinate"
											value={(doneCount / roster.length) * 100}
											sx={{
												height: 8,
												borderRadius: 4,
												bgcolor: 'rgba(255,255,255,0.25)',
												'& .MuiLinearProgress-bar': { borderRadius: 4, bgcolor: '#fff' }
											}}
										/>
									</Box>
								)}
							</Box>

							{!rosterLoading && roster.length > 0 && (
								<Box sx={{ px: 3, py: 1.5, borderBottom: '1px solid', borderColor: 'divider' }}>
									<ToggleButtonGroup
										exclusive
										size="small"
										value={rosterFilter}
										onChange={(_, v) => v && setRosterFilter(v)}
										sx={{
											'& .MuiToggleButton-root': {
												textTransform: 'none',
												px: 1.75,
												fontWeight: 600
											}
										}}
									>
										<ToggleButton value="all">All ({roster.length})</ToggleButton>
										<ToggleButton value="done">Done ({doneCount})</ToggleButton>
										<ToggleButton value="pending">
											Not done ({roster.length - doneCount})
										</ToggleButton>
									</ToggleButtonGroup>
								</Box>
							)}

							<DialogContent sx={{ p: 0 }}>
								{rosterLoading ? (
									<Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
										<CircularProgress />
									</Box>
								) : roster.length === 0 ? (
									<Box sx={{ textAlign: 'center', py: 8, px: 3 }}>
										<FuseSvgIcon
											size={48}
											sx={{ color: 'text.disabled', mb: 1 }}
										>
											lucide:users
										</FuseSvgIcon>
										<Typography color="text.secondary">
											{selectedAssignment?.classId
												? 'No students are enrolled in this class yet.'
												: 'This assignment is not linked to a class.'}
										</Typography>
									</Box>
								) : visibleRoster.length === 0 ? (
									<Box sx={{ textAlign: 'center', py: 8 }}>
										<Typography color="text.secondary">
											{rosterFilter === 'done'
												? 'Nobody has submitted yet.'
												: 'Everyone has submitted. 🎉'}
										</Typography>
									</Box>
								) : (
									visibleRoster.map((entry) => {
										const name = fullName(entry.student);
										const sub = entry.submission;
										return (
											<Box
												key={entry.student.id}
												sx={{
													display: 'flex',
													alignItems: 'center',
													gap: 1.5,
													px: 3,
													py: 1.5,
													borderBottom: '1px solid',
													borderColor: 'divider',
													'&:hover': { bgcolor: 'action.hover' }
												}}
											>
												<Avatar
													src={entry.student.passportPhotoUrl || undefined}
													sx={{
														width: 40,
														height: 40,
														fontSize: '0.85rem',
														fontWeight: 700,
														bgcolor: sub ? 'success.light' : 'grey.300',
														color: sub ? 'success.dark' : 'text.secondary'
													}}
												>
													{initials(name)}
												</Avatar>

												<Box sx={{ flex: 1, minWidth: 0 }}>
													<Typography
														fontWeight={600}
														noWrap
													>
														{name}
													</Typography>
													<Typography
														variant="caption"
														color="text.secondary"
														noWrap
														component="div"
													>
														{entry.student.admissionNumber || 'No adm. no.'}
														{sub &&
															` · ${isHandout ? 'Handed in' : 'Submitted'} ${formatDate(sub.submittedAt)}`}
														{!sub &&
															entry.lastRemindedAt &&
															` · Reminded ${timeAgo(entry.lastRemindedAt)}`}
													</Typography>
												</Box>

												{sub ? (
													<>
														{sub.score != null && (
															<Typography
																fontWeight={700}
																sx={{ fontSize: '0.9rem', whiteSpace: 'nowrap' }}
															>
																{sub.score}
																<Typography
																	component="span"
																	color="text.secondary"
																	sx={{ fontSize: '0.8rem' }}
																>
																	/{selectedAssignment?.maxScore}
																</Typography>
															</Typography>
														)}
														<Chip
															label={isHandout ? 'Handed in' : 'Done'}
															size="small"
															color="success"
															icon={<FuseSvgIcon size={14}>lucide:check</FuseSvgIcon>}
															sx={{ fontWeight: 700 }}
														/>
														<Tooltip
															title={
																sub.status === 'PENDING'
																	? isHandout
																		? 'Award marks'
																		: 'Grade submission'
																	: 'Edit grade'
															}
														>
															<IconButton
																size="small"
																color={sub.status === 'PENDING' ? 'warning' : 'default'}
																onClick={() => handleOpenGrade(entry)}
															>
																<FuseSvgIcon size={18}>
																	{sub.status === 'PENDING'
																		? 'lucide:clipboard-pen'
																		: 'lucide:pencil'}
																</FuseSvgIcon>
															</IconButton>
														</Tooltip>
													</>
												) : (
													<>
														<Chip
															label={isHandout ? 'Not handed in' : 'Not done'}
															size="small"
															variant="outlined"
															sx={{ fontWeight: 700, color: 'text.secondary' }}
														/>
														{isHandout && (
															<Tooltip title="Mark as handed in and award marks">
																<IconButton
																	size="small"
																	color="success"
																	onClick={() => handleOpenGrade(entry)}
																>
																	<FuseSvgIcon size={18}>
																		lucide:clipboard-check
																	</FuseSvgIcon>
																</IconButton>
															</Tooltip>
														)}
														<Tooltip
															title={
																entry.lastRemindedAt
																	? 'Send another reminder'
																	: 'Remind student'
															}
														>
															<span>
																<IconButton
																	size="small"
																	onClick={() => handleRemind(entry)}
																	disabled={remindingId === entry.student.id}
																	sx={{
																		color: entry.lastRemindedAt
																			? 'warning.main'
																			: 'text.secondary',
																		'&:hover': {
																			color: 'warning.main',
																			bgcolor: 'rgba(245,158,11,0.1)'
																		}
																	}}
																>
																	{remindingId === entry.student.id ? (
																		<CircularProgress size={18} />
																	) : (
																		<FuseSvgIcon size={18}>
																			{entry.lastRemindedAt
																				? 'lucide:bell-ring'
																				: 'lucide:bell'}
																		</FuseSvgIcon>
																	)}
																</IconButton>
															</span>
														</Tooltip>
													</>
												)}
											</Box>
										);
									})
								)}
							</DialogContent>
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
								{isHandout ? 'Record Hand-in' : 'Grade Submission'}
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
											{gradingEntry ? fullName(gradingEntry.student) : ''}
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
										required={!isHandout}
										inputProps={{ min: 0, max: selectedAssignment?.maxScore }}
										placeholder={`Out of ${selectedAssignment?.maxScore ?? 100}`}
										helperText={
											isHandout
												? 'Leave blank to mark as handed in and add marks later'
												: undefined
										}
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
								{isHandout && gradingSubmission && (
									<Button
										color="error"
										disabled={grading}
										onClick={() => recordHandIn(false)}
										sx={{ textTransform: 'none', mr: 'auto' }}
									>
										Not handed in
									</Button>
								)}
								<Button
									onClick={() => setGradeOpen(false)}
									sx={{ textTransform: 'none' }}
								>
									Cancel
								</Button>
								<Button
									variant="contained"
									onClick={handleSaveGrade}
									disabled={grading || (!isHandout && !gradeScore)}
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
									{grading
										? 'Saving…'
										: isHandout && !gradingSubmission
											? gradeScore
												? 'Mark Handed In & Save'
												: 'Mark Handed In'
											: 'Save Grade'}
								</Button>
							</DialogActions>
						</Dialog>
					</div>
				}
			/>
		</AuthGuardRedirect>
	);
}
