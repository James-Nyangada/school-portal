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
import '@/styles/print.css';

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

interface MockChildData {
	feeStatus: FeeStatus;
	grades: GradeRow[];
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
		]
	},
	'student-jane-doe': {
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
		]
	}
};

export default function ParentGrades() {
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
				grades: []
			};

			if (!token) {
				if (active) {
					setFeeStatus(defaultMock.feeStatus);
					setGrades(defaultMock.grades);
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

					setLoading(false);
				}
			} catch (err) {
				console.error('Error fetching grades/fees:', err);

				if (active) {
					setFeeStatus(defaultMock.feeStatus);
					setGrades(defaultMock.grades);
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
	const avgGrade =
		grades.length > 0
			? Math.round(grades.reduce((sum, g) => sum + (parseFloat(g.value) || 0), 0) / grades.length)
			: 0;

	const columns: MRT_ColumnDef<GradeRow>[] = [
		{ accessorKey: 'subject', header: 'Subject' },
		{ accessorKey: 'term', header: 'Term' },
		{ accessorKey: 'value', header: 'Grade/Score' },
		{ accessorKey: 'teacherComment', header: 'Teacher Remarks' }
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
						<Typography className="text-4xl font-extrabold tracking-tight">
							Academic Report & Grades
						</Typography>
						<Typography
							color="text.secondary"
							className="mt-8"
						>
							Review current and past term grades for your children.
						</Typography>
					</div>

					<div className="flex items-center gap-12">
						{!isLocked && grades.length > 0 && (
							<Button
								variant="contained"
								color="primary"
								onClick={() => window.print()}
								className="no-print"
								startIcon={<FuseSvgIcon size={20}>lucide:printer</FuseSvgIcon>}
							>
								Report Card (PDF)
							</Button>
						)}
					</div>

					<FormControl
						variant="outlined"
						className="min-w-240 rounded-lg bg-white shadow-sm"
					>
						<InputLabel id="child-select-label">Viewing Grades For</InputLabel>
						<Select
							labelId="child-select-label"
							id="child-select"
							value={selectedChildId}
							label="Viewing Grades For"
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
							Grades Locked
						</Typography>
						<Typography
							color="text.secondary"
							className="max-w-480 text-sm leading-relaxed"
						>
							Grades locked — clear 50% of Term fees to unlock.
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
						{grades.length === 0 ? (
							<div className="flex flex-col items-center justify-center gap-16 p-48 text-center">
								<FuseSvgIcon
									size={48}
									className="text-gray-400"
								>
									lucide:clipboard-list
								</FuseSvgIcon>
								<Typography color="text.secondary">
									No grades recorded yet for {currentChildName}.
								</Typography>
							</div>
						) : (
							<MaterialReactTable
								columns={columns}
								data={grades}
								enableDensityToggle={false}
								enableFullScreenToggle={false}
								initialState={{ density: 'comfortable' }}
								muiTablePaperProps={{ elevation: 0 }}
							/>
						)}
					</Paper>
				)}

				{/* Print-only header and table */}
				<div className="print-header">
					<h1>School Portal — Academic Report Card</h1>
					<p>
						Student: {currentChildName} | Generated: {new Date().toLocaleDateString()}
					</p>
				</div>

				<div className="print-student-info print-only">
					<div>
						<span>Student:</span> {currentChildName}
					</div>
					<div>
						<span>Average Score:</span> {avgGrade}%
					</div>
				</div>

				{!isLocked && grades.length > 0 && (
					<table className="print-table print-only">
						<thead>
							<tr>
								<th>Subject</th>
								<th>Term</th>
								<th>Grade</th>
								<th>Teacher Remarks</th>
							</tr>
						</thead>
						<tbody>
							{grades.map((g, i) => (
								<tr key={i}>
									<td>{g.subject}</td>
									<td>{g.term}</td>
									<td>{g.value}</td>
									<td>{g.teacherComment}</td>
								</tr>
							))}
						</tbody>
					</table>
				)}

				<div className="print-footer">
					<p>System-generated report card. Contact school administration for queries.</p>
					<p>© {new Date().getFullYear()} School Portal — JemaFaith Technologies</p>
				</div>
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
