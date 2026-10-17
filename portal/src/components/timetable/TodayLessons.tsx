'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Paper, Typography } from '@mui/material';
import FuseSvgIcon from '@fuse/core/FuseSvgIcon';
import { useTtApi } from './api';
import type { CellLesson } from './types';

type Item = {
	cardKey: string;
	periodIndex: number;
	length: number;
	startTime: string;
	endTime: string;
	period: string;
	lessons: CellLesson[];
	cover?: boolean;
	coveredByOther?: boolean;
};
type Today = { day: string | null; lessons: Item[]; covers: Item[]; locked: boolean };

/** Dashboard widget: today's lessons for a teacher or student, plus cover duties for teachers. */
export default function TodayLessons({ href, studentId }: { href: string; studentId?: string }) {
	const api = useTtApi();
	const [data, setData] = useState<Today | null>(null);
	const [failed, setFailed] = useState(false);

	useEffect(() => {
		if (!api.ready) return;

		api.get<Today>(`/published/today${studentId ? `?studentId=${studentId}` : ''}`)
			.then(setData)
			.catch(() => setFailed(true));
	}, [api, studentId]);

	if (failed) return null;

	const items = data ? [...data.lessons, ...data.covers].sort((a, b) => a.periodIndex - b.periodIndex) : [];
	const isTeacher = api.role === 'TEACHER';

	return (
		<Paper
			variant="outlined"
			className="flex flex-col gap-3 rounded-2xl p-5"
		>
			<div className="flex items-center justify-between">
				<div>
					<Typography className="font-semibold">Today’s lessons</Typography>
					<Typography
						variant="caption"
						color="text.secondary"
					>
						{data?.day ?? (data ? 'No school today' : '…')}
					</Typography>
				</div>
				<Link
					href={href}
					className="text-sm font-semibold text-blue-600 hover:underline"
				>
					Full timetable
				</Link>
			</div>
			{data?.locked ? (
				<Typography
					variant="body2"
					color="text.secondary"
				>
					Timetable locked until fees reach the required level.
				</Typography>
			) : items.length === 0 ? (
				<Typography
					variant="body2"
					color="text.secondary"
				>
					{data ? 'No lessons scheduled.' : 'Loading…'}
				</Typography>
			) : (
				<ul className="flex flex-col gap-2">
					{items.map((it, i) => {
						const l = it.lessons[0];

						return (
							<li
								key={`${it.cardKey}-${i}`}
								className="flex items-center gap-3 rounded-lg px-3 py-2"
								style={{
									backgroundColor: `${l?.color ?? '#94a3b8'}14`,
									borderLeft: `4px solid ${l?.color ?? '#94a3b8'}`
								}}
							>
								<div className="w-20 shrink-0 text-xs text-gray-500">
									<div className="font-semibold text-gray-800 dark:text-gray-100">{it.startTime}</div>
									{it.period}
								</div>
								<div className="min-w-0 flex-1">
									<div className="truncate text-sm font-semibold">
										{it.lessons.map((x) => x.subjectName).join(' / ')}
										{it.cover && (
											<span className="ml-2 rounded bg-amber-500 px-1 text-[10px] font-bold text-white uppercase">
												cover
											</span>
										)}
										{it.coveredByOther && (
											<span className="ml-2 rounded bg-gray-400 px-1 text-[10px] font-bold text-white uppercase">
												covered
											</span>
										)}
									</div>
									<div className="truncate text-xs text-gray-500">
										{isTeacher ? l?.classes.join(', ') : l?.teachers.join(', ')}
										{l?.room ? ` · ${l.room}` : ''}
									</div>
								</div>
								{it.length > 1 && (
									<FuseSvgIcon
										size={14}
										className="text-gray-400"
									>
										lucide:layers
									</FuseSvgIcon>
								)}
							</li>
						);
					})}
				</ul>
			)}
		</Paper>
	);
}
