/// <reference types="node" />
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

/**
 * One Prisma client for the whole server. The shared DATABASE_URL pins connection_limit=1, which
 * makes parallel queries queue up and hit Prisma's 10 s pool timeout against the remote pooler
 * (surfacing as random 500s). This client gets a bigger pool and a longer wait; the Supabase
 * pooler (pgbouncer, transaction mode) multiplexes these onto its own server connections.
 * It also allows a slow connect, since the pooler is a long round-trip away.
 *
 * Tune per deployment: DB_POOL_SIZE (default 10) x number of server instances must stay below
 * the Supabase pooler's client limit for your compute size.
 */
function databaseUrl(): string | undefined {
	const raw = process.env.DATABASE_URL;

	if (!raw) return undefined;

	try {
		const url = new URL(raw);
		const poolSize = Number(process.env.DB_POOL_SIZE) || 10;
		const limit = Number(url.searchParams.get('connection_limit') ?? '0');

		if (limit < poolSize) url.searchParams.set('connection_limit', String(poolSize));

		if (!url.searchParams.has('pool_timeout')) url.searchParams.set('pool_timeout', '30');

		// Opening a connection to the remote pooler (TLS handshake) takes ~2 s from here; Prisma's
		// default 5 s connect_timeout trips on any network hiccup and surfaces as P1001 "Can't reach database server"
		if (!url.searchParams.has('connect_timeout')) url.searchParams.set('connect_timeout', '30');

		return url.toString();
	} catch {
		return raw;
	}
}

const url = databaseUrl();
export const prisma = url ? new PrismaClient({ datasourceUrl: url }) : new PrismaClient();
