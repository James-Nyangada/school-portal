'use client';

import Link from 'next/link';
import { Button, Paper, Typography } from '@mui/material';
import FuseSvgIcon from '@fuse/core/FuseSvgIcon';
import { useBackend } from '@/lib/finance';
import { Classroom, classroomSummary } from '@/lib/classroom';

/** Teacher dashboard summary of the class they are class teacher of; hidden when they have none. */
export default function MyClassroomCard() {
	const { data: classroom } = useBackend<Classroom | null>('/api/classes/mine');

	if (!classroom) return null;

	const summary = classroomSummary(classroom);
	const figures = [
		{ label: 'Students', value: summary.students },
		{ label: 'Present today', value: summary.present + summary.late },
		{ label: 'Absent today', value: summary.absent },
		{ label: 'Not marked', value: summary.unmarked }
	];

	return (
		<Paper className="flex flex-col gap-4 rounded-xl border border-gray-200 p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
			<div className="flex items-center gap-3">
				<div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-indigo-50">
					<FuseSvgIcon
						className="text-indigo-600"
						size={20}
					>
						lucide:school
					</FuseSvgIcon>
				</div>
				<div>
					<Typography className="text-[11px] font-semibold tracking-wide text-gray-400 uppercase">
						My Classroom
					</Typography>
					<Typography className="text-lg font-bold">{classroom.name}</Typography>
				</div>
			</div>
			<div className="grid grid-cols-2 gap-x-6 gap-y-2 sm:flex">
				{figures.map((f) => (
					<div key={f.label}>
						<Typography className="text-xl font-bold">{f.value}</Typography>
						<Typography className="text-xs text-gray-500">{f.label}</Typography>
					</div>
				))}
			</div>
			<Button
				component={Link}
				href="/teacher/classroom"
				variant="contained"
				color="secondary"
				className="rounded-full"
			>
				Manage class
			</Button>
		</Paper>
	);
}
