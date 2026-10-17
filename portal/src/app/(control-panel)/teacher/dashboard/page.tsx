'use client';

import Link from 'next/link';
import Typography from '@mui/material/Typography';
import { Alert, Button, Paper } from '@mui/material';
import FusePageSimple from '@fuse/core/FusePageSimple';
import AuthGuardRedirect from '@auth/AuthGuardRedirect';
import FuseSvgIcon from '@fuse/core/FuseSvgIcon';
import { StatCard } from '@/components/dashboard/StatCard';
import TodayLessons from '@/components/timetable/TodayLessons';
import NewsletterBanner from '@/components/newsletter/NewsletterBanner';
import MyClassroomCard from '@/components/dashboard/MyClassroomCard';
import { registerHref } from '@/components/attendance/api';
import { useBackend } from '@/lib/finance';

/** Shape of GET /api/dashboard/teacher (server/src/routes/dashboard.ts). */
type TeacherStats = {
	term: string;
	date: string;
	lessonsToday: number;
	lessons: {
		lessonId: string;
		entryId: string;
		subject: string;
		classes: string[];
		startTime: string;
		endTime: string;
		room: string | null;
		finished: boolean;
		marked: boolean;
	}[];
	unmarkedAttendance: number;
	ungradedSubmissions: number;
	averageScore: number | null;
	classAverages: { classId: string; className: string; average: number | null; graded: number }[];
};

export default function TeacherDashboard() {
	const { data: stats, error, loading } = useBackend<TeacherStats>('/api/dashboard/teacher');
	const unmarked = stats?.lessons.filter((l) => l.finished && !l.marked) ?? [];
	const show = (n: number | undefined) => (loading && !stats ? '…' : (n ?? 0));

	return (
		<AuthGuardRedirect auth={['TEACHER']}>
			<FusePageSimple
				content={
					<div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8">
						<NewsletterBanner />

						<Typography className="text-3xl font-extrabold tracking-tight">Teacher Dashboard</Typography>

						{error && <Alert severity="error">Couldn&apos;t load your stats: {error}</Alert>}

						<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
							<StatCard
								icon="lucide:book-open"
								iconColor="text-blue-600"
								iconBg="bg-blue-50"
								label="Lessons Today"
								value={show(stats?.lessonsToday)}
								caption={
									<span>
										<strong className="font-semibold text-gray-700">Scheduled</strong> on the
										published timetable
									</span>
								}
							/>
							<StatCard
								icon="lucide:clipboard-list"
								iconColor={stats?.unmarkedAttendance ? 'text-red-600' : 'text-emerald-600'}
								iconBg={stats?.unmarkedAttendance ? 'bg-red-50' : 'bg-emerald-50'}
								label="Attendance To Mark"
								value={show(stats?.unmarkedAttendance)}
								caption="Registers for lessons that have already finished today"
								footer={
									<Link
										href="/teacher/attendance"
										className="block border-t border-gray-100 pt-2 text-xs font-medium text-blue-600 hover:underline"
									>
										Mark attendance
									</Link>
								}
							/>
							<StatCard
								icon="lucide:circle-check"
								iconColor="text-amber-600"
								iconBg="bg-amber-50"
								label="Pending Grading"
								value={show(stats?.ungradedSubmissions)}
								caption="Submissions waiting for you to grade"
								footer={
									<Link
										href="/teacher/assignments"
										className="block border-t border-gray-100 pt-2 text-xs font-medium text-blue-600 hover:underline"
									>
										Grade submissions
									</Link>
								}
							/>
							<StatCard
								icon="lucide:chart-column"
								iconColor="text-indigo-600"
								iconBg="bg-indigo-50"
								label={`Class Average · ${stats?.term ?? 'this term'}`}
								value={
									loading && !stats
										? '…'
										: stats?.averageScore != null
											? `${stats.averageScore}%`
											: '—'
								}
								caption={
									stats?.classAverages.length
										? stats.classAverages
												.map(
													(c) => `${c.className} ${c.average != null ? `${c.average}%` : '—'}`
												)
												.join(' · ')
										: 'No published grades in your classes yet'
								}
							/>
						</div>

						{unmarked.length > 0 && (
							<Paper className="flex flex-col gap-3 rounded-xl border border-red-100 p-5 shadow-sm">
								<Typography className="font-semibold">Registers still to take</Typography>
								<div className="flex flex-col divide-y divide-gray-100">
									{unmarked.map((l) => (
										<div
											key={`${l.lessonId}-${l.entryId}`}
											className="flex flex-wrap items-center justify-between gap-2 py-2"
										>
											<span className="text-sm">
												<strong>{l.subject}</strong> · {l.classes.join(', ')} · {l.startTime}–
												{l.endTime}
												{l.room && ` · ${l.room}`}
											</span>
											<Button
												size="small"
												variant="outlined"
												component={Link}
												href={registerHref(l.lessonId, l.entryId, stats!.date)}
												startIcon={<FuseSvgIcon size={14}>lucide:clipboard-check</FuseSvgIcon>}
											>
												Take register
											</Button>
										</div>
									))}
								</div>
							</Paper>
						)}

						<MyClassroomCard />

						<TodayLessons href="/teacher/timetable" />
					</div>
				}
			/>
		</AuthGuardRedirect>
	);
}
