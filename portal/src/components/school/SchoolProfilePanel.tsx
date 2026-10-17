'use client';

import { ReactNode, useEffect, useRef, useState } from 'react';
import {
	Alert,
	Autocomplete,
	Avatar,
	Button,
	Chip,
	CircularProgress,
	FormControlLabel,
	IconButton,
	InputAdornment,
	MenuItem,
	Switch,
	TextField,
	Tooltip,
	Typography
} from '@mui/material';
import { useSnackbar } from 'notistack';
import FuseSvgIcon from '@fuse/core/FuseSvgIcon';
import { BACKEND_URL } from '@/lib/backend';
import { useTtApi } from '@/components/timetable/api';
import { errorMessage, useSchoolApi, type SchoolProfile, type SchoolProfileResponse, type SocialLinks } from './api';

export type ProfileSection = 'info' | 'about' | 'website';

/** The fields each tab owns; a tab saves only these, so tabs never overwrite each other. */
const SECTION_FIELDS: Record<ProfileSection, (keyof SchoolProfile)[]> = {
	info: [
		'name',
		'shortName',
		'motto',
		'tagline',
		'logoUrl',
		'foundedYear',
		'registrationNumber',
		'curriculum',
		'schoolType',
		'gender',
		'levelsOffered',
		'email',
		'phone',
		'altPhone',
		'whatsapp',
		'postalAddress',
		'physicalAddress',
		'county',
		'mapUrl',
		'officeHours',
		'website',
		'socialLinks'
	],
	about: [
		'about',
		'history',
		'mission',
		'vision',
		'coreValues',
		'principalName',
		'principalTitle',
		'principalPhotoUrl',
		'principalMessage'
	],
	website: ['heroImageUrl', 'highlights', 'facilities', 'admissionsOpen', 'admissionsInfo', 'admissionRequirements']
};

const SOCIALS: { key: keyof SocialLinks; label: string; icon: string }[] = [
	{ key: 'facebook', label: 'Facebook', icon: 'lucide:facebook' },
	{ key: 'instagram', label: 'Instagram', icon: 'lucide:instagram' },
	{ key: 'x', label: 'X (Twitter)', icon: 'lucide:twitter' },
	{ key: 'youtube', label: 'YouTube', icon: 'lucide:youtube' },
	{ key: 'tiktok', label: 'TikTok', icon: 'lucide:music' },
	{ key: 'linkedin', label: 'LinkedIn', icon: 'lucide:linkedin' }
];

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
	return (
		<section className="flex flex-col gap-4">
			<div>
				<Typography className="text-lg font-semibold">{title}</Typography>
				{hint && <Typography className="text-secondary text-sm">{hint}</Typography>}
			</div>
			{children}
		</section>
	);
}

const Grid2 = ({ children }: { children: ReactNode }) => (
	<div className="grid grid-cols-1 gap-4 md:grid-cols-2">{children}</div>
);

/** Image picker: upload to /api/upload or paste a link. */
function ImageField({
	label,
	value,
	onChange,
	variant = 'rounded'
}: {
	label: string;
	value: string | null;
	onChange: (url: string | null) => void;
	variant?: 'rounded' | 'circular';
}) {
	const api = useTtApi(`${BACKEND_URL}/api`);
	const { enqueueSnackbar } = useSnackbar();
	const input = useRef<HTMLInputElement>(null);
	const [uploading, setUploading] = useState(false);

	const upload = async (file: File) => {
		const form = new FormData();
		form.append('file', file);
		setUploading(true);
		try {
			const r = await api.post<{ url: string }>('/upload', form);
			onChange(r.url);
		} catch (e) {
			enqueueSnackbar(errorMessage(e), { variant: 'error' });
		} finally {
			setUploading(false);
		}
	};

	return (
		<div className="flex items-center gap-4">
			<Avatar
				src={value ?? undefined}
				variant={variant}
				className="h-16 w-16 shrink-0 bg-gray-100"
			>
				<FuseSvgIcon className="text-gray-400">lucide:image</FuseSvgIcon>
			</Avatar>
			<TextField
				fullWidth
				size="small"
				label={label}
				placeholder="https://…"
				value={value ?? ''}
				onChange={(e) => onChange(e.target.value)}
				slotProps={{
					input: {
						endAdornment: (
							<InputAdornment position="end">
								<Tooltip title="Upload image">
									<span>
										<IconButton
											size="small"
											disabled={uploading}
											onClick={() => input.current?.click()}
										>
											{uploading ? (
												<CircularProgress size={18} />
											) : (
												<FuseSvgIcon size={18}>lucide:upload</FuseSvgIcon>
											)}
										</IconButton>
									</span>
								</Tooltip>
							</InputAdornment>
						)
					}
				}}
			/>
			<input
				ref={input}
				type="file"
				accept="image/*"
				hidden
				onChange={(e) => {
					const file = e.target.files?.[0];
					e.target.value = '';

					if (file) void upload(file);
				}}
			/>
		</div>
	);
}

/** Free-text list edited as chips: type and press Enter to add. */
function ChipList({
	label,
	value,
	onChange,
	placeholder
}: {
	label: string;
	value: string[];
	onChange: (v: string[]) => void;
	placeholder?: string;
}) {
	return (
		<Autocomplete
			multiple
			freeSolo
			options={[]}
			value={value}
			onChange={(_, v) => onChange((v as string[]).map((s) => s.trim()).filter(Boolean))}
			renderValue={(items, getItemProps) =>
				items.map((item, index) => {
					const { key, ...rest } = getItemProps({ index });

					return (
						<Chip
							key={key}
							label={item}
							size="small"
							{...rest}
						/>
					);
				})
			}
			renderInput={(params) => (
				<TextField
					{...params}
					label={label}
					placeholder={value.length ? '' : placeholder}
					helperText="Type an item and press Enter"
				/>
			)}
		/>
	);
}

/**
 * School Settings → one section of the school profile. Everything here is published on the school
 * website through GET /api/public/school.
 */
export default function SchoolProfilePanel({ section }: { section: ProfileSection }) {
	const api = useSchoolApi();
	const { enqueueSnackbar } = useSnackbar();
	const [form, setForm] = useState<SchoolProfile | null>(null);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState('');

	useEffect(() => {
		if (!api.ready) return;

		api.get<SchoolProfileResponse>('/profile')
			.then((r) => setForm(r.profile))
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

	const set = <K extends keyof SchoolProfile>(key: K, value: SchoolProfile[K]) =>
		setForm((f) => (f ? { ...f, [key]: value } : f));

	const field = (key: keyof SchoolProfile, label: string, extra: object = {}) => (
		<TextField
			fullWidth
			label={label}
			value={(form[key] as string | null) ?? ''}
			onChange={(e) => set(key, e.target.value as never)}
			{...extra}
		/>
	);
	const longField = (key: keyof SchoolProfile, label: string, rows = 4, helperText?: string) =>
		field(key, label, { multiline: true, minRows: rows, helperText });

	const save = async () => {
		setSaving(true);
		setError('');
		try {
			// Rows left completely blank are dropped rather than rejected
			const cleaned: SchoolProfile = {
				...form,
				highlights: form.highlights.filter((h) => h.label.trim() || h.value.trim()),
				facilities: form.facilities.filter((f) => f.name.trim() || f.description.trim())
			};
			const body = Object.fromEntries(SECTION_FIELDS[section].map((k) => [k, cleaned[k]]));
			const r = await api.put<SchoolProfileResponse>('/profile', body);
			setForm(r.profile);
			enqueueSnackbar('School information saved', { variant: 'success' });
		} catch (e) {
			setError(errorMessage(e));
		} finally {
			setSaving(false);
		}
	};

	const saveBar = (
		<div className="flex flex-wrap items-center gap-4">
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
				Save changes
			</Button>
			<Typography className="text-secondary text-xs">
				Shown on the school website. Last saved {new Date(form.updatedAt).toLocaleString('en-KE')}.
			</Typography>
		</div>
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

			{section === 'info' && (
				<>
					<Section
						title="Identity"
						hint="The school's name, branding and registration details."
					>
						<Grid2>
							{field('name', 'School name', { required: true })}
							{field('shortName', 'Short name / initials', { placeholder: 'e.g. JFA' })}
							{field('motto', 'Motto')}
							{field('tagline', 'Tagline', { placeholder: 'One line for the website banner' })}
						</Grid2>
						<ImageField
							label="Logo / crest"
							value={form.logoUrl}
							onChange={(v) => set('logoUrl', v)}
						/>
						<Grid2>
							<TextField
								fullWidth
								label="Year founded"
								type="number"
								value={form.foundedYear ?? ''}
								onChange={(e) => set('foundedYear', e.target.value ? Number(e.target.value) : null)}
							/>
							{field('registrationNumber', 'Registration number', {
								placeholder: 'Ministry of Education reg. no.'
							})}
							{field('curriculum', 'Curriculum', { placeholder: 'e.g. CBC, 8-4-4, IGCSE' })}
							{field('levelsOffered', 'Levels offered', { placeholder: 'e.g. Pre-primary to Grade 9' })}
							{field('schoolType', 'School type', {
								select: true,
								children: ['Day', 'Boarding', 'Day & Boarding'].map((o) => (
									<MenuItem
										key={o}
										value={o}
									>
										{o}
									</MenuItem>
								))
							})}
							{field('gender', 'Students', {
								select: true,
								children: ['Mixed', 'Boys', 'Girls'].map((o) => (
									<MenuItem
										key={o}
										value={o}
									>
										{o}
									</MenuItem>
								))
							})}
						</Grid2>
					</Section>

					<Section
						title="Contact"
						hint="How parents and visitors reach the school."
					>
						<Grid2>
							{field('email', 'Email', { type: 'email' })}
							{field('phone', 'Main phone')}
							{field('altPhone', 'Other phone')}
							{field('whatsapp', 'WhatsApp number')}
							{field('postalAddress', 'Postal address', { placeholder: 'P.O. Box …' })}
							{field('county', 'County')}
						</Grid2>
						{longField('physicalAddress', 'Physical location / directions', 2)}
						<Grid2>
							{field('mapUrl', 'Google Maps link', { placeholder: 'https://maps.google.com/…' })}
							{field('website', 'Website', { placeholder: 'https://…' })}
						</Grid2>
						{field('officeHours', 'Office hours', { placeholder: 'Mon–Fri 8:00am – 5:00pm' })}
					</Section>

					<Section title="Social media">
						<Grid2>
							{SOCIALS.map((s) => (
								<TextField
									key={s.key}
									fullWidth
									label={s.label}
									placeholder="https://…"
									value={form.socialLinks[s.key] ?? ''}
									onChange={(e) =>
										set('socialLinks', { ...form.socialLinks, [s.key]: e.target.value })
									}
									slotProps={{
										input: {
											startAdornment: (
												<InputAdornment position="start">
													<FuseSvgIcon size={18}>{s.icon}</FuseSvgIcon>
												</InputAdornment>
											)
										}
									}}
								/>
							))}
						</Grid2>
					</Section>
				</>
			)}

			{section === 'about' && (
				<>
					<Section
						title="About the school"
						hint="Shown on the website's About page."
					>
						{longField('about', 'About us', 6, 'An introduction to the school')}
						{longField('history', 'Our history', 4)}
						<Grid2>
							{longField('mission', 'Mission', 3)}
							{longField('vision', 'Vision', 3)}
						</Grid2>
						<ChipList
							label="Core values"
							value={form.coreValues}
							onChange={(v) => set('coreValues', v)}
							placeholder="e.g. Integrity"
						/>
					</Section>

					<Section
						title="Leadership"
						hint="The head of school and their welcome message."
					>
						<Grid2>
							{field('principalName', 'Name')}
							{field('principalTitle', 'Title', { placeholder: 'e.g. Principal, Head Teacher' })}
						</Grid2>
						<ImageField
							label="Photo"
							variant="circular"
							value={form.principalPhotoUrl}
							onChange={(v) => set('principalPhotoUrl', v)}
						/>
						{longField('principalMessage', 'Welcome message', 6)}
					</Section>
				</>
			)}

			{section === 'website' && (
				<>
					<Section
						title="Home page"
						hint="Banner image and headline numbers for the home page."
					>
						<ImageField
							label="Banner image"
							value={form.heroImageUrl}
							onChange={(v) => set('heroImageUrl', v)}
						/>
						<div className="flex flex-col gap-3">
							{form.highlights.map((h, i) => (
								<div
									key={i}
									className="flex items-center gap-3"
								>
									<TextField
										size="small"
										label="Value"
										placeholder="800+"
										className="w-32 shrink-0"
										value={h.value}
										onChange={(e) =>
											set(
												'highlights',
												form.highlights.map((x, j) =>
													j === i ? { ...x, value: e.target.value } : x
												)
											)
										}
									/>
									<TextField
										size="small"
										fullWidth
										label="Label"
										placeholder="Students enrolled"
										value={h.label}
										onChange={(e) =>
											set(
												'highlights',
												form.highlights.map((x, j) =>
													j === i ? { ...x, label: e.target.value } : x
												)
											)
										}
									/>
									<IconButton
										onClick={() =>
											set(
												'highlights',
												form.highlights.filter((_, j) => j !== i)
											)
										}
									>
										<FuseSvgIcon size={18}>lucide:trash-2</FuseSvgIcon>
									</IconButton>
								</div>
							))}
							<div>
								<Button
									size="small"
									startIcon={<FuseSvgIcon size={16}>lucide:plus</FuseSvgIcon>}
									onClick={() => set('highlights', [...form.highlights, { value: '', label: '' }])}
									disabled={form.highlights.length >= 12}
								>
									Add a highlight
								</Button>
							</div>
						</div>
					</Section>

					<Section
						title="Facilities"
						hint="Classrooms, labs, sports, transport, boarding…"
					>
						{form.facilities.map((f, i) => (
							<div
								key={i}
								className="flex items-start gap-3 rounded-xl border p-4"
							>
								<div className="flex flex-1 flex-col gap-3">
									<TextField
										size="small"
										label="Facility"
										value={f.name}
										onChange={(e) =>
											set(
												'facilities',
												form.facilities.map((x, j) =>
													j === i ? { ...x, name: e.target.value } : x
												)
											)
										}
									/>
									<TextField
										size="small"
										label="Description"
										multiline
										minRows={2}
										value={f.description}
										onChange={(e) =>
											set(
												'facilities',
												form.facilities.map((x, j) =>
													j === i ? { ...x, description: e.target.value } : x
												)
											)
										}
									/>
								</div>
								<IconButton
									onClick={() =>
										set(
											'facilities',
											form.facilities.filter((_, j) => j !== i)
										)
									}
								>
									<FuseSvgIcon size={18}>lucide:trash-2</FuseSvgIcon>
								</IconButton>
							</div>
						))}
						<div>
							<Button
								size="small"
								startIcon={<FuseSvgIcon size={16}>lucide:plus</FuseSvgIcon>}
								onClick={() => set('facilities', [...form.facilities, { name: '', description: '' }])}
								disabled={form.facilities.length >= 30}
							>
								Add a facility
							</Button>
						</div>
					</Section>

					<Section
						title="Admissions"
						hint="What prospective parents see on the Admissions page."
					>
						<FormControlLabel
							control={
								<Switch
									checked={form.admissionsOpen}
									onChange={(e) => set('admissionsOpen', e.target.checked)}
								/>
							}
							label={form.admissionsOpen ? 'Admissions are open' : 'Admissions are closed'}
						/>
						{longField(
							'admissionsInfo',
							'How to apply',
							4,
							'Process, intake dates, fees deposit, contacts…'
						)}
						<ChipList
							label="Documents required"
							value={form.admissionRequirements}
							onChange={(v) => set('admissionRequirements', v)}
							placeholder="e.g. Birth certificate"
						/>
					</Section>
				</>
			)}

			{saveBar}
		</div>
	);
}
