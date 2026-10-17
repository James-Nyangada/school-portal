'use client';

import Typography from '@mui/material/Typography';
import Paper from '@mui/material/Paper';
import FusePageSimple from '@fuse/core/FusePageSimple';
import AuthGuardRedirect from '@auth/AuthGuardRedirect';
import FuseSvgIcon from '@fuse/core/FuseSvgIcon';

export default function StudentCalendar() {
	const events = [
		{
			title: 'Term 1 Mid-Term Exams',
			date: '2026-07-10 to 2026-07-14',
			description: 'Main exams for mid-term evaluation.'
		},
		{ title: 'School Sports Day', date: '2026-07-22', description: 'Inter-house athletic competitions.' },
		{
			title: 'Parent-Teacher Consultations',
			date: '2026-07-30',
			description: 'Academic consultations with subject teachers.'
		}
	];

	return (
		<AuthGuardRedirect auth={['STUDENT']}>
			<FusePageSimple
				content={
					<div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8">
						<Typography className="text-4xl font-extrabold tracking-tight">
							School Calendar & Events
						</Typography>

						<Paper className="bg-card flex flex-auto flex-col rounded-2xl p-4 shadow sm:p-6">
							<div className="flex flex-col gap-4">
								{events.map((event, index) => (
									<div
										key={index}
										className="flex items-start gap-4 rounded-r-2xl border-l-4 border-blue-500 bg-blue-50/30 p-4 dark:bg-blue-500/10"
									>
										<div className="shrink-0 rounded-lg bg-blue-50 p-2 text-blue-500 dark:bg-blue-500/20">
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
												className="mb-2 block"
											>
												{event.date}
											</Typography>
											<Typography color="text.secondary">{event.description}</Typography>
										</div>
									</div>
								))}
							</div>
						</Paper>
					</div>
				}
			/>
		</AuthGuardRedirect>
	);
}
