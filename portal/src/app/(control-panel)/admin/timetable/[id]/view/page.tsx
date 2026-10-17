'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
	Alert,
	Button,
	CircularProgress,
	Dialog,
	DialogActions,
	DialogContent,
	DialogTitle,
	MenuItem,
	Paper,
	TextField,
	ToggleButton,
	ToggleButtonGroup,
	Typography
} from '@mui/material';
import FusePageSimple from '@fuse/core/FusePageSimple';
import FuseSvgIcon from '@fuse/core/FuseSvgIcon';
import AuthGuardRedirect from '@auth/AuthGuardRedirect';
import { useSnackbar } from 'notistack';
import { ApiError, errorMessage } from '@/components/timetable/api';
import MasterGrid from '@/components/timetable/MasterGrid';
import TimetableGrid from '@/components/timetable/TimetableGrid';
import TimetableHeader from '@/components/timetable/TimetableHeader';
import { useTimetable } from '@/components/timetable/useTimetable';
import type { GridCell, Lookups, TtDay, TtPeriod } from '@/components/timetable/types';

type View = 'class' | 'teacher' | 'room' | 'master';
type Master = { days: TtDay[]; periods: TtPeriod[]; classes: { id: string; name: string }[]; cells: GridCell[] };

export default function ViewPage() {
	const { id, timetable, api, reload } = useTimetable();
	const { enqueueSnackbar } = useSnackbar();
	const [lookups, setLookups] = useState<Lookups | null>(null);
	const [master, setMaster] = useState<Master | null>(null);
	const [view, setView] = useState<View>('class');
	const [entityId, setEntityId] = useState('');
	const [publishWarn, setPublishWarn] = useState<number | null>(null);
	const [busy, setBusy] = useState(false);

	const load = useCallback(async () => {
		if (!api.ready || !id) return;

		try {
			const [l, m] = await Promise.all([api.get<Lookups>('/setup'), api.get<Master>(`/timetables/${id}/master`)]);
			setLookups(l);
			setMaster(m);
			setEntityId((cur) => cur || l.classes[0]?.id || '');
		} catch (e) {
			enqueueSnackbar(errorMessage(e), { variant: 'error' });
		}
	}, [api, id, enqueueSnackbar]);

	useEffect(() => {
		load();
	}, [load]);

	// The master payload already has every cell — filter it locally for the single views.
	const cells = (master?.cells ?? [])
		.map((c) => ({
			...c,
			lessons: c.lessons.filter((l) =>
				view === 'class'
					? l.classIds.includes(entityId)
					: view === 'teacher'
						? l.teacherIds.includes(entityId)
						: l.roomId === entityId
			)
		}))
		.filter((c) => c.lessons.length > 0);

	const publish = async (force = false) => {
		setBusy(true);

		try {
			await api.post(`/timetables/${id}/publish`, { force });
			enqueueSnackbar('Published — teachers, students and parents can now see it', { variant: 'success' });
			setPublishWarn(null);
			reload();
		} catch (e) {
			const unplaced =
				e instanceof ApiError ? (e.body.details as { unplaced?: number } | undefined)?.unplaced : undefined;

			if (unplaced) setPublishWarn(unplaced);
			else enqueueSnackbar(errorMessage(e), { variant: 'error' });
		} finally {
			setBusy(false);
		}
	};

	const unpublish = async () => {
		try {
			await api.post(`/timetables/${id}/unpublish`);
			enqueueSnackbar('Unpublished', { variant: 'info' });
			reload();
		} catch (e) {
			enqueueSnackbar(errorMessage(e), { variant: 'error' });
		}
	};

	const entities =
		view === 'class'
			? (lookups?.classes ?? [])
			: view === 'teacher'
				? (lookups?.teachers ?? [])
				: (lookups?.rooms ?? []);
	const printIds = view === 'master' ? 'all' : entityId;

	return (
		<AuthGuardRedirect auth={['SUPER_ADMIN', 'ADMIN']}>
			<FusePageSimple
				header={
					<TimetableHeader
						timetable={timetable}
						actions={
							<>
								<Button
									variant="outlined"
									color="inherit"
									className="rounded-full"
									startIcon={<FuseSvgIcon size={16}>lucide:file-spreadsheet</FuseSvgIcon>}
									onClick={() =>
										api
											.download(
												`/timetables/${id}/export.xlsx`,
												`${timetable?.name ?? 'timetable'}.xlsx`
											)
											.catch((e) => enqueueSnackbar(errorMessage(e), { variant: 'error' }))
									}
								>
									Excel
								</Button>
								<Button
									variant="outlined"
									color="inherit"
									className="rounded-full"
									component={Link}
									href={`/admin/timetable/${id}/print?view=${view}&ids=${printIds}`}
									target="_blank"
									startIcon={<FuseSvgIcon size={16}>lucide:printer</FuseSvgIcon>}
								>
									Print / PDF
								</Button>
								{timetable?.status === 'published' ? (
									<Button
										variant="outlined"
										color="warning"
										className="rounded-full"
										onClick={unpublish}
									>
										Unpublish
									</Button>
								) : (
									<Button
										variant="contained"
										color="secondary"
										className="rounded-full"
										disabled={busy || timetable?.status === 'archived'}
										onClick={() => publish(false)}
										startIcon={<FuseSvgIcon size={16}>lucide:send</FuseSvgIcon>}
									>
										Publish
									</Button>
								)}
							</>
						}
					/>
				}
				content={
					<div className="flex w-full flex-col gap-4 p-6">
						{timetable?.status === 'published' && (
							<Alert severity="success">
								This timetable is live. Teachers see it under My Timetable; students and parents see
								their class timetable.
							</Alert>
						)}
						{timetable?.status === 'archived' && (
							<Alert severity="info">
								Archived — a newer timetable was published for {timetable.term}.
							</Alert>
						)}

						<Paper
							variant="outlined"
							className="flex flex-col gap-4 rounded-2xl p-4"
						>
							<div className="flex flex-wrap items-center gap-3">
								<ToggleButtonGroup
									size="small"
									exclusive
									value={view}
									onChange={(_, v: View | null) => {
										if (!v) return;

										setView(v);

										if (v !== 'master' && lookups) {
											setEntityId(
												(v === 'class'
													? lookups.classes
													: v === 'teacher'
														? lookups.teachers
														: lookups.rooms)[0]?.id ?? ''
											);
										}
									}}
								>
									<ToggleButton value="class">Class</ToggleButton>
									<ToggleButton value="teacher">Teacher</ToggleButton>
									<ToggleButton value="room">Room</ToggleButton>
									<ToggleButton value="master">Master</ToggleButton>
								</ToggleButtonGroup>
								{view !== 'master' && (
									<TextField
										select
										size="small"
										value={entityId}
										onChange={(e) => setEntityId(e.target.value)}
										className="min-w-52"
									>
										{entities.map((x) => (
											<MenuItem
												key={x.id}
												value={x.id}
											>
												{x.name}
											</MenuItem>
										))}
									</TextField>
								)}
							</div>

							{!master ? (
								<div className="flex justify-center py-16">
									<CircularProgress />
								</div>
							) : master.cells.length === 0 ? (
								<div className="flex flex-col items-center gap-3 py-16 text-center">
									<Typography color="text.secondary">Nothing has been placed yet.</Typography>
									<Button
										component={Link}
										href={`/admin/timetable/${id}/generate`}
										variant="contained"
										color="secondary"
										className="rounded-full"
									>
										Generate the timetable
									</Button>
								</div>
							) : view === 'master' ? (
								<MasterGrid
									days={master.days}
									periods={master.periods}
									classes={master.classes}
									cells={master.cells}
									onClassClick={(cid) => {
										setView('class');
										setEntityId(cid);
									}}
								/>
							) : (
								<TimetableGrid
									days={master.days}
									periods={master.periods}
									cells={cells}
									view={view}
								/>
							)}
						</Paper>

						<Dialog
							open={publishWarn !== null}
							onClose={() => setPublishWarn(null)}
						>
							<DialogTitle>Some lessons are not placed</DialogTitle>
							<DialogContent>
								<Typography>
									{publishWarn} lesson card(s) are still unplaced, so some classes will have gaps. You
									can place them in the editor first, or publish anyway.
								</Typography>
							</DialogContent>
							<DialogActions>
								<Button
									component={Link}
									href={`/admin/timetable/${id}/editor`}
								>
									Open editor
								</Button>
								<Button
									color="warning"
									variant="contained"
									onClick={() => publish(true)}
								>
									Publish anyway
								</Button>
							</DialogActions>
						</Dialog>
					</div>
				}
			/>
		</AuthGuardRedirect>
	);
}
