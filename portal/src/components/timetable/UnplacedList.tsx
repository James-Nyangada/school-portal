'use client';

import Link from 'next/link';
import Typography from '@mui/material/Typography';
import type { UnplacedReport } from './types';

/** Unplaced lesson cards with plain-English reasons and a jump into the editor. */
export default function UnplacedList({ items, timetableId }: { items: UnplacedReport[]; timetableId: string }) {
	return (
		<div>
			<Typography className="mb-2 font-semibold">Why some lessons could not be placed</Typography>
			<ul className="flex flex-col divide-y divide-gray-100 dark:divide-white/10">
				{items.map((u) => (
					<li
						key={u.cardId}
						className="flex flex-wrap items-start gap-3 py-2"
					>
						<div className="min-w-0 flex-1">
							<div className="text-sm font-semibold">{u.label}</div>
							{u.reasons.map((r, i) => (
								<div
									key={i}
									className="text-sm text-gray-600 dark:text-gray-300"
								>
									{r}
								</div>
							))}
						</div>
						<Link
							href={`/admin/timetable/${timetableId}/editor?card=${encodeURIComponent(u.cardId)}`}
							className="text-xs font-semibold whitespace-nowrap text-blue-600 hover:underline"
						>
							Show in editor
						</Link>
					</li>
				))}
			</ul>
		</div>
	);
}
