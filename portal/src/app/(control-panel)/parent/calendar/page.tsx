'use client';

import Typography from '@mui/material/Typography';
import Paper from '@mui/material/Paper';
import FusePageSimple from '@fuse/core/FusePageSimple';
import AuthGuardRedirect from '@auth/AuthGuardRedirect';
import FuseSvgIcon from '@fuse/core/FuseSvgIcon';
import Grid from '@mui/material/Grid';

export default function ParentCalendar() {
	const events = [
		{
			title: 'Term 1 Mid-Term Exams',
			date: 'July 10, 2026 - July 14, 2026',
			type: 'Exams',
			description: 'Main exams for mid-term evaluation across all classes.',
			color: 'border-red-500 text-red-700 bg-red-50/40',
			icon: 'lucide:file-text',
			iconColor: 'bg-red-100 text-red-600'
		},
		{
			title: 'School Sports Day',
			date: 'July 22, 2026',
			type: 'Co-curricular',
			description: 'Inter-house athletic competitions. Parents are invited to attend.',
			color: 'border-green-500 text-green-700 bg-green-50/40',
			icon: 'lucide:trophy',
			iconColor: 'bg-green-100 text-green-600'
		},
		{
			title: 'Parent-Teacher Consultations',
			date: 'July 30, 2026',
			type: 'Meeting',
			description: 'Academic consultations with subject teachers to discuss progress.',
			color: 'border-blue-500 text-blue-700 bg-blue-50/40',
			icon: 'lucide:users',
			iconColor: 'bg-blue-100 text-blue-600'
		},
		{
			title: 'Term 1 Closing Ceremony',
			date: 'August 14, 2026',
			type: 'Event',
			description: 'End of term closing ceremony and release of report cards.',
			color: 'border-amber-500 text-amber-700 bg-amber-50/40',
			icon: 'lucide:award',
			iconColor: 'bg-amber-100 text-amber-600'
		}
	];

	const termDates = [
		{ name: 'Term 1, 2026', start: 'May 4, 2026', end: 'August 14, 2026', status: 'In Progress' },
		{ name: 'Term 2, 2026', start: 'September 7, 2026', end: 'November 27, 2026', status: 'Upcoming' }
	];

	return (
		<AuthGuardRedirect auth={['PARENT']}>
			<FusePageSimple
				content={
					<div className="mx-auto flex w-full max-w-7xl flex-col gap-32 px-24 py-32">
						{/* Header */}
						<div className="border-b border-gray-100 pb-16">
							<Typography className="text-4xl font-extrabold tracking-tight">
								School Calendar & Events
							</Typography>
							<Typography
								color="text.secondary"
								className="mt-8"
							>
								Stay updated with term schedules, exam periods, and upcoming events.
							</Typography>
						</div>

						<Grid
							container
							spacing={4}
						>
							{/* Term Dates Section */}
							<Grid size={{ xs: 12, md: 4 }}>
								<Typography
									variant="h6"
									className="mb-16 font-bold text-slate-800"
								>
									Term Dates
								</Typography>
								<div className="flex flex-col gap-16">
									{termDates.map((term, index) => (
										<Paper
											key={index}
											className="rounded-2xl border border-gray-100 bg-white p-20 shadow-sm"
											elevation={0}
										>
											<Typography className="text-base font-bold text-slate-800">
												{term.name}
											</Typography>

											<div className="mt-16 flex flex-col gap-8 text-sm text-slate-600">
												<div className="flex items-center justify-between">
													<span>Starts:</span>
													<span className="font-semibold text-slate-800">{term.start}</span>
												</div>
												<div className="flex items-center justify-between">
													<span>Ends:</span>
													<span className="font-semibold text-slate-800">{term.end}</span>
												</div>
											</div>

											<div className="mt-20 flex items-center justify-between border-t border-gray-100 pt-16">
												<span className="text-xs font-bold tracking-wider text-slate-400 uppercase">
													Status
												</span>
												<span
													className={`rounded-full px-10 py-4 text-xs font-bold ${
														term.status === 'In Progress'
															? 'bg-blue-50 text-blue-700'
															: 'bg-slate-100 text-slate-600'
													}`}
												>
													{term.status}
												</span>
											</div>
										</Paper>
									))}
								</div>
							</Grid>

							{/* Events Section */}
							<Grid size={{ xs: 12, md: 8 }}>
								<Typography
									variant="h6"
									className="mb-16 font-bold text-slate-800"
								>
									Upcoming Events & Schedules
								</Typography>
								<div className="flex flex-col gap-16">
									{events.map((event, index) => (
										<Paper
											key={index}
											className={`flex items-start gap-16 rounded-2xl border-l-4 p-24 shadow-sm ${event.color} border border-gray-100 bg-white transition-shadow duration-200 hover:shadow-md`}
											elevation={0}
										>
											<div className={`p-10 ${event.iconColor} shrink-0 rounded-xl`}>
												<FuseSvgIcon size={22}>{event.icon}</FuseSvgIcon>
											</div>
											<div className="min-w-0 flex-1">
												<div className="mb-4 flex flex-wrap items-center justify-between gap-8">
													<Typography
														variant="h6"
														className="text-base leading-tight font-bold text-slate-800"
													>
														{event.title}
													</Typography>
													<span className="scale-90 rounded-full bg-slate-100 px-10 py-4 text-xs font-bold tracking-wider text-slate-700 uppercase">
														{event.type}
													</span>
												</div>
												<Typography
													variant="caption"
													color="text.secondary"
													className="mb-8 block font-bold"
												>
													{event.date}
												</Typography>
												<Typography
													color="text.secondary"
													className="text-sm leading-relaxed"
												>
													{event.description}
												</Typography>
											</div>
										</Paper>
									))}
								</div>
							</Grid>
						</Grid>
					</div>
				}
			/>
		</AuthGuardRedirect>
	);
}
