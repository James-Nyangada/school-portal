'use client';

import { useMemo, useState } from 'react';
import {
	Alert,
	Button,
	Chip,
	CircularProgress,
	Dialog,
	DialogActions,
	DialogContent,
	DialogTitle,
	InputAdornment,
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
import {
	BankClaim,
	CLAIM_STATUS,
	ClaimStatus,
	CURRENCY,
	backendRequest,
	formatDate,
	formatKES,
	useBackend
} from '@/lib/finance';

const studentName = (c: BankClaim) => [c.student.firstName, c.student.lastName].filter(Boolean).join(' ') || 'Student';

function ReviewDialog({
	claim,
	mode,
	token,
	onClose,
	onDone
}: {
	claim: BankClaim;
	mode: 'approve' | 'reject';
	token: string;
	onClose: () => void;
	onDone: (message: string) => void;
}) {
	const [amount, setAmount] = useState(String(claim.amount));
	const [term, setTerm] = useState(claim.term);
	const [reason, setReason] = useState('');
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const submit = async () => {
		setSubmitting(true);
		setError(null);
		try {
			await backendRequest(token, `/api/fees/bank-claims/${claim.id}/${mode}`, {
				method: 'POST',
				body: JSON.stringify(mode === 'approve' ? { amount: Number(amount), term } : { reason })
			});
			onDone(
				mode === 'approve'
					? `Credited ${formatKES(Number(amount))} to ${studentName(claim)}.`
					: `Rejected code ${claim.transactionCode}; the parent has been notified.`
			);
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
			maxWidth="xs"
		>
			<DialogTitle>{mode === 'approve' ? 'Confirm bank payment' : 'Reject bank payment'}</DialogTitle>
			<DialogContent
				dividers
				className="flex flex-col gap-4"
			>
				<div className="rounded-xl bg-slate-50 p-3 text-sm">
					<div className="font-semibold">{studentName(claim)}</div>
					<div className="text-gray-500">
						{[claim.student.admissionNumber, claim.student.class?.name].filter(Boolean).join(' · ')}
					</div>
					<div className="mt-2">
						Code <strong>{claim.transactionCode}</strong> · {formatKES(claim.amount)} · paid{' '}
						{formatDate(claim.paidAt)}
						{claim.bankName ? ` · ${claim.bankName}` : ''}
					</div>
					{claim.note && <div className="mt-1 text-gray-600 italic">“{claim.note}”</div>}
				</div>

				{error && <Alert severity="error">{error}</Alert>}

				{mode === 'approve' ? (
					<>
						<Typography className="text-sm text-gray-600">
							Only confirm once you've found this code on the bank statement. Correct the amount if a
							different amount reached the account.
						</Typography>
						<TextField
							label="Amount received"
							type="number"
							value={amount}
							onChange={(e) => setAmount(e.target.value)}
							slotProps={{
								input: { startAdornment: <InputAdornment position="start">{CURRENCY}</InputAdornment> }
							}}
						/>
						<TextField
							label="Credit to term"
							value={term}
							onChange={(e) => setTerm(e.target.value)}
						/>
					</>
				) : (
					<TextField
						label="Reason (sent to the parent)"
						placeholder="e.g. Code not found on our statement for that date"
						value={reason}
						onChange={(e) => setReason(e.target.value)}
						multiline
						minRows={2}
						autoFocus
					/>
				)}
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
					color={mode === 'approve' ? 'success' : 'error'}
					onClick={submit}
					disabled={
						submitting || (mode === 'approve' ? !(Number(amount) > 0) || !term.trim() : !reason.trim())
					}
					startIcon={submitting ? <CircularProgress size={16} /> : undefined}
				>
					{mode === 'approve' ? 'Confirm & credit' : 'Reject'}
				</Button>
			</DialogActions>
		</Dialog>
	);
}

export default function BankPaymentsPage() {
	const [status, setStatus] = useState<ClaimStatus | 'ALL'>('PENDING');
	const { data, error, loading, reload, token } = useBackend<{ claims: BankClaim[] }>(
		`/api/fees/bank-claims?status=${status}`
	);
	const [review, setReview] = useState<{ claim: BankClaim; mode: 'approve' | 'reject' } | null>(null);
	const [message, setMessage] = useState<string | null>(null);

	const columns = useMemo<MRT_ColumnDef<BankClaim>[]>(
		() => [
			{ accessorKey: 'createdAt', header: 'Submitted', Cell: ({ cell }) => formatDate(cell.getValue<string>()) },
			{ id: 'student', header: 'Student', accessorFn: (c) => studentName(c) },
			{ id: 'adm', header: 'Adm. No.', accessorFn: (c) => c.student.admissionNumber || '—' },
			{
				accessorKey: 'transactionCode',
				header: 'Transaction code',
				Cell: ({ cell }) => <span className="font-mono font-semibold">{cell.getValue<string>()}</span>
			},
			{ accessorKey: 'amount', header: 'Amount', Cell: ({ cell }) => formatKES(cell.getValue<number>()) },
			{ accessorKey: 'paidAt', header: 'Paid on', Cell: ({ cell }) => formatDate(cell.getValue<string>()) },
			{ accessorKey: 'bankName', header: 'Bank', Cell: ({ cell }) => cell.getValue<string>() || '—' },
			{ accessorKey: 'submittedBy', header: 'Submitted by', Cell: ({ cell }) => cell.getValue<string>() || '—' },
			{
				accessorKey: 'status',
				header: 'Status',
				Cell: ({ row }) => (
					<div className="flex flex-col items-start gap-1">
						<Chip
							size="small"
							label={CLAIM_STATUS[row.original.status].label}
							color={CLAIM_STATUS[row.original.status].color}
						/>
						{row.original.reviewedBy && (
							<span className="text-xs text-gray-500">
								by {row.original.reviewedBy}
								{row.original.rejectionReason ? `: ${row.original.rejectionReason}` : ''}
							</span>
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
							<Typography className="text-3xl font-extrabold tracking-tight">Bank Payments</Typography>
							<Typography className="mt-1 text-sm text-gray-500">
								Deposits reported by parents. Check each transaction code against the bank statement,
								then confirm to credit the student or reject with a reason.
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
									value="PENDING"
									label="To verify"
								/>
								<Tab
									value="APPROVED"
									label="Confirmed"
								/>
								<Tab
									value="REJECTED"
									label="Rejected"
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
									data={data?.claims ?? []}
									state={{ isLoading: loading }}
									enableRowActions={status === 'PENDING'}
									positionActionsColumn="last"
									renderRowActions={({ row }) =>
										row.original.status === 'PENDING' && (
											<div className="flex gap-2">
												<Button
													size="small"
													variant="contained"
													color="success"
													onClick={() => setReview({ claim: row.original, mode: 'approve' })}
												>
													Confirm
												</Button>
												<Button
													size="small"
													color="error"
													onClick={() => setReview({ claim: row.original, mode: 'reject' })}
												>
													Reject
												</Button>
											</div>
										)
									}
									initialState={{ pagination: { pageSize: 25, pageIndex: 0 } }}
									muiTablePaperProps={{ elevation: 0 }}
								/>
							)}
						</Paper>

						{review && token && (
							<ReviewDialog
								claim={review.claim}
								mode={review.mode}
								token={token}
								onClose={() => setReview(null)}
								onDone={(m) => {
									setReview(null);
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
