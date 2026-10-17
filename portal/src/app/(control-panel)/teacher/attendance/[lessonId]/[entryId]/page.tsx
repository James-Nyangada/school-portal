'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { format, parseISO } from 'date-fns';
import { useSnackbar } from 'notistack';
import {
	Alert,
	Avatar,
	Button,
	CircularProgress,
	InputAdornment,
	Paper,
	TextField,
	ToggleButton,
	ToggleButtonGroup,
	Typography
} from '@mui/material';
import FusePageSimple from '@fuse/core/FusePageSimple';
import FuseSvgIcon from '@fuse/core/FuseSvgIcon';
import AuthGuardRedirect from '@auth/AuthGuardRedirect';
import {
	classNames,
	errorMessage,
	useAttendanceApi,
	type AttendanceStatus,
	type RegisterResponse
} from '@/components/attendance/api';

const STATUSES: { value: AttendanceStatus; label: string; color: 'success' | 'warning' | 'error' }[] = [
	{ value: 'PRESENT', label: 'Present', color: 'success' },
	{ value: 'LATE', label: 'Late', color: 'warning' },
	{ value: 'ABSENT', label: 'Absent', color: 'error' }
];

const initials = (name: string) =>
	name
		.split(/\s+/)
		.slice(0, 2)
		.map((w) => w.charAt(0))
		.join('')
		.toUpperCase();

function Register() {
	const api = useAttendanceApi();
	const router = useRouter();
	const { enqueueSnackbar } = useSnackbar();
	const { lessonId = '', entryId = '' } = useParams<{ lessonId: string; entryId: string }>() ?? {};
	const date = useSearchParams()?.get('date') ?? '';
	const [data, setData] = useState<RegisterResponse | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [marks, setMarks] = useState<Record<string, AttendanceStatus | null>>({});
	const [search, setSearch] = useState('');
	const [saving, setSaving] = useState(false);

	useEffect(() => {
		if (!api.ready || !lessonId || !entryId) return;

		if (!date) {
			setError('Open this register from a lesson’s period list.');
			return;
		}

		api.get<RegisterResponse>(`/register?lessonId=${lessonId}&entryId=${entryId}&date=${date}`)
			.then((d) => {
				setData(d);
				setMarks(Object.fromEntries(d.students.map((s) => [s.id, s.status])));
			})
			.catch((e) => setError(errorMessage(e)));
	}, [api, lessonId, entryId, date]);

	const counts = useMemo(() => {
		const values = Object.values(marks);

		return {
			PRESENT: values.filter((v) => v === 'PRESENT').length,
			LATE: values.filter((v) => v === 'LATE').length,
			ABSENT: values.filter((v) => v === 'ABSENT').length,
			unmarked: values.filter((v) => !v).length
		};
	}, [marks]);

	const backHref = `/teacher/attendance/${lessonId}?week=${date}`;

	if (error) {
		return (
			<>
				<Alert severity="error">{error}</Alert>
				<Link
					href={backHref}
					className="text-sm font-semibold text-blue-600 hover:underline"
				>
					Back to periods
				</Link>
			</>
		);
	}

	if (!data) {
		return (
			<div className="flex justify-center py-16">
				<CircularProgress />
			</div>
		);
	}

	const { lesson, session } = data;
	const dirty = data.students.some((s) => s.status !== marks[s.id]);
	const alreadyTaken = Boolean(data.markedAt);
	const multiClass = lesson.classes.length > 1;
	const q = search.trim().toLowerCase();
	const visible = q
		? data.students.filter(
				(s) => s.name.toLowerCase().includes(q) || (s.admissionNumber ?? '').toLowerCase().includes(q)
			)
		: data.students;

	const markAll = (status: AttendanceStatus) =>
		setMarks(Object.fromEntries(data.students.map((s) => [s.id, status])));

	const save = async () => {
		setSaving(true);
		try {
			const res = await api.put<{ flags: string[] }>('/register', {
				lessonId,
				entryId,
				date,
				records: data.students.map((s) => ({ studentId: s.id, status: marks[s.id] }))
			});
			enqueueSnackbar(
				`Register saved: ${counts.PRESENT} present, ${counts.LATE} late, ${counts.ABSENT} absent.`,
				{ variant: 'success' }
			);

			if (res.flags.length > 0) {
				const names = data.students.filter((s) => res.flags.includes(s.id)).map((s) => s.name);
				enqueueSnackbar(
					`${names.join(', ')} ${names.length === 1 ? 'has' : 'have'} now missed 3 lessons in a row.`,
					{
						variant: 'warning',
						autoHideDuration: 8000
					}
				);
			}

			router.push(backHref);
		} catch (e) {
			enqueueSnackbar(errorMessage(e), { variant: 'error' });
			setSaving(false);
		}
	};

	return (
		<>
			<Link
				href={backHref}
				className="flex items-center gap-1 text-sm font-semibold text-blue-600 hover:underline"
			>
				<FuseSvgIcon size={16}>lucide:arrow-left</FuseSvgIcon>
				{lesson.subjectName} periods
			</Link>
			<div className="flex flex-col gap-1">
				<div className="flex items-center gap-3">
					<span
						className="h-8 w-1.5 shrink-0 rounded-full"
						style={{ backgroundColor: lesson.color }}
					/>
					<Typography className="text-3xl font-extrabold tracking-tight sm:text-4xl">
						{lesson.subjectName} · {classNames(lesson)}
					</Typography>
				</div>
				<Typography color="text.secondary">
					{format(parseISO(session.date), 'EEEE d MMMM yyyy')} · {session.periodName} ({session.startTime} –{' '}
					{session.endTime}){session.room ? ` · ${session.room}` : ''}
				</Typography>
				{alreadyTaken && (
					<Typography
						variant="body2"
						className="mt-1 flex items-center gap-1 text-green-700 dark:text-green-400"
					>
						<FuseSvgIcon size={14}>lucide:circle-check</FuseSvgIcon>
						Register taken {format(new Date(data.markedAt!), "d MMM 'at' HH:mm")}
						{data.markedBy ? ` by ${data.markedBy}` : ''}. Changes you save will update it.
					</Typography>
				)}
			</div>

			<Paper
				variant="outlined"
				className="flex flex-col overflow-hidden rounded-2xl"
			>
				<div className="flex flex-col gap-3 border-b px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
					<div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
						<span className="font-semibold text-green-700 dark:text-green-400">
							{counts.PRESENT} present
						</span>
						<span className="font-semibold text-amber-600">{counts.LATE} late</span>
						<span className="font-semibold text-red-600">{counts.ABSENT} absent</span>
						{counts.unmarked > 0 && <span className="text-gray-500">{counts.unmarked} not marked</span>}
					</div>
					<div className="flex flex-wrap items-center gap-2">
						<TextField
							size="small"
							placeholder="Find a student"
							value={search}
							onChange={(e) => setSearch(e.target.value)}
							className="w-full sm:w-52"
							slotProps={{
								input: {
									startAdornment: (
										<InputAdornment position="start">
											<FuseSvgIcon size={16}>lucide:search</FuseSvgIcon>
										</InputAdornment>
									)
								}
							}}
						/>
						<Button
							variant="outlined"
							size="small"
							onClick={() => markAll('PRESENT')}
							disabled={data.students.length === 0}
						>
							Mark all present
						</Button>
					</div>
				</div>

				{data.students.length === 0 ? (
					<Typography
						color="text.secondary"
						className="px-5 py-10 text-center"
					>
						No students are enrolled in {classNames(lesson)} yet.
					</Typography>
				) : visible.length === 0 ? (
					<Typography
						color="text.secondary"
						className="px-5 py-10 text-center"
					>
						No student matches “{search}”.
					</Typography>
				) : (
					<ul className="divide-y">
						{visible.map((s, i) => (
							<li
								key={s.id}
								className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-4 sm:px-5"
							>
								<div className="flex min-w-0 flex-1 items-center gap-3">
									<span className="w-6 shrink-0 text-right text-xs text-gray-400">{i + 1}</span>
									<Avatar
										src={s.photo ?? undefined}
										sx={{ width: 36, height: 36, fontSize: 14 }}
									>
										{initials(s.name)}
									</Avatar>
									<div className="min-w-0">
										<div className="truncate font-semibold">{s.name}</div>
										<div className="truncate text-xs text-gray-500">
											{[
												s.admissionNumber && `Adm ${s.admissionNumber}`,
												multiClass && s.className
											]
												.filter(Boolean)
												.join(' · ') || ' '}
										</div>
									</div>
								</div>
								<ToggleButtonGroup
									exclusive
									size="small"
									value={marks[s.id] ?? null}
									onChange={(_e, v: AttendanceStatus | null) =>
										v && setMarks((m) => ({ ...m, [s.id]: v }))
									}
									aria-label={`Attendance for ${s.name}`}
									className="self-end sm:self-auto"
								>
									{STATUSES.map((st) => (
										<ToggleButton
											key={st.value}
											value={st.value}
											color={st.color}
											className="px-3"
										>
											{st.label}
										</ToggleButton>
									))}
								</ToggleButtonGroup>
							</li>
						))}
					</ul>
				)}
			</Paper>

			{data.students.length > 0 && (
				<Paper
					variant="outlined"
					className="sticky bottom-4 z-10 flex flex-col gap-3 rounded-2xl px-4 py-3 shadow-lg sm:flex-row sm:items-center sm:justify-between sm:px-5"
				>
					<Typography
						variant="body2"
						color="text.secondary"
					>
						{counts.unmarked > 0
							? `Mark all ${data.students.length} students to save. ${counts.unmarked} left.`
							: alreadyTaken && !dirty
								? 'No changes since the register was taken.'
								: 'Ready to save.'}
					</Typography>
					<div className="flex gap-2">
						<Button
							component={Link}
							href={backHref}
							disabled={saving}
						>
							Cancel
						</Button>
						<Button
							variant="contained"
							color="secondary"
							onClick={save}
							disabled={saving || counts.unmarked > 0 || (alreadyTaken && !dirty)}
							startIcon={
								saving ? (
									<CircularProgress size={16} />
								) : (
									<FuseSvgIcon size={16}>lucide:save</FuseSvgIcon>
								)
							}
						>
							{alreadyTaken ? 'Update register' : 'Save register'}
						</Button>
					</div>
				</Paper>
			)}
		</>
	);
}

export default function RegisterPage() {
	return (
		<AuthGuardRedirect auth={['TEACHER']}>
			<FusePageSimple
				content={
					<div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8">
						<Suspense
							fallback={
								<div className="flex justify-center py-16">
									<CircularProgress />
								</div>
							}
						>
							<Register />
						</Suspense>
					</div>
				}
			/>
		</AuthGuardRedirect>
	);
}
