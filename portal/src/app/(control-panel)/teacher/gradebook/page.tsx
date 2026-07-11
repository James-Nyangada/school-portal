'use client';

import { useState } from 'react';
import Typography from '@mui/material/Typography';
import Paper from '@mui/material/Paper';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Chip from '@mui/material/Chip';
import FusePageSimple from '@fuse/core/FusePageSimple';
import AuthGuardRedirect from '@auth/AuthGuardRedirect';
import { MaterialReactTable, type MRT_ColumnDef } from 'material-react-table';

type GradeRow = {
	id: string;
	studentName: string;
	subject: string;
	term: string;
	value: string;
	remark?: string;
	status: 'DRAFT' | 'PUBLISHED' | 'PENDING_APPROVAL';
};

export default function GradebookPage() {
	const [data, setData] = useState<GradeRow[]>([
		{
			id: '1',
			studentName: 'John Doe',
			subject: 'Math',
			term: 'Term 1',
			value: '85',
			remark: 'Good effort',
			status: 'PUBLISHED'
		},
		{
			id: '2',
			studentName: 'Jane Smith',
			subject: 'Math',
			term: 'Term 1',
			value: '92',
			remark: 'Excellent',
			status: 'PUBLISHED'
		},
		{
			id: '3',
			studentName: 'Alice Johnson',
			subject: 'Math',
			term: 'Term 1',
			value: '',
			remark: '',
			status: 'DRAFT'
		}
	]);

	const [editModalOpen, setEditModalOpen] = useState(false);
	const [editingRow, setEditingRow] = useState<GradeRow | null>(null);
	const [newValue, setNewValue] = useState('');
	const [newRemark, setNewRemark] = useState('');

	const handleEditClick = (row: GradeRow) => {
		setEditingRow(row);
		setNewValue(row.value);
		setNewRemark(row.remark || '');
		setEditModalOpen(true);
	};

	const handleSave = () => {
		if (editingRow) {
			setData((prev) =>
				prev.map((r) =>
					r.id === editingRow.id
						? {
								...r,
								value: newValue,
								remark: newRemark,
								// If it was PUBLISHED, changing it requires approval
								status: r.status === 'PUBLISHED' ? 'PENDING_APPROVAL' : 'DRAFT'
							}
						: r
				)
			);
			setEditModalOpen(false);
		}
	};

	const columns: MRT_ColumnDef<GradeRow>[] = [
		{ accessorKey: 'studentName', header: 'Student Name' },
		{ accessorKey: 'subject', header: 'Subject' },
		{ accessorKey: 'term', header: 'Term' },
		{ accessorKey: 'value', header: 'Grade', Cell: ({ cell }) => cell.getValue<string>() || '-' },
		{ accessorKey: 'remark', header: 'Term Remark', Cell: ({ cell }) => cell.getValue<string>() || '-' },
		{
			accessorKey: 'status',
			header: 'Status',
			Cell: ({ cell }) => {
				const val = cell.getValue<string>();
				return (
					<Chip
						label={val.replace('_', ' ')}
						color={val === 'PUBLISHED' ? 'success' : val === 'PENDING_APPROVAL' ? 'warning' : 'default'}
						size="small"
					/>
				);
			}
		},
		{
			id: 'actions',
			header: 'Actions',
			Cell: ({ row }) => (
				<Button
					variant="outlined"
					size="small"
					onClick={() => handleEditClick(row.original)}
					disabled={row.original.status === 'PENDING_APPROVAL'}
				>
					{row.original.status === 'PUBLISHED' ? 'Request Change' : 'Edit'}
				</Button>
			)
		}
	];

	return (
		<AuthGuardRedirect auth={['TEACHER']}>
			<FusePageSimple
				content={
					<div className="mx-auto flex w-full max-w-7xl flex-col gap-32 px-24 py-32">
						<Typography className="text-4xl font-extrabold tracking-tight">Gradebook</Typography>
						<Typography color="text.secondary">
							Enter grades for your assigned classes. Published grades that need correction will require
							Admin approval.
						</Typography>

						<Paper className="bg-card mt-16 flex flex-auto flex-col rounded-2xl p-24 shadow">
							<MaterialReactTable
								columns={columns}
								data={data}
								enableDensityToggle={false}
								enableFullScreenToggle={false}
								initialState={{ density: 'compact' }}
							/>
						</Paper>

						<Dialog
							open={editModalOpen}
							onClose={() => setEditModalOpen(false)}
						>
							<DialogTitle>
								{editingRow?.status === 'PUBLISHED' ? 'Request Grade Change' : 'Edit Grade'}
							</DialogTitle>
							<DialogContent className="min-w-320">
								<Box className="mt-8">
									<Typography
										variant="subtitle2"
										color="text.secondary"
										className="mb-16"
									>
										Student: {editingRow?.studentName}
									</Typography>
									<TextField
										fullWidth
										label="Grade Value"
										value={newValue}
										onChange={(e) => setNewValue(e.target.value)}
										autoFocus
										sx={{ mb: 2 }}
									/>
									<TextField
										fullWidth
										label="Term Remark"
										value={newRemark}
										onChange={(e) => setNewRemark(e.target.value)}
										multiline
										rows={2}
									/>
									{editingRow?.status === 'PUBLISHED' && (
										<Typography
											variant="caption"
											color="warning.main"
											className="mt-16 block"
										>
											* Modifying a published grade will flag it as PENDING APPROVAL until an
											Admin reviews it.
										</Typography>
									)}
								</Box>
							</DialogContent>
							<DialogActions>
								<Button onClick={() => setEditModalOpen(false)}>Cancel</Button>
								<Button
									onClick={handleSave}
									variant="contained"
									color="primary"
								>
									{editingRow?.status === 'PUBLISHED' ? 'Submit Request' : 'Save'}
								</Button>
							</DialogActions>
						</Dialog>
					</div>
				}
			/>
		</AuthGuardRedirect>
	);
}
