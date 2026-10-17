'use client';

import { useSession } from 'next-auth/react';
import { useCallback, useEffect, useState } from 'react';
import { alpha, useTheme } from '@mui/material/styles';
import {
	Alert,
	Button,
	Chip,
	CircularProgress,
	LinearProgress,
	MenuItem,
	Paper,
	Skeleton,
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableRow,
	TextField,
	Typography
} from '@mui/material';
import FusePageSimple from '@fuse/core/FusePageSimple';
import AuthGuardRedirect from '@auth/AuthGuardRedirect';
import FuseSvgIcon from '@fuse/core/FuseSvgIcon';
import {
	Area,
	AreaChart,
	Bar,
	BarChart,
	CartesianGrid,
	Cell,
	Legend,
	Pie,
	PieChart,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis
} from 'recharts';
import { BACKEND_URL } from '@/lib/backend';

const API = `${BACKEND_URL}/api/analytics`;

/* ─── API response shapes (see server/src/routes/analytics.ts) ─── */
type Summary = {
	totalStudents: number;
	totalTeachers: number;
	totalParents: number;
	totalAssignments: number;
	overallAttendanceRate: number;
	totalBilled: number;
	totalCollected: number;
	collectionRate: number;
};

type SubjectPerformance = {
	subject: string;
	averageScore: number;
	previousAverage: number | null;
	change: number | null;
	totalGraded: number;
};

type Compared = {
	id: string;
	name: string;
	average: number | null;
	previousAverage: number | null;
	change: number | null;
	graded: number;
};

type Performance = {
	term: string;
	previousTerm: string | null;
	terms: string[];
	subjectPerformance: SubjectPerformance[];
	classes: Compared[];
};

type Metric = { current: number | null; previous: number | null; change: number | null };

type Comparison = {
	term: string;
	previousTerm: string | null;
	averageScore: Metric;
	attendanceRate: Metric;
	collectionRate: Metric;
};

type Absentee = {
	studentId: string;
	name: string;
	admissionNumber: string | null;
	className: string | null;
	marks: number;
	absences: number;
	rate: number;
	longestStreak: number;
	currentStreak: number;
	reasons: string[];
	parentPhones: string[];
};

type Absentees = { month: string; threshold: number; streak: number; students: Absentee[] };

type AttendanceData = {
	heatmapData: { date: string; present: number; absent: number; late: number; total: number; rate: number }[];
	dayOfWeekSummary: { day: string; rate: number; total: number }[];
};

type FeesData = {
	totalBilled: number;
	totalCollected: number;
	totalOutstanding: number;
	collectionRate: number;
	debtorCount: number;
	termBreakdown: { term: string; billed: number; collected: number; outstanding: number; collectionRate: number }[];
};

type Section<T> = { data: T | null; error: boolean };

/* ─── Helpers ─── */
const formatKES = (v: number) => {
	if (v >= 1_000_000) return `KES ${(v / 1_000_000).toFixed(1)}M`;

	if (v >= 1_000) return `KES ${(v / 1_000).toFixed(0)}K`;

	return `KES ${v.toLocaleString()}`;
};

const formatDay = (iso: string) => {
	const [, m, d] = iso.split('-');
	const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

	return `${Number(d)} ${months[Number(m) - 1] ?? ''}`;
};

/** Trend direction against the previous term, the thing a board actually acts on (dashboard spec §2.6). */
function Trend({ change, unit = ' pts' }: { change: number | null; unit?: string }) {
	if (change === null) return <span className="text-xs text-gray-400">no comparison</span>;

	const color = change > 0 ? 'text-emerald-600' : change < 0 ? 'text-red-600' : 'text-gray-500';
	const icon = change > 0 ? 'lucide:trending-up' : change < 0 ? 'lucide:trending-down' : 'lucide:minus';

	return (
		<span className={`inline-flex items-center gap-1 text-xs font-semibold ${color}`}>
			<FuseSvgIcon size={14}>{icon}</FuseSvgIcon>
			{change > 0 ? '+' : ''}
			{change}
			{unit}
		</span>
	);
}

const scoreColor = (score: number) => (score >= 70 ? '#10b981' : score >= 50 ? '#f59e0b' : '#ef4444');

/* ─── Small building blocks ─── */
function SectionHeading({ title, subtitle }: { title: string; subtitle: string }) {
	return (
		<div className="mt-2">
			<Typography className="text-xl font-bold tracking-tight">{title}</Typography>
			<Typography
				variant="body2"
				color="text.secondary"
			>
				{subtitle}
			</Typography>
		</div>
	);
}

function KpiCard(props: {
	label: string;
	value: string;
	caption: string;
	icon: string;
	color: string;
	loading?: boolean;
}) {
	const { label, value, caption, icon, color, loading } = props;

	return (
		<Paper
			variant="outlined"
			className="flex flex-col gap-4 rounded-2xl p-5"
		>
			<div className="flex items-center justify-between">
				<Typography
					variant="body2"
					color="text.secondary"
					className="font-semibold"
				>
					{label}
				</Typography>
				<div
					className="flex h-9 w-9 items-center justify-center rounded-xl"
					style={{ backgroundColor: alpha(color, 0.12), color }}
				>
					<FuseSvgIcon size={20}>{icon}</FuseSvgIcon>
				</div>
			</div>
			{loading ? (
				<Skeleton
					width={90}
					height={44}
				/>
			) : (
				<Typography className="text-4xl leading-none font-bold tracking-tight">{value}</Typography>
			)}
			<Typography
				variant="caption"
				color="text.secondary"
			>
				{caption}
			</Typography>
		</Paper>
	);
}

function ChartCard(props: {
	title: string;
	subtitle?: string;
	className?: string;
	loading: boolean;
	error: boolean;
	empty: boolean;
	emptyText: string;
	onRetry: () => void;
	children: React.ReactNode;
}) {
	const { title, subtitle, className, loading, error, empty, emptyText, onRetry, children } = props;

	let body: React.ReactNode = children;

	if (loading) {
		body = (
			<div className="flex flex-1 items-center justify-center">
				<CircularProgress size={28} />
			</div>
		);
	} else if (error) {
		body = (
			<div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
				<FuseSvgIcon
					size={32}
					color="disabled"
				>
					lucide:cloud-off
				</FuseSvgIcon>
				<Typography
					variant="body2"
					color="text.secondary"
				>
					Couldn&apos;t load this data.
				</Typography>
				<Button
					size="small"
					variant="outlined"
					onClick={onRetry}
				>
					Try again
				</Button>
			</div>
		);
	} else if (empty) {
		body = (
			<div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
				<FuseSvgIcon
					size={32}
					color="disabled"
				>
					lucide:chart-column
				</FuseSvgIcon>
				<Typography
					variant="body2"
					color="text.secondary"
				>
					{emptyText}
				</Typography>
			</div>
		);
	}

	return (
		<Paper
			variant="outlined"
			className={`flex h-[380px] flex-col rounded-2xl p-6 ${className ?? ''}`}
		>
			<div className="mb-4">
				<Typography className="text-base font-semibold">{title}</Typography>
				{subtitle && (
					<Typography
						variant="caption"
						color="text.secondary"
					>
						{subtitle}
					</Typography>
				)}
			</div>
			<div className="flex min-h-0 flex-1 flex-col">{body}</div>
		</Paper>
	);
}

/* ─── Page ─── */
export default function AdminAnalytics() {
	const theme = useTheme();
	const { data: session } = useSession();
	const token = (session as { backendToken?: string } | null)?.backendToken;

	const [loading, setLoading] = useState(true);
	const [updatedAt, setUpdatedAt] = useState('');
	const [summary, setSummary] = useState<Section<Summary>>({ data: null, error: false });
	const [performance, setPerformance] = useState<Section<SubjectPerformance[]>>({ data: null, error: false });
	const [perf, setPerf] = useState<Performance | null>(null);
	const [comparison, setComparison] = useState<Section<Comparison>>({ data: null, error: false });
	const [absentees, setAbsentees] = useState<Section<Absentees>>({ data: null, error: false });
	const [term, setTerm] = useState('');
	const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
	const [downloading, setDownloading] = useState(false);
	const [attendance, setAttendance] = useState<Section<AttendanceData>>({ data: null, error: false });
	const [fees, setFees] = useState<Section<FeesData>>({ data: null, error: false });

	const grid = theme.palette.divider;
	const axis = { fontSize: 12, fill: theme.palette.text.secondary };
	const tooltipStyle = {
		borderRadius: 10,
		border: `1px solid ${theme.palette.divider}`,
		backgroundColor: theme.palette.background.paper,
		color: theme.palette.text.primary,
		boxShadow: '0 8px 24px rgba(0,0,0,0.08)'
	};

	const get = useCallback(
		async <T,>(path: string): Promise<Section<T>> => {
			try {
				const res = await fetch(`${API}/${path}`, { headers: { Authorization: `Bearer ${token}` } });

				if (!res.ok) throw new Error(String(res.status));

				return { data: (await res.json()) as T, error: false };
			} catch {
				return { data: null, error: true };
			}
		},
		[token]
	);

	const loadAll = useCallback(async () => {
		setLoading(true);

		const termQuery = term ? `?term=${encodeURIComponent(term)}` : '';
		const [s, p, a, f, c] = await Promise.all([
			get<Summary>('summary'),
			get<Performance>(`performance${termQuery}`),
			get<AttendanceData>('attendance'),
			get<FeesData>('fees'),
			get<Comparison>(`comparison${termQuery}`)
		]);

		setSummary(s);
		setPerformance({ data: p.data?.subjectPerformance ?? null, error: p.error });
		setPerf(p.data);
		setComparison(c);
		setAttendance(a);
		setFees(f);
		setUpdatedAt(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
		setLoading(false);
	}, [get, term]);

	useEffect(() => {
		if (token) loadAll();
	}, [token, loadAll]);

	useEffect(() => {
		if (!token) return;

		get<Absentees>(`absentees?month=${month}`).then(setAbsentees);
	}, [token, get, month]);

	const downloadReport = async () => {
		setDownloading(true);
		try {
			const res = await fetch(`${API}/report.pdf${term ? `?term=${encodeURIComponent(term)}` : ''}`, {
				headers: { Authorization: `Bearer ${token}` }
			});

			if (!res.ok) throw new Error();

			const url = URL.createObjectURL(await res.blob());
			const a = document.createElement('a');
			a.href = url;
			a.download = `term-report-${(perf?.term ?? 'current').replace(/\s+/g, '-')}.pdf`;
			a.click();
			URL.revokeObjectURL(url);
		} catch {
			setComparison((c) => ({ ...c, error: true }));
		} finally {
			setDownloading(false);
		}
	};

	const s = summary.data;
	const subjects = [...(performance.data ?? [])].sort((a, b) => b.averageScore - a.averageScore);
	const daily = (attendance.data?.heatmapData ?? []).slice(-30).map((d) => ({ ...d, label: formatDay(d.date) }));
	const byDay = attendance.data?.dayOfWeekSummary ?? [];
	const f = fees.data;
	const feePie = f
		? [
				{ name: 'Collected', value: f.totalCollected, color: '#10b981' },
				{ name: 'Outstanding', value: f.totalOutstanding, color: '#ef4444' }
			]
		: [];

	const kpiLoading = loading && !s;
	const noSummary = !loading && summary.error;

	return (
		<AuthGuardRedirect auth={['ADMIN', 'SUPER_ADMIN']}>
			<FusePageSimple
				content={
					<div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-8">
						{/* Header */}
						<div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
							<div>
								<Typography className="text-4xl font-extrabold tracking-tight">Analytics</Typography>
								<Typography
									color="text.secondary"
									className="mt-1"
								>
									School performance, attendance and fee collection at a glance
								</Typography>
							</div>
							<div className="flex items-center gap-3">
								{updatedAt && (
									<Typography
										variant="caption"
										color="text.secondary"
									>
										Updated {updatedAt}
									</Typography>
								)}
								<TextField
									select
									size="small"
									label="Term"
									value={term || perf?.term || ''}
									onChange={(e) => setTerm(e.target.value)}
									className="min-w-36"
									disabled={!perf}
								>
									{(perf?.terms ?? []).map((t) => (
										<MenuItem
											key={t}
											value={t}
										>
											{t}
										</MenuItem>
									))}
								</TextField>
								<Button
									variant="outlined"
									color="inherit"
									className="rounded-full"
									disabled={loading}
									onClick={loadAll}
									startIcon={<FuseSvgIcon size={16}>lucide:refresh-cw</FuseSvgIcon>}
								>
									Refresh
								</Button>
								<Button
									variant="contained"
									color="secondary"
									className="rounded-full"
									disabled={downloading || !perf}
									onClick={downloadReport}
									startIcon={
										downloading ? (
											<CircularProgress
												size={16}
												color="inherit"
											/>
										) : (
											<FuseSvgIcon size={16}>lucide:file-down</FuseSvgIcon>
										)
									}
								>
									Board report (PDF)
								</Button>
							</div>
						</div>

						{noSummary && (
							<Alert
								severity="error"
								className="rounded-xl"
								action={
									<Button
										color="inherit"
										size="small"
										onClick={loadAll}
									>
										Retry
									</Button>
								}
							>
								Couldn&apos;t reach the analytics service. Check that the server is running on port
								4000.
							</Alert>
						)}

						{/* KPIs */}
						<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
							<KpiCard
								label="Students"
								value={(s?.totalStudents ?? 0).toLocaleString()}
								caption={`${(s?.totalParents ?? 0).toLocaleString()} linked parents`}
								icon="lucide:graduation-cap"
								color="#6366f1"
								loading={kpiLoading}
							/>
							<KpiCard
								label="Teachers"
								value={(s?.totalTeachers ?? 0).toLocaleString()}
								caption={`${(s?.totalAssignments ?? 0).toLocaleString()} assignments created`}
								icon="lucide:book-open"
								color="#0ea5e9"
								loading={kpiLoading}
							/>
							<KpiCard
								label="Attendance rate"
								value={`${s?.overallAttendanceRate ?? 0}%`}
								caption="Present across all recorded days"
								icon="lucide:calendar-check"
								color="#10b981"
								loading={kpiLoading}
							/>
							<KpiCard
								label="Fee collection"
								value={`${s?.collectionRate ?? 0}%`}
								caption={`${formatKES(s?.totalCollected ?? 0)} of ${formatKES(s?.totalBilled ?? 0)}`}
								icon="lucide:wallet"
								color="#f59e0b"
								loading={kpiLoading}
							/>
						</div>

						{/* Term over term */}
						<SectionHeading
							title={`${comparison.data?.term ?? 'This term'} vs ${comparison.data?.previousTerm ?? 'previous term'}`}
							subtitle="Headline figures with their direction against the previous term"
						/>
						<div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
							{(
								[
									[
										'Average score',
										comparison.data?.averageScore,
										'Published numeric grades',
										'lucide:graduation-cap',
										'#6366f1'
									],
									[
										'Attendance rate',
										comparison.data?.attendanceRate,
										'Within the term dates',
										'lucide:calendar-check',
										'#10b981'
									],
									[
										'Fee collection',
										comparison.data?.collectionRate,
										'Collected of billed',
										'lucide:wallet',
										'#f59e0b'
									]
								] as const
							).map(([label, m, hint, icon, color]) => (
								<Paper
									key={label}
									variant="outlined"
									className="flex flex-col gap-3 rounded-2xl p-5"
								>
									<div className="flex items-center justify-between">
										<Typography
											variant="body2"
											color="text.secondary"
											className="font-semibold"
										>
											{label}
										</Typography>
										<div
											className="flex h-9 w-9 items-center justify-center rounded-xl"
											style={{ backgroundColor: alpha(color, 0.12), color }}
										>
											<FuseSvgIcon size={20}>{icon}</FuseSvgIcon>
										</div>
									</div>
									{loading && !comparison.data ? (
										<Skeleton
											width={90}
											height={44}
										/>
									) : (
										<div className="flex items-baseline gap-3">
											<Typography className="text-4xl leading-none font-bold tracking-tight">
												{m?.current != null ? `${m.current}%` : '—'}
											</Typography>
											<Trend change={m?.change ?? null} />
										</div>
									)}
									<Typography
										variant="caption"
										color="text.secondary"
									>
										{hint} · previously {m?.previous != null ? `${m.previous}%` : '—'}
									</Typography>
								</Paper>
							))}
						</div>
						{comparison.data && comparison.data.attendanceRate.current === null && (
							<Alert
								severity="info"
								className="rounded-xl"
							>
								Attendance by term needs the term&apos;s opening and closing dates in School Settings →
								Academic Calendar.
							</Alert>
						)}

						{/* Academic performance */}
						<SectionHeading
							title="Academic performance"
							subtitle={`Average score per subject and class in ${perf?.term ?? 'the selected term'}, from published grades`}
						/>
						<div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
							<ChartCard
								className="lg:col-span-7"
								title="Average score by subject"
								loading={loading}
								error={performance.error}
								empty={subjects.length === 0}
								emptyText="No published grades yet."
								onRetry={loadAll}
							>
								<ResponsiveContainer
									width="100%"
									height="100%"
								>
									<BarChart
										data={subjects}
										margin={{ top: 8, right: 8, left: -16, bottom: 0 }}
									>
										<CartesianGrid
											vertical={false}
											stroke={grid}
											strokeDasharray="3 3"
										/>
										<XAxis
											dataKey="subject"
											tick={axis}
											axisLine={false}
											tickLine={false}
											interval={0}
										/>
										<YAxis
											domain={[0, 100]}
											tick={axis}
											axisLine={false}
											tickLine={false}
										/>
										<Tooltip
											cursor={{ fill: alpha(theme.palette.text.primary, 0.04) }}
											contentStyle={tooltipStyle}
											formatter={(v: number) => [`${v}%`, 'Average']}
										/>
										<Bar
											dataKey="averageScore"
											radius={[8, 8, 0, 0]}
											maxBarSize={44}
										>
											{subjects.map((d) => (
												<Cell
													key={d.subject}
													fill={scoreColor(d.averageScore)}
												/>
											))}
										</Bar>
									</BarChart>
								</ResponsiveContainer>
							</ChartCard>

							<ChartCard
								className="lg:col-span-5"
								title="Subject ranking"
								subtitle="Best to weakest"
								loading={loading}
								error={performance.error}
								empty={subjects.length === 0}
								emptyText="No published grades yet."
								onRetry={loadAll}
							>
								<div className="flex flex-col gap-4 overflow-y-auto pr-1">
									{subjects.map((d, i) => (
										<div key={d.subject}>
											<div className="mb-1 flex items-center justify-between">
												<Typography
													variant="body2"
													className="font-medium"
												>
													{i + 1}. {d.subject}
												</Typography>
												<span className="flex items-center gap-2">
													<Trend change={d.change} />
													<Typography
														variant="body2"
														className="font-semibold"
														style={{ color: scoreColor(d.averageScore) }}
													>
														{d.averageScore}%
													</Typography>
												</span>
											</div>
											<LinearProgress
												variant="determinate"
												value={Math.min(d.averageScore, 100)}
												sx={{
													height: 8,
													borderRadius: 4,
													backgroundColor: alpha(scoreColor(d.averageScore), 0.15),
													'& .MuiLinearProgress-bar': {
														borderRadius: 4,
														backgroundColor: scoreColor(d.averageScore)
													}
												}}
											/>
										</div>
									))}
								</div>
							</ChartCard>
						</div>

						<Paper
							variant="outlined"
							className="rounded-2xl p-6"
						>
							<Typography className="mb-1 text-base font-semibold">Performance by class</Typography>
							<Typography
								variant="caption"
								color="text.secondary"
							>
								{perf?.previousTerm
									? `Compared with ${perf.previousTerm}`
									: 'No earlier term to compare with'}
							</Typography>
							{!perf?.classes.length ? (
								<Typography
									variant="body2"
									color="text.secondary"
									className="mt-4"
								>
									No published grades for this term.
								</Typography>
							) : (
								<Table
									size="small"
									className="mt-2"
								>
									<TableHead>
										<TableRow>
											<TableCell>Class</TableCell>
											<TableCell align="right">Average</TableCell>
											<TableCell align="right">{perf.previousTerm ?? 'Previous'}</TableCell>
											<TableCell align="right">Change</TableCell>
											<TableCell align="right">Grades</TableCell>
										</TableRow>
									</TableHead>
									<TableBody>
										{perf.classes.map((c) => (
											<TableRow key={c.id}>
												<TableCell>{c.name}</TableCell>
												<TableCell align="right">
													{c.average != null ? `${c.average}%` : '—'}
												</TableCell>
												<TableCell align="right">
													{c.previousAverage != null ? `${c.previousAverage}%` : '—'}
												</TableCell>
												<TableCell align="right">
													<Trend change={c.change} />
												</TableCell>
												<TableCell align="right">{c.graded}</TableCell>
											</TableRow>
										))}
									</TableBody>
								</Table>
							)}
						</Paper>

						{/* Attendance */}
						<SectionHeading
							title="Attendance"
							subtitle="Share of students present, by day (last 30 recorded days)"
						/>
						<div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
							<ChartCard
								className="lg:col-span-8"
								title="Daily attendance rate"
								loading={loading}
								error={attendance.error}
								empty={daily.length === 0}
								emptyText="No attendance has been recorded yet."
								onRetry={loadAll}
							>
								<ResponsiveContainer
									width="100%"
									height="100%"
								>
									<AreaChart
										data={daily}
										margin={{ top: 8, right: 8, left: -16, bottom: 0 }}
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
													offset="0%"
													stopColor="#10b981"
													stopOpacity={0.3}
												/>
												<stop
													offset="100%"
													stopColor="#10b981"
													stopOpacity={0}
												/>
											</linearGradient>
										</defs>
										<CartesianGrid
											vertical={false}
											stroke={grid}
											strokeDasharray="3 3"
										/>
										<XAxis
											dataKey="label"
											tick={axis}
											axisLine={false}
											tickLine={false}
											minTickGap={24}
										/>
										<YAxis
											domain={[0, 100]}
											tick={axis}
											axisLine={false}
											tickLine={false}
										/>
										<Tooltip
											contentStyle={tooltipStyle}
											formatter={(v: number) => [`${v}%`, 'Present']}
										/>
										<Area
											type="monotone"
											dataKey="rate"
											stroke="#10b981"
											strokeWidth={2.5}
											fill="url(#attGrad)"
										/>
									</AreaChart>
								</ResponsiveContainer>
							</ChartCard>

							<ChartCard
								className="lg:col-span-4"
								title="By day of week"
								loading={loading}
								error={attendance.error}
								empty={byDay.every((d) => d.total === 0)}
								emptyText="No attendance has been recorded yet."
								onRetry={loadAll}
							>
								<ResponsiveContainer
									width="100%"
									height="100%"
								>
									<BarChart
										data={byDay.map((d) => ({ ...d, short: d.day.slice(0, 3) }))}
										margin={{ top: 8, right: 8, left: -16, bottom: 0 }}
									>
										<CartesianGrid
											vertical={false}
											stroke={grid}
											strokeDasharray="3 3"
										/>
										<XAxis
											dataKey="short"
											tick={axis}
											axisLine={false}
											tickLine={false}
										/>
										<YAxis
											domain={[0, 100]}
											tick={axis}
											axisLine={false}
											tickLine={false}
										/>
										<Tooltip
											cursor={{ fill: alpha(theme.palette.text.primary, 0.04) }}
											contentStyle={tooltipStyle}
											formatter={(v: number) => [`${v}%`, 'Present']}
										/>
										<Bar
											dataKey="rate"
											fill="#6366f1"
											radius={[8, 8, 0, 0]}
											maxBarSize={36}
										/>
									</BarChart>
								</ResponsiveContainer>
							</ChartCard>
						</div>

						{/* Chronic absentees */}
						<div
							id="absentees"
							className="flex flex-wrap items-end justify-between gap-4"
						>
							<SectionHeading
								title="Chronic absentees"
								subtitle={`Under ${absentees.data?.threshold ?? 75}% attendance in the month, or ${absentees.data?.streak ?? 3}+ lessons missed in a row`}
							/>
							<TextField
								type="month"
								size="small"
								label="Month"
								value={month}
								onChange={(e) => e.target.value && setMonth(e.target.value)}
								slotProps={{ inputLabel: { shrink: true } }}
							/>
						</div>
						<Paper
							variant="outlined"
							className="overflow-x-auto rounded-2xl"
						>
							{absentees.error ? (
								<Alert severity="error">Couldn&apos;t load the absentee list.</Alert>
							) : !absentees.data ? (
								<div className="flex justify-center p-8">
									<CircularProgress size={28} />
								</div>
							) : absentees.data.students.length === 0 ? (
								<Typography
									variant="body2"
									color="text.secondary"
									className="p-6"
								>
									No students meet the chronic absence criteria for this month.
								</Typography>
							) : (
								<Table size="small">
									<TableHead>
										<TableRow>
											<TableCell>Student</TableCell>
											<TableCell>Class</TableCell>
											<TableCell align="right">Attendance</TableCell>
											<TableCell align="right">Missed</TableCell>
											<TableCell>Why flagged</TableCell>
											<TableCell>Parent phone</TableCell>
										</TableRow>
									</TableHead>
									<TableBody>
										{absentees.data.students.map((a) => (
											<TableRow key={a.studentId}>
												<TableCell>
													<div className="font-medium">{a.name}</div>
													<div className="text-xs text-gray-500">
														{a.admissionNumber ?? ''}
													</div>
												</TableCell>
												<TableCell>{a.className ?? '—'}</TableCell>
												<TableCell
													align="right"
													className={
														a.rate < absentees.data!.threshold
															? 'font-semibold text-red-600'
															: ''
													}
												>
													{a.rate}%
												</TableCell>
												<TableCell align="right">
													{a.absences} of {a.marks}
												</TableCell>
												<TableCell>
													<div className="flex flex-wrap gap-1">
														{a.reasons.map((r) => (
															<Chip
																key={r}
																size="small"
																label={r}
																color="warning"
																variant="outlined"
															/>
														))}
													</div>
												</TableCell>
												<TableCell>{a.parentPhones.join(', ') || '—'}</TableCell>
											</TableRow>
										))}
									</TableBody>
								</Table>
							)}
						</Paper>

						{/* Finance */}
						<SectionHeading
							title="Fees"
							subtitle="Billed vs collected across all terms"
						/>
						<div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
							<KpiCard
								label="Total billed"
								value={formatKES(f?.totalBilled ?? 0)}
								caption="All terms"
								icon="lucide:receipt"
								color="#6366f1"
								loading={loading && !f}
							/>
							<KpiCard
								label="Collected"
								value={formatKES(f?.totalCollected ?? 0)}
								caption={`${f?.collectionRate ?? 0}% of billed`}
								icon="lucide:badge-check"
								color="#10b981"
								loading={loading && !f}
							/>
							<KpiCard
								label="Outstanding"
								value={formatKES(f?.totalOutstanding ?? 0)}
								caption="Still to be paid"
								icon="lucide:hourglass"
								color="#ef4444"
								loading={loading && !f}
							/>
							<KpiCard
								label="Students with balance"
								value={(f?.debtorCount ?? 0).toLocaleString()}
								caption="Have an unpaid balance"
								icon="lucide:users"
								color="#f59e0b"
								loading={loading && !f}
							/>
						</div>

						<div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
							<ChartCard
								className="lg:col-span-5"
								title="Collected vs outstanding"
								loading={loading}
								error={fees.error}
								empty={!f || f.totalBilled === 0}
								emptyText="No fees have been billed yet."
								onRetry={loadAll}
							>
								<div className="relative min-h-0 flex-1">
									<ResponsiveContainer
										width="100%"
										height="100%"
									>
										<PieChart>
											<Pie
												data={feePie}
												dataKey="value"
												innerRadius="62%"
												outerRadius="85%"
												paddingAngle={3}
												stroke="none"
											>
												{feePie.map((d) => (
													<Cell
														key={d.name}
														fill={d.color}
													/>
												))}
											</Pie>
											<Tooltip
												contentStyle={tooltipStyle}
												formatter={(v: number) => formatKES(v)}
											/>
											<Legend
												verticalAlign="bottom"
												iconType="circle"
											/>
										</PieChart>
									</ResponsiveContainer>
									<div className="pointer-events-none absolute inset-x-0 top-[38%] flex -translate-y-1/2 flex-col items-center">
										<Typography className="text-3xl leading-none font-bold">
											{f?.collectionRate ?? 0}%
										</Typography>
										<Typography
											variant="caption"
											color="text.secondary"
										>
											collected
										</Typography>
									</div>
								</div>
							</ChartCard>

							<ChartCard
								className="lg:col-span-7"
								title="Per-term breakdown"
								loading={loading}
								error={fees.error}
								empty={!f || f.termBreakdown.length === 0}
								emptyText="No fee records yet."
								onRetry={loadAll}
							>
								<ResponsiveContainer
									width="100%"
									height="100%"
								>
									<BarChart
										data={f?.termBreakdown ?? []}
										margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
									>
										<CartesianGrid
											vertical={false}
											stroke={grid}
											strokeDasharray="3 3"
										/>
										<XAxis
											dataKey="term"
											tick={axis}
											axisLine={false}
											tickLine={false}
										/>
										<YAxis
											tickFormatter={(v: number) => formatKES(v).replace('KES ', '')}
											tick={axis}
											axisLine={false}
											tickLine={false}
										/>
										<Tooltip
											cursor={{ fill: alpha(theme.palette.text.primary, 0.04) }}
											contentStyle={tooltipStyle}
											formatter={(v: number) => formatKES(v)}
										/>
										<Legend
											verticalAlign="bottom"
											iconType="circle"
										/>
										<Bar
											dataKey="billed"
											name="Billed"
											fill="#6366f1"
											radius={[8, 8, 0, 0]}
											maxBarSize={32}
										/>
										<Bar
											dataKey="collected"
											name="Collected"
											fill="#10b981"
											radius={[8, 8, 0, 0]}
											maxBarSize={32}
										/>
									</BarChart>
								</ResponsiveContainer>
							</ChartCard>
						</div>
					</div>
				}
			/>
		</AuthGuardRedirect>
	);
}
