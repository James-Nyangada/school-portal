'use client';

import Link from 'next/link';
import { Alert, Paper, Typography, Button, CircularProgress, LinearProgress } from '@mui/material';
import FusePageSimple from '@fuse/core/FusePageSimple';
import AuthGuardRedirect from '@auth/AuthGuardRedirect';
import ReconciliationCard from '@/components/fees/ReconciliationCard';
import FuseSvgIcon from '@fuse/core/FuseSvgIcon';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { StatCard } from '@/components/dashboard/StatCard';
import authRoles from '@auth/authRoles';
import {
	FinanceOverview,
	PAYMENT_METHOD_ICONS,
	PAYMENT_METHOD_LABELS,
	formatDate,
	formatKES,
	useBackend
} from '@/lib/finance';

const compactKES = (v: number) =>
	v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : v >= 1000 ? `${Math.round(v / 1000)}K` : `${v}`;

export default function FinanceDashboard() {
	const { data, error, loading, reload } = useBackend<FinanceOverview>('/api/finance/overview');

	const renderContent = () => {
		if (loading && !data) {
			return (
				<div className="flex min-h-[400px] items-center justify-center">
					<CircularProgress />
				</div>
			);
		}

		if (error || !data) {
			return (
				<div className="flex min-h-[400px] flex-col items-center justify-center gap-4 text-center">
					<FuseSvgIcon
						size={48}
						className="text-gray-400"
					>
						lucide:wallet
					</FuseSvgIcon>
					<Typography className="text-lg font-semibold text-gray-700">Couldn't load finance data</Typography>
					<Typography className="text-sm text-gray-500">{error}</Typography>
					<Button
						variant="outlined"
						onClick={reload}
					>
						Try again
					</Button>
				</div>
			);
		}

		const totalByMethod = data.byMethod.reduce((a, m) => a + m.amount, 0);

		return (
			<div className="flex flex-col gap-6">
				<div className="flex flex-wrap items-end justify-between gap-4">
					<div>
						<Typography className="text-3xl leading-none font-extrabold tracking-tight text-gray-900">
							Finance Dashboard
						</Typography>
						<Typography className="mt-2 text-sm text-gray-500">
							Current term: <strong className="font-semibold text-gray-700">{data.currentTerm}</strong>
						</Typography>
					</div>
					<div className="flex flex-wrap gap-2">
						<Button
							component={Link}
							href="/finance/billing"
							variant="outlined"
							startIcon={<FuseSvgIcon size={18}>lucide:file-plus</FuseSvgIcon>}
						>
							Bill fees
						</Button>
						<Button
							component={Link}
							href="/finance/record-payment"
							variant="contained"
							color="secondary"
							startIcon={<FuseSvgIcon size={18}>lucide:circle-plus</FuseSvgIcon>}
						>
							Record payment
						</Button>
					</div>
				</div>

				{data.pendingBankClaims > 0 && (
					<Alert
						severity="warning"
						action={
							<Button
								component={Link}
								href="/finance/bank-payments"
								color="inherit"
								size="small"
							>
								Review
							</Button>
						}
					>
						{data.pendingBankClaims} bank payment{data.pendingBankClaims === 1 ? '' : 's'} reported by
						parents {data.pendingBankClaims === 1 ? 'is' : 'are'} waiting to be verified.
					</Alert>
				)}

				<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
					<StatCard
						icon="lucide:banknote"
						iconColor="text-green-600"
						iconBg="bg-green-50"
						label="Collected this term"
						value={formatKES(data.term.collected)}
						caption={`of ${formatKES(data.term.billed)} billed for ${data.currentTerm}`}
					/>
					<StatCard
						icon="lucide:credit-card"
						iconColor="text-red-600"
						iconBg="bg-red-50"
						label="Outstanding balances"
						value={formatKES(data.totalOutstanding)}
						caption="Across all terms"
					/>
					<StatCard
						icon="lucide:percent"
						iconColor="text-blue-600"
						iconBg="bg-blue-50"
						label="Term collection rate"
						value={`${data.term.collectionRate}%`}
						caption={
							<LinearProgress
								variant="determinate"
								value={Math.min(100, data.term.collectionRate)}
								color={
									data.term.collectionRate >= 75
										? 'success'
										: data.term.collectionRate >= 40
											? 'warning'
											: 'error'
								}
								className="mt-1 h-2 rounded-full"
							/>
						}
					/>
					<StatCard
						icon="lucide:user-x"
						iconColor="text-amber-600"
						iconBg="bg-amber-50"
						label="Students owing"
						value={data.debtorCount}
						caption={
							<Link
								href="/finance/reports"
								className="font-semibold text-amber-700 hover:underline"
							>
								View debtors list →
							</Link>
						}
					/>
				</div>

				<div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
					<Paper className="flex h-[400px] flex-col rounded-2xl p-6 shadow-sm lg:col-span-2">
						<div className="mb-4 flex flex-wrap items-start justify-between gap-2">
							<div>
								<Typography className="text-lg font-semibold text-gray-900">Fee collections</Typography>
								<Typography className="text-sm text-gray-500">Last 6 months</Typography>
							</div>
							<div className="text-right">
								<Typography className="text-sm text-gray-500">This month</Typography>
								<Typography className="font-bold text-gray-900">{formatKES(data.thisMonth)}</Typography>
								{data.monthChange !== null && (
									<Typography
										className={`text-xs font-semibold ${data.monthChange >= 0 ? 'text-green-600' : 'text-red-600'}`}
									>
										{data.monthChange >= 0 ? '+' : ''}
										{data.monthChange}% vs last month
									</Typography>
								)}
							</div>
						</div>
						<div className="min-h-0 flex-auto">
							<ResponsiveContainer
								width="100%"
								height="100%"
							>
								<AreaChart
									data={data.trend}
									margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
								>
									<defs>
										<linearGradient
											id="colorCollected"
											x1="0"
											y1="0"
											x2="0"
											y2="1"
										>
											<stop
												offset="5%"
												stopColor="#10B981"
												stopOpacity={0.3}
											/>
											<stop
												offset="95%"
												stopColor="#10B981"
												stopOpacity={0}
											/>
										</linearGradient>
									</defs>
									<XAxis
										dataKey="label"
										axisLine={false}
										tickLine={false}
										tick={{ fill: '#9CA3AF', fontSize: 12 }}
										dy={10}
									/>
									<YAxis
										axisLine={false}
										tickLine={false}
										tick={{ fill: '#9CA3AF', fontSize: 12 }}
										tickFormatter={compactKES}
										width={48}
									/>
									<CartesianGrid
										strokeDasharray="3 3"
										vertical={false}
										stroke="#E5E7EB"
									/>
									<Tooltip
										formatter={(v: number) => [formatKES(v), 'Collected']}
										contentStyle={{
											borderRadius: '8px',
											border: 'none',
											boxShadow:
												'0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)'
										}}
										itemStyle={{ color: '#111827', fontWeight: 600 }}
									/>
									<Area
										type="monotone"
										dataKey="collected"
										stroke="#10B981"
										strokeWidth={3}
										fillOpacity={1}
										fill="url(#colorCollected)"
									/>
								</AreaChart>
							</ResponsiveContainer>
						</div>
					</Paper>

					<Paper className="flex h-[400px] flex-col overflow-hidden rounded-2xl p-6 shadow-sm">
						<div className="mb-4 flex items-center justify-between">
							<Typography className="text-lg font-semibold text-gray-900">Recent payments</Typography>
							<Link
								href="/finance/reports"
								className="text-sm font-semibold text-blue-600 hover:underline"
							>
								All
							</Link>
						</div>
						<div className="flex flex-col gap-2 overflow-y-auto pr-1">
							{data.recentPayments.length > 0 ? (
								data.recentPayments.map((payment) => (
									<div
										key={payment.id}
										className="flex items-center justify-between gap-3 rounded-xl border border-gray-100 p-3 transition-colors hover:bg-gray-50"
									>
										<div className="flex min-w-0 items-center gap-3">
											<div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-600">
												<FuseSvgIcon size={18}>
													{PAYMENT_METHOD_ICONS[payment.method]}
												</FuseSvgIcon>
											</div>
											<div className="min-w-0">
												<Typography className="truncate font-semibold text-gray-900">
													{payment.studentName}
												</Typography>
												<Typography className="text-xs text-gray-500">
													{PAYMENT_METHOD_LABELS[payment.method]} • {formatDate(payment.date)}
												</Typography>
											</div>
										</div>
										<Typography className="shrink-0 font-bold text-green-600">
											+{formatKES(payment.amount)}
										</Typography>
									</div>
								))
							) : (
								<Typography className="text-sm text-gray-500">No payments recorded yet.</Typography>
							)}
						</div>
					</Paper>
				</div>

				<Paper className="rounded-2xl p-6 shadow-sm">
					<Typography className="mb-4 text-lg font-semibold text-gray-900">
						Collections by payment method
					</Typography>
					{totalByMethod > 0 ? (
						<div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
							{data.byMethod.map((m) => (
								<div
									key={m.method}
									className="flex flex-col gap-2"
								>
									<div className="flex items-center justify-between text-sm">
										<span className="flex items-center gap-2 font-medium text-gray-700">
											<FuseSvgIcon size={16}>{PAYMENT_METHOD_ICONS[m.method]}</FuseSvgIcon>
											{PAYMENT_METHOD_LABELS[m.method]}
										</span>
										<span className="text-gray-500">{m.count} payments</span>
									</div>
									<Typography className="font-bold text-gray-900">{formatKES(m.amount)}</Typography>
									<LinearProgress
										variant="determinate"
										value={(m.amount / totalByMethod) * 100}
										className="h-2 rounded-full"
									/>
								</div>
							))}
						</div>
					) : (
						<Typography className="text-sm text-gray-500">No payments recorded yet.</Typography>
					)}
				</Paper>
			</div>
		);
	};

	return (
		<AuthGuardRedirect auth={authRoles.finance}>
			<FusePageSimple
				content={
					<div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8">
						{renderContent()}
						<ReconciliationCard />
					</div>
				}
			/>
		</AuthGuardRedirect>
	);
}
