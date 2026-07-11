'use client';

import { useSession } from 'next-auth/react';
import { useEffect, useState } from 'react';
import { Box, Paper, Typography, Button, CircularProgress, Alert } from '@mui/material';
import FusePageSimple from '@fuse/core/FusePageSimple';
import AuthGuardRedirect from '@auth/AuthGuardRedirect';
import FuseSvgIcon from '@fuse/core/FuseSvgIcon';
import Link from 'next/link';
import { StatCard } from '@/components/dashboard/StatCard';

export default function StudentDashboard() {
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
				// Fallback mock values
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

	return (
		<AuthGuardRedirect auth={['STUDENT']}>
			<FusePageSimple
				content={
					<div className="mx-auto flex w-full max-w-7xl flex-col gap-32 px-24 py-32">
						<div className="flex flex-col items-start justify-between gap-16 sm:flex-row sm:items-center">
							<div>
								<Typography className="text-[32px] sm:text-[40px] font-extrabold tracking-tight leading-tight text-gray-900">
									Welcome back, {session?.user?.name || 'Student'}!
								</Typography>
								<Typography className="text-[15px] text-gray-500 mt-8 font-medium">
									Here is your academic and fee status update.
								</Typography>
							</div>
						</div>

						{isLocked && (
							<Alert
								severity="warning"
								className="rounded-2xl shadow-sm border border-amber-200 bg-amber-50 text-amber-900 items-start sm:items-center px-16 py-12"
								icon={
									<FuseSvgIcon className="text-amber-600" size={24}>
										lucide:alert-triangle
									</FuseSvgIcon>
								}
								action={
									<Link href="/student/fees" passHref>
										<Button color="inherit" size="small" className="font-semibold px-16 py-6 rounded-lg hover:bg-amber-100/50">
											View Statement
										</Button>
									</Link>
								}
							>
								<Typography className="font-semibold text-[15px] mb-2 text-amber-900">
									Portal Access Restricted
								</Typography>
								<Typography className="text-[14px] text-amber-800">
									Your portal access is partially gated due to an outstanding fee balance. Please clear at least 50% of your term fees to unlock your Grades and Timetable.
								</Typography>
							</Alert>
						)}

						<div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
							<StatCard
								icon="lucide:percent"
								iconColor="text-blue-600"
								iconBg="bg-blue-50"
								label="Attendance"
								value="94%"
								caption={<span><strong className="font-semibold text-gray-700">6%</strong> missed classes</span>}
							/>
							<StatCard
								icon="lucide:wallet"
								iconColor="text-red-600"
								iconBg="bg-red-50"
								label="Fee Balance"
								value={<><span className="text-xl font-bold mr-1">KES</span>{feeStatus?.balance?.toLocaleString() || '0'}</>}
								caption={<span><strong className="font-semibold text-gray-700">{feeStatus?.totalPaid ? `KES ${feeStatus.totalPaid.toLocaleString()}` : '0'}</strong> paid so far</span>}
							/>
							<StatCard
								icon="lucide:clipboard-list"
								iconColor="text-amber-600"
								iconBg="bg-amber-50"
								label="Pending Assignments"
								value="3"
								caption={<span><strong className="font-semibold text-gray-700">2</strong> due this week</span>}
							/>
						</div>

						<div>
							<Typography className="mb-16 text-lg font-semibold text-gray-900">Today's Class Timetable</Typography>
							{isLocked ? (
								<Paper className="flex min-h-[240px] flex-col items-center justify-center gap-16 rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-48 text-center shadow-none transition-colors hover:bg-gray-100">
									<div className="w-64 h-64 rounded-full bg-gray-200 flex items-center justify-center text-gray-500 mb-8">
										<FuseSvgIcon size={32}>lucide:lock</FuseSvgIcon>
									</div>
									<Typography className="text-xl font-bold text-gray-800">
										Timetable Locked
									</Typography>
									<Typography className="text-[15px] text-gray-500 max-w-md">
										Your timetable is locked because you have only cleared <strong className="font-semibold text-gray-700">{Math.round(percentPaid)}%</strong> of your Term fees. Clear at least 50% to gain access.
									</Typography>
									<Link href="/student/fees" passHref>
										<Button
											variant="contained"
											color="primary"
											className="mt-8 rounded-full px-24"
										>
											View Fees
										</Button>
									</Link>
								</Paper>
							) : (
								<Paper className="flex min-h-[240px] flex-col items-center justify-center rounded-2xl p-48 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.06),0_1px_2px_rgba(0,0,0,0.04)] text-center">
									<div className="w-64 h-64 rounded-full bg-gray-50 flex items-center justify-center text-gray-400 mb-16">
										<FuseSvgIcon size={32}>lucide:calendar-x</FuseSvgIcon>
									</div>
									<Typography className="text-lg font-semibold text-gray-700">
										No classes scheduled for today
									</Typography>
									<Typography className="text-[14px] text-gray-500 mt-4 max-w-sm">
										Enjoy your free time or use it to catch up on assignments.
									</Typography>
								</Paper>
							)}
						</div>
					</div>
				}
			/>
		</AuthGuardRedirect>
	);
}
