'use client';

import { Fragment } from 'react';
import Tooltip from '@mui/material/Tooltip';
import type { GridCell, TtDay, TtPeriod } from './types';

type MasterGridProps = {
	days: TtDay[];
	periods: TtPeriod[];
	classes: { id: string; name: string }[];
	cells: GridCell[];
	onClassClick?: (classId: string) => void;
};

/** Compact whole-school view: classes down the side, every day × period across the top. */
export default function MasterGrid({ days, periods, classes, cells, onClassClick }: MasterGridProps) {
	const byClassSlot = new Map<string, { cell: GridCell; first: boolean }>();
	cells.forEach((c) =>
		c.lessons.forEach((l) =>
			l.classIds.forEach((cid) => {
				for (let k = 0; k < c.length; k++)
					byClassSlot.set(`${cid}:${c.dayIndex}:${c.periodIndex + k}`, { cell: c, first: k === 0 });
			})
		)
	);

	const cols = days.length * periods.length;

	return (
		<div className="w-full overflow-x-auto">
			<div
				className="grid text-[10px]"
				style={{ gridTemplateColumns: `72px repeat(${cols}, minmax(30px, 1fr))`, minWidth: 72 + cols * 30 }}
			>
				<div className="sticky left-0 z-10 bg-white dark:bg-[#1E2125]" />
				{days.map((d) => (
					<div
						key={d.index}
						className="border-l-2 border-gray-300 py-1 text-center font-semibold dark:border-white/20"
						style={{ gridColumn: `span ${periods.length}` }}
					>
						{d.name}
					</div>
				))}
				<div className="sticky left-0 z-10 bg-white dark:bg-[#1E2125]" />
				{days.map((d) =>
					periods.map((p, i) => (
						<div
							key={`${d.index}-${p.index}`}
							className={`pb-1 text-center text-gray-500 ${i === 0 ? 'border-l-2 border-gray-300 dark:border-white/20' : ''}`}
						>
							{p.name.replace(/^Period\s*/i, '')}
						</div>
					))
				)}

				{classes.map((cls) => (
					<Fragment key={cls.id}>
						<button
							type="button"
							onClick={() => onClassClick?.(cls.id)}
							className="sticky left-0 z-10 truncate border-t border-gray-200 bg-white px-1 py-1 text-left font-semibold hover:text-blue-600 dark:border-white/10 dark:bg-[#1E2125]"
						>
							{cls.name}
						</button>
						{days.map((d) =>
							periods.map((p, i) => {
								const hit = byClassSlot.get(`${cls.id}:${d.index}:${p.index}`);
								const lesson = hit?.cell.lessons.find((l) => l.classIds.includes(cls.id));
								const border = i === 0 ? 'border-l-2 border-gray-300 dark:border-white/20' : '';

								if (!hit || !lesson) {
									return (
										<div
											key={`${d.index}-${p.index}`}
											className={`border-t border-gray-200 dark:border-white/10 ${border}`}
										/>
									);
								}

								const label =
									hit.cell.lessons.length > 1
										? hit.cell.lessons.map((l) => l.subject).join('/')
										: lesson.subject;

								return (
									<Tooltip
										key={`${d.index}-${p.index}`}
										title={`${hit.cell.lessons.map((l) => `${l.subjectName} — ${l.teachers.join(', ')}${l.room ? ` (${l.room})` : ''}`).join(' | ')}`}
									>
										<div
											className={`truncate border-t border-gray-200 px-0.5 py-1 text-center font-semibold dark:border-white/10 ${border}`}
											style={{ backgroundColor: `${lesson.color}2e`, color: 'inherit' }}
										>
											{hit.first ? label : '·'}
										</div>
									</Tooltip>
								);
							})
						)}
					</Fragment>
				))}
			</div>
		</div>
	);
}
