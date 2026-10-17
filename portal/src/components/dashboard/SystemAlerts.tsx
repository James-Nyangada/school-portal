'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Alert, AlertTitle, Button, IconButton } from '@mui/material';
import FuseSvgIcon from '@fuse/core/FuseSvgIcon';

export type SystemAlert = {
	key: string;
	severity: 'error' | 'warning' | 'info';
	title: string;
	message: string;
	count: number;
	href: string;
};

const STORAGE_KEY = 'dashboard.dismissedAlerts';

/** An alert is dismissed for its current count; it returns when the count changes. */
const signature = (a: SystemAlert) => `${a.key}:${a.count}`;

function readDismissed(): string[] {
	try {
		return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
	} catch {
		return [];
	}
}

/** Alert banner for the overview pages (dashboard spec §1.1): click through to the flagged item, or acknowledge it. */
export function SystemAlerts({ alerts }: { alerts: SystemAlert[] }) {
	const [dismissed, setDismissed] = useState<string[]>([]);

	useEffect(() => setDismissed(readDismissed()), []);

	const dismiss = (a: SystemAlert) => {
		// Only remember signatures that are still live, so the list doesn't grow forever
		const next = [...dismissed.filter((d) => alerts.some((x) => signature(x) === d)), signature(a)];
		setDismissed(next);
		try {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
		} catch {
			// Storage unavailable (private mode): dismissal lasts for this page view only
		}
	};

	const visible = alerts.filter((a) => !dismissed.includes(signature(a)));

	if (visible.length === 0) return null;

	return (
		<div className="flex flex-col gap-3">
			{visible.map((a) => (
				<Alert
					key={a.key}
					severity={a.severity}
					className="rounded-xl"
					action={
						<div className="flex items-center gap-1">
							<Button
								component={Link}
								href={a.href}
								color="inherit"
								size="small"
							>
								Review
							</Button>
							<IconButton
								size="small"
								color="inherit"
								aria-label="Acknowledge alert"
								title="Acknowledge"
								onClick={() => dismiss(a)}
							>
								<FuseSvgIcon size={16}>lucide:x</FuseSvgIcon>
							</IconButton>
						</div>
					}
				>
					<AlertTitle className="font-semibold">{a.title}</AlertTitle>
					{a.message}
				</Alert>
			))}
		</div>
	);
}
