'use client';

import Typography from '@mui/material/Typography';
import Paper from '@mui/material/Paper';
import FusePageSimple from '@fuse/core/FusePageSimple';
import AuthGuardRedirect from '@auth/AuthGuardRedirect';
import FuseSvgIcon from '@fuse/core/FuseSvgIcon';

export default function TeacherCalendar() {
	const events = [
		{
			title: 'Term 1 Mid-Term Exams',
			date: '2026-07-10 to 2026-07-14',
			type: 'EXAM',
			description: 'Exam supervision duties assigned. Submit exam draft papers.'
		},
		{
			title: 'Staff Meeting & Workshop',
			date: '2026-07-18 14:00',
			type: 'MEETING',
			description: 'Academic performance reviews and curriculum progress alignment.'
		},
		{
			title: 'School Sports Day',
			date: '2026-07-22 08:30',
			type: 'EVENT',
			description: 'General supervision duties for outdoor events.'
		},
		{
			title: 'Report Cards Submission Deadline',
			date: '2026-08-05',
			type: 'DEADLINE',
			description: 'Submit all student term grades for Admin validation.'
		}
	];

	return (
		<AuthGuardRedirect auth={['TEACHER']}>
			<FusePageSimple
				content={
					<div className="mx-auto flex w-full max-w-7xl flex-col gap-32 px-24 py-32">
						<Typography className="text-4xl font-extrabold tracking-tight">
							Academic Calendar & Events
						</Typography>
						<Typography color="text.secondary">
							Stay updated with school events, deadlines, and supervision duties.
						</Typography>

						<div className="mt-8 flex flex-col gap-16">
							{events.map((event, index) => (
								<Paper
									key={index}
									className="bg-card flex flex-auto flex-col rounded-2xl border-l-4 border-emerald-500 p-24 shadow"
								>
									<div className="rounded-lg bg-emerald-50 p-8 text-emerald-600">
										<FuseSvgIcon size={24}>lucide:calendar-days</FuseSvgIcon>
									</div>
									<div>
										<Typography
											variant="h6"
											className="font-semibold"
										>
											{event.title}
										</Typography>
										<Typography
											variant="caption"
											color="text.secondary"
											className="mb-8 block"
										>
											{event.date} | Tag: <strong>{event.type}</strong>
										</Typography>
										<Typography color="text.secondary">{event.description}</Typography>
									</div>
								</Paper>
							))}
						</div>
					</div>
				}
			/>
		</AuthGuardRedirect>
	);
}
