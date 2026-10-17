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
	Tooltip
} from '@mui/material';
import FusePageSimple from '@fuse/core/FusePageSimple';
import AuthGuardRedirect from '@auth/AuthGuardRedirect';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import { BACKEND_URL } from '@/lib/backend';

type SubjectRow = {
	id: string;
	name: string;
	code: string;
	_count?: { taughtBy: number; classSubjects: number };
};

export default function AdminSubjects() {
	const { notify, confirm } = useToast();
	const { data: session } = useSession();
	const token = (session as { backendToken?: string } | null)?.backendToken;

	const [subjects, setSubjects] = useState<SubjectRow[]>([]);
	const [loading, setLoading] = useState(true);
	const [open, setOpen] = useState(false);
	const [editingId, setEditingId] = useState<string | null>(null);
	const [formData, setFormData] = useState({ name: '', code: '' });

	const fetchSubjects = async () => {
		if (!token) return;

		try {
			const res = await fetch(`${BACKEND_URL}/api/subjects`, {
				headers: { Authorization: `Bearer ${token}` }
			});

			if (res.ok) {
				setSubjects(await res.json());
			}
		} catch (e) {
			console.error(e);
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		fetchSubjects();
	}, [token]);

	const handleOpen = (sub?: SubjectRow) => {
		if (sub) {
			setEditingId(sub.id);
			setFormData({ name: sub.name || '', code: sub.code || '' });
		} else {
			setEditingId(null);
			setFormData({ name: '', code: '' });
		}

		setOpen(true);
	};

	const handleClose = () => setOpen(false);

	const handleSave = async () => {
		const name = formData.name.trim();
		const code = formData.code.trim().toUpperCase();

		if (!name || !code) {
			notify('Subject name and code are required', 'error');
			return;
		}

		try {
			const url = editingId ? `${BACKEND_URL}/api/subjects/${editingId}` : `${BACKEND_URL}/api/subjects`;
			const method = editingId ? 'PATCH' : 'POST';
			const res = await fetch(url, {
				method,
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${token}`
				},
				body: JSON.stringify({ name, code })
			});

			if (res.ok) {
				fetchSubjects();
				handleClose();
			} else {
				const body = await res.json().catch(() => null);
				notify(body?.error ?? 'Failed to save subject', 'error');
			}
		} catch {
			notify('Error saving subject', 'error');
		}
	};

	const handleDelete = async (sub: SubjectRow) => {
		const classCount = sub._count?.classSubjects ?? 0;
		const confirmed = await confirm(
			classCount
				? `${sub.name} is taught in ${classCount} ${classCount === 1 ? 'class' : 'classes'}. Deleting it removes it from those classes. Continue?`
				: `Are you sure you want to delete ${sub.name}?`,
			{
				confirmText: 'Delete',
				destructive: true
			}
		);

		if (!confirmed) return;

		try {
			const res = await fetch(`${BACKEND_URL}/api/subjects/${sub.id}`, {
				method: 'DELETE',
				headers: { Authorization: `Bearer ${token}` }
			});

			if (res.ok) {
				fetchSubjects();
			} else {
				const body = await res.json().catch(() => null);
				notify(body?.error ?? 'Failed to delete subject', 'error');
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
									Manage Subjects
								</Typography>
								<Typography className="mt-1 text-sm text-gray-500">
									{subjects.length} {subjects.length === 1 ? 'subject' : 'subjects'} offered by the
									school.
								</Typography>
							</div>
							<Button
								variant="contained"
								color="secondary"
								className="rounded-full"
								startIcon={<AddIcon />}
								onClick={() => handleOpen()}
							>
								Add New Subject
							</Button>
						</div>

						<Paper className="bg-card overflow-hidden rounded-2xl shadow">
							<TableContainer>
								<Table>
									<TableHead>
										<TableRow>
											<TableCell className="font-semibold">Name</TableCell>
											<TableCell className="font-semibold">Code</TableCell>
											<TableCell
												className="font-semibold"
												align="right"
											>
												Teachers
											</TableCell>
											<TableCell
												className="font-semibold"
												align="right"
											>
												Classes
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
										{subjects.map((sub) => (
											<TableRow
												key={sub.id}
												hover
											>
												<TableCell className="font-medium">{sub.name}</TableCell>
												<TableCell>
													<span className="rounded bg-gray-100 px-2 py-0.5 font-mono text-xs font-semibold text-gray-700">
														{sub.code}
													</span>
												</TableCell>
												<TableCell align="right">{sub._count?.taughtBy ?? 0}</TableCell>
												<TableCell align="right">{sub._count?.classSubjects ?? 0}</TableCell>
												<TableCell
													align="right"
													className="whitespace-nowrap"
												>
													<Tooltip title="Edit">
														<IconButton
															size="small"
															onClick={() => handleOpen(sub)}
														>
															<EditIcon fontSize="small" />
														</IconButton>
													</Tooltip>
													<Tooltip title="Delete">
														<IconButton
															size="small"
															onClick={() => handleDelete(sub)}
															color="error"
														>
															<DeleteIcon fontSize="small" />
														</IconButton>
													</Tooltip>
												</TableCell>
											</TableRow>
										))}
										{subjects.length === 0 && (
											<TableRow>
												<TableCell
													colSpan={5}
													align="center"
													className="py-12 text-gray-500"
												>
													{loading ? 'Loading subjects…' : 'No subjects found'}
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
								<div className="mt-2 flex flex-col gap-4">
									<TextField
										label="Subject Name"
										value={formData.name}
										onChange={(e) => setFormData({ ...formData, name: e.target.value })}
										required
										fullWidth
									/>
									<TextField
										label="Code"
										value={formData.code}
										onChange={(e) =>
											setFormData({ ...formData, code: e.target.value.toUpperCase() })
										}
										helperText="Short unique code, e.g. MATH or ENG"
										required
										fullWidth
									/>
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
