'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { MenuItem, TextField, Typography } from '@mui/material';
import FusePageSimple from '@fuse/core/FusePageSimple';
import AuthGuardRedirect from '@auth/AuthGuardRedirect';
import MyTimetable from '@/components/timetable/MyTimetable';
import { useTtApi } from '@/components/timetable/api';
import { BACKEND_URL } from '@/lib/backend';

type Child = { id: string; name: string };

const API = BACKEND_URL;

export default function ParentTimetable() {
	const api = useTtApi();
	const [children, setChildren] = useState<Child[] | null>(null);
	const [childId, setChildId] = useState('');
	const { data: session } = useSession();
	const token = (session as { backendToken?: string } | null)?.backendToken;

	useEffect(() => {
		if (!token) return;

		fetch(`${API}/api/users/me`, { headers: { Authorization: `Bearer ${token}` } })
			.then((r) => r.json())
			.then((me) => {
				const list: Child[] = (me.parentLinks ?? []).map(
					(l: {
						student: { id: string; firstName: string; lastName: string; admissionNumber?: string };
					}) => ({
						id: l.student.id,
						name: `${l.student.firstName} ${l.student.lastName}${l.student.admissionNumber ? ` (${l.student.admissionNumber})` : ''}`
					})
				);
				setChildren(list);
				const saved = localStorage.getItem('parent_selected_child_id');
				setChildId(list.find((c) => c.id === saved)?.id ?? list[0]?.id ?? '');
			})
			.catch(() => setChildren([]));
	}, [token]);

	const choose = (id: string) => {
		setChildId(id);
		localStorage.setItem('parent_selected_child_id', id);
	};

	return (
		<AuthGuardRedirect auth={['PARENT']}>
			<FusePageSimple
				content={
					<div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-8">
						<div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
							<div>
								<Typography className="text-4xl font-extrabold tracking-tight">Timetable</Typography>
								<Typography
									color="text.secondary"
									className="mt-1"
								>
									Your child’s class timetable for this term.
								</Typography>
							</div>
							{children && children.length > 1 && (
								<TextField
									select
									size="small"
									label="Child"
									value={childId}
									onChange={(e) => choose(e.target.value)}
									className="min-w-64"
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
						{children && children.length === 0 ? (
							<Typography color="text.secondary">No children are linked to this account yet.</Typography>
						) : (
							api.ready && childId && <MyTimetable studentId={childId} />
						)}
					</div>
				}
			/>
		</AuthGuardRedirect>
	);
}
