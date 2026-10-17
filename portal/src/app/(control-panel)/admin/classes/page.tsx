'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import useToast from '@/hooks/useToast';
import {
	Typography,
	Button,
	Paper,
	Table,
	TableBody,
	TableCell,
	TableContainer,
	TableHead,
	TableRow,
	Dialog,
	DialogTitle,
	DialogContent,
	DialogActions,
	TextField,
	IconButton,
	MenuItem,
	Chip,
	Switch,
	Tooltip
} from '@mui/material';
import FusePageSimple from '@fuse/core/FusePageSimple';
import AuthGuardRedirect from '@auth/AuthGuardRedirect';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import { BACKEND_URL } from '@/lib/backend';

type Teacher = { id: string; firstName: string; lastName: string };

type ClassRow = {
	id: string;
	name: string;
	level: number | null;
	classTeacherId: string | null;
	classTeacher: Teacher | null;
	/** Students may pay fees themselves; otherwise view-only and a parent pays */
	studentsCanPay: boolean;
	_count?: { students: number };
};

const teacherName = (t?: Teacher | null) => (t ? `${t.firstName} ${t.lastName}` : null);

export default function AdminClasses() {
	const { notify, confirm } = useToast();
	const { data: session } = useSession();
	const token = (session as { backendToken?: string } | null)?.backendToken;

	const [classes, setClasses] = useState<ClassRow[]>([]);
	const [teachers, setTeachers] = useState<Teacher[]>([]);
	const [loading, setLoading] = useState(true);
	const [open, setOpen] = useState(false);
	const [editingId, setEditingId] = useState<string | null>(null);
	const [formData, setFormData] = useState({ name: '', level: '', classTeacherId: '' });

	const toggleStudentsCanPay = async (cls: ClassRow, studentsCanPay: boolean) => {
		setClasses((prev) => prev.map((c) => (c.id === cls.id ? { ...c, studentsCanPay } : c)));
		try {
			const res = await fetch(`${BACKEND_URL}/api/classes/${cls.id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
				body: JSON.stringify({ studentsCanPay })
			});

			if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? 'Could not update the class');

			notify(
				studentsCanPay
					? `${cls.name} students can now pay fees themselves`
					: `${cls.name} students are view-only for fees`,
				'success'
			);
		} catch (e) {
			setClasses((prev) => prev.map((c) => (c.id === cls.id ? { ...c, studentsCanPay: !studentsCanPay } : c)));
			notify((e as Error).message, 'error');
		}
	};

	const fetchClasses = async () => {
		if (!token) return;

		try {
			const res = await fetch(`${BACKEND_URL}/api/classes`, {
				headers: { Authorization: `Bearer ${token}` }
			});

			if (res.ok) {
				const data: ClassRow[] = await res.json();
				data.sort((a, b) => (a.level ?? Infinity) - (b.level ?? Infinity) || a.name.localeCompare(b.name));
				setClasses(data);
			}
		} catch (e) {
			console.error(e);
		} finally {
			setLoading(false);
		}
	};

	const fetchTeachers = async () => {
		if (!token) return;

		try {
			const res = await fetch(`${BACKEND_URL}/api/users?role=TEACHER&limit=500`, {
				headers: { Authorization: `Bearer ${token}` }
			});

			if (res.ok) {
				const data = await res.json();
				setTeachers(data.users ?? []);
			}
		} catch (e) {
			console.error(e);
		}
	};

	useEffect(() => {
		fetchClasses();
		fetchTeachers();
	}, [token]);

	// A teacher can be class teacher of at most one class (classTeacherId is unique)
	const classLedBy = new Map(
		classes.filter((c) => c.id !== editingId && c.classTeacherId).map((c) => [c.classTeacherId, c.name])
	);

	const handleOpen = (cls?: ClassRow) => {
		if (cls) {
			setEditingId(cls.id);
			setFormData({
				name: cls.name || '',
				level: cls.level != null ? String(cls.level) : '',
				classTeacherId: cls.classTeacherId || ''
			});
		} else {
			setEditingId(null);
			setFormData({ name: '', level: '', classTeacherId: '' });
		}

		setOpen(true);
	};

	const handleClose = () => setOpen(false);

	const handleSave = async () => {
		if (!formData.name.trim()) {
			notify('Class name is required', 'error');
			return;
		}

		try {
			const url = editingId ? `${BACKEND_URL}/api/classes/${editingId}` : `${BACKEND_URL}/api/classes`;
			const method = editingId ? 'PATCH' : 'POST';
			const res = await fetch(url, {
				method,
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${token}`
				},
				body: JSON.stringify({
					name: formData.name.trim(),
					level: formData.level === '' ? null : formData.level,
					classTeacherId: formData.classTeacherId || null
				})
			});

			if (res.ok) {
				fetchClasses();
				handleClose();
			} else {
				const body = await res.json().catch(() => null);
				notify(body?.error ?? 'Failed to save class', 'error');
			}
		} catch {
			notify('Error saving class', 'error');
		}
	};

	const handleDelete = async (id: string) => {
		const confirmed = await confirm('Are you sure you want to delete this class?', {
			confirmText: 'Delete',
			destructive: true
		});

		if (!confirmed) return;

		try {
			const res = await fetch(`${BACKEND_URL}/api/classes/${id}`, {
				method: 'DELETE',
				headers: { Authorization: `Bearer ${token}` }
			});

			if (res.ok) {
				fetchClasses();
			} else {
				notify('Failed to delete class', 'error');
			}
		} catch (e) {
			console.error(e);
		}
	};

	return (
		<AuthGuardRedirect auth={['SUPER_ADMIN', 'ADMIN']}>
			<FusePageSimple
				content={
					<div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8">
						<div className="flex flex-wrap items-end justify-between gap-4">
							<div>
								<Typography className="text-3xl font-extrabold tracking-tight">
									Manage Classes
								</Typography>
								<Typography className="mt-1 text-sm text-gray-500">
									{classes.length} {classes.length === 1 ? 'class' : 'classes'}, ordered by level.
								</Typography>
							</div>
							<Button
								variant="contained"
								color="secondary"
								className="rounded-full"
								startIcon={<AddIcon />}
								onClick={() => handleOpen()}
							>
								Add New Class
							</Button>
						</div>

						<Paper className="bg-card overflow-hidden rounded-2xl shadow">
							<TableContainer>
								<Table>
									<TableHead>
										<TableRow>
											<TableCell className="font-semibold">Name</TableCell>
											<TableCell className="font-semibold">Level</TableCell>
											<TableCell className="font-semibold">Class Teacher</TableCell>
											<TableCell
												className="font-semibold"
												align="right"
											>
												Students
											</TableCell>
											<TableCell className="font-semibold">
												<Tooltip title="Let students in this class start fee payments themselves. Off: view-only, a parent pays.">
													<span>Students pay</span>
												</Tooltip>
											</TableCell>
											<TableCell
												className="font-semibold"
												align="right"
											>
												Actions
											</TableCell>
										</TableRow>
									</TableHead>
									<TableBody>
										{classes.map((cls) => (
											<TableRow
												key={cls.id}
												hover
											>
												<TableCell className="font-medium">{cls.name}</TableCell>
												<TableCell>{cls.level ?? '—'}</TableCell>
												<TableCell>
													{teacherName(cls.classTeacher) ?? (
														<Chip
															size="small"
															label="Unassigned"
															variant="outlined"
														/>
													)}
												</TableCell>
												<TableCell align="right">{cls._count?.students ?? 0}</TableCell>
												<TableCell>
													<Switch
														size="small"
														checked={!!cls.studentsCanPay}
														onChange={(e) => toggleStudentsCanPay(cls, e.target.checked)}
														slotProps={{
															input: {
																'aria-label': `Students in ${cls.name} can pay fees`
															}
														}}
													/>
												</TableCell>
												<TableCell
													align="right"
													className="whitespace-nowrap"
												>
													<Tooltip title="Edit">
														<IconButton
															size="small"
															onClick={() => handleOpen(cls)}
														>
															<EditIcon fontSize="small" />
														</IconButton>
													</Tooltip>
													<Tooltip title="Delete">
														<IconButton
															size="small"
															onClick={() => handleDelete(cls.id)}
															color="error"
														>
															<DeleteIcon fontSize="small" />
														</IconButton>
													</Tooltip>
												</TableCell>
											</TableRow>
										))}
										{classes.length === 0 && (
											<TableRow>
												<TableCell
													colSpan={6}
													align="center"
													className="py-12 text-gray-500"
												>
													{loading ? 'Loading classes…' : 'No classes found'}
												</TableCell>
											</TableRow>
										)}
									</TableBody>
								</Table>
							</TableContainer>
						</Paper>

						<Dialog
							open={open}
							onClose={handleClose}
							fullWidth
							maxWidth="sm"
						>
							<DialogTitle>{editingId ? 'Edit Class' : 'Add Class'}</DialogTitle>
							<DialogContent>
								<div className="mt-2 flex flex-col gap-4">
									<TextField
										label="Class Name"
										value={formData.name}
										onChange={(e) => setFormData({ ...formData, name: e.target.value })}
										required
										fullWidth
									/>
									<TextField
										label="Level"
										type="number"
										value={formData.level}
										onChange={(e) => setFormData({ ...formData, level: e.target.value })}
										helperText="Used to order classes, e.g. 0 for pre-primary, 1 for Grade 1"
										fullWidth
									/>
									<TextField
										select
										label="Class Teacher"
										value={formData.classTeacherId}
										onChange={(e) => setFormData({ ...formData, classTeacherId: e.target.value })}
										helperText="The class teacher manages this class from their My Classroom page"
										fullWidth
									>
										<MenuItem value="">
											<em>Unassigned</em>
										</MenuItem>
										{teachers.map((t) => (
											<MenuItem
												key={t.id}
												value={t.id}
												disabled={classLedBy.has(t.id)}
											>
												{teacherName(t)}
												{classLedBy.has(t.id) && ` — class teacher of ${classLedBy.get(t.id)}`}
											</MenuItem>
										))}
									</TextField>
								</div>
							</DialogContent>
							<DialogActions className="px-6 pb-4">
								<Button onClick={handleClose}>Cancel</Button>
								<Button
									onClick={handleSave}
									variant="contained"
									color="secondary"
									className="rounded-full"
								>
									Save
								</Button>
							</DialogActions>
						</Dialog>
					</div>
				}
			/>
		</AuthGuardRedirect>
	);
}
