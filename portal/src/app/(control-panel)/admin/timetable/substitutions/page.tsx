'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
	Alert,
	Autocomplete,
	Button,
	Chip,
	CircularProgress,
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
import type { Lookups, TtPeriod } from '@/components/timetable/types';

type Suggestion = {
	teacherId: string;
	name: string;
	short: string;
	sameSubject: boolean;
	lessonsToday: number;
	coversThisWeek: number;
};
type Row = {
	id: string;
	absentTeacherId: string;
	absentTeacher: string;
	coverTeacherId: string | null;
	periodIndex: number;
	length: number;
	period?: TtPeriod;
	subject: string;
	subjectShort: string;
	color: string;
	classes: string[];
	room: string | null;
	suggestions: Suggestion[];
};
type SubsResponse = { timetable: { id: string; name: string } | null; day: string | null; rows: Row[] };

const today = () => {
	const d = new Date();

	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export default function SubstitutionsPage() {
	const api = useTtApi();
	const { enqueueSnackbar } = useSnackbar();
	const [date, setDate] = useState('');
	const [data, setData] = useState<SubsResponse | null>(null);
	const [teachers, setTeachers] = useState<Lookups['teachers']>([]);
	const [absent, setAbsent] = useState<Lookups['teachers']>([]);

	useEffect(() => setDate(today()), []);

	const load = useCallback(async () => {
		if (!api.ready || !date) return;

		try {
			const [subs, setup] = await Promise.all([
				api.get<SubsResponse>(`/substitutions?date=${date}`),
				api.get<Lookups>('/setup')
			]);
			setData(subs);
			setTeachers(setup.teachers);
		} catch (e) {
			enqueueSnackbar(errorMessage(e), { variant: 'error' });
		}
	}, [api, date, enqueueSnackbar]);

	useEffect(() => {
		load();
	}, [load]);

	const markAbsent = async () => {
		try {
			let lessons = 0;

			for (const t of absent) {
				const r = await api.post<{ lessons: number }>('/substitutions/absence', { teacherId: t.id, date });
				lessons += r.lessons;
			}

			enqueueSnackbar(`${lessons} lesson(s) need cover`, { variant: lessons ? 'warning' : 'info' });
			setAbsent([]);
			load();
		} catch (e) {
			enqueueSnackbar(errorMessage(e), { variant: 'error' });
		}
	};

	const assign = async (row: Row, coverTeacherId: string | null) => {
		try {
			await api.post(`/substitutions/${row.id}/assign`, { coverTeacherId });
			load();
		} catch (e) {
			enqueueSnackbar(errorMessage(e), { variant: 'error' });
		}
	};

	const removeAbsence = async (teacherId: string) => {
		try {
			await api.post('/substitutions/absence/remove', { teacherId, date });
			load();
		} catch (e) {
			enqueueSnackbar(errorMessage(e), { variant: 'error' });
		}
	};

	const absentToday = [...new Map((data?.rows ?? []).map((r) => [r.absentTeacherId, r.absentTeacher])).entries()];
	const uncovered = (data?.rows ?? []).filter((r) => !r.coverTeacherId).length;

	return (
		<AuthGuardRedirect auth={['SUPER_ADMIN', 'ADMIN']}>
			<FusePageSimple
				content={
					<div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-8">
						<div className="no-print">
							<Link
								href="/admin/timetable"
								className="mb-2 flex w-fit items-center gap-1 text-sm text-gray-500 hover:text-gray-800"
							>
								<FuseSvgIcon size={16}>lucide:arrow-left</FuseSvgIcon>
								All timetables
							</Link>
							<Typography className="text-4xl font-extrabold tracking-tight">Substitutions</Typography>
							<Typography
								color="text.secondary"
								className="mt-1"
							>
								Mark teachers absent for a day and assign cover. Suggestions favour teachers of the same
								subject with the lightest day.
							</Typography>
						</div>

						{data && !data.timetable && (
							<Alert severity="info">
								Publish a timetable first — substitutions work from the published timetable.
							</Alert>
						)}

						<Paper
							variant="outlined"
							className="no-print flex flex-wrap items-end gap-3 rounded-2xl p-4"
						>
							<TextField
								type="date"
								label="Date"
								value={date}
								onChange={(e) => setDate(e.target.value)}
								InputLabelProps={{ shrink: true }}
							/>
							<Autocomplete
								multiple
								options={teachers}
								getOptionLabel={(t) => `${t.name} (${t.short})`}
								value={absent}
								onChange={(_, v) => setAbsent(v)}
								renderInput={(p) => (
									<TextField
										{...p}
										label="Absent teacher(s)"
									/>
								)}
								className="min-w-72 flex-1"
							/>
							<Button
								variant="contained"
								color="secondary"
								disabled={absent.length === 0 || !data?.timetable}
								onClick={markAbsent}
							>
								Mark absent
							</Button>
							<Button
								variant="outlined"
								color="inherit"
								onClick={() => window.print()}
								startIcon={<FuseSvgIcon size={16}>lucide:printer</FuseSvgIcon>}
								disabled={!data?.rows.length}
							>
								Print cover sheet
							</Button>
						</Paper>

						{absentToday.length > 0 && (
							<div className="no-print flex flex-wrap items-center gap-2">
								<Typography variant="body2">Absent on {data?.day}:</Typography>
								{absentToday.map(([tid, name]) => (
									<Chip
										key={tid}
										label={name}
										onDelete={() => removeAbsence(tid)}
									/>
								))}
								{uncovered > 0 ? (
									<Chip
										color="error"
										size="small"
										label={`${uncovered} without cover`}
									/>
								) : (
									<Chip
										color="success"
										size="small"
										label="All covered"
									/>
								)}
							</div>
						)}

						<Paper
							variant="outlined"
							className="rounded-2xl"
						>
							<div className="hidden p-4 print:block">
								<h1 className="text-xl font-bold">
									Cover sheet — {data?.day} {date}
								</h1>
							</div>
							{!data ? (
								<div className="flex justify-center py-12">
									<CircularProgress />
								</div>
							) : data.rows.length === 0 ? (
								<Typography
									color="text.secondary"
									className="p-10 text-center"
								>
									No absences recorded for this day.
								</Typography>
							) : (
								<table className="w-full text-sm">
									<thead>
										<tr className="text-left text-xs tracking-wide text-gray-500 uppercase">
											<th className="px-4 py-2">Period</th>
											<th className="px-4 py-2">Lesson</th>
											<th className="px-4 py-2">Absent</th>
											<th className="px-4 py-2">Cover</th>
										</tr>
									</thead>
									<tbody>
										{data.rows.map((r) => {
											const current = teachers.find((t) => t.id === r.coverTeacherId);

											return (
												<tr
													key={r.id}
													className="border-t border-gray-100 align-top dark:border-white/10"
												>
													<td className="px-4 py-3 whitespace-nowrap">
														<div className="font-semibold">
															{r.period?.name}
															{r.length > 1 ? ' (double)' : ''}
														</div>
														<div className="text-xs text-gray-500">
															{r.period?.startTime}–{r.period?.endTime}
														</div>
													</td>
													<td className="px-4 py-3">
														<span className="flex items-center gap-2 font-semibold">
															<span
																className="inline-block h-3 w-3 rounded-full"
																style={{ backgroundColor: r.color }}
															/>
															{r.subject}
														</span>
														<div className="text-xs text-gray-500">
															{r.classes.join(', ')}
															{r.room ? ` · ${r.room}` : ''}
														</div>
													</td>
													<td className="px-4 py-3">{r.absentTeacher}</td>
													<td className="px-4 py-3">
														<div className="hidden font-semibold print:block">
															{current?.name ?? '— no cover —'}
														</div>
														<div className="no-print flex items-center gap-1">
															<TextField
																select
																size="small"
																value={r.coverTeacherId ?? ''}
																onChange={(e) => assign(r, e.target.value || null)}
																className="min-w-64"
																error={!r.coverTeacherId}
															>
																<MenuItem value="">— no cover yet —</MenuItem>
																{current &&
																	!r.suggestions.some(
																		(s) => s.teacherId === current.id
																	) && (
																		<MenuItem value={current.id}>
																			{current.name}
																		</MenuItem>
																	)}
																{r.suggestions.map((s) => (
																	<MenuItem
																		key={s.teacherId}
																		value={s.teacherId}
																	>
																		<div className="flex w-full items-center justify-between gap-3">
																			<span>
																				{s.name}
																				{s.sameSubject && (
																					<span className="ml-2 text-xs font-semibold text-emerald-600">
																						same subject
																					</span>
																				)}
																			</span>
																			<span className="text-xs text-gray-500">
																				{s.lessonsToday} today ·{' '}
																				{s.coversThisWeek} covers
																			</span>
																		</div>
																	</MenuItem>
																))}
															</TextField>
															{r.suggestions.length === 0 && !r.coverTeacherId && (
																<Tooltip title="Every teacher is busy or absent in this period">
																	<IconButton size="small">
																		<FuseSvgIcon
																			size={16}
																			className="text-amber-600"
																		>
																			lucide:triangle-alert
																		</FuseSvgIcon>
																	</IconButton>
																</Tooltip>
															)}
														</div>
													</td>
												</tr>
											);
										})}
									</tbody>
								</table>
							)}
						</Paper>
					</div>
				}
			/>
		</AuthGuardRedirect>
	);
}
