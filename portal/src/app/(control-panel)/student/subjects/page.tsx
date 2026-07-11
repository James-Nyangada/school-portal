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
	TableRow
} from '@mui/material';
import FusePageSimple from '@fuse/core/FusePageSimple';
import AuthGuardRedirect from '@auth/AuthGuardRedirect';

export default function StudentSubjects() {
	const { data: session } = useSession();
	const token = (session as any)?.backendToken;

	const [subjects, setSubjects] = useState<any[]>([]);

	useEffect(() => {
		if (!token) return;

		const fetchSubjects = async () => {
			try {
				const res = await fetch('http://localhost:4000/api/student/subjects', {
					headers: { Authorization: `Bearer ${token}` }
				});

				if (res.ok) {
					setSubjects(await res.json());
				}
			} catch (e) {
				console.error(e);
			}
		};
		fetchSubjects();
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
							My Subjects
						</Typography>
					</div>
				}
				content={
					<Box p={4}>
						<TableContainer component={Paper}>
							<Table>
								<TableHead>
									<TableRow>
										<TableCell>Subject Name</TableCell>
										<TableCell>Code</TableCell>
										<TableCell>Teacher</TableCell>
									</TableRow>
								</TableHead>
								<TableBody>
									{subjects.map((sub) => (
										<TableRow key={sub.id}>
											<TableCell>{sub.name}</TableCell>
											<TableCell>{sub.code}</TableCell>
											<TableCell>{sub.teacherName || 'TBA'}</TableCell>
										</TableRow>
									))}
									{subjects.length === 0 && (
										<TableRow>
											<TableCell
												colSpan={3}
												align="center"
											>
												No enrolled subjects found.
											</TableCell>
										</TableRow>
									)}
								</TableBody>
							</Table>
						</TableContainer>
					</Box>
				}
			/>
		</AuthGuardRedirect>
	);
}
