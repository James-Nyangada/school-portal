'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
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
	LinearProgress,
	ListItemText,
	ListSubheader,
	MenuItem,
	Paper,
	TextField,
	ToggleButton,
	ToggleButtonGroup,
	Tooltip,
	Typography
} from '@mui/material';
import FusePageSimple from '@fuse/core/FusePageSimple';
import FuseSvgIcon from '@fuse/core/FuseSvgIcon';
import AuthGuardRedirect from '@auth/AuthGuardRedirect';
import { useSnackbar } from 'notistack';
import useToast from '@/hooks/useToast';
import { useParams } from 'next/navigation';
import { ApiError, errorMessage, useTtApi } from '@/components/timetable/api';
import TimetableHeader from '@/components/timetable/TimetableHeader';
import { useTimetable } from '@/components/timetable/useTimetable';
import type { Lookups } from '@/components/timetable/types';
import { ROOM_TYPE_OPTIONS, roomTypeLabel } from '@/components/timetable/roomTypes';

type Lesson = {
	id: string;
	subjectId: string;
	classIds: string[];
	teacherIds: string[];
	periodsPerWeek: number;
	doublesPerWeek: number;
	roomType: string | null;
	groupId: string | null;
};
type Group = { id: string; name: string };
type Load = { teacherId: string; name: string; short: string; assigned: number; available: number };
type LessonForm = Omit<Lesson, 'id'> & { id?: string; combined?: boolean };

/**
 * Teachers who teach the subject (set on the staff page). Teachers already on the lesson stay listed
 * so older data that predates subject assignments is never hidden.
 */
const teachersFor = (lookups: Lookups, subjectId: string, keep: string[] = []) =>
	lookups.teachers.filter((t) => keep.includes(t.id) || (!!subjectId && t.subjectIds.includes(subjectId)));

const NoTeacherHint = ({ subject }: { subject?: string }) => (
	<ListSubheader className="max-w-xs py-2 leading-5 whitespace-normal">
		{subject
			? `No teacher is assigned ${subject}. Add it to a teacher under Staff & Students → Edit details.`
			: 'Pick a subject first.'}
	</ListSubheader>
);

/** Existing multi-class lessons were saved as combined; new ones default to one lesson per class. */
const isCombined = (f: LessonForm) => f.combined ?? (!!f.id && f.classIds.length > 1);

const MAX_TEACHERS = 2;

const emptyForm: LessonForm = {
	subjectId: '',
	classIds: [],
	teacherIds: [],
	periodsPerWeek: 4,
	doublesPerWeek: 0,
	roomType: null,
	groupId: null
};

export default function LessonsPage() {
	const { prompt } = useToast();
	const { id, timetable, api } = useTimetable();
	const { enqueueSnackbar } = useSnackbar();
	const [lookups, setLookups] = useState<Lookups | null>(null);
	const [lessons, setLessons] = useState<Lesson[] | null>(null);
	const [groups, setGroups] = useState<Group[]>([]);
	const [loads, setLoads] = useState<Load[]>([]);
	const [mode, setMode] = useState<'list' | 'matrix'>('list');
	const [filter, setFilter] = useState({ classId: '', teacherId: '', subjectId: '' });
	const [form, setForm] = useState<LessonForm | null>(null);
	const [importOpen, setImportOpen] = useState(false);

	const load = useCallback(async () => {
		if (!api.ready || !id) return;

		try {
			const [setup, ls, tl] = await Promise.all([
				api.get<Lookups>('/setup'),
				api.get<{ lessons: Lesson[]; groups: Group[] }>(`/timetables/${id}/lessons`),
				api.get<Load[]>(`/timetables/${id}/teacher-loads`)
			]);
			setLookups(setup);
			setLessons(ls.lessons);
			setGroups(ls.groups);
			setLoads(tl);
		} catch (e) {
			enqueueSnackbar(errorMessage(e), { variant: 'error' });
		}
	}, [api, id, enqueueSnackbar]);

	useEffect(() => {
		load();
	}, [load]);

	const name = useMemo(() => {
		const m = new Map<string, string>();
		lookups?.subjects.forEach((s) => m.set(s.id, s.name));
		lookups?.classes.forEach((c) => m.set(c.id, c.name));
		lookups?.teachers.forEach((t) => m.set(t.id, t.name));

		return (x: string) => m.get(x) ?? '—';
	}, [lookups]);

	const filtered = (lessons ?? []).filter(
		(l) =>
			(!filter.classId || l.classIds.includes(filter.classId)) &&
			(!filter.teacherId || l.teacherIds.includes(filter.teacherId)) &&
			(!filter.subjectId || l.subjectId === filter.subjectId)
	);

	const totalPeriods = (lessons ?? []).reduce((n, l) => n + l.periodsPerWeek, 0);

	const saveLesson = async () => {
		if (!form) return;

		try {
			const { id: lessonId, combined: _combined, ...rest } = form;
			const body = { ...rest, roomType: form.roomType || null, groupId: form.groupId || null };

			// Not combined: each class gets its own lesson, so the teacher takes them at different times.
			const separate = !isCombined(form) && form.classIds.length > 1;
			const original = lessons?.find((l) => l.id === lessonId);
			const keep = separate
				? (form.classIds.find((c) => original?.classIds.includes(c)) ?? form.classIds[0]!)
				: null;
			const bodies = separate ? form.classIds.map((c) => ({ ...body, classIds: [c] })) : [body];

			if (lessonId)
				await api.patch(`/timetables/${id}/lessons/${lessonId}`, keep ? { ...body, classIds: [keep] } : body);

			for (const b of bodies) {
				if (lessonId && keep && b.classIds[0] === keep) continue;

				if (!lessonId || separate) await api.post(`/timetables/${id}/lessons`, b);
			}

			const added = lessonId ? bodies.length - 1 : bodies.length;
			enqueueSnackbar(
				lessonId
					? added > 0
						? `Lesson updated and ${added} more added`
						: 'Lesson updated'
					: added > 1
						? `${added} lessons added`
						: 'Lesson added',
				{ variant: 'success' }
			);
			setForm(null);
			load();
		} catch (e) {
			enqueueSnackbar(errorMessage(e), { variant: 'error' });
		}
	};

	const deleteLesson = async (lessonId: string) => {
		try {
			await api.del(`/timetables/${id}/lessons/${lessonId}`);
			load();
		} catch (e) {
			enqueueSnackbar(errorMessage(e), { variant: 'error' });
		}
	};

	const createGroup = async () => {
		const groupName = await prompt('Name of the option block', {
			title: 'New option block',
			placeholder: 'e.g. Form 3 Option A',
			required: true,
			confirmText: 'Create'
		});

		if (!groupName?.trim()) return;

		try {
			await api.post(`/timetables/${id}/groups`, { name: groupName.trim() });
			load();
		} catch (e) {
			enqueueSnackbar(errorMessage(e), { variant: 'error' });
		}
	};

	const deleteGroup = async (groupId: string) => {
		try {
			await api.del(`/timetables/${id}/groups/${groupId}`);
			load();
		} catch (e) {
			enqueueSnackbar(errorMessage(e), { variant: 'error' });
		}
	};

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
									onClick={() => setImportOpen(true)}
								>
									Import from Excel
								</Button>
								<Button
									variant="contained"
									color="secondary"
									className="rounded-full"
									startIcon={<FuseSvgIcon size={16}>lucide:plus</FuseSvgIcon>}
									onClick={() => setForm({ ...emptyForm })}
									disabled={!lookups}
								>
									Add lesson
								</Button>
							</>
						}
					/>
				}
				content={
					<div className="flex w-full flex-col gap-6 p-6 lg:flex-row">
						<div className="flex min-w-0 flex-1 flex-col gap-4">
							{!lessons || !lookups ? (
								<div className="flex justify-center py-16">
									<CircularProgress />
								</div>
							) : (
								<>
									<div className="flex flex-wrap items-center justify-between gap-3">
										<ToggleButtonGroup
											size="small"
											exclusive
											value={mode}
											onChange={(_, v) => v && setMode(v)}
										>
											<ToggleButton value="list">
												<FuseSvgIcon
													size={16}
													className="mr-1"
												>
													lucide:list
												</FuseSvgIcon>
												List
											</ToggleButton>
											<ToggleButton value="matrix">
												<FuseSvgIcon
													size={16}
													className="mr-1"
												>
													lucide:grid-3x3
												</FuseSvgIcon>
												Matrix
											</ToggleButton>
										</ToggleButtonGroup>
										<Typography
											variant="body2"
											color="text.secondary"
										>
											{lessons.length} lessons · {totalPeriods} periods a week
										</Typography>
									</div>

									{lookups.subjects.length === 0 ||
									lookups.classes.length === 0 ||
									lookups.teachers.length === 0 ? (
										<Alert severity="warning">
											You need subjects, classes and teacher accounts before adding lessons. Add
											them in Subjects Registry, Classes &amp; Streams and Staff &amp; Students.
										</Alert>
									) : null}

									{mode === 'list' ? (
										<Paper
											variant="outlined"
											className="rounded-2xl"
										>
											<div className="flex flex-wrap gap-2 border-b border-gray-100 p-3 dark:border-white/10">
												<FilterSelect
													label="Class"
													value={filter.classId}
													options={lookups.classes}
													onChange={(v) => setFilter({ ...filter, classId: v })}
												/>
												<FilterSelect
													label="Teacher"
													value={filter.teacherId}
													options={lookups.teachers}
													onChange={(v) => setFilter({ ...filter, teacherId: v })}
												/>
												<FilterSelect
													label="Subject"
													value={filter.subjectId}
													options={lookups.subjects}
													onChange={(v) => setFilter({ ...filter, subjectId: v })}
												/>
											</div>
											{filtered.length === 0 ? (
												<Typography
													color="text.secondary"
													className="p-8 text-center"
												>
													{lessons.length === 0
														? 'No lessons yet. Add them one by one, use the matrix, or import a spreadsheet.'
														: 'No lessons match these filters.'}
												</Typography>
											) : (
												<div className="overflow-x-auto">
													<table className="w-full text-sm">
														<thead>
															<tr className="text-left text-xs tracking-wide text-gray-500 uppercase">
																<th className="px-4 py-2">Subject</th>
																<th className="px-4 py-2">Class(es)</th>
																<th className="px-4 py-2">Teacher(s)</th>
																<th className="px-4 py-2 text-center">Per week</th>
																<th className="px-4 py-2 text-center">Doubles</th>
																<th className="px-4 py-2">Block / room</th>
																<th />
															</tr>
														</thead>
														<tbody>
															{filtered.map((l) => {
																const subj = lookups.subjects.find(
																	(s) => s.id === l.subjectId
																);

																return (
																	<tr
																		key={l.id}
																		className="border-t border-gray-100 hover:bg-gray-50 dark:border-white/10 dark:hover:bg-white/5"
																	>
																		<td className="px-4 py-2">
																			<span className="flex items-center gap-2 font-semibold">
																				<span
																					className="inline-block h-3 w-3 rounded-full"
																					style={{
																						backgroundColor: subj?.color
																					}}
																				/>
																				{name(l.subjectId)}
																			</span>
																		</td>
																		<td className="px-4 py-2">
																			{l.classIds.map(name).join(', ')}
																		</td>
																		<td className="px-4 py-2">
																			{l.teacherIds.map(name).join(', ')}
																		</td>
																		<td className="px-4 py-2 text-center font-semibold">
																			{l.periodsPerWeek}
																		</td>
																		<td className="px-4 py-2 text-center">
																			{l.doublesPerWeek || '—'}
																		</td>
																		<td className="px-4 py-2">
																			<div className="flex flex-wrap gap-1">
																				{l.groupId && (
																					<Chip
																						size="small"
																						label={
																							groups.find(
																								(g) =>
																									g.id === l.groupId
																							)?.name ?? 'Block'
																						}
																					/>
																				)}
																				{(l.roomType ?? subj?.roomType) && (
																					<Chip
																						size="small"
																						variant="outlined"
																						label={roomTypeLabel(
																							(l.roomType ??
																								subj?.roomType)!
																						)}
																					/>
																				)}
																			</div>
																		</td>
																		<td className="px-2 py-2 text-right whitespace-nowrap">
																			<IconButton
																				size="small"
																				onClick={() => setForm({ ...l })}
																				aria-label="Edit"
																			>
																				<FuseSvgIcon size={16}>
																					lucide:pencil
																				</FuseSvgIcon>
																			</IconButton>
																			<IconButton
																				size="small"
																				onClick={() => deleteLesson(l.id)}
																				aria-label="Delete"
																			>
																				<FuseSvgIcon size={16}>
																					lucide:trash-2
																				</FuseSvgIcon>
																			</IconButton>
																		</td>
																	</tr>
																);
															})}
														</tbody>
													</table>
												</div>
											)}
										</Paper>
									) : (
										<LessonMatrix
											lookups={lookups}
											lessons={lessons}
											onSaved={(r) => {
												enqueueSnackbar(
													`Saved: ${r.created} added, ${r.updated} changed, ${r.removed} removed`,
													{ variant: 'success' }
												);
												load();
											}}
										/>
									)}

									<Paper
										variant="outlined"
										className="rounded-2xl p-4"
									>
										<div className="mb-2 flex items-center justify-between">
											<div>
												<Typography className="font-semibold">Option blocks</Typography>
												<Typography
													variant="body2"
													color="text.secondary"
												>
													Electives that run at the same time for a whole level (students
													split between them). Add lessons to a block from the lesson form —
													every lesson in a block needs the same periods and doubles.
												</Typography>
											</div>
											<Button
												size="small"
												onClick={createGroup}
												startIcon={<FuseSvgIcon size={14}>lucide:plus</FuseSvgIcon>}
											>
												New block
											</Button>
										</div>
										{groups.length === 0 ? (
											<Typography
												variant="body2"
												color="text.secondary"
											>
												No option blocks.
											</Typography>
										) : (
											<div className="flex flex-col gap-2">
												{groups.map((g) => {
													const members = lessons.filter((l) => l.groupId === g.id);
													const patterns = new Set(
														members.map((m) => `${m.periodsPerWeek}/${m.doublesPerWeek}`)
													);

													return (
														<div
															key={g.id}
															className="flex flex-wrap items-center gap-2 rounded-xl bg-gray-50 px-3 py-2 dark:bg-white/5"
														>
															<span className="font-semibold">{g.name}</span>
															{members.map((m) => (
																<Chip
																	key={m.id}
																	size="small"
																	label={`${name(m.subjectId)} · ${m.teacherIds.map(name).join(', ')}`}
																	onClick={() => setForm({ ...m })}
																/>
															))}
															{members.length === 0 && (
																<span className="text-xs text-gray-500">empty</span>
															)}
															{patterns.size > 1 && (
																<Chip
																	size="small"
																	color="error"
																	label="Periods don't match"
																/>
															)}
															<div className="flex-1" />
															<IconButton
																size="small"
																onClick={() => deleteGroup(g.id)}
																aria-label="Delete block"
															>
																<FuseSvgIcon size={14}>lucide:trash-2</FuseSvgIcon>
															</IconButton>
														</div>
													);
												})}
											</div>
										)}
									</Paper>
								</>
							)}
						</div>

						<TeacherLoads loads={loads} />

						{form && lookups && (
							<LessonDialog
								form={form}
								setForm={setForm}
								lookups={lookups}
								groups={groups}
								onSave={saveLesson}
							/>
						)}

						{importOpen && (
							<ImportDialog
								timetableId={id}
								onClose={() => setImportOpen(false)}
								onImported={() => {
									setImportOpen(false);
									load();
								}}
							/>
						)}
					</div>
				}
			/>
		</AuthGuardRedirect>
	);
}

function ImportDialog({
	timetableId,
	onClose,
	onImported
}: {
	timetableId: string;
	onClose: () => void;
	onImported: () => void;
}) {
	const api = useTtApi();
	const { enqueueSnackbar } = useSnackbar();
	const [file, setFile] = useState<File | null>(null);
	const [busy, setBusy] = useState(false);
	const [rowErrors, setRowErrors] = useState<{ sheet: string; row: number; message: string }[]>([]);

	const submit = async () => {
		if (!file) return;

		setBusy(true);
		setRowErrors([]);

		try {
			const fd = new FormData();
			fd.append('file', file);
			const r = await api.upload<{ imported: Record<string, number> }>(`/timetables/${timetableId}/import`, fd);
			enqueueSnackbar(
				`Imported ${Object.entries(r.imported)
					.map(([k, v]) => `${v} ${k}`)
					.join(', ')}`,
				{ variant: 'success' }
			);
			onImported();
		} catch (e) {
			if (e instanceof ApiError && Array.isArray(e.body.rowErrors))
				setRowErrors(e.body.rowErrors as typeof rowErrors);
			else enqueueSnackbar(errorMessage(e), { variant: 'error' });
		} finally {
			setBusy(false);
		}
	};

	return (
		<Dialog
			open
			onClose={onClose}
			maxWidth="sm"
			fullWidth
		>
			<DialogTitle>Import from Excel</DialogTitle>
			<DialogContent className="flex flex-col gap-4">
				<Typography variant="body2">
					Download the template, fill in the sheets you need (Subjects, Classes, Rooms, Teachers, Lessons) and
					upload it. Every row is checked first — nothing is saved if any row has a problem.
				</Typography>
				<Button
					variant="outlined"
					className="w-fit"
					startIcon={<FuseSvgIcon size={16}>lucide:download</FuseSvgIcon>}
					onClick={() =>
						api
							.download('/import/template.xlsx', 'timetable-import-template.xlsx')
							.catch((e) => enqueueSnackbar(errorMessage(e), { variant: 'error' }))
					}
				>
					Download template
				</Button>
				<input
					type="file"
					accept=".xlsx"
					onChange={(e) => setFile(e.target.files?.[0] ?? null)}
				/>
				{busy && <LinearProgress />}
				{rowErrors.length > 0 && (
					<Alert severity="error">
						<div className="mb-1 font-semibold">Nothing was imported. Fix these rows and try again:</div>
						<ul className="max-h-60 list-disc overflow-y-auto pl-5 text-sm">
							{rowErrors.map((r, i) => (
								<li key={i}>
									{r.sheet} row {r.row}: {r.message}
								</li>
							))}
						</ul>
					</Alert>
				)}
			</DialogContent>
			<DialogActions>
				<Button onClick={onClose}>Cancel</Button>
				<Button
					variant="contained"
					color="secondary"
					disabled={!file || busy}
					onClick={submit}
				>
					Import
				</Button>
			</DialogActions>
		</Dialog>
	);
}

function FilterSelect({
	label,
	value,
	options,
	onChange
}: {
	label: string;
	value: string;
	options: { id: string; name: string }[];
	onChange: (v: string) => void;
}) {
	return (
		<TextField
			select
			size="small"
			label={label}
			value={value}
			onChange={(e) => onChange(e.target.value)}
			className="min-w-40"
		>
			<MenuItem value="">All</MenuItem>
			{options.map((o) => (
				<MenuItem
					key={o.id}
					value={o.id}
				>
					{o.name}
				</MenuItem>
			))}
		</TextField>
	);
}

function TeacherLoads({ loads }: { loads: Load[] }) {
	const active = loads
		.filter((l) => l.assigned > 0)
		.sort((a, b) => b.assigned / Math.max(b.available, 1) - a.assigned / Math.max(a.available, 1));
	const idle = loads.filter((l) => l.assigned === 0);

	return (
		<Paper
			variant="outlined"
			className="h-fit w-full shrink-0 rounded-2xl p-4 lg:sticky lg:top-20 lg:w-72"
		>
			<Typography className="font-semibold">Teacher loads</Typography>
			<Typography
				variant="caption"
				color="text.secondary"
			>
				Periods assigned / available this week
			</Typography>
			<div className="mt-3 flex max-h-[60vh] flex-col gap-3 overflow-y-auto pr-1">
				{active.length === 0 && (
					<Typography
						variant="body2"
						color="text.secondary"
					>
						No teachers assigned yet.
					</Typography>
				)}
				{active.map((l) => {
					const over = l.assigned > l.available;
					const pct = Math.min(100, (l.assigned / Math.max(l.available, 1)) * 100);

					return (
						<div key={l.teacherId}>
							<div className="mb-1 flex justify-between text-sm">
								<span className="truncate">{l.name}</span>
								<span className={over ? 'font-bold text-rose-600' : 'font-semibold'}>
									{l.assigned}/{l.available}
								</span>
							</div>
							<LinearProgress
								variant="determinate"
								value={pct}
								color={over ? 'error' : pct > 85 ? 'warning' : 'primary'}
								sx={{ height: 6, borderRadius: 3 }}
							/>
						</div>
					);
				})}
				{idle.length > 0 && (
					<Typography
						variant="caption"
						color="text.secondary"
					>
						Not teaching yet: {idle.map((l) => l.short).join(', ')}
					</Typography>
				)}
			</div>
		</Paper>
	);
}

function LessonDialog({
	form,
	setForm,
	lookups,
	groups,
	onSave
}: {
	form: LessonForm;
	setForm: (f: LessonForm | null) => void;
	lookups: Lookups;
	groups: Group[];
	onSave: () => void;
}) {
	const subject = lookups.subjects.find((s) => s.id === form.subjectId);
	const valid =
		form.subjectId &&
		form.classIds.length > 0 &&
		form.teacherIds.length > 0 &&
		form.periodsPerWeek > 0 &&
		form.doublesPerWeek * 2 <= form.periodsPerWeek;

	return (
		<Dialog
			open
			onClose={() => setForm(null)}
			maxWidth="sm"
			fullWidth
		>
			<DialogTitle>{form.id ? 'Edit lesson' : 'Add lesson'}</DialogTitle>
			<DialogContent className="flex flex-col gap-4 pt-2!">
				<Autocomplete
					options={lookups.subjects}
					getOptionLabel={(s) => `${s.name} (${s.code})`}
					value={subject ?? null}
					onChange={(_, s) =>
						setForm({
							...form,
							subjectId: s?.id ?? '',
							teacherIds: form.teacherIds.filter((tid) =>
								lookups.teachers.find((t) => t.id === tid)?.subjectIds.includes(s?.id ?? '')
							)
						})
					}
					renderInput={(p) => (
						<TextField
							{...p}
							label="Subject"
						/>
					)}
				/>
				<TextField
					select
					label="Class(es)"
					value={form.classIds}
					onChange={(e) => setForm({ ...form, classIds: e.target.value as unknown as string[] })}
					helperText={
						isCombined(form)
							? 'All ticked classes sit together in the same period.'
							: 'Each ticked class gets its own lesson, scheduled at different times.'
					}
					slotProps={{
						select: {
							multiple: true,
							renderValue: (ids) => (
								<div className="flex flex-wrap gap-1">
									{(ids as string[]).map((cid) => (
										<Chip
											key={cid}
											size="small"
											label={lookups.classes.find((c) => c.id === cid)?.name ?? '?'}
											onMouseDown={(e) => e.stopPropagation()}
											onDelete={() =>
												setForm({ ...form, classIds: form.classIds.filter((x) => x !== cid) })
											}
										/>
									))}
								</div>
							)
						}
					}}
				>
					{lookups.classes.map((c) => (
						<MenuItem
							key={c.id}
							value={c.id}
						>
							<Checkbox
								size="small"
								checked={form.classIds.includes(c.id)}
							/>
							<ListItemText primary={c.name} />
						</MenuItem>
					))}
				</TextField>
				{form.classIds.length > 1 && (
					<FormControlLabel
						className="-mt-2"
						control={
							<Checkbox
								size="small"
								checked={isCombined(form)}
								onChange={(e) => setForm({ ...form, combined: e.target.checked })}
							/>
						}
						label="Taught together in the same period (combined lesson, e.g. joint games or assembly)"
					/>
				)}
				<TextField
					select
					label="Teacher(s)"
					disabled={!form.subjectId}
					value={form.teacherIds}
					onChange={(e) =>
						setForm({ ...form, teacherIds: (e.target.value as unknown as string[]).slice(0, MAX_TEACHERS) })
					}
					helperText={
						form.subjectId
							? `Only teachers who teach ${subject?.name ?? 'this subject'}. Up to ${MAX_TEACHERS} per lesson.`
							: 'Pick a subject first.'
					}
					slotProps={{
						select: {
							multiple: true,
							renderValue: (ids) => (
								<div className="flex flex-wrap gap-1">
									{(ids as string[]).map((tid) => {
										const t = lookups.teachers.find((x) => x.id === tid);
										return (
											<Chip
												key={tid}
												size="small"
												label={t ? `${t.name} (${t.short})` : '?'}
												onMouseDown={(e) => e.stopPropagation()}
												onDelete={() =>
													setForm({
														...form,
														teacherIds: form.teacherIds.filter((x) => x !== tid)
													})
												}
											/>
										);
									})}
								</div>
							)
						}
					}}
				>
					{teachersFor(lookups, form.subjectId, form.teacherIds).length === 0 && (
						<NoTeacherHint subject={subject?.name} />
					)}
					{teachersFor(lookups, form.subjectId, form.teacherIds).map((t) => {
						const checked = form.teacherIds.includes(t.id);
						return (
							<MenuItem
								key={t.id}
								value={t.id}
								disabled={!checked && form.teacherIds.length >= MAX_TEACHERS}
							>
								<Checkbox
									size="small"
									checked={checked}
								/>
								<ListItemText primary={`${t.name} (${t.short})`} />
							</MenuItem>
						);
					})}
				</TextField>
				<div className="flex gap-3">
					<TextField
						type="number"
						label="Periods per week"
						value={form.periodsPerWeek}
						onChange={(e) => setForm({ ...form, periodsPerWeek: Math.max(1, Number(e.target.value)) })}
						className="flex-1"
					/>
					<TextField
						type="number"
						label="Doubles per week"
						value={form.doublesPerWeek}
						error={form.doublesPerWeek * 2 > form.periodsPerWeek}
						helperText={
							form.doublesPerWeek * 2 > form.periodsPerWeek
								? 'Too many doubles'
								: 'Two periods back to back'
						}
						onChange={(e) => setForm({ ...form, doublesPerWeek: Math.max(0, Number(e.target.value)) })}
						className="flex-1"
					/>
				</div>
				<div className="flex gap-3">
					<Autocomplete
						freeSolo
						options={ROOM_TYPE_OPTIONS}
						value={form.roomType ? roomTypeLabel(form.roomType) : ''}
						onInputChange={(_, v) => setForm({ ...form, roomType: v.trim() || null })}
						renderInput={(params) => (
							<TextField
								{...params}
								label="Room type (optional)"
								placeholder={
									subject?.roomType ? roomTypeLabel(subject.roomType) : 'uses the subject’s setting'
								}
							/>
						)}
						className="flex-1"
					/>
					<TextField
						select
						label="Option block"
						value={form.groupId ?? ''}
						onChange={(e) => setForm({ ...form, groupId: e.target.value || null })}
						className="flex-1"
					>
						<MenuItem value="">None</MenuItem>
						{groups.map((g) => (
							<MenuItem
								key={g.id}
								value={g.id}
							>
								{g.name}
							</MenuItem>
						))}
					</TextField>
				</div>
				{form.id && (
					<Alert
						severity="info"
						variant="outlined"
					>
						Saving changes removes this lesson’s cards from the grid; regenerate or place them again in the
						editor.
					</Alert>
				)}
			</DialogContent>
			<DialogActions>
				<Button onClick={() => setForm(null)}>Cancel</Button>
				<Button
					variant="contained"
					color="secondary"
					disabled={!valid}
					onClick={onSave}
				>
					Save
				</Button>
			</DialogActions>
		</Dialog>
	);
}

const ALL = '__all__';

type MatrixCell = { periodsPerWeek: number; doublesPerWeek: number; teacherIds: string[] };

/** Rows = chosen classes, columns = subjects. Saves single-class lessons in one go. */
function LessonMatrix({
	lookups,
	lessons,
	onSaved
}: {
	lookups: Lookups;
	lessons: Lesson[];
	onSaved: (r: { created: number; updated: number; removed: number }) => void;
}) {
	const api = useTtApi();
	const id = useParams<{ id: string }>()?.id ?? '';
	const { enqueueSnackbar } = useSnackbar();
	// Empty = every class
	const [classIds, setClassIds] = useState<string[]>([]);
	const classes = classIds.length ? lookups.classes.filter((c) => classIds.includes(c.id)) : lookups.classes;
	const [subjectIds, setSubjectIds] = useState<string[]>(() => {
		const used = new Set(lessons.filter((l) => !l.groupId && l.classIds.length === 1).map((l) => l.subjectId));

		return lookups.subjects.filter((s) => used.has(s.id)).map((s) => s.id);
	});
	const [cells, setCells] = useState<Record<string, MatrixCell>>({});
	const [saving, setSaving] = useState(false);

	useEffect(() => {
		const init: Record<string, MatrixCell> = {};
		lessons
			.filter((l) => !l.groupId && l.classIds.length === 1)
			.forEach((l) => {
				init[`${l.classIds[0]}|${l.subjectId}`] = {
					periodsPerWeek: l.periodsPerWeek,
					doublesPerWeek: l.doublesPerWeek,
					teacherIds: l.teacherIds
				};
			});
		setCells(init);
	}, [lessons]);

	const subjects = lookups.subjects.filter((s) => subjectIds.includes(s.id));
	const cell = (c: string, s: string): MatrixCell =>
		cells[`${c}|${s}`] ?? { periodsPerWeek: 0, doublesPerWeek: 0, teacherIds: [] };
	const set = (c: string, s: string, patch: Partial<MatrixCell>) =>
		setCells({ ...cells, [`${c}|${s}`]: { ...cell(c, s), ...patch } });

	const applyToClasses = (subjectId: string) => {
		const first = classes[0];

		if (!first) return;

		const src = cell(first.id, subjectId);
		const next = { ...cells };
		classes.forEach((c) => {
			next[`${c.id}|${subjectId}`] = {
				...cell(c.id, subjectId),
				periodsPerWeek: src.periodsPerWeek,
				doublesPerWeek: src.doublesPerWeek
			};
		});
		setCells(next);
	};

	const missingTeacher = classes.flatMap((c) =>
		subjects
			.filter((s) => cell(c.id, s.id).periodsPerWeek > 0 && cell(c.id, s.id).teacherIds.length === 0)
			.map(() => 1)
	).length;

	const save = async () => {
		setSaving(true);

		try {
			const payload = classes.flatMap((c) =>
				subjects.map((s) => ({ classId: c.id, subjectId: s.id, ...cell(c.id, s.id) }))
			);
			onSaved(await api.put(`/timetables/${id}/lessons-matrix`, { cells: payload }));
		} catch (e) {
			enqueueSnackbar(errorMessage(e), { variant: 'error' });
		} finally {
			setSaving(false);
		}
	};

	const loadOf = (c: string) => subjects.reduce((n, s) => n + cell(c, s.id).periodsPerWeek, 0);

	return (
		<Paper
			variant="outlined"
			className="flex flex-col gap-3 rounded-2xl p-4"
		>
			<div className="flex flex-wrap items-end gap-3">
				<TextField
					select
					size="small"
					label="Classes"
					value={classIds}
					onChange={(e) => {
						const v = e.target.value as unknown as string[];
						setClassIds(v.includes(ALL) ? [] : v);
					}}
					className="w-60"
					slotProps={{
						select: {
							multiple: true,
							displayEmpty: true,
							renderValue: (v) =>
								(v as string[]).length === 0
									? 'All classes'
									: lookups.classes
											.filter((c) => (v as string[]).includes(c.id))
											.map((c) => c.name)
											.join(', ')
						},
						inputLabel: { shrink: true }
					}}
				>
					<MenuItem value={ALL}>
						<Checkbox
							size="small"
							checked={classIds.length === 0}
						/>
						<ListItemText primary="All classes" />
					</MenuItem>
					{lookups.classes.map((c) => (
						<MenuItem
							key={c.id}
							value={c.id}
						>
							<Checkbox
								size="small"
								checked={classIds.includes(c.id)}
							/>
							<ListItemText primary={c.name} />
						</MenuItem>
					))}
				</TextField>
				<Autocomplete
					multiple
					size="small"
					options={lookups.subjects}
					getOptionLabel={(s) => s.short}
					value={subjects}
					onChange={(_, ss) => setSubjectIds(ss.map((s) => s.id))}
					renderInput={(p) => (
						<TextField
							{...p}
							label="Subjects (columns)"
						/>
					)}
					className="min-w-72 flex-1"
				/>
			</div>
			{classes.length === 0 || subjects.length === 0 ? (
				<Typography
					color="text.secondary"
					className="py-6 text-center"
				>
					Pick the classes and the subjects taught in them.
				</Typography>
			) : (
				<div className="overflow-x-auto">
					<table className="border-separate border-spacing-1 text-sm">
						<thead>
							<tr>
								<th className="text-left text-xs text-gray-500">Class</th>
								{subjects.map((s) => (
									<th
										key={s.id}
										className="min-w-32 align-bottom"
									>
										<div
											className="flex items-center justify-between gap-1 rounded-md px-2 py-1 text-xs font-bold"
											style={{ backgroundColor: `${s.color}22` }}
										>
											{s.short}
											<Tooltip title="Copy the first class's periods to every class shown">
												<IconButton
													size="small"
													onClick={() => applyToClasses(s.id)}
												>
													<FuseSvgIcon size={12}>lucide:copy-check</FuseSvgIcon>
												</IconButton>
											</Tooltip>
										</div>
									</th>
								))}
								<th className="text-xs text-gray-500">Total</th>
							</tr>
						</thead>
						<tbody>
							{classes.map((c) => (
								<tr key={c.id}>
									<td className="pr-2 font-semibold whitespace-nowrap">{c.name}</td>
									{subjects.map((s) => {
										const v = cell(c.id, s.id);

										return (
											<td
												key={s.id}
												className="rounded-md bg-gray-50 p-1 dark:bg-white/5"
											>
												<div className="flex items-center gap-1">
													<input
														type="number"
														min={0}
														max={20}
														value={v.periodsPerWeek || ''}
														placeholder="0"
														aria-label={`${c.name} ${s.short} periods`}
														onChange={(e) =>
															set(c.id, s.id, {
																periodsPerWeek: Math.max(0, Number(e.target.value))
															})
														}
														className="w-10 rounded border border-gray-200 bg-white px-1 py-0.5 text-center dark:border-white/10 dark:bg-transparent"
													/>
													<input
														type="number"
														min={0}
														max={5}
														value={v.doublesPerWeek || ''}
														placeholder="d"
														title="Doubles per week"
														aria-label={`${c.name} ${s.short} doubles`}
														onChange={(e) =>
															set(c.id, s.id, {
																doublesPerWeek: Math.max(0, Number(e.target.value))
															})
														}
														className="w-8 rounded border border-gray-200 bg-white px-1 py-0.5 text-center text-xs dark:border-white/10 dark:bg-transparent"
													/>
												</div>
												<TextField
													select
													size="small"
													fullWidth
													value={v.teacherIds}
													error={v.periodsPerWeek > 0 && v.teacherIds.length === 0}
													onChange={(e) =>
														set(c.id, s.id, {
															teacherIds: e.target.value as unknown as string[]
														})
													}
													className="mt-1"
													slotProps={{
														htmlInput: { 'aria-label': `${c.name} ${s.short} teachers` },
														select: {
															multiple: true,
															displayEmpty: true,
															renderValue: (ids) =>
																(ids as string[]).length === 0 ? (
																	<span className="text-gray-400">— teacher —</span>
																) : (
																	(ids as string[])
																		.map(
																			(t) =>
																				lookups.teachers.find((x) => x.id === t)
																					?.short ?? '?'
																		)
																		.join(' + ')
																)
														}
													}}
													sx={{
														'& .MuiSelect-select': { py: '2px', px: '6px', fontSize: 12 }
													}}
												>
													{teachersFor(lookups, s.id, v.teacherIds).length === 0 && (
														<NoTeacherHint subject={s.name} />
													)}
													{teachersFor(lookups, s.id, v.teacherIds).map((t) => (
														<MenuItem
															key={t.id}
															value={t.id}
															dense
														>
															<Checkbox
																size="small"
																checked={v.teacherIds.includes(t.id)}
															/>
															<ListItemText primary={`${t.short} · ${t.name}`} />
														</MenuItem>
													))}
												</TextField>
											</td>
										);
									})}
									<td className="px-2 text-center font-bold">{loadOf(c.id)}</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}
			<div className="flex flex-wrap items-center gap-3">
				<Button
					variant="contained"
					color="secondary"
					disabled={saving || subjects.length === 0}
					onClick={save}
				>
					{saving ? 'Saving…' : 'Save matrix'}
				</Button>
				{missingTeacher > 0 && (
					<Typography
						variant="body2"
						color="error"
					>
						{missingTeacher} cell(s) have periods but no teacher — they won’t be saved.
					</Typography>
				)}
				<Typography
					variant="caption"
					color="text.secondary"
				>
					Pick several teachers in one cell when they teach that class the subject at the same time (e.g. CRE
					/ IRE / HRE). Setting periods to 0 removes that lesson. Option blocks and combined classes are
					edited in the list.
				</Typography>
			</div>
		</Paper>
	);
}
