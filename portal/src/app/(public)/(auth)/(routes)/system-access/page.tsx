'use client';

import { useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import Paper from '@mui/material/Paper';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import Alert from '@mui/material/Alert';
import Typography from '@mui/material/Typography';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import AuthGuardRedirect from '@auth/AuthGuardRedirect';
import authRoles from '@auth/authRoles';

const schema = z.object({
	email: z.string().email('Please enter a valid work email').nonempty('Email is required'),
	password: z.string().min(1, 'Password is required'),
	// 2FA Code (Optional/Placeholder for future TOTP verification)
	totpCode: z.string().optional()
});

type FormType = z.infer<typeof schema>;

function SuperAdminLoginPage() {
	const router = useRouter();
	const [loginError, setLoginError] = useState<string | null>(null);
	const [isLoading, setIsLoading] = useState(false);

	const { control, formState, handleSubmit } = useForm<FormType>({
		mode: 'onChange',
		defaultValues: { email: '', password: '', totpCode: '' },
		resolver: zodResolver(schema)
	});

	const { isValid, errors } = formState;

	async function onSubmit(data: FormType) {
		setIsLoading(true);
		setLoginError(null);

		try {
			const result = await signIn('credentials', {
				redirect: false,
				identifier: data.email,
				password: data.password,
				role: 'SUPER_ADMIN'
			});

			if (result?.error) {
				setLoginError('Access denied. Invalid system credentials.');
				setIsLoading(false);
			} else {
				router.push('/superadmin/dashboard');
			}
		} catch (error) {
			setLoginError('An unexpected network error occurred.');
			setIsLoading(false);
		}
	}

	return (
		<AuthGuardRedirect auth={authRoles.onlyGuest}>
			<div className="flex min-h-screen min-w-0 flex-auto flex-col items-center justify-center bg-slate-950 p-6">
				<Paper className="w-full max-w-md border border-slate-800 bg-slate-900/50 p-8 text-white backdrop-blur-md sm:rounded-2xl sm:p-12 sm:shadow-2xl">
					<div className="flex w-full flex-col gap-6">
						<div className="text-center">
							<Typography className="text-xl font-bold tracking-wider text-cyan-400 uppercase">
								SYSTEM ACCESS
							</Typography>
							<Typography className="mt-1 text-xs text-slate-400">
								Authorized Personnel Only — Super Admin Portal
							</Typography>
						</div>

						{loginError && (
							<Alert
								severity="error"
								className="border border-red-900 bg-red-950/80 text-red-200"
							>
								{loginError}
							</Alert>
						)}

						<form
							noValidate
							onSubmit={handleSubmit(onSubmit)}
							className="flex flex-col gap-4"
						>
							<Controller
								name="email"
								control={control}
								render={({ field }) => (
									<TextField
										{...field}
										label="Work Email"
										type="email"
										error={!!errors.email}
										helperText={errors?.email?.message}
										fullWidth
										required
										variant="outlined"
										InputLabelProps={{ style: { color: '#94a3b8' } }}
										inputProps={{ style: { color: '#f8fafc' } }}
										sx={{
											'& .MuiOutlinedInput-root': {
												'& fieldset': { borderColor: '#334155' },
												'&:hover fieldset': { borderColor: '#475569' },
												'&.Mui-focused fieldset': { borderColor: '#06b6d4' }
											}
										}}
									/>
								)}
							/>

							<Controller
								name="password"
								control={control}
								render={({ field }) => (
									<TextField
										{...field}
										label="System Password"
										type="password"
										error={!!errors.password}
										helperText={errors?.password?.message}
										fullWidth
										required
										variant="outlined"
										InputLabelProps={{ style: { color: '#94a3b8' } }}
										inputProps={{ style: { color: '#f8fafc' } }}
										sx={{
											'& .MuiOutlinedInput-root': {
												'& fieldset': { borderColor: '#334155' },
												'&:hover fieldset': { borderColor: '#475569' },
												'&.Mui-focused fieldset': { borderColor: '#06b6d4' }
											}
										}}
									/>
								)}
							/>

							<Controller
								name="totpCode"
								control={control}
								render={({ field }) => (
									<TextField
										{...field}
										label="2FA TOTP Token (Optional/Future)"
										placeholder="e.g. 123456"
										fullWidth
										variant="outlined"
										InputLabelProps={{ style: { color: '#94a3b8' } }}
										inputProps={{ style: { color: '#f8fafc' } }}
										sx={{
											'& .MuiOutlinedInput-root': {
												'& fieldset': { borderColor: '#334155' },
												'&:hover fieldset': { borderColor: '#475569' },
												'&.Mui-focused fieldset': { borderColor: '#06b6d4' }
											}
										}}
									/>
								)}
							/>

							<Button
								variant="contained"
								disabled={!isValid || isLoading}
								type="submit"
								size="large"
								className="mt-4 w-full bg-cyan-600 font-bold text-white hover:bg-cyan-500"
								sx={{
									py: 1.5,
									borderRadius: '8px',
									backgroundColor: '#0891b2',
									'&:hover': { backgroundColor: '#06b6d4' }
								}}
							>
								{isLoading ? 'Verifying Credentials...' : 'Authenticate'}
							</Button>
						</form>
					</div>
				</Paper>
			</div>
		</AuthGuardRedirect>
	);
}

export default SuperAdminLoginPage;
