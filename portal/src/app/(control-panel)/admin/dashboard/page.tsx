'use client';

import { signOut, useSession } from 'next-auth/react';
import { useEffect, useState } from 'react';
import FusePageSimple from '@fuse/core/FusePageSimple';
import AuthGuardRedirect from '@auth/AuthGuardRedirect';
import FuseSvgIcon from '@fuse/core/FuseSvgIcon';
import { StatCard } from '@/components/dashboard/StatCard';
import { DonutCard } from '@/components/dashboard/DonutCard';
import { RecentActivityCard } from '@/components/dashboard/RecentActivityCard';
import { SystemAlert, SystemAlerts } from '@/components/dashboard/SystemAlerts';
import { UpcomingEventsCard } from '@/components/dashboard/UpcomingEventsCard';
import { BACKEND_URL } from '@/lib/backend';

const formatKes = (amount: number) => `KES ${amount.toLocaleString('en-KE', { maximumFractionDigits: 0 })}`;

export default function AdminDashboard() {
	const { data: session } = useSession();
	const token = (session as any)?.backendToken;
	const [data, setData] = useState<any>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState(false);

	useEffect(() => {
		if (!token) {
			setLoading(false);
			return;
		}

		fetch(`${BACKEND_URL}/api/dashboard/stats?t=${Date.now()}`, {
			headers: {
				Authorization: `Bearer ${token}`,
				'Cache-Control': 'no-cache',
				Pragma: 'no-cache'
			}
		})
			.then((res) => {
				if (res.status === 401) {
					signOut({ callbackUrl: '/sign-in' });
					return null;
				}

				if (!res.ok) throw new Error(`Failed to fetch dashboard stats (${res.status})`);

				return res.json();
			})
			.then((data) => {
				if (!data) return;

				setData(data);
				setLoading(false);
			})
			.catch((err) => {
				console.error(err);
				setError(true);
				setLoading(false);
			});
	}, [token]);

	const attendance = data?.attendanceToday;
	const fees = data?.fees;
	const approvals = data?.approvals;

	const roles = data?.usersByRole ?? {};
	// Admins see the operational alerts; login spikes are the Super Admin's to handle
	const alerts: SystemAlert[] = (data?.alerts ?? []).filter((a: SystemAlert) => a.key !== 'failed-logins');

	const renderContent = () => {
		if (loading) {
			return (
				<div className="flex min-h-400 flex-1 items-center justify-center">
					<FuseSvgIcon
						className="text-64 animate-spin"
						size={64}
					>
						lucide:loader-circle
					</FuseSvgIcon>
				</div>
			);
		}

		if (error) {
			return (
				<div className="flex min-h-400 flex-1 flex-col items-center justify-center gap-2 text-center">
					<FuseSvgIcon
						size={48}
						className="text-gray-400"
					>
						lucide:cloud-off
					</FuseSvgIcon>
					<p className="text-lg font-semibold text-gray-700">Couldn&apos;t load the overview</p>
					<p className="text-sm text-gray-500">Check that the server is running, then refresh the page.</p>
				</div>
			);
		}

		return (
			<div className="mx-auto flex w-full max-w-[1400px] flex-col gap-6 bg-[#F8F9FA] px-6 py-8">
				<div className="space-y-6">
					<div>
						<h1 className="text-2xl font-bold text-gray-900">Overview</h1>
						<p className="mt-1 text-sm text-gray-500">
							Today at a glance: admissions, attendance, fees and approvals
						</p>
					</div>

					<SystemAlerts alerts={alerts} />

					<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
						<StatCard
							icon="lucide:graduation-cap"
							iconColor="text-blue-600"
							iconBg="bg-blue-50"
							label="Active Students"
							value={data?.students?.active ?? 0}
							caption="Currently enrolled"
							footer={
								<p className="border-t border-gray-100 pt-2 text-xs text-gray-500">
									New this term:{' '}
									<span className="font-semibold text-gray-700">
										{data?.students?.newThisTerm ?? data?.students?.newThisMonth ?? 0}
									</span>
									{data?.students?.newThisTerm == null &&
										' (this month; set term dates for a term count)'}
								</p>
							}
						/>
						<StatCard
							icon="lucide:calendar-check"
							iconColor="text-emerald-600"
							iconBg="bg-emerald-50"
							label="Attendance Today"
							value={attendance?.rate != null ? `${attendance.rate}%` : '—'}
							caption={
								attendance?.marked
									? `Across ${attendance.marked} lesson marks`
									: 'No registers marked yet'
							}
							footer={
								<p className="border-t border-gray-100 pt-2 text-xs text-gray-500">
									Students absent:{' '}
									<span className="font-semibold text-gray-700">
										{attendance?.absentStudents ?? 0}
									</span>
								</p>
							}
						/>
						<StatCard
							icon="lucide:wallet"
							iconColor="text-amber-600"
							iconBg="bg-amber-50"
							label="Fee Collection"
							value={`${fees?.collectionRate ?? 0}%`}
							caption={`${formatKes(fees?.outstanding ?? 0)} outstanding · ${fees?.term ?? 'this term'}`}
							footer={
								<p className="border-t border-gray-100 pt-2 text-xs text-gray-500">
									Collected today:{' '}
									<span className="font-semibold text-gray-700">
										{formatKes(fees?.collectedToday ?? 0)}
									</span>
								</p>
							}
						/>
						<StatCard
							icon="lucide:clipboard-check"
							iconColor={approvals?.overdue ? 'text-red-600' : 'text-teal-600'}
							iconBg={approvals?.overdue ? 'bg-red-50' : 'bg-teal-50'}
							label="Grade Approvals"
							value={approvals?.pending ?? 0}
							caption="Awaiting your review"
							footer={
								<p className="border-t border-gray-100 pt-2 text-xs text-gray-500">
									Older than {approvals?.slaHours ?? 48}h:{' '}
									<span
										className={`font-semibold ${approvals?.overdue ? 'text-red-600' : 'text-gray-700'}`}
									>
										{approvals?.overdue ?? 0}
									</span>
								</p>
							}
						/>
					</div>

					<div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
						<DonutCard
							title="User distribution"
							subtitle="Accounts by role, live"
							data={[
								{ label: 'Admin', value: roles.ADMIN ?? 0, color: '#3b82f6' },
								{ label: 'Teacher', value: roles.TEACHER ?? 0, color: '#10b981' },
								{ label: 'Finance', value: roles.FINANCE ?? 0, color: '#f59e0b' },
								{ label: 'Student', value: roles.STUDENT ?? 0, color: '#ef4444' },
								{ label: 'Parent', value: roles.PARENT ?? 0, color: '#8b5cf6' }
							]}
						/>

						<UpcomingEventsCard
							events={data?.upcomingEvents ?? []}
							settingsHref="/admin/settings"
						/>

						<RecentActivityCard
							items={
								data?.recentAuditLogs && data.recentAuditLogs.length > 0
									? data.recentAuditLogs.map((log: any) => ({
											action: log.action,
											title: log.details ?? log.action,
											timestamp: new Date(log.createdAt).toLocaleDateString(undefined, {
												month: 'short',
												day: 'numeric',
												hour: '2-digit',
												minute: '2-digit'
											}),
											actor: log.actor
												? `${log.actor.firstName} ${log.actor.lastName}`
												: undefined
										}))
									: []
							}
						/>
					</div>
				</div>
			</div>
		);
	};

	return (
		<AuthGuardRedirect auth={['SUPER_ADMIN', 'ADMIN']}>
			<FusePageSimple content={renderContent()} />
		</AuthGuardRedirect>
	);
}
