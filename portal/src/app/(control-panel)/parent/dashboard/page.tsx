'use client';

import { useSession } from 'next-auth/react';
import { useEffect, useState } from 'react';
import {
	Box,
	Paper,
	Typography,
	Button,
	CircularProgress,
	Alert,
	MenuItem,
	Select,
	FormControl,
	InputLabel
} from '@mui/material';
import FusePageSimple from '@fuse/core/FusePageSimple';
import AuthGuardRedirect from '@auth/AuthGuardRedirect';
import FuseSvgIcon from '@fuse/core/FuseSvgIcon';
import Link from 'next/link';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { StatCard } from '@/components/dashboard/StatCard';

interface FeeStatus {
	totalBilled: number;
	amountPaid: number;
	balance: number;
	percentPaid: number;
}

interface GradeRow {
	subject: string;
	term: string;
	value: string;
	teacherComment: string;
}

interface AttendanceSummary {
	present: number;
	absent: number;
	late: number;
	total: number;
	rate: number;
}

interface MockChildData {
	name: string;
	grade: string;
	feeStatus: FeeStatus;
	grades: GradeRow[];
	attendanceSummary: AttendanceSummary;
}

interface ApiFeeResponse {
	totalBilled: number;
	totalPaid: number;
	balance: number;
}

interface ApiGradeResponse {
	subject?: { name?: string } | string;
	term?: string;
	value: string;
	teacherComment?: string;
}

interface ApiAttendanceResponse {
	status: string;
	lesson?: string;
	date: string;
}

const MOCK_CHILDREN = [
	{ id: 'student-john-doe', name: 'John Doe (Grade 8)', rawName: 'John Doe', grade: 'Grade 8' },
	{ id: 'student-jane-doe', name: 'Jane Doe (Grade 6)', rawName: 'Jane Doe', grade: 'Grade 6' }
];

const MOCK_CHILDREN_DATA: Record<string, MockChildData> = {
	'student-john-doe': {
		name: 'John Doe',
		grade: 'Grade 8',
		feeStatus: {
			totalBilled: 60000,
			amountPaid: 45000,
			balance: 15000,
			percentPaid: 75
		},
		grades: [
			{ subject: 'Mathematics', term: 'Term 1', value: '88', teacherComment: 'Excellent logical skills!' },
			{ subject: 'English', term: 'Term 1', value: '82', teacherComment: 'Great vocabulary and writing.' },
			{
				subject: 'Science',
				term: 'Term 1',
				value: '79',
				teacherComment: 'Good understanding of scientific concepts.'
			},
			{ subject: 'Kiswahili', term: 'Term 1', value: '85', teacherComment: 'Lugha safi na mtiririko mzuri.' },
			{
				subject: 'Social Studies',
				term: 'Term 1',
				value: '80',
				teacherComment: 'Active participant in class discussions.'
			}
		],
		attendanceSummary: {
			present: 47,
			absent: 2,
			late: 1,
			total: 50,
			rate: 94
		}
	},
	'student-jane-doe': {
		name: 'Jane Doe',
		grade: 'Grade 6',
		feeStatus: {
			totalBilled: 50000,
			amountPaid: 15000,
			balance: 35000,
			percentPaid: 30
		},
		grades: [
			{ subject: 'Mathematics', term: 'Term 1', value: '72', teacherComment: 'Needs more practice in algebra.' },
			{ subject: 'English', term: 'Term 1', value: '68', teacherComment: 'Good effort, but work on spelling.' },
			{ subject: 'Science', term: 'Term 1', value: '70', teacherComment: 'Engages well in experiments.' },
			{ subject: 'Kiswahili', term: 'Term 1', value: '75', teacherComment: 'Kazi nzuri, endelea hivi hivi.' }
		],
		attendanceSummary: {
			present: 44,
			absent: 5,
			late: 1,
			total: 50,
			rate: 88
		}
	}
};

export default function ParentDashboard() {
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
	const [grades, setGrades] = useState<GradeRow[]>([]);
	const [attendanceSummary, setAttendanceSummary] = useState<AttendanceSummary | null>(null);

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
				name: 'Child',
				grade: 'Student',
				feeStatus: { totalBilled: 0, amountPaid: 0, balance: 0, percentPaid: 100 },
				grades: [],
				attendanceSummary: { present: 0, absent: 0, late: 0, total: 0, rate: 100 }
			};

			if (!token) {
				if (active) {
					setFeeStatus(defaultMock.feeStatus);
					setGrades(defaultMock.grades);
					setAttendanceSummary(defaultMock.attendanceSummary);
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

				// Fetch grades
				const gradeRes = await fetch(`http://localhost:4000/api/grades?studentId=${selectedChildId}`, {
					headers: { Authorization: `Bearer ${token}` }
				});
				const gradeData = gradeRes.ok ? ((await gradeRes.json()) as ApiGradeResponse[]) : null;

				// Fetch attendance
				const attRes = await fetch(`http://localhost:4000/api/attendance?studentId=${selectedChildId}`, {
					headers: { Authorization: `Bearer ${token}` }
				});
				const attRecords = attRes.ok ? ((await attRes.json()) as ApiAttendanceResponse[]) : [];

				if (active) {
					// Process fee data
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

					// Process grades data
					if (gradeData && Array.isArray(gradeData)) {
						setGrades(
							gradeData.map((g) => ({
								subject:
									typeof g.subject === 'object' && g.subject
										? g.subject.name || 'Unknown'
										: (g.subject as string) || 'Unknown',
								term: g.term || 'Term 1',
								value: g.value,
								teacherComment: g.teacherComment || ''
							}))
						);
					} else {
						setGrades(defaultMock.grades);
					}

					// Process attendance records
					if (Array.isArray(attRecords) && attRecords.length > 0) {
						const total = attRecords.length;
						const present = attRecords.filter((r) => r.status === 'PRESENT').length;
						const late = attRecords.filter((r) => r.status === 'LATE').length;
						const absent = attRecords.filter((r) => r.status === 'ABSENT').length;
						const rate = Math.round(((present + late * 0.5) / total) * 100) || 100;
						setAttendanceSummary({ present, absent, late, total, rate });
					} else {
						setAttendanceSummary(defaultMock.attendanceSummary);
					}

					setLoading(false);
				}
			} catch (err) {
				console.error('Error fetching student data:', err);

				if (active) {
					setFeeStatus(defaultMock.feeStatus);
					setGrades(defaultMock.grades);
					setAttendanceSummary(defaultMock.attendanceSummary);
					setLoading(false);
				}
			}
		};

		loadData();
		return () => {
			active = false;
		};
	}, [selectedChildId, token]);

	// Calculate grade average
	const numericGrades = grades.map((g) => parseFloat(g.value)).filter((val) => !isNaN(val));
	const gradeAverage =
		numericGrades.length > 0
			? (numericGrades.reduce((sum, val) => sum + val, 0) / numericGrades.length).toFixed(1)
			: null;

	// Gating status
	const isLocked = feeStatus ? feeStatus.percentPaid < 50 : false;
	const currentChildName = children.find((c) => c.id === selectedChildId)?.rawName || 'Child';

	const chartData = grades.map((g) => ({
		subject: g.subject.substring(0, 10) + (g.subject.length > 10 ? '..' : ''),
		score: parseFloat(g.value) || 0
	}));

	const renderContent = () => {
		if (loading) {
			return (
				<Box
					display="flex"
					justifyContent="center"
					alignItems="center"
					minHeight="400px"
				>
					<CircularProgress />
				</Box>
			);
		}

		return (
			<>
				{/* Top Header & Child Selector */}
				<div className="flex flex-col items-start justify-between gap-16 border-b border-gray-100 pb-16 md:flex-row md:items-center">
					<div>
						<Typography className="text-4xl font-extrabold tracking-tight">Parent Dashboard</Typography>
						<Typography className="text-14 text-secondary mt-4 font-medium">
							Academic updates, fees, and attendance summaries for your children.
						</Typography>
					</div>

					<FormControl
						variant="outlined"
						className="min-w-[240px] rounded-lg bg-white shadow-sm"
					>
						<InputLabel id="child-select-label">Viewing Profile For</InputLabel>
						<Select
							labelId="child-select-label"
							id="child-select"
							value={selectedChildId}
							label="Viewing Profile For"
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

				{/* Fee Statement Banners */}
				{feeStatus && feeStatus.balance > 0 && (
					<Alert
						severity={isLocked ? 'error' : 'warning'}
						className="rounded-3xl border border-solid shadow-[0_1px_3px_rgba(0,0,0,0.06),0_1px_2px_rgba(0,0,0,0.04)] p-8"
						sx={{
							borderColor: isLocked ? 'error.light' : 'warning.light',
							'& .MuiAlert-message': { width: '100%' }
						}}
						action={
							<Link
								href="/parent/fees"
								passHref
								legacyBehavior
							>
								<Button
									variant="contained"
									color={isLocked ? 'error' : 'warning'}
									size="medium"
									className="shrink-0 rounded-lg px-16 py-8 font-semibold"
								>
									Pay Now
								</Button>
							</Link>
						}
					>
						<div className="flex flex-col gap-4">
							<Typography
								variant="subtitle2"
								className="font-bold"
							>
								{isLocked ? 'Academic Portal Gated' : 'Outstanding Fee Balance'}
							</Typography>
							<Typography
								variant="body2"
								color="text.secondary"
							>
								{isLocked
									? `Grades and Timetable are locked. Clear at least 50% of term fees to unlock. Balance: KES ${feeStatus.balance.toLocaleString()}.`
									: `There is a pending fee balance of KES ${feeStatus.balance.toLocaleString()} due for this term.`}
							</Typography>
						</div>
					</Alert>
				)}

				{/* Main Metrics Overview */}
				<div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
					<StatCard
						icon="lucide:calendar"
						iconColor="text-blue-600"
						iconBg="bg-blue-50"
						label="Attendance Rate"
						value={`${attendanceSummary?.rate || 0}%`}
						caption={<span><strong className="font-semibold text-gray-700">{attendanceSummary?.present || 0}</strong> present / <strong className="font-semibold text-gray-700">{attendanceSummary?.absent || 0}</strong> absent</span>}
					/>
					
					<StatCard
						icon="lucide:wallet"
						iconColor={feeStatus && feeStatus.balance > 0 ? "text-red-600" : "text-green-600"}
						iconBg={feeStatus && feeStatus.balance > 0 ? "bg-red-50" : "bg-green-50"}
						label="Outstanding Balance"
						value={<><span className="text-xl font-bold mr-1">KES</span>{feeStatus?.balance?.toLocaleString() || '0'}</>}
						caption={<span>Cleared <strong className="font-semibold text-gray-700">{Math.round(feeStatus?.percentPaid || 0)}%</strong> of billed fees</span>}
					/>

					<StatCard
						icon="lucide:graduation-cap"
						iconColor="text-teal-600"
						iconBg="bg-teal-50"
						label="Latest Term Average"
						value={isLocked ? <span className="text-xl text-gray-400 font-medium">Locked</span> : (gradeAverage ? `${gradeAverage}%` : 'N/A')}
						caption={isLocked ? <span className="italic">Clear fees to unlock</span> : <span>Based on <strong className="font-semibold text-gray-700">{numericGrades.length}</strong> graded subjects</span>}
					/>
				</div>

				{/* Charts & Subject Breakdown */}
				<div className="grid grid-cols-1 gap-24 lg:grid-cols-12">
					<div className="lg:col-span-7">
						<Paper className="flex h-[400px] flex-auto flex-col bg-white rounded-3xl p-24 shadow-[0_1px_3px_rgba(0,0,0,0.06),0_1px_2px_rgba(0,0,0,0.04)]">
							<Typography className="mb-16 text-lg font-bold text-gray-900">Subject Grade Performance</Typography>
							{isLocked ? (
								<div className="flex flex-1 flex-col items-center justify-center gap-12 rounded-xl bg-slate-50 p-16 text-center">
									<FuseSvgIcon
										size={48}
										className="text-slate-400"
									>
										lucide:lock
									</FuseSvgIcon>
									<Typography className="font-semibold text-slate-700">
										Performance Chart Gated
									</Typography>
									<Typography className="text-14 text-secondary max-w-[320px]">
										Clear at least 50% of the term fees to see {currentChildName}'s performance
										chart.
									</Typography>
								</div>
							) : chartData.length === 0 ? (
								<div className="flex flex-1 flex-col items-center justify-center gap-12 rounded-xl bg-slate-50 p-16 text-center">
									<FuseSvgIcon
										size={48}
										className="text-slate-400"
									>
										lucide:clipboard-list
									</FuseSvgIcon>
									<Typography className="text-secondary">No data available yet</Typography>
								</div>
							) : (
								<div className="min-h-0 flex-1">
									<ResponsiveContainer
										width="100%"
										height="100%"
									>
										<BarChart
											data={chartData}
											margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
										>
											<CartesianGrid
												strokeDasharray="3 3"
												vertical={false}
												stroke="#E2E8F0"
											/>
											<XAxis
												dataKey="subject"
												tick={{ fill: '#64748B', fontSize: 12 }}
												axisLine={false}
												tickLine={false}
											/>
											<YAxis
												domain={[0, 100]}
												tick={{ fill: '#64748B', fontSize: 12 }}
												axisLine={false}
												tickLine={false}
											/>
											<Tooltip
												contentStyle={{
													borderRadius: 12,
													border: '1px solid #E2E8F0',
													boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'
												}}
												formatter={(value) => [`${value}%`, 'Score']}
											/>
											<Bar
												dataKey="score"
												fill="#3B82F6"
												radius={[6, 6, 0, 0]}
												barSize={36}
											/>
										</BarChart>
									</ResponsiveContainer>
								</div>
							)}
						</Paper>
					</div>

					<div className="lg:col-span-5">
						<Paper className="flex h-[400px] flex-auto flex-col overflow-hidden bg-white rounded-3xl p-24 shadow-[0_1px_3px_rgba(0,0,0,0.06),0_1px_2px_rgba(0,0,0,0.04)]">
							<Typography className="mb-16 text-lg font-bold text-gray-900">Academic & Activities Overview</Typography>
							<div className="flex flex-1 flex-col gap-12 overflow-y-auto pr-4">
								<div className="flex items-start gap-12 rounded-xl border border-gray-100 p-16 transition-colors duration-150 hover:bg-slate-50">
									<div className="rounded-lg bg-indigo-50 p-8 text-indigo-500">
										<FuseSvgIcon size={20}>lucide:book-open</FuseSvgIcon>
									</div>
									<div className="flex-1">
										<Typography className="text-sm font-semibold text-slate-700">
											Current Class Grade
										</Typography>
										<Typography className="text-14 text-secondary mt-2">
											{currentChildName} is registered in{' '}
											{MOCK_CHILDREN.find((c) => c.id === selectedChildId)?.grade || 'N/A'}.
										</Typography>
									</div>
								</div>

								<div className="flex items-start gap-12 rounded-xl border border-gray-100 p-16 transition-colors duration-150 hover:bg-slate-50">
									<div className="rounded-lg bg-amber-50 p-8 text-amber-500">
										<FuseSvgIcon size={20}>lucide:alert-circle</FuseSvgIcon>
									</div>
									<div className="flex-1">
										<Typography className="text-sm font-semibold text-slate-700">
											Important Note
										</Typography>
										<Typography className="text-14 text-secondary mt-2">
											Report cards will be published at the end of the term. Please ensure all
											fees are cleared to avoid grading lockouts.
										</Typography>
									</div>
								</div>

								<div className="flex items-start gap-12 rounded-xl border border-gray-100 p-16 transition-colors duration-150 hover:bg-slate-50">
									<div className="rounded-lg bg-emerald-50 p-8 text-emerald-500">
										<FuseSvgIcon size={20}>lucide:check-square</FuseSvgIcon>
									</div>
									<div className="flex-1">
										<Typography className="text-sm font-semibold text-slate-700">
											Action Required
										</Typography>
										<Typography className="text-14 text-secondary mt-2">
											Verify that all student details, passport photos, and health notes are
											up-to-date in their academic profile.
										</Typography>
									</div>
								</div>
							</div>
						</Paper>
					</div>
				</div>
			</>
		);
	};

	return (
		<AuthGuardRedirect auth={['PARENT']}>
			<FusePageSimple
				content={
					<div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-32 bg-[#F8F9FA] px-24 py-32">
						{renderContent()}
					</div>
				}
			/>
		</AuthGuardRedirect>
	);
}
