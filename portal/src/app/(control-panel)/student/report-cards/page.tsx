'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import {
	Box,
	Typography,
	Paper,
	Table,
	TableBody,
	TableCell,
	TableContainer,
	TableHead,
	TableRow,
	Button
} from '@mui/material';
import LockIcon from '@mui/icons-material/Lock';
import FusePageSimple from '@fuse/core/FusePageSimple';
import AuthGuardRedirect from '@auth/AuthGuardRedirect';

export default function StudentReportCards() {
	const { data: session } = useSession();
	const token = (session as any)?.backendToken;

	const [reports, setReports] = useState<any[]>([]);
	const [feeBalance, setFeeBalance] = useState<number>(0);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		if (!token) return;

		const fetchData = async () => {
			try {
				// Fetch fee balance
				const feeRes = await fetch('http://localhost:4000/api/student/fees/balance', {
					headers: { Authorization: `Bearer ${token}` }
				});

				if (feeRes.ok) {
					const feeData = await feeRes.json();
					setFeeBalance(feeData.balance || 0);
				}

				// Fetch report cards
				const reportRes = await fetch('http://localhost:4000/api/student/report-cards', {
					headers: { Authorization: `Bearer ${token}` }
				});

				if (reportRes.ok) {
					setReports(await reportRes.json());
				}
			} catch (e) {
				console.error(e);
			} finally {
				setLoading(false);
			}
		};
		fetchData();
	}, [token]);

	return (
		<AuthGuardRedirect auth={['STUDENT']}>
			<FusePageSimple
				header={
					<div className="flex w-full flex-col border-b p-24">
						<Typography
							variant="h4"
							fontWeight="bold"
						>
							My Report Cards
						</Typography>
					</div>
				}
				content={
					<Box p={4}>
						{loading ? (
							<Typography>Loading...</Typography>
						) : feeBalance > 0 ? (
							<Paper
								sx={{
									p: 6,
									textAlign: 'center',
									backgroundColor: '#fff4f4',
									border: '1px solid #ffcccc'
								}}
							>
								<LockIcon sx={{ fontSize: 60, color: 'error.main', mb: 2 }} />
								<Typography
									variant="h5"
									color="error.main"
									gutterBottom
								>
									Report Cards Locked
								</Typography>
								<Typography
									variant="body1"
									color="text.secondary"
									mb={3}
								>
									You have an outstanding fee balance of <strong>${feeBalance.toFixed(2)}</strong>.
									Please clear your balance to view your termly report cards.
								</Typography>
								<Button
									variant="contained"
									color="error"
									href="/student/fees"
								>
									Go to Fees Portal
								</Button>
							</Paper>
						) : (
							<TableContainer component={Paper}>
								<Table>
									<TableHead>
										<TableRow>
											<TableCell>Term</TableCell>
											<TableCell>Total Score</TableCell>
											<TableCell>Average</TableCell>
											<TableCell align="right">Action</TableCell>
										</TableRow>
									</TableHead>
									<TableBody>
										{reports.map((report) => (
											<TableRow key={report.id}>
												<TableCell>{report.term}</TableCell>
												<TableCell>{report.totalScore}</TableCell>
												<TableCell>{report.average}</TableCell>
												<TableCell align="right">
													<Button
														variant="outlined"
														size="small"
														href={`/student/report-cards/${report.id}`}
													>
														View Details
													</Button>
												</TableCell>
											</TableRow>
										))}
										{reports.length === 0 && (
											<TableRow>
												<TableCell
													colSpan={4}
													align="center"
												>
													No published report cards available.
												</TableCell>
											</TableRow>
										)}
									</TableBody>
								</Table>
							</TableContainer>
						)}
					</Box>
				}
			/>
		</AuthGuardRedirect>
	);
}
