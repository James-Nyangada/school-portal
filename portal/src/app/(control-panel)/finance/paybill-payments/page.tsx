'use client';

import { useMemo, useState } from 'react';
import {
	Alert,
	Autocomplete,
	Badge,
	Button,
	Chip,
	CircularProgress,
	Dialog,
	DialogActions,
	DialogContent,
	DialogTitle,
	Paper,
	Tab,
	Tabs,
	TextField,
	Typography
} from '@mui/material';
import FusePageSimple from '@fuse/core/FusePageSimple';
import AuthGuardRedirect from '@auth/AuthGuardRedirect';
import { MaterialReactTable, type MRT_ColumnDef } from 'material-react-table';
import authRoles from '@auth/authRoles';
import { FeeRecordsResponse, FeeRow, backendRequest, formatDate, formatKES, useBackend } from '@/lib/finance';

type PaybillStatus = 'UNMATCHED' | 'CREDITED' | 'DUPLICATE' | 'PROMPT';

type PaybillPayment = {
	id: string;
	transId: string;
	amount: number;
	billRef: string;
	payerName: string | null;
	msisdn: string | null;
	paidAt: string;
	status: PaybillStatus;
	studentId: string | null;
	studentName: string | null;
	admissionNumber: string | null;
	assignedBy: string | null;
};

const STATUS: Record<PaybillStatus, { label: string; color: 'warning' | 'success' | 'default' }> = {
	UNMATCHED: { label: 'Needs a student', color: 'warning' },
	CREDITED: { label: 'Credited', color: 'success' },
	DUPLICATE: { label: 'Already credited (app prompt)', color: 'default' },
	PROMPT: { label: 'Paid via app prompt', color: 'success' }
};

function AssignDialog({
	payment,
	token,
	onClose,
	onDone
}: {
	payment: PaybillPayment;
	token: string;
	onClose: () => void;
	onDone: (message: string) => void;
}) {
	const { data, loading } = useBackend<FeeRecordsResponse>('/api/finance/records');
	const [student, setStudent] = useState<FeeRow | null>(null);
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const submit = async () => {
		if (!student) return;

		setSubmitting(true);
		setError(null);
		try {
			await backendRequest(token, `/api/payments/c2b/${payment.id}/assign`, {
				method: 'POST',
				body: JSON.stringify({ studentId: student.studentId })
			});
			onDone(`Credited ${formatKES(payment.amount)} (${payment.transId}) to ${student.studentName}.`);
		} catch (e) {
			setError((e as Error).message);
			setSubmitting(false);
		}
	};

	return (
		<Dialog
			open
			onClose={onClose}
			fullWidth
			maxWidth="sm"
		>
			<DialogTitle>Credit Paybill payment</DialogTitle>
			<DialogContent
				dividers
				className="flex flex-col gap-4"
			>
				<div className="rounded-xl bg-slate-50 p-3 text-sm">
					<div>
						<strong className="font-mono">{payment.transId}</strong> · {formatKES(payment.amount)} ·{' '}
						{formatDate(payment.paidAt)}
					</div>
					<div className="mt-1 text-gray-600">
						Account typed: <strong>“{payment.billRef || '(blank)'}”</strong>
						{payment.payerName ? ` · paid by ${payment.payerName}` : ''}
					</div>
				</div>

				{error && <Alert severity="error">{error}</Alert>}

				<Autocomplete<FeeRow>
					options={data?.rows ?? []}
					loading={loading}
					value={student}
					onChange={(_, v) => setStudent(v)}
					getOptionLabel={(s) => [s.studentName, s.admissionNumber, s.className].filter(Boolean).join(' · ')}
					isOptionEqualToValue={(a, b) => a.studentId === b.studentId}
					renderOption={(props, s) => (
						<li
							{...props}
							key={s.studentId}
						>
							<div className="flex w-full items-center justify-between gap-4">
								<span>
									{s.studentName}
									<span className="text-gray-500">
										{' '}
										{[s.admissionNumber, s.className].filter(Boolean).join(' · ')}
									</span>
								</span>
								{s.balance > 0 && (
									<span className="text-sm font-semibold text-red-600">{formatKES(s.balance)}</span>
								)}
							</div>
						</li>
					)}
					disabled={submitting}
					renderInput={(params) => (
						<TextField
							{...params}
							label="Student"
							placeholder="Search by name or admission number"
							autoFocus
						/>
					)}
				/>
				<Typography className="text-sm text-gray-600">
					The payment is credited to the current term and the student's parents are notified.
				</Typography>
			</DialogContent>
			<DialogActions>
				<Button
					onClick={onClose}
					disabled={submitting}
				>
					Cancel
				</Button>
				<Button
					variant="contained"
					color="success"
					onClick={submit}
					disabled={submitting || !student}
					startIcon={submitting ? <CircularProgress size={16} /> : undefined}
				>
					Credit student
				</Button>
			</DialogActions>
		</Dialog>
	);
}

export default function PaybillPaymentsPage() {
	const [status, setStatus] = useState<PaybillStatus | 'ALL'>('UNMATCHED');
	const { data, error, loading, reload, token } = useBackend<{
		unmatchedCount: number;
		payments: PaybillPayment[];
	}>(`/api/payments/c2b?status=${status}`);
	const [assigning, setAssigning] = useState<PaybillPayment | null>(null);
	const [message, setMessage] = useState<string | null>(null);

	const columns = useMemo<MRT_ColumnDef<PaybillPayment>[]>(
		() => [
			{ accessorKey: 'paidAt', header: 'Paid on', Cell: ({ cell }) => formatDate(cell.getValue<string>()) },
			{
				accessorKey: 'transId',
				header: 'M-Pesa ref',
				Cell: ({ cell }) => <span className="font-mono font-semibold">{cell.getValue<string>() || '—'}</span>
			},
			{ accessorKey: 'amount', header: 'Amount', Cell: ({ cell }) => formatKES(cell.getValue<number>()) },
			{ accessorKey: 'billRef', header: 'Account typed', Cell: ({ cell }) => cell.getValue<string>() || '—' },
			{
				accessorKey: 'payerName',
				header: 'Paid by',
				Cell: ({ row }) =>
					[row.original.payerName, row.original.status === 'PROMPT' ? row.original.msisdn : null]
						.filter(Boolean)
						.join(' · ') || '—'
			},
			{
				id: 'student',
				header: 'Student',
				accessorFn: (p) => [p.studentName, p.admissionNumber].filter(Boolean).join(' · ') || '—'
			},
			{
				accessorKey: 'status',
				header: 'Status',
				Cell: ({ row }) => (
					<div className="flex flex-col items-start gap-1">
						<Chip
							size="small"
							label={STATUS[row.original.status].label}
							color={STATUS[row.original.status].color}
						/>
						{row.original.assignedBy && (
							<span className="text-xs text-gray-500">assigned by {row.original.assignedBy}</span>
						)}
					</div>
				)
			}
		],
		[]
	);

	return (
		<AuthGuardRedirect auth={authRoles.finance}>
			<FusePageSimple
				content={
					<div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8">
						<div>
							<Typography className="text-3xl font-extrabold tracking-tight">Paybill Payments</Typography>
							<Typography className="mt-1 text-sm text-gray-500">
								Payments made from the M-Pesa menu. Those with a valid admission number as the account
								are credited automatically; the rest wait here for you to pick the student.
							</Typography>
						</div>

						{message && (
							<Alert
								severity="success"
								onClose={() => setMessage(null)}
							>
								{message}
							</Alert>
						)}

						<Paper className="flex flex-col overflow-hidden rounded-2xl shadow-sm">
							<Tabs
								value={status}
								onChange={(_, v) => setStatus(v)}
								className="border-b border-gray-200 px-4"
							>
								<Tab
									value="UNMATCHED"
									label={
										<Badge
											color="warning"
											badgeContent={data?.unmatchedCount ?? 0}
											className="pr-3"
										>
											Needs a student
										</Badge>
									}
								/>
								<Tab
									value="CREDITED"
									label="Credited"
								/>
								<Tab
									value="PROMPT"
									label="Via app prompt"
								/>
								<Tab
									value="ALL"
									label="All"
								/>
							</Tabs>
							{error ? (
								<div className="flex flex-col items-center gap-3 p-8">
									<Typography color="error">{error}</Typography>
									<Button
										variant="outlined"
										onClick={reload}
									>
										Try again
									</Button>
								</div>
							) : (
								<MaterialReactTable
									columns={columns}
									data={data?.payments ?? []}
									state={{ isLoading: loading }}
									enableRowActions={status === 'UNMATCHED' || status === 'ALL'}
									positionActionsColumn="last"
									renderRowActions={({ row }) =>
										row.original.status === 'UNMATCHED' && (
											<Button
												size="small"
												variant="contained"
												color="success"
												onClick={() => setAssigning(row.original)}
											>
												Choose student
											</Button>
										)
									}
									initialState={{ pagination: { pageSize: 25, pageIndex: 0 } }}
									muiTablePaperProps={{ elevation: 0 }}
								/>
							)}
						</Paper>

						{assigning && token && (
							<AssignDialog
								payment={assigning}
								token={token}
								onClose={() => setAssigning(null)}
								onDone={(m) => {
									setAssigning(null);
									setMessage(m);
									reload();
								}}
							/>
						)}
					</div>
				}
			/>
		</AuthGuardRedirect>
	);
}
