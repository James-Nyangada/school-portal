'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Alert, Button, CircularProgress, Paper, Typography } from '@mui/material';
import FuseSvgIcon from '@fuse/core/FuseSvgIcon';
import { ApiError, errorMessage, useTtApi } from './api';
import TimetableGrid from './TimetableGrid';
import type { GridCell, TtDay, TtPeriod } from './types';

type MeResponse = {
	timetable: { id: string; name: string; term: string; publishedAt: string } | null;
	viewer: { view: 'class' | 'teacher'; resourceId: string; name: string };
	days: TtDay[];
	periods: TtPeriod[];
	cells: GridCell[];
};

const minutes = (hhmm: string) => {
	const [h, m] = hhmm.split(':').map(Number);

	return (h ?? 0) * 60 + (m ?? 0);
};

/** Where are we in the school day? Returns the current period and the next lesson. */
function locate(data: MeResponse, at: Date) {
	const weekday = (at.getDay() + 6) % 7; // Monday = 0
	const day = data.days[weekday];

	if (!day) return { now: null, next: null };

	const t = at.getHours() * 60 + at.getMinutes();
	const current = data.periods.find((p) => minutes(p.startTime) <= t && t < minutes(p.endTime));
	const upcoming = data.cells
		.filter((c) => c.dayIndex === day.index)
		.map((c) => ({ c, start: minutes(data.periods.find((p) => p.index === c.periodIndex)?.startTime ?? '00:00') }))
		.filter((x) => x.start > t)
		.sort((a, b) => a.start - b.start)[0];

	return {
		now: current ? { dayIndex: day.index, periodIndex: current.index } : null,
		next: upcoming ? { dayIndex: day.index, periodIndex: upcoming.c.periodIndex } : null,
		nextCell: upcoming?.c ?? null
	};
}

/**
 * Read-only published timetable for the signed-in teacher, student, or a parent's child.
 * The server enforces the fee gate for students (402 → locked card here).
 */
export default function MyTimetable({ studentId, title }: { studentId?: string; title?: string }) {
	const api = useTtApi();
	const [data, setData] = useState<MeResponse | null>(null);
	const [locked, setLocked] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [clock, setClock] = useState<Date | null>(null);

	useEffect(() => {
		setClock(new Date());
		const t = setInterval(() => setClock(new Date()), 60_000);

		return () => clearInterval(t);
	}, []);

	useEffect(() => {
		if (!api.ready) return;

		setData(null);
		setLocked(null);
		setError(null);
		api.get<MeResponse>(`/published/me${studentId ? `?studentId=${studentId}` : ''}`)
			.then(setData)
			.catch((e) => {
				if (e instanceof ApiError && e.status === 402) setLocked(e.message);
				else setError(errorMessage(e));
			});
	}, [api, studentId]);

	if (locked) {
		return (
			<Paper
				variant="outlined"
				className="flex flex-col items-center gap-3 rounded-2xl px-6 py-14 text-center"
			>
				<div className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 text-amber-700">
					<FuseSvgIcon size={28}>lucide:lock</FuseSvgIcon>
				</div>
				<Typography className="text-lg font-bold">Timetable locked</Typography>
				<Typography
					color="text.secondary"
					className="max-w-md"
				>
					{locked}
				</Typography>
				<Button
					component={Link}
					href={api.role === 'PARENT' ? '/parent/fees' : '/student/fees'}
					variant="contained"
					color="secondary"
					className="rounded-full"
				>
					View fees &amp; pay
				</Button>
			</Paper>
		);
	}

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
			<Paper
				variant="outlined"
				className="flex flex-col items-center gap-2 rounded-2xl px-6 py-14 text-center"
			>
				<FuseSvgIcon
					size={36}
					color="disabled"
				>
					lucide:calendar-clock
				</FuseSvgIcon>
				<Typography className="font-semibold">No timetable published yet</Typography>
				<Typography color="text.secondary">It will appear here as soon as the school publishes it.</Typography>
			</Paper>
		);
	}

	const where = clock ? locate(data, clock) : { now: null, next: null, nextCell: null };
	const nextLesson = where.nextCell?.lessons[0];

	return (
		<div className="flex flex-col gap-4">
			<div className="flex flex-wrap items-end justify-between gap-3">
				<div>
					<Typography className="text-lg font-bold">{title ?? data.viewer.name}</Typography>
					<Typography
						variant="body2"
						color="text.secondary"
					>
						{data.timetable.name} · {data.timetable.term}
					</Typography>
				</div>
				{nextLesson && (
					<div className="flex items-center gap-2 rounded-full bg-blue-50 px-4 py-2 text-sm dark:bg-blue-900/30">
						<FuseSvgIcon size={16}>lucide:clock</FuseSvgIcon>
						Next: <b>{nextLesson.subjectName}</b>
						{data.viewer.view === 'teacher'
							? ` with ${nextLesson.classes.join(', ')}`
							: ` with ${nextLesson.teachers.join(', ')}`}
						{nextLesson.room ? ` in ${nextLesson.room}` : ''} at{' '}
						{data.periods.find((p) => p.index === where.nextCell!.periodIndex)?.startTime}
					</div>
				)}
			</div>
			<Paper
				variant="outlined"
				className="rounded-2xl p-4"
			>
				<TimetableGrid
					days={data.days}
					periods={data.periods}
					cells={data.cells}
					view={data.viewer.view}
					now={where.now}
					next={where.next}
				/>
			</Paper>
		</div>
	);
}
