'use client';

import { useEffect, useState } from 'react';
import { Alert, Button, Chip, CircularProgress, Divider, FormControlLabel, Switch, Typography } from '@mui/material';
import AuthGuardRedirect from '@auth/AuthGuardRedirect';
import GradingSettingsPanel from '@/components/grading/GradingSettingsPanel';
import SchoolSettingsPage from '@/components/school/SchoolSettingsPage';
import { errorMessage, useSchoolApi } from '@/components/school/api';
import useToast from '@/hooks/useToast';

type Features = { mpesaEnabled: boolean; smsEnabled: boolean; newsletterEnabled: boolean; assignmentsEnabled: boolean };
type Integration = { key: string; name: string; hint: string; connected: boolean; detail: string };

const FEATURES: { key: keyof Features; label: string; hint: string }[] = [
	{ key: 'mpesaEnabled', label: 'M-Pesa payments', hint: 'Parents (and permitted students) pay fees by STK push.' },
	{ key: 'smsEnabled', label: 'SMS notifications', hint: 'Admission credentials, absence alerts and fee reminders.' },
	{ key: 'newsletterEnabled', label: 'Newsletters', hint: 'Admins can write and send newsletters.' },
	{
		key: 'assignmentsEnabled',
		label: 'Assignments & quizzes',
		hint: 'Teachers can create new assignments and quizzes.'
	}
];

function FeatureToggles() {
	const api = useSchoolApi();
	const { confirm, notify } = useToast();
	const [saved, setSaved] = useState<Features | null>(null);
	const [form, setForm] = useState<Features | null>(null);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState('');

	useEffect(() => {
		if (!api.ready) return;

		api.get<Features>('/features')
			.then((f) => {
				setSaved(f);
				setForm(f);
			})
			.catch((e) => setError(errorMessage(e)));
	}, [api]);

	if (!form || !saved) {
		return error ? (
			<Alert severity="error">{error}</Alert>
		) : (
			<div className="flex justify-center py-12">
				<CircularProgress />
			</div>
		);
	}

	const changed = FEATURES.filter((f) => form[f.key] !== saved[f.key]);
	const switchedOff = changed.filter((f) => !form[f.key]);

	const save = async () => {
		if (
			switchedOff.length > 0 &&
			!(await confirm(
				`Turn off ${switchedOff.map((f) => f.label).join(', ')} for the whole school? This takes effect immediately for every user.`,
				{ destructive: true }
			))
		)
			return;

		setSaving(true);
		try {
			const next = await api.put<Features>('/features', form);
			setSaved(next);
			setForm(next);
			notify('Feature toggles saved', 'success');
		} catch (e) {
			notify(errorMessage(e), 'error');
		} finally {
			setSaving(false);
		}
	};

	return (
		<div className="flex flex-col gap-4">
			<div>
				<Typography variant="subtitle1">System modules</Typography>
				<Typography
					variant="body2"
					color="text.secondary"
				>
					Every change is recorded in the audit log. CBC vs numeric grading is set in the Grading tab.
				</Typography>
			</div>
			<Divider />
			{FEATURES.map((f) => (
				<FormControlLabel
					key={f.key}
					control={
						<Switch
							checked={form[f.key]}
							onChange={(e) => setForm({ ...form, [f.key]: e.target.checked })}
						/>
					}
					label={
						<div>
							<Typography>{f.label}</Typography>
							<Typography
								variant="body2"
								color="text.secondary"
							>
								{f.hint}
							</Typography>
						</div>
					}
				/>
			))}
			<div className="mt-2 flex gap-2">
				<Button
					variant="contained"
					color="primary"
					disabled={saving || changed.length === 0}
					onClick={save}
					startIcon={saving ? <CircularProgress size={16} /> : undefined}
				>
					Save toggles
				</Button>
				{changed.length > 0 && (
					<Button
						disabled={saving}
						onClick={() => setForm(saved)}
					>
						Discard
					</Button>
				)}
			</div>
		</div>
	);
}

function Integrations() {
	const api = useSchoolApi();
	const [rows, setRows] = useState<Integration[] | null>(null);
	const [error, setError] = useState('');

	useEffect(() => {
		if (!api.ready) return;

		api.get<Integration[]>('/integrations')
			.then(setRows)
			.catch((e) => setError(errorMessage(e)));
	}, [api]);

	if (!rows) {
		return error ? (
			<Alert severity="error">{error}</Alert>
		) : (
			<div className="flex justify-center py-12">
				<CircularProgress />
			</div>
		);
	}

	return (
		<div className="flex flex-col gap-6">
			<Alert severity="info">
				Credentials are kept in the server&apos;s environment file and are never shown here. To connect or
				replace an integration, update <code>server/.env</code> and restart the API.
			</Alert>
			{rows.map((r, i) => (
				<div
					key={r.key}
					className="flex flex-col gap-6"
				>
					{i > 0 && <Divider />}
					<div className="flex items-center justify-between gap-4">
						<div>
							<Typography
								variant="subtitle1"
								fontWeight="bold"
							>
								{r.name}
							</Typography>
							<Typography className="text-secondary">{r.hint}</Typography>
							<Typography
								variant="caption"
								color="text.secondary"
							>
								{r.detail}
							</Typography>
						</div>
						<Chip
							label={r.connected ? 'Connected' : 'Not connected'}
							color={r.connected ? 'success' : 'default'}
						/>
					</div>
				</div>
			))}
		</div>
	);
}

export default function SuperAdminSettings() {
	return (
		<AuthGuardRedirect auth={['SUPER_ADMIN']}>
			<SchoolSettingsPage
				title="System Settings"
				subtitle="School information for the website, the academic calendar, grading and integrations."
				extraTabs={[
					{
						key: 'grading',
						label: 'Grading',
						icon: 'lucide:graduation-cap',
						render: () => <GradingSettingsPanel />
					},
					{
						key: 'features',
						label: 'Feature Toggles',
						icon: 'lucide:toggle-right',
						render: () => <FeatureToggles />
					},
					{ key: 'integrations', label: 'Integrations', icon: 'lucide:plug', render: () => <Integrations /> }
				]}
			/>
		</AuthGuardRedirect>
	);
}
