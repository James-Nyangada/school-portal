'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { errorMessage, useTtApi } from './api';
import type { Timetable } from './types';

/** The timetable in the current route (`/admin/timetable/[id]/...`). */
export function useTimetable() {
	const params = useParams<{ id: string }>();
	const id = params?.id ?? '';
	const api = useTtApi();
	const [timetable, setTimetable] = useState<Timetable | null>(null);
	const [error, setError] = useState<string | null>(null);

	const reload = useCallback(async () => {
		if (!api.ready || !id) return;

		try {
			setTimetable(await api.get<Timetable>(`/timetables/${id}`));
			setError(null);
		} catch (e) {
			setError(errorMessage(e));
		}
	}, [api, id]);

	useEffect(() => {
		reload();
	}, [reload]);

	return { id, timetable, error, reload, api };
}
