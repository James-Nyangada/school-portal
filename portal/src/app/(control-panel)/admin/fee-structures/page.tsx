'use client';

import { useEffect, useMemo, useState } from 'react';
import {
	Alert,
	Autocomplete,
	Button,
	Checkbox,
	Chip,
	CircularProgress,
	Dialog,
	DialogActions,
	DialogContent,
	DialogTitle,
	FormControlLabel,
	IconButton,
	InputAdornment,
	MenuItem,
	Paper,
	TextField,
	Tooltip,
	Typography
} from '@mui/material';
import FusePageSimple from '@fuse/core/FusePageSimple';
import AuthGuardRedirect from '@auth/AuthGuardRedirect';
import FuseSvgIcon from '@fuse/core/FuseSvgIcon';
import useUser from '@auth/useUser';
import { CURRENCY, backendRequest, formatDate, formatKES, useBackend } from '@/lib/finance';

type Item = { name: string; amount: number };
type ClassRef = { id: string; name: string; level: number | null };

type Structure = {
	id: string;
	name: string;
	term: string;
	status: 'DRAFT' | 'PUBLISHED';
	notes: string | null;
	items: (Item & { id: string })[];
	total: number;
	classes: ClassRef[];
	studentCount: number;
	revisionCount: number;
	revisionsLeft: number | null;
	revisions: {
		revisionNumber: number;
		reason: string;
		previousItems: Item[];
		newItems: Item[];
		previousTotal: number;
		newTotal: number;
		createdAt: string;
	}[];
	publishedAt: string | null;
	updatedAt: string;
};

type Meta = {
	currentTerm: string;
	term: string;
	terms: string[];
	maxRevisions: number;
	classes: (ClassRef & {
		studentCount: number;
		structure: { id: string; name: string; status: string } | null;
	})[];
};

const SUGGESTED_ITEMS = [
	'Tuition',
	'Transport',
	'Lunch',
	'Activity fee',
	'Exam fee',
	'Boarding',
	'Uniform',
	'Development levy'
];

// ------------------------------------------------------------
// Editor (create / edit draft / revise published)
// ------------------------------------------------------------

function StructureEditor({
	token,
	structure,
	defaultTerm,
	terms,
	maxRevisions,
	onClose,
	onSaved
}: {
	token: string;
	structure: Structure | null;
	defaultTerm: string;
	terms: string[];
	maxRevisions: number;
	onClose: () => void;
	onSaved: (message: string) => void;
}) {
	const published = structure?.status === 'PUBLISHED';
	const [name, setName] = useState(structure?.name ?? '');
	const [term, setTerm] = useState(structure?.term ?? defaultTerm);
	const [notes, setNotes] = useState(structure?.notes ?? '');
	const [items, setItems] = useState<{ name: string; amount: string }[]>(
		structure?.items.map((i) => ({ name: i.name, amount: String(i.amount) })) ?? [{ name: 'Tuition', amount: '' }]
	);
	const [classIds, setClassIds] = useState<string[]>(structure?.classes.map((c) => c.id) ?? []);
	const [reason, setReason] = useState('');
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);

	// Which classes are free for the chosen term
	const meta = useBackend<Meta>(`/api/fee-structures/meta?term=${encodeURIComponent(term || defaultTerm)}`);
	const lockedClassIds = published ? (structure?.classes.map((c) => c.id) ?? []) : [];

	const total = items.reduce((a, i) => a + (Number(i.amount) || 0), 0);
	const cleanItems = items
		.filter((i) => i.name.trim())
		.map((i) => ({ name: i.name.trim(), amount: Number(i.amount) || 0 }));
	const itemsChanged =
		!structure ||
		JSON.stringify(cleanItems) !== JSON.stringify(structure.items.map((i) => ({ name: i.name, amount: i.amount })));

	const available = (meta.data?.classes ?? []).filter((c) => !c.structure || c.structure.id === structure?.id);
	const taken = (meta.data?.classes ?? []).filter((c) => c.structure && c.structure.id !== structure?.id);
	const allSelected = available.length > 0 && available.every((c) => classIds.includes(c.id));

	const setItem = (i: number, patch: Partial<{ name: string; amount: string }>) =>
		setItems((list) => list.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));

	const save = async () => {
		setError(null);

		if (!name.trim()) return setError('Give the fee structure a name');

		if (cleanItems.some((i) => i.amount < 0)) return setError('Amounts cannot be negative');

		if (published && itemsChanged && reason.trim().length < 5)
			return setError('Explain why the published fees are changing — parents will see this reason');

		setSaving(true);
		try {
			const body = JSON.stringify({
				name,
				term,
				notes,
				items: cleanItems,
				classIds,
				reason: reason || undefined
			});
			const res = await backendRequest<Structure & { rebilled?: number }>(
				token,
				structure ? `/api/fee-structures/${structure.id}` : '/api/fee-structures',
				{ method: structure ? 'PUT' : 'POST', body }
			);
			onSaved(
				published && res.rebilled
					? `Saved. ${res.rebilled} student bill(s) updated; payments already made are kept.`
					: structure
						? 'Fee structure saved.'
						: 'Draft created. Publish it when ready to bill students.'
			);
		} catch (e) {
			setError((e as Error).message);
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
			<DialogTitle>
				{structure ? (published ? 'Change published fee structure' : 'Edit draft') : 'New fee structure'}
			</DialogTitle>
			<DialogContent
				dividers
				className="flex flex-col gap-5"
			>
				{published && (
					<Alert severity={structure!.revisionsLeft ? 'warning' : 'error'}>
						This fee structure is published and students have been billed.{' '}
						{structure!.revisionsLeft
							? `Changing the fee items uses 1 of the ${structure!.revisionsLeft} remaining changes (max ${maxRevisions}). Payments already made are kept and re-applied to the new amounts.`
							: 'All changes have been used, so the fee items can no longer be edited.'}{' '}
						You can still rename it, edit the notes or add classes without using a change.
					</Alert>
				)}
				{error && <Alert severity="error">{error}</Alert>}

				<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
					<TextField
						label="Name"
						placeholder="e.g. Upper primary – Term 1"
						value={name}
						onChange={(e) => setName(e.target.value)}
						autoFocus={!structure}
					/>
					<Autocomplete
						freeSolo
						options={terms}
						inputValue={term}
						onInputChange={(_, v, reason) => {
							setTerm(v);

							// Classes are per term, so a different term starts with none selected
							if (!published && reason === 'input' && v !== term) setClassIds([]);
						}}
						disabled={published}
						renderInput={(params) => (
							<TextField
								{...params}
								label="Term"
								helperText={published ? 'The term of a published structure is fixed' : undefined}
							/>
						)}
					/>
				</div>

				<div>
					<div className="mb-2 flex items-center justify-between">
						<Typography className="font-semibold">Fee items</Typography>
						<Typography className="font-bold">Total {formatKES(total)}</Typography>
					</div>
					<div className="flex flex-col gap-2">
						{items.map((item, i) => (
							<div
								key={i}
								className="flex items-center gap-2"
							>
								<TextField
									size="small"
									placeholder="Item, e.g. Tuition"
									value={item.name}
									onChange={(e) => setItem(i, { name: e.target.value })}
									className="flex-1"
									disabled={published && !structure!.revisionsLeft}
								/>
								<TextField
									size="small"
									type="number"
									placeholder="0"
									value={item.amount}
									onChange={(e) => setItem(i, { amount: e.target.value })}
									className="w-40"
									disabled={published && !structure!.revisionsLeft}
									slotProps={{
										input: {
											startAdornment: <InputAdornment position="start">{CURRENCY}</InputAdornment>
										},
										htmlInput: { min: 0 }
									}}
								/>
								<IconButton
									size="small"
									onClick={() => setItems((list) => list.filter((_, idx) => idx !== i))}
									disabled={items.length === 1 || (published && !structure!.revisionsLeft)}
									aria-label="Remove item"
								>
									<FuseSvgIcon size={18}>lucide:trash-2</FuseSvgIcon>
								</IconButton>
							</div>
						))}
					</div>
					{!(published && !structure!.revisionsLeft) && (
						<div className="mt-2 flex flex-wrap gap-1">
							<Button
								size="small"
								startIcon={<FuseSvgIcon size={16}>lucide:plus</FuseSvgIcon>}
								onClick={() => setItems((list) => [...list, { name: '', amount: '' }])}
							>
								Add item
							</Button>
							{SUGGESTED_ITEMS.filter(
								(s) => !items.some((i) => i.name.toLowerCase() === s.toLowerCase())
							).map((s) => (
								<Chip
									key={s}
									size="small"
									variant="outlined"
									label={`+ ${s}`}
									onClick={() =>
										setItems((list) => [
											...list.filter((i) => i.name.trim() || i.amount),
											{ name: s, amount: '' }
										])
									}
								/>
							))}
						</div>
					)}
				</div>

				<div>
					<div className="mb-1 flex items-center justify-between">
						<Typography className="font-semibold">Applies to classes</Typography>
						<FormControlLabel
							control={
								<Checkbox
									size="small"
									checked={allSelected}
									indeterminate={!allSelected && classIds.length > 0}
									onChange={(e) =>
										setClassIds(
											e.target.checked
												? [...new Set([...classIds, ...available.map((c) => c.id)])]
												: lockedClassIds
										)
									}
								/>
							}
							label="All available classes"
						/>
					</div>
					{meta.loading && !meta.data ? (
						<CircularProgress size={20} />
					) : (
						<div className="flex flex-wrap gap-2">
							{available.map((c) => {
								const on = classIds.includes(c.id);
								const fixed = lockedClassIds.includes(c.id);
								return (
									<Chip
										key={c.id}
										label={`${c.name} (${c.studentCount})`}
										color={on ? 'primary' : 'default'}
										variant={on ? 'filled' : 'outlined'}
										icon={fixed ? <FuseSvgIcon size={14}>lucide:lock</FuseSvgIcon> : undefined}
										onClick={
											fixed
												? undefined
												: () =>
														setClassIds((ids) =>
															on ? ids.filter((x) => x !== c.id) : [...ids, c.id]
														)
										}
									/>
								);
							})}
							{available.length === 0 && (
								<Typography className="text-sm text-gray-500">
									No classes are free for this term.
								</Typography>
							)}
						</div>
					)}
					{taken.length > 0 && (
						<Typography className="mt-2 text-xs text-gray-500">
							Already covered for {term}:{' '}
							{taken.map((c) => `${c.name} (${c.structure!.name})`).join(', ')}
						</Typography>
					)}
				</div>

				<TextField
					label="Notes for parents (optional)"
					value={notes}
					onChange={(e) => setNotes(e.target.value)}
					multiline
					minRows={2}
				/>

				{published && itemsChanged && (
					<TextField
						label="Reason for this change (shown to parents)"
						placeholder="e.g. Transport fee corrected from 6,000 to 5,000"
						value={reason}
						onChange={(e) => setReason(e.target.value)}
						required
						multiline
					/>
				)}
			</DialogContent>
			<DialogActions>
				<Button
					onClick={onClose}
					disabled={saving}
				>
					Cancel
				</Button>
				<Button
					variant="contained"
					color="secondary"
					onClick={save}
					disabled={saving}
					startIcon={saving ? <CircularProgress size={16} /> : undefined}
				>
					{published && itemsChanged ? 'Save change' : 'Save'}
				</Button>
			</DialogActions>
		</Dialog>
	);
}

// ------------------------------------------------------------
// Page
// ------------------------------------------------------------

export default function FeeStructuresPage() {
	const { data: user } = useUser();
	const role = Array.isArray(user?.role) ? user.role[0] : (user?.role as string | undefined);
	const canEdit = role === 'ADMIN' || role === 'SUPER_ADMIN';

	const [term, setTerm] = useState<string | null>(null);
	const meta = useBackend<Meta>(`/api/fee-structures/meta${term ? `?term=${encodeURIComponent(term)}` : ''}`);
	const activeTerm = term ?? meta.data?.currentTerm ?? '';
	const list = useBackend<{ structures: Structure[] }>(
		activeTerm ? `/api/fee-structures?term=${encodeURIComponent(activeTerm)}` : null
	);

	const [editing, setEditing] = useState<Structure | 'new' | null>(null);
	const [publishing, setPublishing] = useState<Structure | null>(null);
	const [busy, setBusy] = useState(false);
	const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
	const [terms, setTerms] = useState<string[]>([]);

	useEffect(() => {
		if (meta.data) setTerms((t) => [...new Set([...t, ...meta.data!.terms])]);
	}, [meta.data]);

	const reloadAll = () => {
		meta.reload();
		list.reload();
	};

	const uncovered = useMemo(() => (meta.data?.classes ?? []).filter((c) => !c.structure), [meta.data]);

	const act = async (fn: () => Promise<string>) => {
		setBusy(true);
		setMessage(null);
		try {
			setMessage({ ok: true, text: await fn() });
			reloadAll();
		} catch (e) {
			setMessage({ ok: false, text: (e as Error).message });
		} finally {
			setBusy(false);
		}
	};

	const token = list.token ?? meta.token;

	return (
		<AuthGuardRedirect auth={['SUPER_ADMIN', 'ADMIN', 'FINANCE']}>
			<FusePageSimple
				content={
					<div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8">
						<div className="flex flex-wrap items-end justify-between gap-4">
							<div>
								<Typography className="text-3xl font-extrabold tracking-tight">
									Fee Structures
								</Typography>
								<Typography className="mt-1 text-sm text-gray-500">
									Itemise each term&apos;s fees per class. Drafts can be edited freely; publishing
									bills every student in the chosen classes. A published structure can be changed at
									most {meta.data?.maxRevisions ?? 3} times.
								</Typography>
							</div>
							<div className="flex flex-wrap items-center gap-3">
								<TextField
									select
									size="small"
									label="Term"
									value={activeTerm}
									onChange={(e) => setTerm(e.target.value)}
									className="min-w-40"
									disabled={!meta.data}
								>
									{terms.map((t) => (
										<MenuItem
											key={t}
											value={t}
										>
											{t}
											{t === meta.data?.currentTerm ? ' (current)' : ''}
										</MenuItem>
									))}
								</TextField>
								{canEdit && (
									<Button
										variant="contained"
										color="secondary"
										startIcon={<FuseSvgIcon size={18}>lucide:plus</FuseSvgIcon>}
										onClick={() => setEditing('new')}
										disabled={!meta.data}
									>
										New fee structure
									</Button>
								)}
							</div>
						</div>

						{message && (
							<Alert
								severity={message.ok ? 'success' : 'error'}
								onClose={() => setMessage(null)}
							>
								{message.text}
							</Alert>
						)}
						{(meta.error || list.error) && <Alert severity="error">{meta.error || list.error}</Alert>}

						{meta.data && uncovered.length > 0 && (
							<Alert severity="info">
								{uncovered.length} class{uncovered.length === 1 ? ' has' : 'es have'} no fee structure
								for {activeTerm}: {uncovered.map((c) => c.name).join(', ')}.
							</Alert>
						)}

						{list.loading && !list.data ? (
							<div className="flex justify-center py-16">
								<CircularProgress />
							</div>
						) : list.data?.structures.length === 0 ? (
							<Paper className="flex flex-col items-center gap-3 rounded-2xl p-10 text-center shadow-sm">
								<FuseSvgIcon
									size={40}
									className="text-gray-400"
								>
									lucide:receipt
								</FuseSvgIcon>
								<Typography className="font-semibold">
									No fee structures for {activeTerm} yet
								</Typography>
								{canEdit && (
									<Button
										variant="outlined"
										onClick={() => setEditing('new')}
									>
										Create one
									</Button>
								)}
							</Paper>
						) : (
							<div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
								{list.data?.structures.map((s) => (
									<Paper
										key={s.id}
										className="flex flex-col gap-4 rounded-2xl p-6 shadow-sm"
									>
										<div className="flex flex-wrap items-start justify-between gap-2">
											<div>
												<Typography className="text-lg font-bold">{s.name}</Typography>
												<Typography className="text-sm text-gray-500">
													{s.term} · {s.studentCount} student{s.studentCount === 1 ? '' : 's'}
													{s.publishedAt ? ` · published ${formatDate(s.publishedAt)}` : ''}
												</Typography>
											</div>
											<div className="flex flex-wrap gap-1">
												<Chip
													size="small"
													label={s.status === 'PUBLISHED' ? 'Published' : 'Draft'}
													color={s.status === 'PUBLISHED' ? 'success' : 'default'}
												/>
												{s.status === 'PUBLISHED' && (
													<Chip
														size="small"
														variant="outlined"
														color={s.revisionsLeft ? 'default' : 'error'}
														label={
															s.revisionsLeft
																? `${s.revisionsLeft} change${s.revisionsLeft === 1 ? '' : 's'} left`
																: 'Locked'
														}
													/>
												)}
											</div>
										</div>

										<div className="flex flex-col text-sm">
											{s.items.map((i) => (
												<div
													key={i.id}
													className="flex justify-between border-b border-gray-50 py-1"
												>
													<span>{i.name}</span>
													<span>{formatKES(i.amount)}</span>
												</div>
											))}
											<div className="flex justify-between pt-2 text-base font-bold">
												<span>Total per student</span>
												<span>{formatKES(s.total)}</span>
											</div>
										</div>

										<div className="flex flex-wrap gap-1">
											{s.classes.length ? (
												s.classes.map((c) => (
													<Chip
														key={c.id}
														size="small"
														label={c.name}
													/>
												))
											) : (
												<Typography className="text-sm text-amber-600">
													No classes chosen yet
												</Typography>
											)}
										</div>

										{s.notes && (
											<Typography className="text-sm text-gray-600 italic">{s.notes}</Typography>
										)}

										{s.revisions.length > 0 && (
											<div className="rounded-xl bg-amber-50 p-3 text-sm">
												<Typography className="mb-1 text-sm font-semibold">
													Changes after publishing
												</Typography>
												{s.revisions.map((r) => (
													<div key={r.revisionNumber}>
														{r.revisionNumber}. {formatDate(r.createdAt)}:{' '}
														{formatKES(r.previousTotal)} → {formatKES(r.newTotal)} —{' '}
														{r.reason}
													</div>
												))}
											</div>
										)}

										{canEdit && (
											<div className="mt-auto flex flex-wrap gap-2 border-t border-gray-100 pt-4">
												{s.status === 'DRAFT' && (
													<Button
														variant="contained"
														color="success"
														size="small"
														onClick={() => setPublishing(s)}
														disabled={busy}
													>
														Publish & bill
													</Button>
												)}
												<Button
													size="small"
													variant="outlined"
													onClick={() => setEditing(s)}
													disabled={busy}
												>
													{s.status === 'DRAFT' ? 'Edit' : 'Change / add classes'}
												</Button>
												<Tooltip title="Copy the items into a new draft, e.g. for other classes or next term">
													<Button
														size="small"
														onClick={() =>
															act(async () => {
																await backendRequest(
																	token!,
																	`/api/fee-structures/${s.id}/duplicate`,
																	{
																		method: 'POST',
																		body: '{}'
																	}
																);
																return `Copied "${s.name}" to a new draft.`;
															})
														}
														disabled={busy}
													>
														Duplicate
													</Button>
												</Tooltip>
												{s.status === 'DRAFT' && (
													<Button
														size="small"
														color="error"
														onClick={() =>
															window.confirm(`Delete the draft "${s.name}"?`) &&
															act(async () => {
																await backendRequest(
																	token!,
																	`/api/fee-structures/${s.id}`,
																	{
																		method: 'DELETE'
																	}
																);
																return 'Draft deleted.';
															})
														}
														disabled={busy}
													>
														Delete
													</Button>
												)}
											</div>
										)}
									</Paper>
								))}
							</div>
						)}

						{editing && token && meta.data && (
							<StructureEditor
								token={token}
								structure={editing === 'new' ? null : editing}
								defaultTerm={activeTerm}
								terms={terms}
								maxRevisions={meta.data.maxRevisions}
								onClose={() => setEditing(null)}
								onSaved={(text) => {
									setEditing(null);
									setMessage({ ok: true, text });
									reloadAll();
								}}
							/>
						)}

						{publishing && (
							<Dialog
								open
								onClose={() => !busy && setPublishing(null)}
								maxWidth="xs"
								fullWidth
							>
								<DialogTitle>Publish {publishing.name}?</DialogTitle>
								<DialogContent dividers>
									<Typography className="text-sm">
										This bills <strong>{publishing.studentCount}</strong> student(s) in{' '}
										{publishing.classes.map((c) => c.name).join(', ') || 'no classes'}{' '}
										<strong>{formatKES(publishing.total)}</strong> each for {publishing.term}, and
										notifies their parents.
									</Typography>
									<Typography className="mt-3 text-sm text-gray-600">
										After publishing, the fee items can only be changed{' '}
										{meta.data?.maxRevisions ?? 3} times and the structure cannot be deleted.
									</Typography>
								</DialogContent>
								<DialogActions>
									<Button
										onClick={() => setPublishing(null)}
										disabled={busy}
									>
										Cancel
									</Button>
									<Button
										variant="contained"
										color="success"
										disabled={busy || publishing.total <= 0 || publishing.classes.length === 0}
										startIcon={busy ? <CircularProgress size={16} /> : undefined}
										onClick={() =>
											act(async () => {
												const res = await backendRequest<{ billed: number }>(
													token!,
													`/api/fee-structures/${publishing.id}/publish`,
													{ method: 'POST' }
												);
												return `Published. ${res.billed} student(s) billed.`;
											}).then(() => setPublishing(null))
										}
									>
										Publish & bill
									</Button>
								</DialogActions>
							</Dialog>
						)}
					</div>
				}
			/>
		</AuthGuardRedirect>
	);
}
