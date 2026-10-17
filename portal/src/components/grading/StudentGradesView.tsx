'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
	Alert,
	Button,
	Chip,
	CircularProgress,
	MenuItem,
	Paper,
	Table,
	TableBody,
	TableCell,
	TableContainer,
	TableHead,
	TableRow,
	TextField,
	Typography
} from '@mui/material';
import FuseSvgIcon from '@fuse/core/FuseSvgIcon';
import {
	errorMessage,
	kes,
	LEVELS,
	levelInfo,
	strandLabel,
	useGradesApi,
	type CompetencyLevel,
	type StudentGrade,
	type StudentGradesResponse
} from './api';
import '@/styles/print.css';

/** Same rule as the report card: rounded mean of summative entries (all entries if none are summative). */
function overallLevel(entries: StudentGrade[]): CompetencyLevel | null {
	const levelled = entries.filter((e) => e.competencyLevel);
	const summative = levelled.filter((e) => e.assessmentType === 'SUMMATIVE');
	const use = summative.length > 0 ? summative : levelled;

	if (use.length === 0) return null;

	const points = { EE: 4, ME: 3, AE: 2, BE: 1 } as const;
	const mean = Math.round(use.reduce((a, e) => a + points[e.competencyLevel!], 0) / use.length);

	return LEVELS.find((l) => points[l.value] === mean)?.value ?? null;
}

function Locked({ data, payHref, payerNote }: { data: StudentGradesResponse; payHref: string; payerNote?: string }) {
	const a = data.access;

	return (
		<Paper
			variant="outlined"
			className="no-print flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed px-6 py-12 text-center"
		>
			<FuseSvgIcon
				size={48}
				color="disabled"
			>
				lucide:lock
			</FuseSvgIcon>
			<Typography className="text-xl font-bold">Grades locked</Typography>
			<Typography
				color="text.secondary"
				className="max-w-lg"
			>
				{a.arrears > 0
					? `Clear the ${kes(a.arrears)} carried over from previous terms`
					: 'Clear the required fees'}
				{a.threshold >= 100
					? a.isLeaver
						? ' and all remaining fees (students who have completed school need full clearance)'
						: ' and all remaining fees'
					: a.currentTermBilled > 0
						? ` and at least ${a.threshold}% of this term's fees`
						: ''}{' '}
				to unlock grades. {a.percentPaid}% of all fees billed has been paid so far.
			</Typography>
			<div className="flex flex-wrap justify-center gap-6 py-2">
				<div>
					<Typography
						variant="caption"
						color="text.secondary"
					>
						Current balance
					</Typography>
					<Typography className="text-lg font-semibold">{kes(a.balance)}</Typography>
				</div>
				<div>
					<Typography
						variant="caption"
						color="text.secondary"
					>
						Pay to unlock
					</Typography>
					<Typography
						className="text-lg font-semibold"
						color="error"
					>
						{kes(a.amountNeeded)}
					</Typography>
				</div>
			</div>
			<Button
				component={Link}
				href={payHref}
				variant="contained"
				color="error"
				size="large"
			>
				Pay now
			</Button>
			{payerNote && (
				<Typography
					variant="body2"
					color="text.secondary"
				>
					{payerNote}
				</Typography>
			)}
		</Paper>
	);
}

function NumericTable({
	grades,
	previous,
	catCount
}: {
	grades: StudentGrade[];
	previous: StudentGrade[];
	catCount: number;
}) {
	const prevBySubject = new Map(previous.map((g) => [g.subject, g.total]));

	return (
		<TableContainer>
			<Table size="small">
				<TableHead>
					<TableRow>
						<TableCell>Subject</TableCell>
						{Array.from({ length: catCount }, (_, i) => (
							<TableCell
								key={i}
								align="center"
							>
								CAT {i + 1}
							</TableCell>
						))}
						<TableCell align="center">Exam</TableCell>
						<TableCell align="center">Total %</TableCell>
						<TableCell align="center">Grade</TableCell>
						<TableCell
							align="center"
							className="no-print"
						>
							vs last term
						</TableCell>
						<TableCell>Teacher’s comment</TableCell>
					</TableRow>
				</TableHead>
				<TableBody>
					{grades.map((g) => {
						const before = prevBySubject.get(g.subject);
						const delta =
							g.total !== null && before != null ? Math.round((g.total - before) * 10) / 10 : null;

						return (
							<TableRow key={g.id}>
								<TableCell className="font-medium">{g.subject}</TableCell>
								{Array.from({ length: catCount }, (_, i) => (
									<TableCell
										key={i}
										align="center"
									>
										{g.catScores[i] ?? '—'}
									</TableCell>
								))}
								<TableCell align="center">{g.examScore ?? '—'}</TableCell>
								<TableCell
									align="center"
									className="font-semibold"
								>
									{g.total ?? (g.value || '—')}
								</TableCell>
								<TableCell align="center">{g.letterGrade ?? '—'}</TableCell>
								<TableCell
									align="center"
									className="no-print"
								>
									{delta === null ? (
										'—'
									) : (
										<Chip
											size="small"
											variant="outlined"
											color={delta > 0 ? 'success' : delta < 0 ? 'error' : 'default'}
											label={`${delta > 0 ? '▲ +' : delta < 0 ? '▼ ' : ''}${delta}`}
										/>
									)}
								</TableCell>
								<TableCell>{g.teacherComment || '—'}</TableCell>
							</TableRow>
						);
					})}
				</TableBody>
			</Table>
		</TableContainer>
	);
}

function CbcView({ grades }: { grades: StudentGrade[] }) {
	const bySubject = useMemo(() => {
		const m = new Map<string, StudentGrade[]>();
		grades.forEach((g) => m.set(g.subject, [...(m.get(g.subject) ?? []), g]));
		return [...m.entries()];
	}, [grades]);

	return (
		<div className="flex flex-col gap-4 p-4">
			{bySubject.map(([subject, entries]) => {
				const overall = overallLevel(entries);

				return (
					<Paper
						key={subject}
						variant="outlined"
						className="rounded-xl"
					>
						<div className="flex items-center justify-between gap-2 border-b px-4 py-3">
							<Typography className="font-semibold">{subject}</Typography>
							{overall && (
								<Chip
									color={levelInfo(overall)?.color ?? 'default'}
									label={`${overall} · ${levelInfo(overall)?.label}`}
								/>
							)}
						</div>
						<Table size="small">
							<TableBody>
								{entries.map((g) => (
									<TableRow key={g.id}>
										<TableCell>{strandLabel(g) || '—'}</TableCell>
										<TableCell className="text-sm">
											{g.assessmentType === 'SUMMATIVE' ? 'Summative' : 'Formative'}
										</TableCell>
										<TableCell align="center">
											<Chip
												size="small"
												variant="outlined"
												color={levelInfo(g.competencyLevel)?.color ?? 'default'}
												label={g.value || '—'}
											/>
										</TableCell>
										<TableCell>{g.teacherComment || ''}</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					</Paper>
				);
			})}
		</div>
	);
}

/**
 * Published grades for one student (Parent 5.3 / Student 6.2). The server applies the fee gate and never returns
 * drafts or values still waiting for approval.
 */
export default function StudentGradesView({
	studentId,
	payHref,
	payerNote,
	header
}: {
	studentId: string | null;
	payHref: string;
	payerNote?: string;
	header?: React.ReactNode;
}) {
	const api = useGradesApi();
	const [data, setData] = useState<StudentGradesResponse | null>(null);
	const [error, setError] = useState('');
	const [term, setTerm] = useState('');

	useEffect(() => {
		if (!api.ready || !studentId) return;

		setData(null);
		setError('');
		api.get<StudentGradesResponse>(`/student/${studentId}`)
			.then((d) => {
				setData(d);
				setTerm(d.terms.includes(d.currentTerm) ? d.currentTerm : (d.terms[d.terms.length - 1] ?? ''));
			})
			.catch((e) => setError(errorMessage(e)));
	}, [api, studentId]);

	const termGrades = useMemo(() => data?.grades.filter((g) => g.term === term) ?? [], [data, term]);
	const previousTerm = data ? data.terms[data.terms.indexOf(term) - 1] : undefined;
	const previous = useMemo(
		() => (previousTerm ? (data?.grades.filter((g) => g.term === previousTerm && g.mode === 'NUMERIC') ?? []) : []),
		[data, previousTerm]
	);
	const numeric = termGrades.filter((g) => g.mode === 'NUMERIC');
	const cbc = termGrades.filter((g) => g.mode === 'CBC');
	const average =
		numeric.filter((g) => g.total !== null).length > 0
			? Math.round(
					(numeric.reduce((a, g) => a + (g.total ?? 0), 0) / numeric.filter((g) => g.total !== null).length) *
						10
				) / 10
			: null;

	return (
		<div className="flex flex-col gap-6">
			<div className="no-print flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
				{header}
				<div className="flex flex-wrap items-center gap-3">
					{data && data.terms.length > 0 && data.access.allowed && (
						<TextField
							select
							label="Term"
							value={term}
							onChange={(e) => setTerm(e.target.value)}
							size="small"
							className="min-w-40"
						>
							{data.terms.map((t) => (
								<MenuItem
									key={t}
									value={t}
								>
									{t}
								</MenuItem>
							))}
						</TextField>
					)}
					{data?.access.allowed && termGrades.length > 0 && (
						<Button
							variant="contained"
							onClick={() => window.print()}
							startIcon={<FuseSvgIcon size={20}>lucide:printer</FuseSvgIcon>}
						>
							Print report
						</Button>
					)}
				</div>
			</div>

			{error && <Alert severity="error">{error}</Alert>}
			{!data && !error && (
				<div className="flex justify-center py-16">
					<CircularProgress />
				</div>
			)}

			{data && !data.access.allowed && (
				<Locked
					data={data}
					payHref={payHref}
					payerNote={payerNote}
				/>
			)}

			{data && data.access.allowed && (
				<>
					<div className="print-header">
						<h1>Academic Report</h1>
						<p>
							{term} · Generated {new Date().toLocaleDateString()}
						</p>
					</div>
					<div className="print-student-info print-only">
						<div>
							<span>Student:</span> {data.student.name}
						</div>
						<div>
							<span>Admission No:</span> {data.student.admissionNumber ?? '—'}
						</div>
						<div>
							<span>Class:</span> {data.student.className ?? '—'}
						</div>
						{average !== null && (
							<div>
								<span>Average:</span> {average}%
							</div>
						)}
					</div>

					{termGrades.length === 0 ? (
						<Paper
							variant="outlined"
							className="flex flex-col items-center gap-2 rounded-2xl px-6 py-14 text-center"
						>
							<FuseSvgIcon
								size={36}
								color="disabled"
							>
								lucide:clipboard-list
							</FuseSvgIcon>
							<Typography color="text.secondary">No grades have been published yet.</Typography>
						</Paper>
					) : (
						<Paper
							variant="outlined"
							className="overflow-hidden rounded-2xl"
						>
							{average !== null && (
								<div className="flex flex-wrap gap-6 border-b px-4 py-3">
									<div>
										<Typography
											variant="caption"
											color="text.secondary"
										>
											Average
										</Typography>
										<Typography className="text-xl font-bold">{average}%</Typography>
									</div>
									<div>
										<Typography
											variant="caption"
											color="text.secondary"
										>
											Subjects
										</Typography>
										<Typography className="text-xl font-bold">{numeric.length}</Typography>
									</div>
								</div>
							)}
							{numeric.length > 0 && (
								<NumericTable
									grades={numeric}
									previous={previous}
									catCount={Math.max(
										data.settings.catCount,
										...numeric.map((g) => g.catScores.length)
									)}
								/>
							)}
							{cbc.length > 0 && <CbcView grades={cbc} />}
						</Paper>
					)}
				</>
			)}
		</div>
	);
}
