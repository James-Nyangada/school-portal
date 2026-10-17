'use client';

import { useSession } from 'next-auth/react';
import { useEffect, useState } from 'react';
import {
	Paper,
	Typography,
	CircularProgress,
	MenuItem,
	Select,
	FormControl,
	InputLabel,
	Grid,
	Chip
} from '@mui/material';
import FusePageSimple from '@fuse/core/FusePageSimple';
import AuthGuardRedirect from '@auth/AuthGuardRedirect';
import FuseSvgIcon from '@fuse/core/FuseSvgIcon';
import { MaterialReactTable, type MRT_ColumnDef } from 'material-react-table';
import { BACKEND_URL } from '@/lib/backend';

interface AttendanceSummary {
	present: number;
	absent: number;
	late: number;
	total: number;
	rate: number;
}

interface AttendanceRow {
	date: string;
	lesson: string;
	status: 'PRESENT' | 'ABSENT' | 'LATE';
}

interface ApiAttendanceResponse {
	status: 'PRESENT' | 'ABSENT' | 'LATE';
	lesson?: string;
	date: string;
}

interface Child {
	id: string;
	name: string;
	rawName: string;
	className?: string;
}

export default function ParentAttendance() {
	const { data: session } = useSession();
	const token = (session as { backendToken?: string } | null)?.backendToken;

	const [children, setChildren] = useState<Child[] | null>(null);
	const [selectedChildId, setSelectedChildId] = useState<string>('');
	const [loadingRecords, setLoadingRecords] = useState(false);
	const [summary, setSummary] = useState<AttendanceSummary | null>(null);
	const [records, setRecords] = useState<AttendanceRow[]>([]);

	// 1. Load the parent's linked children from the backend
	useEffect(() => {
		if (!token) return;

		let active = true;

		fetch(`${BACKEND_URL}/api/users/me`, {
			headers: { Authorization: `Bearer ${token}` }
		})
			.then((res) => (res.ok ? res.json() : null))
			.then((data) => {
				if (!active || !data) return;

				const list: Child[] = (data.parentLinks ?? []).map(
					(link: {
						student: {
							id: string;
							firstName: string;
							lastName: string;
							admissionNumber?: string;
							class?: { name: string };
						};
					}) => {
						const fullName =
							[link.student.firstName, link.student.lastName].filter(Boolean).join(' ') || 'Student';
						const classLabel = link.student.class?.name;
						const admLabel = link.student.admissionNumber;
						const tag = [classLabel, admLabel].filter(Boolean).join(' · ');

						return {
							id: link.student.id,
							name: tag ? `${fullName} (${tag})` : fullName,
							rawName: fullName,
							className: classLabel
						};
					}
				);

				setChildren(list);

				if (list.length > 0) {
					const savedId =
						typeof window !== 'undefined' ? localStorage.getItem('parent_selected_child_id') : null;
					const initial = list.find((c) => c.id === savedId)?.id ?? list[0].id;
					setSelectedChildId(initial);

					if (typeof window !== 'undefined') {
						localStorage.setItem('parent_selected_child_id', initial);
					}
				} else {
					setSelectedChildId('');
				}
			})
			.catch((err) => {
				console.error('Failed to load children:', err);

				if (active) setChildren([]);
			});

		return () => {
			active = false;
		};
	}, [token]);

	const handleChildChange = (id: string) => {
		setSelectedChildId(id);

		if (typeof window !== 'undefined') {
			localStorage.setItem('parent_selected_child_id', id);
		}
	};

	// 2. Load attendance records for the selected child
	useEffect(() => {
		if (!token || !selectedChildId) {
			setRecords([]);
			setSummary({ present: 0, absent: 0, late: 0, total: 0, rate: 100 });
			setLoadingRecords(false);
			return;
		}

		let active = true;
		setLoadingRecords(true);

		fetch(`${BACKEND_URL}/api/attendance?studentId=${selectedChildId}`, {
			headers: { Authorization: `Bearer ${token}` }
		})
			.then((res) => (res.ok ? res.json() : []))
			.then((data: ApiAttendanceResponse[]) => {
				if (!active) return;

				const attRecords = Array.isArray(data) ? data : [];
				const formattedRecords: AttendanceRow[] = attRecords.map((r) => ({
					date: r.date.split('T')[0],
					lesson: r.lesson || 'General Class',
					status: r.status
				}));

				const total = formattedRecords.length;
				const present = formattedRecords.filter((r) => r.status === 'PRESENT').length;
				const late = formattedRecords.filter((r) => r.status === 'LATE').length;
				const absent = formattedRecords.filter((r) => r.status === 'ABSENT').length;
				const rate = total > 0 ? Math.round(((present + late * 0.5) / total) * 100) : 100;

				setSummary({ present, absent, late, total, rate });
				setRecords(formattedRecords);
				setLoadingRecords(false);
			})
			.catch((err) => {
				console.error('Error fetching attendance records:', err);

				if (active) {
					setSummary({ present: 0, absent: 0, late: 0, total: 0, rate: 100 });
					setRecords([]);
					setLoadingRecords(false);
				}
			});

		return () => {
			active = false;
		};
	}, [selectedChildId, token]);

	const currentChildName = children?.find((c) => c.id === selectedChildId)?.rawName || 'Child';

	const columns: MRT_ColumnDef<AttendanceRow>[] = [
		{
			accessorKey: 'date',
			header: 'Date',
			Cell: ({ cell }) => {
				const val = cell.getValue<string>();
				return val
					? new Date(val).toLocaleDateString('en-US', {
							weekday: 'short',
							year: 'numeric',
							month: 'short',
							day: 'numeric'
						})
					: '';
			}
		},
		{ accessorKey: 'lesson', header: 'Subject / Lesson' },
		{
			accessorKey: 'status',
			header: 'Status',
			Cell: ({ cell }) => {
				const val = cell.getValue<'PRESENT' | 'ABSENT' | 'LATE'>();
				let color: 'success' | 'error' | 'warning' = 'success';

				if (val === 'ABSENT') color = 'error';

				if (val === 'LATE') color = 'warning';

				return (
					<Chip
						label={val}
						color={color}
						variant="outlined"
						size="small"
						className="px-2 text-xs font-bold"
					/>
				);
			}
		}
	];

	const renderContent = () => {
		if (children === null) {
			return (
				<div className="flex min-h-[400px] items-center justify-center">
					<CircularProgress />
				</div>
			);
		}

		if (children.length === 0) {
			return (
				<div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
					<FuseSvgIcon
						size={64}
						className="text-gray-400"
					>
						lucide:users
					</FuseSvgIcon>
					<Typography
						variant="h5"
						className="font-semibold"
					>
						No Children Linked
					</Typography>
					<Typography
						color="text.secondary"
						className="max-w-md"
					>
						There are no student accounts linked to your parent profile yet. Please contact the school
						administration to link your child.
					</Typography>
				</div>
			);
		}

		return (
			<>
				{/* Header Section */}
				<div className="flex flex-col items-start justify-between gap-4 border-b border-gray-100 pb-4 md:flex-row md:items-center">
					<div>
						<Typography className="text-4xl font-extrabold tracking-tight">Attendance Records</Typography>
						<Typography
							color="text.secondary"
							className="mt-2"
						>
							Monitor attendance statistics and records.
						</Typography>
					</div>

					<FormControl
						variant="outlined"
						className="min-w-60 rounded-lg bg-white shadow-sm"
					>
						<InputLabel id="child-select-label">Viewing Attendance For</InputLabel>
						<Select
							labelId="child-select-label"
							id="child-select"
							value={selectedChildId}
							label="Viewing Attendance For"
							onChange={(e) => handleChildChange(e.target.value as string)}
							className="rounded-lg"
						>
							{children.map((child) => (
								<MenuItem
									key={child.id}
									value={child.id}
								>
									{child.name}
								</MenuItem>
							))}
						</Select>
					</FormControl>
				</div>

				{/* Attendance is never fee-gated (dashboard spec §5.5) */}
				<>
					{/* Stats Grid */}
					<Grid
						container
						spacing={3}
						className="mt-2"
					>
						<Grid size={{ xs: 12, sm: 6, md: 3 }}>
							<Paper className="bg-card flex flex-auto flex-col items-center justify-center rounded-2xl p-6 text-center shadow">
								<Typography
									variant="h4"
									className="mb-1 font-extrabold text-blue-500"
								>
									{summary?.rate}%
								</Typography>
								<Typography
									variant="body2"
									color="text.secondary"
									className="font-semibold"
								>
									Attendance Rate
								</Typography>
							</Paper>
						</Grid>
						<Grid size={{ xs: 12, sm: 6, md: 3 }}>
							<Paper className="bg-card flex flex-auto flex-col items-center justify-center rounded-2xl p-6 text-center shadow">
								<Typography
									variant="h4"
									className="mb-1 font-extrabold text-green-600"
								>
									{summary?.present ?? 0}
								</Typography>
								<Typography
									variant="body2"
									color="text.secondary"
									className="font-semibold"
								>
									Days Present
								</Typography>
							</Paper>
						</Grid>
						<Grid size={{ xs: 12, sm: 6, md: 3 }}>
							<Paper className="bg-card flex flex-auto flex-col items-center justify-center rounded-2xl p-6 text-center shadow">
								<Typography
									variant="h4"
									className="mb-1 font-extrabold text-amber-500"
								>
									{summary?.late ?? 0}
								</Typography>
								<Typography
									variant="body2"
									color="text.secondary"
									className="font-semibold"
								>
									Days Late
								</Typography>
							</Paper>
						</Grid>
						<Grid size={{ xs: 12, sm: 6, md: 3 }}>
							<Paper className="bg-card flex flex-auto flex-col items-center justify-center rounded-2xl p-6 text-center shadow">
								<Typography
									variant="h4"
									className="mb-1 font-extrabold text-red-500"
								>
									{summary?.absent ?? 0}
								</Typography>
								<Typography
									variant="body2"
									color="text.secondary"
									className="font-semibold"
								>
									Days Absent
								</Typography>
							</Paper>
						</Grid>
					</Grid>

					{/* Detailed Attendance List */}
					<Paper className="bg-card mt-8 flex flex-auto flex-col rounded-2xl p-6 shadow">
						{loadingRecords ? (
							<div className="flex min-h-[250px] items-center justify-center">
								<CircularProgress />
							</div>
						) : records.length === 0 ? (
							<div className="flex flex-col items-center justify-center gap-4 p-12 text-center">
								<FuseSvgIcon
									size={48}
									className="text-gray-400"
								>
									lucide:calendar-check
								</FuseSvgIcon>
								<Typography color="text.secondary">
									No attendance records registered yet for {currentChildName}.
								</Typography>
							</div>
						) : (
							<MaterialReactTable
								columns={columns}
								data={records}
								enableDensityToggle={false}
								enableFullScreenToggle={false}
								initialState={{ density: 'comfortable' }}
								muiTablePaperProps={{ elevation: 0 }}
							/>
						)}
					</Paper>
				</>
			</>
		);
	};

	return (
		<AuthGuardRedirect auth={['PARENT']}>
			<FusePageSimple
				content={
					<div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-6 py-8">{renderContent()}</div>
				}
			/>
		</AuthGuardRedirect>
	);
}
