'use client';

import { useSession } from 'next-auth/react';
import { Typography } from '@mui/material';
import FusePageSimple from '@fuse/core/FusePageSimple';
import AuthGuardRedirect from '@auth/AuthGuardRedirect';
import StudentGradesView from '@/components/grading/StudentGradesView';

export default function StudentGrades() {
	const { data: session } = useSession();
	const studentId = (session?.user as { id?: string } | undefined)?.id ?? null;

	return (
		<AuthGuardRedirect auth={['STUDENT']}>
			<FusePageSimple
				content={
					<div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8">
						<StudentGradesView
							studentId={studentId}
							payHref="/student/fees"
							payerNote="Your parent or guardian can also pay from their own portal."
							header={
								<Typography className="text-4xl font-extrabold tracking-tight">My Grades</Typography>
							}
						/>
					</div>
				}
			/>
		</AuthGuardRedirect>
	);
}
