import Link from 'next/link';
import FuseSvgIcon from '@fuse/core/FuseSvgIcon';

export type CalendarEvent = {
	date: string;
	title: string;
	kind: 'TERM_START' | 'HALF_TERM_START' | 'HALF_TERM_END' | 'TERM_END';
};

const ICON: Record<CalendarEvent['kind'], string> = {
	TERM_START: 'lucide:door-open',
	HALF_TERM_START: 'lucide:pause',
	HALF_TERM_END: 'lucide:play',
	TERM_END: 'lucide:door-closed'
};

const dayLabel = (iso: string) =>
	new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });

/** Next 7 days of the school calendar (term dates from School Settings → Academic Calendar). */
export function UpcomingEventsCard({ events, settingsHref }: { events: CalendarEvent[]; settingsHref: string }) {
	return (
		<div className="flex h-full flex-col rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
			<div className="mb-4">
				<h3 className="font-semibold text-gray-900">Upcoming events</h3>
				<p className="text-xs text-gray-400">Next 7 days</p>
			</div>
			{events.length === 0 ? (
				<div className="flex flex-1 flex-col items-center justify-center gap-2 py-6 text-center">
					<FuseSvgIcon
						size={28}
						className="text-gray-300"
					>
						lucide:calendar
					</FuseSvgIcon>
					<p className="text-sm text-gray-500">Nothing on the school calendar this week.</p>
					<Link
						href={settingsHref}
						className="text-xs font-medium text-blue-600 hover:underline"
					>
						Manage term dates
					</Link>
				</div>
			) : (
				<ul className="flex flex-col divide-y divide-gray-100">
					{events.map((e) => (
						<li
							key={`${e.date}-${e.title}`}
							className="flex items-center gap-3 py-2.5"
						>
							<div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-indigo-600">
								<FuseSvgIcon size={16}>{ICON[e.kind]}</FuseSvgIcon>
							</div>
							<div className="min-w-0 flex-1">
								<p className="truncate text-sm font-medium text-gray-900">{e.title}</p>
								<p className="text-xs text-gray-500">{dayLabel(e.date)}</p>
							</div>
						</li>
					))}
				</ul>
			)}
		</div>
	);
}
