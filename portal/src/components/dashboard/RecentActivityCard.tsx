import FuseSvgIcon from '@fuse/core/FuseSvgIcon';

export interface ActivityItem {
	title: string;
	timestamp: string; // pre-formatted, e.g. "2 Jul, 10:42 AM"
	actor?: string; // e.g. "John Doe"
	action?: string; // e.g. "LOGIN", "USER_CREATED"
}

// Map action strings to a muted badge colour so the list stays readable.
function actionBadgeClass(action?: string): string {
	if (!action) return 'bg-gray-100 text-gray-500';

	const a = action.toUpperCase();

	if (a.includes('LOGIN') || a.includes('LOGOUT')) return 'bg-blue-50 text-blue-600';

	if (a.includes('CREATE') || a.includes('REGISTER') || a.includes('ADMIT')) return 'bg-emerald-50 text-emerald-600';

	if (a.includes('UPDATE') || a.includes('EDIT') || a.includes('CHANGE')) return 'bg-amber-50 text-amber-600';

	if (a.includes('DELETE') || a.includes('REMOVE') || a.includes('SUSPEND')) return 'bg-red-50 text-red-600';

	if (a.includes('APPROVE') || a.includes('ACCEPT')) return 'bg-teal-50 text-teal-600';

	if (a.includes('REJECT') || a.includes('DENY')) return 'bg-orange-50 text-orange-600';

	return 'bg-gray-100 text-gray-500';
}

// Format raw action string into a human-readable label.
function formatAction(action: string): string {
	return action
		.replace(/_/g, ' ')
		.toLowerCase()
		.replace(/\b\w/g, (c) => c.toUpperCase());
}

// Older audit entries stored details as a JSON object; show those as "key: value · key: value".
function formatTitle(title: string): string {
	if (!title.trim().startsWith('{')) return title;

	try {
		const obj = JSON.parse(title) as Record<string, unknown>;

		return Object.entries(obj)
			.filter(([, v]) => v !== null && v !== '' && !(Array.isArray(v) && v.length === 0))
			.map(([k, v]) => {
				const label = k.replace(/([A-Z])/g, ' $1').toLowerCase();
				const value = Array.isArray(v)
					? `${v.length} item${v.length === 1 ? '' : 's'}`
					: typeof v === 'object'
						? '…'
						: String(v);

				return `${label}: ${value}`;
			})
			.join(' · ');
	} catch {
		return title;
	}
}

export function RecentActivityCard({ items }: { items: ActivityItem[] }) {
	return (
		<div className="flex h-full flex-col rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
			<div className="mb-4 flex items-center justify-between">
				<h3 className="font-semibold text-gray-900">Recent Activity</h3>
				<span className="text-xs text-gray-400">Audit log</span>
			</div>

			{items.length === 0 ? (
				<div className="flex flex-1 items-center justify-center">
					<p className="py-6 text-center text-sm text-gray-400">No recent activity yet.</p>
				</div>
			) : (
				<ul className="flex-1 divide-y divide-gray-100">
					{items.map((item, i) => (
						<li
							key={i}
							className="flex items-start gap-3 py-3"
						>
							<div className="min-w-0 flex-1">
								<div className="flex flex-wrap items-center gap-2">
									{item.action && (
										<span
											className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-wide uppercase ${actionBadgeClass(item.action)}`}
										>
											{formatAction(item.action)}
										</span>
									)}
									<p className="truncate text-sm font-medium text-gray-800">
										{formatTitle(item.title)}
									</p>
								</div>
								<span className="mt-0.5 flex items-center gap-1 text-xs text-gray-400">
									<FuseSvgIcon size={12}>lucide:clock</FuseSvgIcon>
									{item.timestamp}
									{item.actor && <span className="ml-1">· {item.actor}</span>}
								</span>
							</div>
							<FuseSvgIcon
								size={16}
								className="mt-0.5 shrink-0 text-gray-300"
							>
								lucide:chevron-right
							</FuseSvgIcon>
						</li>
					))}
				</ul>
			)}
		</div>
	);
}
