'use client';

import { Typography } from '@mui/material';
import FusePageSimple from '@fuse/core/FusePageSimple';
import AuthGuardRedirect from '@auth/AuthGuardRedirect';
import MyTimetable from '@/components/timetable/MyTimetable';

export default function StudentTimetable() {
	return (
		<AuthGuardRedirect auth={['STUDENT']}>
			<FusePageSimple
				content={
					<div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-8">
						<div>
							<Typography className="text-4xl font-extrabold tracking-tight">My Timetable</Typography>
							<Typography
								color="text.secondary"
								className="mt-1"
							>
								Your class timetable for this term. The current period is outlined in blue.
							</Typography>
						</div>
						<MyTimetable />
					</div>
				}
			/>
		</AuthGuardRedirect>
	);
}
