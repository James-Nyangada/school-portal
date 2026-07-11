'use client';

import { useSession } from 'next-auth/react';
import { useEffect, useState, useMemo, useCallback } from 'react';
import {
	Box,
	Paper,
	Typography,
	Button,
	Chip,
	Dialog,
	DialogTitle,
	DialogContent,
	DialogActions,
	TextField,
	FormControl,
	FormLabel,
	RadioGroup,
	FormControlLabel,
	Radio,
	MenuItem,
	Select,
	InputLabel,
	CircularProgress,
	Alert,
	Divider,
	IconButton,
	List,
	ListItem,
	ListItemText,
	Collapse
} from '@mui/material';
import FusePageSimple from '@fuse/core/FusePageSimple';
import AuthGuardRedirect from '@auth/AuthGuardRedirect';
import FuseSvgIcon from '@fuse/core/FuseSvgIcon';
import { MaterialReactTable, useMaterialReactTable, type MRT_ColumnDef } from 'material-react-table';
import { useSnackbar } from 'notistack';

type Campaign = {
	id: string;
	createdAt: string;
	type: 'SMS' | 'EMAIL';
	targetAudience: string;
	subject?: string;
	message: string;
	recipientCount: number;
	status: string;
	sentBy: string;
	deliveryLog?: DeliveryEntry[];
};

type DeliveryEntry = {
	id: string;
	recipientName: string;
	recipientContact: string;
	status: string;
	deliveredAt?: string;
};

type ResolvedAudience = {
	count: number;
	preview: { name: string; contact: string }[];
};

const AUDIENCE_OPTIONS = [
	{ value: 'ALL_PARENTS', label: 'All Parents' },
	{ value: 'ALL_TEACHERS', label: 'All Teachers' },
	{ value: 'ALL_STUDENTS', label: 'All Students' },
	{ value: 'DEBTORS', label: 'Parents with Outstanding Balances (Debtors)' }
];

const audienceLabel = (val: string) => AUDIENCE_OPTIONS.find((o) => o.value === val)?.label ?? val;

const statusColor = (status: string) => {
	switch (status?.toUpperCase()) {
		case 'SENT':
		case 'DELIVERED':
			return 'success';
		case 'PENDING':
		case 'QUEUED':
			return 'warning';
		case 'FAILED':
			return 'error';
		case 'PARTIAL':
			return 'info';
		default:
			return 'default';
	}
};

export default function AdminCommunications() {
	const { data: session } = useSession();
	const token = (session as any)?.backendToken;
	const { enqueueSnackbar } = useSnackbar();

	// Campaign list state
	const [campaigns, setCampaigns] = useState<Campaign[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState(false);

	// Compose dialog state
	const [composeOpen, setComposeOpen] = useState(false);
	const [campaignType, setCampaignType] = useState<'SMS' | 'EMAIL'>('SMS');
	const [targetAudience, setTargetAudience] = useState('ALL_PARENTS');
	const [subject, setSubject] = useState('');
	const [message, setMessage] = useState('');
	const [sending, setSending] = useState(false);

	// Audience preview state
	const [resolvedAudience, setResolvedAudience] = useState<ResolvedAudience | null>(null);
	const [resolving, setResolving] = useState(false);

	// Detail view state
	const [detailCampaign, setDetailCampaign] = useState<Campaign | null>(null);
	const [detailOpen, setDetailOpen] = useState(false);

	const fetchCampaigns = useCallback(async () => {
		if (!token) return;

		setLoading(true);
		try {
			const res = await fetch(`http://localhost:4000/api/communications/campaigns?t=${Date.now()}`, {
				headers: {
					Authorization: `Bearer ${token}`,
					'Cache-Control': 'no-cache',
					Pragma: 'no-cache'
				}
			});

			if (!res.ok) throw new Error('Failed to fetch campaigns');

			const data = await res.json();
			setCampaigns(Array.isArray(data) ? data : (data.campaigns ?? []));
			setError(false);
		} catch {
			setError(true);
		} finally {
			setLoading(false);
		}
	}, [token]);

	useEffect(() => {
		fetchCampaigns();
	}, [fetchCampaigns]);

	// Resolve audience preview
	const handleResolveAudience = async () => {
		if (!token) return;

		setResolving(true);
		setResolvedAudience(null);
		try {
			const res = await fetch('http://localhost:4000/api/communications/resolve-audience', {
				method: 'POST',
				headers: {
					Authorization: `Bearer ${token}`,
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({ targetAudience })
			});

			if (!res.ok) throw new Error('Failed to resolve audience');

			const data = await res.json();
			setResolvedAudience(data);
		} catch {
			enqueueSnackbar('Failed to resolve audience', { variant: 'error' });
		} finally {
			setResolving(false);
		}
	};

	// Send campaign
	const handleSendCampaign = async () => {
		if (!message.trim()) {
			enqueueSnackbar('Message cannot be empty', { variant: 'warning' });
			return;
		}

		if (campaignType === 'EMAIL' && !subject.trim()) {
			enqueueSnackbar('Subject is required for email campaigns', { variant: 'warning' });
			return;
		}

		setSending(true);
		try {
			const payload: any = { type: campaignType, targetAudience, message };

			if (campaignType === 'EMAIL') payload.subject = subject;

			const res = await fetch('http://localhost:4000/api/communications/campaigns', {
				method: 'POST',
				headers: {
					Authorization: `Bearer ${token}`,
					'Content-Type': 'application/json'
				},
				body: JSON.stringify(payload)
			});

			if (!res.ok) throw new Error('Failed to send campaign');

			enqueueSnackbar('Campaign sent successfully!', { variant: 'success' });
			resetCompose();
			fetchCampaigns();
		} catch {
			enqueueSnackbar('Failed to send campaign', { variant: 'error' });
		} finally {
			setSending(false);
		}
	};

	const resetCompose = () => {
		setComposeOpen(false);
		setCampaignType('SMS');
		setTargetAudience('ALL_PARENTS');
		setSubject('');
		setMessage('');
		setResolvedAudience(null);
	};

	// Table columns
	const columns = useMemo<MRT_ColumnDef<Campaign>[]>(
		() => [
			{
				accessorKey: 'createdAt',
				header: 'Date',
				size: 150,
				Cell: ({ cell }) => {
					const val = cell.getValue<string>();
					return val
						? new Date(val).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
						: '—';
				}
			},
			{
				accessorKey: 'type',
				header: 'Type',
				size: 100,
				Cell: ({ cell }) => {
					const val = cell.getValue<string>();
					return (
						<Chip
							label={val}
							size="small"
							variant="filled"
							color={val === 'SMS' ? 'secondary' : 'primary'}
							icon={
								<FuseSvgIcon size={16}>
									{val === 'SMS' ? 'lucide:message-square' : 'lucide:mail'}
								</FuseSvgIcon>
							}
							sx={{ fontWeight: 600 }}
						/>
					);
				}
			},
			{
				accessorKey: 'targetAudience',
				header: 'Target Audience',
				size: 200,
				Cell: ({ cell }) => <Typography variant="body2">{audienceLabel(cell.getValue<string>())}</Typography>
			},
			{
				accessorKey: 'message',
				header: 'Message Preview',
				size: 250,
				Cell: ({ cell }) => {
					const val = cell.getValue<string>() ?? '';
					return (
						<Typography
							variant="body2"
							noWrap
							sx={{ maxWidth: 230, color: 'text.secondary' }}
						>
							{val.length > 80 ? `${val.slice(0, 80)}…` : val}
						</Typography>
					);
				}
			},
			{
				accessorKey: 'recipientCount',
				header: 'Recipients',
				size: 110,
				Cell: ({ cell }) => (
					<Chip
						label={cell.getValue<number>() ?? 0}
						size="small"
						variant="outlined"
					/>
				)
			},
			{
				accessorKey: 'status',
				header: 'Status',
				size: 120,
				Cell: ({ cell }) => {
					const val = cell.getValue<string>() ?? 'UNKNOWN';
					return (
						<Chip
							label={val}
							size="small"
							variant="filled"
							color={statusColor(val) as any}
							sx={{ fontWeight: 600, textTransform: 'capitalize' }}
						/>
					);
				}
			},
			{
				accessorKey: 'sentBy',
				header: 'Sent By',
				size: 150
			}
		],
		[]
	);

	const table = useMaterialReactTable({
		columns,
		data: campaigns,
		enableColumnActions: false,
		enableDensityToggle: false,
		enableFullScreenToggle: false,
		initialState: { density: 'comfortable', sorting: [{ id: 'createdAt', desc: true }] },
		muiTablePaperProps: {
			elevation: 0,
			sx: { borderRadius: 3, border: '1px solid', borderColor: 'divider' }
		},
		muiTableBodyRowProps: ({ row }) => ({
			onClick: () => {
				setDetailCampaign(row.original);
				setDetailOpen(true);
			},
			sx: { cursor: 'pointer', '&:hover': { backgroundColor: 'action.hover' } }
		}),
		renderEmptyRowsFallback: () => (
			<Box
				display="flex"
				flexDirection="column"
				alignItems="center"
				justifyContent="center"
				py={8}
				gap={2}
			>
				<FuseSvgIcon
					size={56}
					className="text-gray-300"
				>
					lucide:megaphone-off
				</FuseSvgIcon>
				<Typography color="text.secondary">No campaigns found</Typography>
			</Box>
		)
	});

	const renderContent = () => {
		if (loading) {
			return (
				<div className="flex min-h-[400px] items-center justify-center">
					<CircularProgress />
				</div>
			);
		}

		return (
			<div className="flex flex-col gap-32">
				{/* Header bar */}
				<div className="flex flex-wrap items-center justify-between gap-16">
					<div>
						<Typography
							className="text-4xl font-extrabold tracking-tight"
							sx={{
								background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
								WebkitBackgroundClip: 'text',
								WebkitTextFillColor: 'transparent'
							}}
						>
							Communications
						</Typography>
						<Typography
							variant="body2"
							color="text.secondary"
							className="mt-4"
						>
							Manage SMS &amp; email campaigns to parents, teachers, and students
						</Typography>
					</div>
					<Button
						variant="contained"
						size="large"
						startIcon={<FuseSvgIcon size={20}>lucide:plus</FuseSvgIcon>}
						onClick={() => setComposeOpen(true)}
						className="rounded-lg px-32 font-bold normal-case shadow-md hover:shadow-lg"
						sx={{
							background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
						}}
					>
						New Campaign
					</Button>
				</div>

				{error && (
					<Alert
						severity="warning"
						className="rounded-xl"
					>
						Could not load campaigns from the server. Please check your connection.
					</Alert>
				)}

				{/* Campaign history table */}
				<Paper className="bg-card flex flex-auto flex-col rounded-2xl p-24 shadow">
					<MaterialReactTable table={table} />
				</Paper>
			</div>
		);
	};

	return (
		<AuthGuardRedirect auth={['ADMIN', 'SUPER_ADMIN']}>
			<FusePageSimple
				content={
					<div className="mx-auto flex w-full max-w-7xl flex-col gap-32 px-24 py-32">
						{renderContent()}

						{/* ───── Compose Campaign Dialog ───── */}
						<Dialog
							open={composeOpen}
							onClose={resetCompose}
							maxWidth="sm"
							fullWidth
							PaperProps={{ sx: { borderRadius: 3 } }}
						>
							<DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, fontWeight: 700, pb: 1 }}>
								<FuseSvgIcon size={24}>lucide:send</FuseSvgIcon>
								New Campaign
							</DialogTitle>
							<Divider />
							<DialogContent className="flex flex-col gap-24 pt-24">
								{/* Type selector */}
								<FormControl component="fieldset">
									<FormLabel
										component="legend"
										className="mb-8 font-semibold"
									>
										Campaign Type
									</FormLabel>
									<RadioGroup
										row
										value={campaignType}
										onChange={(e) => setCampaignType(e.target.value as 'SMS' | 'EMAIL')}
									>
										<FormControlLabel
											value="SMS"
											control={<Radio />}
											label={
												<Box
													display="flex"
													alignItems="center"
													gap={0.5}
												>
													<FuseSvgIcon size={18}>lucide:message-square</FuseSvgIcon>
													SMS
												</Box>
											}
										/>
										<FormControlLabel
											value="EMAIL"
											control={<Radio />}
											label={
												<Box
													display="flex"
													alignItems="center"
													gap={0.5}
												>
													<FuseSvgIcon size={18}>lucide:mail</FuseSvgIcon>
													Email
												</Box>
											}
										/>
									</RadioGroup>
								</FormControl>

								{/* Target audience */}
								<FormControl fullWidth>
									<InputLabel>Target Audience</InputLabel>
									<Select
										value={targetAudience}
										label="Target Audience"
										onChange={(e) => {
											setTargetAudience(e.target.value);
											setResolvedAudience(null);
										}}
									>
										{AUDIENCE_OPTIONS.map((opt) => (
											<MenuItem
												key={opt.value}
												value={opt.value}
											>
												{opt.label}
											</MenuItem>
										))}
									</Select>
								</FormControl>

								{/* Subject (EMAIL only) */}
								<Collapse in={campaignType === 'EMAIL'}>
									<TextField
										label="Subject"
										fullWidth
										variant="outlined"
										value={subject}
										onChange={(e) => setSubject(e.target.value)}
									/>
								</Collapse>

								{/* Message */}
								<Box>
									<TextField
										label="Message"
										multiline
										rows={5}
										fullWidth
										variant="outlined"
										placeholder="Type your message here…"
										value={message}
										onChange={(e) => setMessage(e.target.value)}
									/>
									<Box
										display="flex"
										justifyContent="space-between"
										mt={0.5}
									>
										<Typography
											variant="caption"
											color={
												campaignType === 'SMS' && message.length > 160
													? 'error'
													: 'text.secondary'
											}
										>
											{message.length} character{message.length !== 1 ? 's' : ''}
											{campaignType === 'SMS' &&
												message.length > 160 &&
												' — exceeds 160 char SMS limit!'}
										</Typography>
										{campaignType === 'SMS' && (
											<Typography
												variant="caption"
												color="text.secondary"
											>
												{Math.ceil(message.length / 160) || 1} SMS segment
												{Math.ceil(message.length / 160) !== 1 ? 's' : ''}
											</Typography>
										)}
									</Box>
								</Box>

								{/* Preview Recipients */}
								<Box>
									<Button
										variant="outlined"
										size="small"
										onClick={handleResolveAudience}
										disabled={resolving}
										startIcon={
											resolving ? (
												<CircularProgress size={16} />
											) : (
												<FuseSvgIcon size={16}>lucide:users</FuseSvgIcon>
											)
										}
										className="rounded-lg normal-case"
									>
										Preview Recipients
									</Button>

									{resolvedAudience && (
										<Paper
											variant="outlined"
											className="mt-16 max-h-[200px] overflow-auto rounded-lg p-16"
										>
											<Typography
												variant="subtitle2"
												fontWeight={700}
												mb={1}
											>
												{resolvedAudience.count} recipient
												{resolvedAudience.count !== 1 ? 's' : ''} found
											</Typography>
											{resolvedAudience.preview?.length > 0 && (
												<List
													dense
													disablePadding
												>
													{resolvedAudience.preview.slice(0, 20).map((p, i) => (
														<ListItem
															key={i}
															disableGutters
															sx={{ py: 0.25 }}
														>
															<ListItemText
																primary={p.name}
																secondary={p.contact}
																primaryTypographyProps={{ variant: 'body2' }}
																secondaryTypographyProps={{ variant: 'caption' }}
															/>
														</ListItem>
													))}
													{resolvedAudience.count > 20 && (
														<Typography
															variant="caption"
															color="text.secondary"
															sx={{ mt: 1, display: 'block' }}
														>
															…and {resolvedAudience.count - 20} more
														</Typography>
													)}
												</List>
											)}
										</Paper>
									)}
								</Box>
							</DialogContent>
							<Divider />
							<DialogActions sx={{ px: 3, py: 2 }}>
								<Button
									onClick={resetCompose}
									color="inherit"
									className="normal-case"
								>
									Cancel
								</Button>
								<Button
									variant="contained"
									onClick={handleSendCampaign}
									disabled={sending || !message.trim()}
									startIcon={
										sending ? (
											<CircularProgress
												size={18}
												color="inherit"
											/>
										) : (
											<FuseSvgIcon size={18}>lucide:send</FuseSvgIcon>
										)
									}
									className="rounded-lg px-32 font-bold normal-case"
									sx={{
										background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
									}}
								>
									Send Campaign
								</Button>
							</DialogActions>
						</Dialog>

						{/* ───── Campaign Detail Dialog ───── */}
						<Dialog
							open={detailOpen}
							onClose={() => setDetailOpen(false)}
							maxWidth="md"
							fullWidth
							PaperProps={{ sx: { borderRadius: 3 } }}
						>
							{detailCampaign && (
								<>
									<DialogTitle
										sx={{
											display: 'flex',
											alignItems: 'center',
											justifyContent: 'space-between',
											fontWeight: 700
										}}
									>
										<Box
											display="flex"
											alignItems="center"
											gap={1}
										>
											<FuseSvgIcon size={24}>
												{detailCampaign.type === 'SMS'
													? 'lucide:message-square'
													: 'lucide:mail'}
											</FuseSvgIcon>
											Campaign Details
										</Box>
										<IconButton
											onClick={() => setDetailOpen(false)}
											size="small"
										>
											<FuseSvgIcon size={20}>lucide:x</FuseSvgIcon>
										</IconButton>
									</DialogTitle>
									<Divider />
									<DialogContent className="pt-24">
										<Box
											display="flex"
											flexDirection="column"
											gap={3}
										>
											{/* Meta info */}
											<Box
												display="flex"
												flexWrap="wrap"
												gap={2}
											>
												<Chip
													label={detailCampaign.type}
													color={detailCampaign.type === 'SMS' ? 'secondary' : 'primary'}
													variant="filled"
													size="small"
													sx={{ fontWeight: 600 }}
												/>
												<Chip
													label={detailCampaign.status}
													color={statusColor(detailCampaign.status) as any}
													variant="filled"
													size="small"
													sx={{ fontWeight: 600 }}
												/>
												<Chip
													label={`${detailCampaign.recipientCount} recipients`}
													variant="outlined"
													size="small"
												/>
												<Chip
													label={audienceLabel(detailCampaign.targetAudience)}
													variant="outlined"
													size="small"
													icon={<FuseSvgIcon size={14}>lucide:users</FuseSvgIcon>}
												/>
											</Box>

											<Box
												display="flex"
												gap={4}
												flexWrap="wrap"
											>
												<Box>
													<Typography
														variant="caption"
														color="text.secondary"
													>
														Date
													</Typography>
													<Typography
														variant="body2"
														fontWeight={600}
													>
														{new Date(detailCampaign.createdAt).toLocaleString()}
													</Typography>
												</Box>
												<Box>
													<Typography
														variant="caption"
														color="text.secondary"
													>
														Sent By
													</Typography>
													<Typography
														variant="body2"
														fontWeight={600}
													>
														{detailCampaign.sentBy}
													</Typography>
												</Box>
											</Box>

											{detailCampaign.subject && (
												<Box>
													<Typography
														variant="caption"
														color="text.secondary"
													>
														Subject
													</Typography>
													<Typography
														variant="body1"
														fontWeight={600}
													>
														{detailCampaign.subject}
													</Typography>
												</Box>
											)}

											{/* Full message */}
											<Paper
												variant="outlined"
												className="rounded-lg bg-gray-50 p-20 whitespace-pre-wrap"
											>
												<Typography
													variant="caption"
													color="text.secondary"
													fontWeight={600}
													display="block"
													mb={1}
												>
													Message
												</Typography>
												<Typography variant="body2">{detailCampaign.message}</Typography>
											</Paper>

											{/* Delivery log */}
											{detailCampaign.deliveryLog && detailCampaign.deliveryLog.length > 0 && (
												<Box>
													<Typography
														variant="subtitle2"
														fontWeight={700}
														mb={1}
													>
														Delivery Log
													</Typography>
													<Paper
														variant="outlined"
														className="overflow-hidden rounded-lg"
													>
														<Box sx={{ maxHeight: 300, overflow: 'auto' }}>
															<List
																dense
																disablePadding
															>
																{detailCampaign.deliveryLog.map((entry, i) => (
																	<ListItem
																		key={entry.id || i}
																		divider={
																			i < detailCampaign.deliveryLog!.length - 1
																		}
																		secondaryAction={
																			<Chip
																				label={entry.status}
																				size="small"
																				variant="filled"
																				color={statusColor(entry.status) as any}
																				sx={{ fontWeight: 600, fontSize: 11 }}
																			/>
																		}
																	>
																		<ListItemText
																			primary={entry.recipientName}
																			secondary={entry.recipientContact}
																			primaryTypographyProps={{
																				variant: 'body2',
																				fontWeight: 500
																			}}
																			secondaryTypographyProps={{
																				variant: 'caption'
																			}}
																		/>
																	</ListItem>
																))}
															</List>
														</Box>
													</Paper>
												</Box>
											)}
										</Box>
									</DialogContent>
								</>
							)}
						</Dialog>
					</div>
				}
			/>
		</AuthGuardRedirect>
	);
}
