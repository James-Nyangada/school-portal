'use client';

import { Paper, Typography, Table, TableBody, TableCell, TableContainer, TableHead, TableRow } from '@mui/material';
import FusePageSimple from '@fuse/core/FusePageSimple';
import AuthGuardRedirect from '@auth/AuthGuardRedirect';

const roles = ['SUPER_ADMIN', 'ADMIN', 'TEACHER', 'FINANCE', 'STUDENT', 'PARENT'];
const features = [
	{
		name: 'View own grades',
		perms: { SUPER_ADMIN: true, ADMIN: true, TEACHER: true, FINANCE: false, STUDENT: true, PARENT: true }
	},
	{
		name: 'Post/edit grades',
		perms: { SUPER_ADMIN: true, ADMIN: true, TEACHER: true, FINANCE: false, STUDENT: false, PARENT: false }
	},
	{
		name: 'Delete grades',
		perms: { SUPER_ADMIN: true, ADMIN: false, TEACHER: false, FINANCE: false, STUDENT: false, PARENT: false }
	},
	{
		name: 'View timetable',
		perms: { SUPER_ADMIN: true, ADMIN: true, TEACHER: true, FINANCE: false, STUDENT: true, PARENT: true }
	},
	{
		name: 'Create/edit timetable',
		perms: { SUPER_ADMIN: true, ADMIN: true, TEACHER: false, FINANCE: false, STUDENT: false, PARENT: false }
	},
	{
		name: 'Mark attendance',
		perms: { SUPER_ADMIN: true, ADMIN: true, TEACHER: true, FINANCE: false, STUDENT: false, PARENT: false }
	},
	{
		name: 'View attendance',
		perms: { SUPER_ADMIN: true, ADMIN: true, TEACHER: true, FINANCE: false, STUDENT: true, PARENT: true }
	},
	{
		name: 'Pay fees',
		perms: { SUPER_ADMIN: false, ADMIN: false, TEACHER: false, FINANCE: false, STUDENT: true, PARENT: true }
	},
	{
		name: 'View fee status',
		perms: { SUPER_ADMIN: true, ADMIN: true, TEACHER: false, FINANCE: true, STUDENT: true, PARENT: true }
	},
	{
		name: 'Record manual receipt',
		perms: { SUPER_ADMIN: true, ADMIN: true, TEACHER: false, FINANCE: true, STUDENT: false, PARENT: false }
	},
	{
		name: 'Admit new student',
		perms: { SUPER_ADMIN: true, ADMIN: true, TEACHER: false, FINANCE: false, STUDENT: false, PARENT: false }
	},
	{
		name: 'Manage users',
		perms: { SUPER_ADMIN: true, ADMIN: true, TEACHER: false, FINANCE: false, STUDENT: false, PARENT: false }
	},
	{
		name: 'System configuration',
		perms: { SUPER_ADMIN: true, ADMIN: false, TEACHER: false, FINANCE: false, STUDENT: false, PARENT: false }
	}
];

export default function SuperAdminRoles() {
	return (
		<AuthGuardRedirect auth={['SUPER_ADMIN']}>
			<FusePageSimple
				content={
					<div className="mx-auto flex w-full max-w-7xl flex-col gap-32 px-24 py-32">
						<div className="flex w-full flex-col">
							<Typography className="text-4xl font-extrabold tracking-tight">
								Roles & Permissions
							</Typography>
							<Typography className="text-secondary mt-8">
								Read-only matrix showing system access levels by role.
							</Typography>
						</div>
						<Paper className="bg-card flex flex-auto flex-col rounded-2xl p-24 shadow">
							<TableContainer>
								<Table>
									<TableHead sx={{ bgcolor: 'background.default' }}>
										<TableRow>
											<TableCell sx={{ fontWeight: 'bold' }}>Feature</TableCell>
											{roles.map((role) => (
												<TableCell
													key={role}
													align="center"
													sx={{ fontWeight: 'bold' }}
												>
													{role}
												</TableCell>
											))}
										</TableRow>
									</TableHead>
									<TableBody>
										{features.map((feature) => (
											<TableRow
												key={feature.name}
												hover
											>
												<TableCell>{feature.name}</TableCell>
												{roles.map((role) => (
													<TableCell
														key={role}
														align="center"
													>
														{feature.perms[role as keyof typeof feature.perms]
															? '✅'
															: '❌'}
													</TableCell>
												))}
											</TableRow>
										))}
									</TableBody>
								</Table>
							</TableContainer>
						</Paper>
					</div>
				}
			/>
		</AuthGuardRedirect>
	);
}
