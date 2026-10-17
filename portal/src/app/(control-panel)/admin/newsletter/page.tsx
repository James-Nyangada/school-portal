'use client';

import { useEffect, useMemo, useState } from 'react';
import {
	Alert,
	Button,
	Chip,
	Dialog,
	DialogActions,
	DialogContent,
	DialogTitle,
	IconButton,
	LinearProgress,
	MenuItem,
	Paper,
	Tab,
	Table,
	TableBody,
	TableCell,
	TableContainer,
	TableHead,
	TableRow,
	Tabs,
	TextField,
	Tooltip,
	Typography,
	useMediaQuery,
	useTheme
} from '@mui/material';
import FusePageSimple from '@fuse/core/FusePageSimple';
import FuseSvgIcon from '@fuse/core/FuseSvgIcon';
import AuthGuardRedirect from '@auth/AuthGuardRedirect';
import useToast from '@/hooks/useToast';
import { StatCard } from '@/components/dashboard/StatCard';
import { backendRequest, useBackend } from '@/lib/finance';
import NewsletterEditor from '@/components/newsletter/NewsletterEditor';
import { EMPTY_DOC, NewsletterDoc } from '@/components/newsletter/extensions';
import {
	Audience,
	AUDIENCES,
	downloadNewsletterPdf,
	formatDateTime,
	needsClass,
	NewsletterFull,
	NewsletterRow,
	Recipient
} from '@/components/newsletter/api';

type Draft = {
	id: string | null;
	status: 'DRAFT' | 'SENT';
	subject: string;
	content: NewsletterDoc;
	isEmpty: boolean;
	audience: Audience;
	classId: string;
	recipients: number;
};

const NEW_DRAFT: Draft = {
	id: null,
	status: 'DRAFT',
	subject: '',
	content: EMPTY_DOC,
	isEmpty: true,
	audience: 'ALL_PARENTS',
	classId: '',
	recipients: 0
};

const ROLE_LABEL: Record<string, string> = { STUDENT: 'Student', TEACHER: 'Teacher', PARENT: 'Parent' };

const pct = (n: number, of: number) => (of ? Math.round((n / of) * 100) : 0);

export default function AdminNewsletter() {
	const { notify, confirm } = useToast();
	const theme = useTheme();
	const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));

	const list = useBackend<NewsletterRow[]>('/api/newsletters');
	const classes = useBackend<{ id: string; name: string; level: number | null }[]>('/api/classes');
	const token = list.token;
	const rows = list.data ?? [];

	const [draft, setDraft] = useState<Draft | null>(null);
	const [audienceSize, setAudienceSize] = useState<number | null>(null);
	const [busy, setBusy] = useState(false);
	const [recipientsOf, setRecipientsOf] = useState<NewsletterRow | null>(null);

	const sortedClasses = useMemo(
		() =>
			[...(classes.data ?? [])].sort(
				(a, b) => (a.level ?? Infinity) - (b.level ?? Infinity) || a.name.localeCompare(b.name)
			),
		[classes.data]
	);

	// Live recipient count for an unsent newsletter's audience
	useEffect(() => {
		if (!draft || draft.status === 'SENT' || !token) return;

		if (needsClass(draft.audience) && !draft.classId) {
			setAudienceSize(null);
			return;
		}

		let cancelled = false;
		const q = new URLSearchParams({
			audience: draft.audience,
			...(draft.classId ? { classId: draft.classId } : {})
		});
		backendRequest<{ count: number }>(token, `/api/newsletters/audience-size?${q}`)
			.then((r) => !cancelled && setAudienceSize(r.count))
			.catch(() => !cancelled && setAudienceSize(null));

		return () => {
			cancelled = true;
		};
	}, [draft?.audience, draft?.classId, draft?.status, token]);

	const sent = rows.filter((r) => r.status === 'SENT');
	const totalRecipients = sent.reduce((a, r) => a + r.recipients, 0);
	const totalOpened = sent.reduce((a, r) => a + r.opened, 0);

	const openNew = () => {
		setAudienceSize(null);
		setDraft({ ...NEW_DRAFT });
	};

	const openEdit = async (row: NewsletterRow) => {
		if (!token) return;

		try {
			const n = await backendRequest<NewsletterFull>(token, `/api/newsletters/${row.id}`);
			setAudienceSize(null);
			setDraft({
				id: n.id,
				status: n.status,
				subject: n.subject,
				content: n.content,
				isEmpty: false,
				audience: n.audience,
				classId: n.classId ?? '',
				recipients: row.recipients
			});
		} catch (e) {
			notify((e as Error).message, 'error');
		}
	};

	const save = async (send: boolean) => {
		if (!draft || !token) return;

		if (!draft.subject.trim()) return notify('Add a subject', 'warning');

		if (needsClass(draft.audience) && !draft.classId) return notify('Choose a class', 'warning');

		if ((send || draft.status === 'SENT') && draft.isEmpty) return notify('Write the newsletter first', 'warning');

		if (send) {
			const ok = await confirm(
				`Send "${draft.subject.trim()}" to ${audienceSize ?? 'the selected'} ${audienceSize === 1 ? 'person' : 'people'}? It will appear on their dashboard and Messages page.`,
				{ confirmText: 'Send' }
			);

			if (!ok) return;
		}

		setBusy(true);
		try {
			const payload = JSON.stringify({
				subject: draft.subject,
				content: draft.content,
				audience: draft.audience,
				classId: needsClass(draft.audience) ? draft.classId : null,
				send
			});
			const r = await backendRequest<{ sent: boolean; recipients?: number; edited?: boolean }>(
				token,
				draft.id ? `/api/newsletters/${draft.id}` : '/api/newsletters',
				{ method: draft.id ? 'PATCH' : 'POST', body: payload }
			);

			if (r.edited) notify('Newsletter updated for all its recipients', 'success');
			else if (r.sent)
				notify(`Newsletter sent to ${r.recipients} ${r.recipients === 1 ? 'person' : 'people'}`, 'success');
			else notify('Draft saved', 'success');

			setDraft(null);
		} catch (e) {
			notify((e as Error).message, 'error');
		} finally {
			setBusy(false);
			list.reload();
		}
	};

	const remove = async (row: NewsletterRow) => {
		if (!token) return;

		const ok = await confirm(
			row.status === 'SENT'
				? `Delete "${row.subject}"? It will be removed from the messages of all ${row.recipients} recipients.`
				: `Delete the draft "${row.subject}"?`,
			{ confirmText: 'Delete', destructive: true }
		);

		if (!ok) return;

		try {
			await backendRequest(token, `/api/newsletters/${row.id}`, { method: 'DELETE' });
			notify('Newsletter deleted', 'success');
			list.reload();
		} catch (e) {
			notify((e as Error).message, 'error');
		}
	};

	const download = async (row: NewsletterRow) => {
		if (!token) return;

		try {
			await downloadNewsletterPdf(token, row.id, row.subject);
		} catch (e) {
			notify((e as Error).message, 'error');
		}
	};

	return (
		<AuthGuardRedirect auth={['SUPER_ADMIN', 'ADMIN']}>
			<FusePageSimple
				content={
					<div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8">
						<div className="flex flex-wrap items-end justify-between gap-4">
							<div>
								<Typography className="text-3xl font-extrabold tracking-tight">Newsletters</Typography>
								<Typography className="mt-1 text-sm text-gray-500">
									Write newsletters for students, teachers or parents. They appear on each
									recipient&apos;s dashboard and Messages page, and can be downloaded as PDF.
								</Typography>
							</div>
							<Button
								variant="contained"
								color="secondary"
								className="rounded-full"
								startIcon={<FuseSvgIcon size={16}>lucide:plus</FuseSvgIcon>}
								onClick={openNew}
							>
								New newsletter
							</Button>
						</div>

						<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
							<StatCard
								icon="lucide:send"
								iconColor="text-blue-600"
								iconBg="bg-blue-50"
								label="Sent"
								value={sent.length}
								caption={<span>Newsletters delivered</span>}
							/>
							<StatCard
								icon="lucide:file-pen"
								iconColor="text-amber-600"
								iconBg="bg-amber-50"
								label="Drafts"
								value={rows.length - sent.length}
								caption={<span>Not sent yet</span>}
							/>
							<StatCard
								icon="lucide:users"
								iconColor="text-indigo-600"
								iconBg="bg-indigo-50"
								label="Recipients"
								value={totalRecipients}
								caption={<span>Across all sent newsletters</span>}
							/>
							<StatCard
								icon="lucide:mail-open"
								iconColor="text-green-600"
								iconBg="bg-green-50"
								label="Open rate"
								value={`${pct(totalOpened, totalRecipients)}%`}
								caption={
									<span>
										{totalOpened} of {totalRecipients} opened
									</span>
								}
							/>
						</div>

						<Paper className="overflow-hidden rounded-2xl shadow">
							<TableContainer>
								<Table>
									<TableHead>
										<TableRow>
											<TableCell className="font-semibold">Newsletter</TableCell>
											<TableCell className="font-semibold">Sent to</TableCell>
											<TableCell className="font-semibold">Status</TableCell>
											<TableCell className="font-semibold">Date</TableCell>
											<TableCell className="min-w-40 font-semibold">Opened</TableCell>
											<TableCell
												className="font-semibold"
												align="right"
											>
												Actions
											</TableCell>
										</TableRow>
									</TableHead>
									<TableBody>
										{rows.map((row) => {
											const rate = pct(row.opened, row.recipients);

											return (
												<TableRow
													key={row.id}
													hover
												>
													<TableCell className="max-w-sm">
														<Typography className="font-medium">{row.subject}</Typography>
														{row.preview && (
															<Typography className="truncate text-xs text-gray-500">
																{row.preview}
															</Typography>
														)}
													</TableCell>
													<TableCell>
														<Typography className="text-sm">{row.audienceLabel}</Typography>
														{row.status === 'SENT' && (
															<Typography className="text-xs text-gray-500">
																{row.recipients}{' '}
																{row.recipients === 1 ? 'person' : 'people'}
															</Typography>
														)}
													</TableCell>
													<TableCell>
														<div className="flex flex-wrap gap-1">
															<Chip
																size="small"
																variant="outlined"
																label={row.status === 'SENT' ? 'Sent' : 'Draft'}
																color={row.status === 'SENT' ? 'success' : 'warning'}
															/>
															{row.editedAt && (
																<Tooltip
																	title={`Edited ${formatDateTime(row.editedAt)}`}
																>
																	<Chip
																		size="small"
																		label="Edited"
																	/>
																</Tooltip>
															)}
														</div>
													</TableCell>
													<TableCell className="text-sm whitespace-nowrap">
														{formatDateTime(row.sentAt ?? row.updatedAt)}
														{row.sentBy && (
															<Typography className="text-xs text-gray-500">
																by {row.sentBy}
															</Typography>
														)}
													</TableCell>
													<TableCell>
														{row.status === 'SENT' ? (
															<button
																type="button"
																className="w-full text-left"
																onClick={() => setRecipientsOf(row)}
															>
																<div className="flex justify-between text-sm">
																	<span className="font-medium">
																		{row.opened} / {row.recipients}
																	</span>
																	<span className="text-gray-500">{rate}%</span>
																</div>
																<LinearProgress
																	variant="determinate"
																	value={rate}
																	color="success"
																	className="mt-1 h-1.5 rounded-full"
																/>
															</button>
														) : (
															<span className="text-sm text-gray-400">—</span>
														)}
													</TableCell>
													<TableCell
														align="right"
														className="whitespace-nowrap"
													>
														{row.status === 'SENT' && (
															<Tooltip title="Recipients">
																<IconButton
																	size="small"
																	onClick={() => setRecipientsOf(row)}
																>
																	<FuseSvgIcon size={18}>lucide:users</FuseSvgIcon>
																</IconButton>
															</Tooltip>
														)}
														<Tooltip title="Download PDF">
															<IconButton
																size="small"
																onClick={() => download(row)}
															>
																<FuseSvgIcon size={18}>lucide:file-down</FuseSvgIcon>
															</IconButton>
														</Tooltip>
														<Tooltip title="Edit">
															<IconButton
																size="small"
																onClick={() => openEdit(row)}
															>
																<FuseSvgIcon size={18}>lucide:pencil</FuseSvgIcon>
															</IconButton>
														</Tooltip>
														<Tooltip title="Delete">
															<IconButton
																size="small"
																color="error"
																onClick={() => remove(row)}
															>
																<FuseSvgIcon size={18}>lucide:trash-2</FuseSvgIcon>
															</IconButton>
														</Tooltip>
													</TableCell>
												</TableRow>
											);
										})}
										{rows.length === 0 && (
											<TableRow>
												<TableCell
													colSpan={6}
													align="center"
													className="py-16"
												>
													{list.loading ? (
														<span className="text-gray-500">Loading…</span>
													) : list.error ? (
														<span className="text-red-600">{list.error}</span>
													) : (
														<div className="flex flex-col items-center gap-2 text-gray-500">
															<FuseSvgIcon
																size={36}
																className="text-gray-400"
															>
																lucide:mail
															</FuseSvgIcon>
															No newsletters yet. Write your first one with New
															newsletter.
														</div>
													)}
												</TableCell>
											</TableRow>
										)}
									</TableBody>
								</Table>
							</TableContainer>
						</Paper>

						{/* Compose / edit */}
						<Dialog
							open={!!draft}
							onClose={() => !busy && setDraft(null)}
							fullWidth
							maxWidth="md"
							fullScreen={fullScreen}
						>
							{draft && (
								<>
									<DialogTitle>
										{!draft.id
											? 'New newsletter'
											: draft.status === 'SENT'
												? 'Edit sent newsletter'
												: 'Edit draft'}
									</DialogTitle>
									<DialogContent dividers>
										<div className="flex flex-col gap-4">
											{draft.status === 'SENT' && (
												<Alert severity="info">
													Changes appear straight away for all {draft.recipients} recipients,
													and the newsletter shows again on their dashboard as updated. Who it
													was sent to can&apos;t be changed.
												</Alert>
											)}
											<TextField
												label="Subject"
												value={draft.subject}
												onChange={(e) => setDraft({ ...draft, subject: e.target.value })}
												required
												fullWidth
												slotProps={{ htmlInput: { maxLength: 200 } }}
											/>
											<div className="flex flex-col gap-4 sm:flex-row">
												<TextField
													select
													label="Send to"
													value={draft.audience}
													onChange={(e) =>
														setDraft({ ...draft, audience: e.target.value as Audience })
													}
													disabled={draft.status === 'SENT'}
													className="sm:flex-1"
												>
													{AUDIENCES.map((a) => (
														<MenuItem
															key={a.value}
															value={a.value}
														>
															{a.label}
														</MenuItem>
													))}
												</TextField>
												{needsClass(draft.audience) && (
													<TextField
														select
														label="Class"
														value={draft.classId}
														onChange={(e) =>
															setDraft({ ...draft, classId: e.target.value })
														}
														disabled={draft.status === 'SENT'}
														className="sm:flex-1"
													>
														{sortedClasses.map((c) => (
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
											{draft.status === 'DRAFT' && audienceSize !== null && (
												<Typography
													className={`-mt-2 text-xs ${audienceSize === 0 ? 'text-red-600' : 'text-gray-500'}`}
												>
													{audienceSize === 0
														? 'Nobody is in this audience yet.'
														: `Will reach ${audienceSize} ${audienceSize === 1 ? 'person' : 'people'}.`}
												</Typography>
											)}
											<NewsletterEditor
												docKey={draft.id ?? 'new'}
												value={draft.content}
												onChange={(content, isEmpty) =>
													setDraft((d) => (d ? { ...d, content, isEmpty } : d))
												}
											/>
										</div>
									</DialogContent>
									<DialogActions className="px-6 py-3">
										<Button
											onClick={() => setDraft(null)}
											disabled={busy}
										>
											Cancel
										</Button>
										{draft.status === 'SENT' ? (
											<Button
												variant="contained"
												color="secondary"
												className="rounded-full"
												disabled={busy}
												onClick={() => save(false)}
											>
												Save changes
											</Button>
										) : (
											<>
												<Button
													variant="outlined"
													className="rounded-full"
													disabled={busy}
													onClick={() => save(false)}
												>
													Save draft
												</Button>
												<Button
													variant="contained"
													color="secondary"
													className="rounded-full"
													disabled={busy || audienceSize === 0}
													startIcon={<FuseSvgIcon size={16}>lucide:send</FuseSvgIcon>}
													onClick={() => save(true)}
												>
													Send now
												</Button>
											</>
										)}
									</DialogActions>
								</>
							)}
						</Dialog>

						<RecipientsDialog
							newsletter={recipientsOf}
							token={token}
							onClose={() => setRecipientsOf(null)}
						/>
					</div>
				}
			/>
		</AuthGuardRedirect>
	);
}

function RecipientsDialog({
	newsletter,
	token,
	onClose
}: {
	newsletter: NewsletterRow | null;
	token: string | undefined;
	onClose: () => void;
}) {
	const [recipients, setRecipients] = useState<Recipient[] | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [filter, setFilter] = useState<'all' | 'opened' | 'unopened'>('all');

	useEffect(() => {
		if (!newsletter || !token) return;

		setRecipients(null);
		setError(null);
		setFilter('all');
		backendRequest<Recipient[]>(token, `/api/newsletters/${newsletter.id}/recipients`)
			.then(setRecipients)
			.catch((e: Error) => setError(e.message));
	}, [newsletter, token]);

	const shown = (recipients ?? []).filter((r) =>
		filter === 'all' ? true : filter === 'opened' ? r.openedAt : !r.openedAt
	);
	const openedCount = (recipients ?? []).filter((r) => r.openedAt).length;

	return (
		<Dialog
			open={!!newsletter}
			onClose={onClose}
			fullWidth
			maxWidth="sm"
		>
			<DialogTitle>
				{newsletter?.subject}
				<Typography className="text-sm text-gray-500">{newsletter?.audienceLabel}</Typography>
			</DialogTitle>
			<Tabs
				value={filter}
				onChange={(_, v) => setFilter(v)}
				className="border-b px-4"
			>
				<Tab
					value="all"
					label={`All (${recipients?.length ?? 0})`}
				/>
				<Tab
					value="opened"
					label={`Opened (${openedCount})`}
				/>
				<Tab
					value="unopened"
					label={`Not opened (${(recipients?.length ?? 0) - openedCount})`}
				/>
			</Tabs>
			<DialogContent className="p-0">
				{error && <Typography className="p-6 text-red-600">{error}</Typography>}
				{!recipients && !error && <Typography className="p-6 text-gray-500">Loading…</Typography>}
				{recipients && (
					<Table size="small">
						<TableBody>
							{shown.map((r) => (
								<TableRow key={r.id}>
									<TableCell>
										<Typography className="text-sm font-medium">{r.name}</Typography>
										<Typography className="text-xs text-gray-500">
											{[ROLE_LABEL[r.role] ?? r.role, r.detail].filter(Boolean).join(' · ')}
										</Typography>
									</TableCell>
									<TableCell
										align="right"
										className="whitespace-nowrap"
									>
										{r.openedAt ? (
											<span className="text-xs text-green-700">
												Opened {formatDateTime(r.openedAt)}
											</span>
										) : (
											<span className="text-xs text-gray-400">Not opened</span>
										)}
									</TableCell>
								</TableRow>
							))}
							{shown.length === 0 && (
								<TableRow>
									<TableCell
										colSpan={2}
										align="center"
										className="py-8 text-gray-500"
									>
										Nobody here
									</TableCell>
								</TableRow>
							)}
						</TableBody>
					</Table>
				)}
			</DialogContent>
			<DialogActions className="px-6 py-3">
				<Button onClick={onClose}>Close</Button>
			</DialogActions>
		</Dialog>
	);
}
