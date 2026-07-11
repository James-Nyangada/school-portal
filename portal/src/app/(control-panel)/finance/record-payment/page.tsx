'use client';

import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Typography, Paper, TextField, MenuItem, Button, CircularProgress, Alert, InputAdornment } from '@mui/material';
import FusePageSimple from '@fuse/core/FusePageSimple';
import AuthGuardRedirect from '@auth/AuthGuardRedirect';
import authRoles from '@auth/authRoles';
import FuseSvgIcon from '@fuse/core/FuseSvgIcon';

const paymentSchema = z.object({
	studentId: z.string().min(1, 'Please select a student'),
	amount: z.coerce.number().positive('Amount must be positive'),
	method: z.enum(['CASH', 'BANK']),
	receiptNumber: z.string().min(1, 'Receipt number is required')
});

type PaymentFormData = z.infer<typeof paymentSchema>;

export default function RecordPaymentPage() {
	const { data: session } = useSession();
	const token = (session as any)?.backendToken;

	const [submitStatus, setSubmitStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
	const [errorMessage, setErrorMessage] = useState('');

	// Mock list of students - in a real app, this would be fetched from the backend
	const mockStudents = [
		{ id: 'student-1', name: 'Alice Johnson (Grade 10)' },
		{ id: 'student-2', name: 'Bob Smith (Grade 11)' },
		{ id: 'student-3', name: 'Charlie Davis (Grade 9)' },
		{ id: 'student-4', name: 'Diana Prince (Grade 12)' }
	];

	const {
		control,
		handleSubmit,
		reset,
		formState: { errors }
	} = useForm<PaymentFormData>({
		resolver: zodResolver(paymentSchema),
		defaultValues: {
			studentId: '',
			amount: 0,
			method: 'CASH',
			receiptNumber: ''
		}
	});

	const onSubmit = async (data: PaymentFormData) => {
		if (!token) return;

		setSubmitStatus('loading');

		try {
			const response = await fetch('http://localhost:4000/api/fees/manual-payment', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${token}`
				},
				body: JSON.stringify(data)
			});

			if (!response.ok) {
				throw new Error('Failed to record payment');
			}

			setSubmitStatus('success');
			reset(); // clear form

			// hide success message after 3 seconds
			setTimeout(() => setSubmitStatus('idle'), 3000);
		} catch (err: any) {
			console.error(err);
			setErrorMessage(err.message || 'An error occurred while submitting payment');
			setSubmitStatus('error');
		}
	};

	const renderContent = () => (
		<>
			<Typography className="text-4xl font-extrabold tracking-tight">Record Manual Payment</Typography>

			<Paper className="bg-card mt-32 flex flex-auto flex-col rounded-2xl p-24 shadow">
				{submitStatus === 'success' && (
					<Alert
						severity="success"
						className="mb-24"
					>
						Payment recorded successfully!
					</Alert>
				)}

				{submitStatus === 'error' && (
					<Alert
						severity="error"
						className="mb-24"
					>
						{errorMessage}
					</Alert>
				)}

				<form
					onSubmit={handleSubmit(onSubmit)}
					className="flex flex-col gap-24"
				>
					<Controller
						name="studentId"
						control={control}
						render={({ field }) => (
							<TextField
								{...field}
								select
								label="Student"
								fullWidth
								error={!!errors.studentId}
								helperText={errors.studentId?.message}
								disabled={submitStatus === 'loading'}
							>
								{mockStudents.map((option) => (
									<MenuItem
										key={option.id}
										value={option.id}
									>
										{option.name}
									</MenuItem>
								))}
							</TextField>
						)}
					/>

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
								disabled={submitStatus === 'loading'}
								slotProps={{
									input: {
										startAdornment: <InputAdornment position="start">$</InputAdornment>
									}
								}}
							/>
						)}
					/>

					<Controller
						name="method"
						control={control}
						render={({ field }) => (
							<TextField
								{...field}
								select
								label="Payment Method"
								fullWidth
								error={!!errors.method}
								helperText={errors.method?.message}
								disabled={submitStatus === 'loading'}
							>
								<MenuItem value="CASH">Cash</MenuItem>
								<MenuItem value="BANK">Bank Transfer</MenuItem>
							</TextField>
						)}
					/>

					<Controller
						name="receiptNumber"
						control={control}
						render={({ field }) => (
							<TextField
								{...field}
								label="Receipt / Reference Number"
								fullWidth
								error={!!errors.receiptNumber}
								helperText={errors.receiptNumber?.message}
								disabled={submitStatus === 'loading'}
							/>
						)}
					/>

					<div className="mt-16 flex justify-end">
						<Button
							type="submit"
							variant="contained"
							color="secondary"
							size="large"
							disabled={submitStatus === 'loading'}
							startIcon={
								submitStatus === 'loading' ? (
									<CircularProgress size={20} />
								) : (
									<FuseSvgIcon>lucide:save</FuseSvgIcon>
								)
							}
						>
							Record Payment
						</Button>
					</div>
				</form>
			</Paper>
		</>
	);

	return (
		<AuthGuardRedirect auth={authRoles.finance}>
			<FusePageSimple
				content={
					<div className="mx-auto flex w-full max-w-7xl flex-col gap-32 px-24 py-32">{renderContent()}</div>
				}
			/>
		</AuthGuardRedirect>
	);
}
