'use client';

import { useSession } from 'next-auth/react';
import { useEffect, useState } from 'react';
import { Box, Paper, Typography, CircularProgress } from '@mui/material';
import FusePageSimple from '@fuse/core/FusePageSimple';
import AuthGuardRedirect from '@auth/AuthGuardRedirect';
import FuseSvgIcon from '@fuse/core/FuseSvgIcon';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { StatCard } from '@/components/dashboard/StatCard';
import { DonutCard } from '@/components/dashboard/DonutCard';
import { RecentActivityCard } from '@/components/dashboard/RecentActivityCard';

export default function SuperAdminDashboard() {
	const { data: session } = useSession();
	const token = (session as any)?.backendToken;
	const [data, setData] = useState<any>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState(false);

	useEffect(() => {
		if (!token) return;

		fetch(`http://localhost:4000/api/dashboard/stats?t=${Date.now()}`, {
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

	const renderContent = () => {
		if (loading) {
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

		if (error || !data) {
			return (
				<Box
					display="flex"
					flexDirection="column"
					justifyContent="center"
					alignItems="center"
					minHeight="400px"
					gap={2}
				>
					<FuseSvgIcon
						size={64}
						className="text-gray-400"
					>
						lucide:database
					</FuseSvgIcon>
					<Typography
						variant="h6"
						color="textSecondary"
					>
						No live data available yet
					</Typography>
					<Typography
						variant="body2"
						color="textSecondary"
					>
						Connect your backend to see real-time stats.
					</Typography>
				</Box>
			);
		}

		const pieData = [
			{ name: 'Admin', value: data.usersByRole.ADMIN || 0 },
			{ name: 'Teacher', value: data.usersByRole.TEACHER || 0 },
			{ name: 'Finance', value: data.usersByRole.FINANCE || 0 },
			{ name: 'Student', value: data.usersByRole.STUDENT || 0 },
			{ name: 'Parent', value: data.usersByRole.PARENT || 0 }
		];

		const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#14B8A6', '#8B5CF6'];

		return (
			<div className="space-y-6">
				<div>
					<h1 className="text-2xl font-bold text-gray-900">Overview</h1>
					<p className="text-sm text-gray-500 mt-1">Monitor your platform's users and activity</p>
				</div>

				<div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
					<StatCard
						icon="lucide:users"
						iconColor="text-blue-600"
						iconBg="bg-blue-50"
						label="Total Users"
						value={data.totalUsers}
						caption={<>Registered across all <strong className="font-semibold text-gray-700">roles</strong></>}
					/>
					<StatCard
						icon="lucide:graduation-cap"
						iconColor="text-emerald-600"
						iconBg="bg-emerald-50"
						label="Total Students"
						value={data.usersByRole.STUDENT || 0}
						caption={<>Currently <strong className="font-semibold text-gray-700">enrolled</strong></>}
					/>
					<StatCard
						icon="lucide:book-open"
						iconColor="text-amber-600"
						iconBg="bg-amber-50"
						label="Total Teachers"
						value={data.usersByRole.TEACHER || 0}
						caption={<>Active <strong className="font-semibold text-gray-700">educators</strong></>}
					/>
				</div>

				<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
					<DonutCard
						title="User Distribution"
						subtitle="Breakdown of roles"
						data={[
							{ label: 'Admin', value: data.usersByRole.ADMIN || 0, color: '#3B82F6' },
							{ label: 'Teacher', value: data.usersByRole.TEACHER || 0, color: '#10B981' },
							{ label: 'Finance', value: data.usersByRole.FINANCE || 0, color: '#F59E0B' },
							{ label: 'Student', value: data.usersByRole.STUDENT || 0, color: '#14B8A6' },
							{ label: 'Parent', value: data.usersByRole.PARENT || 0, color: '#8B5CF6' }
						]}
					/>
					<RecentActivityCard
						items={data.recentAuditLogs && data.recentAuditLogs.length > 0 ? data.recentAuditLogs.map((log: any) => ({
							title: log.details,
							timestamp: new Date(log.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
							actor: `${log.actor?.firstName} ${log.actor?.lastName}`
						})) : []}
					/>
				</div>
			</div>
		);
	};

	return (
		<AuthGuardRedirect auth={['SUPER_ADMIN']}>
			<FusePageSimple
				content={
					<div className="mx-auto flex w-full max-w-7xl flex-col gap-32 px-24 py-32">{renderContent()}</div>
				}
			/>
		</AuthGuardRedirect>
	);
}
