'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useMemo } from 'react';
import {
	Box,
	Paper,
	Typography,
	Tabs,
	Tab,
	Button,
	Chip,
	CircularProgress,
	Dialog,
	DialogTitle,
	DialogContent,
	DialogActions,
	TextField,
	MenuItem,
	FormControl,
	InputLabel,
	Select,
	Checkbox,
	ListItemText,
	OutlinedInput,
	Grid
} from '@mui/material';
import FusePageSimple from '@fuse/core/FusePageSimple';
import AuthGuardRedirect from '@auth/AuthGuardRedirect';
import FuseSvgIcon from '@fuse/core/FuseSvgIcon';
import { MaterialReactTable, type MRT_ColumnDef } from 'material-react-table';
import { BACKEND_URL } from '@/lib/backend';
import useToast from '@/hooks/useToast';
import { ROLE_HOME } from '@/lib/roleHome';

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

export default function SuperAdminUsers() {
	const { notify, confirm, prompt } = useToast();
	const { data: session, update } = useSession();
	const router = useRouter();
	const token = (session as any)?.backendToken;
	const [users, setUsers] = useState<any[]>([]);
	const [loading, setLoading] = useState(true);
	const [roleTab, setRoleTab] = useState('All');

	const [classes, setClasses] = useState<any[]>([]);
	const [subjects, setSubjects] = useState<any[]>([]);

	// Dialog state
	const [openCreate, setOpenCreate] = useState(false);
	const [formData, setFormData] = useState({
		role: 'ADMIN',
		firstName: '',
		lastName: '',
		email: '',
		phone: '',
		customTempPassword: ''
	});

	// Open Edit Student Dialog
	const [openEdit, setOpenEdit] = useState(false);
	const [editTab, setEditTab] = useState(0);
	const [uploadingField, setUploadingField] = useState<string | null>(null);
	const [editFormData, setEditFormData] = useState({
		id: '',
		firstName: '',
		lastName: '',
		dob: '',
		gender: '',
		previousSchool: '',
		medicalNotes: '',
		studentEmail: '',
		phone: '',
		admissionNumber: '',
		nemisNumber: '',
		classId: '',
		birthCertificateUrl: '',
		reportCardUrl: '',
		passportPhotoUrl: '',
		// Parent info
		parentName: '',
		parentPhone: '',
		parentEmail: '',
		parentRelationship: '',
		parentNationalId: '',
		// Selected subjects
		subjectIds: [] as string[]
	});

	const fetchClassesAndSubjects = () => {
		if (!token) return;

		fetch(`${BACKEND_URL}/api/classes`, { headers: { Authorization: `Bearer ${token}` } })
			.then((res) => res.json())
			.then((data) => setClasses(data || []))
			.catch((err) => console.error(err));

		fetch(`${BACKEND_URL}/api/subjects`, { headers: { Authorization: `Bearer ${token}` } })
			.then((res) => res.json())
			.then((data) => setSubjects(data || []))
			.catch((err) => console.error(err));
	};

	const fetchUsers = () => {
		if (!token) return;

		setLoading(true);
		const roleQuery = roleTab !== 'All' ? `?role=${roleTab}` : '';
		fetch(`${BACKEND_URL}/api/users${roleQuery}${roleQuery ? '&' : '?'}t=${Date.now()}`, {
			headers: {
				Authorization: `Bearer ${token}`,
				'Cache-Control': 'no-cache',
				Pragma: 'no-cache'
			}
		})
			.then((res) => {
				if (!res.ok) {
					return res.json().then((err) => {
						throw new Error(err.error || 'Failed to fetch users');
					});
				}

				return res.json();
			})
			.then((data) => {
				setUsers(data.users || []);
				setLoading(false);
			})
			.catch((err) => {
				console.error(err);
				notify(err.message || 'Error fetching users', 'error');
				setLoading(false);
			});
	};

	useEffect(() => {
		fetchUsers();
		fetchClassesAndSubjects();
	}, [token, roleTab]);

	const handleCreate = async () => {
		try {
			const res = await fetch(`${BACKEND_URL}/api/users`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${token}`
				},
				body: JSON.stringify(formData)
			});

			if (res.ok) {
				const result = await res.json();
				notify(`Account created successfully! Temporary password: ${result.tempPassword}`, 'success', {
					persist: true
				});
				setFormData({
					role: 'ADMIN',
					firstName: '',
					lastName: '',
					email: '',
					phone: '',
					customTempPassword: ''
				});
				setOpenCreate(false);
				fetchUsers();
			} else {
				notify('Failed to create user', 'error');
			}
		} catch (e) {
			console.error(e);
		}
	};

	const handleAction = async (id: string, action: string) => {
		let customTempPassword = '';

		if (action === 'FORCE_RESET') {
			const input = await prompt('Enter a custom temporary password, or leave blank to auto-generate one.', {
				title: 'Reset password',
				label: 'Custom temporary password',
				confirmText: 'Reset'
			});

			if (input === null) return;

			customTempPassword = input.trim();
		}

		const reason =
			action === 'SUSPEND'
				? await prompt('Why is this account being suspended?', {
						title: 'Suspend account',
						label: 'Reason for suspension',
						multiline: true,
						required: true,
						confirmText: 'Suspend'
					})
				: '';

		if (action === 'SUSPEND' && !reason?.trim()) return;

		try {
			const res = await fetch(`${BACKEND_URL}/api/users/${id}`, {
				method: 'PATCH',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${token}`
				},
				body: JSON.stringify({ action, reason, customTempPassword })
			});

			if (res.ok) {
				if (action === 'FORCE_RESET') {
					const data = await res.json();
					notify(`Password reset. New temporary password: ${data.tempPassword}`, 'success', {
						persist: true
					});
				} else if (
					action === 'SUSPEND' ||
					action === 'REACTIVATE' ||
					action === 'COMPLETED' ||
					action === 'TRANSFERRED'
				) {
					notify(`User status updated to ${action}`, 'success');
				}

				fetchUsers();
			}
		} catch (e) {
			console.error(e);
		}
	};

	/** Read-only view of the portal as this user; audit-logged and shown with a banner until exited. */
	const handleViewAs = async (user: {
		id: string;
		firstName?: string | null;
		lastName?: string | null;
		email?: string | null;
		phone?: string | null;
	}) => {
		const name = [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email || user.phone;
		const reason = await prompt(
			`You'll see the portal exactly as ${name} does, read-only, for up to 30 minutes. This is recorded in the audit log.`,
			{
				title: 'View as user',
				label: 'Reason (e.g. support ticket)',
				multiline: true,
				required: true,
				confirmText: 'View as'
			}
		);

		if (!reason?.trim()) return;

		try {
			const res = await fetch(`${BACKEND_URL}/api/auth/impersonate/${user.id}`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
				body: JSON.stringify({ reason })
			});
			const data = await res.json();

			if (!res.ok) {
				notify(data.error || 'Could not start view-as', 'error');
				return;
			}

			const next = await update({ viewAs: { token: data.token } });

			if (!next?.viewAs) {
				notify('Could not switch to this user. Please try again.', 'error');
				return;
			}

			router.push(ROLE_HOME[data.user.role] ?? '/');
		} catch (e) {
			console.error(e);
			notify('Could not start view-as', 'error');
		}
	};

	const handleDelete = async (id: string) => {
		if (id === (session?.user as any)?.id) {
			notify('You cannot delete yourself!', 'warning');
			return;
		}

		const confirmed = await confirm(
			'Are you sure you want to permanently delete this user from the database? This action cannot be undone.',
			{ title: 'Delete user', confirmText: 'Delete', destructive: true }
		);

		if (!confirmed) return;

		try {
			const res = await fetch(`${BACKEND_URL}/api/users/${id}`, {
				method: 'DELETE',
				headers: {
					Authorization: `Bearer ${token}`
				}
			});

			if (res.ok) {
				setUsers((prev) => prev.filter((u) => u.id !== id));
				fetchUsers();
			} else {
				const err = await res.json();
				notify(err.error || 'Failed to delete user', 'error');
			}
		} catch (e) {
			console.error(e);
		}
	};

	const handleOpenEdit = (student: any) => {
		const parentLink = student.childLinks?.[0]?.parent;
		const parentRel = student.childLinks?.[0]?.relationship || '';
		const studentSubjects = student.studentSubjects?.map((ss: any) => ss.subjectId) || [];

		setEditFormData({
			id: student.id,
			firstName: student.firstName || '',
			lastName: student.lastName || '',
			dob: student.dob ? new Date(student.dob).toISOString().split('T')[0] : '',
			gender: student.gender || '',
			previousSchool: student.previousSchool || '',
			medicalNotes: student.medicalNotes || '',
			studentEmail: student.email || '',
			phone: student.phone || '',
			admissionNumber: student.admissionNumber || '',
			nemisNumber: student.nemisNumber || '',
			classId: student.classId || '',
			birthCertificateUrl: student.birthCertificateUrl || '',
			reportCardUrl: student.reportCardUrl || '',
			passportPhotoUrl: student.passportPhotoUrl || '',
			parentName: parentLink ? `${parentLink.firstName} ${parentLink.lastName}` : '',
			parentPhone: parentLink ? parentLink.phone || '' : '',
			parentEmail: parentLink ? parentLink.email || '' : '',
			parentRelationship: parentRel || 'Guardian',
			parentNationalId: parentLink ? parentLink.nationalId || '' : '',
			subjectIds: studentSubjects
		});
		setEditTab(0);
		setOpenEdit(true);
	};

	const handleFileUpload = async (
		e: React.ChangeEvent<HTMLInputElement>,
		fieldName: 'birthCertificateUrl' | 'reportCardUrl' | 'passportPhotoUrl'
	) => {
		const file = e.target.files?.[0];

		if (!file) return;

		setUploadingField(fieldName);
		const uploadData = new FormData();
		uploadData.append('file', file);

		try {
			const res = await fetch(`${BACKEND_URL}/api/upload`, {
				method: 'POST',
				headers: {
					Authorization: `Bearer ${token}`
				},
				body: uploadData
			});

			if (res.ok) {
				const result = await res.json();
				setEditFormData((prev) => ({ ...prev, [fieldName]: result.url }));
			} else {
				const err = await res.json();
				notify(err.error || 'Failed to upload file', 'error');
			}
		} catch (err: any) {
			notify(err.message || 'An error occurred during upload', 'error');
		} finally {
			setUploadingField(null);
		}
	};

	const handleSaveEdit = async () => {
		try {
			const res = await fetch(`${BACKEND_URL}/api/students/${editFormData.id}`, {
				method: 'PATCH',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${token}`
				},
				body: JSON.stringify(editFormData)
			});

			if (res.ok) {
				notify('Student details updated successfully!', 'success');
				setOpenEdit(false);
				fetchUsers();
			} else {
				const err = await res.json();
				notify(err.error || 'Failed to update student details', 'error');
			}
		} catch (e: any) {
			notify(e.message || 'Error updating student', 'error');
		}
	};

	const columns = useMemo<MRT_ColumnDef<any>[]>(
		() => [
			{
				accessorFn: (row) => `${row.firstName} ${row.lastName}`,
				id: 'name',
				header: 'Name'
			},
			{
				accessorKey: 'role',
				header: 'Role',
				Cell: ({ cell }) => (
					<Chip
						label={cell.getValue() as string}
						size="small"
						color="primary"
						variant="outlined"
					/>
				)
			},
			{
				accessorKey: 'email',
				header: 'Email / Phone',
				Cell: ({ row }) => row.original.email || row.original.phone || 'N/A'
			},
			{
				accessorKey: 'status',
				header: 'Status',
				Cell: ({ cell }) => {
					const status = cell.getValue() as string;
					let color: 'success' | 'warning' | 'error' | 'default' | 'info' = 'default';

					if (status === 'ACTIVE') color = 'success';
					else if (status === 'SUSPENDED') color = 'error';
					else if (status === 'COMPLETED') color = 'info';
					else if (status === 'TRANSFERRED') color = 'warning';

					return (
						<Chip
							label={status}
							size="small"
							color={color}
						/>
					);
				}
			},
			{
				accessorFn: (row) =>
					row.createdBy ? `${row.createdBy.firstName} ${row.createdBy.lastName}` : 'System',
				id: 'createdBy',
				header: 'Created By'
			},
			{
				accessorKey: 'createdAt',
				header: 'Date Created',
				Cell: ({ cell }) => new Date(cell.getValue() as string).toLocaleDateString()
			}
		],
		[]
	);

	return (
		<AuthGuardRedirect auth={['SUPER_ADMIN']}>
			<FusePageSimple
				content={
					<div className="mx-auto flex w-full max-w-7xl flex-col gap-32 px-24 py-32">
						<div className="flex w-full flex-0 flex-col sm:flex-row sm:items-center sm:justify-between">
							<div className="min-w-0 flex-1">
								<Typography className="text-4xl font-extrabold tracking-tight">
									User Management
								</Typography>
							</div>
							<div className="mt-16 flex shrink-0 items-center sm:mt-0 sm:ml-24">
								<Button
									variant="contained"
									color="secondary"
									startIcon={<FuseSvgIcon>lucide:plus</FuseSvgIcon>}
									onClick={() => setOpenCreate(true)}
								>
									Create Account
								</Button>
							</div>
						</div>

						<Paper className="bg-card flex flex-auto flex-col rounded-2xl p-24 shadow">
							<Tabs
								value={roleTab}
								onChange={(e, val) => setRoleTab(val)}
								indicatorColor="primary"
								textColor="primary"
								variant="scrollable"
								scrollButtons="auto"
								className="mb-24 border-b"
							>
								{['All', 'ADMIN', 'TEACHER', 'FINANCE', 'STUDENT', 'PARENT'].map((r) => (
									<Tab
										key={r}
										label={r}
										value={r}
									/>
								))}
							</Tabs>

							<MaterialReactTable
								columns={columns}
								data={users}
								state={{ isLoading: loading }}
								enableRowActions
								positionActionsColumn="last"
								renderRowActions={({ row }) => (
									<Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
										{row.original.role === 'STUDENT' && (
											<Button
												size="small"
												variant="contained"
												color="secondary"
												onClick={() => handleOpenEdit(row.original)}
											>
												Edit
											</Button>
										)}
										{['SUSPENDED', 'COMPLETED', 'TRANSFERRED'].includes(row.original.status) ? (
											<Button
												size="small"
												color="success"
												onClick={() => handleAction(row.original.id, 'REACTIVATE')}
											>
												Reactivate
											</Button>
										) : (
											<>
												<Button
													size="small"
													color="error"
													onClick={() => handleAction(row.original.id, 'SUSPEND')}
												>
													Suspend
												</Button>
												{row.original.role === 'STUDENT' && (
													<>
														<Button
															size="small"
															color="info"
															onClick={() => handleAction(row.original.id, 'COMPLETED')}
														>
															Complete
														</Button>
														<Button
															size="small"
															color="warning"
															onClick={() => handleAction(row.original.id, 'TRANSFERRED')}
														>
															Transfer
														</Button>
													</>
												)}
											</>
										)}
										<Button
											size="small"
											variant="outlined"
											onClick={() => handleAction(row.original.id, 'FORCE_RESET')}
										>
											Reset Pwd
										</Button>
										{row.original.role !== 'SUPER_ADMIN' && (
											<Button
												size="small"
												variant="outlined"
												color="warning"
												startIcon={<FuseSvgIcon size={14}>lucide:eye</FuseSvgIcon>}
												onClick={() => handleViewAs(row.original)}
											>
												View as
											</Button>
										)}
										<Button
											size="small"
											variant="contained"
											color="error"
											onClick={() => handleDelete(row.original.id)}
										>
											Delete
										</Button>
									</Box>
								)}
								muiTablePaperProps={{ elevation: 0 }}
							/>
						</Paper>
					</div>
				}
			/>

			{/* CREATE NEW ACCOUNT DIALOG */}
			<Dialog
				open={openCreate}
				onClose={() => setOpenCreate(false)}
				maxWidth="sm"
				fullWidth
			>
				<DialogTitle>Create New Account</DialogTitle>
				<DialogContent>
					<Box
						display="flex"
						flexDirection="column"
						gap={2}
						mt={1}
					>
						<TextField
							select
							label="Role"
							value={formData.role}
							onChange={(e) => setFormData({ ...formData, role: e.target.value })}
							fullWidth
						>
							{['ADMIN', 'TEACHER', 'FINANCE', 'STUDENT', 'PARENT'].map((option) => (
								<MenuItem
									key={option}
									value={option}
								>
									{option}
								</MenuItem>
							))}
						</TextField>
						<TextField
							label="First Name"
							value={formData.firstName}
							onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
							fullWidth
						/>
						<TextField
							label="Last Name"
							value={formData.lastName}
							onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
							fullWidth
						/>
						<TextField
							label="Email"
							type="email"
							value={formData.email}
							onChange={(e) => setFormData({ ...formData, email: e.target.value })}
							fullWidth
						/>
						<TextField
							label="Phone"
							value={formData.phone}
							onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
							fullWidth
						/>
						<TextField
							label="Temporary Password (Leave empty for auto-generated)"
							value={formData.customTempPassword}
							onChange={(e) => setFormData({ ...formData, customTempPassword: e.target.value })}
							fullWidth
						/>
					</Box>
				</DialogContent>
				<DialogActions>
					<Button onClick={() => setOpenCreate(false)}>Cancel</Button>
					<Button
						onClick={handleCreate}
						variant="contained"
						color="primary"
					>
						Create
					</Button>
				</DialogActions>
			</Dialog>

			{/* EDIT STUDENT DIALOG */}
			<Dialog
				open={openEdit}
				onClose={() => setOpenEdit(false)}
				maxWidth="md"
				fullWidth
			>
				<DialogTitle>Edit Student Information</DialogTitle>
				<Paper
					sx={{ mx: 3, mb: 2 }}
					elevation={0}
				>
					<Tabs
						value={editTab}
						onChange={(e, val) => setEditTab(val)}
						indicatorColor="primary"
						textColor="primary"
					>
						<Tab label="Bio Data" />
						<Tab label="Placement & Subjects" />
						<Tab label="Parent details" />
						<Tab label="Documents" />
					</Tabs>
				</Paper>

				<DialogContent dividers>
					{editTab === 0 && (
						<Grid
							container
							spacing={3}
						>
							<Grid size={{ xs: 12, sm: 6 }}>
								<TextField
									label="First Name"
									value={editFormData.firstName}
									onChange={(e) => setEditFormData({ ...editFormData, firstName: e.target.value })}
									fullWidth
								/>
							</Grid>
							<Grid size={{ xs: 12, sm: 6 }}>
								<TextField
									label="Last Name"
									value={editFormData.lastName}
									onChange={(e) => setEditFormData({ ...editFormData, lastName: e.target.value })}
									fullWidth
								/>
							</Grid>
							<Grid size={{ xs: 12, sm: 6 }}>
								<TextField
									label="Admission Number"
									value={editFormData.admissionNumber}
									onChange={(e) =>
										setEditFormData({ ...editFormData, admissionNumber: e.target.value })
									}
									fullWidth
								/>
							</Grid>
							<Grid size={{ xs: 12, sm: 6 }}>
								<TextField
									label="NEMIS Number"
									value={editFormData.nemisNumber}
									onChange={(e) => setEditFormData({ ...editFormData, nemisNumber: e.target.value })}
									fullWidth
								/>
							</Grid>
							<Grid size={{ xs: 12, sm: 6 }}>
								<TextField
									label="Date of Birth"
									type="date"
									InputLabelProps={{ shrink: true }}
									value={editFormData.dob}
									onChange={(e) => setEditFormData({ ...editFormData, dob: e.target.value })}
									fullWidth
								/>
							</Grid>
							<Grid size={{ xs: 12, sm: 6 }}>
								<FormControl fullWidth>
									<InputLabel>Gender</InputLabel>
									<Select
										value={editFormData.gender}
										label="Gender"
										onChange={(e) => setEditFormData({ ...editFormData, gender: e.target.value })}
									>
										<MenuItem value="Male">Male</MenuItem>
										<MenuItem value="Female">Female</MenuItem>
									</Select>
								</FormControl>
							</Grid>
							<Grid size={{ xs: 12, sm: 6 }}>
								<TextField
									label="Student Email"
									type="email"
									value={editFormData.studentEmail}
									onChange={(e) => setEditFormData({ ...editFormData, studentEmail: e.target.value })}
									fullWidth
								/>
							</Grid>
							<Grid size={{ xs: 12, sm: 6 }}>
								<TextField
									label="Student Phone"
									value={editFormData.phone}
									onChange={(e) => setEditFormData({ ...editFormData, phone: e.target.value })}
									fullWidth
								/>
							</Grid>
							<Grid size={12}>
								<TextField
									label="Previous School"
									value={editFormData.previousSchool}
									onChange={(e) =>
										setEditFormData({ ...editFormData, previousSchool: e.target.value })
									}
									fullWidth
								/>
							</Grid>
							<Grid size={12}>
								<TextField
									label="Medical Notes"
									multiline
									rows={2}
									value={editFormData.medicalNotes}
									onChange={(e) => setEditFormData({ ...editFormData, medicalNotes: e.target.value })}
									fullWidth
								/>
							</Grid>
						</Grid>
					)}

					{editTab === 1 && (
						<Grid
							container
							spacing={3}
						>
							<Grid size={12}>
								<FormControl fullWidth>
									<InputLabel>Class Placement</InputLabel>
									<Select
										value={editFormData.classId}
										label="Class Placement"
										onChange={(e) => setEditFormData({ ...editFormData, classId: e.target.value })}
									>
										{classes.map((cls) => (
											<MenuItem
												key={cls.id}
												value={cls.id}
											>
												{cls.name}
											</MenuItem>
										))}
									</Select>
								</FormControl>
							</Grid>
							<Grid size={12}>
								<FormControl fullWidth>
									<InputLabel>Subjects Enrolled</InputLabel>
									<Select
										multiple
										value={editFormData.subjectIds}
										onChange={(e) =>
											setEditFormData({
												...editFormData,
												subjectIds:
													typeof e.target.value === 'string'
														? e.target.value.split(',')
														: (e.target.value as string[])
											})
										}
										input={<OutlinedInput label="Subjects Enrolled" />}
										renderValue={(selected) =>
											selected
												.map((id) => subjects.find((s) => s.id === id)?.name || id)
												.join(', ')
										}
										MenuProps={MenuProps}
									>
										{subjects.map((subject) => (
											<MenuItem
												key={subject.id}
												value={subject.id}
											>
												<Checkbox checked={editFormData.subjectIds.indexOf(subject.id) > -1} />
												<ListItemText primary={subject.name} />
											</MenuItem>
										))}
									</Select>
								</FormControl>
							</Grid>
						</Grid>
					)}

					{editTab === 2 && (
						<Grid
							container
							spacing={3}
						>
							<Grid size={{ xs: 12, sm: 6 }}>
								<TextField
									label="Parent Name"
									value={editFormData.parentName}
									onChange={(e) => setEditFormData({ ...editFormData, parentName: e.target.value })}
									fullWidth
								/>
							</Grid>
							<Grid size={{ xs: 12, sm: 6 }}>
								<FormControl fullWidth>
									<InputLabel>Relationship</InputLabel>
									<Select
										value={editFormData.parentRelationship}
										label="Relationship"
										onChange={(e) =>
											setEditFormData({ ...editFormData, parentRelationship: e.target.value })
										}
									>
										<MenuItem value="Father">Father</MenuItem>
										<MenuItem value="Mother">Mother</MenuItem>
										<MenuItem value="Guardian">Guardian</MenuItem>
									</Select>
								</FormControl>
							</Grid>
							<Grid size={{ xs: 12, sm: 6 }}>
								<TextField
									label="Parent Phone"
									value={editFormData.parentPhone}
									onChange={(e) => setEditFormData({ ...editFormData, parentPhone: e.target.value })}
									fullWidth
								/>
							</Grid>
							<Grid size={{ xs: 12, sm: 6 }}>
								<TextField
									label="Parent Email"
									type="email"
									value={editFormData.parentEmail}
									onChange={(e) => setEditFormData({ ...editFormData, parentEmail: e.target.value })}
									fullWidth
								/>
							</Grid>
							<Grid size={12}>
								<TextField
									label="Parent National ID"
									value={editFormData.parentNationalId}
									onChange={(e) =>
										setEditFormData({ ...editFormData, parentNationalId: e.target.value })
									}
									fullWidth
								/>
							</Grid>
						</Grid>
					)}

					{editTab === 3 && (
						<Box
							display="flex"
							flexDirection="column"
							gap={3}
						>
							{/* Birth Certificate */}
							<Paper
								variant="outlined"
								sx={{
									p: 2,
									display: 'flex',
									alignItems: 'center',
									justifyContent: 'space-between',
									borderRadius: 2
								}}
							>
								<Box>
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
										{editFormData.birthCertificateUrl ? 'Uploaded' : 'No document selected'}
									</Typography>
								</Box>
								<Box
									display="flex"
									alignItems="center"
									gap={2}
								>
									{uploadingField === 'birthCertificateUrl' && <CircularProgress size={24} />}
									{editFormData.birthCertificateUrl && (
										<Button
											size="small"
											variant="text"
											color="primary"
											href={editFormData.birthCertificateUrl}
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
										Choose File
										<input
											type="file"
											hidden
											onChange={(e) => handleFileUpload(e, 'birthCertificateUrl')}
											accept="image/*,application/pdf"
										/>
									</Button>
								</Box>
							</Paper>

							{/* Report Card */}
							<Paper
								variant="outlined"
								sx={{
									p: 2,
									display: 'flex',
									alignItems: 'center',
									justifyContent: 'space-between',
									borderRadius: 2
								}}
							>
								<Box>
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
										{editFormData.reportCardUrl ? 'Uploaded' : 'No document selected'}
									</Typography>
								</Box>
								<Box
									display="flex"
									alignItems="center"
									gap={2}
								>
									{uploadingField === 'reportCardUrl' && <CircularProgress size={24} />}
									{editFormData.reportCardUrl && (
										<Button
											size="small"
											variant="text"
											color="primary"
											href={editFormData.reportCardUrl}
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
										Choose File
										<input
											type="file"
											hidden
											onChange={(e) => handleFileUpload(e, 'reportCardUrl')}
											accept="image/*,application/pdf"
										/>
									</Button>
								</Box>
							</Paper>

							{/* Passport Photo */}
							<Paper
								variant="outlined"
								sx={{
									p: 2,
									display: 'flex',
									alignItems: 'center',
									justifyContent: 'space-between',
									borderRadius: 2
								}}
							>
								<Box>
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
										{editFormData.passportPhotoUrl ? 'Uploaded' : 'No photo selected'}
									</Typography>
								</Box>
								<Box
									display="flex"
									alignItems="center"
									gap={2}
								>
									{uploadingField === 'passportPhotoUrl' && <CircularProgress size={24} />}
									{editFormData.passportPhotoUrl && (
										<Button
											size="small"
											variant="text"
											color="primary"
											href={editFormData.passportPhotoUrl}
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
										Choose Photo
										<input
											type="file"
											hidden
											onChange={(e) => handleFileUpload(e, 'passportPhotoUrl')}
											accept="image/*"
										/>
									</Button>
								</Box>
							</Paper>
						</Box>
					)}
				</DialogContent>

				<DialogActions>
					<Button onClick={() => setOpenEdit(false)}>Cancel</Button>
					<Button
						onClick={handleSaveEdit}
						variant="contained"
						color="primary"
						disabled={!!uploadingField}
					>
						Save Changes
					</Button>
				</DialogActions>
			</Dialog>
		</AuthGuardRedirect>
	);
}
