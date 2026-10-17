'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
	Alert,
	Button,
	Checkbox,
	CircularProgress,
	Dialog,
	DialogActions,
	DialogContent,
	DialogTitle,
	FormControlLabel,
	IconButton,
	MenuItem,
	Paper,
	TextField,
	Tooltip,
	Typography
} from '@mui/material';
import FusePageSimple from '@fuse/core/FusePageSimple';
import FuseSvgIcon from '@fuse/core/FuseSvgIcon';
import AuthGuardRedirect from '@auth/AuthGuardRedirect';
import { useSnackbar } from 'notistack';
import { errorMessage, useTtApi } from '@/components/timetable/api';
import { statusChip } from '@/components/timetable/TimetableHeader';
import type { Timetable } from '@/components/timetable/types';

type SetupSummary = { days: unknown[]; periods: unknown[]; rooms: unknown[] };

export default function TimetablesPage() {
	const api = useTtApi();
	const router = useRouter();
	const { enqueueSnackbar } = useSnackbar();
	const [rows, setRows] = useState<Timetable[] | null>(null);
	const [setup, setSetup] = useState<SetupSummary | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [dialog, setDialog] = useState<{ copyFrom?: Timetable } | null>(null);
	const [form, setForm] = useState({ name: '', term: '', copyFromId: '', includeEntries: false });
	const [saving, setSaving] = useState(false);
	const [toDelete, setToDelete] = useState<Timetable | null>(null);

	const load = useCallback(async () => {
		if (!api.ready) return;

		try {
			const [list, s] = await Promise.all([api.get<Timetable[]>('/timetables'), api.get<SetupSummary>('/setup')]);
			setRows(list);
			setSetup(s);
			setError(null);
		} catch (e) {
			setError(errorMessage(e));
			setRows([]);
		}
	}, [api]);

	useEffect(() => {
		load();
	}, [load]);

	const openCreate = (copyFrom?: Timetable) => {
		setForm({
			name: copyFrom ? `${copyFrom.name} (copy)` : '',
			term: copyFrom?.term ?? '',
			copyFromId: copyFrom?.id ?? '',
			includeEntries: Boolean(copyFrom)
		});
		setDialog({ copyFrom });
	};

	const create = async () => {
		setSaving(true);

		try {
			const tt = await api.post<Timetable>('/timetables', {
				name: form.name.trim(),
				term: form.term.trim(),
				...(form.copyFromId ? { copyFromId: form.copyFromId, includeEntries: form.includeEntries } : {})
			});
			enqueueSnackbar('Timetable created', { variant: 'success' });
			router.push(`/admin/timetable/${tt.id}/lessons`);
		} catch (e) {
			enqueueSnackbar(errorMessage(e), { variant: 'error' });
		} finally {
			setSaving(false);
		}
	};

	const remove = async () => {
		if (!toDelete) return;

		try {
			await api.del(`/timetables/${toDelete.id}`);
			enqueueSnackbar('Timetable deleted', { variant: 'success' });
			setToDelete(null);
			load();
		} catch (e) {
			enqueueSnackbar(errorMessage(e), { variant: 'error' });
		}
	};

	const setupReady = setup && setup.days.length > 0 && setup.periods.length > 0;

	return (
		<AuthGuardRedirect auth={['SUPER_ADMIN', 'ADMIN']}>
			<FusePageSimple
				content={
					<div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-8">
						<div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
							<div>
								<Typography className="text-4xl font-extrabold tracking-tight">
									Timetable Builder
								</Typography>
								<Typography
									color="text.secondary"
									className="mt-1"
								>
									Set up your school week, enter lessons, generate a clash-free timetable and publish
									it.
								</Typography>
							</div>
							<div className="flex flex-wrap gap-2">
								<Button
									component={Link}
									href="/admin/timetable/substitutions"
									variant="outlined"
									color="inherit"
									className="rounded-full"
									startIcon={<FuseSvgIcon size={16}>lucide:user-x</FuseSvgIcon>}
								>
									Substitutions
								</Button>
								<Button
									component={Link}
									href="/admin/timetable/setup"
									variant="outlined"
									color="inherit"
									className="rounded-full"
									startIcon={<FuseSvgIcon size={16}>lucide:settings-2</FuseSvgIcon>}
								>
									School setup
								</Button>
								<Button
									variant="contained"
									color="secondary"
									className="rounded-full"
									disabled={!setupReady}
									onClick={() => openCreate()}
									startIcon={<FuseSvgIcon size={16}>lucide:plus</FuseSvgIcon>}
								>
									New timetable
								</Button>
							</div>
						</div>

						{error && <Alert severity="error">{error}</Alert>}

						{setup && !setupReady && (
							<Alert
								severity="info"
								action={
									<Button
										component={Link}
										href="/admin/timetable/setup"
										color="inherit"
										size="small"
									>
										Open setup
									</Button>
								}
							>
								Start by setting up your school week: days, periods (bell schedule) and rooms. Subjects,
								classes and teachers come from the rest of the portal.
							</Alert>
						)}

						{rows === null ? (
							<div className="flex justify-center py-16">
								<CircularProgress />
							</div>
						) : rows.length === 0 ? (
							<Paper
								variant="outlined"
								className="flex flex-col items-center gap-3 rounded-2xl px-6 py-16 text-center"
							>
								<FuseSvgIcon
									size={40}
									color="disabled"
								>
									lucide:calendar-days
								</FuseSvgIcon>
								<Typography className="text-lg font-semibold">No timetables yet</Typography>
								<Typography
									color="text.secondary"
									className="max-w-md"
								>
									Create a timetable for a term, add the lessons each class needs, and let the
									generator place them without clashes.
								</Typography>
							</Paper>
						) : (
							<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
								{rows.map((t) => (
									<Paper
										key={t.id}
										variant="outlined"
										className="flex flex-col gap-4 rounded-2xl p-5"
									>
										<div className="flex items-start justify-between gap-3">
											<div className="min-w-0">
												<Link
													href={`/admin/timetable/${t.id}/lessons`}
													className="block truncate text-lg font-bold hover:text-blue-600"
												>
													{t.name}
												</Link>
												<Typography
													variant="body2"
													color="text.secondary"
												>
													{t.term}
												</Typography>
											</div>
											{statusChip(t.status)}
										</div>
										<div className="flex gap-6 text-sm">
											<div>
												<div className="text-2xl font-bold">{t._count?.lessons ?? 0}</div>
												<div className="text-gray-500">lessons</div>
											</div>
											<div>
												<div className="text-2xl font-bold">{t._count?.entries ?? 0}</div>
												<div className="text-gray-500">placed cards</div>
											</div>
										</div>
										<div className="flex flex-wrap items-center gap-2">
											<Button
												size="small"
												variant="contained"
												color="secondary"
												className="rounded-full"
												component={Link}
												href={`/admin/timetable/${t.id}/${(t._count?.entries ?? 0) > 0 ? 'view' : 'lessons'}`}
											>
												Open
											</Button>
											<Button
												size="small"
												color="inherit"
												className="rounded-full"
												component={Link}
												href={`/admin/timetable/${t.id}/editor`}
											>
												Editor
											</Button>
											<div className="flex-1" />
											<Tooltip title="Duplicate (backup before big changes)">
												<IconButton
													size="small"
													onClick={() => openCreate(t)}
												>
													<FuseSvgIcon size={18}>lucide:copy</FuseSvgIcon>
												</IconButton>
											</Tooltip>
											<Tooltip
												title={
													t.status === 'published' ? 'Unpublish before deleting' : 'Delete'
												}
											>
												<span>
													<IconButton
														size="small"
														disabled={t.status === 'published'}
														onClick={() => setToDelete(t)}
													>
														<FuseSvgIcon size={18}>lucide:trash-2</FuseSvgIcon>
													</IconButton>
												</span>
											</Tooltip>
										</div>
									</Paper>
								))}
							</div>
						)}

						<Dialog
							open={Boolean(dialog)}
							onClose={() => setDialog(null)}
							maxWidth="xs"
							fullWidth
						>
							<DialogTitle>{dialog?.copyFrom ? 'Duplicate timetable' : 'New timetable'}</DialogTitle>
							<DialogContent className="flex flex-col gap-4 pt-2!">
								<TextField
									label="Name"
									placeholder="e.g. Main timetable"
									value={form.name}
									onChange={(e) => setForm({ ...form, name: e.target.value })}
									autoFocus
								/>
								<TextField
									label="Term"
									placeholder="e.g. 2026 Term 3"
									value={form.term}
									onChange={(e) => setForm({ ...form, term: e.target.value })}
									helperText="Publishing archives the previously published timetable of the same term."
								/>
								<TextField
									select
									label="Copy lessons from"
									value={form.copyFromId}
									onChange={(e) => setForm({ ...form, copyFromId: e.target.value })}
								>
									<MenuItem value="">Start empty</MenuItem>
									{(rows ?? []).map((t) => (
										<MenuItem
											key={t.id}
											value={t.id}
										>
											{t.name} — {t.term}
										</MenuItem>
									))}
								</TextField>
								{form.copyFromId && (
									<FormControlLabel
										control={
											<Checkbox
												checked={form.includeEntries}
												onChange={(e) => setForm({ ...form, includeEntries: e.target.checked })}
											/>
										}
										label="Also copy placed lessons (full backup)"
									/>
								)}
							</DialogContent>
							<DialogActions>
								<Button onClick={() => setDialog(null)}>Cancel</Button>
								<Button
									variant="contained"
									color="secondary"
									disabled={!form.name.trim() || !form.term.trim() || saving}
									onClick={create}
								>
									{saving ? 'Creating…' : 'Create'}
								</Button>
							</DialogActions>
						</Dialog>

						<Dialog
							open={Boolean(toDelete)}
							onClose={() => setToDelete(null)}
						>
							<DialogTitle>Delete “{toDelete?.name}”?</DialogTitle>
							<DialogContent>
								<Typography>
									All its lessons and placements will be removed. This can’t be undone.
								</Typography>
							</DialogContent>
							<DialogActions>
								<Button onClick={() => setToDelete(null)}>Cancel</Button>
								<Button
									color="error"
									variant="contained"
									onClick={remove}
								>
									Delete
								</Button>
							</DialogActions>
						</Dialog>
					</div>
				}
			/>
		</AuthGuardRedirect>
	);
}
