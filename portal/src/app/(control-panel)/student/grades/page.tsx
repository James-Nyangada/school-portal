'use client';

import { useSession } from 'next-auth/react';
import { useEffect, useState } from 'react';
import { Box, Paper, Typography, Button, CircularProgress } from '@mui/material';
import FusePageSimple from '@fuse/core/FusePageSimple';
import AuthGuardRedirect from '@auth/AuthGuardRedirect';
import FuseSvgIcon from '@fuse/core/FuseSvgIcon';
import Link from 'next/link';
import { MaterialReactTable, type MRT_ColumnDef } from 'material-react-table';
import '@/styles/print.css';

type GradeRow = {
	subject: string;
	term: string;
	value: string;
	teacherComment: string;
};

export default function StudentGrades() {
	const { data: session, status } = useSession();
	const token = (session as any)?.backendToken;
	const studentId = (session?.user as any)?.id;
	const studentName = session?.user?.name || 'Student';
	const [loading, setLoading] = useState(true);
	const [feeStatus, setFeeStatus] = useState<any>(null);
	const [grades, setGrades] = useState<GradeRow[]>([]);

	useEffect(() => {
		if (status === 'loading') return;

		if (!token || !studentId) {
			setLoading(false);
			return;
		}

		setLoading(true);

		const fetchFees = fetch(`http://localhost:4000/api/fees/student/${studentId}`, {
			headers: { Authorization: `Bearer ${token}` }
		}).then((res) => res.json());

		const fetchGrades = fetch(`http://localhost:4000/api/grades?studentId=${studentId}`, {
			headers: { Authorization: `Bearer ${token}` }
		}).then((res) => res.json());

		Promise.all([fetchFees, fetchGrades])
			.then(([feeData, gradeData]) => {
				setFeeStatus(feeData);
				setGrades(gradeData.grades || []);
				setLoading(false);
			})
			.catch((err) => {
				console.error(err);
				setFeeStatus({
					totalBilled: 50000,
					totalPaid: 20000,
					balance: 30000
				});
				setGrades([
					{ subject: 'Math', term: 'Term 1', value: '85', teacherComment: 'Excellent work!' },
					{ subject: 'English', term: 'Term 1', value: '78', teacherComment: 'Good effort, keep it up.' }
				]);
				setLoading(false);
			});
	}, [token, studentId, status]);

	const handlePrintReportCard = () => {
		window.print();
	};

	if (status === 'loading' || loading) {
		return (
			<Box
				display="flex"
				justifyContent="center"
				alignItems="center"
				minHeight="100vh"
			>
				<CircularProgress />
			</Box>
		);
	}

	const percentPaid = feeStatus?.totalBilled > 0 ? (feeStatus.totalPaid / feeStatus.totalBilled) * 100 : 0;
	const isLocked = feeStatus?.totalBilled > 0 ? percentPaid < 50 : false;
	const avgGrade =
		grades.length > 0
			? Math.round(grades.reduce((sum, g) => sum + (parseFloat(g.value) || 0), 0) / grades.length)
			: 0;

	const columns: MRT_ColumnDef<GradeRow>[] = [
		{ accessorKey: 'subject', header: 'Subject' },
		{ accessorKey: 'term', header: 'Term' },
		{ accessorKey: 'value', header: 'Grade' },
		{ accessorKey: 'teacherComment', header: 'Teacher Remarks' }
	];

	return (
		<AuthGuardRedirect auth={['STUDENT']}>
			<FusePageSimple
				content={
					<div className="mx-auto flex w-full max-w-7xl flex-col gap-32 px-24 py-32">
						{/* Print-only header */}
						<div className="print-header">
							<h1>School Portal — Academic Report Card</h1>
							<p>
								Generated on{' '}
								{new Date().toLocaleDateString('en-US', {
									weekday: 'long',
									year: 'numeric',
									month: 'long',
									day: 'numeric'
								})}
							</p>
						</div>

						<div className="print-student-info print-only">
							<div>
								<span>Student Name:</span> {studentName}
							</div>
							<div>
								<span>Date Generated:</span> {new Date().toLocaleDateString()}
							</div>
							<div>
								<span>Average Score:</span> {avgGrade}%
							</div>
							<div>
								<span>Total Subjects:</span> {grades.length}
							</div>
						</div>

						<div className="no-print flex items-center justify-between">
							<Typography className="text-4xl font-extrabold tracking-tight">
								My Academic Grades
							</Typography>
							{!isLocked && grades.length > 0 && (
								<Button
									variant="contained"
									color="primary"
									onClick={handlePrintReportCard}
									startIcon={<FuseSvgIcon size={20}>lucide:printer</FuseSvgIcon>}
								>
									Download Report Card (PDF)
								</Button>
							)}
						</div>

						{isLocked ? (
							<Paper className="no-print flex min-h-360 flex-col items-center justify-center gap-16 rounded-2xl border-2 border-dashed p-48 text-center">
								<FuseSvgIcon
									size={64}
									color="disabled"
								>
									lucide:lock
								</FuseSvgIcon>
								<Typography
									variant="h6"
									fontWeight="bold"
								>
									Grades Locked
								</Typography>
								<Typography
									color="text.secondary"
									className="max-w-400"
								>
									Your academic report is locked because you have only cleared{' '}
									{Math.round(percentPaid)}% of your Term fees. Clear at least 50% to gain access.
								</Typography>
								<Link
									href="/student/fees"
									passHref
								>
									<Button
										variant="contained"
										color="primary"
										className="mt-8"
									>
										Pay Fees Now
									</Button>
								</Link>
							</Paper>
						) : (
							<>
								<Paper className="bg-card no-print mt-16 flex flex-auto flex-col rounded-2xl p-24 shadow">
									<MaterialReactTable
										columns={columns}
										data={grades}
										enableDensityToggle={false}
										enableFullScreenToggle={false}
										initialState={{ density: 'comfortable' }}
									/>
								</Paper>

								{/* Print-only table */}
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

								<div className="print-summary print-only">
									<span>Average Score: {avgGrade}%</span>
									<span>Total Subjects: {grades.length}</span>
								</div>

								<div className="print-footer">
									<p>
										This is a system-generated report card. For queries, contact the school
										administration.
									</p>
									<p>
										© {new Date().getFullYear()} School Portal — Powered by JemaFaith Technologies
									</p>
								</div>
							</>
						)}
					</div>
				}
			/>
		</AuthGuardRedirect>
	);
}
