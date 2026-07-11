'use client';

import Typography from '@mui/material/Typography';
import Paper from '@mui/material/Paper';
import FusePageSimple from '@fuse/core/FusePageSimple';
import AuthGuardRedirect from '@auth/AuthGuardRedirect';
import { MaterialReactTable, type MRT_ColumnDef } from 'material-react-table';

type TimetableRow = {
	timeSlot: string;
	monday: string;
	tuesday: string;
	wednesday: string;
	thursday: string;
	friday: string;
};

export default function TimetablePage() {
	const data: TimetableRow[] = [
		{
			timeSlot: '08:00 - 08:40',
			monday: 'Math (Grade 8)',
			tuesday: '',
			wednesday: 'Math (Grade 7)',
			thursday: '',
			friday: 'Math (Grade 8)'
		},
		{
			timeSlot: '08:40 - 09:20',
			monday: 'Math (Grade 7)',
			tuesday: 'Math (Grade 8)',
			wednesday: '',
			thursday: 'Math (Grade 7)',
			friday: ''
		},
		{ timeSlot: '09:20 - 10:00', monday: '', tuesday: '', wednesday: '', thursday: '', friday: '' }, // Break
		{
			timeSlot: '10:00 - 10:40',
			monday: 'Math (Grade 6)',
			tuesday: 'Math (Grade 7)',
			wednesday: 'Math (Grade 8)',
			thursday: '',
			friday: 'Math (Grade 6)'
		}
	];

	const columns: MRT_ColumnDef<TimetableRow>[] = [
		{ accessorKey: 'timeSlot', header: 'Time' },
		{ accessorKey: 'monday', header: 'Monday' },
		{ accessorKey: 'tuesday', header: 'Tuesday' },
		{ accessorKey: 'wednesday', header: 'Wednesday' },
		{ accessorKey: 'thursday', header: 'Thursday' },
		{ accessorKey: 'friday', header: 'Friday' }
	];

	return (
		<AuthGuardRedirect auth={['TEACHER']}>
			<FusePageSimple
				content={
					<div className="mx-auto flex w-full max-w-7xl flex-col gap-32 px-24 py-32">
						<Typography className="text-4xl font-extrabold tracking-tight">My Timetable</Typography>
						<Typography color="text.secondary">
							Your weekly schedule across all assigned classes.
						</Typography>

						<Paper className="bg-card mt-16 flex flex-auto flex-col rounded-2xl p-24 shadow">
							<MaterialReactTable
								columns={columns}
								data={data}
								enableDensityToggle={false}
								enableFullScreenToggle={false}
								enableGlobalFilter={false}
								enablePagination={false}
								initialState={{ density: 'comfortable' }}
							/>
						</Paper>
					</div>
				}
			/>
		</AuthGuardRedirect>
	);
}
