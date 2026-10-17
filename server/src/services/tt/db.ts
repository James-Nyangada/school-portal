import { Prisma, PrismaClient } from '@prisma/client';
import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { prisma } from '../../lib/prisma';

/** Shared client with a pool sized for the timetable's parallel queries — see lib/prisma. */
export { prisma };

export type Tx = Prisma.TransactionClient;

export class HttpError extends Error {
	constructor(
		public status: number,
		message: string,
		public details?: unknown
	) {
		super(message);
	}
}

/**
 * Run `fn` in a transaction holding a timetable-level advisory lock, so an editor save and a
 * generation job can never interleave writes on the same timetable.
 */
export async function withTimetableLock<T>(timetableId: string, fn: (tx: Tx) => Promise<T>, timeoutMs = 20_000): Promise<T> {
	return prisma.$transaction(
		async (tx) => {
			await tx.$queryRaw`SELECT 1 AS ok FROM (SELECT pg_advisory_xact_lock(hashtext(${timetableId}))) AS l`;

			return fn(tx);
		},
		{ timeout: timeoutMs, maxWait: 15_000 }
	);
}

export async function audit(
	db: Tx | PrismaClient,
	actorId: string | undefined,
	action: string,
	timetableId: string | null,
	detail?: Prisma.InputJsonValue
) {
	await db.ttAudit.create({
		data: { actorId: actorId ?? null, action, timetableId, ...(detail !== undefined ? { detail } : {}) }
	});
}

/** Throws 423 while a generation job is running — the editor is read-only then. */
export async function assertNotGenerating(db: Tx | PrismaClient, timetableId: string) {
	const running = await db.ttJob.findFirst({ where: { timetableId, status: { in: ['queued', 'running'] } } });

	if (running) throw new HttpError(423, 'A generation job is running for this timetable. Wait for it to finish.');
}

/** zod → 400, unique clash → 409, FK in use → 409, HttpError → its status. */
export function ttErrorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
	if (err instanceof ZodError) {
		// Name the field and the rule (e.g. "short: Short name can be at most 8 characters") instead of a bare "Invalid input".
		const first = err.issues[0];
		const where = first?.path.filter((p) => typeof p === 'string').join('.');
		const error = first ? `${where ? `${where}: ` : ''}${first.message}` : 'Invalid input';

		return res.status(400).json({ error, details: err.issues });
	}

	if (err instanceof HttpError) {
		return res.status(err.status).json({ error: err.message, ...(err.details !== undefined ? { details: err.details } : {}) });
	}

	if (err instanceof Prisma.PrismaClientKnownRequestError) {
		if (err.code === 'P2002') return res.status(409).json({ error: 'Clash or duplicate', detail: err.meta });

		if (err.code === 'P2003') return res.status(409).json({ error: 'Record is in use' });

		if (err.code === 'P2025') return res.status(404).json({ error: 'Not found' });
	}

	console.error('[tt]', err);
	res.status(500).json({ error: 'Server error' });
}
