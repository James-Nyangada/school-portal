'use client';

import { useEffect, useState } from 'react';
import { Alert, CircularProgress, FormControl, InputLabel, MenuItem, Select, Typography } from '@mui/material';
import FusePageSimple from '@fuse/core/FusePageSimple';
import AuthGuardRedirect from '@auth/AuthGuardRedirect';
import ReportCardsView from '@/components/grading/ReportCardsView';
import { useBackend } from '@/lib/finance';

type Me = {
	parentLinks: {
		student: { id: string; firstName: string | null; lastName: string | null; class: { name: string } | null };
	}[];
};

/** Shared with the other parent pages so the selected child stays the same everywhere (dashboard spec §5.1). */
const CHILD_KEY = 'parent_selected_child_id';

export default function ParentReportCards() {
	const { data: me, error } = useBackend<Me>('/api/users/me');
	const [childId, setChildId] = useState('');
	const children = (me?.parentLinks ?? []).map((l) => l.student);

	useEffect(() => {
		if (!me) return;

		let saved: string | null = null;
		try {
			saved = localStorage.getItem(CHILD_KEY);
		} catch {
			saved = null;
		}
		const list = me.parentLinks.map((l) => l.student);
		setChildId(list.find((c) => c.id === saved)?.id ?? list[0]?.id ?? '');
	}, [me]);

	const choose = (id: string) => {
		setChildId(id);
		try {
			localStorage.setItem(CHILD_KEY, id);
		} catch {
			// Storage unavailable: the selection just isn't remembered
		}
	};

	return (
		<AuthGuardRedirect auth={['PARENT']}>
			<FusePageSimple
				content={
					<div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8">
						<div className="flex flex-wrap items-end justify-between gap-4">
							<div>
								<Typography className="text-3xl font-extrabold tracking-tight">Report Cards</Typography>
								<Typography color="text.secondary">
									Published termly report cards, to view or download.
								</Typography>
							</div>
							{children.length > 1 && (
								<FormControl
									size="small"
									className="min-w-60"
								>
									<InputLabel id="rc-child">Child</InputLabel>
									<Select
										labelId="rc-child"
										label="Child"
										value={childId}
										onChange={(e) => choose(e.target.value)}
									>
										{children.map((c) => (
											<MenuItem
												key={c.id}
												value={c.id}
											>
												{[c.firstName, c.lastName].filter(Boolean).join(' ')}
												{c.class ? ` · ${c.class.name}` : ''}
											</MenuItem>
										))}
									</Select>
								</FormControl>
							)}
						</div>

						{error ? (
							<Alert severity="error">{error}</Alert>
						) : !me ? (
							<div className="flex justify-center py-12">
								<CircularProgress />
							</div>
						) : children.length === 0 ? (
							<Alert severity="info">
								No children are linked to your account yet. Contact the school office to link your
								child.
							</Alert>
						) : (
							childId && (
								<ReportCardsView
									studentId={childId}
									feesHref="/parent/fees"
								/>
							)
						)}
					</div>
				}
			/>
		</AuthGuardRedirect>
	);
}
