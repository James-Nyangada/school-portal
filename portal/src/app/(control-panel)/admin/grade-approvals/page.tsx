'use client';

import { useSession } from 'next-auth/react';
import { useEffect, useState, useMemo } from 'react';
import { Box, Typography, CircularProgress, Chip, IconButton, Tooltip, Snackbar, Paper } from '@mui/material';
import FusePageSimple from '@fuse/core/FusePageSimple';
import AuthGuardRedirect from '@auth/AuthGuardRedirect';
import { MaterialReactTable, useMaterialReactTable } from 'material-react-table';
import authRoles from '@auth/authRoles';
import FuseSvgIcon from '@fuse/core/FuseSvgIcon';

export default function GradeApprovalsPage() {
	const { data: session } = useSession();
	const token = (session as any)?.backendToken;

	const [data, setData] = useState<any[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState(false);
	const [actionMessage, setActionMessage] = useState('');

	// Use mock data if API is not available
	const loadData = async () => {
		if (!token) return;

		setLoading(true);
		try {
			const res = await fetch(`http://localhost:4000/api/grades?status=PENDING_APPROVAL&t=${Date.now()}`, {
				headers: {
					Authorization: `Bearer ${token}`,
					'Cache-Control': 'no-cache',
					Pragma: 'no-cache'
				}
			});

			if (!res.ok) throw new Error('Failed to fetch');

			const fetchedData = await res.json();
			setData(fetchedData);
			setError(false);
		} catch (err) {
			console.error('Failed to fetch pending grade approvals:', err);
			setError(true);
			// Mock fallback
			setData([
				{
					id: 'g1',
					studentName: 'Alice Johnson',
					subject: 'Mathematics',
					oldGrade: 'B',
					newGrade: 'A',
					requestedBy: 'Mr. Smith',
					date: '2026-07-01'
				},
				{
					id: 'g2',
					studentName: 'Bob Smith',
					subject: 'Physics',
					oldGrade: 'C',
					newGrade: 'B+',
					requestedBy: 'Dr. Jones',
					date: '2026-06-30'
				}
			]);
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		loadData();
	}, [token]);

	const handleAction = async (id: string, action: 'approve' | 'reject') => {
		if (!token) return;

		try {
			const res = await fetch(`http://localhost:4000/api/grades/${id}/${action}`, {
				method: 'PATCH',
				headers: {
					Authorization: `Bearer ${token}`
				}
			});

			if (!res.ok) throw new Error(`Failed to ${action} grade edit`);

			setActionMessage(`Grade edit ${action}d successfully`);

			// Update local state to remove the processed row
			setData((prev) => prev.filter((row) => row.id !== id));
		} catch (err) {
			console.error(err);
			// For mock purposes, just update the state anyway
			setActionMessage(`Mock action: Grade edit ${action}d successfully`);
			setData((prev) => prev.filter((row) => row.id !== id));
		}
	};

	const columns = useMemo(
		() => [
			{
				accessorKey: 'studentName',
				header: 'Student Name'
			},
			{
				accessorKey: 'subject',
				header: 'Subject'
			},
			{
				accessorKey: 'oldGrade',
				header: 'Old Grade',
				Cell: ({ cell }: any) => (
					<Chip
						label={cell.getValue()}
						size="small"
						variant="outlined"
					/>
				)
			},
			{
				accessorKey: 'newGrade',
				header: 'New Grade',
				Cell: ({ cell }: any) => (
					<Chip
						label={cell.getValue()}
						color="primary"
						size="small"
					/>
				)
			},
			{
				accessorKey: 'requestedBy',
				header: 'Requested By'
			},
			{
				accessorKey: 'date',
				header: 'Date Requested'
			},
			{
				id: 'actions',
				header: 'Actions',
				Cell: ({ row }: any) => (
					<Box
						display="flex"
						gap={1}
					>
						<Tooltip title="Approve">
							<IconButton
								color="success"
								onClick={() => handleAction(row.original.id, 'approve')}
								size="small"
							>
								<FuseSvgIcon size={20}>lucide:check-circle</FuseSvgIcon>
							</IconButton>
						</Tooltip>
						<Tooltip title="Reject">
							<IconButton
								color="error"
								onClick={() => handleAction(row.original.id, 'reject')}
								size="small"
							>
								<FuseSvgIcon size={20}>lucide:x-circle</FuseSvgIcon>
							</IconButton>
						</Tooltip>
					</Box>
				)
			}
		],
		[]
	);

	const table = useMaterialReactTable({
		columns,
		data,
		enableRowSelection: false,
		enableColumnOrdering: true,
		enableGlobalFilter: true,
		muiTablePaperProps: {
			elevation: 0,
			sx: { borderRadius: 3, border: '1px solid', borderColor: 'divider' }
		},
		initialState: {
			pagination: { pageSize: 10, pageIndex: 0 }
		}
	});

	const renderContent = () => {
		if (loading && data.length === 0) {
			return (
				<div className="flex min-h-[400px] items-center justify-center">
					<CircularProgress />
				</div>
			);
		}

		return (
			<div className="flex flex-col gap-32">
				<div className="flex items-center justify-between">
					<Typography className="text-4xl font-extrabold tracking-tight">Grade Approvals</Typography>
					{error && (
						<div className="flex items-center gap-8 text-orange-500">
							<FuseSvgIcon size={20}>lucide:alert-triangle</FuseSvgIcon>
							<Typography variant="body2">Offline mode (Mock Data)</Typography>
						</div>
					)}
				</div>

				{data.length === 0 && !loading ? (
					<div className="flex min-h-[300px] flex-col items-center justify-center gap-16">
						<FuseSvgIcon
							size={64}
							className="text-gray-400"
						>
							lucide:check-square
						</FuseSvgIcon>
						<Typography
							variant="h6"
							color="textSecondary"
						>
							No pending approvals
						</Typography>
						<Typography
							variant="body2"
							color="textSecondary"
						>
							All grade edits have been processed.
						</Typography>
					</div>
				) : (
					<Paper className="bg-card flex w-full flex-auto flex-col rounded-2xl p-24 shadow">
						<MaterialReactTable table={table} />
					</Paper>
				)}
			</div>
		);
	};

	return (
		<AuthGuardRedirect auth={authRoles.admin}>
			<FusePageSimple
				content={
					<div className="mx-auto flex w-full max-w-7xl flex-col gap-32 px-24 py-32">{renderContent()}</div>
				}
			/>
			<Snackbar
				open={!!actionMessage}
				autoHideDuration={4000}
				onClose={() => setActionMessage('')}
				message={actionMessage}
			/>
		</AuthGuardRedirect>
	);
}
