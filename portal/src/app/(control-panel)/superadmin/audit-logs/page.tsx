'use client';

import { useSession } from 'next-auth/react';
import { useEffect, useState, useMemo } from 'react';
import { Paper, Typography, Button, Chip } from '@mui/material';
import FusePageSimple from '@fuse/core/FusePageSimple';
import AuthGuardRedirect from '@auth/AuthGuardRedirect';
import FuseSvgIcon from '@fuse/core/FuseSvgIcon';
import { MaterialReactTable, type MRT_ColumnDef } from 'material-react-table';

export default function SuperAdminAuditLogs() {
	const { data: session } = useSession();
	const token = (session as any)?.backendToken;
	const [logs, setLogs] = useState<any[]>([]);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		if (!token) return;

		setLoading(true);
		fetch(`http://localhost:4000/api/audit-logs`, {
			headers: { Authorization: `Bearer ${token}` }
		})
			.then((res) => res.json())
			.then((data) => {
				setLogs(data.logs || []);
				setLoading(false);
			})
			.catch((err) => {
				console.error(err);
				setLoading(false);
			});
	}, [token]);

	const columns = useMemo<MRT_ColumnDef<any>[]>(
		() => [
			{
				accessorKey: 'createdAt',
				header: 'Timestamp',
				Cell: ({ cell }) => new Date(cell.getValue<string>()).toLocaleString()
			},
			{
				accessorFn: (row) => (row.actor ? `${row.actor.firstName} ${row.actor.lastName}` : 'System'),
				id: 'actor',
				header: 'Actor'
			},
			{
				accessorKey: 'action',
				header: 'Action',
				Cell: ({ cell }) => (
					<Chip
						label={cell.getValue<string>()}
						size="small"
						color="primary"
						variant="outlined"
					/>
				)
			},
			{
				accessorFn: (row) => (row.target ? `${row.target.firstName} ${row.target.lastName}` : 'N/A'),
				id: 'target',
				header: 'Target'
			},
			{
				accessorKey: 'details',
				header: 'Details'
			}
		],
		[]
	);

	return (
		<AuthGuardRedirect auth={['SUPER_ADMIN']}>
			<FusePageSimple
				content={
					<div className="mx-auto flex w-full max-w-7xl flex-col gap-32 px-24 py-32">
						<div className="flex w-full flex-0 flex-col sm:flex-row sm:items-center sm:justify-between">
							<div className="min-w-0 flex-1">
								<Typography className="text-4xl font-extrabold tracking-tight">Audit Logs</Typography>
							</div>
							<div className="mt-16 flex shrink-0 items-center sm:mt-0 sm:ml-24">
								<Button
									variant="outlined"
									color="secondary"
									startIcon={<FuseSvgIcon>lucide:download</FuseSvgIcon>}
									onClick={() => alert('Export to CSV not implemented yet')}
								>
									Export CSV
								</Button>
							</div>
						</div>

						<Paper className="bg-card flex flex-auto flex-col rounded-2xl p-24 shadow">
							<MaterialReactTable
								columns={columns}
								data={logs}
								state={{ isLoading: loading }}
								muiTablePaperProps={{ elevation: 0 }}
							/>
						</Paper>
					</div>
				}
			/>
		</AuthGuardRedirect>
	);
}
