'use client';

import { useState } from 'react';
import { Alert, Button, Chip, CircularProgress, LinearProgress, Paper, Typography } from '@mui/material';
import FuseSvgIcon from '@fuse/core/FuseSvgIcon';
import { FeeStatement, PAYMENT_METHOD_LABELS, downloadStatementPdf, formatDate, formatKES } from '@/lib/finance';

/** What's locked or open because of fees, and what it takes to unlock. */
export function FeeLockStatus({ statement, payHref }: { statement: FeeStatement; payHref?: string }) {
	const { grades, timetable } = statement.access;
	const locked = [
		['Grades & report cards', grades],
		['Timetable', timetable]
	] as const;
	const anyLocked = locked.some(([, a]) => !a.allowed);
	const needed = Math.max(...locked.map(([, a]) => a.amountNeeded));
	const a = timetable;

	return (
		<Alert
			severity={anyLocked ? 'warning' : 'success'}
			icon={<FuseSvgIcon size={20}>{anyLocked ? 'lucide:lock' : 'lucide:lock-open'}</FuseSvgIcon>}
			action={
				anyLocked && payHref ? (
					<Button
						color="inherit"
						size="small"
						href={payHref}
					>
						Pay now
					</Button>
				) : undefined
			}
		>
			{anyLocked ? (
				<>
					<strong>Some school records are locked until fees are paid.</strong>{' '}
					{a.arrears > 0 && (
						<>The {formatKES(a.arrears)} carried over from previous terms must be cleared first. </>
					)}
					{a.threshold < 100 && a.currentTermBilled > 0 && (
						<>Then at least {a.threshold}% of this term&apos;s fees. </>
					)}
					Pay <strong>{formatKES(needed)}</strong> more to unlock.
					<div className="mt-2 flex flex-wrap gap-2">
						{locked.map(([label, acc]) => (
							<Chip
								key={label}
								size="small"
								label={`${label}: ${acc.allowed ? 'open' : 'locked'}`}
								color={acc.allowed ? 'success' : 'default'}
								variant={acc.allowed ? 'filled' : 'outlined'}
							/>
						))}
					</div>
				</>
			) : (
				'Fees are up to date — grades, report cards and the timetable are all available.'
			)}
		</Alert>
	);
}

export default function FeeStatementView({ statement, token }: { statement: FeeStatement; token: string }) {
	const [downloading, setDownloading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const owed = Math.max(0, statement.balance);
	const credit = Math.max(0, -statement.balance);
	const percentPaid =
		statement.totalBilled > 0 ? Math.min(100, (statement.totalPaid / statement.totalBilled) * 100) : 100;

	const download = async () => {
		setDownloading(true);
		setError(null);
		try {
			await downloadStatementPdf(
				token,
				statement.student.id,
				statement.student.admissionNumber || statement.student.name
			);
		} catch (e) {
			setError((e as Error).message);
		} finally {
			setDownloading(false);
		}
	};

	return (
		<Paper className="flex flex-col gap-5 rounded-2xl p-6 shadow-sm">
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div>
					<Typography className="text-lg font-bold">Fee statement</Typography>
					<Typography className="text-sm text-gray-500">
						{statement.student.name}
						{statement.student.className ? ` · ${statement.student.className}` : ''} ·{' '}
						{statement.currentTerm}
					</Typography>
				</div>
				<Button
					variant="outlined"
					size="small"
					onClick={download}
					disabled={downloading}
					startIcon={
						downloading ? (
							<CircularProgress size={16} />
						) : (
							<FuseSvgIcon size={16}>lucide:file-down</FuseSvgIcon>
						)
					}
				>
					Download PDF
				</Button>
			</div>
			{error && <Alert severity="error">{error}</Alert>}

			<div className="grid grid-cols-3 gap-3 text-center">
				<div className="rounded-xl bg-slate-50 p-3">
					<Typography className="text-xs text-gray-500 uppercase">Total billed</Typography>
					<Typography className="font-bold">{formatKES(statement.totalBilled)}</Typography>
				</div>
				<div className="rounded-xl bg-green-50 p-3">
					<Typography className="text-xs text-gray-500 uppercase">Cleared</Typography>
					<Typography className="font-bold text-green-700">{formatKES(statement.totalPaid)}</Typography>
				</div>
				<div className={`rounded-xl p-3 ${credit > 0 ? 'bg-blue-50' : 'bg-red-50'}`}>
					<Typography className="text-xs text-gray-500 uppercase">
						{credit > 0 ? 'Credit' : 'Remaining'}
					</Typography>
					<Typography
						className={`font-bold ${credit > 0 ? 'text-blue-700' : owed > 0 ? 'text-red-600' : ''}`}
					>
						{formatKES(credit > 0 ? credit : owed)}
					</Typography>
				</div>
			</div>

			<div>
				<div className="mb-1 flex justify-between text-xs font-bold text-slate-500">
					<span>FEES CLEARED</span>
					<span>{Math.round(percentPaid)}%</span>
				</div>
				<LinearProgress
					variant="determinate"
					value={percentPaid}
					className="h-2 rounded-full"
					color={percentPaid >= 100 ? 'success' : percentPaid >= 50 ? 'primary' : 'warning'}
				/>
			</div>

			{statement.pendingBankClaims > 0 && (
				<Alert severity="info">
					{formatKES(statement.pendingBankClaims)} in bank payments is awaiting verification and isn&apos;t
					included yet.
				</Alert>
			)}

			<div className="flex flex-col gap-4">
				{statement.terms.length === 0 && (
					<Typography className="text-sm text-gray-500">No fees have been billed yet.</Typography>
				)}
				{[...statement.terms].reverse().map((t, i) => (
					<div
						key={`${t.term}-${i}`}
						className="rounded-xl border border-gray-100 p-4"
					>
						<div className="mb-2 flex flex-wrap items-center justify-between gap-2">
							<Typography className="font-semibold">
								{t.term}
								{t.term === statement.currentTerm && (
									<Chip
										size="small"
										label="Current"
										className="ml-2"
									/>
								)}
							</Typography>
							<Chip
								size="small"
								color={t.carriedForward > 0 ? 'error' : 'success'}
								variant="outlined"
								label={
									t.carriedForward > 0
										? `${formatKES(t.carriedForward)} outstanding`
										: t.carriedForward < 0
											? `${formatKES(-t.carriedForward)} credit`
											: 'Cleared'
								}
							/>
						</div>
						<div className="flex flex-col text-sm">
							{t.broughtForward !== 0 && (
								<div className="flex justify-between py-1 text-gray-500">
									<span>
										{t.broughtForward > 0 ? 'Balance brought forward' : 'Credit brought forward'}
									</span>
									<span>{formatKES(Math.abs(t.broughtForward))}</span>
								</div>
							)}
							{t.items.map((item) => (
								<div
									key={item.name}
									className="flex justify-between py-1 pl-3"
								>
									<span>{item.name}</span>
									<span>{formatKES(item.amount)}</span>
								</div>
							))}
							<div className="flex justify-between border-t border-gray-100 py-1 font-semibold">
								<span>Term fees</span>
								<span>{formatKES(t.billed)}</span>
							</div>
							<div className="flex justify-between py-1 text-green-700">
								<span>Paid towards this term</span>
								<span>{formatKES(t.paid)}</span>
							</div>
						</div>
					</div>
				))}
			</div>

			<div>
				<Typography className="mb-2 font-semibold">Payments received</Typography>
				{statement.payments.length === 0 ? (
					<Typography className="text-sm text-gray-500">No payments yet.</Typography>
				) : (
					[...statement.payments].reverse().map((p) => (
						<div
							key={p.id}
							className="flex justify-between gap-4 border-b border-gray-100 py-2 text-sm"
						>
							<span>
								{formatDate(p.date)} · {PAYMENT_METHOD_LABELS[p.method]}
								{p.receiptNumber && <span className="text-gray-500"> · {p.receiptNumber}</span>}
							</span>
							<span className="font-semibold text-green-600">{formatKES(p.amount)}</span>
						</div>
					))
				)}
				<Typography className="mt-3 text-xs text-gray-500">
					Payments clear the oldest balance first. Anything unpaid is carried forward to the next term until
					it is cleared.
				</Typography>
			</div>
		</Paper>
	);
}
