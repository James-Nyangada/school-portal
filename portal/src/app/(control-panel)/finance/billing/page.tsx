'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
	Alert,
	AlertTitle,
	Autocomplete,
	Button,
	Chip,
	CircularProgress,
	Divider,
	InputAdornment,
	MenuItem,
	Paper,
	TextField,
	ToggleButton,
	ToggleButtonGroup,
	Typography
} from '@mui/material';
import FusePageSimple from '@fuse/core/FusePageSimple';
import AuthGuardRedirect from '@auth/AuthGuardRedirect';
import FuseSvgIcon from '@fuse/core/FuseSvgIcon';
import authRoles from '@auth/authRoles';
import { CURRENCY, FeeRecordsResponse, FeeRow, backendRequest, formatKES, useBackend } from '@/lib/finance';

type ClassOption = { id: string; name: string; _count?: { students: number } };

const NOT_BILLABLE = ['COMPLETED', 'TRANSFERRED'];

export default function BillingPage() {
	const records = useBackend<FeeRecordsResponse>('/api/finance/records');
	const classes = useBackend<ClassOption[]>('/api/classes');

	const [target, setTarget] = useState<'class' | 'students'>('class');
	const [term, setTerm] = useState('');
	const [mode, setMode] = useState<'override' | 'revert'>('override');
	const [amount, setAmount] = useState('');
	const [reason, setReason] = useState('');
	const [classId, setClassId] = useState('');
	const [students, setStudents] = useState<FeeRow[]>([]);
	const [submitting, setSubmitting] = useState(false);
	const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

	useEffect(() => {
		if (records.data && !term) setTerm(records.data.currentTerm);
	}, [records.data, term]);

	const billable = useMemo(
		() => (records.data?.rows ?? []).filter((r) => !NOT_BILLABLE.includes(r.studentStatus)),
		[records.data]
	);

	const billableCountByClass = useMemo(() => {
		const map = new Map<string, number>();
		for (const r of billable) {
			if (r.classId) map.set(r.classId, (map.get(r.classId) ?? 0) + 1);
		}
		return map;
	}, [billable]);

	const selectedClassName = useMemo(() => {
		return classes.data?.find((c) => c.id === classId)?.name ?? '';
	}, [classes.data, classId]);

	const affected = target === 'class' ? billable.filter((r) => r.classId === classId).length : students.length;
	const amountValue = Number(amount);
	const valid = Boolean(
		term.trim() && affected > 0 && (mode === 'revert' || (amount !== '' && !isNaN(amountValue) && amountValue >= 0))
	);

	const submit = async () => {
		if (!records.token || !valid) return;

		setSubmitting(true);
		setResult(null);
		try {
			const res = await backendRequest<{
				billed: number;
				created: number;
				updated: number;
			}>(records.token, '/api/finance/billing', {
				method: 'POST',
				body: JSON.stringify({
					term: term.trim(),
					...(mode === 'revert'
						? { useStructure: true }
						: { amount: amountValue, reason: reason.trim() || undefined }),
					...(target === 'class' ? { classId } : { studentIds: students.map((s) => s.studentId) })
				})
			});
			setResult({
				ok: true,
				message:
					mode === 'revert'
						? `${res.updated} of ${res.billed} student(s) moved back to the fee structure for ${term.trim()}.`
						: `Set ${term.trim()} bill to ${formatKES(amountValue)} for ${res.billed} student(s). Fee structure changes will no longer affect them.`
			});

			if (target === 'students') {
				setStudents([]);
			}

			records.reload();
		} catch (e) {
			setResult({ ok: false, message: (e as Error).message });
		} finally {
			setSubmitting(false);
		}
	};

	const loadError = records.error || classes.error;

	return (
		<AuthGuardRedirect auth={authRoles.finance}>
			<FusePageSimple
				content={
					<div className="mx-auto flex w-full max-w-4xl flex-col gap-4 px-4 py-4 sm:px-6 sm:py-5">
						{/* Header */}
						<div className="flex flex-wrap items-end justify-between gap-3">
							<div>
								<Typography className="text-3xl leading-none font-extrabold tracking-tight text-gray-900">
									Bill Adjustments
								</Typography>
								<Typography className="mt-1 max-w-2xl text-sm text-gray-500">
									Override term bills for specific students (bursaries, discounts, special cases) or
									revert them back to the default class fee structure. Existing payments are
									preserved.
								</Typography>
							</div>
							<Button
								component={Link}
								href="/finance/fee-records"
								variant="outlined"
								color="inherit"
								className="border-gray-300 text-gray-700 hover:bg-gray-50"
								startIcon={<FuseSvgIcon size={18}>lucide:arrow-left</FuseSvgIcon>}
							>
								Fee records
							</Button>
						</div>

						<Paper className="flex flex-col gap-4 rounded-2xl border border-gray-100 p-4 shadow-sm sm:p-5">
							{/* Result & Error Alerts */}
							{result && (
								<Alert
									severity={result.ok ? 'success' : 'error'}
									onClose={() => setResult(null)}
									className="rounded-xl"
								>
									<AlertTitle>{result.ok ? 'Adjustment Applied' : 'Adjustment Failed'}</AlertTitle>
									{result.message}
								</Alert>
							)}
							{loadError && (
								<Alert
									severity="error"
									className="rounded-xl"
									action={
										<Button
											color="inherit"
											size="small"
											onClick={() => {
												records.reload();
												classes.reload();
											}}
										>
											Retry
										</Button>
									}
								>
									<AlertTitle>Error Loading Data</AlertTitle>
									{loadError}
								</Alert>
							)}

							{/* Step 1: Mode Selection */}
							<div className="flex flex-col gap-3">
								<Typography className="text-xs font-bold tracking-wider text-gray-500 uppercase">
									Adjustment Type
								</Typography>
								<div>
									<ToggleButtonGroup
										exclusive
										size="small"
										value={mode}
										onChange={(_, v) => v && setMode(v)}
										disabled={submitting}
										sx={{
											backgroundColor: (theme) =>
												theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.05)' : '#f1f5f9',
											p: '4px',
											borderRadius: '12px',
											border: 'none',
											display: 'inline-flex',
											width: { xs: '100%', sm: 'auto' },
											'& .MuiToggleButtonGroup-grouped': {
												border: 'none',
												borderRadius: '8px !important',
												mx: '2px',
												px: 2.5,
												py: 1,
												textTransform: 'none',
												fontWeight: 600,
												fontSize: '0.875rem',
												color: 'text.secondary',
												'&.Mui-selected': {
													backgroundColor: 'background.paper',
													color: 'text.primary',
													boxShadow:
														'0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px -1px rgba(0, 0, 0, 0.1)',
													'&:hover': {
														backgroundColor: 'background.paper'
													}
												},
												'&:hover': {
													backgroundColor: 'rgba(0, 0, 0, 0.04)'
												}
											}
										}}
									>
										<ToggleButton value="override">
											<FuseSvgIcon
												size={18}
												className="text-primary mr-2"
											>
												lucide:sliders-horizontal
											</FuseSvgIcon>
											Override amount
										</ToggleButton>
										<ToggleButton value="revert">
											<FuseSvgIcon
												size={18}
												className="mr-2 text-amber-600"
											>
												lucide:rotate-ccw
											</FuseSvgIcon>
											Revert to fee structure
										</ToggleButton>
									</ToggleButtonGroup>
								</div>

								{/* Contextual Guidance Banner */}
								{mode === 'override' ? (
									<div className="flex items-start gap-3 rounded-xl border border-blue-100 bg-blue-50/70 p-3 text-blue-900">
										<FuseSvgIcon
											size={18}
											className="mt-0.5 shrink-0 text-blue-600"
										>
											lucide:info
										</FuseSvgIcon>
										<Typography className="text-xs leading-relaxed text-blue-800">
											<strong className="font-semibold text-blue-950">Override billing: </strong>
											Sets a custom term fee for specific students (e.g. bursary, scholarship, or
											special agreement). Later changes to the class fee structure will{' '}
											<strong>not</strong> overwrite this amount.
										</Typography>
									</div>
								) : (
									<div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50/70 p-3 text-amber-900">
										<FuseSvgIcon
											size={18}
											className="mt-0.5 shrink-0 text-amber-600"
										>
											lucide:circle-alert
										</FuseSvgIcon>
										<Typography className="text-xs leading-relaxed text-amber-800">
											<strong className="font-semibold text-amber-950">
												Revert to standard structure:{' '}
											</strong>
											Removes manual fee overrides and recalculates term bills from the class fee
											structure. Existing student payments are preserved.
										</Typography>
									</div>
								)}
							</div>

							<Divider />

							{/* Step 2: Term and Fee details */}
							<div className="flex flex-col gap-3">
								<Typography className="text-xs font-bold tracking-wider text-gray-500 uppercase">
									Term & Fee Details
								</Typography>

								<div
									className={mode === 'override' ? 'grid grid-cols-1 gap-4 sm:grid-cols-2' : 'w-full'}
								>
									<Autocomplete
										freeSolo
										options={records.data?.terms ?? []}
										inputValue={term}
										onInputChange={(_, v) => setTerm(v)}
										disabled={submitting}
										renderInput={(params) => (
											<TextField
												{...params}
												label="Academic Term"
												placeholder="e.g. Term 3 2026"
												helperText="Pick an active term or type a custom term name"
											/>
										)}
									/>

									{mode === 'override' && (
										<TextField
											type="number"
											label="Fee per student"
											placeholder="0"
											value={amount}
											onChange={(e) => setAmount(e.target.value)}
											disabled={submitting}
											error={amount !== '' && amountValue < 0}
											helperText={
												amount !== '' && amountValue < 0
													? 'Amount cannot be negative'
													: 'The override fee to bill each student for this term'
											}
											slotProps={{
												input: {
													startAdornment: (
														<InputAdornment position="start">
															<span className="font-semibold text-gray-700">
																{CURRENCY}
															</span>
														</InputAdornment>
													)
												},
												htmlInput: { min: 0, step: 'any' }
											}}
										/>
									)}
								</div>

								{mode === 'override' && (
									<TextField
										label="Reason for adjustment"
										placeholder="e.g. 50% County bursary, staff child discount, scholarship"
										value={reason}
										onChange={(e) => setReason(e.target.value)}
										disabled={submitting}
										helperText="Optional note recorded in the audit trail for financial accountability"
									/>
								)}
							</div>

							<Divider />

							{/* Step 3: Target Scope */}
							<div className="flex flex-col gap-3">
								<div className="flex flex-col gap-2">
									<Typography className="text-xs font-bold tracking-wider text-gray-500 uppercase">
										Apply Adjustment To
									</Typography>
									<div>
										<ToggleButtonGroup
											exclusive
											size="small"
											value={target}
											onChange={(_, v) => v && setTarget(v)}
											disabled={submitting}
											sx={{
												backgroundColor: (theme) =>
													theme.palette.mode === 'dark'
														? 'rgba(255,255,255,0.05)'
														: '#f1f5f9',
												p: '4px',
												borderRadius: '12px',
												border: 'none',
												display: 'inline-flex',
												width: { xs: '100%', sm: 'auto' },
												'& .MuiToggleButtonGroup-grouped': {
													border: 'none',
													borderRadius: '8px !important',
													mx: '2px',
													px: 2.5,
													py: 1,
													textTransform: 'none',
													fontWeight: 600,
													fontSize: '0.875rem',
													color: 'text.secondary',
													'&.Mui-selected': {
														backgroundColor: 'background.paper',
														color: 'text.primary',
														boxShadow:
															'0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px -1px rgba(0, 0, 0, 0.1)',
														'&:hover': {
															backgroundColor: 'background.paper'
														}
													},
													'&:hover': {
														backgroundColor: 'rgba(0, 0, 0, 0.04)'
													}
												}
											}}
										>
											<ToggleButton value="class">
												<FuseSvgIcon
													size={18}
													className="mr-2"
												>
													lucide:users
												</FuseSvgIcon>
												Whole class
											</ToggleButton>
											<ToggleButton value="students">
												<FuseSvgIcon
													size={18}
													className="mr-2"
												>
													lucide:user-check
												</FuseSvgIcon>
												Selected students
											</ToggleButton>
										</ToggleButtonGroup>
									</div>
								</div>

								{target === 'class' ? (
									<TextField
										select
										label="Class"
										value={classId}
										onChange={(e) => setClassId(e.target.value)}
										disabled={submitting || classes.loading}
										helperText={
											classId
												? `${affected} billable student${affected === 1 ? '' : 's'} in ${selectedClassName || 'this class'} will receive this adjustment`
												: 'Select a class to adjust all billable students enrolled in it'
										}
									>
										{(classes.data ?? []).map((c) => {
											const count = billableCountByClass.get(c.id) ?? c._count?.students ?? 0;
											return (
												<MenuItem
													key={c.id}
													value={c.id}
													className="flex items-center justify-between py-2.5"
												>
													<span className="font-medium text-gray-900">{c.name}</span>
													<Chip
														size="small"
														label={`${count} student${count === 1 ? '' : 's'}`}
														variant="outlined"
														className="ml-3 text-xs text-gray-600"
													/>
												</MenuItem>
											);
										})}
									</TextField>
								) : (
									<Autocomplete<FeeRow, true>
										multiple
										options={billable}
										value={students}
										onChange={(_, v) => setStudents(v)}
										loading={records.loading}
										disabled={submitting}
										getOptionLabel={(s) =>
											[s.studentName, s.admissionNumber, s.className].filter(Boolean).join(' · ')
										}
										isOptionEqualToValue={(a, b) => a.studentId === b.studentId}
										renderTags={(tagValue, getTagProps) =>
											tagValue.map((option, index) => {
												const { key, ...tagProps } = getTagProps({ index });
												return (
													<Chip
														key={key ?? option.studentId}
														label={`${option.studentName} (${option.className || 'No class'})`}
														size="small"
														{...tagProps}
													/>
												);
											})
										}
										renderOption={(props, s) => {
											const { key, ...otherProps } = props;
											return (
												<li
													key={key ?? s.studentId}
													{...otherProps}
												>
													<div className="flex w-full items-center justify-between gap-4 py-1">
														<div>
															<div className="font-medium text-gray-900">
																{s.studentName}
															</div>
															<div className="text-xs text-gray-500">
																{[s.admissionNumber, s.className]
																	.filter(Boolean)
																	.join(' · ')}
															</div>
														</div>
														{s.balance > 0 && (
															<div className="text-right">
																<span className="text-xs text-gray-400">Balance: </span>
																<span className="text-xs font-semibold text-red-600">
																	{formatKES(s.balance)}
																</span>
															</div>
														)}
													</div>
												</li>
											);
										}}
										renderInput={(params) => (
											<TextField
												{...params}
												label="Specific Students"
												placeholder="Search by student name or admission number..."
												helperText={
													students.length > 0
														? `${students.length} student${students.length === 1 ? '' : 's'} selected`
														: 'Search and select one or more individual students to adjust'
												}
											/>
										)}
									/>
								)}
							</div>

							{/* Step 4: Live Impact Summary & Action Footer */}
							<div className="rounded-xl border border-gray-200 bg-gray-50/70 p-3 sm:p-4">
								<div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
									<div className="flex items-start gap-3">
										<div
											className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
												!valid
													? 'bg-gray-200/80 text-gray-500'
													: mode === 'revert'
														? 'bg-amber-100 text-amber-700'
														: 'bg-emerald-100 text-emerald-700'
											}`}
										>
											<FuseSvgIcon size={22}>
												{!valid
													? 'lucide:calculator'
													: mode === 'revert'
														? 'lucide:rotate-ccw'
														: 'lucide:circle-check'}
											</FuseSvgIcon>
										</div>
										<div className="flex flex-col gap-0.5">
											{!valid ? (
												<>
													<Typography className="text-sm font-semibold text-gray-800">
														{mode === 'revert'
															? 'Select a term and class or students to revert'
															: 'Choose a term, amount, and target students'}
													</Typography>
													<Typography className="text-xs text-gray-500">
														{mode === 'revert'
															? 'Fee overrides will be removed for the selected students.'
															: 'A summary of the total billing impact will appear once required fields are filled.'}
													</Typography>
												</>
											) : mode === 'revert' ? (
												<>
													<Typography className="text-sm font-semibold text-gray-900">
														Revert{' '}
														<span className="font-bold text-amber-700">{affected}</span>{' '}
														student
														{affected === 1 ? '' : 's'} to standard fee structure
													</Typography>
													<Typography className="text-xs text-gray-500">
														Term:{' '}
														<strong className="font-semibold text-gray-700">
															{term.trim()}
														</strong>
														{target === 'class' && selectedClassName
															? ` · Class: ${selectedClassName}`
															: ''}
														{' · '}Bills will be recalculated using published fee structure
													</Typography>
												</>
											) : (
												<>
													<Typography className="text-sm font-semibold text-gray-900">
														{affected} student{affected === 1 ? '' : 's'} ×{' '}
														{formatKES(amountValue)} ={' '}
														<span className="font-bold text-emerald-700">
															{formatKES(affected * amountValue)}
														</span>
													</Typography>
													<Typography className="text-xs text-gray-500">
														Term:{' '}
														<strong className="font-semibold text-gray-700">
															{term.trim()}
														</strong>
														{target === 'class' && selectedClassName
															? ` · Class: ${selectedClassName}`
															: ''}
														{reason ? ` · Reason: "${reason.trim()}"` : ''}
													</Typography>
												</>
											)}
										</div>
									</div>

									<Button
										variant="contained"
										color={mode === 'revert' ? 'warning' : 'secondary'}
										size="large"
										onClick={submit}
										disabled={!valid || submitting}
										className="shrink-0 px-6 py-2.5 font-semibold shadow-sm"
										startIcon={
											submitting ? (
												<CircularProgress
													size={18}
													color="inherit"
												/>
											) : (
												<FuseSvgIcon size={18}>
													{mode === 'revert' ? 'lucide:rotate-ccw' : 'lucide:file-plus'}
												</FuseSvgIcon>
											)
										}
									>
										{mode === 'revert' ? 'Revert bills' : 'Apply override'}
									</Button>
								</div>
							</div>
						</Paper>
					</div>
				}
			/>
		</AuthGuardRedirect>
	);
}
