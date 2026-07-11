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

interface MockChildData {
	summary: AttendanceSummary;
	records: AttendanceRow[];
}

interface ApiAttendanceResponse {
	status: 'PRESENT' | 'ABSENT' | 'LATE';
	lesson?: string;
	date: string;
}

const MOCK_CHILDREN = [
	{ id: 'student-john-doe', name: 'John Doe (Grade 8)', rawName: 'John Doe' },
	{ id: 'student-jane-doe', name: 'Jane Doe (Grade 6)', rawName: 'Jane Doe' }
];

const MOCK_CHILDREN_DATA: Record<string, MockChildData> = {
	'student-john-doe': {
		summary: { present: 47, absent: 2, late: 1, total: 50, rate: 94 },
		records: [
			{ date: '2026-07-01', lesson: 'Mathematics Period 1', status: 'PRESENT' },
			{ date: '2026-06-30', lesson: 'Science Period 2', status: 'PRESENT' },
			{ date: '2026-06-29', lesson: 'English Period 3', status: 'LATE' },
			{ date: '2026-06-26', lesson: 'Social Studies Period 1', status: 'PRESENT' },
			{ date: '2026-06-25', lesson: 'Kiswahili Period 4', status: 'ABSENT' },
			{ date: '2026-06-24', lesson: 'Mathematics Period 2', status: 'PRESENT' },
			{ date: '2026-06-23', lesson: 'Science Period 1', status: 'PRESENT' }
		]
	},
	'student-jane-doe': {
		summary: { present: 44, absent: 5, late: 1, total: 50, rate: 88 },
		records: [
			{ date: '2026-07-01', lesson: 'English Period 1', status: 'ABSENT' },
			{ date: '2026-06-30', lesson: 'Mathematics Period 2', status: 'PRESENT' },
			{ date: '2026-06-29', lesson: 'Science Period 3', status: 'PRESENT' },
			{ date: '2026-06-26', lesson: 'Kiswahili Period 1', status: 'ABSENT' },
			{ date: '2026-06-25', lesson: 'Social Studies Period 4', status: 'PRESENT' },
			{ date: '2026-06-24', lesson: 'English Period 2', status: 'PRESENT' },
			{ date: '2026-06-23', lesson: 'Mathematics Period 1', status: 'PRESENT' }
		]
	}
};

export default function ParentAttendance() {
	const { data: session } = useSession();
	const token = (session as { backendToken?: string } | null)?.backendToken;

	const [children, setChildren] = useState<any[]>(MOCK_CHILDREN);
	const [selectedChildId, setSelectedChildId] = useState<string>(() => {
		if (typeof window !== 'undefined') {
			return localStorage.getItem('parent_selected_child_id') || MOCK_CHILDREN[0].id;
		}

		return MOCK_CHILDREN[0].id;
	});

	const [loading, setLoading] = useState(true);
	const [summary, setSummary] = useState<AttendanceSummary | null>(null);
	const [records, setRecords] = useState<AttendanceRow[]>([]);

	const handleChildChange = (id: string) => {
		setSelectedChildId(id);

		if (typeof window !== 'undefined') {
			localStorage.setItem('parent_selected_child_id', id);
		}
	};

	useEffect(() => {
		if (!token) return;

		fetch('http://localhost:4000/api/users/me', {
			headers: { Authorization: `Bearer ${token}` }
		})
			.then((res) => res.json())
			.then((data) => {
				if (data.parentLinks && data.parentLinks.length > 0) {
					const actualChildren = data.parentLinks.map((link: any) => ({
						id: link.student.id,
						name: `${link.student.firstName} ${link.student.lastName} (${link.student.admissionNumber || 'N/A'})`,
						rawName: `${link.student.firstName} ${link.student.lastName}`,
						grade: 'Student'
					}));
					setChildren(actualChildren);
					const savedId = localStorage.getItem('parent_selected_child_id');

					if (savedId && actualChildren.find((c: any) => c.id === savedId)) {
						setSelectedChildId(savedId);
					} else {
						setSelectedChildId(actualChildren[0].id);
					}
				}
			})
			.catch((err) => console.error('Failed to load real children:', err));
	}, [token]);

	useEffect(() => {
		let active = true;
		setLoading(true);

		const loadData = async () => {
			const defaultMock = MOCK_CHILDREN_DATA[selectedChildId] || {
				summary: { present: 0, absent: 0, late: 0, total: 0, rate: 100 },
				records: []
			};

			if (!token) {
				if (active) {
					setSummary(defaultMock.summary);
					setRecords(defaultMock.records);
					setLoading(false);
				}

				return;
			}

			try {
				const attRes = await fetch(`http://localhost:4000/api/attendance?studentId=${selectedChildId}`, {
					headers: { Authorization: `Bearer ${token}` }
				});
				const attRecords = attRes.ok ? ((await attRes.json()) as ApiAttendanceResponse[]) : [];

				if (active) {
					if (Array.isArray(attRecords) && attRecords.length > 0) {
						const formattedRecords = attRecords.map((r) => ({
							date: r.date.split('T')[0],
							lesson: r.lesson || 'General Class',
							status: r.status
						}));
						const total = formattedRecords.length;
						const present = formattedRecords.filter((r) => r.status === 'PRESENT').length;
						const late = formattedRecords.filter((r) => r.status === 'LATE').length;
						const absent = formattedRecords.filter((r) => r.status === 'ABSENT').length;
						const rate = Math.round(((present + late * 0.5) / total) * 100) || 100;

						setSummary({ present, absent, late, total, rate });
						setRecords(formattedRecords);
					} else {
						setSummary(defaultMock.summary);
						setRecords(defaultMock.records);
					}

					setLoading(false);
				}
			} catch (err) {
				console.error('Error fetching attendance records:', err);

				if (active) {
					setSummary(defaultMock.summary);
					setRecords(defaultMock.records);
					setLoading(false);
				}
			}
		};

		loadData();
		return () => {
			active = false;
		};
	}, [selectedChildId, token]);

	const currentChildName = children.find((c) => c.id === selectedChildId)?.rawName || 'Child';

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
						className="px-8 text-xs font-bold"
					/>
				);
			}
		}
	];

	const renderContent = () => {
		if (loading) {
			return (
				<div className="flex min-h-[400px] items-center justify-center">
					<CircularProgress />
				</div>
			);
		}

		return (
			<>
				{/* Header Section */}
				<div className="flex flex-col items-start justify-between gap-16 border-b border-gray-100 pb-16 md:flex-row md:items-center">
					<div>
						<Typography className="text-4xl font-extrabold tracking-tight">Attendance Records</Typography>
						<Typography
							color="text.secondary"
							className="mt-8"
						>
							Monitor attendance statistics and records. This page is not gated.
						</Typography>
					</div>

					<FormControl
						variant="outlined"
						className="min-w-240 rounded-lg bg-white shadow-sm"
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

				{/* Stats Grid */}
				<Grid
					container
					spacing={3}
					className="mt-8"
				>
					<Grid size={{ xs: 12, sm: 6, md: 3 }}>
						<Paper className="bg-card flex flex-auto flex-col items-center justify-center rounded-2xl p-24 text-center shadow">
							<Typography
								variant="h4"
								className="mb-4 font-extrabold text-blue-500"
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
						<Paper className="bg-card flex flex-auto flex-col items-center justify-center rounded-2xl p-24 text-center shadow">
							<Typography
								variant="h4"
								className="mb-4 font-extrabold text-green-600"
							>
								{summary?.present}
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
						<Paper className="bg-card flex flex-auto flex-col items-center justify-center rounded-2xl p-24 text-center shadow">
							<Typography
								variant="h4"
								className="mb-4 font-extrabold text-amber-500"
							>
								{summary?.late}
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
						<Paper className="bg-card flex flex-auto flex-col items-center justify-center rounded-2xl p-24 text-center shadow">
							<Typography
								variant="h4"
								className="mb-4 font-extrabold text-red-500"
							>
								{summary?.absent}
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
				<Paper className="bg-card mt-32 flex flex-auto flex-col rounded-2xl p-24 shadow">
					{records.length === 0 ? (
						<div className="flex flex-col items-center justify-center gap-16 p-48 text-center">
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
		);
	};

	return (
		<AuthGuardRedirect auth={['PARENT']}>
			<FusePageSimple
				content={
					<div className="mx-auto flex w-full max-w-7xl flex-col gap-32 px-24 py-32">{renderContent()}</div>
				}
			/>
		</AuthGuardRedirect>
	);
}
