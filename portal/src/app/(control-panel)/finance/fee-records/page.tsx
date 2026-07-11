'use client';

import { useSession } from 'next-auth/react';
import { useEffect, useState, useMemo } from 'react';
import { Box, Typography, CircularProgress, Chip, Paper } from '@mui/material';
import FusePageSimple from '@fuse/core/FusePageSimple';
import AuthGuardRedirect from '@auth/AuthGuardRedirect';
import { MaterialReactTable, useMaterialReactTable } from 'material-react-table';
import authRoles from '@auth/authRoles';
import FuseSvgIcon from '@fuse/core/FuseSvgIcon';

export default function FeeRecordsPage() {
	const { data: session } = useSession();
	const token = (session as any)?.backendToken;
	const [data, setData] = useState<any[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState(false);

	useEffect(() => {
		if (!token) return;

		fetch(`http://localhost:4000/api/fees?t=${Date.now()}`, {
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
			.then((fetchedData) => {
				setData(fetchedData);
				setLoading(false);
			})
			.catch((err) => {
				console.error('Failed to fetch fee records:', err);
				setError(true);
				setLoading(false);
			});
	}, [token]);

	// Fallback mock data if API fails or returns no data
	const tableData =
		error || data.length === 0
			? [
					{
						id: '1',
						studentName: 'Alice Johnson',
						grade: 'Grade 10',
						totalFee: 5000,
						paid: 4500,
						balance: 500,
						status: 'PARTIAL'
					},
					{
						id: '2',
						studentName: 'Bob Smith',
						grade: 'Grade 11',
						totalFee: 5500,
						paid: 5500,
						balance: 0,
						status: 'PAID'
					},
					{
						id: '3',
						studentName: 'Charlie Davis',
						grade: 'Grade 9',
						totalFee: 4800,
						paid: 1000,
						balance: 3800,
						status: 'UNPAID'
					},
					{
						id: '4',
						studentName: 'Diana Prince',
						grade: 'Grade 12',
						totalFee: 6000,
						paid: 6000,
						balance: 0,
						status: 'PAID'
					},
					{
						id: '5',
						studentName: 'Evan Wright',
						grade: 'Grade 10',
						totalFee: 5000,
						paid: 2500,
						balance: 2500,
						status: 'PARTIAL'
					}
				]
			: data;

	const columns = useMemo(
		() => [
			{
				accessorKey: 'studentName',
				header: 'Student Name'
			},
			{
				accessorKey: 'grade',
				header: 'Grade'
			},
			{
				accessorKey: 'totalFee',
				header: 'Total Fee ($)',
				Cell: ({ cell }: any) => <span>${cell.getValue()}</span>
			},
			{
				accessorKey: 'paid',
				header: 'Amount Paid ($)',
				Cell: ({ cell }: any) => <span className="text-green-600">${cell.getValue()}</span>
			},
			{
				accessorKey: 'balance',
				header: 'Balance ($)',
				Cell: ({ cell }: any) => {
					const val = cell.getValue();
					return <span className={val > 0 ? 'font-bold text-red-600' : ''}>${val}</span>;
				}
			},
			{
				accessorKey: 'status',
				header: 'Status',
				Cell: ({ cell }: any) => {
					const status = cell.getValue();
					let color: 'success' | 'warning' | 'error' | 'default' = 'default';

					if (status === 'PAID') color = 'success';

					if (status === 'PARTIAL') color = 'warning';

					if (status === 'UNPAID') color = 'error';

					return (
						<Chip
							label={status}
							color={color}
							size="small"
						/>
					);
				}
			}
		],
		[]
	);

	const table = useMaterialReactTable({
		columns,
		data: tableData,
		enableRowSelection: false,
		enableColumnOrdering: true,
		enableGlobalFilter: true,
		muiTablePaperProps: {
			elevation: 0,
			sx: { borderRadius: 0 }
		}
	});

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

		return (
			<>
				<div className="flex items-center justify-between">
					<Typography className="text-4xl font-extrabold tracking-tight">Fee Records</Typography>
					{error && (
						<div className="flex items-center gap-8 text-amber-600">
							<FuseSvgIcon size={20}>lucide:alert-triangle</FuseSvgIcon>
							<Typography variant="body2">Using offline/mock data</Typography>
						</div>
					)}
				</div>
				<Paper className="bg-card mt-32 flex flex-auto flex-col rounded-2xl p-24 shadow">
					<MaterialReactTable table={table} />
				</Paper>
			</>
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
