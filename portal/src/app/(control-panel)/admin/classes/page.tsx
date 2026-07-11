'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
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
	IconButton
} from '@mui/material';
import FusePageSimple from '@fuse/core/FusePageSimple';
import AuthGuardRedirect from '@auth/AuthGuardRedirect';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';

export default function AdminClasses() {
	const { data: session } = useSession();
	const token = (session as any)?.backendToken;

	const [classes, setClasses] = useState<any[]>([]);
	const [open, setOpen] = useState(false);
	const [editingId, setEditingId] = useState<string | null>(null);
	const [formData, setFormData] = useState({ name: '', level: '', teacherId: '' });

	const fetchClasses = async () => {
		if (!token) return;

		try {
			const res = await fetch('http://localhost:4000/api/classes', {
				headers: { Authorization: `Bearer ${token}` }
			});

			if (res.ok) {
				setClasses(await res.json());
			}
		} catch (e) {
			console.error(e);
		}
	};

	useEffect(() => {
		fetchClasses();
	}, [token]);

	const handleOpen = (cls?: any) => {
		if (cls) {
			setEditingId(cls.id);
			setFormData({ name: cls.name || '', level: cls.level || '', teacherId: cls.teacherId || '' });
		} else {
			setEditingId(null);
			setFormData({ name: '', level: '', teacherId: '' });
		}

		setOpen(true);
	};

	const handleClose = () => setOpen(false);

	const handleSave = async () => {
		try {
			const url = editingId
				? `http://localhost:4000/api/classes/${editingId}`
				: 'http://localhost:4000/api/classes';
			const method = editingId ? 'PATCH' : 'POST';
			const res = await fetch(url, {
				method,
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${token}`
				},
				body: JSON.stringify(formData)
			});

			if (res.ok) {
				fetchClasses();
				handleClose();
			} else {
				alert('Failed to save class');
			}
		} catch (e) {
			alert('Error saving class');
		}
	};

	const handleDelete = async (id: string) => {
		if (!confirm('Are you sure you want to delete this class?')) return;

		try {
			const res = await fetch(`http://localhost:4000/api/classes/${id}`, {
				method: 'DELETE',
				headers: { Authorization: `Bearer ${token}` }
			});

			if (res.ok) {
				fetchClasses();
			}
		} catch (e) {
			console.error(e);
		}
	};

	return (
		<AuthGuardRedirect auth={['SUPER_ADMIN', 'ADMIN']}>
			<FusePageSimple
				header={
					<div className="flex w-full flex-col px-24 pt-24">
						<div className="flex w-full flex-col items-center justify-between sm:flex-row">
							<Typography className="text-4xl font-extrabold tracking-tight">Manage Classes</Typography>
							<Button
								variant="contained"
								color="secondary"
								className="mt-16 rounded-full sm:mt-0"
								onClick={() => handleOpen()}
							>
								Add New Class
							</Button>
						</div>
					</div>
				}
				content={
					<div className="mx-auto flex w-full max-w-7xl flex-col gap-32 px-24 py-32">
						<Paper className="bg-card flex flex-auto flex-col rounded-2xl p-24 shadow">
							<TableContainer>
								<Table>
									<TableHead>
										<TableRow>
											<TableCell>Name</TableCell>
											<TableCell>Level</TableCell>
											<TableCell>Class Teacher ID</TableCell>
											<TableCell align="right">Actions</TableCell>
										</TableRow>
									</TableHead>
									<TableBody>
										{classes.map((cls) => (
											<TableRow key={cls.id}>
												<TableCell>{cls.name}</TableCell>
												<TableCell>{cls.level}</TableCell>
												<TableCell>{cls.teacherId || 'Unassigned'}</TableCell>
												<TableCell align="right">
													<IconButton
														onClick={() => handleOpen(cls)}
														color="primary"
													>
														<EditIcon />
													</IconButton>
													<IconButton
														onClick={() => handleDelete(cls.id)}
														color="error"
													>
														<DeleteIcon />
													</IconButton>
												</TableCell>
											</TableRow>
										))}
										{classes.length === 0 && (
											<TableRow>
												<TableCell
													colSpan={4}
													align="center"
												>
													No classes found
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
								<div className="mt-8 flex flex-col gap-16">
									<TextField
										label="Class Name"
										value={formData.name}
										onChange={(e) => setFormData({ ...formData, name: e.target.value })}
										fullWidth
									/>
									<TextField
										label="Level"
										value={formData.level}
										onChange={(e) => setFormData({ ...formData, level: e.target.value })}
										fullWidth
									/>
									<TextField
										label="Teacher ID"
										value={formData.teacherId}
										onChange={(e) => setFormData({ ...formData, teacherId: e.target.value })}
										fullWidth
									/>
								</div>
							</DialogContent>
							<DialogActions className="p-16">
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
