'use client';

import { Typography } from '@mui/material';
import FusePageSimple from '@fuse/core/FusePageSimple';
import AuthGuardRedirect from '@auth/AuthGuardRedirect';
import MyTimetable from '@/components/timetable/MyTimetable';
import TodayLessons from '@/components/timetable/TodayLessons';

export default function TeacherTimetable() {
	return (
		<AuthGuardRedirect auth={['TEACHER']}>
			<FusePageSimple
				content={
					<div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-8">
						<div>
							<Typography className="text-4xl font-extrabold tracking-tight">My Timetable</Typography>
							<Typography
								color="text.secondary"
								className="mt-1"
							>
								Your teaching timetable. Cover duties for today appear in the list below.
							</Typography>
						</div>
						<MyTimetable title="My teaching week" />
						<div className="max-w-xl">
							<TodayLessons href="/teacher/timetable" />
						</div>
					</div>
				}
			/>
		</AuthGuardRedirect>
	);
}
