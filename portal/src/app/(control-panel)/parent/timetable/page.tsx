'use client';

import { useSession } from 'next-auth/react';
import { useEffect, useState } from 'react';
import {
	Box,
	Paper,
	Typography,
	Button,
	CircularProgress,
	MenuItem,
	Select,
	FormControl,
	InputLabel
} from '@mui/material';
import FusePageSimple from '@fuse/core/FusePageSimple';
import AuthGuardRedirect from '@auth/AuthGuardRedirect';
import FuseSvgIcon from '@fuse/core/FuseSvgIcon';
import Link from 'next/link';
import { MaterialReactTable, type MRT_ColumnDef } from 'material-react-table';

interface FeeStatus {
	totalBilled: number;
	amountPaid: number;
	balance: number;
	percentPaid: number;
}

interface TimetableRow {
	timeSlot: string;
	monday: string;
	tuesday: string;
	wednesday: string;
	thursday: string;
	friday: string;
}

interface MockChildData {
	feeStatus: FeeStatus;
	timetable: TimetableRow[];
}

interface ApiFeeResponse {
	totalBilled: number;
	totalPaid: number;
	balance: number;
}

const MOCK_CHILDREN = [
	{ id: 'student-john-doe', name: 'John Doe (Grade 8)', rawName: 'John Doe' },
	{ id: 'student-jane-doe', name: 'Jane Doe (Grade 6)', rawName: 'Jane Doe' }
];

const MOCK_CHILDREN_DATA: Record<string, MockChildData> = {
	'student-john-doe': {
		feeStatus: {
			totalBilled: 60000,
			amountPaid: 45000,
			balance: 15000,
			percentPaid: 75
		},
		timetable: [
			{
				timeSlot: '08:00 - 08:40',
				monday: 'Math',
				tuesday: 'English',
				wednesday: 'Science',
				thursday: 'Social Studies',
				friday: 'Math'
			},
			{
				timeSlot: '08:40 - 09:20',
				monday: 'English',
				tuesday: 'Math',
				wednesday: 'Kiswahili',
				thursday: 'Science',
				friday: 'Physical Ed'
			},
			{
				timeSlot: '09:20 - 10:00',
				monday: 'Break',
				tuesday: 'Break',
				wednesday: 'Break',
				thursday: 'Break',
				friday: 'Break'
			},
			{
				timeSlot: '10:00 - 10:40',
				monday: 'Science',
				tuesday: 'Kiswahili',
				wednesday: 'Math',
				thursday: 'English',
				friday: 'Art & Craft'
			},
			{
				timeSlot: '10:40 - 11:20',
				monday: 'Social Studies',
				tuesday: 'Science',
				wednesday: 'English',
				thursday: 'Kiswahili',
				friday: 'Music'
			}
		]
	},
	'student-jane-doe': {
		feeStatus: {
			totalBilled: 50000,
			amountPaid: 15000,
			balance: 35000,
			percentPaid: 30
		},
		timetable: [
			{
				timeSlot: '08:00 - 08:40',
				monday: 'English',
				tuesday: 'Math',
				wednesday: 'Kiswahili',
				thursday: 'Science',
				friday: 'English'
			},
			{
				timeSlot: '08:40 - 09:20',
				monday: 'Math',
				tuesday: 'Science',
				wednesday: 'English',
				thursday: 'Social Studies',
				friday: 'Math'
			},
			{
				timeSlot: '09:20 - 10:00',
				monday: 'Break',
				tuesday: 'Break',
				wednesday: 'Break',
				thursday: 'Break',
				friday: 'Break'
			},
			{
				timeSlot: '10:00 - 10:40',
				monday: 'Kiswahili',
				tuesday: 'English',
				wednesday: 'Math',
				thursday: 'Kiswahili',
				friday: 'Physical Ed'
			},
			{
				timeSlot: '10:40 - 11:20',
				monday: 'Science',
				tuesday: 'Social Studies',
				wednesday: 'Science',
				thursday: 'Art & Craft',
				friday: 'Music'
			}
		]
	}
};

export default function ParentTimetable() {
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
	const [feeStatus, setFeeStatus] = useState<FeeStatus | null>(null);
	const [timetable, setTimetable] = useState<TimetableRow[]>([]);

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
				feeStatus: { totalBilled: 0, amountPaid: 0, balance: 0, percentPaid: 100 },
				timetable: []
			};

			if (!token) {
				if (active) {
					setFeeStatus(defaultMock.feeStatus);
					setTimetable(defaultMock.timetable);
					setLoading(false);
				}

				return;
			}

			try {
				// Fetch fees
				const feeRes = await fetch(`http://localhost:4000/api/fees/student/${selectedChildId}`, {
					headers: { Authorization: `Bearer ${token}` }
				});
				const feeData = feeRes.ok ? ((await feeRes.json()) as ApiFeeResponse) : null;

				if (active) {
					if (feeData && typeof feeData.balance === 'number') {
						const calculatedPercent =
							feeData.totalBilled > 0 ? (feeData.totalPaid / feeData.totalBilled) * 100 : 100;
						setFeeStatus({
							totalBilled: feeData.totalBilled,
							amountPaid: feeData.totalPaid,
							balance: feeData.balance,
							percentPaid: calculatedPercent
						});
					} else {
						setFeeStatus(defaultMock.feeStatus);
					}

					// In a real database, timetable is fetched or generated. We'll use the mock timetable for this student level.
					setTimetable(defaultMock.timetable);
					setLoading(false);
				}
			} catch (err) {
				console.error('Error fetching timetable/fees:', err);

				if (active) {
					setFeeStatus(defaultMock.feeStatus);
					setTimetable(defaultMock.timetable);
					setLoading(false);
				}
			}
		};

		loadData();
		return () => {
			active = false;
		};
	}, [selectedChildId, token]);

	const percentPaid = feeStatus
		? feeStatus.percentPaid !== undefined
			? feeStatus.percentPaid
			: feeStatus.totalBilled > 0
				? (feeStatus.amountPaid / feeStatus.totalBilled) * 100
				: 100
		: 100;
	const isLocked = percentPaid < 50;
	const currentChildName = children.find((c) => c.id === selectedChildId)?.rawName || 'Child';

	const columns: MRT_ColumnDef<TimetableRow>[] = [
		{ accessorKey: 'timeSlot', header: 'Time Slot' },
		{ accessorKey: 'monday', header: 'Monday' },
		{ accessorKey: 'tuesday', header: 'Tuesday' },
		{ accessorKey: 'wednesday', header: 'Wednesday' },
		{ accessorKey: 'thursday', header: 'Thursday' },
		{ accessorKey: 'friday', header: 'Friday' }
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
						<Typography className="text-4xl font-extrabold tracking-tight">Class Timetable</Typography>
						<Typography
							color="text.secondary"
							className="mt-8"
						>
							View weekly class schedules and break intervals for your children.
						</Typography>
					</div>

					<FormControl
						variant="outlined"
						className="min-w-240 rounded-lg bg-white shadow-sm"
					>
						<InputLabel id="child-select-label">Viewing Timetable For</InputLabel>
						<Select
							labelId="child-select-label"
							id="child-select"
							value={selectedChildId}
							label="Viewing Timetable For"
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

				{/* Gated Screen check */}
				{isLocked ? (
					<Paper className="flex min-h-[360px] flex-col items-center justify-center gap-16 rounded-2xl border-2 border-dashed bg-white p-48 text-center">
						<Box className="rounded-full bg-red-50 p-16 text-red-500">
							<FuseSvgIcon size={64}>lucide:lock</FuseSvgIcon>
						</Box>
						<Typography
							variant="h5"
							className="font-extrabold text-slate-800"
						>
							Timetable Locked
						</Typography>
						<Typography
							color="text.secondary"
							className="max-w-480 text-sm leading-relaxed"
						>
							Timetable locked — clear 50% of Term fees to unlock.
							<br />
							Current balance:{' '}
							<span className="font-bold text-red-500">
								KES {feeStatus?.balance?.toLocaleString()}
							</span>{' '}
							(Cleared only {Math.round(percentPaid)}% of billed fees).
						</Typography>
						<Link
							href="/parent/fees"
							passHref
							legacyBehavior
						>
							<Button
								variant="contained"
								color="error"
								size="large"
								className="mt-8 rounded-lg px-24 py-12 font-semibold"
							>
								Pay Now
							</Button>
						</Link>
					</Paper>
				) : (
					<Paper className="bg-card mt-32 flex flex-auto flex-col rounded-2xl p-24 shadow">
						{timetable.length === 0 ? (
							<div className="flex flex-col items-center justify-center gap-16 p-48 text-center">
								<FuseSvgIcon
									size={48}
									className="text-gray-400"
								>
									lucide:calendar-days
								</FuseSvgIcon>
								<Typography color="text.secondary">
									No timetable classes scheduled for {currentChildName}.
								</Typography>
							</div>
						) : (
							<MaterialReactTable
								columns={columns}
								data={timetable}
								enableDensityToggle={false}
								enableFullScreenToggle={false}
								enablePagination={false}
								initialState={{ density: 'comfortable' }}
								muiTablePaperProps={{ elevation: 0 }}
							/>
						)}
					</Paper>
				)}
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
