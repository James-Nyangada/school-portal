'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Alert, Button, Chip, CircularProgress, Paper, Typography } from '@mui/material';
import FuseSvgIcon from '@fuse/core/FuseSvgIcon';
import useToast from '@/hooks/useToast';
import { backendRequest, formatKES, useBackend } from '@/lib/finance';

type Mismatch = {
	type: 'UNRESOLVED_PROMPT' | 'SUCCESS_NOT_CREDITED' | 'UNMATCHED_PAYBILL';
	reference: string;
	amount: number;
	studentId: string | null;
	detail: string;
};
type Run = {
	id: string;
	trigger: 'SCHEDULED' | 'MANUAL';
	startedAt: string;
	finishedAt: string | null;
	checked: number;
	recovered: number;
	failed: number;
	mismatches: Mismatch[];
	error: string | null;
};

const LABEL: Record<Mismatch['type'], string> = {
	UNRESOLVED_PROMPT: 'No result from Safaricom',
	SUCCESS_NOT_CREDITED: 'Paid but not credited',
	UNMATCHED_PAYBILL: 'Paybill: unknown account'
};

/**
 * M-Pesa reconciliation (school-dashboard-spec §3.3 step 9): runs nightly at 02:00; finance can also run it now.
 * Lost callbacks are credited automatically; what remains is listed here for review.
 */
export default function ReconciliationCard() {
	const { notify } = useToast();
	const { data, error, loading, reload, token } = useBackend<{ run: Run | null; configured: boolean }>(
		'/api/mpesa/reconciliation'
	);
	const [running, setRunning] = useState(false);
	const run = data?.run;

	const runNow = async () => {
		if (!token) return;

		setRunning(true);
		try {
			const r = await backendRequest<Run>(token, '/api/mpesa/reconcile', { method: 'POST' });
			notify(
				`Checked ${r.checked} prompt(s): ${r.recovered} recovered, ${r.mismatches.length} item(s) to review`,
				r.mismatches.length ? 'warning' : 'success'
			);
			reload();
		} catch (e) {
			notify((e as Error).message, 'error');
		} finally {
			setRunning(false);
		}
	};

	return (
		<Paper className="flex flex-col gap-4 rounded-2xl p-6 shadow-sm">
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div>
					<Typography className="text-lg font-bold">M-Pesa reconciliation</Typography>
					<Typography className="text-sm text-gray-500">
						{run
							? `Last run ${new Date(run.startedAt).toLocaleString()} (${run.trigger === 'SCHEDULED' ? 'nightly' : 'manual'})`
							: 'Runs every night at 02:00. Not run yet.'}
					</Typography>
				</div>
				<Button
					variant="outlined"
					disabled={running}
					onClick={runNow}
					startIcon={
						running ? (
							<CircularProgress size={16} />
						) : (
							<FuseSvgIcon size={16}>lucide:refresh-cw</FuseSvgIcon>
						)
					}
				>
					Run now
				</Button>
			</div>

			{error && <Alert severity="error">{error}</Alert>}
			{data && !data.configured && (
				<Alert severity="info">
					M-Pesa isn&apos;t configured, so pending prompts can&apos;t be checked with Safaricom.
				</Alert>
			)}
			{run?.error && <Alert severity="error">The last run stopped early: {run.error}</Alert>}

			{loading && !data ? (
				<CircularProgress size={24} />
			) : run ? (
				<>
					<div className="flex flex-wrap gap-2">
						<Chip
							size="small"
							label={`${run.checked} prompt(s) re-checked`}
						/>
						<Chip
							size="small"
							color="success"
							label={`${run.recovered} lost payment(s) credited`}
						/>
						<Chip
							size="small"
							label={`${run.failed} confirmed failed`}
						/>
						<Chip
							size="small"
							color={run.mismatches.length ? 'error' : 'success'}
							label={run.mismatches.length ? `${run.mismatches.length} to review` : 'Nothing to review'}
						/>
					</div>
					{run.mismatches.length > 0 && (
						<div className="flex max-h-80 flex-col divide-y divide-gray-100 overflow-y-auto">
							{run.mismatches.map((m) => (
								<div
									key={`${m.type}-${m.reference}`}
									className="flex flex-wrap items-start justify-between gap-2 py-2 text-sm"
								>
									<div className="min-w-0 flex-1">
										<div className="font-medium">
											{LABEL[m.type]} · {formatKES(m.amount)}
										</div>
										<div className="text-xs text-gray-500">{m.detail}</div>
									</div>
									{m.type === 'UNMATCHED_PAYBILL' ? (
										<Button
											size="small"
											component={Link}
											href="/finance/paybill-payments"
										>
											Assign
										</Button>
									) : (
										m.studentId && (
											<Button
												size="small"
												component={Link}
												href={`/finance/record-payment?studentId=${m.studentId}`}
											>
												Record
											</Button>
										)
									)}
								</div>
							))}
						</div>
					)}
				</>
			) : null}
		</Paper>
	);
}
