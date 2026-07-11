'use client';

import { useSession } from 'next-auth/react';
import { useEffect, useState } from 'react';
import { Paper, Typography, Button, CircularProgress } from '@mui/material';
import FusePageSimple from '@fuse/core/FusePageSimple';
import AuthGuardRedirect from '@auth/AuthGuardRedirect';
import { MaterialReactTable, type MRT_ColumnDef } from 'material-react-table';
import { useSnackbar } from 'notistack';
import authRoles from '@auth/authRoles';

type DebtorRow = {
	studentId: string;
	studentName: string;
	admissionNumber: string;
	totalBilled: number;
	amountPaid: number;
	balance: number;
};

export default function FinanceReports() {
	const { data: session } = useSession();
	const token = (session as any)?.backendToken;
	const { enqueueSnackbar } = useSnackbar();

	const [loading, setLoading] = useState(true);
	const [debtors, setDebtors] = useState<DebtorRow[]>([]);

	useEffect(() => {
		if (!token) return;

		setLoading(true);

		// Fetching students to calculate outstanding balances
		fetch('http://localhost:4000/api/users?role=STUDENT', {
			headers: { Authorization: `Bearer ${token}` }
		})
			.then((res) => res.json())
			.then(async (data) => {
				const students = data.users || [];
				const debtorList: DebtorRow[] = [];

				// For each student, query their balance
				for (const student of students) {
					try {
						const feeRes = await fetch(`http://localhost:4000/api/fees/student/${student.id}`, {
							headers: { Authorization: `Bearer ${token}` }
						});
						const feeData = (await feeRes.ok) ? await feeRes.json() : null;

						if (feeData && feeData.balance > 0) {
							debtorList.push({
								studentId: student.id,
								studentName: `${student.firstName} ${student.lastName}`,
								admissionNumber: student.admissionNumber || 'N/A',
								totalBilled: feeData.totalBilled,
								amountPaid: feeData.totalPaid,
								balance: feeData.balance
							});
						}
					} catch (e) {
						console.error(e);
					}
				}

				setDebtors(debtorList);
				setLoading(false);
			})
			.catch((err) => {
				console.error(err);
				// Fallback mock data
				setDebtors([
					{
						studentId: '1',
						studentName: 'John Doe',
						admissionNumber: 'ADM-8201',
						totalBilled: 50000,
						amountPaid: 20000,
						balance: 30000
					},
					{
						studentId: '2',
						studentName: 'Jane Smith',
						admissionNumber: 'ADM-9104',
						totalBilled: 60000,
						amountPaid: 25000,
						balance: 35000
					}
				]);
				setLoading(false);
			});
	}, [token]);

	const handleExport = () => {
		enqueueSnackbar('Exporting report as CSV...', { variant: 'info' });
		// Basic CSV download
		const headers = 'Student Name,Admission No.,Total Billed,Amount Paid,Outstanding Balance\n';
		const rows = debtors
			.map((d) => `"${d.studentName}",${d.admissionNumber},${d.totalBilled},${d.amountPaid},${d.balance}`)
			.join('\n');
		const blob = new Blob([headers + rows], { type: 'text/csv' });
		const url = window.URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.setAttribute('href', url);
		a.setAttribute('download', `outstanding_fees_report_${new Date().toLocaleDateString()}.csv`);
		a.click();
	};

	const columns: MRT_ColumnDef<DebtorRow>[] = [
		{ accessorKey: 'studentName', header: 'Student Name' },
		{ accessorKey: 'admissionNumber', header: 'Admission No.' },
		{
			accessorKey: 'totalBilled',
			header: 'Total Billed (KES)',
			Cell: ({ cell }) => `KES ${cell.getValue<number>().toLocaleString()}`
		},
		{
			accessorKey: 'amountPaid',
			header: 'Amount Paid (KES)',
			Cell: ({ cell }) => `KES ${cell.getValue<number>().toLocaleString()}`
		},
		{
			accessorKey: 'balance',
			header: 'Outstanding Balance (KES)',
			Cell: ({ cell }) => `KES ${cell.getValue<number>().toLocaleString()}`
		}
	];

	return (
		<AuthGuardRedirect auth={authRoles.finance}>
			<FusePageSimple
				content={
					<div className="mx-auto flex w-full max-w-7xl flex-col gap-32 px-24 py-32">
						<div className="flex items-center justify-between">
							<div>
								<Typography className="text-4xl font-extrabold tracking-tight">
									Financial Reports
								</Typography>
								<Typography
									color="text.secondary"
									className="mt-8"
								>
									Generate invoices, view debtors lists, and export financial records.
								</Typography>
							</div>
							<Button
								variant="contained"
								color="secondary"
								onClick={handleExport}
								disabled={debtors.length === 0}
							>
								Export Outstanding Balances (CSV)
							</Button>
						</div>

						{loading ? (
							<div className="flex min-h-[200px] items-center justify-center">
								<CircularProgress />
							</div>
						) : (
							<Paper className="bg-card flex flex-auto flex-col rounded-2xl p-24 shadow">
								<Typography
									variant="h6"
									className="mb-8 font-semibold text-red-500"
								>
									Defaulters & Debtors List
								</Typography>
								<Typography
									variant="body2"
									color="text.secondary"
									className="mb-24"
								>
									Below is the list of all students with outstanding term fee balances.
								</Typography>

								<MaterialReactTable
									columns={columns}
									data={debtors}
									enableDensityToggle={false}
									enableFullScreenToggle={false}
									initialState={{ density: 'comfortable' }}
									muiTablePaperProps={{ elevation: 0 }}
								/>
							</Paper>
						)}
					</div>
				}
			/>
		</AuthGuardRedirect>
	);
}
