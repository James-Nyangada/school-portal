'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
	Avatar,
	Button,
	Chip,
	InputAdornment,
	Paper,
	Tab,
	Table,
	TableBody,
	TableCell,
	TableContainer,
	TableHead,
	TableRow,
	Tabs,
	TextField,
	Typography
} from '@mui/material';
import FusePageSimple from '@fuse/core/FusePageSimple';
import FuseSvgIcon from '@fuse/core/FuseSvgIcon';
import AuthGuardRedirect from '@auth/AuthGuardRedirect';
import { StatCard } from '@/components/dashboard/StatCard';
import { downloadCsv, useBackend } from '@/lib/finance';
import { AttendanceStatus, Classroom, classroomSummary, fullName } from '@/lib/classroom';

const STATUS_CHIP: Record<AttendanceStatus, { label: string; color: 'success' | 'warning' | 'error' }> = {
	PRESENT: { label: 'Present', color: 'success' },
	LATE: { label: 'Late', color: 'warning' },
	ABSENT: { label: 'Absent', color: 'error' }
};

function rateColor(rate: number) {
	if (rate >= 90) return 'text-green-600';

	if (rate >= 75) return 'text-amber-600';

	return 'text-red-600';
}

export default function TeacherClassroom() {
	const { data: classroom, loading, error } = useBackend<Classroom | null>('/api/classes/mine');
	const [tab, setTab] = useState<'students' | 'subjects'>('students');
	const [search, setSearch] = useState('');

	const students = useMemo(() => {
		const q = search.trim().toLowerCase();

		if (!classroom || !q) return classroom?.students ?? [];

		return classroom.students.filter((s) =>
			[fullName(s), s.admissionNumber ?? ''].some((v) => v.toLowerCase().includes(q))
		);
	}, [classroom, search]);

	const exportRoster = () => {
		if (!classroom) return;

		downloadCsv(
			`${classroom.name.replace(/[^\w-]+/g, '_')}-roster.csv`,
			['Admission No.', 'Student', 'Parent / Guardian', 'Relationship', 'Phone', 'Email', '30-day attendance %'],
			classroom.students.flatMap((s) => {
				const parents = s.parents.length ? s.parents : [null];
				return parents.map((p) => [
					s.admissionNumber,
					fullName(s),
					p ? fullName(p) : '',
					p?.relationship,
					p?.phone,
					p?.email,
					s.attendanceRate
				]);
			})
		);
	};

	const renderBody = () => {
		if (loading && !classroom) {
			return <Typography className="py-12 text-center text-gray-500">Loading your classroom…</Typography>;
		}

		if (error) {
			return <Typography className="py-12 text-center text-red-600">{error}</Typography>;
		}

		if (!classroom) {
			return (
				<Paper className="flex flex-col items-center gap-3 rounded-2xl px-6 py-16 text-center shadow">
					<FuseSvgIcon
						className="text-gray-400"
						size={40}
					>
						lucide:school
					</FuseSvgIcon>
					<Typography className="text-lg font-semibold">You are not a class teacher yet</Typography>
					<Typography className="max-w-md text-sm text-gray-500">
						An administrator assigns class teachers from Manage Classes. Once you are assigned a class, its
						students, parents and attendance will appear here.
					</Typography>
				</Paper>
			);
		}

		const summary = classroomSummary(classroom);

		return (
			<>
				<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
					<StatCard
						icon="lucide:users"
						iconColor="text-blue-600"
						iconBg="bg-blue-50"
						label="Students"
						value={summary.students}
						caption={<span>Enrolled in {classroom.name}</span>}
					/>
					<StatCard
						icon="lucide:user-check"
						iconColor="text-green-600"
						iconBg="bg-green-50"
						label="Present Today"
						value={summary.present + summary.late}
						caption={
							<span>
								{summary.late} late · {summary.unmarked} not yet marked
							</span>
						}
					/>
					<StatCard
						icon="lucide:user-x"
						iconColor="text-red-600"
						iconBg="bg-red-50"
						label="Absent Today"
						value={summary.absent}
						caption={<span>Absent from at least one lesson</span>}
					/>
					<StatCard
						icon="lucide:trending-up"
						iconColor="text-amber-600"
						iconBg="bg-amber-50"
						label="Attendance (30 days)"
						value={summary.averageRate === null ? '—' : `${summary.averageRate}%`}
						caption={<span>Class average across marked lessons</span>}
					/>
				</div>

				<Paper className="overflow-hidden rounded-2xl shadow">
					<div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 sm:px-6">
						<Tabs
							value={tab}
							onChange={(_, v) => setTab(v)}
						>
							<Tab
								value="students"
								label={`Students (${classroom.students.length})`}
							/>
							<Tab
								value="subjects"
								label={`Subjects (${classroom.subjects.length})`}
							/>
						</Tabs>
						{tab === 'students' && (
							<TextField
								size="small"
								placeholder="Search name or admission no."
								value={search}
								onChange={(e) => setSearch(e.target.value)}
								className="my-2 w-full sm:w-72"
								slotProps={{
									input: {
										startAdornment: (
											<InputAdornment position="start">
												<FuseSvgIcon size={16}>lucide:search</FuseSvgIcon>
											</InputAdornment>
										)
									}
								}}
							/>
						)}
					</div>

					{tab === 'students' ? (
						<TableContainer>
							<Table>
								<TableHead>
									<TableRow>
										<TableCell className="font-semibold">Student</TableCell>
										<TableCell className="font-semibold">Admission No.</TableCell>
										<TableCell className="font-semibold">Today</TableCell>
										<TableCell
											className="font-semibold"
											align="right"
										>
											30-day attendance
										</TableCell>
										<TableCell className="font-semibold">Parent / Guardian</TableCell>
									</TableRow>
								</TableHead>
								<TableBody>
									{students.map((s) => (
										<TableRow
											key={s.id}
											hover
										>
											<TableCell>
												<div className="flex items-center gap-3">
													<Avatar
														src={s.passportPhotoUrl ?? undefined}
														className="h-8 w-8 text-sm"
													>
														{s.firstName?.[0]}
													</Avatar>
													<div>
														<Typography className="font-medium">{fullName(s)}</Typography>
														{s.status !== 'ACTIVE' && (
															<Typography className="text-xs text-gray-500">
																{s.status.toLowerCase()}
															</Typography>
														)}
													</div>
												</div>
											</TableCell>
											<TableCell>{s.admissionNumber ?? '—'}</TableCell>
											<TableCell>
												{s.todayStatus ? (
													<Chip
														size="small"
														label={STATUS_CHIP[s.todayStatus].label}
														color={STATUS_CHIP[s.todayStatus].color}
														variant="outlined"
													/>
												) : (
													<span className="text-sm text-gray-400">Not marked</span>
												)}
											</TableCell>
											<TableCell align="right">
												{s.attendanceRate === null ? (
													<span className="text-gray-400">—</span>
												) : (
													<span className={`font-semibold ${rateColor(s.attendanceRate)}`}>
														{s.attendanceRate}%
													</span>
												)}
											</TableCell>
											<TableCell>
												{s.parents.length === 0 && (
													<span className="text-sm text-gray-400">No parent linked</span>
												)}
												{s.parents.map((p) => (
													<div
														key={p.id}
														className="text-sm"
													>
														<span className="font-medium">{fullName(p)}</span>
														{p.relationship && (
															<span className="text-gray-500"> ({p.relationship})</span>
														)}
														{p.phone && (
															<a
																href={`tel:${p.phone}`}
																className="ml-2 text-blue-600 hover:underline"
															>
																{p.phone}
															</a>
														)}
													</div>
												))}
											</TableCell>
										</TableRow>
									))}
									{students.length === 0 && (
										<TableRow>
											<TableCell
												colSpan={5}
												align="center"
												className="py-12 text-gray-500"
											>
												{search
													? 'No students match your search'
													: 'No students in this class yet'}
											</TableCell>
										</TableRow>
									)}
								</TableBody>
							</Table>
						</TableContainer>
					) : (
						<TableContainer>
							<Table>
								<TableHead>
									<TableRow>
										<TableCell className="font-semibold">Subject</TableCell>
										<TableCell className="font-semibold">Code</TableCell>
										<TableCell className="font-semibold">Subject Teacher</TableCell>
									</TableRow>
								</TableHead>
								<TableBody>
									{classroom.subjects.map((sub) => (
										<TableRow
											key={sub.id}
											hover
										>
											<TableCell className="font-medium">{sub.name}</TableCell>
											<TableCell>{sub.code}</TableCell>
											<TableCell>
												{sub.teachers.length ? (
													sub.teachers.map(fullName).join(', ')
												) : (
													<Chip
														size="small"
														label="Unassigned"
														variant="outlined"
													/>
												)}
											</TableCell>
										</TableRow>
									))}
									{classroom.subjects.length === 0 && (
										<TableRow>
											<TableCell
												colSpan={3}
												align="center"
												className="py-12 text-gray-500"
											>
												No subjects have been assigned to this class yet
											</TableCell>
										</TableRow>
									)}
								</TableBody>
							</Table>
						</TableContainer>
					)}
				</Paper>
			</>
		);
	};

	return (
		<AuthGuardRedirect auth={['TEACHER']}>
			<FusePageSimple
				content={
					<div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8">
						<div className="flex flex-wrap items-end justify-between gap-4">
							<div>
								<Typography className="text-3xl font-extrabold tracking-tight">
									{classroom ? classroom.name : 'My Classroom'}
								</Typography>
								<Typography className="mt-1 text-sm text-gray-500">
									{classroom
										? `Your class as class teacher${classroom.level !== null ? ` · Level ${classroom.level}` : ''}`
										: 'The class you are class teacher of'}
								</Typography>
							</div>
							{classroom && (
								<div className="flex flex-wrap gap-2">
									<Button
										variant="outlined"
										className="rounded-full"
										startIcon={<FuseSvgIcon size={16}>lucide:download</FuseSvgIcon>}
										onClick={exportRoster}
									>
										Export roster
									</Button>
									<Button
										component={Link}
										href="/teacher/attendance"
										variant="contained"
										color="secondary"
										className="rounded-full"
										startIcon={<FuseSvgIcon size={16}>lucide:clipboard-check</FuseSvgIcon>}
									>
										Take attendance
									</Button>
								</div>
							)}
						</div>

						{renderBody()}
					</div>
				}
			/>
		</AuthGuardRedirect>
	);
}
