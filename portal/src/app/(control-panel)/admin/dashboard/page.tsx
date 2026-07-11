'use client';

import { useSession } from 'next-auth/react';
import { useEffect, useState } from 'react';
import { Paper, Typography, Button, IconButton, Tab, Tabs } from '@mui/material';
import FusePageSimple from '@fuse/core/FusePageSimple';
import AuthGuardRedirect from '@auth/AuthGuardRedirect';
import FuseSvgIcon from '@fuse/core/FuseSvgIcon';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';
import { StatCard } from '@/components/dashboard/StatCard';
import { DonutCard } from '@/components/dashboard/DonutCard';
import { RecentActivityCard } from '@/components/dashboard/RecentActivityCard';
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

	const userDistributionData = [
		{ name: 'Admin', value: 10, fill: '#3b82f6' },
		{ name: 'Finance', value: 5, fill: '#f59e0b' },
		{ name: 'Parent', value: 45, fill: '#8b5cf6' },
		{ name: 'Student', value: 120, fill: '#ef4444' },
		{ name: 'Teacher', value: 20, fill: '#10b981' }
	];

	const renderContent = () => {
		if (loading) {
			return (
				<div className="flex min-h-400 flex-1 items-center justify-center">
					<FuseSvgIcon className="text-64 animate-spin" size={64}>
						lucide:loader-2
					</FuseSvgIcon>
				</div>
			);
		}

		return (
			<div className="mx-auto flex w-full max-w-[1400px] flex-col gap-6 px-6 py-8 bg-[#F8F9FA]">
				
				<div className="space-y-6">
					<div>
						<h1 className="text-2xl font-bold text-gray-900">Overview</h1>
						<p className="text-sm text-gray-500 mt-1">
							Monitor your platform's users and activity
						</p>
					</div>

					<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
						<StatCard
							icon="lucide:check-circle"
							iconColor="text-blue-600"
							iconBg="bg-blue-50"
							label="Due Tasks"
							value={25}
							caption="Tasks due today"
							footer={<p className="text-xs text-gray-500 pt-2 border-t border-gray-100">Completed: <span className="font-semibold text-gray-700">7</span></p>}
						/>
						<StatCard
							icon="lucide:alert-circle"
							iconColor="text-red-600"
							iconBg="bg-red-50"
							label="Overdue Tasks"
							value={4}
							caption="Past deadline"
							footer={<p className="text-xs text-gray-500 pt-2 border-t border-gray-100">Yesterday's overdue: <span className="font-semibold text-gray-700">2</span></p>}
						/>
						<StatCard
							icon="lucide:alert-triangle"
							iconColor="text-amber-600"
							iconBg="bg-amber-50"
							label="Open Issues"
							value={32}
							caption="Currently open"
							footer={<p className="text-xs text-gray-500 pt-2 border-t border-gray-100">Closed today: <span className="font-semibold text-gray-700">0</span></p>}
						/>
						<StatCard
							icon="lucide:zap"
							iconColor="text-teal-600"
							iconBg="bg-teal-50"
							label="Feature Proposals"
							value={42}
							caption="Requested features"
							footer={<p className="text-xs text-gray-500 pt-2 border-t border-gray-100">Implemented: <span className="font-semibold text-gray-700">8</span></p>}
						/>
					</div>

					<div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
						<DonutCard
							title="New vs. Returning"
							subtitle="Breakdown of users in 30 days"
							data={[
								{ label: 'New', value: 36868, color: '#3b82f6' },
								{ label: 'Returning', value: 9217, color: '#60a5fa' }
							]}
						/>
						
						<RecentActivityCard
							items={[
								{ title: 'Super Admin Admitted', timestamp: '2 hours ago', actor: 'System' },
								{ title: 'Student Registered', timestamp: '5 hours ago', actor: 'Parent' },
							]}
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
