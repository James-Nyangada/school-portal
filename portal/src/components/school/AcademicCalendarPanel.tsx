'use client';

import { useEffect, useState } from 'react';
import { Alert, Button, Chip, CircularProgress, IconButton, MenuItem, TextField, Typography } from '@mui/material';
import { useSnackbar } from 'notistack';
import FuseSvgIcon from '@fuse/core/FuseSvgIcon';
import { errorMessage, useSchoolApi, type SchoolProfileResponse, type Term } from './api';

type Form = { academicYear: string; currentTerm: string; terms: Term[] };

const formOf = (r: SchoolProfileResponse): Form => ({
	academicYear: r.profile.academicYear ?? '',
	currentTerm: r.currentTerm,
	terms: r.profile.terms
});

const today = () => new Date().toISOString().slice(0, 10);

/** School Settings → Academic Calendar: term dates (published on the website) and the current term. */
export default function AcademicCalendarPanel() {
	const api = useSchoolApi();
	const { enqueueSnackbar } = useSnackbar();
	const [form, setForm] = useState<Form | null>(null);
	const [savedTerm, setSavedTerm] = useState('');
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState('');

	useEffect(() => {
		if (!api.ready) return;

		api.get<SchoolProfileResponse>('/profile')
			.then((r) => {
				setForm(formOf(r));
				setSavedTerm(r.currentTerm);
			})
			.catch((e) => setError(errorMessage(e)));
	}, [api]);

	if (!form) {
		return error ? (
			<Alert severity="error">{error}</Alert>
		) : (
			<div className="flex justify-center py-12">
				<CircularProgress />
			</div>
		);
	}

	const setTerm = (i: number, patch: Partial<Term>) =>
		setForm({
			...form,
			terms: form.terms.map((t, j) => (j === i ? { ...t, ...patch } : t)),
			// Renaming the current term keeps it current
			currentTerm:
				patch.name !== undefined && form.terms[i].name === form.currentTerm ? patch.name : form.currentTerm
		});

	const addTerm = () =>
		setForm({
			...form,
			terms: [
				...form.terms,
				{
					name: `Term ${form.terms.length + 1}`,
					startDate: '',
					endDate: '',
					halfTermStart: null,
					halfTermEnd: null
				}
			]
		});

	const removeTerm = (i: number) => setForm({ ...form, terms: form.terms.filter((_, j) => j !== i) });

	const save = async () => {
		setSaving(true);
		setError('');
		try {
			const r = await api.put<SchoolProfileResponse>('/calendar', form);
			setForm(formOf(r));
			setSavedTerm(r.currentTerm);
			enqueueSnackbar('Academic calendar saved', { variant: 'success' });
		} catch (e) {
			setError(errorMessage(e));
		} finally {
			setSaving(false);
		}
	};

	const now = today();
	const date = (i: number, key: keyof Term, label: string) => (
		<TextField
			size="small"
			type="date"
			label={label}
			value={(form.terms[i][key] as string | null) ?? ''}
			onChange={(e) => setTerm(i, { [key]: e.target.value || null })}
			slotProps={{ inputLabel: { shrink: true } }}
		/>
	);

	return (
		<div className="flex flex-col gap-8">
			{error && (
				<Alert
					severity="error"
					onClose={() => setError('')}
				>
					{error}
				</Alert>
			)}

			<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
				<TextField
					label="Academic year"
					placeholder={String(new Date().getFullYear())}
					value={form.academicYear}
					onChange={(e) => setForm({ ...form, academicYear: e.target.value })}
				/>
				{form.terms.length ? (
					<TextField
						select
						label="Current term"
						value={form.terms.some((t) => t.name === form.currentTerm) ? form.currentTerm : ''}
						onChange={(e) => setForm({ ...form, currentTerm: e.target.value })}
						helperText="New grades, fee structures and payments are filed under this term"
					>
						{form.terms.map((t) => (
							<MenuItem
								key={t.name}
								value={t.name}
							>
								{t.name}
							</MenuItem>
						))}
					</TextField>
				) : (
					<TextField
						label="Current term"
						value={form.currentTerm}
						onChange={(e) => setForm({ ...form, currentTerm: e.target.value })}
						helperText="Add the terms below to pick from them"
					/>
				)}
			</div>

			{form.currentTerm !== savedTerm && (
				<Alert severity="warning">
					Changing the current term from <strong>{savedTerm}</strong> to{' '}
					<strong>{form.currentTerm || '—'}</strong> moves the whole school to the new term: teachers will
					enter grades and fees will be billed under it.
				</Alert>
			)}

			<section className="flex flex-col gap-4">
				<div>
					<Typography className="text-lg font-semibold">Term dates</Typography>
					<Typography className="text-secondary text-sm">
						Opening and closing dates are published on the school website.
					</Typography>
				</div>

				{form.terms.map((t, i) => {
					const running = t.startDate && t.endDate && t.startDate <= now && now <= t.endDate;

					return (
						<div
							key={i}
							className="flex flex-col gap-4 rounded-xl border p-4"
						>
							<div className="flex items-center gap-3">
								<TextField
									size="small"
									label="Term name"
									value={t.name}
									onChange={(e) => setTerm(i, { name: e.target.value })}
								/>
								{t.name === form.currentTerm && (
									<Chip
										size="small"
										color="primary"
										label="Current"
									/>
								)}
								{running && t.name !== form.currentTerm && (
									<Chip
										size="small"
										color="warning"
										label="In session today"
									/>
								)}
								<span className="flex-1" />
								<IconButton
									onClick={() => removeTerm(i)}
									aria-label={`Remove ${t.name}`}
								>
									<FuseSvgIcon size={18}>lucide:trash-2</FuseSvgIcon>
								</IconButton>
							</div>
							<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
								{date(i, 'startDate', 'Opens')}
								{date(i, 'endDate', 'Closes')}
								{date(i, 'halfTermStart', 'Half term from (optional)')}
								{date(i, 'halfTermEnd', 'Half term to (optional)')}
							</div>
						</div>
					);
				})}

				<div>
					<Button
						size="small"
						startIcon={<FuseSvgIcon size={16}>lucide:plus</FuseSvgIcon>}
						onClick={addTerm}
						disabled={form.terms.length >= 6}
					>
						Add a term
					</Button>
				</div>
			</section>

			<div>
				<Button
					variant="contained"
					color="primary"
					onClick={save}
					disabled={saving}
					startIcon={
						saving ? (
							<CircularProgress
								size={18}
								color="inherit"
							/>
						) : (
							<FuseSvgIcon size={18}>lucide:save</FuseSvgIcon>
						)
					}
				>
					Save calendar
				</Button>
			</div>
		</div>
	);
}
