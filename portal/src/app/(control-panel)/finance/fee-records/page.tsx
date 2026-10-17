'use client';

import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { useMemo, useState } from 'react';
import {
	Button,
	Chip,
	CircularProgress,
	Dialog,
	DialogActions,
	DialogContent,
	DialogTitle,
	IconButton,
	MenuItem,
	Paper,
	TextField,
	Tooltip,
	Typography
} from '@mui/material';
import FusePageSimple from '@fuse/core/FusePageSimple';
import AuthGuardRedirect from '@auth/AuthGuardRedirect';
import FuseSvgIcon from '@fuse/core/FuseSvgIcon';
import { MaterialReactTable, type MRT_ColumnDef } from 'material-react-table';
import authRoles from '@auth/authRoles';
import useToast from '@/hooks/useToast';
import PaymentPlanCard from '@/components/fees/PaymentPlanCard';
import {
	FEE_STATUS,
	FeeRecordsResponse,
	FeeRow,
	PAYMENT_METHOD_LABELS,
	PaymentMethod,
	PlanSchedule,
	backendRequest,
	formatDate,
	formatKES,
	useBackend
} from '@/lib/finance';

type Reminder = {
	id: string;
	createdAt: string;
	balance: number;
	status: 'SENT' | 'FAILED' | 'SKIPPED';
	error: string | null;
	phones: string[];
	sentBy: string | null;
};

type StudentStatement = {
	totalBilled: number;
	totalPaid: number;
	balance: number;
	feeRecords: { id: string; term: string; totalBilled: number; amountPaid: number }[];
	feeTransactions: {
		id: string;
		amount: number;
		source: PaymentMethod;
		receiptNumber: string | null;
		createdAt: string;
	}[];
	paymentPlan: PlanSchedule | null;
};

/** Sends the templated balance SMS to the student's parents (§4.2); returns true when it was delivered. */
function usePromptParent() {
	const { notify, confirm } = useToast();
	const [sending, setSending] = useState<string | null>(null);
	const { data: session } = useSession();
	const token = session?.backendToken;

	const prompt = async (student: FeeRow) => {
		if (!token) return false;

		if (
			!(await confirm(
				`Send an SMS reminder of ${formatKES(Math.max(0, student.balance))} to ${student.studentName}'s parent or guardian?`
			))
		)
			return false;

		setSending(student.studentId);
		try {
			const r = await backendRequest<{ message: string }>(
				token,
				`/api/finance/records/${student.studentId}/prompt-parent`,
				{
					method: 'POST'
				}
			);
			notify(r.message, 'success');
			return true;
		} catch (e) {
			notify((e as Error).message, 'error');
			return false;
		} finally {
			setSending(null);
		}
	};

	return { prompt, sending };
}

function StatementDialog({ student, onClose }: { student: FeeRow; onClose: () => void }) {
	const { data, error, loading } = useBackend<StudentStatement>(`/api/fees/student/${student.studentId}`);
	const reminders = useBackend<Reminder[]>(`/api/finance/records/${student.studentId}/reminders`);
	const { prompt, sending } = usePromptParent();

	return (
		<Dialog
			open
			onClose={onClose}
			fullWidth
			maxWidth="sm"
		>
			<DialogTitle>
				{student.studentName}
				<Typography className="text-sm text-gray-500">
					{[student.admissionNumber, student.className].filter(Boolean).join(' · ') || 'Fee statement'}
				</Typography>
			</DialogTitle>
			<DialogContent dividers>
				{loading && (
					<div className="flex justify-center py-8">
						<CircularProgress size={28} />
					</div>
				)}
				{error && <Typography color="error">{error}</Typography>}
				{data && (
					<div className="flex flex-col gap-6">
						<div className="grid grid-cols-3 gap-3 text-center">
							{[
								['Billed', data.totalBilled, 'text-gray-900'],
								['Paid', data.totalPaid, 'text-green-600'],
								['Balance', data.balance, data.balance > 0 ? 'text-red-600' : 'text-gray-900']
							].map(([label, value, color]) => (
								<div
									key={label as string}
									className="rounded-xl bg-gray-50 p-3"
								>
									<Typography className="text-xs text-gray-500 uppercase">{label}</Typography>
									<Typography className={`font-bold ${color}`}>
										{formatKES(value as number)}
									</Typography>
								</div>
							))}
						</div>

						<div>
							<Typography className="mb-2 font-semibold">By term</Typography>
							{data.feeRecords.length === 0 ? (
								<Typography className="text-sm text-gray-500">Not billed yet.</Typography>
							) : (
								data.feeRecords.map((r) => (
									<div
										key={r.id}
										className="flex justify-between border-b border-gray-100 py-2 text-sm"
									>
										<span>{r.term}</span>
										<span>
											{formatKES(r.amountPaid)} / {formatKES(r.totalBilled)}
										</span>
									</div>
								))
							)}
						</div>

						{data.paymentPlan && <PaymentPlanCard schedule={data.paymentPlan} />}

						<div>
							<Typography className="mb-2 font-semibold">Payments</Typography>
							{data.feeTransactions.length === 0 ? (
								<Typography className="text-sm text-gray-500">No payments yet.</Typography>
							) : (
								data.feeTransactions.map((t) => (
									<div
										key={t.id}
										className="flex justify-between gap-4 border-b border-gray-100 py-2 text-sm"
									>
										<span>
											{formatDate(t.createdAt)} · {PAYMENT_METHOD_LABELS[t.source]}
											{t.receiptNumber && (
												<span className="text-gray-500"> · {t.receiptNumber}</span>
											)}
										</span>
										<span className="font-semibold text-green-600">{formatKES(t.amount)}</span>
									</div>
								))
							)}
						</div>

						<div>
							<Typography className="mb-2 font-semibold">Reminders sent</Typography>
							{!reminders.data?.length ? (
								<Typography className="text-sm text-gray-500">No reminders sent yet.</Typography>
							) : (
								reminders.data.map((r) => (
									<div
										key={r.id}
										className="flex justify-between gap-4 border-b border-gray-100 py-2 text-sm"
									>
										<span>
											{formatDate(r.createdAt)} · balance {formatKES(r.balance)}
											{r.sentBy && <span className="text-gray-500"> · by {r.sentBy}</span>}
											{r.error && <span className="block text-xs text-gray-500">{r.error}</span>}
										</span>
										<Chip
											size="small"
											label={
												r.status === 'SENT'
													? 'Sent'
													: r.status === 'FAILED'
														? 'Failed'
														: 'Not sent'
											}
											color={
												r.status === 'SENT'
													? 'success'
													: r.status === 'FAILED'
														? 'error'
														: 'default'
											}
										/>
									</div>
								))
							)}
						</div>
					</div>
				)}
			</DialogContent>
			<DialogActions>
				<Button onClick={onClose}>Close</Button>
				{student.balance > 0 && (
					<Button
						disabled={sending === student.studentId}
						startIcon={<FuseSvgIcon size={16}>lucide:message-square</FuseSvgIcon>}
						onClick={async () => {
							await prompt(student);
							reminders.reload();
						}}
					>
						Prompt parent
					</Button>
				)}
				<Button
					component={Link}
					href={`/finance/record-payment?studentId=${student.studentId}`}
					variant="contained"
					color="secondary"
				>
					Record payment
				</Button>
			</DialogActions>
		</Dialog>
	);
}

export default function FeeRecordsPage() {
	const [term, setTerm] = useState<string | null>(null);
	const [statusFilter, setStatusFilter] = useState<'ALL' | FeeRow['status']>('ALL');
	const [selected, setSelected] = useState<FeeRow | null>(null);
	const { prompt, sending } = usePromptParent();

	// First load uses the server's current term
	const { data, error, loading, reload } = useBackend<FeeRecordsResponse>(
		`/api/finance/records${term ? `?term=${encodeURIComponent(term)}` : ''}`
	);
	const activeTerm = term ?? data?.currentTerm ?? '';

	const rows = useMemo(() => {
		const all = data?.rows ?? [];
		return statusFilter === 'ALL' ? all : all.filter((r) => r.status === statusFilter);
	}, [data, statusFilter]);

	const totals = useMemo(
		() =>
			rows.reduce(
				(a, r) => ({
					billed: a.billed + r.totalBilled,
					paid: a.paid + r.amountPaid,
					balance: a.balance + Math.max(0, r.balance)
				}),
				{ billed: 0, paid: 0, balance: 0 }
			),
		[rows]
	);

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
			{
				accessorKey: 'amountPaid',
				header: 'Paid (KES)',
				Cell: ({ cell }) => <span className="text-green-600">{formatKES(cell.getValue<number>())}</span>
			},
			{
				accessorKey: 'balance',
				header: 'Balance (KES)',
				Cell: ({ cell }) => {
					const val = cell.getValue<number>();
					// negative balance = overpaid, shown as a credit
					return (
						<span className={val > 0 ? 'font-bold text-red-600' : val < 0 ? 'text-blue-600' : ''}>
							{val < 0 ? `${formatKES(-val)} credit` : formatKES(val)}
						</span>
					);
				}
			},
			{
				accessorKey: 'status',
				header: 'Status',
				Cell: ({ cell }) => {
					const s = FEE_STATUS[cell.getValue<FeeRow['status']>()];
					return (
						<Chip
							label={s.label}
							color={s.color}
							size="small"
						/>
					);
				}
			}
		],
		[]
	);

	return (
		<AuthGuardRedirect auth={authRoles.finance}>
			<FusePageSimple
				content={
					<div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8">
						<div className="flex flex-wrap items-end justify-between gap-4">
							<div>
								<Typography className="text-3xl font-extrabold tracking-tight">Fee Records</Typography>
								<Typography className="mt-1 text-sm text-gray-500">
									Every student's billed amount, payments and balance.
								</Typography>
							</div>
							<div className="flex flex-wrap gap-3">
								<TextField
									select
									size="small"
									label="Term"
									value={activeTerm}
									onChange={(e) => setTerm(e.target.value)}
									className="min-w-40"
									disabled={!data}
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
									label="Status"
									value={statusFilter}
									onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
									className="min-w-40"
								>
									<MenuItem value="ALL">All</MenuItem>
									{Object.entries(FEE_STATUS).map(([key, s]) => (
										<MenuItem
											key={key}
											value={key}
										>
											{s.label}
										</MenuItem>
									))}
								</TextField>
							</div>
						</div>

						{error ? (
							<Paper className="flex flex-col items-center gap-3 rounded-2xl p-8 text-center shadow-sm">
								<Typography color="error">{error}</Typography>
								<Button
									variant="outlined"
									onClick={reload}
								>
									Try again
								</Button>
							</Paper>
						) : (
							<>
								<div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
									{[
										['Billed', totals.billed, 'text-gray-900'],
										['Collected', totals.paid, 'text-green-600'],
										['Outstanding', totals.balance, 'text-red-600']
									].map(([label, value, color]) => (
										<Paper
											key={label as string}
											className="rounded-2xl p-4 shadow-sm"
										>
											<Typography className="text-xs font-semibold text-gray-500 uppercase">
												{label}
											</Typography>
											<Typography className={`text-xl font-bold ${color}`}>
												{formatKES(value as number)}
											</Typography>
										</Paper>
									))}
								</div>

								<Paper className="flex flex-col overflow-hidden rounded-2xl shadow-sm">
									<MaterialReactTable
										columns={columns}
										data={rows}
										state={{ isLoading: loading }}
										enableRowSelection={false}
										enableColumnOrdering
										enableRowActions
										positionActionsColumn="last"
										initialState={{ pagination: { pageSize: 25, pageIndex: 0 } }}
										renderRowActions={({ row }) => (
											<div className="flex gap-1">
												<Tooltip title="View statement">
													<IconButton
														size="small"
														onClick={() => setSelected(row.original)}
													>
														<FuseSvgIcon size={18}>lucide:file-text</FuseSvgIcon>
													</IconButton>
												</Tooltip>
												{row.original.balance > 0 && (
													<Tooltip title="Prompt parent (SMS reminder)">
														<span>
															<IconButton
																size="small"
																disabled={sending === row.original.studentId}
																onClick={() => prompt(row.original)}
															>
																<FuseSvgIcon size={18}>
																	lucide:message-square
																</FuseSvgIcon>
															</IconButton>
														</span>
													</Tooltip>
												)}
												<Tooltip title="Record payment">
													<IconButton
														size="small"
														component={Link}
														href={`/finance/record-payment?studentId=${row.original.studentId}`}
													>
														<FuseSvgIcon size={18}>lucide:circle-plus</FuseSvgIcon>
													</IconButton>
												</Tooltip>
											</div>
										)}
										muiTablePaperProps={{ elevation: 0 }}
									/>
								</Paper>
							</>
						)}

						{selected && (
							<StatementDialog
								student={selected}
								onClose={() => setSelected(null)}
							/>
						)}
					</div>
				}
			/>
		</AuthGuardRedirect>
	);
}
