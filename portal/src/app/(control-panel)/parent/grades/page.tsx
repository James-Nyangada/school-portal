'use client';

import { useEffect, useState } from 'react';
import { Alert, CircularProgress, MenuItem, TextField, Typography } from '@mui/material';
import FusePageSimple from '@fuse/core/FusePageSimple';
import AuthGuardRedirect from '@auth/AuthGuardRedirect';
import { BACKEND_URL } from '@/lib/backend';
import { errorMessage, useTtApi } from '@/components/timetable/api';
import StudentGradesView from '@/components/grading/StudentGradesView';

type Child = { id: string; name: string };

type Me = {
	parentLinks?: {
		student: { id: string; firstName: string | null; lastName: string | null; admissionNumber: string | null };
	}[];
};

const STORAGE_KEY = 'parent_selected_child_id';

const readSaved = () => {
	try {
		return localStorage.getItem(STORAGE_KEY);
	} catch {
		return null;
	}
};

export default function ParentGrades() {
	const users = useTtApi(`${BACKEND_URL}/api/users`);
	const [children, setChildren] = useState<Child[] | null>(null);
	const [childId, setChildId] = useState<string | null>(null);
	const [error, setError] = useState('');

	useEffect(() => {
		if (!users.ready) return;

		users
			.get<Me>('/me')
			.then((me) => {
				const list = (me.parentLinks ?? []).map(({ student: s }) => ({
					id: s.id,
					name: `${[s.firstName, s.lastName].filter(Boolean).join(' ')}${s.admissionNumber ? ` (${s.admissionNumber})` : ''}`
				}));
				const saved = readSaved();

				setChildren(list);
				setChildId(list.find((c) => c.id === saved)?.id ?? list[0]?.id ?? null);
			})
			.catch((e) => setError(errorMessage(e)));
	}, [users]);

	const choose = (id: string) => {
		setChildId(id);
		try {
			localStorage.setItem(STORAGE_KEY, id);
		} catch {
			// Selection just won't be remembered
		}
	};

	return (
		<AuthGuardRedirect auth={['PARENT']}>
			<FusePageSimple
				content={
					<div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8">
						{error && <Alert severity="error">{error}</Alert>}
						{!children && !error && (
							<div className="flex justify-center py-16">
								<CircularProgress />
							</div>
						)}
						{children?.length === 0 && (
							<Alert severity="info">
								No children are linked to your account yet. Contact the school office.
							</Alert>
						)}
						{children && children.length > 0 && (
							<StudentGradesView
								studentId={childId}
								payHref="/parent/fees"
								header={
									<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-6">
										<Typography className="text-4xl font-extrabold tracking-tight">
											Grades
										</Typography>
										{children.length > 1 && (
											<TextField
												select
												label="Viewing grades for"
												value={childId ?? ''}
												onChange={(e) => choose(e.target.value)}
												size="small"
												className="min-w-60"
											>
												{children.map((c) => (
													<MenuItem
														key={c.id}
														value={c.id}
													>
														{c.name}
													</MenuItem>
												))}
											</TextField>
										)}
									</div>
								}
							/>
						)}
					</div>
				}
			/>
		</AuthGuardRedirect>
	);
}
