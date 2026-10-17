'use client';

import { ReactNode, useState } from 'react';
import { Paper, Tab, Tabs, Typography } from '@mui/material';
import FusePageSimple from '@fuse/core/FusePageSimple';
import FuseSvgIcon from '@fuse/core/FuseSvgIcon';
import SchoolProfilePanel from './SchoolProfilePanel';
import AcademicCalendarPanel from './AcademicCalendarPanel';

export type SettingsTab = { key: string; label: string; icon: string; render: () => ReactNode };

const SCHOOL_TABS: SettingsTab[] = [
	{ key: 'info', label: 'School Info', icon: 'lucide:building', render: () => <SchoolProfilePanel section="info" /> },
	{
		key: 'about',
		label: 'About & Leadership',
		icon: 'lucide:info',
		render: () => <SchoolProfilePanel section="about" />
	},
	{
		key: 'website',
		label: 'Website Content',
		icon: 'lucide:globe',
		render: () => <SchoolProfilePanel section="website" />
	},
	{
		key: 'calendar',
		label: 'Academic Calendar',
		icon: 'lucide:calendar-range',
		render: () => <AcademicCalendarPanel />
	}
];

/** School Settings: the school profile shown on the website and the academic calendar, plus any role-specific tabs. */
export default function SchoolSettingsPage({
	title,
	subtitle,
	extraTabs = []
}: {
	title: string;
	subtitle: string;
	extraTabs?: SettingsTab[];
}) {
	const tabs = [...SCHOOL_TABS, ...extraTabs];
	const [active, setActive] = useState(tabs[0].key);
	const tab = tabs.find((t) => t.key === active) ?? tabs[0];

	return (
		<FusePageSimple
			content={
				<div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8">
					<div>
						<Typography className="text-3xl font-extrabold tracking-tight">{title}</Typography>
						<Typography className="text-secondary mt-1">{subtitle}</Typography>
					</div>

					<Paper className="bg-card flex flex-col rounded-2xl p-4 shadow sm:p-6">
						<Tabs
							value={tab.key}
							onChange={(_, v) => setActive(v)}
							variant="scrollable"
							scrollButtons="auto"
							className="border-b"
						>
							{tabs.map((t) => (
								<Tab
									key={t.key}
									value={t.key}
									label={t.label}
									icon={<FuseSvgIcon size={18}>{t.icon}</FuseSvgIcon>}
									iconPosition="start"
									className="min-h-12"
								/>
							))}
						</Tabs>
						<div className="mt-6">{tab.render()}</div>
					</Paper>
				</div>
			}
		/>
	);
}
