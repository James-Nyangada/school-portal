'use client';

import { useState } from 'react';
import Typography from '@mui/material/Typography';
import Paper from '@mui/material/Paper';
import Button from '@mui/material/Button';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import FusePageSimple from '@fuse/core/FusePageSimple';
import AuthGuardRedirect from '@auth/AuthGuardRedirect';
import { MaterialReactTable, type MRT_ColumnDef } from 'material-react-table';
import { useSnackbar } from 'notistack';

type AttendanceRow = {
	id: string;
	studentName: string;
	status: 'PRESENT' | 'ABSENT' | 'LATE';
};

export default function AttendancePage() {
	const { enqueueSnackbar } = useSnackbar();
	const [data, setData] = useState<AttendanceRow[]>([
		{ id: '1', studentName: 'John Doe', status: 'PRESENT' },
		{ id: '2', studentName: 'Jane Smith', status: 'PRESENT' },
		{ id: '3', studentName: 'Alice Johnson', status: 'PRESENT' }
	]);

	const handleStatusChange = (id: string, newStatus: string) => {
		if (newStatus !== null) {
			setData((prev) => prev.map((row) => (row.id === id ? { ...row, status: newStatus as any } : row)));
		}
	};

	const handleMarkAllPresent = () => {
		setData((prev) => prev.map((row) => ({ ...row, status: 'PRESENT' })));
	};

	const handleSubmit = () => {
		// Check if there are any absences
		const absences = data.filter((d) => d.status === 'ABSENT');

		if (absences.length > 0) {
			enqueueSnackbar(`Submitted. ${absences.length} students marked absent.`, { variant: 'warning' });
		} else {
			enqueueSnackbar('Attendance submitted successfully!', { variant: 'success' });
		}
	};

	const columns: MRT_ColumnDef<AttendanceRow>[] = [
		{ accessorKey: 'studentName', header: 'Student Name' },
		{
			id: 'status',
			header: 'Attendance',
			Cell: ({ row }) => (
				<ToggleButtonGroup
					value={row.original.status}
					exclusive
					onChange={(_e, val) => handleStatusChange(row.original.id, val)}
					size="small"
				>
					<ToggleButton
						value="PRESENT"
						color="success"
					>
						Present
					</ToggleButton>
					<ToggleButton
						value="LATE"
						color="warning"
					>
						Late
					</ToggleButton>
					<ToggleButton
						value="ABSENT"
						color="error"
					>
						Absent
					</ToggleButton>
				</ToggleButtonGroup>
			)
		}
	];

	return (
		<AuthGuardRedirect auth={['TEACHER']}>
			<FusePageSimple
				content={
					<div className="mx-auto flex w-full max-w-7xl flex-col gap-32 px-24 py-32">
						<div className="flex items-center justify-between">
							<div>
								<Typography className="text-4xl font-extrabold tracking-tight">
									Mark Attendance
								</Typography>
								<Typography color="text.secondary">Class: Math Grade 8 | Period: 1</Typography>
							</div>
							<div className="flex gap-16">
								<Button
									variant="outlined"
									onClick={handleMarkAllPresent}
								>
									Mark All Present
								</Button>
								<Button
									variant="contained"
									color="primary"
									onClick={handleSubmit}
								>
									Submit Attendance
								</Button>
							</div>
						</div>

						<Paper className="bg-card mt-16 flex flex-auto flex-col rounded-2xl p-24 shadow">
							<MaterialReactTable
								columns={columns}
								data={data}
								enableDensityToggle={false}
								enableFullScreenToggle={false}
								enableGlobalFilter={false}
								enablePagination={false}
								initialState={{ density: 'compact' }}
							/>
						</Paper>
					</div>
				}
			/>
		</AuthGuardRedirect>
	);
}
