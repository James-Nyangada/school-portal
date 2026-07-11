'use client';

import { useSession, signOut } from 'next-auth/react';
import { useState } from 'react';
import { Paper, Typography, TextField, Button, Alert } from '@mui/material';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';

const schema = z
	.object({
		password: z.string().min(6, 'Password must be at least 6 characters long'),
		confirmPassword: z.string().min(6, 'Please confirm your password')
	})
	.refine((data) => data.password === data.confirmPassword, {
		message: "Passwords don't match",
		path: ['confirmPassword']
	});

type FormType = z.infer<typeof schema>;

export default function SetupPassword() {
	const { data: session, update } = useSession();
	const token = (session as any)?.backendToken;
	const [error, setError] = useState<string | null>(null);
	const [success, setSuccess] = useState(false);
	const [isLoading, setIsLoading] = useState(false);

	const {
		control,
		handleSubmit,
		formState: { errors }
	} = useForm<FormType>({
		resolver: zodResolver(schema),
		defaultValues: { password: '', confirmPassword: '' }
	});

	const onSubmit = async (data: FormType) => {
		setIsLoading(true);
		setError(null);
		try {
			const res = await fetch('http://localhost:4000/api/auth/password/change-password', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${token}`
				},
				body: JSON.stringify({ newPassword: data.password })
			});

			if (res.ok) {
				setSuccess(true);
				// Force session update or redirect
				setTimeout(async () => {
					await update({ status: 'ACTIVE' }); // refresh session status from PENDING_ACTIVATION to ACTIVE
					const role = (session?.user as any)?.role;
					let dashboardRole = 'student';

					if (role === 'SUPER_ADMIN') dashboardRole = 'superadmin';
					else if (role === 'ADMIN') dashboardRole = 'admin';
					else if (role === 'TEACHER') dashboardRole = 'teacher';
					else if (role === 'FINANCE') dashboardRole = 'finance';
					else if (role === 'PARENT') dashboardRole = 'parent';
					else if (role === 'STUDENT') dashboardRole = 'student';

					window.location.href = `/${dashboardRole}/dashboard`;
				}, 1500);
			} else {
				const errData = await res.json();
				setError(errData.error || 'Failed to update password');
			}
		} catch (e: any) {
			setError('An unexpected error occurred.');
		} finally {
			setIsLoading(false);
		}
	};

	return (
		<div className="flex min-h-screen flex-col items-center justify-center bg-slate-100 p-6">
			<Paper
				sx={{ p: 4, maxWidth: 450, width: '100%', borderRadius: 3 }}
				elevation={3}
			>
				<Typography
					variant="h5"
					fontWeight="bold"
					textAlign="center"
					gutterBottom
				>
					Setup Your Account
				</Typography>
				<Typography
					variant="body2"
					color="textSecondary"
					textAlign="center"
					mb={3}
				>
					This is your first login. For security reasons, you must change your temporary password before
					proceeding.
				</Typography>

				{error && (
					<Alert
						severity="error"
						sx={{ mb: 2 }}
					>
						{error}
					</Alert>
				)}
				{success && (
					<Alert
						severity="success"
						sx={{ mb: 2 }}
					>
						Password changed successfully! Redirecting...
					</Alert>
				)}

				<form
					onSubmit={handleSubmit(onSubmit)}
					className="flex flex-col gap-4"
				>
					<Controller
						name="password"
						control={control}
						render={({ field }) => (
							<TextField
								{...field}
								label="New Password"
								type="password"
								error={!!errors.password}
								helperText={errors.password?.message}
								fullWidth
								required
							/>
						)}
					/>
					<Controller
						name="confirmPassword"
						control={control}
						render={({ field }) => (
							<TextField
								{...field}
								label="Confirm New Password"
								type="password"
								error={!!errors.confirmPassword}
								helperText={errors.confirmPassword?.message}
								fullWidth
								required
							/>
						)}
					/>
					<Button
						type="submit"
						variant="contained"
						color="primary"
						fullWidth
						size="large"
						disabled={isLoading || success}
						sx={{ mt: 2 }}
					>
						{isLoading ? 'Updating Password...' : 'Save & Continue'}
					</Button>

					<Button
						variant="text"
						color="error"
						fullWidth
						onClick={() => signOut({ callbackUrl: '/sign-in' })}
					>
						Sign Out
					</Button>
				</form>
			</Paper>
		</div>
	);
}
