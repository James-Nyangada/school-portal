'use client';

import { useSession } from 'next-auth/react';
import { useState, useEffect } from 'react';
import {
	Paper,
	Typography,
	Stepper,
	Step,
	StepLabel,
	Button,
	TextField,
	Select,
	MenuItem,
	FormControl,
	InputLabel,
	Grid,
	Alert,
	CircularProgress,
	OutlinedInput,
	Checkbox,
	ListItemText
} from '@mui/material';
import FusePageSimple from '@fuse/core/FusePageSimple';
import AuthGuardRedirect from '@auth/AuthGuardRedirect';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';

const steps = ['Student Bio Data', 'Parent/Guardian Details', 'Class & Subjects', 'Document Upload', 'Review & Submit'];

const schema = z.object({
	firstName: z.string().min(1, 'First name is required'),
	lastName: z.string().min(1, 'Last name is required'),
	dob: z.string().min(1, 'Date of birth is required'),
	gender: z.string().min(1, 'Gender is required'),
	previousSchool: z.string().optional(),
	medicalNotes: z.string().optional(),
	admissionNumber: z.string().min(1, 'Admission number is required'),
	nemisNumber: z.string().min(1, 'NEMIS number is required'),
	studentEmail: z.string().email('Invalid student email').min(1, 'Student email is required'),
	studentPassword: z.string().min(6, 'Password must be at least 6 characters').optional().or(z.literal('')),
	parentName: z.string().min(1, 'Parent name is required'),
	parentPhone: z.string().min(1, 'Parent phone is required'),
	parentEmail: z.string().email('Invalid parent email').optional().or(z.literal('')),
	parentRelationship: z.string().min(1, 'Relationship is required'),
	parentPassword: z.string().min(6, 'Password must be at least 6 characters').optional().or(z.literal('')),
	nationalId: z.string().optional(),
	classId: z.string().min(1, 'Class placement is required'),
	subjectIds: z.array(z.string()).min(1, 'Select at least one subject'),
	birthCertificateUrl: z.string().optional().or(z.literal('')),
	reportCardUrl: z.string().optional().or(z.literal('')),
	passportPhotoUrl: z.string().optional().or(z.literal(''))
});

type FormData = z.infer<typeof schema>;

const ITEM_HEIGHT = 48;
const ITEM_PADDING_TOP = 8;
const MenuProps = {
	PaperProps: {
		style: {
			maxHeight: ITEM_HEIGHT * 4.5 + ITEM_PADDING_TOP,
			width: 250
		}
	}
};

export default function AdminAdmissions() {
	const { data: session } = useSession();
	const token = (session as any)?.backendToken;
	const [activeStep, setActiveStep] = useState(0);
	const [submitResult, setSubmitResult] = useState<{ success?: boolean; message?: string } | null>(null);
	const [uploadingField, setUploadingField] = useState<string | null>(null);

	const [classes, setClasses] = useState<any[]>([]);
	const [subjects, setSubjects] = useState<any[]>([]);
	const [existingParent, setExistingParent] = useState<any | null>(null);

	const {
		control,
		handleSubmit,
		trigger,
		getValues,
		reset,
		setValue,
		watch,
		formState: { errors }
	} = useForm<FormData>({
		resolver: zodResolver(schema),
		defaultValues: {
			firstName: '',
			lastName: '',
			dob: '',
			gender: '',
			previousSchool: '',
			medicalNotes: '',
			admissionNumber: '',
			nemisNumber: '',
			studentEmail: '',
			studentPassword: '',
			parentName: '',
			parentPhone: '',
			parentEmail: '',
			parentRelationship: '',
			parentPassword: '',
			nationalId: '',
			classId: '',
			subjectIds: [],
			birthCertificateUrl: '',
			reportCardUrl: '',
			passportPhotoUrl: ''
		}
	});

	const parentPhone = watch('parentPhone');

	useEffect(() => {
		if (token) {
			fetch('http://localhost:4000/api/classes', { headers: { Authorization: `Bearer ${token}` } })
				.then((res) => res.json())
				.then((data) => setClasses(data || []))
				.catch((err) => console.error(err));

			fetch('http://localhost:4000/api/subjects', { headers: { Authorization: `Bearer ${token}` } })
				.then((res) => res.json())
				.then((data) => setSubjects(data || []))
				.catch((err) => console.error(err));
		}
	}, [token]);

	useEffect(() => {
		if (!token || !parentPhone || parentPhone.length < 5) {
			setExistingParent(null);
			return;
		}

		const delayDebounceFn = setTimeout(() => {
			fetch(`http://localhost:4000/api/users?role=PARENT&search=${parentPhone}`, {
				headers: { Authorization: `Bearer ${token}` }
			})
				.then((res) => res.json())
				.then((data) => {
					const matchedParent = data.users?.find((u: any) => u.phone === parentPhone);

					if (matchedParent) {
						setExistingParent(matchedParent);
						setValue('parentName', `${matchedParent.firstName} ${matchedParent.lastName}`);
						setValue('parentEmail', matchedParent.email || '');
						setValue('nationalId', matchedParent.nationalId || '');
					} else {
						setExistingParent(null);
					}
				})
				.catch((err) => console.error(err));
		}, 500);

		return () => clearTimeout(delayDebounceFn);
	}, [parentPhone, token, setValue]);

	const handleFileUpload = async (
		e: React.ChangeEvent<HTMLInputElement>,
		fieldName: 'birthCertificateUrl' | 'reportCardUrl' | 'passportPhotoUrl'
	) => {
		const file = e.target.files?.[0];

		if (!file) return;

		setUploadingField(fieldName);
		const formData = new FormData();
		formData.append('file', file);

		try {
			const res = await fetch('http://localhost:4000/api/upload', {
				method: 'POST',
				headers: {
					Authorization: `Bearer ${token}`
				},
				body: formData
			});

			if (res.ok) {
				const data = await res.json();
				setValue(fieldName, data.url);
			} else {
				const err = await res.json();
				alert(err.error || 'Failed to upload file');
			}
		} catch (err: any) {
			alert(err.message || 'An error occurred during upload');
		} finally {
			setUploadingField(null);
		}
	};

	const handleNext = async () => {
		let isValid = false;

		if (activeStep === 0)
			isValid = await trigger([
				'firstName',
				'lastName',
				'dob',
				'gender',
				'previousSchool',
				'medicalNotes',
				'studentEmail',
				'studentPassword',
				'admissionNumber',
				'nemisNumber'
			]);
		else if (activeStep === 1)
			isValid = await trigger([
				'parentName',
				'parentPhone',
				'parentEmail',
				'parentRelationship',
				'parentPassword',
				'nationalId'
			]);
		else if (activeStep === 2) isValid = await trigger(['classId', 'subjectIds']);
		else if (activeStep === 3) isValid = true;

		if (isValid) setActiveStep((prev) => prev + 1);
	};

	const handleBack = () => setActiveStep((prev) => prev - 1);

	const onSubmit = async (data: FormData) => {
		try {
			const res = await fetch('http://localhost:4000/api/students/admit', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${token}`
				},
				body: JSON.stringify(data)
			});

			if (res.ok) {
				setSubmitResult({ success: true, message: 'Student admitted successfully' });
				reset();
				setActiveStep(0);
			} else {
				const error = await res.json();
				setSubmitResult({ success: false, message: error.error || 'Failed to admit student' });
			}
		} catch (e: any) {
			setSubmitResult({ success: false, message: e.message || 'An error occurred' });
		}
	};

	const renderStepContent = (step: number) => {
		switch (step) {
			case 0:
				return (
					<Grid
						container
						spacing={3}
					>
						<Grid size={{ xs: 12, sm: 6 }}>
							<Controller
								name="admissionNumber"
								control={control}
								render={({ field }) => (
									<TextField
										{...field}
										label="Admission Number"
										fullWidth
										error={!!errors.admissionNumber}
										helperText={errors.admissionNumber?.message}
										placeholder="e.g. ADM101"
									/>
								)}
							/>
						</Grid>
						<Grid size={{ xs: 12, sm: 6 }}>
							<Controller
								name="nemisNumber"
								control={control}
								render={({ field }) => (
									<TextField
										{...field}
										label="NEMIS Number"
										fullWidth
										error={!!errors.nemisNumber}
										helperText={errors.nemisNumber?.message}
										placeholder="e.g. UPI8831A"
									/>
								)}
							/>
						</Grid>
						<Grid size={{ xs: 12, sm: 6 }}>
							<Controller
								name="firstName"
								control={control}
								render={({ field }) => (
									<TextField
										{...field}
										label="First Name"
										fullWidth
										error={!!errors.firstName}
										helperText={errors.firstName?.message}
									/>
								)}
							/>
						</Grid>
						<Grid size={{ xs: 12, sm: 6 }}>
							<Controller
								name="lastName"
								control={control}
								render={({ field }) => (
									<TextField
										{...field}
										label="Last Name"
										fullWidth
										error={!!errors.lastName}
										helperText={errors.lastName?.message}
									/>
								)}
							/>
						</Grid>
						<Grid size={{ xs: 12, sm: 6 }}>
							<Controller
								name="dob"
								control={control}
								render={({ field }) => (
									<TextField
										{...field}
										label="Date of Birth"
										type="date"
										InputLabelProps={{ shrink: true }}
										fullWidth
										error={!!errors.dob}
										helperText={errors.dob?.message}
									/>
								)}
							/>
						</Grid>
						<Grid size={{ xs: 12, sm: 6 }}>
							<Controller
								name="gender"
								control={control}
								render={({ field }) => (
									<FormControl
										fullWidth
										error={!!errors.gender}
									>
										<InputLabel>Gender</InputLabel>
										<Select
											{...field}
											label="Gender"
										>
											<MenuItem value="Male">Male</MenuItem>
											<MenuItem value="Female">Female</MenuItem>
										</Select>
									</FormControl>
								)}
							/>
						</Grid>
						<Grid size={12}>
							<Controller
								name="previousSchool"
								control={control}
								render={({ field }) => (
									<TextField
										{...field}
										label="Previous School (Optional)"
										fullWidth
									/>
								)}
							/>
						</Grid>
						<Grid size={12}>
							<Controller
								name="medicalNotes"
								control={control}
								render={({ field }) => (
									<TextField
										{...field}
										label="Medical Notes (Optional)"
										multiline
										rows={3}
										fullWidth
									/>
								)}
							/>
						</Grid>
						<Grid size={12}>
							<Typography
								variant="h6"
								className="text-secondary mt-16"
							>
								Portal Account Details
							</Typography>
						</Grid>
						<Grid size={{ xs: 12, sm: 6 }}>
							<Controller
								name="studentEmail"
								control={control}
								render={({ field }) => (
									<TextField
										{...field}
										label="Student Portal Email"
										type="email"
										fullWidth
										error={!!errors.studentEmail}
										helperText={errors.studentEmail?.message}
									/>
								)}
							/>
						</Grid>
						<Grid size={{ xs: 12, sm: 6 }}>
							<Controller
								name="studentPassword"
								control={control}
								render={({ field }) => (
									<TextField
										{...field}
										label="Student Portal Password"
										type="password"
										fullWidth
										error={!!errors.studentPassword}
										helperText={errors.studentPassword?.message}
										placeholder="Leave blank to auto-generate"
									/>
								)}
							/>
						</Grid>
					</Grid>
				);
			case 1:
				return (
					<Grid
						container
						spacing={3}
					>
						{existingParent && (
							<Grid size={12}>
								<Alert
									severity="info"
									className="rounded-8"
								>
									Existing parent account found for{' '}
									<strong>
										{existingParent.firstName} {existingParent.lastName}
									</strong>
									. You can safely skip setting parent email and password.
								</Alert>
							</Grid>
						)}
						<Grid size={{ xs: 12, sm: 6 }}>
							<Controller
								name="parentName"
								control={control}
								render={({ field }) => (
									<TextField
										{...field}
										label="Full Name"
										fullWidth
										error={!!errors.parentName}
										helperText={errors.parentName?.message}
									/>
								)}
							/>
						</Grid>
						<Grid size={{ xs: 12, sm: 6 }}>
							<Controller
								name="parentRelationship"
								control={control}
								render={({ field }) => (
									<FormControl
										fullWidth
										error={!!errors.parentRelationship}
									>
										<InputLabel>Relationship</InputLabel>
										<Select
											{...field}
											label="Relationship"
										>
											<MenuItem value="Father">Father</MenuItem>
											<MenuItem value="Mother">Mother</MenuItem>
											<MenuItem value="Guardian">Guardian</MenuItem>
										</Select>
									</FormControl>
								)}
							/>
						</Grid>
						<Grid size={{ xs: 12, sm: 6 }}>
							<Controller
								name="parentPhone"
								control={control}
								render={({ field }) => (
									<TextField
										{...field}
										label="Phone Number"
										fullWidth
										error={!!errors.parentPhone}
										helperText={errors.parentPhone?.message}
									/>
								)}
							/>
						</Grid>
						<Grid size={{ xs: 12, sm: 6 }}>
							<Controller
								name="parentEmail"
								control={control}
								render={({ field }) => (
									<TextField
										{...field}
										label="Email Address (Optional)"
										type="email"
										fullWidth
										error={!!errors.parentEmail}
										helperText={errors.parentEmail?.message}
									/>
								)}
							/>
						</Grid>
						<Grid size={{ xs: 12, sm: 6 }}>
							<Controller
								name="parentPassword"
								control={control}
								render={({ field }) => (
									<TextField
										{...field}
										label="Parent Portal Password"
										type="password"
										fullWidth
										error={!!errors.parentPassword}
										helperText={errors.parentPassword?.message}
										placeholder="Leave blank to auto-generate"
									/>
								)}
							/>
						</Grid>
						<Grid size={{ xs: 12, sm: 6 }}>
							<Controller
								name="nationalId"
								control={control}
								render={({ field }) => (
									<TextField
										{...field}
										label="National ID (Optional)"
										fullWidth
									/>
								)}
							/>
						</Grid>
					</Grid>
				);
			case 2:
				return (
					<Grid
						container
						spacing={3}
					>
						<Grid size={12}>
							<Controller
								name="classId"
								control={control}
								render={({ field }) => (
									<FormControl
										fullWidth
										error={!!errors.classId}
									>
										<InputLabel>Class Placement</InputLabel>
										<Select
											{...field}
											label="Class Placement"
										>
											{classes.map((cls) => (
												<MenuItem
													key={cls.id}
													value={cls.id}
												>
													{cls.name}
												</MenuItem>
											))}
											{classes.length === 0 && (
												<MenuItem
													disabled
													value=""
												>
													No classes found
												</MenuItem>
											)}
										</Select>
									</FormControl>
								)}
							/>
						</Grid>
						<Grid size={12}>
							<Controller
								name="subjectIds"
								control={control}
								render={({ field }) => (
									<FormControl
										fullWidth
										error={!!errors.subjectIds}
									>
										<InputLabel>Subjects</InputLabel>
										<Select
											{...field}
											multiple
											value={Array.isArray(field.value) ? field.value : []}
											input={<OutlinedInput label="Subjects" />}
											renderValue={(selected) =>
												Array.isArray(selected)
													? selected
															.map((id) => subjects.find((s) => s.id === id)?.name || id)
															.join(', ')
													: ''
											}
											MenuProps={MenuProps}
										>
											{subjects.map((subject) => (
												<MenuItem
													key={subject.id}
													value={subject.id}
												>
													<Checkbox
														checked={
															Array.isArray(field.value) &&
															field.value.indexOf(subject.id) > -1
														}
													/>
													<ListItemText primary={subject.name} />
												</MenuItem>
											))}
											{subjects.length === 0 && (
												<MenuItem
													disabled
													value=""
												>
													No subjects found
												</MenuItem>
											)}
										</Select>
									</FormControl>
								)}
							/>
						</Grid>
					</Grid>
				);
			case 3:
				const currentBirthCert = watch('birthCertificateUrl');
				const currentReportCard = watch('reportCardUrl');
				const currentPhoto = watch('passportPhotoUrl');

				return (
					<div className="flex flex-col gap-24">
						<Typography variant="h6">Upload Documents (Optional)</Typography>

						{/* Birth Certificate */}
						<Paper
							variant="outlined"
							className="rounded-8 flex items-center justify-between p-16"
						>
							<div>
								<Typography
									variant="subtitle1"
									fontWeight="bold"
								>
									Birth Certificate
								</Typography>
								<Typography
									variant="body2"
									color="textSecondary"
								>
									{currentBirthCert ? 'Uploaded' : 'No document selected'}
								</Typography>
							</div>
							<div className="flex items-center gap-16">
								{uploadingField === 'birthCertificateUrl' && <CircularProgress size={24} />}
								{currentBirthCert && (
									<Button
										size="small"
										variant="text"
										color="primary"
										href={currentBirthCert}
										target="_blank"
										rel="noopener noreferrer"
									>
										View
									</Button>
								)}
								<Button
									variant="outlined"
									component="label"
									disabled={!!uploadingField}
								>
									{currentBirthCert ? 'Replace File' : 'Choose File'}
									<input
										type="file"
										hidden
										onChange={(e) => handleFileUpload(e, 'birthCertificateUrl')}
										accept="image/*,application/pdf"
									/>
								</Button>
							</div>
						</Paper>

						{/* Report Card */}
						<Paper
							variant="outlined"
							className="rounded-8 flex items-center justify-between p-16"
						>
							<div>
								<Typography
									variant="subtitle1"
									fontWeight="bold"
								>
									Previous Report Card
								</Typography>
								<Typography
									variant="body2"
									color="textSecondary"
								>
									{currentReportCard ? 'Uploaded' : 'No document selected'}
								</Typography>
							</div>
							<div className="flex items-center gap-16">
								{uploadingField === 'reportCardUrl' && <CircularProgress size={24} />}
								{currentReportCard && (
									<Button
										size="small"
										variant="text"
										color="primary"
										href={currentReportCard}
										target="_blank"
										rel="noopener noreferrer"
									>
										View
									</Button>
								)}
								<Button
									variant="outlined"
									component="label"
									disabled={!!uploadingField}
								>
									{currentReportCard ? 'Replace File' : 'Choose File'}
									<input
										type="file"
										hidden
										onChange={(e) => handleFileUpload(e, 'reportCardUrl')}
										accept="image/*,application/pdf"
									/>
								</Button>
							</div>
						</Paper>

						{/* Passport Photo */}
						<Paper
							variant="outlined"
							className="rounded-8 flex items-center justify-between p-16"
						>
							<div>
								<Typography
									variant="subtitle1"
									fontWeight="bold"
								>
									Passport Photo
								</Typography>
								<Typography
									variant="body2"
									color="textSecondary"
								>
									{currentPhoto ? 'Uploaded' : 'No photo selected'}
								</Typography>
							</div>
							<div className="flex items-center gap-16">
								{uploadingField === 'passportPhotoUrl' && <CircularProgress size={24} />}
								{currentPhoto && (
									<Button
										size="small"
										variant="text"
										color="primary"
										href={currentPhoto}
										target="_blank"
										rel="noopener noreferrer"
									>
										View
									</Button>
								)}
								<Button
									variant="outlined"
									component="label"
									disabled={!!uploadingField}
								>
									{currentPhoto ? 'Replace Photo' : 'Choose Photo'}
									<input
										type="file"
										hidden
										onChange={(e) => handleFileUpload(e, 'passportPhotoUrl')}
										accept="image/*"
									/>
								</Button>
							</div>
						</Paper>
					</div>
				);
			case 4:
				const values = getValues();
				return (
					<Grid
						container
						spacing={2}
					>
						<Grid size={12}>
							<Typography variant="h6">Review Information</Typography>
						</Grid>
						<Grid size={6}>
							<Typography
								variant="subtitle2"
								color="textSecondary"
							>
								Student Name
							</Typography>
							<Typography>
								{values.firstName} {values.lastName}
							</Typography>
						</Grid>
						<Grid size={6}>
							<Typography
								variant="subtitle2"
								color="textSecondary"
							>
								Admission Number
							</Typography>
							<Typography>{values.admissionNumber}</Typography>
						</Grid>
						<Grid size={6}>
							<Typography
								variant="subtitle2"
								color="textSecondary"
							>
								NEMIS Number
							</Typography>
							<Typography>{values.nemisNumber}</Typography>
						</Grid>
						<Grid size={6}>
							<Typography
								variant="subtitle2"
								color="textSecondary"
							>
								Date of Birth
							</Typography>
							<Typography>{values.dob}</Typography>
						</Grid>
						<Grid size={6}>
							<Typography
								variant="subtitle2"
								color="textSecondary"
							>
								Student Portal Email
							</Typography>
							<Typography>{values.studentEmail}</Typography>
						</Grid>
						<Grid size={6}>
							<Typography
								variant="subtitle2"
								color="textSecondary"
							>
								Student Portal Password
							</Typography>
							<Typography>{values.studentPassword ? '********' : 'Auto-generated'}</Typography>
						</Grid>
						<Grid size={6}>
							<Typography
								variant="subtitle2"
								color="textSecondary"
							>
								Parent/Guardian
							</Typography>
							<Typography>
								{values.parentName} ({values.parentRelationship})
							</Typography>
						</Grid>
						<Grid size={6}>
							<Typography
								variant="subtitle2"
								color="textSecondary"
							>
								Parent Phone
							</Typography>
							<Typography>{values.parentPhone}</Typography>
						</Grid>
						<Grid size={6}>
							<Typography
								variant="subtitle2"
								color="textSecondary"
							>
								Parent Email
							</Typography>
							<Typography>{values.parentEmail || 'N/A'}</Typography>
						</Grid>
						<Grid size={6}>
							<Typography
								variant="subtitle2"
								color="textSecondary"
							>
								Parent Portal Password
							</Typography>
							<Typography>{values.parentPassword ? '********' : 'Auto-generated'}</Typography>
						</Grid>
						<Grid size={6}>
							<Typography
								variant="subtitle2"
								color="textSecondary"
							>
								Class Placement
							</Typography>
							<Typography>
								{classes.find((c) => c.id === values.classId)?.name || values.classId}
							</Typography>
						</Grid>
						<Grid size={6}>
							<Typography
								variant="subtitle2"
								color="textSecondary"
							>
								Subjects
							</Typography>
							<Typography>
								{Array.isArray(values.subjectIds)
									? values.subjectIds
											.map((id) => subjects.find((s) => s.id === id)?.name || id)
											.join(', ')
									: 'None'}
							</Typography>
						</Grid>
						<Grid size={12}>
							<Typography
								variant="subtitle2"
								color="textSecondary"
							>
								Uploaded Documents
							</Typography>
							<Typography variant="body2">
								{[
									values.birthCertificateUrl && 'Birth Certificate',
									values.reportCardUrl && 'Report Card',
									values.passportPhotoUrl && 'Passport Photo'
								]
									.filter(Boolean)
									.join(', ') || 'None'}
							</Typography>
						</Grid>
					</Grid>
				);
			default:
				return 'Unknown step';
		}
	};

	return (
		<AuthGuardRedirect auth={['SUPER_ADMIN', 'ADMIN']}>
			<FusePageSimple
				header={
					<div className="flex w-full flex-col px-24 pt-24">
						<Typography className="text-4xl font-extrabold tracking-tight">
							New Student Admission
						</Typography>
					</div>
				}
				content={
					<div className="mx-auto flex w-full max-w-7xl flex-col gap-32 px-24 py-32">
						{submitResult && (
							<Alert
								severity={submitResult.success ? 'success' : 'error'}
								className="mb-24"
								onClose={() => setSubmitResult(null)}
							>
								{submitResult.message}
							</Alert>
						)}
						<Paper className="bg-card flex flex-auto flex-col rounded-2xl p-24 shadow">
							<Stepper
								activeStep={activeStep}
								alternativeLabel
								className="mb-32"
							>
								{steps.map((label) => (
									<Step key={label}>
										<StepLabel>{label}</StepLabel>
									</Step>
								))}
							</Stepper>

							<div className="min-h-[300px]">{renderStepContent(activeStep)}</div>

							<div className="mt-32 flex justify-between">
								<Button
									disabled={activeStep === 0 || !!uploadingField}
									onClick={handleBack}
								>
									Back
								</Button>
								{activeStep === steps.length - 1 ? (
									<Button
										variant="contained"
										color="secondary"
										className="rounded-full"
										onClick={handleSubmit(onSubmit)}
										disabled={!!uploadingField}
									>
										Submit Admission
									</Button>
								) : (
									<Button
										variant="contained"
										color="secondary"
										className="rounded-full"
										onClick={handleNext}
										disabled={!!uploadingField}
									>
										Next
									</Button>
								)}
							</div>
						</Paper>
					</div>
				}
			/>
		</AuthGuardRedirect>
	);
}
