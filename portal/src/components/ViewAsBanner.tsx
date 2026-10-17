'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Button, CircularProgress } from '@mui/material';
import FuseSvgIcon from '@fuse/core/FuseSvgIcon';
import { BACKEND_URL } from '@/lib/backend';

/**
 * Shown on every page while a Super Admin is viewing the portal as someone else (dashboard spec §1.2).
 * View-as is never silent: the banner can't be dismissed, only exited.
 */
export default function ViewAsBanner() {
	const router = useRouter();
	const { data: session, update } = useSession();
	const [leaving, setLeaving] = useState(false);

	if (!session?.viewAs) return null;

	const exit = async () => {
		setLeaving(true);
		try {
			await fetch(`${BACKEND_URL}/api/auth/impersonation/stop`, {
				method: 'POST',
				headers: { Authorization: `Bearer ${session.backendToken}` }
			});
		} finally {
			await update({ endViewAs: true });
			router.push('/superadmin/users');
			setLeaving(false);
		}
	};

	return (
		<div
			role="alert"
			className="fixed inset-x-0 bottom-0 z-[9999] flex flex-wrap items-center justify-center gap-x-4 gap-y-2 bg-red-700 px-4 py-2 text-sm text-white shadow-lg"
		>
			<FuseSvgIcon size={18}>lucide:eye</FuseSvgIcon>
			<span>
				Viewing as <strong>{session.user?.name || session.user?.email}</strong> (
				{session.user?.role?.toLowerCase()}) — Super Admin session of {session.viewAs.superAdminName}.
				Read-only; every view is audit-logged.
			</span>
			<Button
				size="small"
				variant="contained"
				color="inherit"
				className="text-red-700"
				disabled={leaving}
				onClick={exit}
				startIcon={
					leaving ? <CircularProgress size={14} /> : <FuseSvgIcon size={16}>lucide:log-out</FuseSvgIcon>
				}
			>
				Exit view-as
			</Button>
		</div>
	);
}
