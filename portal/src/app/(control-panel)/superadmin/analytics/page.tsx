'use client';

import { useSession } from 'next-auth/react';
import { useEffect, useState, useCallback } from 'react';
import { Box, Paper, Typography, Grid, CircularProgress, Alert, Card, CardContent, Chip } from '@mui/material';
import FusePageSimple from '@fuse/core/FusePageSimple';
import AuthGuardRedirect from '@auth/AuthGuardRedirect';
import FuseSvgIcon from '@fuse/core/FuseSvgIcon';
import {
	BarChart,
	Bar,
	XAxis,
	YAxis,
	CartesianGrid,
	Tooltip,
	ResponsiveContainer,
	RadarChart,
	Radar,
	PolarGrid,
	PolarAngleAxis,
	PolarRadiusAxis,
	AreaChart,
	Area,
	PieChart,
	Pie,
	Cell,
	Legend
} from 'recharts';

/* ─── Mock / Fallback Data ─── */
const MOCK_SUMMARY = {
	totalStudents: 1248,
	totalTeachers: 87,
	attendanceRate: 94.2,
	feeCollectionRate: 78.5
};

const MOCK_PERFORMANCE = [
	{ subject: 'Mathematics', avgScore: 72 },
	{ subject: 'English', avgScore: 81 },
	{ subject: 'Science', avgScore: 68 },
	{ subject: 'History', avgScore: 77 },
	{ subject: 'Geography', avgScore: 74 },
	{ subject: 'Art', avgScore: 88 },
	{ subject: 'ICT', avgScore: 79 }
];

const MOCK_ATTENDANCE = {
	daily: [
		{ date: 'Mon 16 Jun', rate: 96 },
		{ date: 'Tue 17 Jun', rate: 94 },
		{ date: 'Wed 18 Jun', rate: 91 },
		{ date: 'Thu 19 Jun', rate: 93 },
		{ date: 'Fri 20 Jun', rate: 88 },
		{ date: 'Mon 23 Jun', rate: 95 },
		{ date: 'Tue 24 Jun', rate: 97 },
		{ date: 'Wed 25 Jun', rate: 92 },
		{ date: 'Thu 26 Jun', rate: 90 },
		{ date: 'Fri 27 Jun', rate: 85 },
		{ date: 'Mon 30 Jun', rate: 94 },
		{ date: 'Tue 01 Jul', rate: 96 }
	],
	byDay: [
		{ day: 'Mon', rate: 95 },
		{ day: 'Tue', rate: 96 },
		{ day: 'Wed', rate: 92 },
		{ day: 'Thu', rate: 91 },
		{ day: 'Fri', rate: 87 }
	]
};

const MOCK_FEES = {
	totalBilled: 12500000,
	totalCollected: 9812500,
	outstanding: 2687500,
	debtorCount: 142,
	collected: 9812500,
	terms: [
		{ term: 'Term 1', billed: 4200000, collected: 3900000 },
		{ term: 'Term 2', billed: 4300000, collected: 3712500 },
		{ term: 'Term 3', billed: 4000000, collected: 2200000 }
	]
};

const CHART_COLORS = ['#6366f1', '#22d3ee', '#f59e0b', '#ef4444', '#10b981', '#8b5cf6', '#ec4899'];
const PIE_COLORS = ['#10b981', '#ef4444'];

/* ─── Helpers ─── */
function formatCurrency(v: number) {
	if (v >= 1_000_000) return `₦${(v / 1_000_000).toFixed(1)}M`;

	if (v >= 1_000) return `₦${(v / 1_000).toFixed(0)}K`;

	return `₦${v}`;
}

export default function SuperAdminAnalytics() {
	const { data: session } = useSession();
	const token = (session as any)?.backendToken;

	const [loading, setLoading] = useState(true);
	const [demoMode, setDemoMode] = useState(false);
	const [summary, setSummary] = useState<any>(null);
	const [performance, setPerformance] = useState<any[]>([]);
	const [attendance, setAttendance] = useState<any>(null);
	const [fees, setFees] = useState<any>(null);

	const fetchEndpoint = useCallback(
		async (url: string) => {
			const res = await fetch(url, {
				headers: {
					Authorization: `Bearer ${token}`,
					'Cache-Control': 'no-cache',
					Pragma: 'no-cache'
				}
			});

			if (!res.ok) throw new Error(`${res.status}`);

			return res.json();
		},
		[token]
	);

	useEffect(() => {
		if (!token) return;

		let anyFailed = false;

		const load = async () => {
			// Summary
			try {
				const d = await fetchEndpoint('http://localhost:4000/api/analytics/summary');
				setSummary(d);
			} catch {
				anyFailed = true;
				setSummary(MOCK_SUMMARY);
			}

			// Performance
			try {
				const d = await fetchEndpoint('http://localhost:4000/api/analytics/performance');
				setPerformance(Array.isArray(d) ? d : d.subjects || d.data || []);
			} catch {
				anyFailed = true;
				setPerformance(MOCK_PERFORMANCE);
			}

			// Attendance
			try {
				const d = await fetchEndpoint('http://localhost:4000/api/analytics/attendance');
				setAttendance(d);
			} catch {
				anyFailed = true;
				setAttendance(MOCK_ATTENDANCE);
			}

			// Fees
			try {
				const d = await fetchEndpoint('http://localhost:4000/api/analytics/fees');
				setFees(d);
			} catch {
				anyFailed = true;
				setFees(MOCK_FEES);
			}

			if (anyFailed) setDemoMode(true);

			setLoading(false);
		};

		load();
	}, [token, fetchEndpoint]);

	/* ─── Summary cards config ─── */
	const summaryCards = summary
		? [
				{
					label: 'Total Students',
					value: summary.totalStudents?.toLocaleString() ?? '—',
					icon: 'lucide:users',
					gradient: 'linear-gradient(135deg, #6366f1 0%, #818cf8 100%)',
					text: '#fff'
				},
				{
					label: 'Total Teachers',
					value: summary.totalTeachers?.toLocaleString() ?? '—',
					icon: 'lucide:book-open',
					gradient: 'linear-gradient(135deg, #0ea5e9 0%, #38bdf8 100%)',
					text: '#fff'
				},
				{
					label: 'Attendance Rate',
					value: `${summary.attendanceRate ?? 0}%`,
					icon: 'lucide:calendar-check',
					gradient: 'linear-gradient(135deg, #10b981 0%, #34d399 100%)',
					text: '#fff'
				},
				{
					label: 'Fee Collection',
					value: `${summary.feeCollectionRate ?? 0}%`,
					icon: 'lucide:wallet',
					gradient: 'linear-gradient(135deg, #f59e0b 0%, #fbbf24 100%)',
					text: '#fff'
				}
			]
		: [];

	/* ─── Radar data ─── */
	const radarData = performance.map((p: any) => ({
		subject: p.subject,
		score: p.avgScore ?? p.score ?? p.average ?? 0,
		fullMark: 100
	}));

	/* ─── Pie data for fees ─── */
	const feePieData = fees
		? [
				{ name: 'Collected', value: fees.totalCollected ?? fees.collected ?? 0 },
				{ name: 'Outstanding', value: fees.outstanding ?? 0 }
			]
		: [];

	/* ─── Fee stat cards ─── */
	const feeStatCards = fees
		? [
				{ label: 'Total Billed', value: formatCurrency(fees.totalBilled ?? 0), color: '#6366f1' },
				{
					label: 'Total Collected',
					value: formatCurrency(fees.totalCollected ?? fees.collected ?? 0),
					color: '#10b981'
				},
				{ label: 'Outstanding', value: formatCurrency(fees.outstanding ?? 0), color: '#ef4444' },
				{ label: 'Debtor Count', value: (fees.debtorCount ?? 0).toLocaleString(), color: '#f59e0b' }
			]
		: [];

	if (loading) {
		return (
			<AuthGuardRedirect auth={['SUPER_ADMIN']}>
				<FusePageSimple
					content={
						<Box
							display="flex"
							justifyContent="center"
							alignItems="center"
							minHeight="600px"
						>
							<CircularProgress />
						</Box>
					}
				/>
			</AuthGuardRedirect>
		);
	}

	return (
		<AuthGuardRedirect auth={['SUPER_ADMIN']}>
			<FusePageSimple
				header={
					<Box
						sx={{
							width: '100%',
							px: 3,
							py: 4,
							background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 50%, #a855f7 100%)',
							color: '#fff'
						}}
					>
						<Box
							display="flex"
							alignItems="center"
							gap={2}
						>
							<FuseSvgIcon
								size={32}
								sx={{ color: '#fff' }}
							>
								lucide:bar-chart-3
							</FuseSvgIcon>
							<Box>
								<Typography
									variant="h4"
									fontWeight={800}
								>
									Analytics Dashboard
								</Typography>
								<Typography
									variant="body2"
									sx={{ opacity: 0.85 }}
								>
									Comprehensive school performance insights
								</Typography>
							</Box>
						</Box>
					</Box>
				}
				content={
					<Box sx={{ p: 3, display: 'flex', flexDirection: 'column', gap: 3, width: '100%' }}>
						{/* Demo mode banner */}
						{demoMode && (
							<Alert
								severity="info"
								variant="outlined"
								icon={<FuseSvgIcon size={20}>lucide:flask-conical</FuseSvgIcon>}
								sx={{ borderRadius: 2 }}
							>
								Some analytics endpoints are unavailable — displaying sample data for demonstration.
							</Alert>
						)}

						{/* ── 1. Summary Cards ── */}
						<Grid
							container
							spacing={3}
						>
							{summaryCards.map((card) => (
								<Grid
									key={card.label}
									size={{ xs: 12, sm: 6, md: 3 }}
								>
									<Card
										sx={{
											borderRadius: 3,
											boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
											background: card.gradient,
											color: card.text,
											transition: 'transform 0.2s',
											'&:hover': {
												transform: 'translateY(-4px)',
												boxShadow: '0 8px 30px rgba(0,0,0,0.15)'
											}
										}}
									>
										<CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
											<Box
												sx={{
													bgcolor: 'rgba(255,255,255,0.2)',
													borderRadius: 2,
													p: 1.5,
													display: 'flex'
												}}
											>
												<FuseSvgIcon
													size={28}
													sx={{ color: '#fff' }}
												>
													{card.icon}
												</FuseSvgIcon>
											</Box>
											<Box>
												<Typography
													variant="body2"
													sx={{ opacity: 0.9 }}
												>
													{card.label}
												</Typography>
												<Typography
													variant="h4"
													fontWeight={700}
												>
													{card.value}
												</Typography>
											</Box>
										</CardContent>
									</Card>
								</Grid>
							))}
						</Grid>

						{/* ── 2. Subject Performance ── */}
						<Typography
							variant="h6"
							fontWeight={700}
							sx={{ mt: 1 }}
						>
							<FuseSvgIcon
								size={20}
								sx={{ mr: 1, verticalAlign: 'text-bottom' }}
							>
								lucide:graduation-cap
							</FuseSvgIcon>
							Subject Performance
						</Typography>
						<Grid
							container
							spacing={3}
						>
							<Grid size={{ xs: 12, md: 7 }}>
								<Paper
									sx={{ p: 3, borderRadius: 3, height: 380 }}
									elevation={2}
								>
									<Typography
										variant="subtitle1"
										fontWeight={600}
										gutterBottom
									>
										Average Scores by Subject
									</Typography>
									<ResponsiveContainer
										width="100%"
										height="90%"
									>
										<BarChart
											data={performance}
											margin={{ top: 10, right: 20, left: 0, bottom: 5 }}
										>
											<defs>
												<linearGradient
													id="barGrad"
													x1="0"
													y1="0"
													x2="0"
													y2="1"
												>
													<stop
														offset="0%"
														stopColor="#6366f1"
														stopOpacity={0.9}
													/>
													<stop
														offset="100%"
														stopColor="#818cf8"
														stopOpacity={0.6}
													/>
												</linearGradient>
											</defs>
											<CartesianGrid
												strokeDasharray="3 3"
												stroke="#e5e7eb"
											/>
											<XAxis
												dataKey="subject"
												tick={{ fontSize: 12 }}
											/>
											<YAxis domain={[0, 100]} />
											<Tooltip
												contentStyle={{
													borderRadius: 8,
													boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
												}}
												formatter={(v: number) => [`${v}%`, 'Avg Score']}
											/>
											<Bar
												dataKey="avgScore"
												fill="url(#barGrad)"
												radius={[6, 6, 0, 0]}
												barSize={36}
											/>
										</BarChart>
									</ResponsiveContainer>
								</Paper>
							</Grid>

							<Grid size={{ xs: 12, md: 5 }}>
								<Paper
									sx={{ p: 3, borderRadius: 3, height: 380 }}
									elevation={2}
								>
									<Typography
										variant="subtitle1"
										fontWeight={600}
										gutterBottom
									>
										Strengths & Weaknesses
										<Chip
											label="Radar"
											size="small"
											variant="outlined"
											sx={{ ml: 1 }}
										/>
									</Typography>
									<ResponsiveContainer
										width="100%"
										height="90%"
									>
										<RadarChart
											cx="50%"
											cy="50%"
											outerRadius="70%"
											data={radarData}
										>
											<PolarGrid stroke="#e5e7eb" />
											<PolarAngleAxis
												dataKey="subject"
												tick={{ fontSize: 11 }}
											/>
											<PolarRadiusAxis
												angle={30}
												domain={[0, 100]}
												tick={{ fontSize: 10 }}
											/>
											<Radar
												name="Avg Score"
												dataKey="score"
												stroke="#6366f1"
												fill="#6366f1"
												fillOpacity={0.25}
											/>
											<Tooltip />
										</RadarChart>
									</ResponsiveContainer>
								</Paper>
							</Grid>
						</Grid>

						{/* ── 3. Attendance ── */}
						<Typography
							variant="h6"
							fontWeight={700}
							sx={{ mt: 1 }}
						>
							<FuseSvgIcon
								size={20}
								sx={{ mr: 1, verticalAlign: 'text-bottom' }}
							>
								lucide:calendar-days
							</FuseSvgIcon>
							Attendance Overview
						</Typography>
						<Grid
							container
							spacing={3}
						>
							<Grid size={{ xs: 12, md: 8 }}>
								<Paper
									sx={{ p: 3, borderRadius: 3, height: 360 }}
									elevation={2}
								>
									<Typography
										variant="subtitle1"
										fontWeight={600}
										gutterBottom
									>
										Daily Attendance Rate
									</Typography>
									<ResponsiveContainer
										width="100%"
										height="88%"
									>
										<AreaChart
											data={attendance?.daily ?? []}
											margin={{ top: 10, right: 20, left: 0, bottom: 5 }}
										>
											<defs>
												<linearGradient
													id="attGrad"
													x1="0"
													y1="0"
													x2="0"
													y2="1"
												>
													<stop
														offset="5%"
														stopColor="#10b981"
														stopOpacity={0.35}
													/>
													<stop
														offset="95%"
														stopColor="#10b981"
														stopOpacity={0}
													/>
												</linearGradient>
											</defs>
											<CartesianGrid
												strokeDasharray="3 3"
												stroke="#e5e7eb"
											/>
											<XAxis
												dataKey="date"
												tick={{ fontSize: 11 }}
											/>
											<YAxis domain={[60, 100]} />
											<Tooltip
												contentStyle={{ borderRadius: 8 }}
												formatter={(v: number) => [`${v}%`, 'Attendance']}
											/>
											<Area
												type="monotone"
												dataKey="rate"
												stroke="#10b981"
												strokeWidth={2}
												fill="url(#attGrad)"
											/>
										</AreaChart>
									</ResponsiveContainer>
								</Paper>
							</Grid>

							<Grid size={{ xs: 12, md: 4 }}>
								<Paper
									sx={{ p: 3, borderRadius: 3, height: 360 }}
									elevation={2}
								>
									<Typography
										variant="subtitle1"
										fontWeight={600}
										gutterBottom
									>
										By Day of Week
									</Typography>
									<ResponsiveContainer
										width="100%"
										height="88%"
									>
										<BarChart
											data={attendance?.byDay ?? []}
											margin={{ top: 10, right: 10, left: -10, bottom: 5 }}
										>
											<CartesianGrid
												strokeDasharray="3 3"
												stroke="#e5e7eb"
											/>
											<XAxis
												dataKey="day"
												tick={{ fontSize: 12 }}
											/>
											<YAxis domain={[70, 100]} />
											<Tooltip formatter={(v: number) => [`${v}%`, 'Avg Rate']} />
											<Bar
												dataKey="rate"
												radius={[6, 6, 0, 0]}
												barSize={32}
											>
												{(attendance?.byDay ?? []).map((_: any, i: number) => (
													<Cell
														key={i}
														fill={CHART_COLORS[i % CHART_COLORS.length]}
													/>
												))}
											</Bar>
										</BarChart>
									</ResponsiveContainer>
								</Paper>
							</Grid>
						</Grid>

						{/* ── 4. Financial Overview ── */}
						<Typography
							variant="h6"
							fontWeight={700}
							sx={{ mt: 1 }}
						>
							<FuseSvgIcon
								size={20}
								sx={{ mr: 1, verticalAlign: 'text-bottom' }}
							>
								lucide:landmark
							</FuseSvgIcon>
							Financial Overview
						</Typography>

						{/* Fee stat cards */}
						<Grid
							container
							spacing={2}
						>
							{feeStatCards.map((c) => (
								<Grid
									key={c.label}
									size={{ xs: 6, sm: 3 }}
								>
									<Paper
										sx={{
											p: 2.5,
											borderRadius: 3,
											borderLeft: `4px solid ${c.color}`,
											boxShadow: '0 2px 12px rgba(0,0,0,0.06)'
										}}
										elevation={0}
									>
										<Typography
											variant="body2"
											color="text.secondary"
										>
											{c.label}
										</Typography>
										<Typography
											variant="h5"
											fontWeight={700}
											sx={{ color: c.color }}
										>
											{c.value}
										</Typography>
									</Paper>
								</Grid>
							))}
						</Grid>

						<Grid
							container
							spacing={3}
						>
							<Grid size={{ xs: 12, md: 5 }}>
								<Paper
									sx={{ p: 3, borderRadius: 3, height: 360 }}
									elevation={2}
								>
									<Typography
										variant="subtitle1"
										fontWeight={600}
										gutterBottom
									>
										Collected vs Outstanding
									</Typography>
									<ResponsiveContainer
										width="100%"
										height="88%"
									>
										<PieChart>
											<Pie
												data={feePieData}
												cx="50%"
												cy="50%"
												innerRadius={65}
												outerRadius={100}
												paddingAngle={4}
												dataKey="value"
												label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
											>
												{feePieData.map((_, i) => (
													<Cell
														key={i}
														fill={PIE_COLORS[i]}
													/>
												))}
											</Pie>
											<Tooltip formatter={(v: number) => formatCurrency(v)} />
											<Legend />
										</PieChart>
									</ResponsiveContainer>
								</Paper>
							</Grid>

							<Grid size={{ xs: 12, md: 7 }}>
								<Paper
									sx={{ p: 3, borderRadius: 3, height: 360 }}
									elevation={2}
								>
									<Typography
										variant="subtitle1"
										fontWeight={600}
										gutterBottom
									>
										Per-Term Breakdown
									</Typography>
									<ResponsiveContainer
										width="100%"
										height="88%"
									>
										<BarChart
											data={fees?.terms ?? []}
											margin={{ top: 10, right: 20, left: 0, bottom: 5 }}
										>
											<CartesianGrid
												strokeDasharray="3 3"
												stroke="#e5e7eb"
											/>
											<XAxis
												dataKey="term"
												tick={{ fontSize: 12 }}
											/>
											<YAxis tickFormatter={(v: number) => formatCurrency(v)} />
											<Tooltip formatter={(v: number) => formatCurrency(v)} />
											<Legend />
											<Bar
												dataKey="billed"
												name="Billed"
												fill="#6366f1"
												radius={[4, 4, 0, 0]}
												barSize={28}
											/>
											<Bar
												dataKey="collected"
												name="Collected"
												fill="#10b981"
												radius={[4, 4, 0, 0]}
												barSize={28}
											/>
										</BarChart>
									</ResponsiveContainer>
								</Paper>
							</Grid>
						</Grid>
					</Box>
				}
			/>
		</AuthGuardRedirect>
	);
}
