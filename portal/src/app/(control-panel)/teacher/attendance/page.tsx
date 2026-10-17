'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Alert, Chip, CircularProgress, Paper, Typography } from '@mui/material';
import FusePageSimple from '@fuse/core/FusePageSimple';
import FuseSvgIcon from '@fuse/core/FuseSvgIcon';
import AuthGuardRedirect from '@auth/AuthGuardRedirect';
import {
	classNames,
	errorMessage,
	registerHref,
	useAttendanceApi,
	type LessonsResponse
} from '@/components/attendance/api';

function EmptyState({ icon, title, text }: { icon: string; title: string; text: string }) {
	return (
		<Paper
			variant="outlined"
			className="flex flex-col items-center gap-2 rounded-2xl px-6 py-14 text-center"
		>
			<FuseSvgIcon
				size={36}
				color="disabled"
			>
				{icon}
			</FuseSvgIcon>
			<Typography className="font-semibold">{title}</Typography>
			<Typography color="text.secondary">{text}</Typography>
		</Paper>
	);
}

/** Today's registers across all lessons, in period order, with whether each has been taken. */
function TodayRegisters({ data }: { data: LessonsResponse }) {
	const items = data.lessons
		.flatMap((l) => l.today.map((s) => ({ lesson: l, session: s })))
		.sort((a, b) => a.session.periodIndex - b.session.periodIndex);

	if (items.length === 0) return null;

	return (
		<Paper
			variant="outlined"
			className="flex flex-col gap-3 rounded-2xl p-5"
		>
			<div>
				<Typography className="font-semibold">Today’s registers</Typography>
				<Typography
					variant="caption"
					color="text.secondary"
				>
					{data.dayName}
				</Typography>
			</div>
			<ul className="flex flex-col gap-2">
				{items.map(({ lesson, session }) => {
					const done = session.marked > 0;

					return (
						<li key={`${lesson.lessonId}-${session.entryId}`}>
							<Link
								href={registerHref(lesson.lessonId, session.entryId, session.date)}
								className="flex items-center gap-3 rounded-lg px-3 py-2 transition-opacity hover:opacity-80"
								style={{
									backgroundColor: `${lesson.color}14`,
									borderLeft: `4px solid ${lesson.color}`
								}}
							>
								<div className="w-20 shrink-0 text-xs text-gray-500">
									<div className="font-semibold text-gray-800 dark:text-gray-100">
										{session.startTime}
									</div>
									{session.periodName}
								</div>
								<div className="min-w-0 flex-1">
									<div className="truncate text-sm font-semibold">{lesson.subjectName}</div>
									<div className="truncate text-xs text-gray-500">{classNames(lesson)}</div>
								</div>
								<Chip
									size="small"
									color={done ? 'success' : 'warning'}
									variant={done ? 'filled' : 'outlined'}
									label={done ? `Taken · ${session.marked}/${lesson.studentCount}` : 'Not taken'}
								/>
							</Link>
						</li>
					);
				})}
			</ul>
		</Paper>
	);
}

export default function TeacherAttendancePage() {
	const api = useAttendanceApi();
	const [data, setData] = useState<LessonsResponse | null>(null);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		if (!api.ready) return;

		api.get<LessonsResponse>('/lessons')
			.then(setData)
			.catch((e) => setError(errorMessage(e)));
	}, [api]);

	const content = () => {
		if (error) return <Alert severity="error">{error}</Alert>;

		if (!data) {
			return (
				<div className="flex justify-center py-16">
					<CircularProgress />
				</div>
			);
		}

		if (!data.timetable) {
			return (
				<EmptyState
					icon="lucide:calendar-clock"
					title="No timetable published yet"
					text="Your lessons will appear here once the school publishes the timetable."
				/>
			);
		}

		if (data.lessons.length === 0) {
			return (
				<EmptyState
					icon="lucide:book-open"
					title="No lessons assigned"
					text="You have no lessons on the published timetable. Ask the admin office if this looks wrong."
				/>
			);
		}

		return (
			<>
				<TodayRegisters data={data} />
				<div>
					<Typography className="mb-3 font-semibold">My lessons</Typography>
					<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
						{data.lessons.map((l) => (
							<Link
								key={l.lessonId}
								href={`/teacher/attendance/${l.lessonId}`}
								className="group"
							>
								<Paper
									variant="outlined"
									className="flex h-full flex-col gap-3 overflow-hidden rounded-2xl p-5 transition-shadow group-hover:shadow-md"
									style={{ borderTop: `4px solid ${l.color}` }}
								>
									<div className="flex items-start justify-between gap-2">
										<div className="min-w-0">
											<Typography className="truncate text-lg font-bold">
												{l.subjectName}
											</Typography>
											<Typography
												variant="body2"
												color="text.secondary"
												className="truncate"
											>
												{classNames(l)}
											</Typography>
										</div>
										<FuseSvgIcon
											size={18}
											className="mt-1 shrink-0 text-gray-400 transition-transform group-hover:translate-x-0.5"
										>
											lucide:chevron-right
										</FuseSvgIcon>
									</div>
									<div className="mt-auto flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-500">
										<span className="flex items-center gap-1">
											<FuseSvgIcon size={14}>lucide:clock</FuseSvgIcon>
											{l.sessions.length} {l.sessions.length === 1 ? 'period' : 'periods'} a week
										</span>
										<span className="flex items-center gap-1">
											<FuseSvgIcon size={14}>lucide:users</FuseSvgIcon>
											{l.studentCount} {l.studentCount === 1 ? 'student' : 'students'}
										</span>
										{l.today.length > 0 && (
											<span className="flex items-center gap-1 font-semibold text-blue-600">
												<FuseSvgIcon size={14}>lucide:calendar-check</FuseSvgIcon>
												Today {l.today.map((s) => s.startTime).join(', ')}
											</span>
										)}
									</div>
								</Paper>
							</Link>
						))}
					</div>
				</div>
			</>
		);
	};

	return (
		<AuthGuardRedirect auth={['TEACHER']}>
			<FusePageSimple
				content={
					<div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8">
						<div>
							<Typography className="text-4xl font-extrabold tracking-tight">Attendance</Typography>
							<Typography
								color="text.secondary"
								className="mt-1"
							>
								Pick a lesson to see its periods, then open a period to take the register.
								{data?.timetable ? ` ${data.timetable.name} · ${data.timetable.term}` : ''}
							</Typography>
						</div>
						{content()}
					</div>
				}
			/>
		</AuthGuardRedirect>
	);
}
