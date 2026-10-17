import path from 'path';
import { Worker } from 'worker_threads';
import type { Prisma } from '@prisma/client';
import type { GenResult, Model, Progress } from '../../timetable-core';
import { audit, HttpError, prisma, withTimetableLock } from './db';
import { loadModel } from './model.service';
import { insertPlacements } from './entries.service';

const DEFAULT_TIME_LIMIT_SEC = Number(process.env.GENERATOR_TIME_LIMIT_SEC ?? 60);

/** Running workers by job id, so cancel can reach them. */
const running = new Map<string, { worker: Worker; stop: Int32Array }>();

function spawnWorker(model: Model, timeLimitMs: number, onProgress: (p: Progress) => void): { promise: Promise<GenResult>; worker: Worker; stop: Int32Array } {
	const stopFlag = new SharedArrayBuffer(4);
	const stop = new Int32Array(stopFlag);
	const isTs = __filename.endsWith('.ts');
	const file = path.join(__dirname, '..', '..', 'workers', `tt-generate.worker.${isTs ? 'ts' : 'js'}`);

	// Under ts-node (npm run dev) the worker has to register ts-node itself.
	const worker = isTs
		? new Worker(
				`require('ts-node').register({ transpileOnly: true, compilerOptions: { rootDir: ${JSON.stringify(path.join(__dirname, '..', '..'))} } }); require(${JSON.stringify(file)});`,
				{
					eval: true,
					workerData: { model, timeLimitMs, stopFlag }
				}
			)
		: new Worker(file, { workerData: { model, timeLimitMs, stopFlag } });

	const promise = new Promise<GenResult>((resolve, reject) => {
		worker.on('message', (msg: { type: string; progress?: Progress; result?: GenResult; error?: string }) => {
			if (msg.type === 'progress' && msg.progress) onProgress(msg.progress);

			if (msg.type === 'done' && msg.result) resolve(msg.result);

			if (msg.type === 'error') reject(new Error(msg.error));
		});
		worker.on('error', reject);
		worker.on('exit', (code) => code !== 0 && reject(new Error(`Generator stopped (exit ${code})`)));
	});

	return { promise, worker, stop };
}

/** Create a job row and start it in the background. Refuses a second concurrent job. */
export async function startGeneration(timetableId: string, actorId: string | undefined, opts: { keepLocked: boolean; timeLimitSec?: number }) {
	const timetable = await prisma.ttTimetable.findUnique({ where: { id: timetableId } });

	if (!timetable) throw new HttpError(404, 'Timetable not found');

	if (timetable.status === 'archived') throw new HttpError(409, 'Archived timetables cannot be regenerated. Duplicate it first.');

	const job = await prisma.$transaction(async (tx) => {
		await tx.$queryRaw`SELECT 1 AS ok FROM (SELECT pg_advisory_xact_lock(hashtext(${'job:' + timetableId}))) AS l`;
		const active = await tx.ttJob.findFirst({ where: { timetableId, status: { in: ['queued', 'running'] } } });

		if (active) throw new HttpError(409, 'A generation job is already running for this timetable.', { jobId: active.id });

		return tx.ttJob.create({ data: { timetableId, createdById: actorId ?? null } });
	});

	await audit(prisma, actorId, 'GENERATE_STARTED', timetableId, { jobId: job.id, keepLocked: opts.keepLocked });

	const timeLimitSec = Math.min(Math.max(opts.timeLimitSec ?? DEFAULT_TIME_LIMIT_SEC, 5), 600);
	void runJob(job.id, timetableId, actorId, opts.keepLocked, timeLimitSec);

	return job;
}

async function runJob(jobId: string, timetableId: string, actorId: string | undefined, keepLocked: boolean, timeLimitSec: number) {
	try {
		await prisma.ttJob.update({ where: { id: jobId }, data: { status: 'running' } });
		const { model, schedule } = await loadModel(timetableId, { entries: keepLocked ? 'locked' : 'none' });

		let lastWrite = 0;
		let pending: Progress | null = null;
		const flush = async () => {
			if (!pending) return;

			const p = pending;
			pending = null;
			lastWrite = Date.now();
			await prisma.ttJob.update({ where: { id: jobId }, data: { progress: Math.min(p.percent, 99), placed: p.placed, total: p.total } }).catch(() => undefined);
		};

		const { promise, worker, stop } = spawnWorker(model, timeLimitSec * 1000, (p) => {
			pending = p;

			if (Date.now() - lastWrite > 1000) void flush();
		});
		running.set(jobId, { worker, stop });

		// Poll the cancel flag (set by another request) and forward it to the worker.
		const cancelPoll = setInterval(async () => {
			const row = await prisma.ttJob.findUnique({ where: { id: jobId }, select: { cancelRequested: true } }).catch(() => null);

			if (row?.cancelRequested) Atomics.store(stop, 0, 1);
		}, 1000);

		let result: GenResult;

		try {
			result = await promise;
		} finally {
			clearInterval(cancelPoll);
			running.delete(jobId);
			await worker.terminate().catch(() => undefined);
		}

		const cancelled = (await prisma.ttJob.findUnique({ where: { id: jobId } }))?.cancelRequested;

		if (cancelled) {
			await prisma.ttJob.update({ where: { id: jobId }, data: { status: 'cancelled', finishedAt: new Date() } });
			await audit(prisma, actorId, 'GENERATE_CANCELLED', timetableId, { jobId });

			return;
		}

		// Replace every non-kept entry with the generated ones, atomically.
		const fixedIds = new Set(model.fixed.map((f) => f.cardId));
		await withTimetableLock(
			timetableId,
			async (tx) => {
				await tx.ttEntry.deleteMany({ where: { timetableId, ...(keepLocked ? { locked: false } : {}) } });
				await insertPlacements(tx, timetableId, model, schedule, result.placements.filter((p) => !fixedIds.has(p.cardId)));
			},
			120_000
		);

		const summary = {
			placed: result.placed,
			total: result.total,
			score: result.score,
			attempts: result.attempts,
			elapsedMs: result.elapsedMs,
			unplaced: result.unplaced
		};
		await prisma.ttJob.update({
			where: { id: jobId },
			data: { status: 'done', progress: 100, placed: result.placed, total: result.total, result: summary as unknown as Prisma.InputJsonValue, finishedAt: new Date() }
		});
		await audit(prisma, actorId, 'GENERATE_DONE', timetableId, { jobId, placed: result.placed, total: result.total, score: result.score });
	} catch (err) {
		console.error('[tt] generation failed', err);
		await prisma.ttJob
			.update({ where: { id: jobId }, data: { status: 'failed', error: err instanceof Error ? err.message : String(err), finishedAt: new Date() } })
			.catch(() => undefined);
	}
}

export async function cancelJob(jobId: string) {
	const job = await prisma.ttJob.findUnique({ where: { id: jobId } });

	if (!job) throw new HttpError(404, 'Job not found');

	if (job.status !== 'queued' && job.status !== 'running') return job;

	const updated = await prisma.ttJob.update({ where: { id: jobId }, data: { cancelRequested: true } });
	const live = running.get(jobId);

	if (live) Atomics.store(live.stop, 0, 1);

	return updated;
}

/** Jobs can't survive a server restart — mark any left over as failed on boot. */
export async function recoverJobsOnBoot(attempts = 5) {
	for (let attempt = 1; attempt <= attempts; attempt++) {
		try {
			await prisma.ttJob.updateMany({
				where: { status: { in: ['queued', 'running'] } },
				data: { status: 'failed', error: 'The server restarted while this job was running. Start it again.', finishedAt: new Date() }
			});
			return;
		} catch (e) {
			// The pooler connection is often not ready right at boot (or still held by the previous process) — back off and retry
			if (attempt === attempts) {
				console.error('[tt] could not recover jobs', e);
				return;
			}

			await new Promise((resolve) => setTimeout(resolve, attempt * 2000));
		}
	}
}
