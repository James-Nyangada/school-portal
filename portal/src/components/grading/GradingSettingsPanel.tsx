'use client';

import { useEffect, useState } from 'react';
import { Alert, Button, CircularProgress, Divider, IconButton, MenuItem, TextField, Typography } from '@mui/material';
import { useSnackbar } from 'notistack';
import FuseSvgIcon from '@fuse/core/FuseSvgIcon';
import { errorMessage, useGradesApi, type Boundary, type GradingMode, type GradingSettings } from './api';

type ClassMode = { id: string; name: string; gradingMode: GradingMode | null };

/** System Settings → Grading: school-wide grading mode, numeric weighting and boundaries, approval SLA, fee gate. */
export default function GradingSettingsPanel() {
	const api = useGradesApi();
	const { enqueueSnackbar } = useSnackbar();
	const [form, setForm] = useState<GradingSettings | null>(null);
	const [classes, setClasses] = useState<ClassMode[]>([]);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState('');

	useEffect(() => {
		if (!api.ready) return;

		api.get<{ settings: GradingSettings; classes: ClassMode[] }>('/settings')
			.then((r) => {
				setForm(r.settings);
				setClasses(r.classes);
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

	const set = <K extends keyof GradingSettings>(key: K, value: GradingSettings[K]) =>
		setForm((f) => (f ? { ...f, [key]: value } : f));
	const numField = (key: keyof GradingSettings, label: string, extra: object = {}) => (
		<TextField
			label={label}
			type="number"
			size="small"
			value={form[key] as number}
			onChange={(e) => set(key, Number(e.target.value) as never)}
			{...extra}
		/>
	);
	const setBoundary = (i: number, patch: Partial<Boundary>) =>
		set(
			'gradeBoundaries',
			form.gradeBoundaries.map((b, j) => (j === i ? { ...b, ...patch } : b))
		);

	const weightsOk = Math.abs(form.catWeight + form.examWeight - 100) < 0.001;

	const save = async () => {
		setSaving(true);
		setError('');
		try {
			const r = await api.put<{ settings: GradingSettings }>('/settings', form);
			setForm(r.settings);
			enqueueSnackbar('Grading settings saved', { variant: 'success' });
		} catch (e) {
			setError(errorMessage(e));
		} finally {
			setSaving(false);
		}
	};

	const setClassMode = async (c: ClassMode, mode: GradingMode | null) => {
		try {
			const updated = await api.put<ClassMode>(`/settings/classes/${c.id}`, { gradingMode: mode });
			setClasses((p) => p.map((x) => (x.id === c.id ? updated : x)));
		} catch (e) {
			enqueueSnackbar(errorMessage(e), { variant: 'error' });
		}
	};

	return (
		<div className="flex flex-col gap-6">
			<section className="flex flex-col gap-4">
				<Typography variant="subtitle1">Grading mode</Typography>
				<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
					<TextField
						select
						label="School-wide grading mode"
						size="small"
						value={form.gradingMode}
						onChange={(e) => set('gradingMode', e.target.value as GradingMode)}
						helperText="CBC records competency levels (EE / ME / AE / BE) per strand instead of marks"
					>
						<MenuItem value="NUMERIC">Numeric — CATs + exam</MenuItem>
						<MenuItem value="CBC">CBC — competency levels</MenuItem>
					</TextField>
					<TextField
						label="Current term"
						size="small"
						value={form.currentTerm}
						onChange={(e) => set('currentTerm', e.target.value)}
						helperText="Gradebooks open on this term, e.g. “Term 1 2026”"
					/>
				</div>
				{classes.length > 0 && (
					<details>
						<summary className="cursor-pointer text-sm">
							Per-class override ({classes.filter((c) => c.gradingMode).length} set)
						</summary>
						<div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
							{classes.map((c) => (
								<TextField
									key={c.id}
									select
									size="small"
									label={c.name}
									value={c.gradingMode ?? ''}
									onChange={(e) => setClassMode(c, (e.target.value || null) as GradingMode | null)}
								>
									<MenuItem value="">School default</MenuItem>
									<MenuItem value="NUMERIC">Numeric</MenuItem>
									<MenuItem value="CBC">CBC</MenuItem>
								</TextField>
							))}
						</div>
					</details>
				)}
			</section>

			<Divider />

			<section className="flex flex-col gap-4">
				<div>
					<Typography variant="subtitle1">Numeric grading</Typography>
					<Typography
						variant="body2"
						color="text.secondary"
					>
						Total = CAT average × CAT weight + exam × exam weight, as a percentage. Before the exam is
						entered the total is the CAT percentage. Changes apply to drafts; published totals stay as they
						are.
					</Typography>
				</div>
				<div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
					{numField('catCount', 'CATs per term', { slotProps: { htmlInput: { min: 0, max: 6 } } })}
					{numField('catMaxScore', 'Each CAT out of')}
					{numField('examMaxScore', 'Exam out of')}
					{numField('catWeight', 'CAT weight %', { error: !weightsOk })}
					{numField('examWeight', 'Exam weight %', {
						error: !weightsOk,
						helperText: weightsOk ? undefined : 'Weights must add up to 100'
					})}
				</div>

				<Typography variant="body2">Grade boundaries (minimum total %)</Typography>
				<div className="flex flex-wrap gap-2">
					{form.gradeBoundaries.map((b, i) => (
						<div
							key={i}
							className="flex items-center gap-1 rounded-lg border p-1"
						>
							<TextField
								size="small"
								value={b.grade}
								onChange={(e) => setBoundary(i, { grade: e.target.value })}
								className="w-16"
								slotProps={{ htmlInput: { maxLength: 4, 'aria-label': 'Grade' } }}
							/>
							<TextField
								size="small"
								type="number"
								value={b.min}
								onChange={(e) => setBoundary(i, { min: Number(e.target.value) })}
								className="w-20"
								slotProps={{ htmlInput: { min: 0, max: 100, 'aria-label': `Minimum for ${b.grade}` } }}
							/>
							<IconButton
								size="small"
								aria-label={`Remove ${b.grade}`}
								onClick={() =>
									set(
										'gradeBoundaries',
										form.gradeBoundaries.filter((_, j) => j !== i)
									)
								}
							>
								<FuseSvgIcon size={16}>lucide:x</FuseSvgIcon>
							</IconButton>
						</div>
					))}
					<Button
						size="small"
						startIcon={<FuseSvgIcon size={16}>lucide:plus</FuseSvgIcon>}
						onClick={() => set('gradeBoundaries', [...form.gradeBoundaries, { grade: '', min: 0 }])}
					>
						Add grade
					</Button>
				</div>
			</section>

			<Divider />

			<section className="flex flex-col gap-4">
				<Typography variant="subtitle1">Approvals and access</Typography>
				<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
					{numField('approvalSlaHours', 'Flag grade-edit requests older than (hours)', {
						slotProps: { htmlInput: { min: 1 } }
					})}
					{numField('feeGateThreshold', '% of fees to unlock grades and timetable', {
						slotProps: { htmlInput: { min: 0, max: 100 } },
						helperText: 'Leavers always need 100% for grades, and everyone for certificates'
					})}
				</div>
			</section>

			{error && <Alert severity="error">{error}</Alert>}

			<div>
				<Button
					variant="contained"
					onClick={save}
					disabled={saving || !weightsOk}
				>
					Save grading settings
				</Button>
			</div>
		</div>
	);
}
