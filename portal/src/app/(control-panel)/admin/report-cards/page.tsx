'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import {
	Typography,
	Button,
	Paper,
	Table,
	TableBody,
	TableCell,
	TableContainer,
	TableHead,
	TableRow,
	FormControl,
	InputLabel,
	Select,
	MenuItem
} from '@mui/material';
import FusePageSimple from '@fuse/core/FusePageSimple';
import AuthGuardRedirect from '@auth/AuthGuardRedirect';

export default function AdminReportCards() {
	const { data: session } = useSession();
	const token = (session as any)?.backendToken;

	const [classes, setClasses] = useState<any[]>([]);
	const [selectedClassId, setSelectedClassId] = useState<string>('');
	const [reports, setReports] = useState<any[]>([]);
	const [loading, setLoading] = useState(false);

	const fetchClasses = async () => {
		if (!token) return;

		try {
			const res = await fetch('http://localhost:4000/api/classes', {
				headers: { Authorization: `Bearer ${token}` }
			});

			if (res.ok) setClasses(await res.json());
		} catch (e) {
			console.error(e);
		}
	};

	const fetchReports = async (classId: string) => {
		if (!token || !classId) return;

		try {
			const res = await fetch(`http://localhost:4000/api/report-cards?classId=${classId}`, {
				headers: { Authorization: `Bearer ${token}` }
			});

			if (res.ok) setReports(await res.json());
		} catch (e) {
			console.error(e);
		}
	};

	useEffect(() => {
		fetchClasses();
	}, [token]);

	useEffect(() => {
		if (selectedClassId) {
			fetchReports(selectedClassId);
		}
	}, [selectedClassId]);

	const handleGenerate = async () => {
		if (!selectedClassId) return alert('Please select a class');

		setLoading(true);
		try {
			const res = await fetch(`http://localhost:4000/api/report-cards/generate`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${token}`
				},
				body: JSON.stringify({ classId: selectedClassId, term: 'Term 1' }) // Hardcoded term for now
			});

			if (res.ok) {
				alert('Report cards generated successfully');
				fetchReports(selectedClassId);
			} else {
				alert('Failed to generate report cards');
			}
		} catch (e) {
			alert('Error generating report cards');
		} finally {
			setLoading(false);
		}
	};

	const handlePublish = async (id: string) => {
		try {
			const res = await fetch(`http://localhost:4000/api/report-cards/${id}/publish`, {
				method: 'POST',
				headers: { Authorization: `Bearer ${token}` }
			});

			if (res.ok) {
				fetchReports(selectedClassId);
			}
		} catch (e) {
			console.error(e);
		}
	};

	return (
		<AuthGuardRedirect auth={['SUPER_ADMIN', 'ADMIN']}>
			<FusePageSimple
				content={
					<div className="mx-auto flex w-full max-w-7xl flex-col gap-32 px-24 py-32">
						<Typography className="text-4xl font-extrabold tracking-tight">
							Report Cards Management
						</Typography>

						<div className="flex flex-col gap-32">
							<div className="flex items-center gap-16">
								<FormControl sx={{ minWidth: 200 }}>
									<InputLabel>Select Class</InputLabel>
									<Select
										value={selectedClassId}
										label="Select Class"
										onChange={(e) => setSelectedClassId(e.target.value)}
									>
										{classes.map((c) => (
											<MenuItem
												key={c.id}
												value={c.id}
											>
												{c.name}
											</MenuItem>
										))}
										{classes.length === 0 && (
											<MenuItem
												disabled
												value=""
											>
												No classes found
											</MenuItem>
										)}
									</Select>
								</FormControl>
								<Button
									variant="contained"
									color="primary"
									onClick={handleGenerate}
									disabled={!selectedClassId || loading}
									className="h-full"
								>
									{loading ? 'Generating...' : 'Generate Term Report Cards'}
								</Button>
							</div>

							{selectedClassId && (
								<Paper className="bg-card flex flex-auto flex-col rounded-2xl p-24 shadow">
									<TableContainer>
										<Table>
											<TableHead>
												<TableRow>
													<TableCell>Student ID</TableCell>
													<TableCell>Term</TableCell>
													<TableCell>Total Score</TableCell>
													<TableCell>Average</TableCell>
													<TableCell>Status</TableCell>
													<TableCell align="right">Actions</TableCell>
												</TableRow>
											</TableHead>
											<TableBody>
												{reports.map((report) => (
													<TableRow key={report.id}>
														<TableCell>{report.studentId}</TableCell>
														<TableCell>{report.term}</TableCell>
														<TableCell>{report.totalScore}</TableCell>
														<TableCell>{report.average}</TableCell>
														<TableCell>
															<Typography
																color={
																	report.status === 'PUBLISHED'
																		? 'success.main'
																		: 'warning.main'
																}
															>
																{report.status}
															</Typography>
														</TableCell>
														<TableCell align="right">
															{report.status !== 'PUBLISHED' && (
																<Button
																	size="small"
																	variant="outlined"
																	onClick={() => handlePublish(report.id)}
																>
																	Publish
																</Button>
															)}
														</TableCell>
													</TableRow>
												))}
												{reports.length === 0 && (
													<TableRow>
														<TableCell
															colSpan={6}
															align="center"
														>
															No report cards found for this class.
														</TableCell>
													</TableRow>
												)}
											</TableBody>
										</Table>
									</TableContainer>
								</Paper>
							)}
						</div>
					</div>
				}
			/>
		</AuthGuardRedirect>
	);
}
