'use client';

import { useState } from 'react';
import {
	Alert,
	Autocomplete,
	Button,
	Chip,
	CircularProgress,
	Dialog,
	DialogActions,
	DialogContent,
	DialogTitle,
	FormControlLabel,
	MenuItem,
	Paper,
	Switch,
	TextField,
	Typography
} from '@mui/material';
import FusePageSimple from '@fuse/core/FusePageSimple';
import AuthGuardRedirect from '@auth/AuthGuardRedirect';
import FuseSvgIcon from '@fuse/core/FuseSvgIcon';
import useToast from '@/hooks/useToast';
import { backendRequest, formatDate, formatKES, useBackend } from '@/lib/finance';
import { BACKEND_URL } from '@/lib/backend';

type Clearance = {
	id: string;
	studentId: string;
	leavingStatus: 'COMPLETED' | 'TRANSFERRED';
	status: 'PENDING' | 'RELEASED';
	libraryHold: boolean;
	libraryNote: string | null;
	disciplinaryHold: boolean;
	disciplinaryNote: string | null;
	releasedAt: string | null;
	certificateNumber: string | null;
	createdAt: string;
	balance: number;
	percentPaid: number;
	cleared: boolean;
	blockers: string[];
	student: {
		id: string;
		firstName: string | null;
		lastName: string | null;
		admissionNumber: string | null;
		class: { name: string } | null;
	};
};
type StudentOption = { id: string; firstName: string | null; lastName: string | null; admissionNumber: string | null };

const nameOf = (s: { firstName: string | null; lastName: string | null }) =>
	[s.firstName, s.lastName].filter(Boolean).join(' ') || 'Unnamed student';

function NewClearanceDialog({
	token,
	existing,
	onClose,
	onCreated
}: {
	token: string;
	existing: string[];
	onClose: () => void;
	onCreated: () => void;
}) {
	const [search, setSearch] = useState('');
	const students = useBackend<{ users: StudentOption[] }>(
		`/api/users?role=STUDENT&status=ACTIVE&limit=20${search ? `&search=${encodeURIComponent(search)}` : ''}`
	);
	const [student, setStudent] = useState<StudentOption | null>(null);
	const [leavingStatus, setLeavingStatus] = useState<'COMPLETED' | 'TRANSFERRED'>('COMPLETED');
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const create = async () => {
		if (!student) return;

		setSaving(true);
		setError(null);
		try {
			await backendRequest(token, '/api/clearance', {
				method: 'POST',
				body: JSON.stringify({ studentId: student.id, leavingStatus })
			});
			onCreated();
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
			maxWidth="sm"
		>
			<DialogTitle>Start clearance</DialogTitle>
			<DialogContent
				dividers
				className="flex flex-col gap-4"
			>
				{error && <Alert severity="error">{error}</Alert>}
				<Autocomplete
					options={(students.data?.users ?? []).filter((s) => !existing.includes(s.id))}
					loading={students.loading}
					value={student}
					onChange={(_, v) => setStudent(v)}
					onInputChange={(_, v) => setSearch(v)}
					filterOptions={(x) => x}
					getOptionLabel={(s) => `${nameOf(s)}${s.admissionNumber ? ` (${s.admissionNumber})` : ''}`}
					isOptionEqualToValue={(a, b) => a.id === b.id}
					renderInput={(params) => (
						<TextField
							{...params}
							label="Student"
							placeholder="Search by name or admission number"
						/>
					)}
				/>
				<TextField
					select
					label="Reason for leaving"
					value={leavingStatus}
					onChange={(e) => setLeavingStatus(e.target.value as typeof leavingStatus)}
				>
					<MenuItem value="COMPLETED">Completed studies</MenuItem>
					<MenuItem value="TRANSFERRED">Transferring to another school</MenuItem>
				</TextField>
				<Typography
					variant="body2"
					color="text.secondary"
				>
					The student stays active until the leaving certificate is released.
				</Typography>
			</DialogContent>
			<DialogActions>
				<Button onClick={onClose}>Cancel</Button>
				<Button
					variant="contained"
					color="secondary"
					disabled={!student || saving}
					onClick={create}
				>
					Start clearance
				</Button>
			</DialogActions>
		</Dialog>
	);
}

function ClearanceCard({ c, token, onChange }: { c: Clearance; token: string; onChange: () => void }) {
	const { notify, confirm } = useToast();
	const [busy, setBusy] = useState(false);
	const [notes, setNotes] = useState({
		libraryNote: c.libraryNote ?? '',
		disciplinaryNote: c.disciplinaryNote ?? ''
	});
	const released = c.status === 'RELEASED';

	const call = async (path: string, init: RequestInit, done?: string) => {
		setBusy(true);
		try {
			await backendRequest(token, path, init);

			if (done) notify(done, 'success');

			onChange();
		} catch (e) {
			notify((e as Error).message, 'error');
		} finally {
			setBusy(false);
		}
	};

	const setHold = (patch: Partial<Pick<Clearance, 'libraryHold' | 'disciplinaryHold'>>) =>
		call(`/api/clearance/${c.id}`, {
			method: 'PATCH',
			body: JSON.stringify({
				...patch,
				libraryNote: notes.libraryNote || null,
				disciplinaryNote: notes.disciplinaryNote || null
			})
		});

	const release = async () => {
		if (
			!(await confirm(
				`Release ${nameOf(c.student)}'s leaving certificate? Their account will be marked ${c.leavingStatus === 'TRANSFERRED' ? 'transferred' : 'completed'} and they will no longer be able to sign in.`
			))
		)
			return;

		call(`/api/clearance/${c.id}/release`, { method: 'POST' }, 'Leaving certificate released');
	};

	const withdraw = async () => {
		if (!(await confirm('Withdraw this clearance request?', { destructive: true }))) return;

		call(`/api/clearance/${c.id}`, { method: 'DELETE' }, 'Clearance withdrawn');
	};

	const download = async () => {
		setBusy(true);
		try {
			const res = await fetch(`${BACKEND_URL}/api/clearance/${c.id}/certificate.pdf`, {
				headers: { Authorization: `Bearer ${token}` }
			});

			if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? 'Download failed');

			const url = URL.createObjectURL(await res.blob());
			const a = document.createElement('a');
			a.href = url;
			a.download = `leaving-certificate-${c.certificateNumber}.pdf`;
			a.click();
			URL.revokeObjectURL(url);
		} catch (e) {
			notify((e as Error).message, 'error');
		} finally {
			setBusy(false);
		}
	};

	return (
		<Paper className="flex flex-col gap-4 rounded-2xl p-5 shadow-sm">
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div>
					<Typography className="text-lg font-bold">{nameOf(c.student)}</Typography>
					<Typography className="text-sm text-gray-500">
						{[
							c.student.admissionNumber,
							c.student.class?.name,
							c.leavingStatus === 'TRANSFERRED' ? 'Transfer' : 'Completed studies'
						]
							.filter(Boolean)
							.join(' · ')}
					</Typography>
				</div>
				{released ? (
					<Chip
						color="success"
						label={`Released ${c.releasedAt ? formatDate(c.releasedAt) : ''} · ${c.certificateNumber}`}
					/>
				) : (
					<Chip
						color={c.cleared ? 'success' : 'warning'}
						label={c.cleared ? 'Cleared — ready to release' : 'Not cleared'}
					/>
				)}
			</div>

			<div className="grid grid-cols-1 gap-3 md:grid-cols-3">
				<div className="rounded-xl bg-gray-50 p-3">
					<Typography className="text-xs font-semibold text-gray-500 uppercase">Fees</Typography>
					<Typography className={`font-bold ${c.balance > 0 ? 'text-red-600' : 'text-green-600'}`}>
						{c.balance > 0 ? `${formatKES(c.balance)} owed` : 'Fully paid'}
					</Typography>
					<Typography className="text-xs text-gray-500">{c.percentPaid}% of all fees paid</Typography>
				</div>
				{(
					[
						['libraryHold', 'libraryNote', 'Library', 'Books or equipment still out'],
						['disciplinaryHold', 'disciplinaryNote', 'Discipline', 'Open disciplinary matter']
					] as const
				).map(([hold, note, label, hint]) => (
					<div
						key={hold}
						className="flex flex-col gap-2 rounded-xl bg-gray-50 p-3"
					>
						<FormControlLabel
							control={
								<Switch
									size="small"
									checked={c[hold]}
									disabled={released || busy}
									onChange={(e) => setHold({ [hold]: e.target.checked })}
								/>
							}
							label={
								<span className="text-sm font-semibold">
									{label}: {c[hold] ? 'hold' : 'clear'}
								</span>
							}
						/>
						{(c[hold] || c[note]) && (
							<TextField
								size="small"
								placeholder={hint}
								value={notes[note]}
								disabled={released}
								onChange={(e) => setNotes((n) => ({ ...n, [note]: e.target.value }))}
								onBlur={() => notes[note] !== (c[note] ?? '') && setHold({})}
							/>
						)}
					</div>
				))}
			</div>

			{!released && c.blockers.length > 0 && (
				<Alert severity="warning">
					{c.blockers.map((b) => (
						<div key={b}>{b}</div>
					))}
				</Alert>
			)}

			<div className="flex flex-wrap justify-end gap-2">
				{released ? (
					<Button
						variant="contained"
						color="secondary"
						disabled={busy}
						onClick={download}
						startIcon={<FuseSvgIcon size={16}>lucide:download</FuseSvgIcon>}
					>
						Leaving certificate
					</Button>
				) : (
					<>
						<Button
							color="error"
							disabled={busy}
							onClick={withdraw}
						>
							Withdraw
						</Button>
						<Button
							variant="contained"
							color="secondary"
							disabled={busy || !c.cleared}
							onClick={release}
							startIcon={
								busy ? (
									<CircularProgress size={16} />
								) : (
									<FuseSvgIcon size={16}>lucide:badge-check</FuseSvgIcon>
								)
							}
						>
							Release certificate
						</Button>
					</>
				)}
			</div>
		</Paper>
	);
}

/** Final clearance for leavers (school-dashboard-spec §3.7). */
export default function AdminClearance() {
	const { data, error, loading, reload, token } = useBackend<Clearance[]>('/api/clearance');
	const [creating, setCreating] = useState(false);
	const [showReleased, setShowReleased] = useState(false);
	const pending = (data ?? []).filter((c) => c.status === 'PENDING');
	const released = (data ?? []).filter((c) => c.status === 'RELEASED');

	return (
		<AuthGuardRedirect auth={['SUPER_ADMIN', 'ADMIN']}>
			<FusePageSimple
				content={
					<div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8">
						<div className="flex flex-wrap items-end justify-between gap-4">
							<div>
								<Typography className="text-3xl font-extrabold tracking-tight">
									Leavers&apos; Clearance
								</Typography>
								<Typography className="mt-1 text-sm text-gray-500">
									Fees must be fully paid and library and disciplinary holds lifted before the leaving
									certificate is released.
								</Typography>
							</div>
							<Button
								variant="contained"
								color="secondary"
								className="rounded-full"
								disabled={!token}
								onClick={() => setCreating(true)}
								startIcon={<FuseSvgIcon size={16}>lucide:plus</FuseSvgIcon>}
							>
								Start clearance
							</Button>
						</div>

						{error && <Alert severity="error">{error}</Alert>}
						{loading && !data ? (
							<div className="flex justify-center py-12">
								<CircularProgress />
							</div>
						) : (
							<>
								{pending.length === 0 && (
									<Paper className="rounded-2xl p-8 text-center text-gray-500 shadow-sm">
										No clearances in progress.
									</Paper>
								)}
								{token &&
									pending.map((c) => (
										<ClearanceCard
											key={c.id}
											c={c}
											token={token}
											onChange={reload}
										/>
									))}
								{released.length > 0 && (
									<Button
										className="self-start"
										onClick={() => setShowReleased((v) => !v)}
									>
										{showReleased ? 'Hide' : 'Show'} released ({released.length})
									</Button>
								)}
								{token &&
									showReleased &&
									released.map((c) => (
										<ClearanceCard
											key={c.id}
											c={c}
											token={token}
											onChange={reload}
										/>
									))}
							</>
						)}

						{creating && token && (
							<NewClearanceDialog
								token={token}
								existing={(data ?? []).map((c) => c.studentId)}
								onClose={() => setCreating(false)}
								onCreated={() => {
									setCreating(false);
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
