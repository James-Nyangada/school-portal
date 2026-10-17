'use client';
import { Controller, useForm } from 'react-hook-form';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import FormControl from '@mui/material/FormControl';
import FormControlLabel from '@mui/material/FormControlLabel';
import TextField from '@mui/material/TextField';
import Link from '@fuse/core/Link';
import Alert from '@mui/material/Alert';
import _ from 'lodash';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import FormLabel from '@mui/material/FormLabel';
import { signIn } from 'next-auth/react';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

type Role = 'STUDENT' | 'PARENT' | 'TEACHER' | 'ADMIN' | 'FINANCE';

interface SignInPageFormProps {
	selectedRole: Role;
}

/**
 * Dynamic Form Validation Schema based on role
 */
const createSchema = (role: Role) => {
	const parentIdentifierSchema = z
		.string()
		.min(1, 'Please enter your email or phone number')
		.refine(
			(val) => {
				const trimmed = val.trim();

				if (!trimmed) return false;

				const isEmail = z.string().email().safeParse(trimmed).success;

				if (isEmail) return true;

				const cleanPhone = trimmed.replace(/[\s\-()]/g, '');

				return /^\+?[0-9]{9,15}$/.test(cleanPhone);
			},
			{ message: 'Please enter a valid email address or phone number' }
		);

	return z.object({
		identifier:
			role === 'PARENT'
				? parentIdentifierSchema
				: z.string().email('You must enter a valid email').min(1, 'You must enter an email'),
		password: z.string().min(1, 'Please enter your password.'),
		remember: z.boolean().optional()
	});
};

const defaultValues = {
	identifier: '',
	password: '',
	remember: true
};

/** Keyed by the LoginError codes thrown in @auth/authJs authorize() */
const LOGIN_ERRORS: Record<string, string> = {
	invalid: 'Invalid credentials. Check your details and that the right role is selected.',
	locked: 'Account locked after too many failed attempts. Try again in 30 minutes or ask an admin to reset your password.',
	inactive: 'This account is not active. Contact school administration.',
	unavailable: 'Could not reach the server. Please try again shortly.'
};

function SignInPageForm({ selectedRole }: SignInPageFormProps) {
	const router = useRouter();
	const [loginError, setLoginError] = useState<string | null>(null);
	const [isLoading, setIsLoading] = useState(false);

	const schema = createSchema(selectedRole);
	type FormType = z.infer<typeof schema>;

	const { control, formState, handleSubmit, reset } = useForm<FormType>({
		mode: 'onChange',
		defaultValues,
		resolver: zodResolver(schema)
	});

	const { isValid, dirtyFields, errors } = formState;

	// Re-validate when role changes
	useEffect(() => {
		reset(defaultValues);
		setLoginError(null);
	}, [selectedRole, reset]);

	async function onSubmit(data: FormType) {
		setIsLoading(true);
		setLoginError(null);

		try {
			const result = await signIn('credentials', {
				redirect: false,
				identifier: data.identifier.trim(),
				password: data.password,
				role: selectedRole
			});

			if (result?.error) {
				setLoginError(LOGIN_ERRORS[result.code ?? ''] ?? LOGIN_ERRORS.invalid);
				setIsLoading(false);
			} else {
				// Determine dashboard route based on role
				const dashboardRoute = `/${selectedRole.toLowerCase()}/dashboard`;
				router.push(dashboardRoute);
			}
		} catch (_error) {
			setLoginError('An unexpected error occurred.');
			setIsLoading(false);
		}
	}

	const isParent = selectedRole === 'PARENT';

	return (
		<form
			name="loginForm"
			noValidate
			className="flex w-full flex-col justify-center gap-4"
			onSubmit={handleSubmit(onSubmit)}
		>
			{loginError && <Alert severity="error">{loginError}</Alert>}

			<Controller
				name="identifier"
				control={control}
				render={({ field }) => (
					<FormControl>
						<FormLabel htmlFor="identifier">
							{isParent ? 'Email or Phone number' : 'School Email'}
						</FormLabel>
						<TextField
							{...field}
							id="identifier"
							autoFocus
							type={isParent ? 'text' : 'email'}
							error={!!errors.identifier}
							helperText={errors?.identifier?.message as string}
							placeholder={
								isParent ? 'e.g. parent@example.com or 0712345678' : 'e.g. jdoe@schoolname.ac.ke'
							}
							required
							fullWidth
						/>
					</FormControl>
				)}
			/>

			<Controller
				name="password"
				control={control}
				render={({ field }) => (
					<FormControl>
						<FormLabel htmlFor="password">Password</FormLabel>
						<TextField
							{...field}
							type="password"
							error={!!errors.password}
							helperText={errors?.password?.message as string}
							required
							fullWidth
						/>
					</FormControl>
				)}
			/>

			<div className="flex flex-col items-center justify-center sm:flex-row sm:justify-between">
				<Controller
					name="remember"
					control={control}
					render={({ field }) => (
						<FormControl>
							<FormControlLabel
								label="Remember me"
								control={
									<Checkbox
										size="small"
										checked={field.value}
										onChange={field.onChange}
									/>
								}
							/>
						</FormControl>
					)}
				/>

				<Link
					className="text-md text-secondary-main font-medium hover:underline"
					to="/auth/forgot-password"
				>
					Forgot password?
				</Link>
			</div>

			<Button
				variant="contained"
				color="secondary"
				className="w-full shadow-lg transition-shadow hover:shadow-xl"
				aria-label="Sign in"
				disabled={_.isEmpty(dirtyFields) || !isValid || isLoading}
				type="submit"
				size="large"
				sx={{ mt: 2, py: 1.5, borderRadius: '8px', fontWeight: 'bold' }}
			>
				{isLoading ? 'Signing in...' : 'Sign in'}
			</Button>
		</form>
	);
}

export default SignInPageForm;
