'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
	Alert,
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
import { useSnackbar } from 'notistack';
import { MaterialReactTable, type MRT_ColumnDef, type MRT_RowSelectionState } from 'material-react-table';
import FusePageSimple from '@fuse/core/FusePageSimple';
import FuseSvgIcon from '@fuse/core/FuseSvgIcon';
import AuthGuardRedirect from '@auth/AuthGuardRedirect';
import authRoles from '@auth/authRoles';
import { errorMessage, strandLabel, useGradesApi, type ApprovalRequest } from '@/components/grading/api';

type Status = 'PENDING' | 'APPROVED' | 'REJECTED';

const fmt = (d: string | null) => (d ? new Date(d).toLocaleString() : '—');

/** Field-by-field rows for the side-by-side comparison. */
function compareRows(r: ApprovalRequest) {
	const prev = r.previousData as Record<string, unknown>;
	const next = (r.newData ?? {}) as Record<string, unknown>;
	const rows: { label: string; before: string; after: string }[] = [];
	const show = (v: unknown) => (v === null || v === undefined || v === '' ? '—' : String(v));

	if (r.mode === 'NUMERIC' && ('catScores' in prev || 'catScores' in next)) {
		const a = (prev.catScores as number[] | undefined) ?? [];
		const b = (next.catScores as number[] | undefined) ?? [];

		for (let i = 0; i < Math.max(a.length, b.length); i++)
			rows.push({ label: `CAT ${i + 1}`, before: show(a[i]), after: show(b[i]) });

		rows.push({ label: 'Exam', before: show(prev.examScore), after: show(next.examScore) });
	}

	if (r.mode === 'CBC')
		rows.push({
			label: 'Level',
			before: show(prev.competencyLevel ?? prev.value),
			after: show(next.competencyLevel ?? next.value)
		});
	else if ('value' in prev && !('catScores' in prev))
		rows.push({ label: 'Grade', before: show(prev.value), after: show(next.value) });

	if ('teacherComment' in prev || 'teacherComment' in next)
		rows.push({ label: 'Comment', before: show(prev.teacherComment), after: show(next.teacherComment) });

	return rows;
}

function RequestDialog({
	request,
	onClose,
	onDecide
}: {
	request: ApprovalRequest | null;
	onClose: () => void;
	onDecide: (r: ApprovalRequest, approve: boolean, reason?: string) => Promise<void>;
}) {
	const [rejecting, setRejecting] = useState(false);
	const [reason, setReason] = useState('');
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState('');

	useEffect(() => {
		setRejecting(false);
		setReason('');
		setError('');
	}, [request]);

	if (!request) return null;

	const pending = request.status === 'PENDING';
	const isDelete = request.type === 'DELETE';

	const decide = async (approve: boolean) => {
		setBusy(true);
		setError('');
		try {
			await onDecide(request, approve, approve ? undefined : reason.trim());
			onClose();
		} catch (e) {
			setError(errorMessage(e));
		} finally {
			setBusy(false);
		}
	};

	return (
		<Dialog
			open
			onClose={busy ? undefined : onClose}
			fullWidth
			maxWidth="md"
		>
			<DialogTitle className="flex flex-wrap items-center gap-2">
				{isDelete ? 'Grade deletion request' : 'Grade change request'}
				{request.overdue && (
					<Chip
						size="small"
						color="error"
						label={`Overdue · ${request.daysPending}d`}
					/>
				)}
				{!pending && (
					<Chip
						size="small"
						color={request.status === 'APPROVED' ? 'success' : 'default'}
						label={request.status === 'APPROVED' ? 'Approved' : 'Rejected'}
					/>
				)}
			</DialogTitle>
			<DialogContent className="flex flex-col gap-4">
				<div>
					<Typography className="font-semibold">
						{request.student}
						{request.admissionNumber ? ` · ${request.admissionNumber}` : ''}
						{request.className ? ` · ${request.className}` : ''}
					</Typography>
					<Typography color="text.secondary">
						{request.subject}
						{request.strand ? ` · ${strandLabel(request)}` : ''}
						{request.assessmentType ? ` (${request.assessmentType.toLowerCase()})` : ''} · {request.term}
					</Typography>
				</div>

				<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
					<Paper
						variant="outlined"
						className="rounded-xl p-4"
					>
						<Typography
							variant="overline"
							color="text.secondary"
						>
							Current (live)
						</Typography>
						<Typography className="text-lg font-semibold">{request.previousValue || '—'}</Typography>
					</Paper>
					<Paper
						variant="outlined"
						className="rounded-xl border-2 p-4"
						sx={{ borderColor: isDelete ? 'error.main' : 'primary.main' }}
					>
						<Typography
							variant="overline"
							color={isDelete ? 'error' : 'primary'}
						>
							{isDelete ? 'Requested: delete' : 'Requested'}
						</Typography>
						<Typography className="text-lg font-semibold">
							{isDelete ? 'Remove this grade' : request.newValue || '—'}
						</Typography>
					</Paper>
				</div>

				{!isDelete && (
					<table className="w-full text-sm">
						<thead>
							<tr className="text-left">
								<th className="py-1 font-medium">Field</th>
								<th className="py-1 font-medium">Current</th>
								<th className="py-1 font-medium">Requested</th>
							</tr>
						</thead>
						<tbody>
							{compareRows(request).map((row) => {
								const changed = row.before !== row.after;

								return (
									<tr
										key={row.label}
										className="border-t"
									>
										<td className="py-1.5 pr-2">{row.label}</td>
										<td className="py-1.5 pr-2">{row.before}</td>
										<td className={`py-1.5 ${changed ? 'font-semibold' : ''}`}>
											{row.after}
											{changed && (
												<Chip
													size="small"
													label="changed"
													color="primary"
													variant="outlined"
													className="ml-2"
												/>
											)}
										</td>
									</tr>
								);
							})}
						</tbody>
					</table>
				)}

				<Paper
					variant="outlined"
					className="rounded-xl p-4"
				>
					<Typography
						variant="overline"
						color="text.secondary"
					>
						Reason from {request.requestedBy} · {fmt(request.createdAt)}
					</Typography>
					<Typography>{request.reason}</Typography>
				</Paper>

				{!pending && (
					<Typography color="text.secondary">
						{request.status === 'APPROVED' ? 'Approved' : 'Rejected'} by {request.decidedBy} on{' '}
						{fmt(request.decidedAt)}
						{request.decisionReason ? ` — “${request.decisionReason}”` : ''}
					</Typography>
				)}

				{pending && rejecting && (
					<TextField
						label="Reason for rejecting (sent to the teacher)"
						value={reason}
						onChange={(e) => setReason(e.target.value)}
						required
						multiline
						minRows={2}
						autoFocus
						slotProps={{ htmlInput: { maxLength: 500 } }}
					/>
				)}

				{error && <Alert severity="error">{error}</Alert>}
			</DialogContent>
			<DialogActions className="px-6 pb-4">
				<Button
					onClick={onClose}
					disabled={busy}
				>
					Close
				</Button>
				{pending && !rejecting && (
					<>
						<Button
							color="error"
							variant="outlined"
							onClick={() => setRejecting(true)}
							disabled={busy}
						>
							Reject…
						</Button>
						<Button
							color="success"
							variant="contained"
							onClick={() => decide(true)}
							disabled={busy}
						>
							Approve
						</Button>
					</>
				)}
				{pending && rejecting && (
					<>
						<Button
							onClick={() => setRejecting(false)}
							disabled={busy}
						>
							Back
						</Button>
						<Button
							color="error"
							variant="contained"
							onClick={() => decide(false)}
							disabled={busy || reason.trim().length < 3}
						>
							Reject request
						</Button>
					</>
				)}
			</DialogActions>
		</Dialog>
	);
}

/** Admin approval queue for changes to published grades (dashboard-full-ui-logic-spec 2.5). */
export default function GradeApprovalsPage() {
	const api = useGradesApi();
	const { enqueueSnackbar } = useSnackbar();
	const [tab, setTab] = useState<Status>('PENDING');
	const [data, setData] = useState<{ slaHours: number; requests: ApprovalRequest[] } | null>(null);
	const [error, setError] = useState('');
	const [open, setOpen] = useState<ApprovalRequest | null>(null);
	const [selection, setSelection] = useState<MRT_RowSelectionState>({});
	const [confirmBulk, setConfirmBulk] = useState(false);
	const [bulkBusy, setBulkBusy] = useState(false);

	const load = useCallback(async () => {
		if (!api.ready) return;

		setError('');
		try {
			setData(await api.get(`/requests?status=${tab}`));
		} catch (e) {
			setError(errorMessage(e));
		}
	}, [api, tab]);

	useEffect(() => {
		setData(null);
		setSelection({});
		void load();
	}, [load]);

	const decide = async (r: ApprovalRequest, approve: boolean, reason?: string) => {
		const res = await api.post<{ message: string }>(
			`/requests/${r.id}/${approve ? 'approve' : 'reject'}`,
			reason ? { reason } : {}
		);
		enqueueSnackbar(res.message, { variant: approve ? 'success' : 'info' });
		await load();
	};

	const bulkApprove = async () => {
		setBulkBusy(true);
		try {
			const ids = Object.keys(selection).filter((k) => selection[k]);
			const res = await api.post<{ approved: number; failed: { error: string }[] }>('/requests/bulk-approve', {
				ids
			});
			enqueueSnackbar(
				`Approved ${res.approved}${res.failed.length ? ` · ${res.failed.length} failed: ${res.failed[0]!.error}` : ''}`,
				{ variant: res.failed.length ? 'warning' : 'success' }
			);
			setSelection({});
			await load();
		} catch (e) {
			enqueueSnackbar(errorMessage(e), { variant: 'error' });
		} finally {
			setBulkBusy(false);
			setConfirmBulk(false);
		}
	};

	const requests = data?.requests ?? [];
	const overdue = tab === 'PENDING' ? requests.filter((r) => r.overdue).length : 0;
	const selectedCount = Object.values(selection).filter(Boolean).length;

	const columns = useMemo<MRT_ColumnDef<ApprovalRequest>[]>(
		() => [
			{
				accessorKey: 'student',
				header: 'Student',
				Cell: ({ row: { original: r } }) => (
					<div>
						<Typography className="font-medium">{r.student}</Typography>
						<Typography
							variant="caption"
							color="text.secondary"
						>
							{[r.admissionNumber, r.className].filter(Boolean).join(' · ')}
						</Typography>
					</div>
				)
			},
			{
				accessorKey: 'subject',
				header: 'Subject',
				Cell: ({ row: { original: r } }) => (
					<div>
						<Typography variant="body2">{r.subject}</Typography>
						<Typography
							variant="caption"
							color="text.secondary"
						>
							{[strandLabel(r), r.term].filter(Boolean).join(' · ')}
						</Typography>
					</div>
				)
			},
			{
				accessorKey: 'previousValue',
				header: 'Original → requested',
				enableSorting: false,
				Cell: ({ row: { original: r } }) => (
					<div className="flex flex-col gap-0.5">
						<Typography
							variant="body2"
							color="text.secondary"
						>
							{r.previousValue || '—'}
						</Typography>
						<Typography
							variant="body2"
							className="font-semibold"
							color={r.type === 'DELETE' ? 'error' : 'primary'}
						>
							→ {r.type === 'DELETE' ? 'Delete grade' : r.newValue}
						</Typography>
					</div>
				)
			},
			{ accessorKey: 'requestedBy', header: 'Teacher' },
			{
				accessorKey: 'reason',
				header: 'Reason',
				Cell: ({ cell }) => (
					<Typography
						variant="body2"
						className="line-clamp-2 max-w-64"
					>
						{cell.getValue<string>()}
					</Typography>
				)
			},
			{
				accessorKey: 'createdAt',
				header: 'Requested',
				Cell: ({ cell }) => new Date(cell.getValue<string>()).toLocaleDateString()
			},
			tab === 'PENDING'
				? {
						accessorKey: 'daysPending',
						header: 'Days pending',
						Cell: ({ row: { original: r } }) => (
							<Chip
								size="small"
								color={r.overdue ? 'error' : 'default'}
								variant={r.overdue ? 'filled' : 'outlined'}
								label={r.daysPending === 0 ? 'Today' : `${r.daysPending}d`}
							/>
						)
					}
				: {
						accessorKey: 'decidedBy',
						header: 'Decided',
						Cell: ({ row: { original: r } }) => (
							<div>
								<Typography variant="body2">{r.decidedBy}</Typography>
								<Typography
									variant="caption"
									color="text.secondary"
								>
									{r.decidedAt ? new Date(r.decidedAt).toLocaleDateString() : ''}
								</Typography>
							</div>
						)
					}
		],
		[tab]
	);

	return (
		<AuthGuardRedirect auth={authRoles.admin}>
			<FusePageSimple
				content={
					<div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8">
						<div className="flex flex-col gap-2">
							<Typography className="text-4xl font-extrabold tracking-tight">Grade Approvals</Typography>
							<Typography color="text.secondary">
								Teachers’ changes to published grades wait here. Approving makes the new value live and
								notifies the student and parents; rejecting keeps the original and tells the teacher
								why.
							</Typography>
						</div>

						{overdue > 0 && data && (
							<Alert severity="error">
								{overdue} {overdue === 1 ? 'request has' : 'requests have'} been waiting longer than{' '}
								{data.slaHours} hours.
							</Alert>
						)}

						<Paper
							variant="outlined"
							className="overflow-hidden rounded-2xl"
						>
							<div className="flex flex-wrap items-center justify-between gap-2 border-b px-2">
								<Tabs
									value={tab}
									onChange={(_, v: Status) => setTab(v)}
								>
									<Tab
										value="PENDING"
										label={`Pending${tab === 'PENDING' && data ? ` (${requests.length})` : ''}`}
									/>
									<Tab
										value="APPROVED"
										label="Approved"
									/>
									<Tab
										value="REJECTED"
										label="Rejected"
									/>
								</Tabs>
								{tab === 'PENDING' && selectedCount > 0 && (
									<Button
										color="success"
										variant="contained"
										size="small"
										className="mr-2"
										onClick={() => setConfirmBulk(true)}
									>
										Approve {selectedCount} selected
									</Button>
								)}
							</div>

							{error && (
								<Alert
									severity="error"
									className="m-4"
								>
									{error}
								</Alert>
							)}

							{!data && !error ? (
								<div className="flex justify-center py-16">
									<CircularProgress />
								</div>
							) : (
								<MaterialReactTable
									columns={columns}
									data={requests}
									getRowId={(r) => r.id}
									enableRowSelection={tab === 'PENDING'}
									onRowSelectionChange={setSelection}
									state={{ rowSelection: selection }}
									enableDensityToggle={false}
									enableFullScreenToggle={false}
									enableColumnActions={false}
									initialState={{ density: 'compact', pagination: { pageIndex: 0, pageSize: 20 } }}
									muiTablePaperProps={{ elevation: 0, sx: { borderRadius: 0 } }}
									muiTableBodyRowProps={({ row }) => ({
										onClick: (e) => {
											// Ticking the selection checkbox shouldn't open the request
											if ((e.target as HTMLElement).closest('.MuiCheckbox-root')) return;

											setOpen(row.original);
										},
										sx: { cursor: 'pointer' }
									})}
									localization={{
										noRecordsToDisplay:
											tab === 'PENDING'
												? 'No pending requests — every grade change has been decided.'
												: 'Nothing here yet.'
									}}
								/>
							)}
						</Paper>

						<RequestDialog
							request={open}
							onClose={() => setOpen(null)}
							onDecide={decide}
						/>

						<Dialog
							open={confirmBulk}
							onClose={() => !bulkBusy && setConfirmBulk(false)}
						>
							<DialogTitle>Approve {selectedCount} requests?</DialogTitle>
							<DialogContent>
								<Typography>
									Every selected change goes live at once and students and parents are notified. Only
									bulk-approve requests you have checked — open a request to compare it first.
								</Typography>
							</DialogContent>
							<DialogActions>
								<Button
									onClick={() => setConfirmBulk(false)}
									disabled={bulkBusy}
								>
									Cancel
								</Button>
								<Button
									color="success"
									variant="contained"
									onClick={bulkApprove}
									disabled={bulkBusy}
									startIcon={
										bulkBusy ? (
											<CircularProgress size={16} />
										) : (
											<FuseSvgIcon size={18}>lucide:check</FuseSvgIcon>
										)
									}
								>
									Approve all
								</Button>
							</DialogActions>
						</Dialog>
					</div>
				}
			/>
		</AuthGuardRedirect>
	);
}
