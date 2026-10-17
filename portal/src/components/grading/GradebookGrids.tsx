'use client';

import { useEffect, useMemo, useState } from 'react';
import {
	Button,
	Chip,
	Dialog,
	DialogActions,
	DialogContent,
	DialogTitle,
	IconButton,
	MenuItem,
	Paper,
	Table,
	TableBody,
	TableCell,
	TableContainer,
	TableHead,
	TableRow,
	TextField,
	Tooltip,
	Typography
} from '@mui/material';
import FuseSvgIcon from '@fuse/core/FuseSvgIcon';
import {
	LEVELS,
	levelInfo,
	previewTotal,
	STATUS_CHIP,
	type AssessmentType,
	type CompetencyLevel,
	type GradebookResponse,
	type GradeRecord
} from './api';

/** What a grid sends to POST /api/grades/entries (selection fields are added by the page). */
export type EntryPayload = {
	studentId: string;
	catScores?: number[];
	examScore?: number | null;
	strand?: string;
	subStrand?: string | null;
	assessmentType?: AssessmentType;
	competencyLevel?: CompetencyLevel | null;
	teacherComment?: string | null;
};

type GridProps = {
	book: GradebookResponse;
	saving: boolean;
	onSave: (entries: EntryPayload[]) => Promise<void>;
	onOpenGrade: (grade: GradeRecord, studentName: string) => void;
	onHistory: (gradeId: string) => void;
	onDirtyChange: (count: number) => void;
};

const editable = (g: GradeRecord | undefined) => !g || g.status === 'DRAFT';
const num = (s: string) => (s.trim() === '' ? null : Number(s));

function StatusCell({ grade, onHistory }: { grade: GradeRecord | undefined; onHistory: (id: string) => void }) {
	if (!grade) {
		return (
			<Typography
				variant="caption"
				color="text.disabled"
			>
				Not entered
			</Typography>
		);
	}

	const chip = STATUS_CHIP[grade.status];

	return (
		<div className="flex items-center gap-1">
			{grade.pending ? (
				<Tooltip
					title={
						<>
							{grade.pending.type === 'DELETE'
								? 'Deletion requested'
								: `Proposed: ${grade.pending.newValue}`}
							<br />“{grade.pending.reason}”
						</>
					}
				>
					<Chip
						size="small"
						color={chip.color}
						label={chip.label}
					/>
				</Tooltip>
			) : (
				<Chip
					size="small"
					color={chip.color}
					label={chip.label}
					variant={grade.status === 'DRAFT' ? 'outlined' : 'filled'}
				/>
			)}
			{grade.lastRejection && (
				<Tooltip title={`Your last request was rejected: ${grade.lastRejection.decisionReason ?? ''}`}>
					<FuseSvgIcon
						size={16}
						color="error"
					>
						lucide:circle-alert
					</FuseSvgIcon>
				</Tooltip>
			)}
			<Tooltip title="History">
				<IconButton
					size="small"
					onClick={() => onHistory(grade.id)}
				>
					<FuseSvgIcon size={16}>lucide:history</FuseSvgIcon>
				</IconButton>
			</Tooltip>
		</div>
	);
}

function SaveBar({
	dirty,
	saving,
	onSave,
	onDiscard
}: {
	dirty: number;
	saving: boolean;
	onSave: () => void;
	onDiscard: () => void;
}) {
	if (dirty === 0) return null;

	return (
		<div className="flex items-center justify-end gap-2 border-t px-4 py-3">
			<Typography
				variant="body2"
				color="text.secondary"
			>
				{dirty} unsaved {dirty === 1 ? 'change' : 'changes'}
			</Typography>
			<Button
				onClick={onDiscard}
				disabled={saving}
			>
				Discard
			</Button>
			<Button
				variant="contained"
				onClick={onSave}
				disabled={saving}
			>
				Save as draft
			</Button>
		</div>
	);
}

// ============================================================
// Numeric: one row per student — CATs, exam, computed total and letter grade
// ============================================================

type RowEdit = { cats: string[]; exam: string; comment: string };

export function NumericGradebook({ book, saving, onSave, onOpenGrade, onHistory, onDirtyChange }: GridProps) {
	const { catCount, catMaxScore, examMaxScore } = book.settings;
	const byStudent = useMemo(() => new Map(book.grades.map((g) => [g.studentId, g])), [book.grades]);
	const [edits, setEdits] = useState<Record<string, RowEdit>>({});

	useEffect(() => setEdits({}), [book]);
	useEffect(() => onDirtyChange(Object.keys(edits).length), [edits, onDirtyChange]);

	const current = (studentId: string): RowEdit => {
		if (edits[studentId]) return edits[studentId];

		const g = byStudent.get(studentId);

		return {
			cats: Array.from({ length: catCount }, (_, i) => g?.catScores[i]?.toString() ?? ''),
			exam: g?.examScore?.toString() ?? '',
			comment: g?.teacherComment ?? ''
		};
	};

	const change = (studentId: string, patch: Partial<RowEdit>) =>
		setEdits((p) => ({ ...p, [studentId]: { ...current(studentId), ...patch } }));

	const invalid = (v: string, max: number) =>
		v.trim() !== '' && (Number.isNaN(Number(v)) || Number(v) < 0 || Number(v) > max);
	const rowInvalid = (e: RowEdit) => e.cats.some((c) => invalid(c, catMaxScore)) || invalid(e.exam, examMaxScore);

	const save = async () => {
		const rows = Object.entries(edits);

		if (rows.some(([, e]) => rowInvalid(e))) return;

		await onSave(
			rows
				// A blank row for a student with no grade yet is not a change
				.filter(([studentId, e]) => byStudent.has(studentId) || e.cats.some((c) => c.trim()) || e.exam.trim())
				.map(([studentId, e]) => ({
					studentId,
					catScores: e.cats.map(num).filter((c): c is number => c !== null),
					examScore: num(e.exam),
					teacherComment: e.comment.trim() || null
				}))
		);
	};

	return (
		<Paper
			variant="outlined"
			className="overflow-hidden rounded-2xl"
		>
			<TableContainer>
				<Table size="small">
					<TableHead>
						<TableRow>
							<TableCell className="min-w-48">Student</TableCell>
							{Array.from({ length: catCount }, (_, i) => (
								<TableCell
									key={i}
									align="center"
								>
									CAT {i + 1}
									<Typography
										variant="caption"
										color="text.secondary"
										className="block"
									>
										/{catMaxScore}
									</Typography>
								</TableCell>
							))}
							<TableCell align="center">
								Exam
								<Typography
									variant="caption"
									color="text.secondary"
									className="block"
								>
									/{examMaxScore}
								</Typography>
							</TableCell>
							<TableCell align="center">
								Total
								<Typography
									variant="caption"
									color="text.secondary"
									className="block"
								>
									%
								</Typography>
							</TableCell>
							<TableCell align="center">Grade</TableCell>
							<TableCell className="min-w-48">Comment</TableCell>
							<TableCell>Status</TableCell>
							<TableCell />
						</TableRow>
					</TableHead>
					<TableBody>
						{book.students.map((s) => {
							const g = byStudent.get(s.id);
							const open = editable(g);
							const e = current(s.id);
							const preview = open
								? previewTotal(
										book.settings,
										e.cats.map(num).filter((c): c is number => c !== null && !Number.isNaN(c)),
										num(e.exam)
									)
								: { total: g?.total ?? null, letter: g?.letterGrade ?? null };

							return (
								<TableRow
									key={s.id}
									hover
									selected={Boolean(edits[s.id])}
								>
									<TableCell>
										<Typography className="font-medium">{s.name}</Typography>
										<Typography
											variant="caption"
											color="text.secondary"
										>
											{s.admissionNumber}
										</Typography>
									</TableCell>
									{e.cats.map((c, i) => (
										<TableCell
											key={i}
											align="center"
										>
											{open ? (
												<TextField
													value={c}
													onChange={(ev) =>
														change(s.id, {
															cats: e.cats.map((x, j) => (j === i ? ev.target.value : x))
														})
													}
													error={invalid(c, catMaxScore)}
													size="small"
													type="number"
													className="w-20"
													slotProps={{
														htmlInput: {
															min: 0,
															max: catMaxScore,
															step: 0.5,
															'aria-label': `CAT ${i + 1} for ${s.name}`
														}
													}}
												/>
											) : (
												(g?.catScores[i] ?? '—')
											)}
										</TableCell>
									))}
									<TableCell align="center">
										{open ? (
											<TextField
												value={e.exam}
												onChange={(ev) => change(s.id, { exam: ev.target.value })}
												error={invalid(e.exam, examMaxScore)}
												size="small"
												type="number"
												className="w-20"
												slotProps={{
													htmlInput: {
														min: 0,
														max: examMaxScore,
														step: 0.5,
														'aria-label': `Exam for ${s.name}`
													}
												}}
											/>
										) : (
											(g?.examScore ?? '—')
										)}
									</TableCell>
									<TableCell
										align="center"
										className="font-semibold"
									>
										{preview.total ??
											(g && !g.catScores.length && g.examScore === null ? g.value || '—' : '—')}
									</TableCell>
									<TableCell align="center">
										{preview.letter ? (
											<Chip
												size="small"
												label={preview.letter}
												variant="outlined"
											/>
										) : (
											'—'
										)}
									</TableCell>
									<TableCell>
										{open ? (
											<TextField
												value={e.comment}
												onChange={(ev) => change(s.id, { comment: ev.target.value })}
												size="small"
												fullWidth
												placeholder="Optional"
												slotProps={{
													htmlInput: { maxLength: 500, 'aria-label': `Comment for ${s.name}` }
												}}
											/>
										) : (
											<Typography
												variant="body2"
												className="line-clamp-2"
											>
												{g?.teacherComment || '—'}
											</Typography>
										)}
									</TableCell>
									<TableCell>
										<StatusCell
											grade={g}
											onHistory={onHistory}
										/>
									</TableCell>
									<TableCell align="right">
										{g && g.status !== 'PENDING_APPROVAL' && (
											<Button
												size="small"
												variant={g.status === 'PUBLISHED' ? 'outlined' : 'text'}
												onClick={() => onOpenGrade(g, s.name)}
											>
												{g.status === 'DRAFT'
													? 'More'
													: book.canEditDirectly
														? 'Edit'
														: 'Request change'}
											</Button>
										)}
									</TableCell>
								</TableRow>
							);
						})}
					</TableBody>
				</Table>
			</TableContainer>
			<SaveBar
				dirty={Object.keys(edits).length}
				saving={saving}
				onSave={save}
				onDiscard={() => setEdits({})}
			/>
		</Paper>
	);
}

// ============================================================
// CBC: one column per strand / sub-strand assessment, a competency level per student
// ============================================================

type Column = { strand: string; subStrand: string | null; assessmentType: AssessmentType };

const colKey = (c: Column) => `${c.strand}|${c.subStrand ?? ''}|${c.assessmentType}`;

function AddAssessmentDialog({
	open,
	onClose,
	onAdd,
	strands
}: {
	open: boolean;
	onClose: () => void;
	onAdd: (c: Column) => void;
	strands: string[];
}) {
	const [strand, setStrand] = useState('');
	const [subStrand, setSubStrand] = useState('');
	const [type, setType] = useState<AssessmentType>('FORMATIVE');

	useEffect(() => {
		if (open) {
			setStrand('');
			setSubStrand('');
			setType('FORMATIVE');
		}
	}, [open]);

	return (
		<Dialog
			open={open}
			onClose={onClose}
			fullWidth
			maxWidth="xs"
		>
			<DialogTitle>Add assessment</DialogTitle>
			<DialogContent className="flex flex-col gap-4 pt-2">
				<TextField
					label="Strand"
					value={strand}
					onChange={(e) => setStrand(e.target.value)}
					placeholder="e.g. Numbers"
					required
					size="small"
					className="mt-2"
					slotProps={{ htmlInput: { list: 'cbc-strands', maxLength: 80 } }}
				/>
				<datalist id="cbc-strands">
					{strands.map((s) => (
						<option
							key={s}
							value={s}
						/>
					))}
				</datalist>
				<TextField
					label="Sub-strand"
					value={subStrand}
					onChange={(e) => setSubStrand(e.target.value)}
					placeholder="e.g. Fractions"
					size="small"
					slotProps={{ htmlInput: { maxLength: 80 } }}
				/>
				<TextField
					select
					label="Assessment type"
					value={type}
					onChange={(e) => setType(e.target.value as AssessmentType)}
					size="small"
				>
					<MenuItem value="FORMATIVE">Formative (classwork, observation)</MenuItem>
					<MenuItem value="SUMMATIVE">Summative (end-of-strand / term assessment)</MenuItem>
				</TextField>
			</DialogContent>
			<DialogActions>
				<Button onClick={onClose}>Cancel</Button>
				<Button
					variant="contained"
					disabled={!strand.trim()}
					onClick={() => {
						onAdd({ strand: strand.trim(), subStrand: subStrand.trim() || null, assessmentType: type });
						onClose();
					}}
				>
					Add column
				</Button>
			</DialogActions>
		</Dialog>
	);
}

export function CbcGradebook({ book, saving, onSave, onOpenGrade, onHistory, onDirtyChange }: GridProps) {
	const [added, setAdded] = useState<Column[]>([]);
	const [edits, setEdits] = useState<Record<string, CompetencyLevel | ''>>({});
	const [adding, setAdding] = useState(false);

	useEffect(() => setEdits({}), [book]);
	useEffect(() => setAdded([]), [book.class.id, book.subject.id, book.term]);
	useEffect(() => onDirtyChange(Object.keys(edits).length), [edits, onDirtyChange]);

	const columns = useMemo(() => {
		const seen = new Map<string, Column>();

		for (const g of book.grades) {
			if (!g.strand || !g.assessmentType) continue;

			const c = { strand: g.strand, subStrand: g.subStrand, assessmentType: g.assessmentType };
			seen.set(colKey(c), c);
		}

		for (const c of added) seen.set(colKey(c), c);

		return [...seen.values()].sort(
			(a, b) =>
				a.strand.localeCompare(b.strand) ||
				(a.subStrand ?? '').localeCompare(b.subStrand ?? '') ||
				a.assessmentType.localeCompare(b.assessmentType)
		);
	}, [book.grades, added]);

	const cells = useMemo(
		() =>
			new Map(
				book.grades
					.filter((g) => g.strand && g.assessmentType)
					.map((g) => [
						`${g.studentId}|${colKey({ strand: g.strand!, subStrand: g.subStrand, assessmentType: g.assessmentType! })}`,
						g
					])
			),
		[book.grades]
	);

	const save = async () => {
		const colByKey = new Map(columns.map((c) => [colKey(c), c]));

		await onSave(
			Object.entries(edits)
				.filter(([key, level]) => level || cells.has(key))
				.map(([key, level]) => {
					const [studentId, ...rest] = key.split('|');
					const c = colByKey.get(rest.join('|'))!;

					return { studentId: studentId!, ...c, competencyLevel: level || null };
				})
		);
	};

	return (
		<Paper
			variant="outlined"
			className="overflow-hidden rounded-2xl"
		>
			<div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
				<div className="flex flex-wrap gap-1">
					{LEVELS.map((l) => (
						<Chip
							key={l.value}
							size="small"
							color={l.color}
							variant="outlined"
							label={`${l.value} · ${l.label}`}
						/>
					))}
				</div>
				<Button
					startIcon={<FuseSvgIcon size={18}>lucide:plus</FuseSvgIcon>}
					onClick={() => setAdding(true)}
				>
					Add assessment
				</Button>
			</div>

			{columns.length === 0 ? (
				<Typography
					color="text.secondary"
					className="border-t px-4 py-10 text-center"
				>
					Add a strand / sub-strand assessment to start recording competency levels.
				</Typography>
			) : (
				<TableContainer className="border-t">
					<Table size="small">
						<TableHead>
							<TableRow>
								<TableCell className="min-w-48">Student</TableCell>
								{columns.map((c) => (
									<TableCell
										key={colKey(c)}
										align="center"
										className="min-w-36"
									>
										<Typography
											variant="body2"
											className="font-semibold"
										>
											{c.strand}
										</Typography>
										{c.subStrand && (
											<Typography
												variant="caption"
												className="block"
											>
												{c.subStrand}
											</Typography>
										)}
										<Typography
											variant="caption"
											color="text.secondary"
										>
											{c.assessmentType === 'SUMMATIVE' ? 'Summative' : 'Formative'}
										</Typography>
									</TableCell>
								))}
							</TableRow>
						</TableHead>
						<TableBody>
							{book.students.map((s) => (
								<TableRow
									key={s.id}
									hover
								>
									<TableCell>
										<Typography className="font-medium">{s.name}</Typography>
										<Typography
											variant="caption"
											color="text.secondary"
										>
											{s.admissionNumber}
										</Typography>
									</TableCell>
									{columns.map((c) => {
										const key = `${s.id}|${colKey(c)}`;
										const g = cells.get(key);

										if (!editable(g)) {
											return (
												<TableCell
													key={key}
													align="center"
												>
													<div className="flex items-center justify-center gap-1">
														<Tooltip
															title={
																g!.pending
																	? 'Waiting for admin approval'
																	: book.canEditDirectly
																		? 'Edit'
																		: 'Request change'
															}
														>
															<span>
																<Chip
																	size="small"
																	color={
																		levelInfo(g!.competencyLevel)?.color ??
																		'default'
																	}
																	variant={
																		g!.status === 'PENDING_APPROVAL'
																			? 'outlined'
																			: 'filled'
																	}
																	label={g!.value || '—'}
																	onClick={
																		g!.status === 'PUBLISHED'
																			? () => onOpenGrade(g!, s.name)
																			: undefined
																	}
																/>
															</span>
														</Tooltip>
														<StatusCell
															grade={g}
															onHistory={onHistory}
														/>
													</div>
												</TableCell>
											);
										}

										const value = key in edits ? edits[key] : (g?.competencyLevel ?? '');

										return (
											<TableCell
												key={key}
												align="center"
											>
												<div className="flex items-center justify-center gap-1">
													<TextField
														select
														value={value}
														onChange={(e) =>
															setEdits((p) => ({
																...p,
																[key]: e.target.value as CompetencyLevel | ''
															}))
														}
														size="small"
														className="w-20"
														slotProps={{
															htmlInput: { 'aria-label': `${c.strand} for ${s.name}` }
														}}
													>
														<MenuItem value="">—</MenuItem>
														{LEVELS.map((l) => (
															<MenuItem
																key={l.value}
																value={l.value}
															>
																{l.value}
															</MenuItem>
														))}
													</TextField>
													{g && (
														<Tooltip title="Draft — comment, delete or history">
															<IconButton
																size="small"
																onClick={() => onOpenGrade(g, s.name)}
															>
																<FuseSvgIcon size={16}>
																	lucide:message-square-text
																</FuseSvgIcon>
															</IconButton>
														</Tooltip>
													)}
												</div>
											</TableCell>
										);
									})}
								</TableRow>
							))}
						</TableBody>
					</Table>
				</TableContainer>
			)}

			<SaveBar
				dirty={Object.keys(edits).length}
				saving={saving}
				onSave={save}
				onDiscard={() => setEdits({})}
			/>
			<AddAssessmentDialog
				open={adding}
				onClose={() => setAdding(false)}
				onAdd={(c) => setAdded((p) => [...p, c])}
				strands={[...new Set(columns.map((c) => c.strand))]}
			/>
		</Paper>
	);
}
