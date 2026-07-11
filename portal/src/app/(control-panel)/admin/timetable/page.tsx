'use client';

import { Typography, Paper, Alert } from '@mui/material';
import FusePageSimple from '@fuse/core/FusePageSimple';
import AuthGuardRedirect from '@auth/AuthGuardRedirect';
import FuseSvgIcon from '@fuse/core/FuseSvgIcon';

export default function AdminTimetable() {
	return (
		<AuthGuardRedirect auth={['SUPER_ADMIN', 'ADMIN']}>
			<FusePageSimple
				header={
					<div className="flex w-full flex-col px-24 pt-24">
						<Typography className="text-4xl font-extrabold tracking-tight">Timetable Builder</Typography>
						<Typography
							variant="body2"
							color="textSecondary"
							className="mt-8"
						>
							Drag and drop builder coming soon.
						</Typography>
					</div>
				}
				content={
					<div className="mx-auto flex min-h-[500px] w-full max-w-7xl flex-col items-center justify-center gap-32 px-24 py-32">
						<Paper className="bg-card flex w-full max-w-[500px] flex-auto flex-col items-center rounded-2xl p-32 text-center shadow">
							<FuseSvgIcon
								size={64}
								className="mb-16 text-gray-400"
							>
								lucide:calendar-days
							</FuseSvgIcon>
							<Typography
								variant="h6"
								className="mb-8"
							>
								Timetable Module Under Construction
							</Typography>
							<Typography
								variant="body2"
								color="textSecondary"
								className="mb-24"
							>
								The drag-and-drop timetable builder is scheduled for Phase 2. This will allow visual
								slot assignment, clash detection, and teacher availability tracking.
							</Typography>
							<Alert
								severity="info"
								className="w-full text-left"
							>
								Currently displaying UI mockup only.
							</Alert>
						</Paper>
					</div>
				}
			/>
		</AuthGuardRedirect>
	);
}
