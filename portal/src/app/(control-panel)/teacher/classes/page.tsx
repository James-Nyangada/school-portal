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
	Accordion,
	AccordionSummary,
	AccordionDetails
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import FusePageSimple from '@fuse/core/FusePageSimple';
import AuthGuardRedirect from '@auth/AuthGuardRedirect';

export default function TeacherClasses() {
	const { data: session } = useSession();
	const token = (session as any)?.backendToken;

	const [assignedClasses, setAssignedClasses] = useState<any[]>([]);

	const fetchClasses = async () => {
		if (!token) return;

		try {
			const res = await fetch('http://localhost:4000/api/teacher/classes', {
				headers: { Authorization: `Bearer ${token}` }
			});

			if (res.ok) {
				setAssignedClasses(await res.json());
			}
		} catch (e) {
			console.error(e);
		}
	};

	useEffect(() => {
		fetchClasses();
	}, [token]);

	return (
		<AuthGuardRedirect auth={['TEACHER']}>
			<FusePageSimple
				header={
					<div className="mx-auto flex w-full max-w-7xl flex-col gap-32 border-b px-24 py-32">
						<Typography className="text-4xl font-extrabold tracking-tight">My Classes</Typography>
					</div>
				}
				content={
					<Box className="mx-auto flex w-full max-w-7xl flex-col gap-32 px-24 py-32">
						{assignedClasses.map((cls) => (
							<Accordion
								key={cls.id}
								sx={{ mb: 2 }}
							>
								<AccordionSummary expandIcon={<ExpandMoreIcon />}>
									<Typography variant="h6">
										{cls.name} (Level: {cls.level})
									</Typography>
								</AccordionSummary>
								<AccordionDetails>
									<Typography
										variant="subtitle1"
										gutterBottom
									>
										Students
									</Typography>
									<TableContainer
										component={Paper}
										className="bg-card flex flex-auto flex-col rounded-2xl p-24 shadow"
									>
										<Table size="small">
											<TableHead>
												<TableRow>
													<TableCell>Student ID</TableCell>
													<TableCell>Name</TableCell>
													<TableCell>Gender</TableCell>
												</TableRow>
											</TableHead>
											<TableBody>
												{cls.students &&
													cls.students.map((student: any) => (
														<TableRow key={student.id}>
															<TableCell>{student.id}</TableCell>
															<TableCell>
																{student.firstName} {student.lastName}
															</TableCell>
															<TableCell>{student.gender}</TableCell>
														</TableRow>
													))}
												{(!cls.students || cls.students.length === 0) && (
													<TableRow>
														<TableCell
															colSpan={3}
															align="center"
														>
															No students found in this class.
														</TableCell>
													</TableRow>
												)}
											</TableBody>
										</Table>
									</TableContainer>
								</AccordionDetails>
							</Accordion>
						))}
						{assignedClasses.length === 0 && <Typography>No classes assigned to you currently.</Typography>}
					</Box>
				}
			/>
		</AuthGuardRedirect>
	);
}
