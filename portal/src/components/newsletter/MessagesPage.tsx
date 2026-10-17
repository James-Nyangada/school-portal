'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button, Chip, Paper, Typography } from '@mui/material';
import FusePageSimple from '@fuse/core/FusePageSimple';
import FuseSvgIcon from '@fuse/core/FuseSvgIcon';
import AuthGuardRedirect from '@auth/AuthGuardRedirect';
import useToast from '@/hooks/useToast';
import { backendRequest, useBackend } from '@/lib/finance';
import NewsletterContent from './NewsletterContent';
import { downloadNewsletterPdf, formatDateTime, InboxItem, InboxMessage } from './api';

/** Inbox + reader for newsletters sent to the signed-in user. `?id=` opens one directly. */
function Messages() {
	const { notify } = useToast();
	const router = useRouter();
	const params = useSearchParams();
	const inbox = useBackend<InboxItem[]>('/api/newsletters/inbox');
	const items = inbox.data ?? [];
	const token = inbox.token;

	const selectedId = params.get('id');
	const [message, setMessage] = useState<InboxMessage | null>(null);
	const [loadingMessage, setLoadingMessage] = useState(false);

	useEffect(() => {
		if (!selectedId || !token) {
			setMessage(null);
			return;
		}

		let cancelled = false;
		setLoadingMessage(true);
		backendRequest<InboxMessage>(token, `/api/newsletters/inbox/${selectedId}`)
			.then((m) => {
				if (cancelled) return;

				setMessage(m);
				// Opening marks it read; refresh the list's read state
				inbox.reload();
			})
			.catch((e: Error) => !cancelled && notify(e.message, 'error'))
			.finally(() => !cancelled && setLoadingMessage(false));

		return () => {
			cancelled = true;
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [selectedId, token]);

	const open = (id: string | null) => router.replace(id ? `?id=${id}` : '?', { scroll: false });

	const download = async () => {
		if (!token || !message) return;

		try {
			await downloadNewsletterPdf(token, message.id, message.subject);
		} catch (e) {
			notify((e as Error).message, 'error');
		}
	};

	const unread = items.filter((i) => !i.openedAt).length;

	return (
		<div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8">
			<div>
				<Typography className="text-3xl font-extrabold tracking-tight">Messages</Typography>
				<Typography className="mt-1 text-sm text-gray-500">
					Newsletters from the school{unread ? ` · ${unread} unread` : ''}
				</Typography>
			</div>

			<div className="grid grid-cols-1 gap-6 lg:grid-cols-[360px_1fr]">
				{/* List (hidden on small screens while reading) */}
				<Paper className={`overflow-hidden rounded-2xl shadow ${selectedId ? 'hidden lg:block' : ''}`}>
					{items.length === 0 && (
						<div className="flex flex-col items-center gap-2 px-6 py-16 text-center text-gray-500">
							<FuseSvgIcon
								size={36}
								className="text-gray-400"
							>
								lucide:inbox
							</FuseSvgIcon>
							{inbox.loading ? 'Loading…' : (inbox.error ?? 'No messages yet')}
						</div>
					)}
					<ul className="divide-y divide-gray-100 dark:divide-gray-800">
						{items.map((item) => {
							const active = item.id === selectedId;
							const updated = !!item.editedAt && !!item.openedAt && item.editedAt > item.openedAt;

							return (
								<li key={item.id}>
									<button
										type="button"
										onClick={() => open(item.id)}
										className={`flex w-full gap-3 px-4 py-3 text-left transition-colors hover:bg-gray-50 dark:hover:bg-gray-800 ${active ? 'bg-blue-50 dark:bg-gray-800' : ''}`}
									>
										<span
											className={`mt-2 h-2 w-2 shrink-0 rounded-full ${item.openedAt ? 'bg-transparent' : 'bg-blue-600'}`}
										/>
										<span className="min-w-0 flex-1">
											<span className="flex items-baseline justify-between gap-2">
												<span
													className={`truncate text-sm ${item.openedAt ? 'font-medium' : 'font-bold'}`}
												>
													{item.subject}
												</span>
												<span className="shrink-0 text-xs text-gray-500">
													{new Date(item.sentAt).toLocaleDateString('en-KE', {
														day: 'numeric',
														month: 'short'
													})}
												</span>
											</span>
											<span className="line-clamp-2 text-xs text-gray-500">{item.preview}</span>
											{updated && (
												<Chip
													size="small"
													label="Updated"
													color="info"
													variant="outlined"
													className="mt-1 h-5 text-[10px]"
												/>
											)}
										</span>
									</button>
								</li>
							);
						})}
					</ul>
				</Paper>

				{/* Reader */}
				<Paper className={`min-h-96 rounded-2xl shadow ${selectedId ? '' : 'hidden lg:block'}`}>
					{!selectedId && (
						<div className="flex h-full flex-col items-center justify-center gap-2 px-6 py-24 text-center text-gray-500">
							<FuseSvgIcon
								size={40}
								className="text-gray-400"
							>
								lucide:mail-open
							</FuseSvgIcon>
							Choose a message to read it
						</div>
					)}
					{selectedId && loadingMessage && !message && (
						<Typography className="px-6 py-24 text-center text-gray-500">Loading…</Typography>
					)}
					{selectedId && message && (
						<article className="flex flex-col">
							<div className="flex flex-wrap items-start justify-between gap-3 border-b px-6 py-4">
								<div className="min-w-0">
									<Button
										size="small"
										className="mb-1 -ml-2 lg:hidden"
										startIcon={<FuseSvgIcon size={16}>lucide:arrow-left</FuseSvgIcon>}
										onClick={() => open(null)}
									>
										All messages
									</Button>
									<Typography className="text-2xl font-bold">{message.subject}</Typography>
									<Typography className="mt-1 text-xs text-gray-500">
										{formatDateTime(message.sentAt)}
										{message.sentBy ? ` · ${message.sentBy}` : ''}
										{message.editedAt ? ` · Updated ${formatDateTime(message.editedAt)}` : ''}
									</Typography>
								</div>
								<Button
									variant="outlined"
									className="rounded-full"
									startIcon={<FuseSvgIcon size={16}>lucide:file-down</FuseSvgIcon>}
									onClick={download}
								>
									Download PDF
								</Button>
							</div>
							<NewsletterContent
								content={message.content}
								className="px-6 py-6"
							/>
						</article>
					)}
				</Paper>
			</div>
		</div>
	);
}

export default function MessagesPage({ auth }: { auth: string[] }) {
	return (
		<AuthGuardRedirect auth={auth}>
			<FusePageSimple
				content={
					<Suspense>
						<Messages />
					</Suspense>
				}
			/>
		</AuthGuardRedirect>
	);
}
