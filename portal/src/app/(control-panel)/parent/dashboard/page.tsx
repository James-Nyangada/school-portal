'use client';

import { useSession } from 'next-auth/react';
import { useEffect, useState } from 'react';
import {
	Box,
	Paper,
	Typography,
	Button,
	CircularProgress,
	Alert,
	MenuItem,
	Select,
	FormControl,
	InputLabel
} from '@mui/material';
import FusePageSimple from '@fuse/core/FusePageSimple';
import AuthGuardRedirect from '@auth/AuthGuardRedirect';
import FuseSvgIcon from '@fuse/core/FuseSvgIcon';
import Link from 'next/link';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { StatCard } from '@/components/dashboard/StatCard';
import { BACKEND_URL } from '@/lib/backend';
import NewsletterBanner from '@/components/newsletter/NewsletterBanner';
import { formatKES } from '@/lib/finance';

interface FeeStatus {
	totalBilled: number;
	amountPaid: number;
	balance: number;
	percentPaid: number;
}

interface GradeRow {
	subject: string;
	term: string;
	value: string;
	teacherComment: string;
}

interface AttendanceSummary {
	present: number;
	absent: number;
	late: number;
	total: number;
	rate: number;
}

interface ApiFeeResponse {
	totalBilled: number;
	totalPaid: number;
	balance: number;
}

interface ApiGradeResponse {
	subject?: { name?: string } | string;
	term?: string;
	value: string;
	teacherComment?: string;
}

interface ApiAttendanceResponse {
	status: string;
	lesson?: string;
	date: string;
}

type Child = { id: string; name: string; rawName: string; grade: string };

function getGreeting(): string {
	const hour = new Date().getHours();

	if (hour < 12) return 'Good morning';

	if (hour < 17) return 'Good afternoon';

	return 'Good evening';
}

export default function ParentDashboard() {
	const { data: session } = useSession();
	const token = (session as { backendToken?: string } | null)?.backendToken;
	const parentFirstName = session?.user?.name?.split(' ')[0] || 'there';

	const [children, setChildren] = useState<Child[] | null>(null);
	const [childrenError, setChildrenError] = useState(false);
	const [selectedChildId, setSelectedChildId] = useState<string>('');

	const [loading, setLoading] = useState(true);
	const [dataError, setDataError] = useState(false);
	const [feeStatus, setFeeStatus] = useState<FeeStatus | null>(null);
	const [grades, setGrades] = useState<GradeRow[]>([]);
	// The server's fee gate (threshold set in System Settings) refused the grades
	const [gradesGated, setGradesGated] = useState(false);
	const [attendanceSummary, setAttendanceSummary] = useState<AttendanceSummary | null>(null);

	const handleChildChange = (id: string) => {
		setSelectedChildId(id);

		try {
			localStorage.setItem('parent_selected_child_id', id);
		} catch {
			// Storage unavailable: the selection just isn't remembered
		}
	};

	useEffect(() => {
		if (!token) return;

		fetch(`${BACKEND_URL}/api/users/me`, {
			headers: { Authorization: `Bearer ${token}` }
		})
			.then((res) => {
				if (!res.ok) throw new Error(`Failed to load your children (${res.status})`);

				return res.json();
			})
			.then((data) => {
				const links: {
					student: {
						id: string;
						firstName: string | null;
						lastName: string | null;
						admissionNumber: string | null;
						class: { name: string } | null;
					};
				}[] = data.parentLinks ?? [];
				const linked: Child[] = links.map((link) => ({
					id: link.student.id,
					name: `${link.student.firstName} ${link.student.lastName} (${link.student.admissionNumber || 'N/A'})`,
					rawName: `${link.student.firstName} ${link.student.lastName}`,
					grade: link.student.class?.name || 'N/A'
				}));
				setChildren(linked);
				setChildrenError(false);

				let savedId: string | null = null;
				try {
					savedId = localStorage.getItem('parent_selected_child_id');
				} catch {
					savedId = null;
				}
				setSelectedChildId(linked.find((c) => c.id === savedId)?.id ?? linked[0]?.id ?? '');

				if (linked.length === 0) setLoading(false);
			})
			.catch((err) => {
				console.error(err);
				setChildrenError(true);
				setLoading(false);
			});
	}, [token]);

	useEffect(() => {
		if (!token || !selectedChildId) return;

		let active = true;
		setLoading(true);
		setDataError(false);

		const get = (path: string) =>
			fetch(`${BACKEND_URL}${path}`, {
				headers: { Authorization: `Bearer ${token}` }
			});

		const loadData = async () => {
			try {
				const [feeRes, gradeRes, attRes] = await Promise.all([
					get(`/api/fees/student/${selectedChildId}`),
					get(`/api/grades?studentId=${selectedChildId}`),
					// Attendance is never fee-gated (dashboard spec §5.5)
					get(`/api/attendance?studentId=${selectedChildId}`)
				]);
				const feeData = feeRes.ok ? ((await feeRes.json()) as ApiFeeResponse) : null;
				const gradeData = gradeRes.ok ? ((await gradeRes.json()) as ApiGradeResponse[]) : null;
				const attRecords = attRes.ok ? ((await attRes.json()) as ApiAttendanceResponse[]) : null;

				if (!active) return;

				setFeeStatus(
					feeData && typeof feeData.balance === 'number'
						? {
								totalBilled: feeData.totalBilled,
								amountPaid: feeData.totalPaid,
								balance: feeData.balance,
								percentPaid:
									feeData.totalBilled > 0 ? (feeData.totalPaid / feeData.totalBilled) * 100 : 100
							}
						: null
				);

				// 402 = grades locked by unpaid fees
				setGradesGated(gradeRes.status === 402 || gradeRes.status === 403);
				setGrades(
					Array.isArray(gradeData)
						? gradeData.map((g) => ({
								subject:
									typeof g.subject === 'object' && g.subject
										? g.subject.name || 'Unknown'
										: (g.subject as string) || 'Unknown',
								term: g.term || '',
								value: g.value,
								teacherComment: g.teacherComment || ''
							}))
						: []
				);

				if (Array.isArray(attRecords) && attRecords.length > 0) {
					const total = attRecords.length;
					const present = attRecords.filter((r) => r.status === 'PRESENT').length;
					const late = attRecords.filter((r) => r.status === 'LATE').length;
					const absent = attRecords.filter((r) => r.status === 'ABSENT').length;
					// Late counts as half, as on the student dashboard
					setAttendanceSummary({
						present,
						absent,
						late,
						total,
						rate: Math.round(((present + late * 0.5) / total) * 100)
					});
				} else {
					setAttendanceSummary(null);
				}

				setDataError(
					!feeRes.ok || !attRes.ok || (!gradeRes.ok && gradeRes.status !== 402 && gradeRes.status !== 403)
				);
			} catch (err) {
				console.error('Error fetching student data:', err);

				if (active) {
					setFeeStatus(null);
					setGrades([]);
					setAttendanceSummary(null);
					setDataError(true);
				}
			} finally {
				if (active) setLoading(false);
			}
		};

		loadData();
		return () => {
			active = false;
		};
	}, [selectedChildId, token]);

	// Calculate grade average
	const numericGrades = grades.map((g) => parseFloat(g.value)).filter((val) => !isNaN(val));
	const gradeAverage =
		numericGrades.length > 0
			? (numericGrades.reduce((sum, val) => sum + val, 0) / numericGrades.length).toFixed(1)
			: null;

	// Gating status
	const isLocked = gradesGated;
	const currentChildName = children?.find((c) => c.id === selectedChildId)?.rawName || 'Child';

	const chartData = grades.map((g) => ({
		subject: g.subject.substring(0, 10) + (g.subject.length > 10 ? '..' : ''),
		score: parseFloat(g.value) || 0
	}));

	const renderContent = () => {
		if (childrenError || (children && children.length === 0)) {
			return (
				<Box
					display="flex"
					flexDirection="column"
					justifyContent="center"
					alignItems="center"
					minHeight="400px"
					gap={1}
					textAlign="center"
				>
					<FuseSvgIcon
						size={48}
						className="text-gray-400"
					>
						{childrenError ? 'lucide:cloud-off' : 'lucide:users'}
					</FuseSvgIcon>
					<Typography className="text-lg font-semibold">
						{childrenError ? "Couldn't load your children" : 'No children are linked to your account yet'}
					</Typography>
					<Typography color="text.secondary">
						{childrenError
							? 'Check your connection and refresh the page.'
							: "Contact the school office and they'll link your child's profile to this account."}
					</Typography>
				</Box>
			);
		}

		if (loading || !children) {
			return (
				<Box
					display="flex"
					justifyContent="center"
					alignItems="center"
					minHeight="400px"
				>
					<CircularProgress />
				</Box>
			);
		}

		return (
			<>
				{/* Top Header & Child Selector */}
				<div className="flex flex-col items-start justify-between gap-4 border-b border-gray-100 pb-4 md:flex-row md:items-center">
					<div>
						<Typography className="text-4xl font-extrabold tracking-tight">
							{getGreeting()}, {parentFirstName}! 👋
						</Typography>
						<Typography className="text-secondary mt-1 text-lg font-medium">
							Academic updates, fees, and attendance summaries for your children.
						</Typography>
					</div>

					<FormControl
						variant="outlined"
						className="min-w-[240px] rounded-lg bg-white shadow-sm"
					>
						<InputLabel id="child-select-label">Viewing Profile For</InputLabel>
						<Select
							labelId="child-select-label"
							id="child-select"
							value={selectedChildId}
							label="Viewing Profile For"
							onChange={(e) => handleChildChange(e.target.value as string)}
							className="rounded-lg"
						>
							{children.map((child) => (
								<MenuItem
									key={child.id}
									value={child.id}
								>
									{child.name}
								</MenuItem>
							))}
						</Select>
					</FormControl>
				</div>

				{dataError && (
					<Alert
						severity="error"
						className="rounded-xl"
					>
						Some of {currentChildName}&apos;s information couldn&apos;t be loaded. Refresh the page to try
						again.
					</Alert>
				)}

				{/* Fee Statement Banners */}
				{feeStatus && feeStatus.balance > 0 && (
					<Alert
						severity={isLocked ? 'error' : 'warning'}
						icon={<FuseSvgIcon size={22}>{isLocked ? 'lucide:lock' : 'lucide:wallet'}</FuseSvgIcon>}
						className="items-center rounded-xl border border-solid px-4 py-3"
						sx={{
							borderColor: isLocked ? 'error.light' : 'warning.light',
							'& .MuiAlert-icon': {
								alignSelf: 'flex-start',
								mt: '2px',
								opacity: 1
							},
							'& .MuiAlert-message': { flex: 1, minWidth: 0, py: 0 },
							'& .MuiAlert-action': {
								alignItems: 'center',
								p: 0,
								ml: 2,
								mr: 0
							}
						}}
						action={
							<Button
								component={Link}
								href="/parent/fees"
								variant="contained"
								color={isLocked ? 'error' : 'warning'}
								size="small"
								disableElevation
								className="shrink-0 rounded-lg px-4 font-semibold whitespace-nowrap"
								startIcon={<FuseSvgIcon size={16}>lucide:credit-card</FuseSvgIcon>}
							>
								Pay Now
							</Button>
						}
					>
						<div className="flex flex-col gap-0.5">
							<Typography
								variant="subtitle2"
								className="font-bold"
							>
								{isLocked ? 'Academic portal locked' : 'Outstanding fee balance'}
							</Typography>
							<Typography
								variant="body2"
								color="text.secondary"
							>
								{isLocked
									? 'Grades and timetable are locked until the required share of fees is cleared.'
									: 'There is a pending fee balance due for this term.'}{' '}
								Balance:{' '}
								<Typography
									component="span"
									variant="body2"
									className="font-semibold"
									color="text.primary"
								>
									{formatKES(feeStatus.balance)}
								</Typography>
							</Typography>
						</div>
					</Alert>
				)}

				{/* Main Metrics Overview */}
				<div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
					<StatCard
						icon="lucide:calendar"
						iconColor="text-blue-600"
						iconBg="bg-blue-50"
						label="Attendance Rate"
						value={attendanceSummary ? `${attendanceSummary.rate}%` : '—'}
						caption={
							attendanceSummary ? (
								<span>
									<strong className="font-semibold text-gray-700">{attendanceSummary.present}</strong>{' '}
									present /{' '}
									<strong className="font-semibold text-gray-700">{attendanceSummary.absent}</strong>{' '}
									absent
								</span>
							) : (
								<span>No attendance recorded yet</span>
							)
						}
					/>

					<StatCard
						icon="lucide:wallet"
						iconColor={feeStatus && feeStatus.balance > 0 ? 'text-red-600' : 'text-green-600'}
						iconBg={feeStatus && feeStatus.balance > 0 ? 'bg-red-50' : 'bg-green-50'}
						label="Outstanding Balance"
						value={
							<>
								<span className="mr-1 text-xl font-bold">KES</span>
								{feeStatus?.balance?.toLocaleString() || '0'}
							</>
						}
						caption={
							<span>
								Cleared{' '}
								<strong className="font-semibold text-gray-700">
									{Math.round(feeStatus?.percentPaid || 0)}%
								</strong>{' '}
								of billed fees
							</span>
						}
					/>

					<StatCard
						icon="lucide:graduation-cap"
						iconColor="text-teal-600"
						iconBg="bg-teal-50"
						label="Latest Term Average"
						value={
							isLocked ? (
								<span className="text-xl font-medium text-gray-400">Locked</span>
							) : gradeAverage ? (
								`${gradeAverage}%`
							) : (
								'N/A'
							)
						}
						caption={
							isLocked ? (
								<span className="italic">Clear fees to unlock</span>
							) : (
								<span>
									Based on{' '}
									<strong className="font-semibold text-gray-700">{numericGrades.length}</strong>{' '}
									graded subjects
								</span>
							)
						}
					/>
				</div>

				{/* Charts & Subject Breakdown */}
				<div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
					<div className="lg:col-span-7">
						<Paper className="flex h-[400px] flex-auto flex-col rounded-3xl bg-white p-6 shadow-[0_1px_3px_rgba(0,0,0,0.06),0_1px_2px_rgba(0,0,0,0.04)]">
							<Typography className="mb-4 text-lg font-bold text-gray-900">
								Subject Grade Performance
							</Typography>
							{isLocked ? (
								<div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-xl bg-slate-50 p-4 text-center">
									<FuseSvgIcon
										size={48}
										className="text-slate-400"
									>
										lucide:lock
									</FuseSvgIcon>
									<Typography className="font-semibold text-slate-700">
										Performance Chart Gated
									</Typography>
									<Typography className="text-secondary max-w-[320px] text-lg">
										Clear the required share of fees to see {currentChildName}'s performance chart.
									</Typography>
								</div>
							) : chartData.length === 0 ? (
								<div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-xl bg-slate-50 p-4 text-center">
									<FuseSvgIcon
										size={48}
										className="text-slate-400"
									>
										lucide:clipboard-list
									</FuseSvgIcon>
									<Typography className="text-secondary">No data available yet</Typography>
								</div>
							) : (
								<div className="min-h-0 flex-1">
									<ResponsiveContainer
										width="100%"
										height="100%"
									>
										<BarChart
											data={chartData}
											margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
										>
											<CartesianGrid
												strokeDasharray="3 3"
												vertical={false}
												stroke="#E2E8F0"
											/>
											<XAxis
												dataKey="subject"
												tick={{ fill: '#64748B', fontSize: 12 }}
												axisLine={false}
												tickLine={false}
											/>
											<YAxis
												domain={[0, 100]}
												tick={{ fill: '#64748B', fontSize: 12 }}
												axisLine={false}
												tickLine={false}
											/>
											<Tooltip
												contentStyle={{
													borderRadius: 12,
													border: '1px solid #E2E8F0',
													boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'
												}}
												formatter={(value) => [`${value}%`, 'Score']}
											/>
											<Bar
												dataKey="score"
												fill="#3B82F6"
												radius={[6, 6, 0, 0]}
												barSize={36}
											/>
										</BarChart>
									</ResponsiveContainer>
								</div>
							)}
						</Paper>
					</div>

					<div className="lg:col-span-5">
						<Paper className="flex h-[400px] flex-auto flex-col overflow-hidden rounded-3xl bg-white p-6 shadow-[0_1px_3px_rgba(0,0,0,0.06),0_1px_2px_rgba(0,0,0,0.04)]">
							<Typography className="mb-4 text-lg font-bold text-gray-900">
								Academic & Activities Overview
							</Typography>
							<div className="flex flex-1 flex-col gap-3 overflow-y-auto pr-1">
								<div className="flex items-start gap-3 rounded-xl border border-gray-100 p-4 transition-colors duration-150 hover:bg-slate-50">
									<div className="rounded-lg bg-indigo-50 p-2 text-indigo-500">
										<FuseSvgIcon size={20}>lucide:book-open</FuseSvgIcon>
									</div>
									<div className="flex-1">
										<Typography className="text-sm font-semibold text-slate-700">
											Current Class Grade
										</Typography>
										<Typography className="text-secondary mt-0.5 text-lg">
											{currentChildName} is registered in{' '}
											{children.find((c) => c.id === selectedChildId)?.grade || 'N/A'}.
										</Typography>
									</div>
								</div>

								<div className="flex items-start gap-3 rounded-xl border border-gray-100 p-4 transition-colors duration-150 hover:bg-slate-50">
									<div className="rounded-lg bg-amber-50 p-2 text-amber-500">
										<FuseSvgIcon size={20}>lucide:circle-alert</FuseSvgIcon>
									</div>
									<div className="flex-1">
										<Typography className="text-sm font-semibold text-slate-700">
											Important Note
										</Typography>
										<Typography className="text-secondary mt-0.5 text-lg">
											Report cards will be published at the end of the term. Please ensure all
											fees are cleared to avoid grading lockouts.
										</Typography>
									</div>
								</div>

								<div className="flex items-start gap-3 rounded-xl border border-gray-100 p-4 transition-colors duration-150 hover:bg-slate-50">
									<div className="rounded-lg bg-emerald-50 p-2 text-emerald-500">
										<FuseSvgIcon size={20}>lucide:square-check</FuseSvgIcon>
									</div>
									<div className="flex-1">
										<Typography className="text-sm font-semibold text-slate-700">
											Action Required
										</Typography>
										<Typography className="text-secondary mt-0.5 text-lg">
											Verify that all student details, passport photos, and health notes are
											up-to-date in their academic profile.
										</Typography>
									</div>
								</div>
							</div>
						</Paper>
					</div>
				</div>
			</>
		);
	};

	return (
		<AuthGuardRedirect auth={['PARENT']}>
			<FusePageSimple
				content={
					<div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-8 bg-[#F8F9FA] px-6 py-8">
						<NewsletterBanner />
						{renderContent()}
					</div>
				}
			/>
		</AuthGuardRedirect>
	);
}
