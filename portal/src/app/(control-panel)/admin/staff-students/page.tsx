'use client';

import { useSession } from 'next-auth/react';
import { useEffect, useState, useMemo, useCallback } from 'react';
import {
	Box,
	Paper,
	Typography,
	Tabs,
	Tab,
	Button,
	Chip,
	Dialog,
	DialogTitle,
	DialogContent,
	DialogActions,
	TextField,
	FormControl,
	InputLabel,
	FormHelperText,
	Select,
	MenuItem,
	Checkbox,
	ListItemText,
	OutlinedInput,
	Grid,
	CircularProgress,
	IconButton,
	Menu
} from '@mui/material';
import FusePageSimple from '@fuse/core/FusePageSimple';
import FuseSvgIcon from '@fuse/core/FuseSvgIcon';
import AuthGuardRedirect from '@auth/AuthGuardRedirect';
import Link from 'next/link';
import { MaterialReactTable, type MRT_ColumnDef, type MRT_Row } from 'material-react-table';
import { BACKEND_URL } from '@/lib/backend';
import useToast from '@/hooks/useToast';

type UserRow = {
	id: string;
	firstName: string;
	lastName: string;
	email?: string;
	phone?: string;
	status: string;
	role?: string;
	dob?: string;
	gender?: string;
	previousSchool?: string;
	medicalNotes?: string;
	admissionNumber?: string;
	nemisNumber?: string;
	classId?: string;
	birthCertificateUrl?: string;
	reportCardUrl?: string;
	passportPhotoUrl?: string;
	childLinks?: {
		parent?: {
			firstName: string;
			lastName: string;
			phone?: string;
			email?: string;
			nationalId?: string;
		};
		relationship?: string;
	}[];
	parentLinks?: { student?: { firstName: string; lastName: string; admissionNumber?: string } }[];
	teachesSubjects?: { subjectId?: string; subject?: { id?: string; name: string } }[];
	studentSubjects?: { subjectId?: string; subject?: { id?: string; name: string } }[];
	[key: string]: unknown;
};

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

export default function AdminStaffStudents() {
	const { notify, prompt } = useToast();
	const { data: session } = useSession();
	const token = (session as { backendToken?: string } | null)?.backendToken;
	const [users, setUsers] = useState<UserRow[]>([]);
	const [loading, setLoading] = useState(true);
	const [activeTab, setActiveTab] = useState(0);
	const roleMap = useMemo(() => ['TEACHER', 'FINANCE', 'STUDENT', 'PARENT'], []);
	// Server-side pages: the API returns one page of users plus the total count.
	const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 10 });
	const [totalUsers, setTotalUsers] = useState(0);
	const [search, setSearch] = useState('');

	const [classes, setClasses] = useState<{ id: string; name: string; stream?: string }[]>([]);
	const [subjects, setSubjects] = useState<{ id: string; name: string; code?: string }[]>([]);

	// Open Create Dialog
	const [openCreate, setOpenCreate] = useState(false);
	const [formData, setFormData] = useState({
		firstName: '',
		lastName: '',
		email: '',
		phone: '',
		customTempPassword: '',
		subjectIds: [] as string[]
	});

	// Open Edit Teacher Dialog
	const [teacherEdit, setTeacherEdit] = useState<{
		id: string;
		firstName: string;
		lastName: string;
		email: string;
		phone: string;
		subjectIds: string[];
	} | null>(null);

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

	const fetchClassesAndSubjects = useCallback(() => {
		if (!token) return;

		fetch(`${BACKEND_URL}/api/classes`, {
			headers: { Authorization: `Bearer ${token}` }
		})
			.then((res) => res.json())
			.then((data) => setClasses(data || []))
			.catch((err) => console.error(err));

		fetch(`${BACKEND_URL}/api/subjects`, {
			headers: { Authorization: `Bearer ${token}` }
		})
			.then((res) => res.json())
			.then((data) => setSubjects(data || []))
			.catch((err) => console.error(err));
	}, [token]);

	const fetchUsers = useCallback(() => {
		if (!token) return;

		setLoading(true);
		fetch(
			`${BACKEND_URL}/api/users?role=${roleMap[activeTab]}&page=${pagination.pageIndex + 1}&limit=${pagination.pageSize}${search ? `&search=${encodeURIComponent(search)}` : ''}&t=${Date.now()}`,
			{
				headers: {
					Authorization: `Bearer ${token}`,
					'Cache-Control': 'no-cache',
					Pragma: 'no-cache'
				}
			}
		)
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
				setTotalUsers(data.total ?? 0);
				setLoading(false);
			})
			.catch((err) => {
				console.error(err);
				notify(err.message || 'Error fetching users', 'error');
				setLoading(false);
			});
	}, [token, activeTab, pagination.pageIndex, pagination.pageSize, search, roleMap]);

	useEffect(() => {
		fetchClassesAndSubjects();
	}, [fetchClassesAndSubjects]);

	useEffect(() => {
		fetchUsers();
	}, [fetchUsers]);

	const handleCreate = async () => {
		const role = roleMap[activeTab];
		try {
			const res = await fetch(`${BACKEND_URL}/api/users`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${token}`
				},
				body: JSON.stringify({
					...formData,
					role,
					subjectIds: role === 'TEACHER' ? formData.subjectIds : undefined
				})
			});

			if (res.ok) {
				const result = await res.json();
				notify(`Account created successfully! Temporary password: ${result.tempPassword}`, 'success', {
					persist: true
				});
				setFormData({
					firstName: '',
					lastName: '',
					email: '',
					phone: '',
					customTempPassword: '',
					subjectIds: []
				});
				setOpenCreate(false);
				fetchUsers();
			} else {
				const err = await res.json().catch(() => ({}));
				notify(err.error || 'Failed to create user', 'error');
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

	const handleOpenTeacherEdit = (teacher: UserRow) => {
		setTeacherEdit({
			id: teacher.id,
			firstName: teacher.firstName || '',
			lastName: teacher.lastName || '',
			email: teacher.email || '',
			phone: teacher.phone || '',
			subjectIds:
				teacher.teachesSubjects?.map((ts) => ts.subjectId).filter((id): id is string => Boolean(id)) || []
		});
	};

	const handleSaveTeacherEdit = async () => {
		if (!teacherEdit) return;

		try {
			const { id, ...details } = teacherEdit;
			const res = await fetch(`${BACKEND_URL}/api/users/${id}`, {
				method: 'PATCH',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${token}`
				},
				body: JSON.stringify({ action: 'EDIT_DETAILS', ...details })
			});

			if (res.ok) {
				notify('Teacher details updated successfully!', 'success');
				setTeacherEdit(null);
				fetchUsers();
			} else {
				const err = await res.json().catch(() => ({}));
				notify(err.error || 'Failed to update teacher details', 'error');
			}
		} catch (e: unknown) {
			notify(e instanceof Error ? e.message : 'Error updating teacher', 'error');
		}
	};

	const handleOpenEdit = (student: UserRow) => {
		const parentLink = student.childLinks?.[0]?.parent;
		const parentRel = student.childLinks?.[0]?.relationship || '';
		const studentSubjects =
			student.studentSubjects?.map((ss) => ss.subjectId).filter((id): id is string => Boolean(id)) || [];

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
		} catch (err: unknown) {
			notify(err instanceof Error ? err.message : 'An error occurred during upload', 'error');
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
		} catch (e: unknown) {
			notify(e instanceof Error ? e.message : 'Error updating student', 'error');
		}
	};

	const columns = useMemo<MRT_ColumnDef<UserRow>[]>(
		() => [
			{
				accessorFn: (row) => `${row.firstName} ${row.lastName}`,
				id: 'name',
				header: 'Name',
				size: 180,
				Cell: ({ row }) => (
					<Typography
						variant="body2"
						className="font-semibold text-gray-800"
					>
						{row.original.firstName} {row.original.lastName}
					</Typography>
				)
			},
			...(activeTab === 2
				? [
						{
							accessorKey: 'admissionNumber',
							header: 'Admission No.',
							size: 140,
							Cell: ({ cell }) => (cell.getValue() as string) || 'N/A'
						},
						{
							accessorKey: 'nemisNumber',
							header: 'NEMIS No.',
							size: 140,
							Cell: ({ cell }) => (cell.getValue() as string) || 'N/A'
						},
						{
							id: 'parent',
							header: 'Parent / Guardian',
							size: 180,
							accessorFn: (row) => {
								const parent = row.childLinks?.[0]?.parent;
								return parent ? `${parent.firstName} ${parent.lastName}` : 'N/A';
							}
						}
					]
				: []),
			...(activeTab === 0
				? [
						{
							id: 'subjects',
							header: 'Subjects',
							size: 200,
							accessorFn: (row: UserRow) =>
								row.teachesSubjects
									?.map((ts) => ts.subject?.name)
									.filter(Boolean)
									.join(', ') || 'None assigned'
						}
					]
				: []),
			...(activeTab === 3
				? [
						{
							id: 'student',
							header: 'Linked Student(s)',
							size: 200,
							accessorFn: (row) => {
								const student = row.parentLinks?.[0]?.student;
								return student
									? `${student.firstName} ${student.lastName} (${student.admissionNumber || 'N/A'})`
									: 'N/A';
							}
						}
					]
				: []),
			{
				accessorKey: 'email',
				header: 'Email / Phone',
				size: 200,
				Cell: ({ row }) => (
					<Typography
						variant="body2"
						color="text.secondary"
					>
						{row.original.email || row.original.phone || 'N/A'}
					</Typography>
				)
			},
			{
				accessorKey: 'status',
				header: 'Status',
				size: 150,
				Cell: ({ cell }) => {
					const status = cell.getValue<string>();
					let color: 'success' | 'warning' | 'error' | 'default' | 'info' = 'default';

					if (status === 'ACTIVE') color = 'success';
					else if (status === 'SUSPENDED') color = 'error';
					else if (status === 'COMPLETED') color = 'info';
					else if (status === 'TRANSFERRED' || status === 'PENDING_ACTIVATION' || status === 'PENDING_INVITE')
						color = 'warning';

					const label = (status || '')
						.toLowerCase()
						.split('_')
						.map((w) => w.charAt(0).toUpperCase() + w.slice(1))
						.join(' ');

					return (
						<Chip
							label={label}
							size="small"
							color={color}
							variant="outlined"
							sx={{ fontWeight: 600, borderRadius: '999px' }}
						/>
					);
				}
			}
		],
		[activeTab]
	);

	return (
		<AuthGuardRedirect auth={['SUPER_ADMIN', 'ADMIN']}>
			<FusePageSimple
				header={
					<div className="flex w-full flex-col px-6 pt-6">
						<div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
							<div>
								<Typography
									variant="h4"
									className="font-extrabold tracking-tight sm:text-4xl"
								>
									Staff & Students
								</Typography>
								<Typography
									color="text.secondary"
									className="mt-1 font-medium"
								>
									Manage user accounts, roles, and profiles
								</Typography>
							</div>
							{roleMap[activeTab] !== 'STUDENT' ? (
								<Button
									variant="contained"
									color="secondary"
									className="rounded-full px-6 shadow-sm"
									startIcon={<FuseSvgIcon size={18}>lucide:plus</FuseSvgIcon>}
									onClick={() => setOpenCreate(true)}
								>
									Create{' '}
									{roleMap[activeTab] === 'TEACHER'
										? 'Teacher'
										: roleMap[activeTab] === 'FINANCE'
											? 'Finance Staff'
											: 'Parent'}
								</Button>
							) : (
								<Button
									variant="contained"
									color="secondary"
									component={Link}
									href="/admin/admissions"
									className="rounded-full px-6 shadow-sm"
									startIcon={<FuseSvgIcon size={18}>lucide:user-plus</FuseSvgIcon>}
								>
									New Admission
								</Button>
							)}
						</div>
					</div>
				}
				content={
					<div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-6">
						<Paper className="bg-card flex flex-auto flex-col overflow-hidden rounded-2xl border border-gray-100 shadow">
							<Tabs
								value={activeTab}
								onChange={(e, val) => {
									setActiveTab(val);
									setPagination((p) => ({ ...p, pageIndex: 0 }));
								}}
								variant="scrollable"
								scrollButtons={false}
								className="w-full flex-none px-4"
								sx={{
									minHeight: 0,
									height: 'auto',
									borderBottom: 1,
									borderColor: 'divider',
									'& .MuiTabs-flexContainer': { gap: 1 },
									'& .MuiTabs-indicator': {
										height: 3,
										borderRadius: '3px 3px 0 0'
									},
									'& .MuiTab-root': {
										minHeight: 0,
										height: 'auto',
										minWidth: 96,
										px: 2.5,
										py: 1.75,
										textTransform: 'none',
										fontSize: 14,
										fontWeight: 600,
										color: 'text.secondary',
										'&.Mui-selected': { color: 'secondary.main' }
									}
								}}
								indicatorColor="secondary"
							>
								<Tab label="Teachers" />
								<Tab label="Finance" />
								<Tab label="Students" />
								<Tab label="Parents" />
							</Tabs>

							<MaterialReactTable
								columns={columns}
								data={users}
								state={{ isLoading: loading, pagination, globalFilter: search }}
								manualPagination
								manualFiltering
								enableColumnFilters={false}
								onGlobalFilterChange={(v) => {
									setSearch(v ?? '');
									setPagination((p) => ({ ...p, pageIndex: 0 }));
								}}
								rowCount={totalUsers}
								onPaginationChange={setPagination}
								muiPaginationProps={{ rowsPerPageOptions: [10, 25, 50, 100] }}
								enableRowActions
								enableColumnActions={false}
								enableDensityToggle={false}
								enableFullScreenToggle={false}
								enableHiding={false}
								layoutMode="grid"
								initialState={{ density: 'comfortable' }}
								localization={{ actions: 'Actions' }}
								displayColumnDefOptions={{
									'mrt-row-actions': {
										header: 'Actions',
										size: 140,
										grow: false,
										muiTableHeadCellProps: { align: 'right', sx: { pr: 2 } },
										muiTableBodyCellProps: { align: 'right', sx: { pr: 2 } }
									}
								}}
								muiTablePaperProps={{ elevation: 0, sx: { boxShadow: 'none', borderRadius: 0 } }}
								muiTopToolbarProps={{ sx: { px: 2, pt: 1 } }}
								muiBottomToolbarProps={{ sx: { borderTop: '1px solid', borderColor: 'divider' } }}
								muiTableHeadCellProps={{
									sx: {
										fontSize: 12,
										fontWeight: 700,
										textTransform: 'uppercase',
										letterSpacing: '0.04em',
										color: 'text.secondary',
										backgroundColor: 'action.hover',
										py: 1.5
									}
								}}
								muiTableBodyCellProps={{ sx: { fontSize: 14, py: 1.5 } }}
								muiTableBodyRowProps={{ hover: true }}
								positionActionsColumn="last"
								renderRowActions={({ row }) => (
									<RowActions
										row={row}
										activeRole={roleMap[activeTab]}
										onEditTeacher={() => handleOpenTeacherEdit(row.original)}
										onEditStudent={() => handleOpenEdit(row.original)}
										onAction={handleAction}
									/>
								)}
							/>
						</Paper>
					</div>
				}
			/>

			{/* CREATE STAFF/PARENT DIALOG */}
			<Dialog
				open={openCreate}
				onClose={() => setOpenCreate(false)}
				maxWidth="sm"
				fullWidth
			>
				<DialogTitle>
					Create New{' '}
					{roleMap[activeTab] === 'TEACHER'
						? 'Teacher'
						: roleMap[activeTab] === 'FINANCE'
							? 'Finance Staff'
							: 'Parent'}
				</DialogTitle>
				<DialogContent>
					<Box
						display="flex"
						flexDirection="column"
						gap={2}
						mt={1}
					>
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
						{roleMap[activeTab] === 'TEACHER' && (
							<TeacherSubjectsSelect
								subjects={subjects}
								value={formData.subjectIds}
								onChange={(subjectIds) => setFormData({ ...formData, subjectIds })}
							/>
						)}
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

			{/* EDIT TEACHER DIALOG */}
			<Dialog
				open={!!teacherEdit}
				onClose={() => setTeacherEdit(null)}
				maxWidth="sm"
				fullWidth
			>
				<DialogTitle>Edit Teacher Details</DialogTitle>
				{teacherEdit && (
					<DialogContent>
						<Box
							display="flex"
							flexDirection="column"
							gap={2}
							mt={1}
						>
							<TextField
								label="First Name"
								value={teacherEdit.firstName}
								onChange={(e) => setTeacherEdit({ ...teacherEdit, firstName: e.target.value })}
								fullWidth
							/>
							<TextField
								label="Last Name"
								value={teacherEdit.lastName}
								onChange={(e) => setTeacherEdit({ ...teacherEdit, lastName: e.target.value })}
								fullWidth
							/>
							<TextField
								label="Email"
								type="email"
								value={teacherEdit.email}
								onChange={(e) => setTeacherEdit({ ...teacherEdit, email: e.target.value })}
								fullWidth
							/>
							<TextField
								label="Phone"
								value={teacherEdit.phone}
								onChange={(e) => setTeacherEdit({ ...teacherEdit, phone: e.target.value })}
								fullWidth
							/>
							<TeacherSubjectsSelect
								subjects={subjects}
								value={teacherEdit.subjectIds}
								onChange={(subjectIds) => setTeacherEdit({ ...teacherEdit, subjectIds })}
							/>
						</Box>
					</DialogContent>
				)}
				<DialogActions>
					<Button onClick={() => setTeacherEdit(null)}>Cancel</Button>
					<Button
						onClick={handleSaveTeacherEdit}
						variant="contained"
						color="primary"
					>
						Save Changes
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
									onChange={(e) =>
										setEditFormData({
											...editFormData,
											firstName: e.target.value
										})
									}
									fullWidth
								/>
							</Grid>
							<Grid size={{ xs: 12, sm: 6 }}>
								<TextField
									label="Last Name"
									value={editFormData.lastName}
									onChange={(e) =>
										setEditFormData({
											...editFormData,
											lastName: e.target.value
										})
									}
									fullWidth
								/>
							</Grid>
							<Grid size={{ xs: 12, sm: 6 }}>
								<TextField
									label="Admission Number"
									value={editFormData.admissionNumber}
									onChange={(e) =>
										setEditFormData({
											...editFormData,
											admissionNumber: e.target.value
										})
									}
									fullWidth
								/>
							</Grid>
							<Grid size={{ xs: 12, sm: 6 }}>
								<TextField
									label="NEMIS Number"
									value={editFormData.nemisNumber}
									onChange={(e) =>
										setEditFormData({
											...editFormData,
											nemisNumber: e.target.value
										})
									}
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
										onChange={(e) =>
											setEditFormData({
												...editFormData,
												gender: e.target.value
											})
										}
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
									onChange={(e) =>
										setEditFormData({
											...editFormData,
											studentEmail: e.target.value
										})
									}
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
										setEditFormData({
											...editFormData,
											previousSchool: e.target.value
										})
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
									onChange={(e) =>
										setEditFormData({
											...editFormData,
											medicalNotes: e.target.value
										})
									}
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
										onChange={(e) =>
											setEditFormData({
												...editFormData,
												classId: e.target.value
											})
										}
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
									onChange={(e) =>
										setEditFormData({
											...editFormData,
											parentName: e.target.value
										})
									}
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
											setEditFormData({
												...editFormData,
												parentRelationship: e.target.value
											})
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
									onChange={(e) =>
										setEditFormData({
											...editFormData,
											parentPhone: e.target.value
										})
									}
									fullWidth
								/>
							</Grid>
							<Grid size={{ xs: 12, sm: 6 }}>
								<TextField
									label="Parent Email"
									type="email"
									value={editFormData.parentEmail}
									onChange={(e) =>
										setEditFormData({
											...editFormData,
											parentEmail: e.target.value
										})
									}
									fullWidth
								/>
							</Grid>
							<Grid size={12}>
								<TextField
									label="Parent National ID"
									value={editFormData.parentNationalId}
									onChange={(e) =>
										setEditFormData({
											...editFormData,
											parentNationalId: e.target.value
										})
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

const MAX_TEACHER_SUBJECTS = 2;

/** Picks up to two existing subjects a teacher teaches. */
function TeacherSubjectsSelect({
	subjects,
	value,
	onChange
}: {
	subjects: { id: string; name: string; code?: string }[];
	value: string[];
	onChange: (ids: string[]) => void;
}) {
	return (
		<FormControl fullWidth>
			<InputLabel>Subjects taught</InputLabel>
			<Select
				multiple
				value={value}
				onChange={(e) => {
					const ids = typeof e.target.value === 'string' ? e.target.value.split(',') : e.target.value;
					onChange(ids.slice(0, MAX_TEACHER_SUBJECTS));
				}}
				input={<OutlinedInput label="Subjects taught" />}
				renderValue={(selected) => (
					<Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
						{selected.map((id) => (
							<Chip
								key={id}
								size="small"
								label={subjects.find((s) => s.id === id)?.name || id}
								onMouseDown={(e) => e.stopPropagation()}
								onDelete={() => onChange(value.filter((x) => x !== id))}
							/>
						))}
					</Box>
				)}
				MenuProps={MenuProps}
			>
				{subjects.map((subject) => {
					const checked = value.includes(subject.id);
					return (
						<MenuItem
							key={subject.id}
							value={subject.id}
							disabled={!checked && value.length >= MAX_TEACHER_SUBJECTS}
						>
							<Checkbox checked={checked} />
							<ListItemText primary={subject.code ? `${subject.name} (${subject.code})` : subject.name} />
						</MenuItem>
					);
				})}
			</Select>
			<FormHelperText>Pick up to {MAX_TEACHER_SUBJECTS} subjects.</FormHelperText>
		</FormControl>
	);
}

function RowActions({
	row,
	activeRole,
	onEditTeacher,
	onEditStudent,
	onAction
}: {
	row: MRT_Row<UserRow>;
	activeRole: string;
	onEditTeacher: () => void;
	onEditStudent: () => void;
	onAction: (id: string, action: string) => void;
}) {
	const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
	const open = Boolean(anchorEl);
	const status = row.original.status;
	const isSuspendedOrInactive = ['SUSPENDED', 'COMPLETED', 'TRANSFERRED'].includes(status);

	const handleMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
		event.stopPropagation();
		setAnchorEl(event.currentTarget);
	};

	const handleMenuClose = () => {
		setAnchorEl(null);
	};

	const triggerAction = (action: string) => {
		handleMenuClose();
		onAction(row.original.id, action);
	};

	return (
		<Box
			sx={{
				display: 'flex',
				gap: 1,
				alignItems: 'center',
				justifyContent: 'flex-end',
				width: '100%'
			}}
		>
			{isSuspendedOrInactive ? (
				<Button
					size="small"
					color="success"
					variant="outlined"
					className="rounded-full text-xs font-semibold whitespace-nowrap shadow-none"
					sx={{ px: 2, minWidth: 0, textTransform: 'none' }}
					onClick={() => triggerAction('REACTIVATE')}
				>
					Reactivate
				</Button>
			) : (
				<>
					{activeRole === 'TEACHER' && (
						<Button
							size="small"
							variant="contained"
							color="secondary"
							className="rounded-full text-xs font-semibold whitespace-nowrap shadow-none"
							sx={{ px: 2, minWidth: 0, textTransform: 'none' }}
							onClick={onEditTeacher}
						>
							Edit
						</Button>
					)}

					{activeRole === 'STUDENT' && (
						<Button
							size="small"
							variant="contained"
							color="secondary"
							className="rounded-full text-xs font-semibold whitespace-nowrap shadow-none"
							sx={{ px: 2, minWidth: 0, textTransform: 'none' }}
							onClick={onEditStudent}
						>
							Edit
						</Button>
					)}
				</>
			)}

			<IconButton
				size="small"
				onClick={handleMenuOpen}
				className="text-gray-500 hover:text-gray-700"
				aria-label="More actions"
			>
				<FuseSvgIcon size={18}>lucide:more-vertical</FuseSvgIcon>
			</IconButton>

			<Menu
				anchorEl={anchorEl}
				open={open}
				onClose={handleMenuClose}
				anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
				transformOrigin={{ vertical: 'top', horizontal: 'right' }}
				slotProps={{
					paper: {
						sx: {
							minWidth: 170,
							boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
							borderRadius: 2
						}
					}
				}}
			>
				{activeRole === 'TEACHER' && (
					<MenuItem
						onClick={() => {
							handleMenuClose();
							onEditTeacher();
						}}
					>
						<FuseSvgIcon
							size={16}
							className="mr-2 text-gray-500"
						>
							lucide:edit-3
						</FuseSvgIcon>
						Edit details
					</MenuItem>
				)}

				{activeRole === 'STUDENT' && (
					<MenuItem
						onClick={() => {
							handleMenuClose();
							onEditStudent();
						}}
					>
						<FuseSvgIcon
							size={16}
							className="mr-2 text-gray-500"
						>
							lucide:edit-3
						</FuseSvgIcon>
						Edit details
					</MenuItem>
				)}

				<MenuItem onClick={() => triggerAction('FORCE_RESET')}>
					<FuseSvgIcon
						size={16}
						className="mr-2 text-gray-500"
					>
						lucide:key-round
					</FuseSvgIcon>
					Reset password
				</MenuItem>

				{isSuspendedOrInactive ? (
					<MenuItem
						onClick={() => triggerAction('REACTIVATE')}
						sx={{ color: 'success.main' }}
					>
						<FuseSvgIcon
							size={16}
							className="mr-2 text-green-600"
						>
							lucide:check-circle
						</FuseSvgIcon>
						Reactivate account
					</MenuItem>
				) : (
					<MenuItem
						onClick={() => triggerAction('SUSPEND')}
						sx={{ color: 'error.main' }}
					>
						<FuseSvgIcon
							size={16}
							className="mr-2 text-red-600"
						>
							lucide:ban
						</FuseSvgIcon>
						Suspend account
					</MenuItem>
				)}

				{activeRole === 'STUDENT' && !isSuspendedOrInactive && (
					<>
						<MenuItem onClick={() => triggerAction('COMPLETED')}>
							<FuseSvgIcon
								size={16}
								className="mr-2 text-blue-600"
							>
								lucide:graduation-cap
							</FuseSvgIcon>
							Mark completed
						</MenuItem>
						<MenuItem onClick={() => triggerAction('TRANSFERRED')}>
							<FuseSvgIcon
								size={16}
								className="mr-2 text-amber-600"
							>
								lucide:arrow-right-left
							</FuseSvgIcon>
							Mark transferred
						</MenuItem>
					</>
				)}
			</Menu>
		</Box>
	);
}
