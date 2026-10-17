'use client';

import { useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import useToast from '@/hooks/useToast';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { Paper, Typography, Button, Chip, CircularProgress, MenuItem, TextField } from '@mui/material';
import FusePageSimple from '@fuse/core/FusePageSimple';
import AuthGuardRedirect from '@auth/AuthGuardRedirect';
import FuseSvgIcon from '@fuse/core/FuseSvgIcon';
import { MaterialReactTable, type MRT_ColumnDef, type MRT_PaginationState } from 'material-react-table';
import { BACKEND_URL } from '@/lib/backend';

type Person = {
	firstName: string | null;
	lastName: string | null;
	email: string | null;
	phone: string | null;
	role: string;
};
type AuditLog = {
	id: string;
	createdAt: string;
	action: string;
	details: string | null;
	ipAddress: string | null;
	userAgent: string | null;
	actor: Person | null;
	target: Person | null;
};
type Filters = { action: string; actor: string; target: string; search: string; startDate: string; endDate: string };

const nameOf = (p: Person | null) =>
	p ? [p.firstName, p.lastName].filter(Boolean).join(' ') || p.email || p.phone || '' : '';

const queryOf = (f: Filters) => {
	const q = new URLSearchParams();
	Object.entries(f).forEach(([k, v]) => {
		if (v && v !== 'All') q.set(k, v.trim());
	});
	return q;
};

function AuditLogsPage() {
	const { notify } = useToast();
	const { data: session } = useSession();
	const params = useSearchParams();
	const token = session?.backendToken;
	const [logs, setLogs] = useState<AuditLog[]>([]);
	const [total, setTotal] = useState(0);
	const [loading, setLoading] = useState(true);
	const [exporting, setExporting] = useState(false);
	const [actions, setActions] = useState<string[]>([]);
	const [draft, setDraft] = useState<Filters>({
		action: params.get('action') ?? 'All',
		actor: '',
		target: '',
		search: '',
		startDate: '',
		endDate: ''
	});
	// Text filters apply after a short pause so every keystroke doesn't hit the server
	const [filters, setFilters] = useState<Filters>(draft);
	const [pagination, setPagination] = useState<MRT_PaginationState>({ pageIndex: 0, pageSize: 25 });

	useEffect(() => {
		const t = setTimeout(() => {
			setFilters(draft);
			setPagination((p) => ({ ...p, pageIndex: 0 }));
		}, 350);
		return () => clearTimeout(t);
	}, [draft]);

	useEffect(() => {
		if (!token) return;

		fetch(`${BACKEND_URL}/api/audit-logs/actions`, { headers: { Authorization: `Bearer ${token}` } })
			.then((res) => (res.ok ? res.json() : []))
			.then(setActions)
			.catch(() => setActions([]));
	}, [token]);

	useEffect(() => {
		if (!token) return;

		const q = queryOf(filters);
		q.set('page', String(pagination.pageIndex + 1));
		q.set('limit', String(pagination.pageSize));
		setLoading(true);
		fetch(`${BACKEND_URL}/api/audit-logs?${q}`, { headers: { Authorization: `Bearer ${token}` } })
			.then(async (res) => {
				const data = await res.json();

				if (!res.ok) throw new Error(data.error || 'Could not load the audit log');

				setLogs(data.logs);
				setTotal(data.total);
			})
			.catch((err) => notify(err.message, 'error'))
			.finally(() => setLoading(false));
	}, [token, filters, pagination, notify]);

	const exportCsv = async () => {
		setExporting(true);
		try {
			const res = await fetch(`${BACKEND_URL}/api/audit-logs/export.csv?${queryOf(filters)}`, {
				headers: { Authorization: `Bearer ${token}` }
			});

			if (!res.ok) throw new Error((await res.json().catch(() => null))?.error || 'Export failed');

			const url = URL.createObjectURL(await res.blob());
			const a = document.createElement('a');
			a.href = url;
			a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
			a.click();
			URL.revokeObjectURL(url);
		} catch (e) {
			notify((e as Error).message, 'error');
		} finally {
			setExporting(false);
		}
	};

	const set = (key: keyof Filters) => (e: React.ChangeEvent<HTMLInputElement>) =>
		setDraft((d) => ({ ...d, [key]: e.target.value }));
	const filtered = Object.entries(draft).some(([k, v]) => (k === 'action' ? v !== 'All' : !!v));

	const columns = useMemo<MRT_ColumnDef<AuditLog>[]>(
		() => [
			{
				accessorKey: 'createdAt',
				header: 'Timestamp',
				Cell: ({ cell }) => new Date(cell.getValue<string>()).toLocaleString()
			},
			{
				id: 'actor',
				header: 'Actor',
				accessorFn: (row) => nameOf(row.actor) || 'System',
				Cell: ({ row }) => (
					<div>
						<div>{nameOf(row.original.actor) || 'System'}</div>
						{row.original.actor && <div className="text-xs text-gray-500">{row.original.actor.role}</div>}
					</div>
				)
			},
			{
				accessorKey: 'action',
				header: 'Action',
				Cell: ({ cell }) => (
					<Chip
						label={cell.getValue<string>()}
						size="small"
						color="primary"
						variant="outlined"
					/>
				)
			},
			{
				id: 'target',
				header: 'Target',
				accessorFn: (row) => nameOf(row.target) || '—'
			},
			{
				accessorKey: 'details',
				header: 'Details',
				Cell: ({ cell }) => (
					<span className="block max-w-md whitespace-normal">{cell.getValue<string>() || '—'}</span>
				)
			},
			{
				accessorKey: 'ipAddress',
				header: 'IP / device',
				Cell: ({ row }) => (
					<div className="max-w-56">
						<div>{row.original.ipAddress || '—'}</div>
						{row.original.userAgent && (
							<div
								className="truncate text-xs text-gray-500"
								title={row.original.userAgent}
							>
								{row.original.userAgent}
							</div>
						)}
					</div>
				)
			}
		],
		[]
	);

	return (
		<AuthGuardRedirect auth={['SUPER_ADMIN']}>
			<FusePageSimple
				content={
					<div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8">
						<div className="flex w-full flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
							<div className="min-w-0 flex-1">
								<Typography className="text-4xl font-extrabold tracking-tight">Audit Logs</Typography>
								<Typography color="text.secondary">
									Append-only record of who did what, and when. {total.toLocaleString()} matching entr
									{total === 1 ? 'y' : 'ies'}.
								</Typography>
							</div>
							<Button
								variant="outlined"
								color="secondary"
								disabled={exporting || total === 0}
								startIcon={
									exporting ? (
										<CircularProgress size={16} />
									) : (
										<FuseSvgIcon>lucide:download</FuseSvgIcon>
									)
								}
								onClick={exportCsv}
							>
								Export CSV
							</Button>
						</div>

						<Paper className="grid grid-cols-1 gap-3 rounded-2xl p-4 shadow sm:grid-cols-2 lg:grid-cols-6">
							<TextField
								select
								size="small"
								label="Action"
								value={draft.action}
								onChange={set('action')}
							>
								<MenuItem value="All">All actions</MenuItem>
								{[...new Set([...actions, ...(draft.action !== 'All' ? [draft.action] : [])])].map(
									(a) => (
										<MenuItem
											key={a}
											value={a}
										>
											{a}
										</MenuItem>
									)
								)}
							</TextField>
							<TextField
								size="small"
								label="Actor"
								placeholder="Name, email or phone"
								value={draft.actor}
								onChange={set('actor')}
							/>
							<TextField
								size="small"
								label="Target user"
								placeholder="Name, email or phone"
								value={draft.target}
								onChange={set('target')}
							/>
							<TextField
								size="small"
								label="Details contain"
								value={draft.search}
								onChange={set('search')}
							/>
							<TextField
								size="small"
								type="date"
								label="From"
								value={draft.startDate}
								onChange={set('startDate')}
								slotProps={{ inputLabel: { shrink: true } }}
							/>
							<div className="flex gap-2">
								<TextField
									size="small"
									type="date"
									label="To"
									value={draft.endDate}
									onChange={set('endDate')}
									slotProps={{ inputLabel: { shrink: true } }}
									className="flex-1"
								/>
								{filtered && (
									<Button
										size="small"
										onClick={() =>
											setDraft({
												action: 'All',
												actor: '',
												target: '',
												search: '',
												startDate: '',
												endDate: ''
											})
										}
									>
										Clear
									</Button>
								)}
							</div>
						</Paper>

						<Paper className="bg-card flex flex-auto flex-col rounded-2xl p-4 shadow">
							<MaterialReactTable
								columns={columns}
								data={logs}
								manualPagination
								manualFiltering
								manualSorting
								enableColumnFilters={false}
								enableGlobalFilter={false}
								enableSorting={false}
								rowCount={total}
								onPaginationChange={setPagination}
								state={{ isLoading: loading, pagination }}
								muiTablePaperProps={{ elevation: 0 }}
							/>
						</Paper>
					</div>
				}
			/>
		</AuthGuardRedirect>
	);
}

export default function SuperAdminAuditLogs() {
	return (
		<Suspense fallback={<CircularProgress className="m-8" />}>
			<AuditLogsPage />
		</Suspense>
	);
}
