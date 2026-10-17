'use client';

import { useMemo, useState } from 'react';
import { Button, MenuItem, Paper, Tab, Tabs, TextField, Typography } from '@mui/material';
import FusePageSimple from '@fuse/core/FusePageSimple';
import AuthGuardRedirect from '@auth/AuthGuardRedirect';
import FuseSvgIcon from '@fuse/core/FuseSvgIcon';
import { MaterialReactTable, type MRT_ColumnDef } from 'material-react-table';
import authRoles from '@auth/authRoles';
import {
	FeeRecordsResponse,
	FeeRow,
	PAYMENT_METHOD_LABELS,
	Payment,
	PaymentMethod,
	downloadCsv,
	formatDate,
	formatKES,
	useBackend
} from '@/lib/finance';

const today = () => new Date().toISOString().slice(0, 10);
const monthStart = () => {
	const d = new Date();
	return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
};

function ErrorBox({ error, onRetry }: { error: string; onRetry: () => void }) {
	return (
		<div className="flex flex-col items-center gap-3 p-8 text-center">
			<Typography color="error">{error}</Typography>
			<Button
				variant="outlined"
				onClick={onRetry}
			>
				Try again
			</Button>
		</div>
	);
}

function DebtorsReport() {
	const [term, setTerm] = useState('ALL');
	const [classFilter, setClassFilter] = useState('ALL');
	const { data, error, loading, reload } = useBackend<FeeRecordsResponse>(
		`/api/finance/records?term=${encodeURIComponent(term)}`
	);

	const classes = useMemo(
		() => [...new Set((data?.rows ?? []).map((r) => r.className).filter((c): c is string => !!c))].sort(),
		[data]
	);
	const debtors = useMemo(
		() =>
			(data?.rows ?? [])
				.filter((r) => r.balance > 0 && (classFilter === 'ALL' || r.className === classFilter))
				.sort((a, b) => b.balance - a.balance),
		[data, classFilter]
	);
	const totalOwed = debtors.reduce((a, d) => a + d.balance, 0);

	const columns = useMemo<MRT_ColumnDef<FeeRow>[]>(
		() => [
			{ accessorKey: 'studentName', header: 'Student' },
			{ accessorKey: 'admissionNumber', header: 'Adm. No.', Cell: ({ cell }) => cell.getValue<string>() || '—' },
			{ accessorKey: 'className', header: 'Class', Cell: ({ cell }) => cell.getValue<string>() || '—' },
			{
				accessorKey: 'totalBilled',
				header: 'Billed (KES)',
				Cell: ({ cell }) => formatKES(cell.getValue<number>())
			},
			{ accessorKey: 'amountPaid', header: 'Paid (KES)', Cell: ({ cell }) => formatKES(cell.getValue<number>()) },
			{
				accessorKey: 'balance',
				header: 'Outstanding (KES)',
				Cell: ({ cell }) => <span className="font-bold text-red-600">{formatKES(cell.getValue<number>())}</span>
			}
		],
		[]
	);

	const exportCsv = () =>
		downloadCsv(
			`outstanding_fees_${term === 'ALL' ? 'all_terms' : term.replace(/\s+/g, '_')}_${today()}.csv`,
			['Student', 'Admission No.', 'Class', 'Billed (KES)', 'Paid (KES)', 'Outstanding (KES)'],
			debtors.map((d) => [d.studentName, d.admissionNumber, d.className, d.totalBilled, d.amountPaid, d.balance])
		);

	if (error)
		return (
			<ErrorBox
				error={error}
				onRetry={reload}
			/>
		);

	return (
		<div className="flex flex-col gap-4">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<div className="flex flex-wrap gap-3">
					<TextField
						select
						size="small"
						label="Term"
						value={term}
						onChange={(e) => setTerm(e.target.value)}
						className="min-w-40"
					>
						<MenuItem value="ALL">All terms</MenuItem>
						{(data?.terms ?? []).map((t) => (
							<MenuItem
								key={t}
								value={t}
							>
								{t}
							</MenuItem>
						))}
					</TextField>
					<TextField
						select
						size="small"
						label="Class"
						value={classFilter}
						onChange={(e) => setClassFilter(e.target.value)}
						className="min-w-40"
					>
						<MenuItem value="ALL">All classes</MenuItem>
						{classes.map((c) => (
							<MenuItem
								key={c}
								value={c}
							>
								{c}
							</MenuItem>
						))}
					</TextField>
				</div>
				<div className="flex items-center gap-4">
					<Typography className="text-sm text-gray-600">
						{debtors.length} students owe <strong className="text-red-600">{formatKES(totalOwed)}</strong>
					</Typography>
					<Button
						variant="contained"
						color="secondary"
						onClick={exportCsv}
						disabled={debtors.length === 0}
						startIcon={<FuseSvgIcon size={18}>lucide:download</FuseSvgIcon>}
					>
						Export CSV
					</Button>
				</div>
			</div>
			<MaterialReactTable
				columns={columns}
				data={debtors}
				state={{ isLoading: loading }}
				enableDensityToggle={false}
				enableFullScreenToggle={false}
				initialState={{ pagination: { pageSize: 25, pageIndex: 0 } }}
				muiTablePaperProps={{ elevation: 0 }}
			/>
		</div>
	);
}

function PaymentsReport() {
	const [from, setFrom] = useState(monthStart);
	const [to, setTo] = useState(today);
	const [method, setMethod] = useState<'ALL' | PaymentMethod>('ALL');

	const query = new URLSearchParams({
		...(from && { from }),
		...(to && { to }),
		...(method !== 'ALL' && { method })
	});
	const { data, error, loading, reload } = useBackend<{ transactions: Payment[] }>(
		`/api/finance/transactions?${query}`
	);
	const payments = data?.transactions ?? [];
	const total = payments.reduce((a, p) => a + p.amount, 0);

	const columns = useMemo<MRT_ColumnDef<Payment>[]>(
		() => [
			{ accessorKey: 'date', header: 'Date', Cell: ({ cell }) => formatDate(cell.getValue<string>()) },
			{ accessorKey: 'studentName', header: 'Student' },
			{ accessorKey: 'admissionNumber', header: 'Adm. No.', Cell: ({ cell }) => cell.getValue<string>() || '—' },
			{
				accessorKey: 'method',
				header: 'Method',
				Cell: ({ cell }) => PAYMENT_METHOD_LABELS[cell.getValue<PaymentMethod>()]
			},
			{ accessorKey: 'receiptNumber', header: 'Reference', Cell: ({ cell }) => cell.getValue<string>() || '—' },
			{ accessorKey: 'recordedBy', header: 'Recorded by' },
			{
				accessorKey: 'amount',
				header: 'Amount (KES)',
				Cell: ({ cell }) => (
					<span className="font-semibold text-green-600">{formatKES(cell.getValue<number>())}</span>
				)
			}
		],
		[]
	);

	const exportCsv = () =>
		downloadCsv(
			`fee_payments_${from || 'start'}_to_${to || today()}.csv`,
			['Date', 'Student', 'Admission No.', 'Method', 'Reference', 'Recorded by', 'Amount (KES)'],
			payments.map((p) => [
				new Date(p.date).toISOString().slice(0, 10),
				p.studentName,
				p.admissionNumber,
				PAYMENT_METHOD_LABELS[p.method],
				p.receiptNumber,
				p.recordedBy,
				p.amount
			])
		);

	return (
		<div className="flex flex-col gap-4">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<div className="flex flex-wrap gap-3">
					<TextField
						type="date"
						size="small"
						label="From"
						value={from}
						onChange={(e) => setFrom(e.target.value)}
						slotProps={{ inputLabel: { shrink: true } }}
					/>
					<TextField
						type="date"
						size="small"
						label="To"
						value={to}
						onChange={(e) => setTo(e.target.value)}
						slotProps={{ inputLabel: { shrink: true } }}
					/>
					<TextField
						select
						size="small"
						label="Method"
						value={method}
						onChange={(e) => setMethod(e.target.value as typeof method)}
						className="min-w-36"
					>
						<MenuItem value="ALL">All methods</MenuItem>
						{Object.entries(PAYMENT_METHOD_LABELS).map(([value, label]) => (
							<MenuItem
								key={value}
								value={value}
							>
								{label}
							</MenuItem>
						))}
					</TextField>
				</div>
				<div className="flex items-center gap-4">
					<Typography className="text-sm text-gray-600">
						{payments.length} payments totalling{' '}
						<strong className="text-green-600">{formatKES(total)}</strong>
					</Typography>
					<Button
						variant="contained"
						color="secondary"
						onClick={exportCsv}
						disabled={payments.length === 0}
						startIcon={<FuseSvgIcon size={18}>lucide:download</FuseSvgIcon>}
					>
						Export CSV
					</Button>
				</div>
			</div>
			{error ? (
				<ErrorBox
					error={error}
					onRetry={reload}
				/>
			) : (
				<MaterialReactTable
					columns={columns}
					data={payments}
					state={{ isLoading: loading }}
					enableDensityToggle={false}
					enableFullScreenToggle={false}
					initialState={{ pagination: { pageSize: 25, pageIndex: 0 } }}
					muiTablePaperProps={{ elevation: 0 }}
				/>
			)}
		</div>
	);
}

export default function FinanceReports() {
	const [tab, setTab] = useState<'debtors' | 'payments'>('debtors');

	return (
		<AuthGuardRedirect auth={authRoles.finance}>
			<FusePageSimple
				content={
					<div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8">
						<div>
							<Typography className="text-3xl font-extrabold tracking-tight">
								Financial Reports
							</Typography>
							<Typography className="mt-1 text-sm text-gray-500">
								Debtors lists and payment ledgers, exportable to CSV.
							</Typography>
						</div>

						<Paper className="flex flex-col rounded-2xl shadow-sm">
							<Tabs
								value={tab}
								onChange={(_, v) => setTab(v)}
								className="border-b border-gray-200 px-4"
							>
								<Tab
									value="debtors"
									label="Outstanding balances"
								/>
								<Tab
									value="payments"
									label="Payments received"
								/>
							</Tabs>
							<div className="p-4 sm:p-6">
								{tab === 'debtors' ? <DebtorsReport /> : <PaymentsReport />}
							</div>
						</Paper>
					</div>
				}
			/>
		</AuthGuardRedirect>
	);
}
