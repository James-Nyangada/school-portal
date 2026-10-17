'use client';

import { useMemo, type ReactNode } from 'react';
import { useSnackbar, type SnackbarKey } from 'notistack';
import IconButton from '@mui/material/IconButton';
import FuseSvgIcon from '@fuse/core/FuseSvgIcon';
import type { ConfirmToastOptions, PromptToastOptions } from '@/components/toast/InteractiveToasts';

type NotifyVariant = 'default' | 'success' | 'error' | 'warning' | 'info';

type NotifyOptions = {
	/** Keep the toast open until the user dismisses it (e.g. when it shows a temporary password). */
	persist?: boolean;
};

/**
 * Toast-based replacements for window.alert / confirm / prompt.
 *
 *   const { notify, confirm, prompt } = useToast();
 *   notify('Saved', 'success');
 *   if (!(await confirm('Delete this class?', { destructive: true }))) return;
 *   const name = await prompt('Name of the block', { required: true }); // null when cancelled
 */
export default function useToast() {
	const { enqueueSnackbar, closeSnackbar } = useSnackbar();

	return useMemo(() => {
		const dismissAction = (key: SnackbarKey) => (
			<IconButton
				size="small"
				color="inherit"
				aria-label="Dismiss"
				onClick={() => closeSnackbar(key)}
			>
				<FuseSvgIcon size={18}>lucide:x</FuseSvgIcon>
			</IconButton>
		);

		const notify = (message: ReactNode, variant: NotifyVariant = 'default', options: NotifyOptions = {}) =>
			enqueueSnackbar(message, {
				variant,
				persist: options.persist,
				action: options.persist ? dismissAction : undefined
			});

		const confirm = (message: ReactNode, options: ConfirmToastOptions = {}) =>
			new Promise<boolean>((resolve) => {
				enqueueSnackbar(message, {
					...options,
					variant: 'confirm',
					persist: true,
					onResolve: resolve,
					// Closed without a button press (e.g. closeSnackbar()) counts as cancel.
					onClose: () => resolve(false)
				});
			});

		const prompt = (message: ReactNode, options: PromptToastOptions = {}) =>
			new Promise<string | null>((resolve) => {
				enqueueSnackbar(message, {
					...options,
					variant: 'prompt',
					persist: true,
					onResolve: resolve,
					onClose: () => resolve(null)
				});
			});

		return { notify, confirm, prompt };
	}, [enqueueSnackbar, closeSnackbar]);
}
