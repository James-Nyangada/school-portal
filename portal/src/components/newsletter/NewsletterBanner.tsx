'use client';

import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { useState } from 'react';
import { Button, IconButton } from '@mui/material';
import FuseSvgIcon from '@fuse/core/FuseSvgIcon';
import { backendRequest, useBackend } from '@/lib/finance';
import { InboxItem, messagesHref } from './api';

/** Dashboard banner for newsletters the user hasn't opened or dismissed (shown again when a newsletter is edited). */
export default function NewsletterBanner() {
	const { data: session } = useSession();
	const role = (session?.user as { role?: string } | undefined)?.role;
	const inbox = useBackend<InboxItem[]>('/api/newsletters/inbox');
	const [hidden, setHidden] = useState<Set<string>>(new Set());

	const pending = (inbox.data ?? []).filter((i) => i.showBanner && !hidden.has(i.id));

	if (pending.length === 0) return null;

	const latest = pending[0];
	const updated = !!latest.openedAt && !!latest.editedAt;
	const href = messagesHref(role);

	const dismiss = () => {
		setHidden((h) => new Set(h).add(latest.id));

		if (inbox.token) {
			backendRequest(inbox.token, `/api/newsletters/inbox/${latest.id}/dismiss`, { method: 'POST' }).catch(
				() => {}
			);
		}
	};

	return (
		<div
			role="status"
			className="flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-blue-900 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-100"
		>
			<FuseSvgIcon
				size={20}
				className="mt-0.5 shrink-0 text-blue-600"
			>
				lucide:megaphone
			</FuseSvgIcon>
			<div className="min-w-0 flex-1">
				<p className="text-xs font-semibold tracking-wide text-blue-700 uppercase dark:text-blue-300">
					{updated ? 'Updated newsletter' : 'New newsletter'}
					{pending.length > 1 ? ` · ${pending.length - 1} more` : ''}
				</p>
				<p className="truncate font-semibold">{latest.subject}</p>
				{latest.preview && <p className="line-clamp-1 text-sm opacity-80">{latest.preview}</p>}
			</div>
			<div className="flex shrink-0 items-center gap-1">
				<Button
					component={Link}
					href={`${href}?id=${latest.id}`}
					size="small"
					variant="contained"
					className="rounded-full"
				>
					Read
				</Button>
				<IconButton
					size="small"
					aria-label="Dismiss"
					onClick={dismiss}
				>
					<FuseSvgIcon size={16}>lucide:x</FuseSvgIcon>
				</IconButton>
			</div>
		</div>
	);
}
