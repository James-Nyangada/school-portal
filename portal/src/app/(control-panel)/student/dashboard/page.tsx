'use client';

import { useSession } from 'next-auth/react';
import { useEffect, useState } from 'react';
import { Box, Paper, Typography, Button, CircularProgress, Alert } from '@mui/material';
import FusePageSimple from '@fuse/core/FusePageSimple';
import AuthGuardRedirect from '@auth/AuthGuardRedirect';
import FuseSvgIcon from '@fuse/core/FuseSvgIcon';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import TodayLessons from '@/components/timetable/TodayLessons';
import { StatCard } from '@/components/dashboard/StatCard';
import { BACKEND_URL } from '@/lib/backend';
import NewsletterBanner from '@/components/newsletter/NewsletterBanner';
import { downloadAssignmentFile } from '@/lib/assignments';

type TodoAssignment = {
	id: string;
	title: string;
	type: 'QUIZ' | 'FILE_UPLOAD';
	dueDate: string;
	subject?: { name?: string } | null;
	attachmentUrl?: string | null;
	attachmentName?: string | null;
};

type AttendanceSummary = {
	rate: number;
	absent: number;
	late: number;
	total: number;
};

type Notification = {
	id: string;
	title: string;
	message: string;
	link: string | null;
	createdAt: string;
};

const timeAgo = (dateStr: string) => {
	const mins = Math.round((Date.now() - new Date(dateStr).getTime()) / 60000);

	if (mins < 1) return 'just now';

	if (mins < 60) return `${mins}m ago`;

	if (mins < 1440) return `${Math.round(mins / 60)}h ago`;

	return `${Math.round(mins / 1440)}d ago`;
};

export default function StudentDashboard() {
	const { data: session, status } = useSession();
	const token = (session as any)?.backendToken;
	const studentId = (session?.user as any)?.id;
	const [loading, setLoading] = useState(true);
	const [feeStatus, setFeeStatus] = useState<any>(null);
	const [notifications, setNotifications] = useState<Notification[]>([]);
	// Open assignments the student hasn't submitted yet, soonest due first
	const [todo, setTodo] = useState<TodoAssignment[]>([]);
	const [downloadingId, setDownloadingId] = useState<string | null>(null);
	const [attendance, setAttendance] = useState<AttendanceSummary | null>(null);
	const weekAhead = Date.now() + 7 * 86400000;
	const dueThisWeek = todo.filter((a) => {
		const due = new Date(a.dueDate).getTime();
		return due >= Date.now() && due <= weekAhead;
	}).length;
	const router = useRouter();

	useEffect(() => {
		if (!token) return;

		fetch(`${BACKEND_URL}/api/notifications?unread=true`, {
			headers: { Authorization: `Bearer ${token}` }
		})
			.then((res) => (res.ok ? res.json() : []))
			.then((data) => setNotifications(Array.isArray(data) ? data : []))
			.catch((err) => console.error(err));

		fetch(`${BACKEND_URL}/api/assignments`, {
			headers: { Authorization: `Bearer ${token}` }
		})
			.then((res) => (res.ok ? res.json() : []))
			.then((data) => {
				setTodo(
					(Array.isArray(data) ? data : [])
						.filter((a: { isOpen?: boolean; submission?: unknown }) => a.isOpen !== false && !a.submission)
						.sort(
							(a: TodoAssignment, b: TodoAssignment) =>
								new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()
						)
				);
			})
			.catch((err) => console.error(err));

		// Registers taken by teachers, lesson by lesson; never fee-gated (dashboard spec §6.1). Late counts as half, as on the parent dashboard.
		fetch(`${BACKEND_URL}/api/attendance`, {
			headers: { Authorization: `Bearer ${token}` }
		})
			.then((res) => (res.ok ? res.json() : []))
			.then((data: { status: 'PRESENT' | 'ABSENT' | 'LATE' }[]) => {
				const records = Array.isArray(data) ? data : [];
				const present = records.filter((r) => r.status === 'PRESENT').length;
				const late = records.filter((r) => r.status === 'LATE').length;
				const absent = records.filter((r) => r.status === 'ABSENT').length;
				const total = records.length;
				setAttendance({
					rate: total ? Math.round(((present + late * 0.5) / total) * 100) : 0,
					absent,
					late,
					total
				});
			})
			.catch((err) => console.error(err));
	}, [token]);

	const markRead = (n: Notification) => {
		setNotifications((prev) => prev.filter((x) => x.id !== n.id));
		return fetch(`${BACKEND_URL}/api/notifications/${n.id}/read`, {
			method: 'PATCH',
			headers: { Authorization: `Bearer ${token}` }
		}).catch((err) => console.error(err));
	};

	const downloadFile = async (a: TodoAssignment) => {
		setDownloadingId(a.id);
		try {
			await downloadAssignmentFile(token, a);
		} catch (err) {
			console.error(err);
		} finally {
			setDownloadingId(null);
		}
	};

	const openNotification = async (n: Notification) => {
		await markRead(n);

		if (n.link) router.push(n.link);
	};

	useEffect(() => {
		if (status === 'loading') return;

		if (!token || !studentId) {
			setLoading(false);
			return;
		}

		setLoading(true);
		fetch(`${BACKEND_URL}/api/fees/student/${studentId}`, {
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

	// The server's fee gate (arrears + this term's threshold) decides; the statement carries its verdict
	const timetableAccess = feeStatus?.statement?.access?.timetable;
	const isLocked = timetableAccess ? !timetableAccess.allowed : false;

	return (
		<AuthGuardRedirect auth={['STUDENT']}>
			<FusePageSimple
				content={
					<div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8">
						<NewsletterBanner />

						<div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
							<div>
								<Typography className="text-[28px] leading-tight font-extrabold tracking-tight text-gray-900 sm:text-[34px]">
									Welcome back, {session?.user?.name || 'Student'}!
								</Typography>
								<Typography className="mt-1 text-[15px] font-medium text-gray-500">
									Here is your academic and fee status update.
								</Typography>
							</div>
						</div>

						{notifications.length > 0 && (
							<div className="flex flex-col gap-3">
								{notifications.map((n) => (
									<div
										key={n.id}
										role="button"
										tabIndex={0}
										onClick={() => openNotification(n)}
										onKeyDown={(e) => e.key === 'Enter' && openNotification(n)}
										className="group flex cursor-pointer items-center gap-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 shadow-sm transition-colors hover:bg-amber-100"
									>
										<div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-500 text-white">
											<FuseSvgIcon size={20}>lucide:bell-ring</FuseSvgIcon>
										</div>
										<div className="min-w-0 flex-1">
											<Typography className="truncate text-[15px] font-semibold text-amber-950">
												{n.title}
											</Typography>
											<Typography className="text-[13px] text-amber-800">
												{n.message} · {timeAgo(n.createdAt)}
											</Typography>
										</div>
										<span className="hidden items-center gap-1 text-sm font-semibold text-amber-900 sm:flex">
											Open
											<FuseSvgIcon size={16}>lucide:arrow-right</FuseSvgIcon>
										</span>
										<button
											aria-label="Dismiss"
											onClick={(e) => {
												e.stopPropagation();
												markRead(n);
											}}
											className="rounded-full p-1 text-amber-700 hover:bg-amber-200"
										>
											<FuseSvgIcon size={16}>lucide:x</FuseSvgIcon>
										</button>
									</div>
								))}
							</div>
						)}

						{isLocked && (
							<Alert
								severity="warning"
								className="items-start rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-900 shadow-sm sm:items-center"
								icon={
									<FuseSvgIcon
										className="text-amber-600"
										size={24}
									>
										lucide:triangle-alert
									</FuseSvgIcon>
								}
								action={
									<Link
										href="/student/fees"
										passHref
									>
										<Button
											color="inherit"
											size="small"
											className="rounded-lg px-4 py-1.5 font-semibold hover:bg-amber-100/50"
										>
											View Statement
										</Button>
									</Link>
								}
							>
								<Typography className="mb-2 text-[15px] font-semibold text-amber-900">
									Portal Access Restricted
								</Typography>
								<Typography className="text-[14px] text-amber-800">
									Your portal access is partially gated due to an outstanding fee balance. Please
									clear at least 50% of your term fees to unlock your Grades and Timetable.
								</Typography>
							</Alert>
						)}

						<div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
							<StatCard
								icon="lucide:percent"
								iconColor="text-blue-600"
								iconBg="bg-blue-50"
								label="Attendance"
								value={attendance?.total ? `${attendance.rate}%` : '—'}
								caption={
									attendance?.total ? (
										<span>
											<strong className="font-semibold text-gray-700">{attendance.absent}</strong>{' '}
											of {attendance.total} lessons missed
											{attendance.late > 0 ? `, ${attendance.late} late` : ''}
										</span>
									) : (
										<span>No registers taken yet</span>
									)
								}
							/>
							<StatCard
								icon="lucide:wallet"
								iconColor="text-red-600"
								iconBg="bg-red-50"
								label="Fee Balance"
								value={
									<>
										<span className="mr-1 text-xl font-bold">KES</span>
										{feeStatus?.balance?.toLocaleString() || '0'}
									</>
								}
								caption={
									<span>
										<strong className="font-semibold text-gray-700">
											{feeStatus?.totalPaid ? `KES ${feeStatus.totalPaid.toLocaleString()}` : '0'}
										</strong>{' '}
										paid so far
									</span>
								}
							/>
							<StatCard
								icon="lucide:clipboard-list"
								iconColor="text-amber-600"
								iconBg="bg-amber-50"
								label="Pending Assignments"
								value={todo.length}
								caption={
									<span>
										<strong className="font-semibold text-gray-700">{dueThisWeek}</strong> due this
										week
									</span>
								}
							/>
						</div>

						{todo.length > 0 && (
							<div>
								<div className="mb-4 flex items-center justify-between">
									<Typography className="text-lg font-semibold text-gray-900">
										Assignments To Do
									</Typography>
									<Link
										href="/student/assignments"
										className="text-sm font-semibold text-indigo-600 hover:underline"
									>
										View all
									</Link>
								</div>
								<Paper className="divide-y divide-gray-100 overflow-hidden rounded-2xl border border-gray-200 shadow-sm">
									{todo.slice(0, 5).map((a) => {
										const overdue = new Date(a.dueDate).getTime() < Date.now();
										const isFile = a.type === 'FILE_UPLOAD' && !!a.attachmentUrl;
										return (
											<div
												key={a.id}
												className="flex items-center gap-4 px-4 py-3"
											>
												<div
													className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${isFile ? 'bg-blue-50 text-blue-600' : 'bg-indigo-50 text-indigo-600'}`}
												>
													<FuseSvgIcon size={20}>
														{isFile ? 'lucide:file-down' : 'lucide:brain'}
													</FuseSvgIcon>
												</div>
												<div className="min-w-0 flex-1">
													<Typography className="truncate text-[15px] font-semibold text-gray-900">
														{a.title}
													</Typography>
													<Typography
														className={`text-[13px] ${overdue ? 'font-semibold text-red-600' : 'text-gray-500'}`}
													>
														{[a.subject?.name, isFile && 'Hand in on paper']
															.filter(Boolean)
															.join(' · ')}
														{a.subject?.name || isFile ? ' · ' : ''}
														{overdue ? 'Overdue' : 'Due'}{' '}
														{new Date(a.dueDate).toLocaleDateString('en-GB', {
															day: 'numeric',
															month: 'short'
														})}
													</Typography>
												</div>
												{isFile ? (
													<Button
														size="small"
														variant="contained"
														disabled={downloadingId === a.id}
														onClick={() => downloadFile(a)}
														startIcon={<FuseSvgIcon size={16}>lucide:download</FuseSvgIcon>}
														className="shrink-0 rounded-lg"
													>
														<span className="hidden sm:inline">
															{downloadingId === a.id ? 'Downloading…' : 'Download'}
														</span>
													</Button>
												) : (
													<Link href={`/student/assignments?open=${a.id}`}>
														<Button
															size="small"
															variant="outlined"
															className="shrink-0 rounded-lg"
														>
															Open
														</Button>
													</Link>
												)}
											</div>
										);
									})}
								</Paper>
							</div>
						)}

						<div>
							<Typography className="mb-4 text-lg font-semibold text-gray-900">
								Today's Class Timetable
							</Typography>
							{isLocked ? (
								<Paper className="flex min-h-[240px] flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-12 text-center shadow-none transition-colors hover:bg-gray-100">
									<div className="mb-2 flex h-16 w-16 items-center justify-center rounded-full bg-gray-200 text-gray-500">
										<FuseSvgIcon size={32}>lucide:lock</FuseSvgIcon>
									</div>
									<Typography className="text-xl font-bold text-gray-800">
										Timetable Locked
									</Typography>
									<Typography className="max-w-md text-[15px] text-gray-500">
										Your timetable is locked until fees are paid
										{timetableAccess?.arrears > 0
											? ', including the balance from previous terms'
											: ''}
										.{' '}
										<strong className="font-semibold text-gray-700">
											KES {Math.round(timetableAccess?.amountNeeded ?? 0).toLocaleString('en-KE')}
										</strong>{' '}
										more is needed to unlock it.
									</Typography>
									<Link
										href="/student/fees"
										passHref
									>
										<Button
											variant="contained"
											color="primary"
											className="mt-2 rounded-full px-6"
										>
											View Fees
										</Button>
									</Link>
								</Paper>
							) : (
								<TodayLessons href="/student/timetable" />
							)}
						</div>
					</div>
				}
			/>
		</AuthGuardRedirect>
	);
}
