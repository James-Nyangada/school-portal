'use client';

import { useSession } from 'next-auth/react';
import { useEffect, useState } from 'react';
import { Box, Paper, Typography, CircularProgress } from '@mui/material';
import FusePageSimple from '@fuse/core/FusePageSimple';
import AuthGuardRedirect from '@auth/AuthGuardRedirect';
import FuseSvgIcon from '@fuse/core/FuseSvgIcon';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { StatCard } from '@/components/dashboard/StatCard';
import authRoles from '@auth/authRoles';

export default function FinanceDashboard() {
	const { data: session } = useSession();
	const token = (session as any)?.backendToken;
	const [data, setData] = useState<any>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState(false);

	useEffect(() => {
		if (!token) return;

		// Attempting to fetch finance dashboard stats
		fetch(`http://localhost:4000/api/finance/dashboard?t=${Date.now()}`, {
			headers: {
				Authorization: `Bearer ${token}`,
				'Cache-Control': 'no-cache',
				Pragma: 'no-cache'
			}
		})
			.then((res) => {
				if (!res.ok) throw new Error('Failed to fetch');

				return res.json();
			})
			.then((data) => {
				setData(data);
				setLoading(false);
			})
			.catch((err) => {
				console.error(err);
				setError(true);
				setLoading(false);
			});
	}, [token]);

	const mockChartData = [
		{ name: 'Jan', collected: 15000, expected: 20000 },
		{ name: 'Feb', collected: 25000, expected: 30000 },
		{ name: 'Mar', collected: 45000, expected: 50000 },
		{ name: 'Apr', collected: 30000, expected: 35000 },
		{ name: 'May', collected: 32000, expected: 36000 },
		{ name: 'Jun', collected: 18000, expected: 25000 },
		{ name: 'Jul', collected: 10000, expected: 15000 }
	];

	const renderContent = () => {
		if (loading) {
			return (
				<div className="flex min-h-[400px] items-center justify-center">
					<CircularProgress />
				</div>
			);
		}

		if (error || !data) {
			return (
				<div className="flex min-h-[400px] flex-col items-center justify-center gap-16">
					<FuseSvgIcon
						size={64}
						className="text-gray-400"
					>
						lucide:wallet
					</FuseSvgIcon>
					<Typography className="text-lg font-semibold text-gray-600">
						No live finance data available yet
					</Typography>
					<Typography className="text-[14px] text-gray-500">
						Connect your backend to see real-time financial stats.
					</Typography>
				</div>
			);
		}

		// Using real data if available, otherwise defaulting to mock-like layout with the data
		const totalCollected = data?.totalCollected ?? '$125,000';
		const outstandingBalances = data?.outstandingBalances ?? '$15,000';
		const recentPayments = data?.recentPayments ?? [
			{ id: '1', student: 'Alice Johnson', amount: '$500', method: 'CASH', date: '2026-07-01' },
			{ id: '2', student: 'Bob Smith', amount: '$1,200', method: 'BANK', date: '2026-06-29' },
			{ id: '3', student: 'Charlie Davis', amount: '$300', method: 'CASH', date: '2026-06-28' }
		];

		return (
			<div className="flex flex-col gap-24">
				<Typography className="text-[32px] font-extrabold leading-none tracking-tight text-gray-900">
					Finance Dashboard
				</Typography>

				<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
					<StatCard
						icon="lucide:banknote"
						iconColor="text-green-600"
						iconBg="bg-green-50"
						label="Total Collected"
						value={totalCollected}
						caption={<span><strong className="font-semibold text-green-600">+12%</strong> from last month</span>}
					/>
					<StatCard
						icon="lucide:credit-card"
						iconColor="text-red-600"
						iconBg="bg-red-50"
						label="Outstanding Balances"
						value={outstandingBalances}
						caption={<span><strong className="font-semibold text-red-600">Requires attention</strong></span>}
					/>
				</div>

				<div className="grid grid-cols-1 gap-24 md:grid-cols-3">
					<div className="md:col-span-2">
						<Paper className="flex h-[400px] flex-auto flex-col rounded-2xl bg-white p-24 shadow-sm">
							<div className="mb-24 flex items-center justify-between">
								<Typography className="text-lg font-semibold text-gray-900">Fee Collection Trend</Typography>
							</div>
							<div className="min-h-0 flex-auto">
								<ResponsiveContainer
									width="100%"
									height="100%"
								>
									<AreaChart
										data={mockChartData}
										margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
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
											dataKey="name" 
											axisLine={false} 
											tickLine={false} 
											tick={{ fill: '#9CA3AF', fontSize: 12 }} 
											dy={10} 
										/>
										<YAxis 
											axisLine={false} 
											tickLine={false} 
											tick={{ fill: '#9CA3AF', fontSize: 12 }} 
										/>
										<CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
										<Tooltip 
											contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)' }}
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
					</div>

					<div className="md:col-span-1">
						<Paper className="flex h-[400px] flex-auto flex-col overflow-hidden rounded-2xl bg-white p-24 shadow-sm">
							<Typography className="mb-24 text-lg font-semibold text-gray-900">Recent Fee Payments</Typography>
							<div className="flex flex-col gap-12 overflow-y-auto pr-4">
								{recentPayments.length > 0 ? (
									recentPayments.map((payment: any) => (
										<div
											key={payment.id}
											className="flex items-center justify-between rounded-xl border border-gray-100 p-16 transition-colors duration-200 hover:bg-gray-50"
										>
											<div className="flex items-center gap-12">
												<div className="flex h-40 w-40 items-center justify-center rounded-full bg-blue-50 text-blue-600">
													<FuseSvgIcon size={20}>
														{payment.method === 'CASH' ? 'lucide:banknote' : 'lucide:credit-card'}
													</FuseSvgIcon>
												</div>
												<div>
													<Typography className="font-semibold text-gray-900">{payment.student}</Typography>
													<Typography className="mt-2 text-[13px] text-gray-500">
														{payment.method} • {payment.date}
													</Typography>
												</div>
											</div>
											<Typography className="text-lg font-bold text-green-600">
												+{payment.amount}
											</Typography>
										</div>
									))
								) : (
									<Typography className="text-[14px] text-gray-500">
										No recent payments found.
									</Typography>
								)}
							</div>
						</Paper>
					</div>
				</div>
			</div>
		);
	};

	return (
		<AuthGuardRedirect auth={authRoles.finance}>
			<FusePageSimple
				content={
					<div className="mx-auto flex w-full max-w-7xl flex-col gap-32 px-24 py-32">{renderContent()}</div>
				}
			/>
		</AuthGuardRedirect>
	);
}
