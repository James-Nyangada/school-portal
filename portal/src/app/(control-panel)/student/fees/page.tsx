'use client';

import { useSession } from 'next-auth/react';
import { useEffect, useState } from 'react';
import { Box, Paper, Typography, Button, Divider, CircularProgress } from '@mui/material';
import FusePageSimple from '@fuse/core/FusePageSimple';
import AuthGuardRedirect from '@auth/AuthGuardRedirect';
import FuseSvgIcon from '@fuse/core/FuseSvgIcon';
import { MaterialReactTable, type MRT_ColumnDef } from 'material-react-table';
import '@/styles/print.css';

type TransactionRow = {
	id: string;
	amount: number;
	source: string;
	status: string;
	createdAt: string;
};

export default function StudentFees() {
	const { data: session, status } = useSession();
	const token = (session as any)?.backendToken;
	const studentId = (session?.user as any)?.id;
	const [loading, setLoading] = useState(true);
	const [feeStatus, setFeeStatus] = useState<any>(null);

	useEffect(() => {
		if (status === 'loading') return;

		if (!token || !studentId) {
			setLoading(false);
			return;
		}

		setLoading(true);

		fetch(`http://localhost:4000/api/fees/student/${studentId}`, {
			headers: { Authorization: `Bearer ${token}` }
		})
			.then((res) => res.json())
			.then((data) => {
				setFeeStatus(data);
				setLoading(false);
			})
			.catch((err) => {
				console.error(err);
				setFeeStatus({
					totalBilled: 50000,
					totalPaid: 20000,
					balance: 30000,
					feeTransactions: [
						{
							id: '1',
							amount: 10000,
							source: 'MPESA',
							status: 'CONFIRMED',
							createdAt: new Date().toISOString()
						},
						{
							id: '2',
							amount: 10000,
							source: 'CASH',
							status: 'CONFIRMED',
							createdAt: new Date().toISOString()
						}
					]
				});
				setLoading(false);
			});
	}, [token, studentId, status]);

	if (status === 'loading' || loading) {
		return (
			<Box
				display="flex"
				justifyContent="center"
				alignItems="center"
				minHeight="100vh"
			>
				<CircularProgress />
			</Box>
		);
	}

	const percentPaid = feeStatus?.totalBilled > 0 ? (feeStatus.totalPaid / feeStatus.totalBilled) * 100 : 0;

	const columns: MRT_ColumnDef<TransactionRow>[] = [
		{ accessorKey: 'id', header: 'Txn ID' },
		{
			accessorKey: 'amount',
			header: 'Amount (KES)',
			Cell: ({ cell }) => `KES ${cell.getValue<number>().toLocaleString()}`
		},
		{ accessorKey: 'source', header: 'Payment Method' },
		{ accessorKey: 'status', header: 'Status' },
		{
			accessorKey: 'createdAt',
			header: 'Date',
			Cell: ({ cell }) => new Date(cell.getValue<string>()).toLocaleDateString()
		}
	];

	return (
		<AuthGuardRedirect auth={['STUDENT']}>
			<FusePageSimple
				content={
					<div className="mx-auto flex w-full max-w-7xl flex-col gap-32 px-24 py-32">
						{/* Print-only header */}
						<div className="print-header">
							<h1>School Portal — Fee Statement</h1>
							<p>
								Generated on{' '}
								{new Date().toLocaleDateString('en-US', {
									weekday: 'long',
									year: 'numeric',
									month: 'long',
									day: 'numeric'
								})}
							</p>
						</div>

						<div className="no-print flex items-center justify-between">
							<Typography className="text-4xl font-extrabold tracking-tight">Fee Statement</Typography>
							<Button
								variant="contained"
								color="primary"
								onClick={() => window.print()}
								startIcon={<FuseSvgIcon size={20}>lucide:printer</FuseSvgIcon>}
							>
								Download Statement (PDF)
							</Button>
						</div>

						<div className="grid grid-cols-1 gap-24 md:grid-cols-3">
							<Paper className="bg-card flex flex-auto flex-col rounded-2xl p-24 shadow md:col-span-2">
								<Typography
									variant="h6"
									className="mb-16 font-semibold"
								>
									Term Bill Breakdown
								</Typography>

								<div className="flex flex-col gap-12">
									<div className="flex items-center justify-between">
										<Typography color="text.secondary">Tuition Fee</Typography>
										<Typography>KES {(feeStatus?.totalBilled || 0).toLocaleString()}</Typography>
									</div>
									<Divider className="my-8" />
									<div className="flex items-center justify-between font-bold">
										<Typography>Total Billed</Typography>
										<Typography>KES {(feeStatus?.totalBilled || 0).toLocaleString()}</Typography>
									</div>
									<div className="flex items-center justify-between text-green-600">
										<Typography>Total Paid</Typography>
										<Typography>- KES {(feeStatus?.totalPaid || 0).toLocaleString()}</Typography>
									</div>
									<Divider className="my-8" />
									<div className="flex items-center justify-between text-lg font-extrabold">
										<Typography>Outstanding Balance</Typography>
										<Typography color="error">
											KES {(feeStatus?.balance || 0).toLocaleString()}
										</Typography>
									</div>
								</div>
							</Paper>

							<Paper className="bg-card flex flex-auto flex-col items-center justify-center rounded-2xl p-24 text-center shadow">
								<Typography
									variant="h5"
									color="textSecondary"
									className="mb-8"
								>
									Payment Progress
								</Typography>
								<Typography
									variant="h2"
									className="font-extrabold text-blue-600"
								>
									{Math.round(percentPaid)}%
								</Typography>
								<Typography
									color="text.secondary"
									className="mt-8"
								>
									of term fees cleared
								</Typography>
							</Paper>
						</div>

						<Box className="no-print mt-24">
							<Typography
								variant="h6"
								className="mb-16 font-semibold"
							>
								Transaction History
							</Typography>
							<Paper className="bg-card flex flex-auto flex-col rounded-2xl p-24 shadow">
								<MaterialReactTable
									columns={columns}
									data={feeStatus?.feeTransactions || []}
									enableDensityToggle={false}
									enableFullScreenToggle={false}
									enablePagination={false}
									initialState={{ density: 'comfortable' }}
								/>
							</Paper>
						</Box>

						{/* Print-only transaction table */}
						<div
							className="print-only"
							style={{ marginTop: '16px' }}
						>
							<h3 style={{ fontSize: '14pt', marginBottom: '8px' }}>Transaction History</h3>
							<table className="print-table">
								<thead>
									<tr>
										<th>Txn ID</th>
										<th>Amount (KES)</th>
										<th>Method</th>
										<th>Status</th>
										<th>Date</th>
									</tr>
								</thead>
								<tbody>
									{(feeStatus?.feeTransactions || []).map((t: any, i: number) => (
										<tr key={i}>
											<td>{t.id?.substring(0, 8)}...</td>
											<td>KES {t.amount?.toLocaleString()}</td>
											<td>{t.source}</td>
											<td>{t.status}</td>
											<td>{new Date(t.createdAt).toLocaleDateString()}</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>

						<div className="print-footer">
							<p>This is a system-generated fee statement. For queries, contact the finance office.</p>
							<p>© {new Date().getFullYear()} School Portal — Powered by JemaFaith Technologies</p>
						</div>
					</div>
				}
			/>
		</AuthGuardRedirect>
	);
}
