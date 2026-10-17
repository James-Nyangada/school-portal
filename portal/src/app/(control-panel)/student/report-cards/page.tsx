'use client';

import { useSession } from 'next-auth/react';
import { Typography } from '@mui/material';
import FusePageSimple from '@fuse/core/FusePageSimple';
import AuthGuardRedirect from '@auth/AuthGuardRedirect';
import ReportCardsView from '@/components/grading/ReportCardsView';

export default function StudentReportCards() {
	const { data: session } = useSession();
	const studentId = (session?.user as { id?: string } | undefined)?.id ?? '';

	return (
		<AuthGuardRedirect auth={['STUDENT']}>
			<FusePageSimple
				content={
					<div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8">
						<div>
							<Typography className="text-3xl font-extrabold tracking-tight">My Report Cards</Typography>
							<Typography color="text.secondary">
								Published termly report cards, to view or download.
							</Typography>
						</div>
						{studentId && (
							<ReportCardsView
								studentId={studentId}
								feesHref="/student/fees"
							/>
						)}
					</div>
				}
			/>
		</AuthGuardRedirect>
	);
}
