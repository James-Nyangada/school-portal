'use client';

import { useSession } from 'next-auth/react';
import { useEffect, useState } from 'react';
import { Box, Paper, Typography, Button, CircularProgress } from '@mui/material';
import FusePageSimple from '@fuse/core/FusePageSimple';
import AuthGuardRedirect from '@auth/AuthGuardRedirect';
import FuseSvgIcon from '@fuse/core/FuseSvgIcon';
import Link from 'next/link';
import { MaterialReactTable, type MRT_ColumnDef } from 'material-react-table';

type TimetableRow = {
	timeSlot: string;
	monday: string;
	tuesday: string;
	wednesday: string;
	thursday: string;
	friday: string;
};

export default function StudentTimetable() {
	const { data: session, status } = useSession();
	const token = (session as any)?.backendToken;
	const studentId = (session?.user as any)?.id;
	const [loading, setLoading] = useState(true);
	const [feeStatus, setFeeStatus] = useState<any>(null);

	useEffect(() => {
		if (status === 'loading') return;

		if (!token || !studentId) {
			setLoading(false);
			return;
		}

		setLoading(true);

		fetch(`http://localhost:4000/api/fees/student/${studentId}`, {
			headers: { Authorization: `Bearer ${token}` }
		})
			.then((res) => res.json())
			.then((data) => {
				setFeeStatus(data);
				setLoading(false);
			})
			.catch((err) => {
				console.error(err);
				setFeeStatus({
					totalBilled: 50000,
					totalPaid: 20000,
					balance: 30000
				});
				setLoading(false);
			});
	}, [token, studentId, status]);

	if (status === 'loading' || loading) {
		return (
			<Box
				display="flex"
				justifyContent="center"
				alignItems="center"
				minHeight="100vh"
			>
				<CircularProgress />
			</Box>
		);
	}

	const percentPaid = feeStatus?.totalBilled > 0 ? (feeStatus.totalPaid / feeStatus.totalBilled) * 100 : 0;
	const isLocked = feeStatus?.totalBilled > 0 ? percentPaid < 50 : false;

	const data: TimetableRow[] = [
		{
			timeSlot: '08:00 - 08:40',
			monday: 'Math',
			tuesday: 'English',
			wednesday: 'Science',
			thursday: 'Social Studies',
			friday: 'Math'
		},
		{
			timeSlot: '08:40 - 09:20',
			monday: 'English',
			tuesday: 'Math',
			wednesday: 'Kiswahili',
			thursday: 'Science',
			friday: 'Physical Ed'
		},
		{
			timeSlot: '09:20 - 10:00',
			monday: 'Break',
			tuesday: 'Break',
			wednesday: 'Break',
			thursday: 'Break',
			friday: 'Break'
		},
		{
			timeSlot: '10:00 - 10:40',
			monday: 'Science',
			tuesday: 'Kiswahili',
			wednesday: 'Math',
			thursday: 'English',
			friday: 'Art & Craft'
		}
	];

	const columns: MRT_ColumnDef<TimetableRow>[] = [
		{ accessorKey: 'timeSlot', header: 'Time' },
		{ accessorKey: 'monday', header: 'Monday' },
		{ accessorKey: 'tuesday', header: 'Tuesday' },
		{ accessorKey: 'wednesday', header: 'Wednesday' },
		{ accessorKey: 'thursday', header: 'Thursday' },
		{ accessorKey: 'friday', header: 'Friday' }
	];

	return (
		<AuthGuardRedirect auth={['STUDENT']}>
			<FusePageSimple
				content={
					<div className="mx-auto flex w-full max-w-7xl flex-col gap-32 px-24 py-32">
						<Typography className="text-4xl font-extrabold tracking-tight">Class Timetable</Typography>

						{isLocked ? (
							<Paper className="flex min-h-360 flex-col items-center justify-center gap-16 rounded-2xl border-2 border-dashed p-48 text-center">
								<FuseSvgIcon
									size={64}
									color="disabled"
								>
									lucide:lock
								</FuseSvgIcon>
								<Typography
									variant="h6"
									fontWeight="bold"
								>
									Timetable Locked
								</Typography>
								<Typography
									color="text.secondary"
									className="max-w-400"
								>
									Your class timetable is locked because you have only cleared{' '}
									{Math.round(percentPaid)}% of your Term fees. Clear at least 50% to gain access.
								</Typography>
								<Link
									href="/student/fees"
									passHref
								>
									<Button
										variant="contained"
										color="primary"
										className="mt-8"
									>
										Pay Fees Now
									</Button>
								</Link>
							</Paper>
						) : (
							<Paper className="bg-card mt-16 flex flex-auto flex-col rounded-2xl p-24 shadow">
								<MaterialReactTable
									columns={columns}
									data={data}
									enableDensityToggle={false}
									enableFullScreenToggle={false}
									enablePagination={false}
									initialState={{ density: 'comfortable' }}
								/>
							</Paper>
						)}
					</div>
				}
			/>
		</AuthGuardRedirect>
	);
}
