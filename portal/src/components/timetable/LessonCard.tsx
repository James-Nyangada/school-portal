'use client';

import clsx from 'clsx';
import FuseSvgIcon from '@fuse/core/FuseSvgIcon';
import type { CellLesson, GridView } from './types';

type LessonCardProps = {
	lessons: CellLesson[];
	/** Which perspective the grid shows — decides the secondary line. */
	view: GridView | 'master';
	locked?: boolean;
	compact?: boolean;
	dragging?: boolean;
	selected?: boolean;
	badge?: string;
	className?: string;
};

/**
 * One placed lesson: subject colour, subject short name, and the "other side" of the lesson
 * (teacher for a class view, class for a teacher view, both for a room view). Option blocks
 * show every subject running in parallel.
 */
export default function LessonCard(props: LessonCardProps) {
	const { lessons, view, locked, compact, dragging, selected, badge, className } = props;
	const color = lessons[0]?.color ?? '#94a3b8';

	const secondary = (l: CellLesson) => {
		if (view === 'teacher') return [l.classes.join(', '), l.room].filter(Boolean).join(' · ');

		if (view === 'room') return `${l.classes.join(', ')} · ${l.teachers.join(', ')}`;

		if (view === 'master') return l.teachers.join(', ');

		return [l.teachers.join(', '), l.room].filter(Boolean).join(' · ');
	};

	return (
		<div
			className={clsx(
				'relative flex h-full w-full min-w-0 flex-col justify-center overflow-hidden rounded-md border-l-4 text-left',
				compact ? 'px-1 py-0.5' : 'px-2 py-1',
				dragging && 'opacity-40',
				selected && 'ring-2 ring-offset-1',
				className
			)}
			style={{
				borderLeftColor: color,
				backgroundColor: `${color}1f`,
				...(selected ? ({ '--tw-ring-color': color } as React.CSSProperties) : {})
			}}
		>
			{lessons.map((l, i) => (
				<div
					key={`${l.lessonId}-${i}`}
					className="min-w-0 leading-tight"
				>
					<div className={clsx('truncate font-semibold', compact ? 'text-[10px]' : 'text-[12px]')}>
						{l.subject}
						{lessons.length > 1 && !compact && <span className="font-normal opacity-60"> · block</span>}
					</div>
					{!compact && <div className="truncate text-[11px] opacity-75">{secondary(l)}</div>}
					{compact && view === 'master' && (
						<div className="truncate text-[9px] opacity-70">{secondary(l)}</div>
					)}
				</div>
			))}
			{locked && (
				<FuseSvgIcon
					size={12}
					className="absolute top-1 right-1 opacity-60"
				>
					lucide:lock
				</FuseSvgIcon>
			)}
			{badge && (
				<span className="absolute right-1 bottom-1 rounded bg-amber-500 px-1 text-[9px] font-bold text-white uppercase">
					{badge}
				</span>
			)}
		</div>
	);
}
