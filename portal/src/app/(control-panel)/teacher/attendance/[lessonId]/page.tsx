'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { format, parseISO } from 'date-fns';
import { Alert, Button, Chip, CircularProgress, IconButton, Paper, Tooltip, Typography } from '@mui/material';
import FusePageSimple from '@fuse/core/FusePageSimple';
import FuseSvgIcon from '@fuse/core/FuseSvgIcon';
import AuthGuardRedirect from '@auth/AuthGuardRedirect';
import {
	classNames,
	errorMessage,
	registerHref,
	useAttendanceApi,
	type LessonWeekResponse
} from '@/components/attendance/api';

type WeekSession = LessonWeekResponse['sessions'][number];

function SessionStatus({ s, isToday }: { s: WeekSession; isToday: boolean }) {
	if (s.summary) {
		return (
			<div className="flex flex-wrap items-center justify-end gap-1">
				<Chip
					size="small"
					color="success"
					label={`${s.summary.present} present`}
				/>
				{s.summary.late > 0 && (
					<Chip
						size="small"
						color="warning"
						label={`${s.summary.late} late`}
					/>
				)}
				{s.summary.absent > 0 && (
					<Chip
						size="small"
						color="error"
						label={`${s.summary.absent} absent`}
					/>
				)}
			</div>
		);
	}

	if (s.upcoming) {
		return (
			<Chip
				size="small"
				variant="outlined"
				label="Upcoming"
			/>
		);
	}

	return (
		<Chip
			size="small"
			color="warning"
			variant="outlined"
			label={isToday ? 'Take register' : 'Not taken'}
		/>
	);
}

function LessonPeriods() {
	const api = useAttendanceApi();
	const router = useRouter();
	const lessonId = useParams<{ lessonId: string }>()?.lessonId ?? '';
	const week = useSearchParams()?.get('week') ?? '';
	const [data, setData] = useState<LessonWeekResponse | null>(null);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		if (!api.ready || !lessonId) return;

		setError(null);
		api.get<LessonWeekResponse>(`/lessons/${lessonId}${week ? `?week=${week}` : ''}`)
			.then(setData)
			.catch((e) => setError(errorMessage(e)));
	}, [api, lessonId, week]);

	const goToWeek = (w: string) => router.replace(`/teacher/attendance/${lessonId}?week=${w}`);

	if (error) return <Alert severity="error">{error}</Alert>;

	if (!data) {
		return (
			<div className="flex justify-center py-16">
				<CircularProgress />
			</div>
		);
	}

	const { lesson, week: wk } = data;
	const start = parseISO(wk.start);
	const end = parseISO(wk.end);
	const range =
		start.getMonth() === end.getMonth()
			? `${format(start, 'd')} – ${format(end, 'd MMM yyyy')}`
			: `${format(start, 'd MMM')} – ${format(end, 'd MMM yyyy')}`;
	const taken = data.sessions.filter((s) => s.summary).length;
	const due = data.sessions.filter((s) => !s.upcoming).length;

	return (
		<>
			<div className="flex flex-col gap-1">
				<div className="flex items-center gap-3">
					<span
						className="h-8 w-1.5 shrink-0 rounded-full"
						style={{ backgroundColor: lesson.color }}
					/>
					<Typography className="text-3xl font-extrabold tracking-tight sm:text-4xl">
						{lesson.subjectName}
					</Typography>
				</div>
				<Typography color="text.secondary">
					{classNames(lesson)} · {lesson.studentCount} {lesson.studentCount === 1 ? 'student' : 'students'} ·{' '}
					{data.sessions.length} {data.sessions.length === 1 ? 'period' : 'periods'} a week
				</Typography>
			</div>

			<Paper
				variant="outlined"
				className="flex flex-col overflow-hidden rounded-2xl"
			>
				<div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3 sm:px-5">
					<div className="flex items-center gap-1">
						<Tooltip title="Previous week">
							<IconButton
								size="small"
								onClick={() => goToWeek(wk.prev)}
							>
								<FuseSvgIcon size={18}>lucide:chevron-left</FuseSvgIcon>
							</IconButton>
						</Tooltip>
						<Typography className="min-w-36 text-center font-semibold">{range}</Typography>
						<Tooltip title="Next week">
							<IconButton
								size="small"
								onClick={() => goToWeek(wk.next)}
							>
								<FuseSvgIcon size={18}>lucide:chevron-right</FuseSvgIcon>
							</IconButton>
						</Tooltip>
						{!wk.isCurrent && (
							<Button
								size="small"
								onClick={() => goToWeek(data.today)}
							>
								This week
							</Button>
						)}
					</div>
					<Typography
						variant="body2"
						color="text.secondary"
					>
						{due === 0 ? 'No registers due yet' : `${taken} of ${due} registers taken`}
					</Typography>
				</div>

				{data.sessions.length === 0 ? (
					<Typography
						color="text.secondary"
						className="px-5 py-10 text-center"
					>
						This lesson has no periods on the published timetable.
					</Typography>
				) : (
					<ul className="divide-y">
						{data.sessions.map((s) => {
							const isToday = s.date === data.today;
							const row = (
								<div
									className={`flex items-center gap-4 px-4 py-3 sm:px-5 ${s.upcoming ? 'opacity-60' : 'hover:bg-black/[0.03] dark:hover:bg-white/[0.04]'}`}
								>
									<div
										className={`flex w-14 shrink-0 flex-col items-center rounded-lg py-1 ${isToday ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-gray-800'}`}
									>
										<span className="text-[11px] font-semibold uppercase">
											{format(parseISO(s.date), 'EEE')}
										</span>
										<span className="text-lg leading-tight font-bold">
											{format(parseISO(s.date), 'd')}
										</span>
									</div>
									<div className="min-w-0 flex-1">
										<div className="truncate font-semibold">
											{s.periodName}
											{isToday && (
												<span className="ml-2 text-xs font-bold text-blue-600 uppercase">
													Today
												</span>
											)}
										</div>
										<div className="truncate text-sm text-gray-500">
											{s.startTime} – {s.endTime}
											{s.room ? ` · ${s.room}` : ''}
										</div>
									</div>
									<SessionStatus
										s={s}
										isToday={isToday}
									/>
									{!s.upcoming && (
										<FuseSvgIcon
											size={18}
											className="shrink-0 text-gray-400"
										>
											lucide:chevron-right
										</FuseSvgIcon>
									)}
								</div>
							);

							return (
								<li key={s.entryId}>
									{s.upcoming ? (
										<Tooltip title="You can take this register on the day of the lesson">
											{row}
										</Tooltip>
									) : (
										<Link href={registerHref(lesson.lessonId, s.entryId, s.date)}>{row}</Link>
									)}
								</li>
							);
						})}
					</ul>
				)}
			</Paper>
		</>
	);
}

export default function LessonPeriodsPage() {
	return (
		<AuthGuardRedirect auth={['TEACHER']}>
			<FusePageSimple
				content={
					<div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8">
						<Link
							href="/teacher/attendance"
							className="flex items-center gap-1 text-sm font-semibold text-blue-600 hover:underline"
						>
							<FuseSvgIcon size={16}>lucide:arrow-left</FuseSvgIcon>
							All lessons
						</Link>
						<Suspense
							fallback={
								<div className="flex justify-center py-16">
									<CircularProgress />
								</div>
							}
						>
							<LessonPeriods />
						</Suspense>
					</div>
				}
			/>
		</AuthGuardRedirect>
	);
}
