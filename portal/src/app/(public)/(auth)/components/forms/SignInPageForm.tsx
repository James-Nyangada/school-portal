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
	return z.object({
		identifier:
			role === 'PARENT'
				? z.string().min(9, 'Please enter a valid phone number')
				: z.string().email('You must enter a valid email').nonempty('You must enter an email'),
		password: z.string().min(1, 'Please enter your password.'),
		remember: z.boolean().optional()
	});
};

const defaultValues = {
	identifier: '',
	password: '',
	remember: true
};

function SignInPageForm({ selectedRole }: SignInPageFormProps) {
	const router = useRouter();
	const [loginError, setLoginError] = useState<string | null>(null);
	const [isLoading, setIsLoading] = useState(false);

	const schema = createSchema(selectedRole);
	type FormType = z.infer<typeof schema>;

	const { control, formState, handleSubmit, reset, trigger } = useForm<FormType>({
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
				identifier: data.identifier,
				password: data.password,
				role: selectedRole
			});

			if (result?.error) {
				setLoginError('Invalid credentials');
				setIsLoading(false);
			} else {
				// Determine dashboard route based on role
				const dashboardRoute = `/${selectedRole.toLowerCase()}/dashboard`;
				router.push(dashboardRoute);
			}
		} catch (error) {
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
						<FormLabel htmlFor="identifier">{isParent ? 'Phone number' : 'School Email'}</FormLabel>
						<TextField
							{...field}
							autoFocus
							type={isParent ? 'tel' : 'email'}
							error={!!errors.identifier}
							helperText={errors?.identifier?.message as string}
							placeholder={isParent ? 'e.g. 0712345678' : 'e.g. jdoe@schoolname.ac.ke'}
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
