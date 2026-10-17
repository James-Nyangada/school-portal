'use client';

import clsx from 'clsx';
import { useEffect, useRef, useState } from 'react';
import { breakAfter, TtDay, TtPeriod } from './types';

type Slot = { dayIndex: number; periodIndex: number };

/** Days × periods. Click or drag across cells to mark them unavailable (grey). */
export default function AvailabilityGrid({
	days,
	periods,
	value,
	onChange
}: {
	days: TtDay[];
	periods: TtPeriod[];
	value: Slot[];
	onChange: (slots: Slot[]) => void;
}) {
	const set = new Set(value.map((s) => `${s.dayIndex}:${s.periodIndex}`));
	const [painting, setPainting] = useState<null | boolean>(null);
	const latest = useRef(set);
	latest.current = set;

	useEffect(() => {
		const up = () => setPainting(null);
		window.addEventListener('mouseup', up);

		return () => window.removeEventListener('mouseup', up);
	}, []);

	const apply = (key: string, makeUnavailable: boolean) => {
		const next = new Set(latest.current);

		if (makeUnavailable) next.add(key);
		else next.delete(key);

		onChange([...next].map((k) => ({ dayIndex: Number(k.split(':')[0]), periodIndex: Number(k.split(':')[1]) })));
	};

	const toggleDay = (dayIndex: number) => {
		const all = periods.every((p) => set.has(`${dayIndex}:${p.index}`));
		const next = new Set(set);
		periods.forEach((p) => (all ? next.delete(`${dayIndex}:${p.index}`) : next.add(`${dayIndex}:${p.index}`)));
		onChange([...next].map((k) => ({ dayIndex: Number(k.split(':')[0]), periodIndex: Number(k.split(':')[1]) })));
	};

	return (
		<div className="select-none">
			<div className="overflow-x-auto">
				<table className="border-separate border-spacing-1">
					<thead>
						<tr>
							<th />
							{periods.map((p, i) => (
								<th
									key={p.index}
									className={clsx(
										'px-1 text-[11px] font-semibold text-gray-500',
										breakAfter(periods, i) && 'pr-3'
									)}
								>
									{p.name}
								</th>
							))}
						</tr>
					</thead>
					<tbody>
						{days.map((d) => (
							<tr key={d.index}>
								<td>
									<button
										type="button"
										className="pr-2 text-left text-sm font-semibold hover:text-blue-600"
										onClick={() => toggleDay(d.index)}
										title="Toggle the whole day"
									>
										{d.name}
									</button>
								</td>
								{periods.map((p, i) => {
									const key = `${d.index}:${p.index}`;
									const off = set.has(key);

									return (
										<td
											key={key}
											className={clsx(breakAfter(periods, i) && 'pr-3')}
										>
											<div
												role="checkbox"
												aria-checked={!off}
												aria-label={`${d.name} ${p.name}`}
												onMouseDown={() => {
													setPainting(!off);
													apply(key, !off);
												}}
												onMouseEnter={() => painting !== null && apply(key, painting)}
												className={clsx(
													'h-8 w-12 cursor-pointer rounded-md border transition-colors',
													off
														? 'border-gray-400 bg-gray-300 bg-[repeating-linear-gradient(45deg,transparent,transparent_4px,rgba(0,0,0,0.08)_4px,rgba(0,0,0,0.08)_8px)] dark:bg-gray-600'
														: 'border-emerald-300 bg-emerald-50 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-900/30'
												)}
											/>
										</td>
									);
								})}
							</tr>
						))}
					</tbody>
				</table>
			</div>
			<div className="mt-3 flex items-center gap-4 text-xs text-gray-500">
				<span className="flex items-center gap-1">
					<span className="inline-block h-3 w-4 rounded border border-emerald-300 bg-emerald-50" /> Available
				</span>
				<span className="flex items-center gap-1">
					<span className="inline-block h-3 w-4 rounded border border-gray-400 bg-gray-300" /> Unavailable
				</span>
				<span>Click or drag to toggle. Click a day name to toggle the whole day.</span>
			</div>
		</div>
	);
}
