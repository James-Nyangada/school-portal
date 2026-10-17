'use client';

import { forwardRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { SnackbarContent, useSnackbar, type CustomContentProps } from 'notistack';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import Stack from '@mui/material/Stack';

export type ConfirmToastOptions = {
	title?: ReactNode;
	confirmText?: string;
	cancelText?: string;
	/** Renders the confirm button in the error colour, for deletes and other irreversible actions. */
	destructive?: boolean;
};

export type PromptToastOptions = {
	title?: ReactNode;
	label?: string;
	placeholder?: string;
	defaultValue?: string;
	type?: 'text' | 'password' | 'email' | 'number';
	multiline?: boolean;
	/** When true, the submit button stays disabled until something is typed. */
	required?: boolean;
	confirmText?: string;
	cancelText?: string;
};

declare module 'notistack' {
	interface VariantOverrides {
		confirm: ConfirmToastOptions & { onResolve: (value: boolean) => void };
		prompt: PromptToastOptions & { onResolve: (value: string | null) => void };
	}
}

const paperSx = {
	width: { xs: 'calc(100vw - 32px)', sm: 380 },
	p: 2,
	borderRadius: 2
} as const;

type ConfirmToastProps = CustomContentProps & ConfirmToastOptions & { onResolve: (value: boolean) => void };

export const ConfirmToast = forwardRef<HTMLDivElement, ConfirmToastProps>((props, ref) => {
	const { id, message, title, confirmText = 'Confirm', cancelText = 'Cancel', destructive, onResolve } = props;
	const { closeSnackbar } = useSnackbar();

	const finish = (value: boolean) => {
		onResolve(value);
		closeSnackbar(id);
	};

	const handleKeyDown = (e: KeyboardEvent) => {
		if (e.key === 'Escape') finish(false);
	};

	return (
		<SnackbarContent
			ref={ref}
			role="alertdialog"
		>
			<Paper
				elevation={8}
				sx={paperSx}
				onKeyDown={handleKeyDown}
			>
				{title && (
					<Typography
						variant="subtitle1"
						fontWeight={600}
						mb={0.5}
					>
						{title}
					</Typography>
				)}
				<Typography variant="body2">{message}</Typography>
				<Stack
					direction="row"
					justifyContent="flex-end"
					spacing={1}
					mt={2}
				>
					<Button
						size="small"
						onClick={() => finish(false)}
					>
						{cancelText}
					</Button>
					<Button
						size="small"
						variant="contained"
						color={destructive ? 'error' : 'secondary'}
						onClick={() => finish(true)}
						autoFocus
					>
						{confirmText}
					</Button>
				</Stack>
			</Paper>
		</SnackbarContent>
	);
});

ConfirmToast.displayName = 'ConfirmToast';

type PromptToastProps = CustomContentProps & PromptToastOptions & { onResolve: (value: string | null) => void };

export const PromptToast = forwardRef<HTMLDivElement, PromptToastProps>((props, ref) => {
	const {
		id,
		message,
		title,
		label,
		placeholder,
		defaultValue = '',
		type = 'text',
		multiline,
		required,
		confirmText = 'OK',
		cancelText = 'Cancel',
		onResolve
	} = props;
	const { closeSnackbar } = useSnackbar();
	const [value, setValue] = useState(defaultValue);
	const canSubmit = !required || value.trim() !== '';

	const finish = (result: string | null) => {
		onResolve(result);
		closeSnackbar(id);
	};

	const handleKeyDown = (e: KeyboardEvent) => {
		if (e.key === 'Escape') finish(null);
	};

	return (
		<SnackbarContent
			ref={ref}
			role="dialog"
		>
			<Paper
				elevation={8}
				sx={paperSx}
				component="form"
				onKeyDown={handleKeyDown}
				onSubmit={(e) => {
					e.preventDefault();

					if (canSubmit) finish(value);
				}}
			>
				{title && (
					<Typography
						variant="subtitle1"
						fontWeight={600}
						mb={0.5}
					>
						{title}
					</Typography>
				)}
				<Typography
					variant="body2"
					mb={1.5}
				>
					{message}
				</Typography>
				<TextField
					size="small"
					fullWidth
					autoFocus
					type={type}
					label={label}
					placeholder={placeholder}
					multiline={multiline}
					minRows={multiline ? 2 : undefined}
					value={value}
					onChange={(e) => setValue(e.target.value)}
					onKeyDown={(e) => {
						// Ctrl/Cmd+Enter submits a multiline field; plain Enter adds a newline.
						if (multiline && e.key === 'Enter' && (e.ctrlKey || e.metaKey) && canSubmit) {
							e.preventDefault();
							finish(value);
						}
					}}
				/>
				<Stack
					direction="row"
					justifyContent="flex-end"
					spacing={1}
					mt={2}
				>
					<Button
						size="small"
						onClick={() => finish(null)}
					>
						{cancelText}
					</Button>
					<Button
						size="small"
						type="submit"
						variant="contained"
						color="secondary"
						disabled={!canSubmit}
					>
						{confirmText}
					</Button>
				</Stack>
			</Paper>
		</SnackbarContent>
	);
});

PromptToast.displayName = 'PromptToast';
