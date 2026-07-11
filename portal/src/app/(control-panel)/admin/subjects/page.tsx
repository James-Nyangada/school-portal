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

export default function AdminSubjects() {
	const { data: session } = useSession();
	const token = (session as any)?.backendToken;

	const [subjects, setSubjects] = useState<any[]>([]);
	const [open, setOpen] = useState(false);
	const [editingId, setEditingId] = useState<string | null>(null);
	const [formData, setFormData] = useState({ name: '', code: '', description: '' });

	const fetchSubjects = async () => {
		if (!token) return;

		try {
			const res = await fetch('http://localhost:4000/api/subjects', {
				headers: { Authorization: `Bearer ${token}` }
			});

			if (res.ok) {
				setSubjects(await res.json());
			}
		} catch (e) {
			console.error(e);
		}
	};

	useEffect(() => {
		fetchSubjects();
	}, [token]);

	const handleOpen = (sub?: any) => {
		if (sub) {
			setEditingId(sub.id);
			setFormData({ name: sub.name || '', code: sub.code || '', description: sub.description || '' });
		} else {
			setEditingId(null);
			setFormData({ name: '', code: '', description: '' });
		}

		setOpen(true);
	};

	const handleClose = () => setOpen(false);

	const handleSave = async () => {
		try {
			const url = editingId
				? `http://localhost:4000/api/subjects/${editingId}`
				: 'http://localhost:4000/api/subjects';
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
				fetchSubjects();
				handleClose();
			} else {
				alert('Failed to save subject');
			}
		} catch (e) {
			alert('Error saving subject');
		}
	};

	const handleDelete = async (id: string) => {
		if (!confirm('Are you sure you want to delete this subject?')) return;

		try {
			const res = await fetch(`http://localhost:4000/api/subjects/${id}`, {
				method: 'DELETE',
				headers: { Authorization: `Bearer ${token}` }
			});

			if (res.ok) {
				fetchSubjects();
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
							<Typography className="text-4xl font-extrabold tracking-tight">Manage Subjects</Typography>
							<Button
								variant="contained"
								color="secondary"
								className="mt-16 rounded-full sm:mt-0"
								onClick={() => handleOpen()}
							>
								Add New Subject
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
											<TableCell>Code</TableCell>
											<TableCell>Description</TableCell>
											<TableCell align="right">Actions</TableCell>
										</TableRow>
									</TableHead>
									<TableBody>
										{subjects.map((sub) => (
											<TableRow key={sub.id}>
												<TableCell>{sub.name}</TableCell>
												<TableCell>{sub.code}</TableCell>
												<TableCell>{sub.description}</TableCell>
												<TableCell align="right">
													<IconButton
														onClick={() => handleOpen(sub)}
														color="primary"
													>
														<EditIcon />
													</IconButton>
													<IconButton
														onClick={() => handleDelete(sub.id)}
														color="error"
													>
														<DeleteIcon />
													</IconButton>
												</TableCell>
											</TableRow>
										))}
										{subjects.length === 0 && (
											<TableRow>
												<TableCell
													colSpan={4}
													align="center"
												>
													No subjects found
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
							<DialogTitle>{editingId ? 'Edit Subject' : 'Add Subject'}</DialogTitle>
							<DialogContent>
								<div className="mt-8 flex flex-col gap-16">
									<TextField
										label="Subject Name"
										value={formData.name}
										onChange={(e) => setFormData({ ...formData, name: e.target.value })}
										fullWidth
									/>
									<TextField
										label="Code"
										value={formData.code}
										onChange={(e) => setFormData({ ...formData, code: e.target.value })}
										fullWidth
									/>
									<TextField
										label="Description"
										value={formData.description}
										onChange={(e) => setFormData({ ...formData, description: e.target.value })}
										fullWidth
										multiline
										rows={3}
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
