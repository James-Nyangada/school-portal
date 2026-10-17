'use client';

import { useCallback, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import {
	Alert,
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
	Typography
} from '@mui/material';
import FusePageSimple from '@fuse/core/FusePageSimple';
import AuthGuardRedirect from '@auth/AuthGuardRedirect';
import FuseSvgIcon from '@fuse/core/FuseSvgIcon';
import { MaterialReactTable, type MRT_ColumnDef } from 'material-react-table';
import authRoles from '@auth/authRoles';
import useToast from '@/hooks/useToast';
import { FeeRecordsResponse, Milestone, backendRequest, formatDate, formatKES, useBackend } from '@/lib/finance';

type Plan = { code: string; name: string; milestones: { week: number; percent: number }[] };
type Row = {
	studentId: string;
	studentName: string;
	admissionNumber: string | null;
	className: string | null;
	term: string;
	billed: number;
	paid: number;
	plan: { code: string; name: string };
	milestones: Milestone[];
	dueToDate: number;
	behindBy: number;
	next: Milestone | null;
};
type Overview = {
	term: string;
	termStart: string | null;
	plans: Plan[];
	onInstallments: number;
	behindSchedule: number;
	amountBehind: number;
	rows: Row[];
};

function TemplatesDialog({ plans, onClose, onSaved }: { plans: Plan[]; onClose: () => void; onSaved: () => void }) {
	const { data: session } = useSession();
	const token = session?.backendToken;
	const { notify } = useToast();
	const [draft, setDraft] = useState<Plan[]>(
		plans.map((p) => ({ ...p, milestones: p.milestones.map((m) => ({ ...m })) }))
	);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const update = (i: number, patch: Partial<Plan>) =>
		setDraft((d) => d.map((p, j) => (j === i ? { ...p, ...patch } : p)));
	const updateMilestone = (i: number, k: number, patch: Partial<Plan['milestones'][number]>) =>
		update(i, { milestones: draft[i].milestones.map((m, j) => (j === k ? { ...m, ...patch } : m)) });

	const save = async () => {
		if (!token) return;

		setSaving(true);
		setError(null);
		try {
			await backendRequest(token, '/api/finance/payment-plans/templates', {
				method: 'PUT',
				body: JSON.stringify({ plans: draft })
			});
			notify('Payment plans saved', 'success');
			onSaved();
		} catch (e) {
			setError((e as Error).message);
		} finally {
			setSaving(false);
		}
	};

	return (
		<Dialog
			open
			onClose={onClose}
			fullWidth
			maxWidth="md"
		>
			<DialogTitle>Payment plan templates</DialogTitle>
			<DialogContent
				dividers
				className="flex flex-col gap-4"
			>
				<Typography className="text-sm text-gray-500">
					Offered at admission. Each milestone is a cumulative share of the term&apos;s bill, due at the start
					of that week of term. The last milestone must be 100%.
				</Typography>
				{error && <Alert severity="error">{error}</Alert>}
				{draft.map((p, i) => (
					<Paper
						key={i}
						variant="outlined"
						className="flex flex-col gap-3 rounded-xl p-4"
					>
						<div className="flex flex-wrap items-center gap-3">
							<TextField
								size="small"
								label="Code"
								value={p.code}
								disabled={p.code === 'FULL' && plans.some((x) => x.code === 'FULL')}
								onChange={(e) =>
									update(i, { code: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '') })
								}
								className="w-44"
							/>
							<TextField
								size="small"
								label="Name"
								value={p.name}
								onChange={(e) => update(i, { name: e.target.value })}
								className="flex-1"
							/>
							{p.code !== 'FULL' && (
								<IconButton
									aria-label="Remove plan"
									onClick={() => setDraft((d) => d.filter((_, j) => j !== i))}
								>
									<FuseSvgIcon size={18}>lucide:trash-2</FuseSvgIcon>
								</IconButton>
							)}
						</div>
						<div className="flex flex-wrap items-center gap-2">
							{p.milestones.map((m, k) => (
								<div
									key={k}
									className="flex items-center gap-1 rounded-lg bg-gray-50 p-2"
								>
									<TextField
										size="small"
										type="number"
										label="%"
										value={m.percent}
										onChange={(e) => updateMilestone(i, k, { percent: Number(e.target.value) })}
										className="w-20"
									/>
									<span className="text-sm text-gray-500">by week</span>
									<TextField
										size="small"
										type="number"
										label="Week"
										value={m.week}
										onChange={(e) => updateMilestone(i, k, { week: Number(e.target.value) })}
										className="w-20"
									/>
									{p.milestones.length > 1 && (
										<IconButton
											size="small"
											aria-label="Remove milestone"
											onClick={() =>
												update(i, { milestones: p.milestones.filter((_, j) => j !== k) })
											}
										>
											<FuseSvgIcon size={14}>lucide:x</FuseSvgIcon>
										</IconButton>
									)}
								</div>
							))}
							{p.milestones.length < 6 && (
								<Button
									size="small"
									onClick={() => {
										const last = p.milestones[p.milestones.length - 1];
										update(i, {
											milestones: [...p.milestones, { week: (last?.week ?? 0) + 2, percent: 100 }]
										});
									}}
								>
									Add milestone
								</Button>
							)}
						</div>
					</Paper>
				))}
				{draft.length < 8 && (
					<Button
						startIcon={<FuseSvgIcon size={16}>lucide:plus</FuseSvgIcon>}
						onClick={() =>
							setDraft((d) => [
								...d,
								{
									code: `PLAN_${d.length + 1}`,
									name: 'New plan',
									milestones: [{ week: 2, percent: 100 }]
								}
							])
						}
						className="self-start"
					>
						Add plan
					</Button>
				)}
			</DialogContent>
			<DialogActions>
				<Button onClick={onClose}>Cancel</Button>
				<Button
					variant="contained"
					color="secondary"
					disabled={saving}
					onClick={save}
				>
					Save plans
				</Button>
			</DialogActions>
		</Dialog>
	);
}

export default function PaymentPlansPage() {
	const { notify } = useToast();
	const [term, setTerm] = useState<string | null>(null);
	const [behindOnly, setBehindOnly] = useState(false);
	const [editing, setEditing] = useState(false);
	const terms = useBackend<FeeRecordsResponse>('/api/finance/records');
	const { data, error, loading, reload, token } = useBackend<Overview>(
		`/api/finance/payment-plans${term ? `?term=${encodeURIComponent(term)}` : ''}`
	);
	const rows = useMemo(() => (data?.rows ?? []).filter((r) => !behindOnly || r.behindBy > 0), [data, behindOnly]);

	const changePlan = useCallback(
		async (row: Row, plan: string) => {
			if (!token) return;

			try {
				await backendRequest(token, `/api/finance/records/${row.studentId}/plan`, {
					method: 'PATCH',
					body: JSON.stringify({ term: row.term, plan })
				});
				notify(
					`${row.studentName} moved to ${data?.plans.find((p) => p.code === plan)?.name ?? plan}`,
					'success'
				);
				reload();
			} catch (e) {
				notify((e as Error).message, 'error');
			}
		},
		[token, data, notify, reload]
	);

	const columns = useMemo<MRT_ColumnDef<Row>[]>(
		() => [
			{
				accessorKey: 'studentName',
				header: 'Student',
				Cell: ({ row }) => (
					<div>
						<div className="font-medium">{row.original.studentName}</div>
						<div className="text-xs text-gray-500">
							{[row.original.admissionNumber, row.original.className].filter(Boolean).join(' · ')}
						</div>
					</div>
				)
			},
			{
				id: 'plan',
				header: 'Plan',
				accessorFn: (r) => r.plan.name,
				Cell: ({ row }) => (
					<TextField
						select
						size="small"
						variant="standard"
						value={row.original.plan.code}
						onChange={(e) => changePlan(row.original, e.target.value)}
					>
						{(data?.plans ?? []).map((p) => (
							<MenuItem
								key={p.code}
								value={p.code}
							>
								{p.name}
							</MenuItem>
						))}
					</TextField>
				)
			},
			{ accessorKey: 'billed', header: 'Billed', Cell: ({ cell }) => formatKES(cell.getValue<number>()) },
			{
				accessorKey: 'paid',
				header: 'Paid',
				Cell: ({ cell }) => <span className="text-green-600">{formatKES(cell.getValue<number>())}</span>
			},
			{
				accessorKey: 'dueToDate',
				header: 'Due by today',
				Cell: ({ cell }) => formatKES(cell.getValue<number>())
			},
			{
				accessorKey: 'behindBy',
				header: 'Behind',
				Cell: ({ cell }) =>
					cell.getValue<number>() > 0 ? (
						<Chip
							size="small"
							color="error"
							label={formatKES(cell.getValue<number>())}
						/>
					) : (
						<Chip
							size="small"
							color="success"
							label="On track"
						/>
					)
			},
			{
				id: 'next',
				header: 'Next milestone',
				accessorFn: (r) => r.next?.dueDate ?? '',
				Cell: ({ row }) => {
					const n = row.original.next;

					return n ? (
						<span className={n.overdue ? 'text-red-600' : ''}>
							{n.percent}% ({formatKES(n.amountDue)}) by{' '}
							{n.dueDate ? formatDate(n.dueDate) : `week ${n.week}`}
						</span>
					) : (
						'Fully paid'
					);
				}
			}
		],
		[data, changePlan]
	);

	return (
		<AuthGuardRedirect auth={authRoles.finance}>
			<FusePageSimple
				content={
					<div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8">
						<div className="flex flex-wrap items-end justify-between gap-4">
							<div>
								<Typography className="text-3xl font-extrabold tracking-tight">
									Payment Plans
								</Typography>
								<Typography className="mt-1 text-sm text-gray-500">
									Installment milestones for {data?.term ?? 'the current term'}: who is on track and
									who is behind.
								</Typography>
							</div>
							<div className="flex flex-wrap gap-3">
								<TextField
									select
									size="small"
									label="Term"
									value={term ?? data?.term ?? ''}
									onChange={(e) => setTerm(e.target.value)}
									className="min-w-40"
									disabled={!terms.data}
								>
									{(terms.data?.terms ?? []).map((t) => (
										<MenuItem
											key={t}
											value={t}
										>
											{t}
										</MenuItem>
									))}
								</TextField>
								<Button
									variant={behindOnly ? 'contained' : 'outlined'}
									color="error"
									onClick={() => setBehindOnly((b) => !b)}
								>
									Behind schedule only
								</Button>
								<Button
									variant="outlined"
									disabled={!data}
									onClick={() => setEditing(true)}
									startIcon={<FuseSvgIcon size={16}>lucide:settings-2</FuseSvgIcon>}
								>
									Plan templates
								</Button>
							</div>
						</div>

						{data && !data.termStart && (
							<Alert severity="warning">
								{data.term} has no opening date in the academic calendar, so milestones have no due
								dates and nobody is shown as behind. Set term dates in School Settings → Academic
								Calendar.
							</Alert>
						)}

						{error ? (
							<Alert severity="error">{error}</Alert>
						) : (
							<>
								<div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
									{[
										['On installment plans', String(data?.onInstallments ?? 0), 'text-gray-900'],
										['Behind schedule', String(data?.behindSchedule ?? 0), 'text-red-600'],
										['Amount behind', formatKES(data?.amountBehind ?? 0), 'text-red-600']
									].map(([label, value, color]) => (
										<Paper
											key={label}
											className="rounded-2xl p-4 shadow-sm"
										>
											<Typography className="text-xs font-semibold text-gray-500 uppercase">
												{label}
											</Typography>
											<Typography className={`text-xl font-bold ${color}`}>
												{loading && !data ? <CircularProgress size={18} /> : value}
											</Typography>
										</Paper>
									))}
								</div>

								<Paper className="flex flex-col overflow-hidden rounded-2xl shadow-sm">
									<MaterialReactTable
										columns={columns}
										data={rows}
										state={{ isLoading: loading }}
										initialState={{ pagination: { pageSize: 25, pageIndex: 0 } }}
										muiTablePaperProps={{ elevation: 0 }}
									/>
								</Paper>
							</>
						)}

						{editing && data && (
							<TemplatesDialog
								plans={data.plans}
								onClose={() => setEditing(false)}
								onSaved={() => {
									setEditing(false);
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
