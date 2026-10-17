'use client';

import { useSession } from 'next-auth/react';
import { useEffect, useState } from 'react';
import { Box, Typography, CircularProgress } from '@mui/material';
import FusePageSimple from '@fuse/core/FusePageSimple';
import AuthGuardRedirect from '@auth/AuthGuardRedirect';
import FuseSvgIcon from '@fuse/core/FuseSvgIcon';
import { StatCard } from '@/components/dashboard/StatCard';
import { DonutCard } from '@/components/dashboard/DonutCard';
import { RecentActivityCard } from '@/components/dashboard/RecentActivityCard';
import { SystemAlert, SystemAlerts } from '@/components/dashboard/SystemAlerts';
import { BACKEND_URL } from '@/lib/backend';

const formatKes = (amount: number) => `KES ${amount.toLocaleString('en-KE', { maximumFractionDigits: 0 })}`;
const formatDateTime = (iso: string) =>
	new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

function formatUptime(seconds: number) {
	const d = Math.floor(seconds / 86_400);
	const h = Math.floor((seconds % 86_400) / 3_600);
	const m = Math.floor((seconds % 3_600) / 60);

	return d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export default function SuperAdminDashboard() {
	const { data: session } = useSession();
	const token = (session as any)?.backendToken;
	const [data, setData] = useState<any>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState(false);

	useEffect(() => {
		if (!token) return;

		fetch(`${BACKEND_URL}/api/dashboard/stats?t=${Date.now()}`, {
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

		const roles = data.usersByRole;
		const fees = data.fees;
		const system = data.system;
		const alerts: SystemAlert[] = data.alerts ?? [];
		const reviewAlert = alerts.find((a) => a.key === 'mpesa-reconciliation');

		return (
			<div className="space-y-6">
				<div>
					<h1 className="text-2xl font-bold text-gray-900">Overview</h1>
					<p className="mt-1 text-sm text-gray-500">
						System health, users and anything that needs your attention
					</p>
				</div>

				<SystemAlerts alerts={alerts} />

				<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
					<StatCard
						icon="lucide:users"
						iconColor="text-blue-600"
						iconBg="bg-blue-50"
						label="Total Users"
						value={data.totalUsers}
						caption={`${roles.ADMIN} admins · ${roles.TEACHER} teachers · ${roles.FINANCE} finance`}
						footer={
							<p className="border-t border-gray-100 pt-2 text-xs text-gray-500">
								Students <span className="font-semibold text-gray-700">{roles.STUDENT}</span> · Parents{' '}
								<span className="font-semibold text-gray-700">{roles.PARENT}</span>
							</p>
						}
					/>
					<StatCard
						icon="lucide:wallet"
						iconColor="text-amber-600"
						iconBg="bg-amber-50"
						label={`Fees collected · ${fees.term}`}
						value={formatKes(fees.collected)}
						caption={`${fees.collectionRate}% of the ${formatKes(fees.billed)} target billed this term`}
						footer={
							<div className="border-t border-gray-100 pt-2">
								<div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
									<div
										className="h-full rounded-full bg-amber-500"
										style={{ width: `${Math.min(100, fees.collectionRate)}%` }}
									/>
								</div>
							</div>
						}
					/>
					<StatCard
						icon="lucide:activity"
						iconColor="text-emerald-600"
						iconBg="bg-emerald-50"
						label="System"
						value={formatUptime(system.apiUptimeSeconds)}
						caption={`API up since ${formatDateTime(system.apiStartedAt)} · database ${system.databaseLatencyMs} ms`}
						footer={
							<p className="border-t border-gray-100 pt-2 text-xs text-gray-500">
								Last backup:{' '}
								<span className="font-semibold text-gray-700">
									{system.lastBackupAt
										? formatDateTime(system.lastBackupAt)
										: 'managed by Supabase (not reported)'}
								</span>
							</p>
						}
					/>
					<StatCard
						icon="lucide:triangle-alert"
						iconColor={data.approvals.overdue || reviewAlert ? 'text-red-600' : 'text-teal-600'}
						iconBg={data.approvals.overdue || reviewAlert ? 'bg-red-50' : 'bg-teal-50'}
						label="Pending items"
						value={data.approvals.overdue + (reviewAlert?.count ?? 0)}
						caption={`${data.approvals.overdue} grade approval(s) past ${data.approvals.slaHours}h · ${reviewAlert?.count ?? 0} payment(s) to reconcile`}
						footer={
							<p className="border-t border-gray-100 pt-2 text-xs text-gray-500">
								Last reconciliation:{' '}
								<span className="font-semibold text-gray-700">
									{system.lastReconciliationAt
										? formatDateTime(system.lastReconciliationAt)
										: 'not run yet'}
								</span>
							</p>
						}
					/>
				</div>

				<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
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
						items={
							data.recentAuditLogs && data.recentAuditLogs.length > 0
								? data.recentAuditLogs.map((log: any) => ({
										title: log.details,
										timestamp: new Date(log.createdAt).toLocaleDateString(undefined, {
											month: 'short',
											day: 'numeric',
											hour: '2-digit',
											minute: '2-digit'
										}),
										actor: `${log.actor?.firstName} ${log.actor?.lastName}`
									}))
								: []
						}
					/>
				</div>
			</div>
		);
	};

	return (
		<AuthGuardRedirect auth={['SUPER_ADMIN']}>
			<FusePageSimple
				content={
					<div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8">
						{renderContent()}
					</div>
				}
			/>
		</AuthGuardRedirect>
	);
}
