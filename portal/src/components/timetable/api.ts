'use client';

import { useSession } from 'next-auth/react';
import { useCallback, useMemo } from 'react';
import { BACKEND_URL } from '@/lib/backend';

export const API_BASE = `${BACKEND_URL}/api/tt`;

export class ApiError extends Error {
	constructor(
		public status: number,
		message: string,
		public body: { error?: string; details?: unknown; rowErrors?: unknown } = {}
	) {
		super(message);
	}

	/** Reasons the server gave for a rejected placement (409). */
	get reasons(): string[] {
		const d = this.body.details as { reasons?: string[] } | undefined;

		return d?.reasons ?? [];
	}
}

/** Fetch wrapper for the timetable API (or another API under `base`) that adds the signed-in user's backend token. */
export function useTtApi(base: string = API_BASE) {
	const { data: session, status } = useSession();
	const token = (session as { backendToken?: string } | null)?.backendToken;

	const call = useCallback(
		async <T = unknown>(method: string, path: string, body?: unknown): Promise<T> => {
			const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
			const res = await fetch(`${base}${path}`, {
				method,
				headers: {
					...(token ? { Authorization: `Bearer ${token}` } : {}),
					...(body !== undefined && !isForm ? { 'Content-Type': 'application/json' } : {})
				},
				body: body === undefined ? undefined : isForm ? (body as FormData) : JSON.stringify(body)
			});

			const data = res.headers.get('content-type')?.includes('json') ? await res.json() : null;

			if (!res.ok) throw new ApiError(res.status, data?.error ?? `Request failed (${res.status})`, data ?? {});

			return data as T;
		},
		[base, token]
	);

	/** Download a file endpoint (e.g. Excel export) with auth. */
	const download = useCallback(
		async (path: string, filename: string) => {
			const res = await fetch(`${base}${path}`, {
				headers: token ? { Authorization: `Bearer ${token}` } : {}
			});

			if (!res.ok) throw new ApiError(res.status, 'Download failed');

			const url = URL.createObjectURL(await res.blob());
			const a = document.createElement('a');
			a.href = url;
			a.download = filename;
			a.click();
			URL.revokeObjectURL(url);
		},
		[base, token]
	);

	return useMemo(
		() => ({
			ready: status !== 'loading' && Boolean(token),
			loading: status === 'loading',
			role: ((session?.user as { role?: string } | undefined)?.role ?? '') as string,
			userId: ((session?.user as { id?: string } | undefined)?.id ?? '') as string,
			get: <T = unknown>(path: string) => call<T>('GET', path),
			post: <T = unknown>(path: string, body?: unknown) => call<T>('POST', path, body ?? {}),
			put: <T = unknown>(path: string, body?: unknown) => call<T>('PUT', path, body ?? {}),
			patch: <T = unknown>(path: string, body?: unknown) => call<T>('PATCH', path, body ?? {}),
			del: <T = unknown>(path: string) => call<T>('DELETE', path),
			upload: <T = unknown>(path: string, form: FormData) => call<T>('POST', path, form),
			download
		}),
		[call, download, status, token, session]
	);
}

export const errorMessage = (e: unknown) =>
	e instanceof ApiError
		? [e.message, ...e.reasons].filter(Boolean).join(' — ')
		: e instanceof Error
			? e.message
			: 'Something went wrong';
