'use client';

import { useSession } from 'next-auth/react';
import { Alert, Button, CircularProgress, Paper, Typography } from '@mui/material';
import FusePageSimple from '@fuse/core/FusePageSimple';
import AuthGuardRedirect from '@auth/AuthGuardRedirect';
import FuseSvgIcon from '@fuse/core/FuseSvgIcon';
import FeeStatementView, { FeeLockStatus } from '@/components/fees/FeeStatementView';
import PayFees from '@/components/fees/PayFees';
import PaymentPlanCard from '@/components/fees/PaymentPlanCard';
import { PaymentOptions, StudentFees, useBackend } from '@/lib/finance';

export default function StudentFeesPage() {
	const { data: session } = useSession();
	const studentId = (session?.user as { id?: string } | undefined)?.id;
	const { data, error, loading, reload, token } = useBackend<StudentFees>(
		studentId ? `/api/fees/student/${studentId}` : null
	);
	// Whether this student's class lets students pay themselves (set per class by the school, dashboard spec §6.4)
	const options = useBackend<PaymentOptions>('/api/fees/payment-options');
	const canPay = !!options.data?.canPay;

	return (
		<AuthGuardRedirect auth={['STUDENT']}>
			<FusePageSimple
				content={
					<div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8">
						<div className="flex flex-wrap items-end justify-between gap-4">
							<div>
								<Typography className="text-3xl font-extrabold tracking-tight">My Fees</Typography>
								<Typography
									color="text.secondary"
									className="mt-1"
								>
									{canPay
										? 'Your fee statement. You or your parent or guardian can pay.'
										: 'Your fee statement. Your parent or guardian can pay from their portal account.'}
								</Typography>
							</div>
							<Button
								onClick={reload}
								startIcon={<FuseSvgIcon size={18}>lucide:refresh-cw</FuseSvgIcon>}
							>
								Refresh
							</Button>
						</div>

						{loading && !data ? (
							<div className="flex justify-center py-16">
								<CircularProgress />
							</div>
						) : error ? (
							<Alert severity="error">{error}</Alert>
						) : (
							data &&
							token && (
								<>
									<FeeLockStatus statement={data.statement} />
									{data.paymentPlan && <PaymentPlanCard schedule={data.paymentPlan} />}
									{canPay && options.data && data.balance > 0 && (
										<Paper className="rounded-2xl p-6 shadow-sm">
											<Typography className="mb-4 text-lg font-bold">Pay school fees</Typography>
											<PayFees
												token={token}
												studentId={data.statement.student.id}
												studentLabel={data.statement.student.name}
												admissionNumber={data.statement.student.admissionNumber}
												balance={data.balance}
												options={options.data}
												onDone={reload}
											/>
										</Paper>
									)}
									<FeeStatementView
										statement={data.statement}
										token={token}
									/>
								</>
							)
						)}
					</div>
				}
			/>
		</AuthGuardRedirect>
	);
}
