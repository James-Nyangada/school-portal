'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
	Alert,
	Button,
	CircularProgress,
	FormControlLabel,
	LinearProgress,
	MenuItem,
	Paper,
	Switch,
	TextField,
	Typography
} from '@mui/material';
import FusePageSimple from '@fuse/core/FusePageSimple';
import FuseSvgIcon from '@fuse/core/FuseSvgIcon';
import AuthGuardRedirect from '@auth/AuthGuardRedirect';
import { useSnackbar } from 'notistack';
import { errorMessage } from '@/components/timetable/api';
import TimetableHeader from '@/components/timetable/TimetableHeader';
import { useTimetable } from '@/components/timetable/useTimetable';
import UnplacedList from '@/components/timetable/UnplacedList';
import type { Job } from '@/components/timetable/types';

type CheckLink = { kind: string; id?: string };
type Check = { level: 'ok' | 'warn' | 'error'; message: string; link?: CheckLink; altLink?: CheckLink };
type Feasibility = { checks: Check[]; canGenerate: boolean; cards: number; periods: number; locked: number };

const icon = { ok: 'lucide:circle-check', warn: 'lucide:triangle-alert', error: 'lucide:circle-x' };
const tone = { ok: 'text-emerald-600', warn: 'text-amber-600', error: 'text-rose-600' };

export default function GeneratePage() {
	const { id, timetable, api, reload } = useTimetable();
	const { enqueueSnackbar } = useSnackbar();
	const [feas, setFeas] = useState<Feasibility | null>(null);
	const [job, setJob] = useState<Job | null>(null);
	const [opts, setOpts] = useState({ keepLocked: true, timeLimitSec: 60 });
	const [starting, setStarting] = useState(false);
	const poll = useRef<ReturnType<typeof setInterval> | null>(null);

	const loadFeasibility = useCallback(async () => {
		if (!api.ready || !id) return;

		try {
			setFeas(await api.get<Feasibility>(`/timetables/${id}/feasibility`));
		} catch (e) {
			enqueueSnackbar(errorMessage(e), { variant: 'error' });
		}
	}, [api, id, enqueueSnackbar]);

	const stopPolling = () => {
		if (poll.current) clearInterval(poll.current);

		poll.current = null;
	};

	const watch = useCallback(
		(jobId: string) => {
			stopPolling();
			poll.current = setInterval(async () => {
				try {
					const j = await api.get<Job>(`/jobs/${jobId}`);
					setJob(j);

					if (!['queued', 'running'].includes(j.status)) {
						stopPolling();
						reload();

						if (j.status === 'done')
							enqueueSnackbar(`Timetable generated: ${j.placed}/${j.total} cards placed`, {
								variant: 'success'
							});

						if (j.status === 'failed')
							enqueueSnackbar(j.error ?? 'Generation failed', { variant: 'error' });
					}
				} catch {
					/* keep polling through brief network blips */
				}
			}, 1000);
		},
		[api, reload, enqueueSnackbar]
	);

	useEffect(() => {
		loadFeasibility();
	}, [loadFeasibility]);

	// Resume watching a job that's already running (e.g. after a page refresh).
	useEffect(() => {
		if (!api.ready || !id) return undefined;

		api.get<Job | null>(`/timetables/${id}/jobs/latest`)
			.then((j) => {
				setJob(j);

				if (j && ['queued', 'running'].includes(j.status)) watch(j.id);
			})
			.catch(() => undefined);

		return stopPolling;
	}, [api, id, watch]);

	const start = async () => {
		setStarting(true);

		try {
			const j = await api.post<Job>(`/timetables/${id}/generate`, opts);
			setJob(j);
			watch(j.id);
		} catch (e) {
			enqueueSnackbar(errorMessage(e), { variant: 'error' });
		} finally {
			setStarting(false);
		}
	};

	const cancel = async () => {
		if (!job) return;

		try {
			await api.post(`/jobs/${job.id}/cancel`);
			enqueueSnackbar('Stopping…', { variant: 'info' });
		} catch (e) {
			enqueueSnackbar(errorMessage(e), { variant: 'error' });
		}
	};

	const running = job && ['queued', 'running'].includes(job.status);
	/** Where a check's link points, and the button text for it. */
	const fixTarget = (link: CheckLink | undefined, message: string) => {
		const k = link?.kind;

		if (k === 'lesson' || k === 'group') return { href: `/admin/timetable/${id}/lessons`, label: 'Fix' };

		if (k === 'room' && link?.id)
			return {
				href: `/admin/timetable/setup?tab=rooms&roomType=${encodeURIComponent(link.id)}`,
				label: `Add a "${link.id}" room`
			};

		if (k === 'subject' && link?.id) {
			const subject = /^(.*?) needs a "/.exec(message)?.[1];

			return {
				href: `/admin/timetable/setup?tab=subjects&subject=${encodeURIComponent(link.id)}`,
				label: subject ? `Use classroom for ${subject}` : 'Change room type'
			};
		}

		return { href: '/admin/timetable/setup', label: 'Fix' };
	};

	return (
		<AuthGuardRedirect auth={['SUPER_ADMIN', 'ADMIN']}>
			<FusePageSimple
				header={<TimetableHeader timetable={timetable} />}
				content={
					<div className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-6 p-6 lg:grid-cols-5">
						<Paper
							variant="outlined"
							className="flex flex-col gap-4 rounded-2xl p-5 lg:col-span-3"
						>
							<div className="flex items-center justify-between">
								<div>
									<Typography className="text-lg font-bold">Pre-flight check</Typography>
									<Typography
										variant="body2"
										color="text.secondary"
									>
										Catches impossible setups before the generator wastes time on them.
									</Typography>
								</div>
								<Button
									size="small"
									onClick={loadFeasibility}
									startIcon={<FuseSvgIcon size={14}>lucide:refresh-cw</FuseSvgIcon>}
								>
									Re-check
								</Button>
							</div>
							{!feas ? (
								<div className="flex justify-center py-8">
									<CircularProgress size={28} />
								</div>
							) : (
								<>
									<div className="flex gap-6 text-sm">
										<div>
											<div className="text-2xl font-bold">{feas.cards}</div>
											<div className="text-gray-500">lesson cards</div>
										</div>
										<div>
											<div className="text-2xl font-bold">{feas.periods}</div>
											<div className="text-gray-500">periods to place</div>
										</div>
										<div>
											<div className="text-2xl font-bold">{feas.locked}</div>
											<div className="text-gray-500">locked</div>
										</div>
									</div>
									<ul className="flex flex-col gap-2">
										{feas.checks.map((c, i) => (
											<li
												key={i}
												className="flex items-start gap-2 text-sm"
											>
												<FuseSvgIcon
													size={18}
													className={`mt-0.5 shrink-0 ${tone[c.level]}`}
												>
													{icon[c.level]}
												</FuseSvgIcon>
												<span className="flex-1">{c.message}</span>
												{c.level !== 'ok' && (
													<span className="flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:gap-3">
														{[c.altLink, c.link]
															.filter((l, k) => l || k === 1)
															.map((l, k) => {
																const t = fixTarget(l, c.message);

																return (
																	<Link
																		key={k}
																		href={t.href}
																		className="text-xs font-semibold whitespace-nowrap text-blue-600 hover:underline"
																	>
																		{t.label}
																	</Link>
																);
															})}
													</span>
												)}
											</li>
										))}
									</ul>
								</>
							)}
						</Paper>

						<Paper
							variant="outlined"
							className="flex flex-col gap-4 rounded-2xl p-5 lg:col-span-2"
						>
							<Typography className="text-lg font-bold">Generate</Typography>
							<FormControlLabel
								control={
									<Switch
										checked={opts.keepLocked}
										onChange={(e) => setOpts({ ...opts, keepLocked: e.target.checked })}
									/>
								}
								label="Keep locked lessons where they are"
							/>
							<TextField
								select
								size="small"
								label="Time budget"
								value={opts.timeLimitSec}
								onChange={(e) => setOpts({ ...opts, timeLimitSec: Number(e.target.value) })}
							>
								<MenuItem value={20}>20 seconds (quick draft)</MenuItem>
								<MenuItem value={60}>1 minute (recommended)</MenuItem>
								<MenuItem value={180}>3 minutes (large or tight schools)</MenuItem>
							</TextField>
							<Alert
								severity="warning"
								variant="outlined"
							>
								Generating replaces every unlocked lesson on the grid. Lock the ones you want to keep,
								or duplicate the timetable first.
							</Alert>
							{running ? (
								<div className="flex flex-col gap-2">
									<LinearProgress
										variant={job.progress > 0 ? 'determinate' : 'indeterminate'}
										value={job.progress}
										sx={{ height: 8, borderRadius: 4 }}
									/>
									<Typography variant="body2">
										{job.status === 'queued'
											? 'Starting…'
											: `Placed ${job.placed ?? 0} of ${job.total ?? '…'} cards`}
									</Typography>
									<Button
										color="error"
										variant="outlined"
										onClick={cancel}
									>
										Cancel
									</Button>
								</div>
							) : (
								<Button
									variant="contained"
									color="secondary"
									size="large"
									disabled={!feas?.canGenerate || starting}
									onClick={start}
									startIcon={<FuseSvgIcon size={18}>lucide:sparkles</FuseSvgIcon>}
								>
									{starting ? 'Starting…' : 'Generate timetable'}
								</Button>
							)}
							{feas && !feas.canGenerate && (
								<Typography
									variant="caption"
									color="error"
								>
									Fix the errors in the pre-flight check to enable generation.
								</Typography>
							)}
						</Paper>

						{job && !running && (
							<JobResult
								job={job}
								timetableId={id}
							/>
						)}
					</div>
				}
			/>
		</AuthGuardRedirect>
	);
}

function JobResult({ job, timetableId }: { job: Job; timetableId: string }) {
	if (job.status === 'failed') {
		return (
			<Alert
				severity="error"
				className="lg:col-span-5"
			>
				Generation failed: {job.error}
			</Alert>
		);
	}

	if (job.status === 'cancelled') {
		return (
			<Alert
				severity="info"
				className="lg:col-span-5"
			>
				The last generation was cancelled. Nothing was changed.
			</Alert>
		);
	}

	const r = job.result;

	if (!r) return null;

	const complete = r.placed === r.total;

	return (
		<Paper
			variant="outlined"
			className="flex flex-col gap-4 rounded-2xl p-5 lg:col-span-5"
		>
			<div className="flex flex-wrap items-center justify-between gap-3">
				<div className="flex items-center gap-3">
					<FuseSvgIcon
						size={28}
						className={complete ? 'text-emerald-600' : 'text-amber-600'}
					>
						{complete ? 'lucide:party-popper' : 'lucide:puzzle'}
					</FuseSvgIcon>
					<div>
						<Typography className="text-lg font-bold">
							{complete ? 'Complete, clash-free timetable' : `${r.placed} of ${r.total} cards placed`}
						</Typography>
						<Typography
							variant="body2"
							color="text.secondary"
						>
							Quality penalty {r.score} (lower is better) · {r.attempts} attempt
							{r.attempts === 1 ? '' : 's'} · {(r.elapsedMs / 1000).toFixed(1)} s
						</Typography>
					</div>
				</div>
				<div className="flex gap-2">
					<Button
						component={Link}
						href={`/admin/timetable/${timetableId}/editor`}
						variant="outlined"
						className="rounded-full"
					>
						Open editor
					</Button>
					<Button
						component={Link}
						href={`/admin/timetable/${timetableId}/view`}
						variant="contained"
						color="secondary"
						className="rounded-full"
					>
						View &amp; publish
					</Button>
				</div>
			</div>
			{r.unplaced.length > 0 && (
				<UnplacedList
					items={r.unplaced}
					timetableId={timetableId}
				/>
			)}
		</Paper>
	);
}
