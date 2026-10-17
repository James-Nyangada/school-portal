'use client';

import Link from 'next/link';
import { Suspense, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
	Alert,
	Autocomplete,
	Button,
	CircularProgress,
	InputAdornment,
	MenuItem,
	Paper,
	TextField,
	Typography
} from '@mui/material';
import FusePageSimple from '@fuse/core/FusePageSimple';
import AuthGuardRedirect from '@auth/AuthGuardRedirect';
import authRoles from '@auth/authRoles';
import FuseSvgIcon from '@fuse/core/FuseSvgIcon';
import {
	CURRENCY,
	FeeRecordsResponse,
	FeeRow,
	PAYMENT_METHOD_LABELS,
	backendRequest,
	formatKES,
	useBackend
} from '@/lib/finance';

const paymentSchema = z.object({
	studentId: z.string().min(1, 'Please select a student'),
	amount: z.coerce.number().positive('Amount must be more than zero'),
	method: z.enum(['CASH', 'BANK', 'MPESA']),
	receiptNumber: z.string().trim().min(1, 'Receipt / reference number is required')
});

type PaymentFormData = z.infer<typeof paymentSchema>;

const referenceHint: Record<PaymentFormData['method'], string> = {
	CASH: 'Number on the school receipt book',
	BANK: 'Bank slip or transfer reference',
	MPESA: 'M-Pesa confirmation code, e.g. QJK3XXXXXX'
};

function RecordPaymentForm() {
	const preselectedId = useSearchParams()?.get('studentId') ?? '';
	const { data, error: loadError, loading, reload, token } = useBackend<FeeRecordsResponse>('/api/finance/records');
	const students = useMemo(() => data?.rows ?? [], [data]);

	const [submitting, setSubmitting] = useState(false);
	const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

	const {
		control,
		handleSubmit,
		reset,
		watch,
		setValue,
		formState: { errors }
	} = useForm<PaymentFormData>({
		resolver: zodResolver(paymentSchema),
		defaultValues: {
			studentId: preselectedId,
			amount: '' as unknown as number,
			method: 'CASH',
			receiptNumber: ''
		}
	});

	const studentId = watch('studentId');
	const method = watch('method');
	const selectedStudent = useMemo(
		() => students.find((s) => s.studentId === studentId) ?? null,
		[students, studentId]
	);

	const onSubmit = async (form: PaymentFormData) => {
		if (!token) return;

		setSubmitting(true);
		setResult(null);
		try {
			await backendRequest(token, '/api/fees/manual-payment', { method: 'POST', body: JSON.stringify(form) });
			const name = selectedStudent?.studentName ?? 'the student';
			setResult({
				ok: true,
				message: `Recorded ${formatKES(form.amount)} for ${name}. It clears the oldest balance first.`
			});
			reset({
				studentId: '',
				amount: '' as unknown as number,
				method: form.method,
				receiptNumber: ''
			});
			reload(); // refresh balances
		} catch (e) {
			setResult({ ok: false, message: (e as Error).message });
		} finally {
			setSubmitting(false);
		}
	};

	return (
		<div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
			<Paper className="rounded-2xl p-6 shadow-sm lg:col-span-2">
				{result && (
					<Alert
						severity={result.ok ? 'success' : 'error'}
						className="mb-6"
						onClose={() => setResult(null)}
					>
						{result.message}
					</Alert>
				)}
				{loadError && (
					<Alert
						severity="error"
						className="mb-6"
						action={<Button onClick={reload}>Retry</Button>}
					>
						Couldn't load students: {loadError}
					</Alert>
				)}

				<form
					onSubmit={handleSubmit(onSubmit)}
					className="flex flex-col gap-5"
					noValidate
				>
					<Controller
						name="studentId"
						control={control}
						render={({ field }) => (
							<Autocomplete<FeeRow>
								options={students}
								loading={loading}
								value={selectedStudent}
								onChange={(_, v) => field.onChange(v?.studentId ?? '')}
								getOptionLabel={(s) =>
									[s.studentName, s.admissionNumber, s.className].filter(Boolean).join(' · ')
								}
								isOptionEqualToValue={(a, b) => a.studentId === b.studentId}
								renderOption={(props, s) => (
									<li
										{...props}
										key={s.studentId}
									>
										<div className="flex w-full items-center justify-between gap-4">
											<span>
												{s.studentName}
												<span className="text-gray-500">
													{' '}
													{[s.admissionNumber, s.className].filter(Boolean).join(' · ')}
												</span>
											</span>
											{s.balance > 0 && (
												<span className="text-sm font-semibold text-red-600">
													{formatKES(s.balance)}
												</span>
											)}
										</div>
									</li>
								)}
								disabled={submitting}
								renderInput={(params) => (
									<TextField
										{...params}
										label="Student"
										placeholder="Search by name or admission number"
										error={!!errors.studentId}
										helperText={errors.studentId?.message}
									/>
								)}
							/>
						)}
					/>

					<div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
						<Controller
							name="amount"
							control={control}
							render={({ field }) => (
								<TextField
									{...field}
									type="number"
									label="Amount"
									fullWidth
									error={!!errors.amount}
									helperText={errors.amount?.message}
									disabled={submitting}
									slotProps={{
										input: {
											startAdornment: <InputAdornment position="start">{CURRENCY}</InputAdornment>
										},
										htmlInput: { min: 1, step: 'any' }
									}}
								/>
							)}
						/>

						<Typography className="self-center text-sm text-gray-500">
							Payments clear the oldest outstanding term first; any balance left carries forward.
						</Typography>
					</div>

					<div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
						<Controller
							name="method"
							control={control}
							render={({ field }) => (
								<TextField
									{...field}
									select
									label="Payment method"
									fullWidth
									disabled={submitting}
								>
									{Object.entries(PAYMENT_METHOD_LABELS).map(([value, label]) => (
										<MenuItem
											key={value}
											value={value}
										>
											{label}
										</MenuItem>
									))}
								</TextField>
							)}
						/>

						<Controller
							name="receiptNumber"
							control={control}
							render={({ field }) => (
								<TextField
									{...field}
									label="Receipt / reference number"
									fullWidth
									error={!!errors.receiptNumber}
									helperText={errors.receiptNumber?.message ?? referenceHint[method]}
									disabled={submitting}
								/>
							)}
						/>
					</div>

					<div className="flex justify-end">
						<Button
							type="submit"
							variant="contained"
							color="secondary"
							size="large"
							disabled={submitting || !data}
							startIcon={
								submitting ? (
									<CircularProgress size={18} />
								) : (
									<FuseSvgIcon size={18}>lucide:save</FuseSvgIcon>
								)
							}
						>
							Record payment
						</Button>
					</div>
				</form>
			</Paper>

			<Paper className="flex flex-col gap-4 self-start rounded-2xl p-6 shadow-sm">
				<Typography className="text-lg font-semibold">Student balance</Typography>
				{selectedStudent ? (
					<>
						<div>
							<Typography className="font-semibold">{selectedStudent.studentName}</Typography>
							<Typography className="text-sm text-gray-500">
								{[selectedStudent.admissionNumber, selectedStudent.className]
									.filter(Boolean)
									.join(' · ') || '—'}
							</Typography>
						</div>
						<div className="flex flex-col gap-2 text-sm">
							<div className="flex justify-between">
								<span className="text-gray-500">Total billed</span>
								<span>{formatKES(selectedStudent.totalBilled)}</span>
							</div>
							<div className="flex justify-between">
								<span className="text-gray-500">Total paid</span>
								<span className="text-green-600">{formatKES(selectedStudent.amountPaid)}</span>
							</div>
							<div className="flex justify-between border-t border-gray-100 pt-2 font-bold">
								<span>Balance</span>
								<span className={selectedStudent.balance > 0 ? 'text-red-600' : ''}>
									{formatKES(Math.max(0, selectedStudent.balance))}
								</span>
							</div>
						</div>
						{selectedStudent.balance > 0 && (
							<Button
								variant="outlined"
								size="small"
								onClick={() => setValue('amount', selectedStudent.balance, { shouldValidate: true })}
							>
								Pay full balance
							</Button>
						)}
					</>
				) : (
					<Typography className="text-sm text-gray-500">Select a student to see what they owe.</Typography>
				)}
			</Paper>
		</div>
	);
}

export default function RecordPaymentPage() {
	return (
		<AuthGuardRedirect auth={authRoles.finance}>
			<FusePageSimple
				content={
					<div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8">
						<div className="flex flex-wrap items-end justify-between gap-4">
							<div>
								<Typography className="text-3xl font-extrabold tracking-tight">
									Record Payment
								</Typography>
								<Typography className="mt-1 text-sm text-gray-500">
									Log cash, bank or M-Pesa payments received outside the portal.
								</Typography>
							</div>
							<Button
								component={Link}
								href="/finance/fee-records"
								startIcon={<FuseSvgIcon size={18}>lucide:arrow-left</FuseSvgIcon>}
							>
								Fee records
							</Button>
						</div>
						<Suspense fallback={<CircularProgress />}>
							<RecordPaymentForm />
						</Suspense>
					</div>
				}
			/>
		</AuthGuardRedirect>
	);
}
