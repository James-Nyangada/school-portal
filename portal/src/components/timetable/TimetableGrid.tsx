'use client';

import clsx from 'clsx';
import { Fragment, ReactNode } from 'react';
import Tooltip from '@mui/material/Tooltip';
import LessonCard from './LessonCard';
import { breakAfter, GridCell, GridView, TtDay, TtPeriod } from './types';

export type CellStatus = { status: 'ok' | 'soft' | 'blocked'; reasons: string[]; swapWith?: string | null };

type TimetableGridProps = {
	days: TtDay[];
	periods: TtPeriod[];
	cells: GridCell[];
	view: GridView;
	compact?: boolean;
	/** Highlight the period happening now / next (my-timetable). */
	now?: { dayIndex: number; periodIndex: number } | null;
	next?: { dayIndex: number; periodIndex: number } | null;
	/** Editor: tint every cell while dragging. key = `${day}:${period}` */
	statuses?: Map<string, CellStatus> | null;
	draggingKey?: string | null;
	selectedKey?: string | null;
	editable?: boolean;
	onCardDragStart?: (cell: GridCell, e: React.DragEvent) => void;
	onCardDragEnd?: () => void;
	onDropCell?: (dayIndex: number, periodIndex: number, e: React.DragEvent) => void;
	onCardClick?: (cell: GridCell) => void;
	onCardContextMenu?: (cell: GridCell, e: React.MouseEvent) => void;
	renderEmpty?: (dayIndex: number, periodIndex: number) => ReactNode;
};

const statusClass: Record<CellStatus['status'], string> = {
	ok: 'bg-emerald-500/15 ring-1 ring-inset ring-emerald-500/40',
	soft: 'bg-amber-400/20 ring-1 ring-inset ring-amber-500/50',
	blocked: 'bg-rose-500/10'
};

/**
 * Weekly grid in the printed aSc layout: days down the side, periods across the top, a thin
 * separator column at each break. Doubles render as one card spanning two columns.
 */
export default function TimetableGrid(props: TimetableGridProps) {
	const { days, periods, cells, view, compact, now, next, statuses, draggingKey, selectedKey, editable } = props;

	// Column index for each period, leaving a narrow column after every break.
	const colOf: number[] = [];
	const template: string[] = [compact ? '44px' : '84px'];
	let col = 2;
	periods.forEach((_, i) => {
		colOf[i] = col++;
		template.push(`minmax(${compact ? 52 : 92}px, 1fr)`);

		if (breakAfter(periods, i)) {
			col++;
			template.push('10px');
		}
	});

	const cellAt = new Map<string, GridCell>();
	const covered = new Set<string>();
	cells.forEach((c) => {
		cellAt.set(`${c.dayIndex}:${c.periodIndex}`, c);

		for (let k = 1; k < c.length; k++) covered.add(`${c.dayIndex}:${c.periodIndex + k}`);
	});

	const periodPos = new Map(periods.map((p, i) => [p.index, i]));
	const rowHeight = compact ? 'minmax(34px, auto)' : 'minmax(58px, auto)';

	return (
		<div className="w-full overflow-x-auto">
			<div
				className="grid gap-1"
				style={{
					gridTemplateColumns: template.join(' '),
					gridTemplateRows: `auto repeat(${days.length}, ${rowHeight})`,
					minWidth: compact ? 0 : 640
				}}
			>
				{/* Header row */}
				<div />
				{periods.map((p, i) => (
					<Fragment key={p.index}>
						<div
							className="flex flex-col items-center justify-end pb-1 text-center"
							style={{ gridColumn: colOf[i], gridRow: 1 }}
						>
							<span className={clsx('font-semibold', compact ? 'text-[10px]' : 'text-xs')}>{p.name}</span>
							{!compact && (
								<span className="text-[10px] text-gray-500">
									{p.startTime}–{p.endTime}
								</span>
							)}
						</div>
						{breakAfter(periods, i) && (
							<div
								className="flex items-end justify-center pb-1"
								style={{ gridColumn: colOf[i]! + 1, gridRow: 1 }}
							/>
						)}
					</Fragment>
				))}

				{days.map((d, di) => (
					<Fragment key={d.index}>
						<div
							className={clsx('flex items-center font-semibold', compact ? 'text-[11px]' : 'text-sm')}
							style={{ gridColumn: 1, gridRow: di + 2 }}
						>
							{compact ? d.short : d.name}
						</div>

						{periods.map((p, pi) => {
							const key = `${d.index}:${p.index}`;
							const cell = cellAt.get(key);
							const st = statuses?.get(key);
							const isNow = now?.dayIndex === d.index && now.periodIndex === p.index;
							const isNext = next?.dayIndex === d.index && next.periodIndex === p.index;
							const breakCol = breakAfter(periods, pi) ? (
								<div
									key={`${key}-brk`}
									className="rounded-sm bg-gray-100 dark:bg-white/5"
									style={{ gridColumn: colOf[pi]! + 1, gridRow: di + 2 }}
								/>
							) : null;

							if (covered.has(key)) return breakCol;

							const span = cell ? Math.max(1, cell.length) : 1;
							const lastPos = (periodPos.get(p.index) ?? pi) + span - 1;
							const endCol = (colOf[lastPos] ?? colOf[pi]!) + 1;

							const slot = (
								<div
									key={key}
									data-cell={key}
									className={clsx(
										'relative rounded-md border border-dashed border-transparent transition-colors',
										!cell && 'bg-gray-50 dark:bg-white/[0.03]',
										st && statusClass[st.status],
										isNow && 'ring-2 ring-blue-500',
										isNext && !isNow && 'ring-dashed ring-2 ring-blue-300'
									)}
									style={{ gridColumn: `${colOf[pi]} / ${endCol}`, gridRow: di + 2 }}
									onDragOver={editable ? (e) => e.preventDefault() : undefined}
									onDrop={editable ? (e) => props.onDropCell?.(d.index, p.index, e) : undefined}
								>
									{cell ? (
										<div
											draggable={editable && !cell.locked}
											onDragStart={(e) => props.onCardDragStart?.(cell, e)}
											onDragEnd={() => props.onCardDragEnd?.()}
											onClick={() => props.onCardClick?.(cell)}
											onContextMenu={(e) => props.onCardContextMenu?.(cell, e)}
											className={clsx(
												'h-full',
												editable &&
													(cell.locked
														? 'cursor-not-allowed'
														: 'cursor-grab active:cursor-grabbing')
											)}
										>
											<LessonCard
												lessons={cell.lessons}
												view={view}
												locked={cell.locked}
												compact={compact}
												dragging={draggingKey === cell.cardKey}
												selected={selectedKey === cell.cardKey}
												badge={cell.cover ? 'cover' : cell.coveredByOther ? 'away' : undefined}
											/>
										</div>
									) : (
										props.renderEmpty?.(d.index, p.index)
									)}
								</div>
							);

							const wrapped =
								st && st.status !== 'ok' && st.reasons.length > 0 ? (
									<Tooltip
										key={key}
										title={st.reasons.join(' · ')}
										placement="top"
										arrow
									>
										{slot}
									</Tooltip>
								) : (
									slot
								);

							return (
								<Fragment key={key}>
									{wrapped}
									{breakCol}
								</Fragment>
							);
						})}
					</Fragment>
				))}
			</div>
		</div>
	);
}
