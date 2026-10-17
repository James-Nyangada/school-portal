'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
	Alert,
	Autocomplete,
	Button,
	Checkbox,
	CircularProgress,
	Dialog,
	DialogActions,
	DialogContent,
	DialogTitle,
	FormControlLabel,
	IconButton,
	Paper,
	Switch,
	Tab,
	Tabs,
	TextField,
	Tooltip,
	Typography
} from '@mui/material';
import FusePageSimple from '@fuse/core/FusePageSimple';
import FuseSvgIcon from '@fuse/core/FuseSvgIcon';
import AuthGuardRedirect from '@auth/AuthGuardRedirect';
import { useSnackbar } from 'notistack';
import { errorMessage, useTtApi } from '@/components/timetable/api';
import AvailabilityGrid from '@/components/timetable/AvailabilityGrid';
import type { Lookups, TtBreak, TtDay, TtPeriod } from '@/components/timetable/types';
import { ROOM_TYPE_OPTIONS, roomTypeLabel } from '@/components/timetable/roomTypes';

type Rules = {
	spreadSubjects: boolean;
	noSameSubjectTwiceADay: boolean;
	minimiseTeacherGaps: boolean;
	respectMaxPerDay: boolean;
	preferMorning: boolean;
};

type SetupData = Lookups & {
	days: TtDay[];
	periods: TtPeriod[];
	breaks?: TtBreak[];
	settings: { ignoreGeneralRooms: boolean; rules: Rules };
	unavailability: { resourceType: string; resourceId: string; dayIndex: number; periodIndex: number }[];
};

type Unavail = { type: 'teacher' | 'class' | 'room'; id: string; name: string };

/** Subject short names show on the grid cells; the server allows up to this many characters. */
const SUBJECT_SHORT_MAX = 8;
const shortOk = (v: string) => v.trim().length > 0 && v.trim().length <= SUBJECT_SHORT_MAX;

const SETUP_TABS = ['bell', 'subjects', 'teachers', 'classes', 'rooms', 'rules'];

const WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const addMinutes = (t: string, m: number) => {
	const [h, mm] = t.split(':').map(Number);
	const total = (h ?? 0) * 60 + (mm ?? 0) + m;

	return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
};

export default function TimetableSetupPage() {
	const api = useTtApi();
	const { enqueueSnackbar } = useSnackbar();
	const [data, setData] = useState<SetupData | null>(null);
	const [tab, setTab] = useState(0);
	// Deep links from the pre-flight check: ?tab=rooms&roomType=lab or ?tab=subjects&subject=<id>.
	const [linked, setLinked] = useState<{ roomType?: string; subjectId?: string }>({});

	useEffect(() => {
		const q = new URLSearchParams(window.location.search);
		const t = SETUP_TABS.indexOf(q.get('tab') ?? '');

		if (t >= 0) setTab(t);

		setLinked({ roomType: q.get('roomType') ?? undefined, subjectId: q.get('subject') ?? undefined });
	}, []);
	const [error, setError] = useState<string | null>(null);
	const [unavail, setUnavail] = useState<Unavail | null>(null);

	const load = useCallback(async () => {
		if (!api.ready) return;

		try {
			setData(await api.get<SetupData>('/setup'));
			setError(null);
		} catch (e) {
			setError(errorMessage(e));
		}
	}, [api]);

	useEffect(() => {
		load();
	}, [load]);

	const notify = (e: unknown) => enqueueSnackbar(errorMessage(e), { variant: 'error' });
	const saved = (msg = 'Saved') => enqueueSnackbar(msg, { variant: 'success' });
	const unavailCount = (type: string, id: string) =>
		data?.unavailability.filter((u) => u.resourceType === type && u.resourceId === id).length ?? 0;

	const availabilityButton = (u: Unavail) => {
		const n = unavailCount(u.type, u.id);

		return (
			<Button
				size="small"
				color={n ? 'warning' : 'inherit'}
				variant="outlined"
				className="rounded-full whitespace-nowrap"
				onClick={() => setUnavail(u)}
				disabled={!data?.days.length || !data?.periods.length}
				startIcon={<FuseSvgIcon size={14}>lucide:calendar-x</FuseSvgIcon>}
			>
				{n ? `${n} blocked` : 'Availability'}
			</Button>
		);
	};

	return (
		<AuthGuardRedirect auth={['SUPER_ADMIN', 'ADMIN']}>
			<FusePageSimple
				content={
					<div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-8">
						<div>
							<Link
								href="/admin/timetable"
								className="mb-2 flex w-fit items-center gap-1 text-sm text-gray-500 hover:text-gray-800"
							>
								<FuseSvgIcon size={16}>lucide:arrow-left</FuseSvgIcon>
								All timetables
							</Link>
							<Typography className="text-4xl font-extrabold tracking-tight">School setup</Typography>
							<Typography
								color="text.secondary"
								className="mt-1"
							>
								The school week and resources every timetable uses. Subjects, classes and teachers come
								from the rest of the portal — here you add timetable details like short names, colours,
								rooms and availability.
							</Typography>
						</div>

						{error && <Alert severity="error">{error}</Alert>}

						<Paper
							variant="outlined"
							className="overflow-hidden rounded-2xl"
						>
							<Tabs
								value={tab}
								onChange={(_, v) => setTab(v)}
								variant="scrollable"
								scrollButtons={false}
								className="flex-none border-b px-4"
								sx={{
									minHeight: 0,
									'& .MuiTab-root': { minHeight: 0, py: 1.75, textTransform: 'none', fontWeight: 600 }
								}}
							>
								<Tab label="Bell schedule" />
								<Tab label="Subjects" />
								<Tab label="Teachers" />
								<Tab label="Classes" />
								<Tab label="Rooms" />
								<Tab label="Rules" />
							</Tabs>
							<div className="p-6">
								{!data ? (
									<div className="flex justify-center py-12">
										<CircularProgress />
									</div>
								) : (
									<>
										{tab === 0 && (
											<BellSchedule
												data={data}
												onSaved={(d) => {
													setData({ ...data, ...d });
													saved('Bell schedule saved');
												}}
												onError={notify}
											/>
										)}
										{tab === 1 && (
											<SubjectsTab
												data={data}
												focusSubjectId={linked.subjectId}
												onSaved={() => {
													saved();
													load();
												}}
												onError={notify}
											/>
										)}
										{tab === 2 && (
											<TeachersTab
												data={data}
												availabilityButton={availabilityButton}
												onSaved={() => {
													saved();
													load();
												}}
												onError={notify}
											/>
										)}
										{tab === 3 && (
											<div className="flex flex-col gap-3">
												<Typography
													color="text.secondary"
													className="text-sm"
												>
													Classes and streams are managed on the{' '}
													<Link
														href="/admin/classes"
														className="text-blue-600"
													>
														Classes &amp; Streams
													</Link>{' '}
													page. Here you can block periods when a class is away (e.g. games
													afternoon, assembly).
												</Typography>
												{data.classes.length === 0 && (
													<Alert severity="info">No classes yet.</Alert>
												)}
												<div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
													{data.classes.map((c) => (
														<div
															key={c.id}
															className="flex items-center justify-between rounded-xl border border-gray-200 px-4 py-2 dark:border-white/10"
														>
															<span className="font-semibold">{c.name}</span>
															{availabilityButton({
																type: 'class',
																id: c.id,
																name: c.name
															})}
														</div>
													))}
												</div>
											</div>
										)}
										{tab === 4 && (
											<RoomsTab
												data={data}
												initialType={linked.roomType}
												availabilityButton={availabilityButton}
												onSaved={() => {
													saved();
													load();
												}}
												onError={notify}
											/>
										)}
										{tab === 5 && (
											<RulesTab
												data={data}
												onSaved={(settings) => {
													setData({ ...data, settings });
													saved('Rules saved');
												}}
												onError={notify}
											/>
										)}
									</>
								)}
							</div>
						</Paper>

						{data && unavail && (
							<UnavailabilityDialog
								target={unavail}
								data={data}
								onClose={() => setUnavail(null)}
								onSaved={() => {
									setUnavail(null);
									saved('Availability saved');
									load();
								}}
								onError={notify}
							/>
						)}
					</div>
				}
			/>
		</AuthGuardRedirect>
	);
}

// ── Bell schedule ───────────────────────────────────────────

type SlotRow = { kind: 'period' | 'break'; name: string; startTime: string; endTime: string };
type SlotIssue = { level: 'error' | 'warning'; message: string; fix?: { label: string; patch: Partial<SlotRow> } };

const toMin = (t: string) => {
	const [h, m] = t.split(':').map(Number);

	return (h ?? 0) * 60 + (m ?? 0);
};

/** "13:05" → "1:05 PM", matching what the browser's time boxes show. */
const ampm = (t: string) => {
	const [h, m] = t.split(':').map(Number) as [number, number];

	return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
};

const defaultLength = (r: SlotRow) => (r.kind === 'break' ? 20 : 40);

/** The same clock time in the afternoon ("00:10" → "12:10"), or null if it is already PM. */
const asPm = (t: string) => (toMin(t) < 12 * 60 ? addMinutes(t, 12 * 60) : null);

/** Length in minutes, guessing the AM/PM slip (end before start) when that gives a sensible length. */
const lengthOf = (r: SlotRow) => {
	const d = toMin(r.endTime) - toMin(r.startTime);

	if (d > 0) return d;

	const pm = asPm(r.endTime);
	const dPm = pm ? toMin(pm) - toMin(r.startTime) : 0;

	return dPm > 0 && dPm <= 180 ? dPm : defaultLength(r);
};

function slotIssues(rows: SlotRow[]): SlotIssue[][] {
	return rows.map((r, i) => {
		const out: SlotIssue[] = [];
		const prev = rows[i - 1];
		const label = r.name.trim() || (r.kind === 'break' ? 'This break' : 'This period');

		if (toMin(r.endTime) <= toMin(r.startTime)) {
			const pm = asPm(r.endTime);
			out.push({
				level: 'error',
				message: `${label} ends at ${ampm(r.endTime)}, before it starts at ${ampm(r.startTime)}.`,
				fix:
					pm && toMin(pm) > toMin(r.startTime)
						? { label: `Did you mean ${ampm(pm)}? Use it`, patch: { endTime: pm } }
						: {
								label: `End ${defaultLength(r)} min after the start`,
								patch: { endTime: addMinutes(r.startTime, defaultLength(r)) }
							}
			});
		}

		if (prev && toMin(r.startTime) < toMin(prev.endTime)) {
			out.push({
				level: 'error',
				message: `${label} starts at ${ampm(r.startTime)}, before ${prev.name || 'the row above'} ends at ${ampm(prev.endTime)}.`,
				fix: {
					label: `Start at ${ampm(prev.endTime)}`,
					patch: { startTime: prev.endTime, endTime: addMinutes(prev.endTime, lengthOf(r)) }
				}
			});
		} else if (prev && toMin(r.startTime) > toMin(prev.endTime)) {
			out.push({
				level: 'warning',
				message: `${toMin(r.startTime) - toMin(prev.endTime)} min gap after ${prev.name || 'the row above'} that isn't a break.`,
				fix: {
					label: `Start at ${ampm(prev.endTime)}`,
					patch: { startTime: prev.endTime, endTime: addMinutes(prev.endTime, lengthOf(r)) }
				}
			});
		}

		if (r.kind === 'break') {
			if (i === 0 || i === rows.length - 1)
				out.push({ level: 'error', message: 'A break must sit between two periods. Move it or remove it.' });
			else if (prev?.kind === 'break')
				out.push({ level: 'error', message: 'Two breaks in a row. Remove one and make the other longer.' });
		}

		return out;
	});
}

function BellSchedule({
	data,
	onSaved,
	onError
}: {
	data: SetupData;
	onSaved: (d: { days: TtDay[]; periods: TtPeriod[]; breaks?: TtBreak[] }) => void;
	onError: (e: unknown) => void;
}) {
	const api = useTtApi();
	const [days, setDays] = useState<string[]>(data.days.length ? data.days.map((d) => d.name) : WEEK.slice(0, 5));
	const [rows, setRows] = useState<SlotRow[]>(() => {
		const out: SlotRow[] = [];
		data.periods.forEach((p, i) => {
			out.push({ kind: 'period', name: p.name, startTime: p.startTime, endTime: p.endTime });
			const next = data.periods[i + 1];

			if (!next || next.block === p.block) return;

			// Breaks saved before they had their own times fill the gap between the two periods.
			const b = data.breaks?.find((x) => x.afterIndex === i);
			out.push(
				b
					? { kind: 'break', name: b.name, startTime: b.startTime, endTime: b.endTime }
					: {
							kind: 'break',
							name: 'Break',
							startTime: p.endTime,
							endTime:
								toMin(next.startTime) > toMin(p.endTime) ? next.startTime : addMinutes(p.endTime, 20)
						}
			);
		});

		return out;
	});
	const [saving, setSaving] = useState(false);
	const [quick, setQuick] = useState({ start: '08:00', length: 40, count: 8, breaks: '3,5', breakLength: 20 });

	const issues = useMemo(() => slotIssues(rows), [rows]);
	const errorCount = issues.flat().filter((x) => x.level === 'error').length;
	const periodCount = rows.filter((r) => r.kind === 'period').length;

	const build = () => {
		const breaks = new Set(
			quick.breaks
				.split(',')
				.map((x) => Number(x.trim()))
				.filter(Boolean)
		);
		let t = quick.start;
		const out: SlotRow[] = [];

		for (let i = 1; i <= quick.count; i++) {
			const end = addMinutes(t, quick.length);
			out.push({ kind: 'period', name: `P${i}`, startTime: t, endTime: end });
			t = end;

			if (breaks.has(i) && i < quick.count) {
				const bEnd = addMinutes(t, quick.breakLength);
				out.push({ kind: 'break', name: 'Break', startTime: t, endTime: bEnd });
				t = bEnd;
			}
		}

		setRows(out);
	};

	/** Keeps each row's length and starts every row when the one above ends. */
	const fixAll = () => {
		const out: SlotRow[] = [];
		rows.forEach((r, i) => {
			const start = i === 0 ? r.startTime : out[i - 1]!.endTime;
			out.push({ ...r, startTime: start, endTime: addMinutes(start, lengthOf(r)) });
		});
		setRows(out);
	};

	const update = (i: number, patch: Partial<SlotRow>) =>
		setRows(rows.map((r, k) => (k === i ? { ...r, ...patch } : r)));

	/** Inserts a break after row i; later rows move back unless there was already a gap to fill. */
	const insertBreak = (i: number) => {
		const prev = rows[i]!;
		const next = rows[i + 1];
		const gap = next ? toMin(next.startTime) - toMin(prev.endTime) : 0;
		const length = gap > 0 ? gap : 20;
		const shift = gap > 0 ? 0 : length;
		const brk: SlotRow = {
			kind: 'break',
			name: 'Break',
			startTime: prev.endTime,
			endTime: addMinutes(prev.endTime, length)
		};
		setRows([
			...rows.slice(0, i + 1),
			brk,
			...rows.slice(i + 1).map((r) => ({
				...r,
				startTime: addMinutes(r.startTime, shift),
				endTime: addMinutes(r.endTime, shift)
			}))
		]);
	};

	const save = async () => {
		setSaving(true);

		try {
			let block = 0;
			const periods: { name: string; startTime: string; endTime: string; block: number }[] = [];
			const breaks: TtBreak[] = [];
			rows.forEach((r) => {
				if (r.kind === 'period') {
					periods.push({ name: r.name.trim() || 'P', startTime: r.startTime, endTime: r.endTime, block });
				} else {
					breaks.push({
						afterIndex: periods.length - 1,
						name: r.name.trim() || 'Break',
						startTime: r.startTime,
						endTime: r.endTime
					});
					block++;
				}
			});
			const d1 = await api.put<{ days: TtDay[]; periods: TtPeriod[] }>('/setup/days', {
				days: WEEK.filter((w) => days.includes(w)).map((name) => ({ name, short: name.slice(0, 3) }))
			});
			const d2 = await api.put<{ days: TtDay[]; periods: TtPeriod[]; breaks: TtBreak[] }>('/setup/periods', {
				periods,
				breaks
			});
			onSaved({ days: d1.days, periods: d2.periods, breaks: d2.breaks });
		} catch (e) {
			onError(e);
		} finally {
			setSaving(false);
		}
	};

	return (
		<div className="flex flex-col gap-8">
			<section>
				<Typography className="mb-2 font-semibold">School days</Typography>
				<div className="flex flex-wrap gap-2">
					{WEEK.map((w) => (
						<FormControlLabel
							key={w}
							control={
								<Checkbox
									checked={days.includes(w)}
									onChange={(e) =>
										setDays(e.target.checked ? [...days, w] : days.filter((d) => d !== w))
									}
								/>
							}
							label={w}
						/>
					))}
				</div>
			</section>

			<section className="flex flex-col gap-3">
				<div className="flex flex-wrap items-end justify-between gap-3">
					<div>
						<Typography className="font-semibold">Periods and breaks</Typography>
						<Typography
							variant="body2"
							color="text.secondary"
						>
							Give each period and each break its own times. Double lessons can only sit in two periods
							with no break between them.
						</Typography>
					</div>
					<div className="flex flex-wrap items-end gap-2 rounded-xl bg-gray-50 p-3 dark:bg-white/5">
						<TextField
							size="small"
							label="First starts"
							type="time"
							value={quick.start}
							onChange={(e) => setQuick({ ...quick, start: e.target.value })}
							className="w-32"
						/>
						<TextField
							size="small"
							label="Minutes"
							type="number"
							value={quick.length}
							onChange={(e) => setQuick({ ...quick, length: Number(e.target.value) })}
							className="w-24"
						/>
						<TextField
							size="small"
							label="Periods"
							type="number"
							value={quick.count}
							onChange={(e) => setQuick({ ...quick, count: Number(e.target.value) })}
							className="w-24"
						/>
						<TextField
							size="small"
							label="Breaks after"
							value={quick.breaks}
							onChange={(e) => setQuick({ ...quick, breaks: e.target.value })}
							className="w-28"
							helperText="e.g. 3,5"
						/>
						<TextField
							size="small"
							label="Break mins"
							type="number"
							value={quick.breakLength}
							onChange={(e) => setQuick({ ...quick, breakLength: Number(e.target.value) })}
							className="w-24"
						/>
						<Button
							variant="outlined"
							onClick={build}
						>
							Fill in
						</Button>
					</div>
				</div>

				<div className="flex flex-col gap-1">
					{rows.map((r, i) => {
						const isBreak = r.kind === 'break';
						const rowIssues = issues[i] ?? [];
						const hasError = rowIssues.some((x) => x.level === 'error');
						const next = rows[i + 1];

						return (
							<div key={i}>
								<div
									className={`flex flex-wrap items-center gap-2 rounded-lg ${
										isBreak ? 'bg-amber-50 px-2 py-2 dark:bg-amber-900/20' : ''
									}`}
								>
									{isBreak && (
										<FuseSvgIcon
											size={16}
											className="text-amber-700 dark:text-amber-300"
										>
											lucide:coffee
										</FuseSvgIcon>
									)}
									<TextField
										size="small"
										value={r.name}
										onChange={(e) => update(i, { name: e.target.value })}
										className={isBreak ? 'w-36' : 'w-28'}
										label={isBreak ? 'Break name' : 'Name'}
										placeholder={isBreak ? 'e.g. Lunch' : undefined}
									/>
									<TextField
										size="small"
										type="time"
										label="Start"
										value={r.startTime}
										error={rowIssues.some(
											(x) => x.level === 'error' && x.message.includes(' starts at ')
										)}
										onChange={(e) => update(i, { startTime: e.target.value })}
										className="w-36"
									/>
									<TextField
										size="small"
										type="time"
										label="End"
										value={r.endTime}
										error={rowIssues.some(
											(x) => x.level === 'error' && x.message.includes(' ends at ')
										)}
										onChange={(e) => update(i, { endTime: e.target.value })}
										className="w-36"
									/>
									<Typography
										variant="caption"
										color={hasError ? 'error' : 'text.secondary'}
										className="w-14"
									>
										{toMin(r.endTime) > toMin(r.startTime)
											? `${toMin(r.endTime) - toMin(r.startTime)} min`
											: '—'}
									</Typography>
									<IconButton
										size="small"
										onClick={() => setRows(rows.filter((_, k) => k !== i))}
										aria-label={isBreak ? 'Remove break' : 'Remove period'}
									>
										<FuseSvgIcon size={16}>lucide:x</FuseSvgIcon>
									</IconButton>
								</div>
								{rowIssues.map((x, k) => (
									<div
										key={k}
										className={`mt-1 ml-1 flex flex-wrap items-center gap-2 text-xs ${
											x.level === 'error'
												? 'text-red-600 dark:text-red-400'
												: 'text-amber-700 dark:text-amber-300'
										}`}
									>
										<FuseSvgIcon size={14}>
											{x.level === 'error' ? 'lucide:circle-alert' : 'lucide:triangle-alert'}
										</FuseSvgIcon>
										<span>{x.message}</span>
										{x.fix && (
											<Button
												size="small"
												variant="outlined"
												color={x.level === 'error' ? 'error' : 'warning'}
												className="min-h-0 py-0 text-xs"
												onClick={() => update(i, x.fix!.patch)}
											>
												{x.fix.label}
											</Button>
										)}
									</div>
								))}
								{!isBreak && next?.kind === 'period' && (
									<button
										type="button"
										onClick={() => insertBreak(i)}
										className="my-1 flex w-fit items-center gap-2 rounded-md px-2 py-0.5 text-xs font-semibold text-gray-400 hover:bg-gray-100 dark:hover:bg-white/5"
									>
										<FuseSvgIcon size={14}>lucide:plus</FuseSvgIcon>
										Add a break here
									</button>
								)}
							</div>
						);
					})}
					<Button
						className="mt-2 w-fit"
						startIcon={<FuseSvgIcon size={16}>lucide:plus</FuseSvgIcon>}
						onClick={() => {
							const start = rows[rows.length - 1]?.endTime ?? '08:00';
							setRows([
								...rows,
								{
									kind: 'period',
									name: `P${periodCount + 1}`,
									startTime: start,
									endTime: addMinutes(start, 40)
								}
							]);
						}}
					>
						Add period
					</Button>
				</div>
			</section>

			{rows.length > 0 && (
				<section>
					<Typography className="mb-2 font-semibold">Preview of the school day</Typography>
					<div className="flex flex-wrap items-stretch gap-1">
						{rows.map((r, i) => (
							<div
								key={i}
								className={`rounded-lg px-3 py-2 text-center ${
									issues[i]?.some((x) => x.level === 'error')
										? 'bg-red-50 ring-1 ring-red-300 dark:bg-red-900/30'
										: r.kind === 'break'
											? 'bg-amber-100 dark:bg-amber-900/40'
											: 'bg-blue-50 dark:bg-blue-900/30'
								}`}
							>
								<div className="text-sm font-semibold">
									{r.name || (r.kind === 'break' ? 'Break' : 'P')}
								</div>
								<div className="text-[11px] text-gray-500">
									{r.startTime}–{r.endTime}
								</div>
							</div>
						))}
					</div>
				</section>
			)}

			{errorCount > 0 && (
				<Alert
					severity="error"
					action={
						<Button
							color="inherit"
							size="small"
							onClick={fixAll}
						>
							Fix all times
						</Button>
					}
				>
					{errorCount === 1 ? '1 problem' : `${errorCount} problems`} with the times above. Use the fix next
					to each one, or <b>Fix all times</b> to keep each row&apos;s length and start every row when the one
					above ends. Tip: if an end time shows AM when you meant PM, click the AM/PM part of the box and
					change it.
				</Alert>
			)}

			<div>
				<Button
					variant="contained"
					color="secondary"
					disabled={saving || periodCount === 0 || days.length === 0 || errorCount > 0}
					onClick={save}
				>
					{saving ? 'Saving…' : 'Save bell schedule'}
				</Button>
			</div>
		</div>
	);
}

// ── Subjects ────────────────────────────────────────────────

function SubjectsTab({
	data,
	focusSubjectId,
	onSaved,
	onError
}: {
	data: SetupData;
	/** From the pre-flight "Use classroom for …" link: preset that subject to classroom and highlight it. */
	focusSubjectId?: string;
	onSaved: () => void;
	onError: (e: unknown) => void;
}) {
	const api = useTtApi();
	const [rows, setRows] = useState(
		data.subjects.map((s) =>
			s.id === focusSubjectId && s.roomType
				? { ...s, roomType: 'classroom', dirty: true }
				: { ...s, dirty: false }
		)
	);

	useEffect(() => {
		if (focusSubjectId) document.getElementById(`subject-${focusSubjectId}`)?.scrollIntoView({ block: 'center' });
	}, [focusSubjectId]);
	const roomTypes = useMemo(
		() => [...new Set([...ROOM_TYPE_OPTIONS, ...data.rooms.map((r) => roomTypeLabel(r.type))])],
		[data.rooms]
	);
	const dirty = rows.filter((r) => r.dirty);
	const invalid = rows.filter((r) => !shortOk(r.short));

	const save = async () => {
		try {
			for (const r of dirty)
				await api.put(`/setup/subjects/${r.id}`, {
					short: r.short,
					color: r.color,
					roomType: r.roomType || null
				});

			onSaved();
		} catch (e) {
			onError(e);
		}
	};

	if (rows.length === 0) {
		return (
			<Alert severity="info">
				No subjects yet. Add them in the{' '}
				<Link
					href="/admin/subjects"
					className="font-semibold"
				>
					Subjects Registry
				</Link>
				.
			</Alert>
		);
	}

	return (
		<div className="flex flex-col gap-3">
			<Typography
				variant="body2"
				color="text.secondary"
			>
				Short names and colours appear on the grid. Set a room type (e.g. “lab”) for subjects that must be
				taught in a special room.
			</Typography>
			<div className="flex flex-col divide-y divide-gray-100 dark:divide-white/10">
				{focusSubjectId && rows.some((r) => r.id === focusSubjectId && r.dirty) && (
					<Alert
						severity="info"
						className="mb-2"
					>
						{rows.find((r) => r.id === focusSubjectId)?.name} is set to use a classroom (highlighted). Click{' '}
						<b>Save</b> to keep it, or pick a different room type.
					</Alert>
				)}
				{rows.map((r, i) => (
					<div
						key={r.id}
						id={`subject-${r.id}`}
						className={`flex flex-wrap items-center gap-3 py-2 ${
							r.id === focusSubjectId ? 'rounded-lg bg-amber-50 px-2 dark:bg-amber-900/20' : ''
						}`}
					>
						<input
							type="color"
							value={r.color}
							aria-label={`${r.name} colour`}
							onChange={(e) =>
								setRows(
									rows.map((x, k) => (k === i ? { ...x, color: e.target.value, dirty: true } : x))
								)
							}
							className="h-9 w-9 cursor-pointer rounded border-0 bg-transparent"
						/>
						<div className="w-56 min-w-0">
							<div className="truncate font-semibold">{r.name}</div>
							<div className="text-xs text-gray-500">{r.code}</div>
						</div>
						<TextField
							size="small"
							label="Short"
							value={r.short}
							error={!shortOk(r.short)}
							helperText={
								shortOk(r.short)
									? undefined
									: r.short.trim()
										? `Max ${SUBJECT_SHORT_MAX} characters`
										: 'Required'
							}
							onChange={(e) =>
								setRows(
									rows.map((x, k) =>
										k === i ? { ...x, short: e.target.value.toUpperCase(), dirty: true } : x
									)
								)
							}
							className="w-24"
						/>
						<Autocomplete
							freeSolo
							size="small"
							options={roomTypes}
							value={r.roomType ? roomTypeLabel(r.roomType) : ''}
							onInputChange={(_, v) =>
								setRows(
									rows.map((x, k) =>
										k === i ? { ...x, roomType: v.trim() || null, dirty: true } : x
									)
								)
							}
							renderInput={(params) => (
								<TextField
									{...params}
									label="Needs room type"
									placeholder="any classroom"
								/>
							)}
							className="w-52"
						/>
					</div>
				))}
			</div>
			<div>
				<Button
					variant="contained"
					color="secondary"
					disabled={dirty.length === 0 || invalid.length > 0}
					onClick={save}
				>
					Save {dirty.length > 0 ? `${dirty.length} change${dirty.length > 1 ? 's' : ''}` : ''}
				</Button>
				{invalid.length > 0 && (
					<Typography
						variant="body2"
						color="error"
						className="mt-2"
					>
						Fix the short name for {invalid.map((r) => r.name).join(', ')} (1–{SUBJECT_SHORT_MAX}{' '}
						characters) before saving.
					</Typography>
				)}
			</div>
		</div>
	);
}

// ── Teachers ────────────────────────────────────────────────

function TeachersTab({
	data,
	availabilityButton,
	onSaved,
	onError
}: {
	data: SetupData;
	availabilityButton: (u: Unavail) => React.ReactNode;
	onSaved: () => void;
	onError: (e: unknown) => void;
}) {
	const api = useTtApi();
	const [rows, setRows] = useState(data.teachers.map((t) => ({ ...t, dirty: false })));
	const dirty = rows.filter((r) => r.dirty);
	const num = (v: string) => (v === '' ? null : Math.max(1, Number(v)));

	const save = async () => {
		try {
			for (const r of dirty)
				await api.put(`/setup/teachers/${r.id}`, {
					short: r.short,
					maxPerDay: r.maxPerDay,
					maxPerWeek: r.maxPerWeek
				});

			onSaved();
		} catch (e) {
			onError(e);
		}
	};

	if (rows.length === 0) {
		return (
			<Alert severity="info">
				No teacher accounts yet. Create them under{' '}
				<Link
					href="/admin/staff-students"
					className="font-semibold"
				>
					Staff &amp; Students
				</Link>
				.
			</Alert>
		);
	}

	return (
		<div className="flex flex-col gap-3">
			<Typography
				variant="body2"
				color="text.secondary"
			>
				Short names (e.g. “OTI”) appear on class timetables. Limits are optional; the generator respects them
				when “Respect daily maximum” is on.
			</Typography>
			<div className="flex flex-col divide-y divide-gray-100 dark:divide-white/10">
				{rows.map((r, i) => (
					<div
						key={r.id}
						className="flex flex-wrap items-center gap-3 py-2"
					>
						<div className="w-56 min-w-0">
							<div className="truncate font-semibold">
								{r.name}
								{r.status === 'SUSPENDED' && (
									<span className="ml-2 text-xs font-normal text-rose-600">suspended</span>
								)}
							</div>
							<div className="truncate text-xs text-gray-500">{r.email}</div>
						</div>
						<TextField
							size="small"
							label="Short"
							value={r.short}
							inputProps={{ maxLength: 6 }}
							onChange={(e) =>
								setRows(
									rows.map((x, k) =>
										k === i ? { ...x, short: e.target.value.toUpperCase(), dirty: true } : x
									)
								)
							}
							className="w-24"
						/>
						<TextField
							size="small"
							type="number"
							label="Max / day"
							value={r.maxPerDay ?? ''}
							onChange={(e) =>
								setRows(
									rows.map((x, k) =>
										k === i ? { ...x, maxPerDay: num(e.target.value), dirty: true } : x
									)
								)
							}
							className="w-28"
						/>
						<TextField
							size="small"
							type="number"
							label="Max / week"
							value={r.maxPerWeek ?? ''}
							onChange={(e) =>
								setRows(
									rows.map((x, k) =>
										k === i ? { ...x, maxPerWeek: num(e.target.value), dirty: true } : x
									)
								)
							}
							className="w-28"
						/>
						{availabilityButton({ type: 'teacher', id: r.id, name: r.name })}
					</div>
				))}
			</div>
			<div>
				<Button
					variant="contained"
					color="secondary"
					disabled={dirty.length === 0}
					onClick={save}
				>
					Save {dirty.length > 0 ? `${dirty.length} change${dirty.length > 1 ? 's' : ''}` : ''}
				</Button>
			</div>
		</div>
	);
}

// ── Rooms ───────────────────────────────────────────────────

function RoomsTab({
	data,
	initialType,
	availabilityButton,
	onSaved,
	onError
}: {
	data: SetupData;
	/** From the pre-flight "Add a … room" link: preset the new room's type. */
	initialType?: string;
	availabilityButton: (u: Unavail) => React.ReactNode;
	onSaved: () => void;
	onError: (e: unknown) => void;
}) {
	const api = useTtApi();
	const [form, setForm] = useState({ name: '', short: '', type: initialType || 'classroom', capacity: '' });

	const add = async () => {
		try {
			await api.post('/setup/rooms', {
				name: form.name.trim(),
				short: form.short.trim().toUpperCase() || form.name.trim().slice(0, 6).toUpperCase(),
				type: form.type.trim() || 'classroom',
				capacity: form.capacity ? Number(form.capacity) : null
			});
			setForm({ name: '', short: '', type: form.type, capacity: '' });
			onSaved();
		} catch (e) {
			onError(e);
		}
	};

	const remove = async (id: string) => {
		try {
			await api.del(`/setup/rooms/${id}`);
			onSaved();
		} catch (e) {
			onError(e);
		}
	};

	return (
		<div className="flex flex-col gap-4">
			<Alert
				severity="info"
				variant="outlined"
			>
				Only special rooms matter for most schools — labs, computer rooms, the hall. With “Ignore general rooms”
				on (see Rules), normal lessons stay in the class’s home room and only lessons that need a room type get
				one.
			</Alert>
			{initialType && !data.rooms.some((r) => roomTypeLabel(r.type) === initialType) && (
				<Alert severity="warning">
					Some subjects need a “{initialType}” room and there isn’t one yet. Add it below (the type is already
					filled in), e.g. name “Science Lab”, short “LAB”.
				</Alert>
			)}
			<div className="flex flex-wrap items-end gap-2">
				<TextField
					size="small"
					label="Room name"
					value={form.name}
					onChange={(e) => setForm({ ...form, name: e.target.value })}
				/>
				<TextField
					size="small"
					label="Short"
					value={form.short}
					onChange={(e) => setForm({ ...form, short: e.target.value })}
					className="w-24"
				/>
				<Autocomplete
					freeSolo
					size="small"
					options={ROOM_TYPE_OPTIONS}
					value={form.type}
					onInputChange={(_, v) => setForm({ ...form, type: v })}
					renderInput={(params) => (
						<TextField
							{...params}
							label="Type"
						/>
					)}
					className="w-40"
				/>
				<TextField
					size="small"
					type="number"
					label="Capacity"
					value={form.capacity}
					onChange={(e) => setForm({ ...form, capacity: e.target.value })}
					className="w-28"
				/>
				<Button
					variant="contained"
					color="secondary"
					disabled={!form.name.trim()}
					onClick={add}
				>
					Add room
				</Button>
			</div>
			<div className="flex flex-col divide-y divide-gray-100 dark:divide-white/10">
				{data.rooms.length === 0 && (
					<Typography
						color="text.secondary"
						className="py-4 text-sm"
					>
						No rooms yet.
					</Typography>
				)}
				{data.rooms.map((r) => (
					<div
						key={r.id}
						className="flex flex-wrap items-center gap-3 py-2"
					>
						<div className="w-56">
							<div className="font-semibold">
								{r.name} <span className="text-xs font-normal text-gray-500">({r.short})</span>
							</div>
							<div className="text-xs text-gray-500">
								{roomTypeLabel(r.type)}
								{r.capacity ? ` · ${r.capacity} seats` : ''}
							</div>
						</div>
						{availabilityButton({ type: 'room', id: r.id, name: r.name })}
						<Tooltip title="Delete room">
							<IconButton
								size="small"
								onClick={() => remove(r.id)}
							>
								<FuseSvgIcon size={16}>lucide:trash-2</FuseSvgIcon>
							</IconButton>
						</Tooltip>
					</div>
				))}
			</div>
		</div>
	);
}

// ── Rules ───────────────────────────────────────────────────

const RULES: { key: keyof Rules; label: string; help: string }[] = [
	{
		key: 'noSameSubjectTwiceADay',
		label: 'No subject twice a day',
		help: 'Avoid putting the same subject in a class twice on one day (doubles count once).'
	},
	{
		key: 'spreadSubjects',
		label: 'Spread subjects across the week',
		help: 'Avoid the same subject on back-to-back days where possible.'
	},
	{
		key: 'minimiseTeacherGaps',
		label: 'Minimise teacher gaps',
		help: 'Prefer compact days for teachers, with few free periods between lessons.'
	},
	{
		key: 'respectMaxPerDay',
		label: 'Respect daily maximum',
		help: 'Never give a teacher more lessons in a day than their “Max / day” setting.'
	},
	{
		key: 'preferMorning',
		label: 'Prefer mornings',
		help: 'Keep lessons out of the last periods of the day when there is a choice.'
	}
];

function RulesTab({
	data,
	onSaved,
	onError
}: {
	data: SetupData;
	onSaved: (s: SetupData['settings']) => void;
	onError: (e: unknown) => void;
}) {
	const api = useTtApi();
	const [s, setS] = useState(data.settings);

	const save = async () => {
		try {
			onSaved(await api.put<SetupData['settings']>('/setup/settings', s));
		} catch (e) {
			onError(e);
		}
	};

	return (
		<div className="flex max-w-2xl flex-col gap-4">
			{RULES.map((r) => (
				<div
					key={r.key}
					className="flex items-start justify-between gap-4"
				>
					<div>
						<Typography className="font-semibold">{r.label}</Typography>
						<Typography
							variant="body2"
							color="text.secondary"
						>
							{r.help}
						</Typography>
					</div>
					<Switch
						checked={s.rules[r.key]}
						onChange={(e) => setS({ ...s, rules: { ...s.rules, [r.key]: e.target.checked } })}
					/>
				</div>
			))}
			<div className="flex items-start justify-between gap-4 border-t border-gray-100 pt-4 dark:border-white/10">
				<div>
					<Typography className="font-semibold">Ignore general rooms</Typography>
					<Typography
						variant="body2"
						color="text.secondary"
					>
						Only assign rooms to lessons that need a special room type. Turn off to also assign a “general”
						room to every other lesson.
					</Typography>
				</div>
				<Switch
					checked={s.ignoreGeneralRooms}
					onChange={(e) => setS({ ...s, ignoreGeneralRooms: e.target.checked })}
				/>
			</div>
			<div>
				<Button
					variant="contained"
					color="secondary"
					onClick={save}
				>
					Save rules
				</Button>
			</div>
		</div>
	);
}

// ── Availability dialog ─────────────────────────────────────

function UnavailabilityDialog({
	target,
	data,
	onClose,
	onSaved,
	onError
}: {
	target: Unavail;
	data: SetupData;
	onClose: () => void;
	onSaved: () => void;
	onError: (e: unknown) => void;
}) {
	const api = useTtApi();
	const [slots, setSlots] = useState(
		data.unavailability
			.filter((u) => u.resourceType === target.type && u.resourceId === target.id)
			.map(({ dayIndex, periodIndex }) => ({ dayIndex, periodIndex }))
	);

	const save = async () => {
		try {
			await api.put(`/setup/unavailability/${target.type}/${target.id}`, { slots });
			onSaved();
		} catch (e) {
			onError(e);
		}
	};

	return (
		<Dialog
			open
			onClose={onClose}
			maxWidth="md"
		>
			<DialogTitle>When is {target.name} unavailable?</DialogTitle>
			<DialogContent>
				<AvailabilityGrid
					days={data.days}
					periods={data.periods}
					value={slots}
					onChange={setSlots}
				/>
			</DialogContent>
			<DialogActions>
				<Button onClick={() => setSlots([])}>Clear all</Button>
				<div className="flex-1" />
				<Button onClick={onClose}>Cancel</Button>
				<Button
					variant="contained"
					color="secondary"
					onClick={save}
				>
					Save
				</Button>
			</DialogActions>
		</Dialog>
	);
}
