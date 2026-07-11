'use client';

import { useEffect, useState } from 'react';
import Typography from '@mui/material/Typography';
import Paper from '@mui/material/Paper';
import FusePageSimple from '@fuse/core/FusePageSimple';
import FuseSvgIcon from '@fuse/core/FuseSvgIcon';
import AuthGuardRedirect from '@auth/AuthGuardRedirect';
import { StatCard } from '@/components/dashboard/StatCard';

export default function TeacherDashboard() {
	const [stats, setStats] = useState({ pendingGrading: 0, lessonsToday: 0 });

	useEffect(() => {
		// In a real app, fetch from /api/dashboard/teacher-stats
		setStats({ pendingGrading: 12, lessonsToday: 4 });
	}, []);

	return (
		<AuthGuardRedirect auth={['TEACHER']}>
			<FusePageSimple
				content={
					<div className="mx-auto flex w-full max-w-7xl flex-col gap-32 px-24 py-32">
						<div>
							<Typography className="text-3xl font-extrabold tracking-tight text-gray-900">
								Teacher Dashboard
							</Typography>
						</div>

						<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
							<StatCard
								icon="lucide:book-open"
								iconColor="text-blue-600"
								iconBg="bg-blue-50"
								label="Lessons Today"
								value={stats.lessonsToday}
								caption={<span><strong className="font-semibold text-gray-700">Scheduled</strong> for today</span>}
							/>
							<StatCard
								icon="lucide:check-circle"
								iconColor="text-amber-600"
								iconBg="bg-amber-50"
								label="Pending Grading"
								value={stats.pendingGrading}
								caption={<span><strong className="font-semibold text-gray-700">Requires</strong> attention</span>}
							/>
						</div>

						<div>
							<Typography className="mb-16 text-lg font-semibold text-gray-900">
								Today's Schedule
							</Typography>
							<Paper className="bg-white flex min-h-[256px] flex-auto flex-col items-center justify-center rounded-2xl p-24 text-center shadow-sm border border-gray-100 transition-all duration-200 hover:shadow-md">
								<div className="mb-16 flex h-[64px] w-[64px] items-center justify-center rounded-full bg-gray-50 text-gray-400">
									<FuseSvgIcon size={32}>lucide:calendar</FuseSvgIcon>
								</div>
								<Typography className="text-[15px] font-medium text-gray-500">
									Timetable integration coming soon.
								</Typography>
							</Paper>
						</div>
					</div>
				}
			/>
		</AuthGuardRedirect>
	);
}
