'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import clsx from 'clsx';
import { ReactNode } from 'react';
import Chip from '@mui/material/Chip';
import Typography from '@mui/material/Typography';
import FuseSvgIcon from '@fuse/core/FuseSvgIcon';
import type { Timetable } from './types';

const TABS = [
	{ slug: 'lessons', label: 'Lessons', icon: 'lucide:list-checks' },
	{ slug: 'generate', label: 'Generate', icon: 'lucide:sparkles' },
	{ slug: 'editor', label: 'Editor', icon: 'lucide:grip' },
	{ slug: 'view', label: 'View & publish', icon: 'lucide:eye' }
];

export const statusChip = (status?: Timetable['status']) => {
	const map = {
		draft: { label: 'Draft', color: 'default' as const },
		published: { label: 'Published', color: 'success' as const },
		archived: { label: 'Archived', color: 'warning' as const }
	};
	const s = map[status ?? 'draft'];

	return (
		<Chip
			size="small"
			label={s.label}
			color={s.color}
			variant="outlined"
			sx={{ fontWeight: 600 }}
		/>
	);
};

/** Page header + step tabs shared by every page of one timetable. */
export default function TimetableHeader({ timetable, actions }: { timetable: Timetable | null; actions?: ReactNode }) {
	const pathname = usePathname();
	const base = `/admin/timetable/${timetable?.id ?? ''}`;

	return (
		<div className="flex w-full flex-col gap-4 px-6 pt-6">
			<Link
				href="/admin/timetable"
				className="flex w-fit items-center gap-1 text-sm text-gray-500 hover:text-gray-800"
			>
				<FuseSvgIcon size={16}>lucide:arrow-left</FuseSvgIcon>
				All timetables
			</Link>
			<div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
				<div className="flex min-w-0 items-center gap-3">
					<Typography className="truncate text-3xl font-extrabold tracking-tight">
						{timetable?.name ?? 'Timetable'}
					</Typography>
					{timetable && statusChip(timetable.status)}
					{timetable && (
						<Typography
							color="text.secondary"
							className="hidden text-sm sm:block"
						>
							{timetable.term}
						</Typography>
					)}
				</div>
				<div className="flex flex-wrap items-center gap-2">{actions}</div>
			</div>
			<nav className="-mb-px flex gap-1 overflow-x-auto border-b border-gray-200 dark:border-white/10">
				{TABS.map((t, i) => {
					const href = `${base}/${t.slug}`;
					const active = pathname?.startsWith(href);

					return (
						<Link
							key={t.slug}
							href={href}
							className={clsx(
								'flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold whitespace-nowrap',
								active
									? 'border-blue-600 text-blue-600'
									: 'border-transparent text-gray-500 hover:text-gray-800'
							)}
						>
							<span className="flex h-5 w-5 items-center justify-center rounded-full bg-gray-100 text-[11px] dark:bg-white/10">
								{i + 1}
							</span>
							{t.label}
						</Link>
					);
				})}
			</nav>
		</div>
	);
}
