'use client';

import { useEffect, useRef, useState } from 'react';
import { Alert, Button, CircularProgress, InputAdornment, Tab, Tabs, TextField, Typography } from '@mui/material';
import FuseSvgIcon from '@fuse/core/FuseSvgIcon';
import { CURRENCY, PaymentOptions, backendRequest, formatKES } from '@/lib/finance';

type Props = {
	token: string;
	studentId: string;
	studentLabel: string;
	admissionNumber: string | null;
	balance: number;
	options: PaymentOptions;
	defaultPhone?: string | null;
	/** Called after money has been credited (M-Pesa) or a bank claim was submitted */
	onDone: () => void;
};

type MpesaState =
	| { step: 'idle' }
	| { step: 'sending' }
	| { step: 'waiting'; checkoutRequestId: string; amount: number }
	| { step: 'success'; amount: number; receiptNumber: string | null }
	| { step: 'failed'; message: string };

const toLocalPhone = (phone?: string | null) => (phone ? phone.replace(/^\+?254/, '0') : '');

function MpesaForm({ token, studentId, admissionNumber, balance, options, defaultPhone, onDone }: Props) {
	const [phone, setPhone] = useState(toLocalPhone(defaultPhone));
	const [amount, setAmount] = useState(balance > 0 ? String(Math.ceil(balance)) : '');
	const [state, setState] = useState<MpesaState>({ step: 'idle' });
	const [error, setError] = useState<string | null>(null);
	const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

	const poll = (checkoutRequestId: string, amountSent: number) => {
		timer.current = setTimeout(async () => {
			try {
				const s = await backendRequest<{
					status: string;
					resultDesc: string | null;
					receiptNumber: string | null;
					amount: number;
				}>(token, `/api/mpesa/status/${encodeURIComponent(checkoutRequestId)}`);

				if (s.status === 'SUCCESS') {
					setState({ step: 'success', amount: amountSent, receiptNumber: s.receiptNumber });
					onDone();
				} else if (s.status === 'FAILED' || s.status === 'EXPIRED') {
					setState({ step: 'failed', message: s.resultDesc || 'The payment was not completed.' });
				} else {
					poll(checkoutRequestId, amountSent);
				}
			} catch {
				poll(checkoutRequestId, amountSent); // transient network error — keep waiting
			}
		}, 2000);
	};

	const pay = async () => {
		const value = Number(amount);

		if (!Number.isInteger(value) || value < 1) return setError('Enter a whole amount in shillings');

		if (!/^(\+?254|0)?[17]\d{8}$/.test(phone.replace(/\s/g, '')))
			return setError('Enter a valid Safaricom number, e.g. 0712345678');

		setError(null);
		setState({ step: 'sending' });
		try {
			const res = await backendRequest<{ checkoutRequestId: string }>(token, '/api/mpesa/stk-push', {
				method: 'POST',
				body: JSON.stringify({ studentId, phone, amount: value })
			});
			setState({ step: 'waiting', checkoutRequestId: res.checkoutRequestId, amount: value });
			poll(res.checkoutRequestId, value);
		} catch (e) {
			setState({ step: 'idle' });
			setError((e as Error).message);
		}
	};

	if (!options.mpesa.enabled) {
		return (
			<Alert severity="info">
				M-Pesa payments are not available yet. Please pay by bank and report the transaction code.
			</Alert>
		);
	}

	if (state.step === 'waiting') {
		return (
			<div className="flex flex-col items-center gap-4 py-8 text-center">
				<CircularProgress color="success" />
				<Typography className="text-lg font-semibold">Check your phone</Typography>
				<Typography className="max-w-sm text-sm text-gray-600">
					An M-Pesa prompt for {formatKES(state.amount)} has been sent to {phone}. Enter your M-Pesa PIN to
					complete the payment. This page updates automatically.
				</Typography>
			</div>
		);
	}

	if (state.step === 'success') {
		return (
			<div className="flex flex-col gap-4">
				<Alert severity="success">
					Payment of {formatKES(state.amount)} received
					{state.receiptNumber ? ` (M-Pesa ref ${state.receiptNumber})` : ''}. Your balance has been updated.
				</Alert>
				<Button
					variant="outlined"
					onClick={() => setState({ step: 'idle' })}
				>
					Make another payment
				</Button>
			</div>
		);
	}

	return (
		<div className="flex flex-col gap-5">
			{state.step === 'failed' && (
				<Alert
					severity="warning"
					onClose={() => setState({ step: 'idle' })}
				>
					{state.message}
				</Alert>
			)}
			{error && <Alert severity="error">{error}</Alert>}

			<TextField
				label="M-Pesa phone number"
				placeholder="0712345678"
				value={phone}
				onChange={(e) => setPhone(e.target.value)}
				disabled={state.step === 'sending'}
				slotProps={{ htmlInput: { inputMode: 'tel' } }}
			/>
			<TextField
				label="Amount"
				type="number"
				value={amount}
				onChange={(e) => setAmount(e.target.value)}
				disabled={state.step === 'sending'}
				helperText={balance > 0 ? `Outstanding balance: ${formatKES(balance)}` : undefined}
				slotProps={{
					input: { startAdornment: <InputAdornment position="start">{CURRENCY}</InputAdornment> },
					htmlInput: { min: 1, step: 1 }
				}}
			/>
			<Button
				variant="contained"
				size="large"
				color="success"
				onClick={pay}
				disabled={state.step === 'sending'}
				startIcon={
					state.step === 'sending' ? (
						<CircularProgress
							size={18}
							color="inherit"
						/>
					) : (
						<FuseSvgIcon size={18}>lucide:smartphone</FuseSvgIcon>
					)
				}
			>
				Send M-Pesa prompt
			</Button>
			{options.mpesa.paybill && (
				<Typography className="text-center text-base text-gray-700">
					Or pay from the M-Pesa menu: Paybill <strong>{options.mpesa.paybill}</strong>, account{' '}
					<strong>{admissionNumber || 'admission number'}</strong>.
				</Typography>
			)}
		</div>
	);
}

function BankForm({ token, studentId, balance, options, onDone }: Props) {
	const today = new Date().toISOString().slice(0, 10);
	const [amount, setAmount] = useState(balance > 0 ? String(Math.ceil(balance)) : '');
	const [code, setCode] = useState('');
	const [paidAt, setPaidAt] = useState(today);
	const [bankName, setBankName] = useState(options.bank.bankName ?? '');
	const [note, setNote] = useState('');
	const [submitting, setSubmitting] = useState(false);
	const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

	const { bank } = options;
	const hasBankDetails = !!(bank.bankName || bank.accountNumber);

	const submit = async () => {
		if (!(Number(amount) > 0)) return setResult({ ok: false, message: 'Enter the amount you deposited' });

		if (code.trim().length < 4)
			return setResult({ ok: false, message: 'Enter the transaction code from your bank slip or SMS' });

		setSubmitting(true);
		setResult(null);
		try {
			await backendRequest(token, '/api/fees/bank-claims', {
				method: 'POST',
				body: JSON.stringify({
					studentId,
					amount: Number(amount),
					transactionCode: code,
					paidAt,
					bankName,
					note
				})
			});
			setResult({
				ok: true,
				message:
					'Thank you. The finance office will verify the transaction code and credit the payment, usually within one working day.'
			});
			setCode('');
			setNote('');
			onDone();
		} catch (e) {
			setResult({ ok: false, message: (e as Error).message });
		} finally {
			setSubmitting(false);
		}
	};

	return (
		<div className="flex flex-col gap-5">
			{hasBankDetails && (
				<div className="rounded-xl bg-slate-50 p-4 text-sm">
					<Typography className="mb-2 font-semibold">Deposit to</Typography>
					<dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
						{(
							[
								['Bank', bank.bankName],
								['Branch', bank.branch],
								['Account name', bank.accountName],
								['Account no.', bank.accountNumber]
							] as const
						)
							.filter(([, v]) => v)
							.map(([k, v]) => (
								<div
									key={k}
									className="contents"
								>
									<dt className="text-gray-500">{k}</dt>
									<dd className="font-semibold">{v}</dd>
								</div>
							))}
					</dl>
				</div>
			)}

			<Typography className="text-sm text-gray-600">
				Already paid at the bank? Enter the transaction code so the finance office can confirm it.
			</Typography>

			{result && (
				<Alert
					severity={result.ok ? 'success' : 'error'}
					onClose={() => setResult(null)}
				>
					{result.message}
				</Alert>
			)}

			<TextField
				label="Transaction code"
				placeholder="As shown on the bank slip or SMS"
				value={code}
				onChange={(e) => setCode(e.target.value.toUpperCase())}
				disabled={submitting}
			/>
			<div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
				<TextField
					label="Amount deposited"
					type="number"
					value={amount}
					onChange={(e) => setAmount(e.target.value)}
					disabled={submitting}
					slotProps={{
						input: { startAdornment: <InputAdornment position="start">{CURRENCY}</InputAdornment> },
						htmlInput: { min: 1, step: 'any' }
					}}
				/>
				<TextField
					label="Date paid"
					type="date"
					value={paidAt}
					onChange={(e) => setPaidAt(e.target.value)}
					disabled={submitting}
					slotProps={{ inputLabel: { shrink: true }, htmlInput: { max: today } }}
				/>
			</div>
			<TextField
				label="Bank"
				value={bankName}
				onChange={(e) => setBankName(e.target.value)}
				disabled={submitting}
			/>
			<TextField
				label="Note for the finance office (optional)"
				value={note}
				onChange={(e) => setNote(e.target.value)}
				disabled={submitting}
				multiline
				minRows={2}
			/>
			<Button
				variant="contained"
				size="large"
				color="secondary"
				onClick={submit}
				disabled={submitting}
				startIcon={
					submitting ? (
						<CircularProgress
							size={18}
							color="inherit"
						/>
					) : (
						<FuseSvgIcon size={18}>lucide:landmark</FuseSvgIcon>
					)
				}
			>
				Submit bank payment
			</Button>
		</div>
	);
}

export default function PayFees(props: Props) {
	const [tab, setTab] = useState<'mpesa' | 'bank'>(props.options.mpesa.enabled ? 'mpesa' : 'bank');

	return (
		<div className="flex flex-col gap-5">
			<Tabs
				value={tab}
				onChange={(_, v) => setTab(v)}
				variant="fullWidth"
			>
				<Tab
					value="mpesa"
					label="M-Pesa"
					icon={<FuseSvgIcon size={18}>lucide:smartphone</FuseSvgIcon>}
					iconPosition="start"
				/>
				<Tab
					value="bank"
					label="Bank deposit"
					icon={<FuseSvgIcon size={18}>lucide:landmark</FuseSvgIcon>}
					iconPosition="start"
				/>
			</Tabs>
			{/* keyed by student so switching child resets the forms */}
			{tab === 'mpesa' ? (
				<MpesaForm
					key={props.studentId}
					{...props}
				/>
			) : (
				<BankForm
					key={props.studentId}
					{...props}
				/>
			)}
		</div>
	);
}
