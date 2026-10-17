'use client';

import { useEffect, useState } from 'react';
import { Alert, Button, Chip, CircularProgress, MenuItem, Paper, TextField, Typography } from '@mui/material';
import FusePageSimple from '@fuse/core/FusePageSimple';
import AuthGuardRedirect from '@auth/AuthGuardRedirect';
import FuseSvgIcon from '@fuse/core/FuseSvgIcon';
import PayFees from '@/components/fees/PayFees';
import FeeStatementView, { FeeLockStatus } from '@/components/fees/FeeStatementView';
import PaymentPlanCard from '@/components/fees/PaymentPlanCard';
import { BankClaim, CLAIM_STATUS, PaymentOptions, StudentFees, formatDate, formatKES, useBackend } from '@/lib/finance';

type Me = {
	phone: string | null;
	parentLinks: {
		student: {
			id: string;
			firstName: string | null;
			lastName: string | null;
			admissionNumber: string | null;
			class: { name: string } | null;
		};
	}[];
};

const CHILD_KEY = 'parent_selected_child_id';

export default function ParentFeesPage() {
	const me = useBackend<Me>('/api/users/me');
	const options = useBackend<PaymentOptions>('/api/fees/payment-options');
	const children = (me.data?.parentLinks ?? []).map((l) => l.student);
	const [childId, setChildId] = useState('');

	useEffect(() => {
		if (!me.data || childId) return;

		let saved: string | null = null;
		try {
			saved = localStorage.getItem(CHILD_KEY);
		} catch {
			// storage unavailable
		}
		const list = me.data.parentLinks.map((l) => l.student);
		setChildId(list.find((c) => c.id === saved)?.id ?? list[0]?.id ?? '');
	}, [me.data, childId]);

	const choose = (id: string) => {
		setChildId(id);
		try {
			localStorage.setItem(CHILD_KEY, id);
		} catch {
			// storage unavailable
		}
	};

	const fees = useBackend<StudentFees>(childId ? `/api/fees/student/${childId}` : null);
	const claims = useBackend<{ claims: BankClaim[] }>(childId ? `/api/fees/bank-claims?studentId=${childId}` : null);
	const child = children.find((c) => c.id === childId);

	const refresh = () => {
		fees.reload();
		claims.reload();
	};

	const loadError = me.error || options.error;
	const balance = Math.max(0, fees.data?.balance ?? 0);
	const pendingClaims = (claims.data?.claims ?? []).filter((c) => c.status === 'PENDING');

	const renderContent = () => {
		if (me.loading || options.loading) {
			return (
				<div className="flex min-h-[300px] items-center justify-center">
					<CircularProgress />
				</div>
			);
		}

		if (loadError) return <Alert severity="error">{loadError}</Alert>;

		if (children.length === 0) {
			return (
				<Typography color="text.secondary">
					No children are linked to this account yet. Please contact the school office.
				</Typography>
			);
		}

		return (
			<div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
				{/* Statement */}
				<div className="flex flex-col gap-6 lg:col-span-3">
					{fees.loading && !fees.data ? (
						<div className="flex justify-center py-12">
							<CircularProgress />
						</div>
					) : fees.error ? (
						<Alert severity="error">{fees.error}</Alert>
					) : (
						fees.data && (
							<>
								<FeeLockStatus statement={fees.data.statement} />
								{fees.data.paymentPlan && <PaymentPlanCard schedule={fees.data.paymentPlan} />}
								<FeeStatementView
									statement={fees.data.statement}
									token={me.token!}
								/>
							</>
						)
					)}

					{(claims.data?.claims.length ?? 0) > 0 && (
						<Paper className="rounded-2xl p-6 shadow-sm">
							<Typography className="mb-3 text-lg font-bold">Bank payments you reported</Typography>
							<div className="flex flex-col gap-2">
								{claims.data!.claims.map((c) => (
									<div
										key={c.id}
										className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-100 p-3"
									>
										<div>
											<Typography className="font-semibold">
												{formatKES(c.amount)} · {c.transactionCode}
											</Typography>
											<Typography className="text-xs text-gray-500">
												Paid {formatDate(c.paidAt)}
												{c.bankName ? ` · ${c.bankName}` : ''}
											</Typography>
											{c.status === 'REJECTED' && c.rejectionReason && (
												<Typography className="mt-1 text-xs text-red-600">
													{c.rejectionReason}
												</Typography>
											)}
										</div>
										<Chip
											size="small"
											label={CLAIM_STATUS[c.status].label}
											color={CLAIM_STATUS[c.status].color}
										/>
									</div>
								))}
							</div>
						</Paper>
					)}
				</div>

				{/* Pay */}
				<Paper className="self-start rounded-2xl p-6 shadow-sm lg:col-span-2">
					<Typography className="mb-1 text-lg font-bold">Pay school fees</Typography>
					<Typography className="mb-4 text-sm text-gray-500">
						For {child ? [child.firstName, child.lastName].filter(Boolean).join(' ') : 'your child'}
					</Typography>
					{pendingClaims.length > 0 && (
						<Alert
							severity="info"
							className="mb-4"
						>
							{formatKES(pendingClaims.reduce((a, c) => a + c.amount, 0))} in bank payments is awaiting
							verification and isn't in the balance yet.
						</Alert>
					)}
					{options.data && me.data && child && fees.data && (
						<PayFees
							token={me.token!}
							studentId={child.id}
							studentLabel={[child.firstName, child.lastName].filter(Boolean).join(' ')}
							admissionNumber={child.admissionNumber}
							balance={balance}
							options={options.data}
							defaultPhone={me.data.phone}
							onDone={refresh}
						/>
					)}
				</Paper>
			</div>
		);
	};

	return (
		<AuthGuardRedirect auth={['PARENT']}>
			<FusePageSimple
				content={
					<div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8">
						<div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
							<div>
								<Typography className="text-3xl font-extrabold tracking-tight">
									Fees & Payments
								</Typography>
								<Typography
									color="text.secondary"
									className="mt-1"
								>
									Pay by M-Pesa, or report a bank deposit with its transaction code.
								</Typography>
							</div>
							<div className="flex items-center gap-3">
								{children.length > 1 && (
									<TextField
										select
										size="small"
										label="Child"
										value={childId}
										onChange={(e) => choose(e.target.value)}
										className="min-w-48"
									>
										{children.map((c) => (
											<MenuItem
												key={c.id}
												value={c.id}
											>
												{[c.firstName, c.lastName].filter(Boolean).join(' ')}
												{c.class ? ` (${c.class.name})` : ''}
											</MenuItem>
										))}
									</TextField>
								)}
								<Button
									onClick={refresh}
									startIcon={<FuseSvgIcon size={18}>lucide:refresh-cw</FuseSvgIcon>}
									disabled={!childId}
								>
									Refresh
								</Button>
							</div>
						</div>
						{renderContent()}
					</div>
				}
			/>
		</AuthGuardRedirect>
	);
}
