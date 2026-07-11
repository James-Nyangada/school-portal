'use client';

import { useState } from 'react';
import Typography from '@mui/material/Typography';
import Paper from '@mui/material/Paper';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import Divider from '@mui/material/Divider';
import LinearProgress from '@mui/material/LinearProgress';
import InputAdornment from '@mui/material/InputAdornment';
import FusePageSimple from '@fuse/core/FusePageSimple';
import AuthGuardRedirect from '@auth/AuthGuardRedirect';
import FuseSvgIcon from '@fuse/core/FuseSvgIcon';
import { useSnackbar } from 'notistack';

export default function ParentFeesPage() {
	const { enqueueSnackbar } = useSnackbar();
	const [amount, setAmount] = useState('');
	const [phone, setPhone] = useState('');
	const [isProcessing, setIsProcessing] = useState(false);

	// Mock fee data
	const feeStatement = {
		term: 'Term 1, 2026',
		items: [
			{ name: 'Tuition Fee', amount: 30000 },
			{ name: 'Transport & Shuttle', amount: 15000 },
			{ name: 'Lunch Program', amount: 8000 }
		],
		totalBilled: 53000,
		amountPaid: 20000,
		balance: 33000
	};

	const percentPaid = feeStatement.totalBilled > 0 ? (feeStatement.amountPaid / feeStatement.totalBilled) * 100 : 100;

	const handleMpesaPay = async () => {
		if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
			enqueueSnackbar('Please enter a valid amount', { variant: 'error' });
			return;
		}

		setIsProcessing(true);
		// Simulate STK push delay
		setTimeout(() => {
			setIsProcessing(false);
			enqueueSnackbar('STK Push sent to your phone! Please enter your M-Pesa PIN.', { variant: 'success' });
			setAmount('');
			setPhone('');
		}, 1500);
	};

	return (
		<AuthGuardRedirect auth={['PARENT', 'STUDENT']}>
			<FusePageSimple
				content={
					<div className="mx-auto flex w-full max-w-7xl flex-col gap-32 px-24 py-32">
						{/* Header */}
						<div className="flex flex-col items-start justify-between gap-16 border-b border-gray-100 pb-16 md:flex-row md:items-center">
							<div>
								<Typography className="text-4xl font-extrabold tracking-tight">
									Fees & Payments
								</Typography>
								<Typography
									color="text.secondary"
									className="mt-8"
								>
									Manage school tuition billing, view statement details, and clear balances instantly
									via M-Pesa.
								</Typography>
							</div>
							<div className="flex shrink-0 items-center gap-8 rounded-full bg-blue-50 px-16 py-8 text-sm font-bold text-blue-700">
								<FuseSvgIcon size={20}>lucide:credit-card</FuseSvgIcon>
								<span>Term Balance Active</span>
							</div>
						</div>

						{/* Grid Layout */}
						<div className="grid grid-cols-1 gap-32 md:grid-cols-2">
							{/* Fee Statement Card */}
							<Paper
								className="bg-card flex flex-auto flex-col rounded-2xl p-24 shadow"
								elevation={0}
							>
								<div>
									<div className="mb-24 flex items-center justify-between">
										<Typography
											variant="h6"
											className="font-bold text-slate-800"
										>
											Fee Statement
										</Typography>
										<span className="rounded-full bg-slate-100 px-12 py-4 text-xs font-semibold text-slate-700">
											{feeStatement.term}
										</span>
									</div>

									{/* Fee Items List */}
									<div className="mb-24 flex flex-col gap-16">
										{feeStatement.items.map((item, index) => (
											<div
												key={index}
												className="flex items-center justify-between rounded-xl p-12 transition-colors duration-150 hover:bg-slate-50/50"
											>
												<div className="flex items-center gap-12">
													<div className="rounded-lg bg-slate-100 p-8 text-slate-600">
														<FuseSvgIcon size={16}>lucide:book-open</FuseSvgIcon>
													</div>
													<Typography
														color="text.secondary"
														className="text-sm font-medium"
													>
														{item.name}
													</Typography>
												</div>
												<Typography className="font-bold text-slate-800">
													KES {item.amount.toLocaleString()}
												</Typography>
											</div>
										))}
									</div>

									<Divider className="my-16" />

									{/* Progress Metrics */}
									<div className="mb-24">
										<div className="mb-8 flex items-center justify-between text-xs font-bold text-slate-500">
											<span>FEES CLEARED</span>
											<span>{Math.round(percentPaid)}%</span>
										</div>
										<LinearProgress
											variant="determinate"
											value={percentPaid}
											className="h-8 rounded-full bg-slate-100"
											color={percentPaid >= 50 ? 'success' : 'warning'}
										/>
									</div>
								</div>

								{/* Totals Summary */}
								<div className="flex flex-col gap-12 rounded-2xl border border-slate-100 bg-slate-50/60 p-20">
									<div className="flex items-center justify-between text-sm font-semibold">
										<Typography color="text.secondary">Total Billed</Typography>
										<Typography className="font-bold text-slate-700">
											KES {feeStatement.totalBilled.toLocaleString()}
										</Typography>
									</div>
									<div className="flex items-center justify-between text-sm font-semibold text-green-700">
										<Typography>Amount Paid</Typography>
										<Typography className="font-extrabold">
											- KES {feeStatement.amountPaid.toLocaleString()}
										</Typography>
									</div>
									<Divider className="my-8" />
									<div className="flex items-center justify-between">
										<Typography className="font-bold text-slate-800">Balance Due</Typography>
										<Typography
											variant="h6"
											color="error"
											className="font-black"
										>
											KES {feeStatement.balance.toLocaleString()}
										</Typography>
									</div>
								</div>
							</Paper>

							{/* M-Pesa Payment Gate Card */}
							<Paper
								className="bg-card flex flex-auto flex-col rounded-2xl p-24 shadow"
								elevation={0}
							>
								<div>
									<div className="mb-20 flex items-center gap-12">
										<div className="shrink-0 rounded-2xl bg-green-50 p-8 text-green-600">
											<FuseSvgIcon size={24}>lucide:smartphone</FuseSvgIcon>
										</div>
										<div>
											<Typography
												variant="h6"
												className="font-bold text-slate-800"
											>
												Pay via M-Pesa
											</Typography>
											<Typography
												variant="caption"
												color="text.secondary"
											>
												Lipa na M-Pesa STK Push Express
											</Typography>
										</div>
									</div>

									<Typography
										color="text.secondary"
										className="mb-24 text-sm leading-relaxed"
									>
										Please enter the amount and mobile phone number to trigger an STK prompt. Enter
										your M-Pesa PIN on your phone to authorize the transaction.
									</Typography>

									<div className="flex flex-col gap-20">
										<TextField
											label="M-Pesa Phone Number"
											variant="outlined"
											fullWidth
											placeholder="e.g. 0712345678"
											value={phone}
											onChange={(e) => setPhone(e.target.value)}
											slotProps={{
												input: {
													startAdornment: (
														<InputAdornment position="start">
															<FuseSvgIcon
																size={20}
																className="text-slate-400"
															>
																lucide:phone
															</FuseSvgIcon>
														</InputAdornment>
													)
												}
											}}
										/>

										<TextField
											label="Amount to Pay (KES)"
											variant="outlined"
											fullWidth
											placeholder="e.g. 10000"
											value={amount}
											onChange={(e) => setAmount(e.target.value)}
											type="number"
											slotProps={{
												input: {
													startAdornment: (
														<InputAdornment position="start">
															<span className="text-sm font-bold text-slate-400">
																KES
															</span>
														</InputAdornment>
													)
												}
											}}
										/>
									</div>
								</div>

								<div className="mt-32">
									<Button
										variant="contained"
										fullWidth
										size="large"
										onClick={handleMpesaPay}
										disabled={isProcessing}
										className="h-56 rounded-2xl text-base font-bold capitalize transition-all duration-200"
										sx={{
											background: 'linear-gradient(135deg, #1b5e20 0%, #4caf50 100%)',
											boxShadow: '0 4px 14px 0 rgba(76, 175, 80, 0.4)',
											'&:hover': {
												background: 'linear-gradient(135deg, #144517 0%, #3d8c41 100%)',
												boxShadow: '0 6px 20px 0 rgba(76, 175, 80, 0.5)'
											}
										}}
									>
										{isProcessing ? 'Processing...' : 'Authorize STK Payment'}
									</Button>

									<div className="mt-16 flex items-center justify-center gap-8 text-xs text-slate-400">
										<FuseSvgIcon size={14}>lucide:lock-keyhole</FuseSvgIcon>
										<span>Secured transaction processed by Safaricom Daraja API</span>
									</div>
								</div>
							</Paper>
						</div>
					</div>
				}
			/>
		</AuthGuardRedirect>
	);
}
