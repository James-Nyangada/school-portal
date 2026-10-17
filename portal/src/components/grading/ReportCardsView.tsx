'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { Alert, Button, Chip, CircularProgress, Paper, Typography } from '@mui/material';
import FuseSvgIcon from '@fuse/core/FuseSvgIcon';
import { BACKEND_URL } from '@/lib/backend';

type ReportCard = {
	id: string;
	term: string;
	totalScore: number | null;
	rank: number | null;
	adminRemark: string | null;
	updatedAt: string;
	subjectGrades: { id: string; gradeValue: string; teacherRemark: string | null; subject: { name: string } }[];
};

/**
 * A student's published report cards with PDF download (GET /api/grading/reports/:studentId). Fee-gated like
 * grades: when locked the server says exactly what is owed, and the page links to fees.
 */
export default function ReportCardsView({ studentId, feesHref }: { studentId: string; feesHref: string }) {
	const { data: session } = useSession();
	const token = session?.backendToken;
	const [cards, setCards] = useState<ReportCard[] | null>(null);
	const [locked, setLocked] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [downloading, setDownloading] = useState<string | null>(null);

	useEffect(() => {
		if (!token || !studentId) return;

		let active = true;
		setCards(null);
		setLocked(null);
		setError(null);
		fetch(`${BACKEND_URL}/api/grading/reports/${studentId}`, { headers: { Authorization: `Bearer ${token}` } })
			.then(async (res) => {
				const body = await res.json().catch(() => null);

				if (!active) return;

				if (res.status === 402)
					setLocked(body?.error ?? 'Report cards are locked until the required fees are paid.');
				else if (!res.ok) setError(body?.error ?? 'Could not load report cards');
				else setCards(Array.isArray(body) ? body : []);
			})
			.catch(() => active && setError('Could not load report cards'));
		return () => {
			active = false;
		};
	}, [token, studentId]);

	const download = async (card: ReportCard) => {
		setDownloading(card.id);
		try {
			const res = await fetch(`${BACKEND_URL}/api/grading/report-cards/${card.id}/pdf`, {
				headers: { Authorization: `Bearer ${token}` }
			});

			if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? 'Download failed');

			const url = URL.createObjectURL(await res.blob());
			const a = document.createElement('a');
			a.href = url;
			a.download = `report-card-${card.term.replace(/\s+/g, '-')}.pdf`;
			a.click();
			URL.revokeObjectURL(url);
		} catch (e) {
			setError((e as Error).message);
		} finally {
			setDownloading(null);
		}
	};

	if (locked) {
		return (
			<Paper className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed p-10 text-center shadow-none">
				<FuseSvgIcon
					size={40}
					className="text-gray-400"
				>
					lucide:lock
				</FuseSvgIcon>
				<Typography className="text-lg font-bold">Report cards locked</Typography>
				<Typography
					color="text.secondary"
					className="max-w-lg"
				>
					{locked}
				</Typography>
				<Button
					component={Link}
					href={feesHref}
					variant="contained"
					color="secondary"
				>
					Go to fees
				</Button>
			</Paper>
		);
	}

	if (error && !cards) return <Alert severity="error">{error}</Alert>;

	if (!cards) {
		return (
			<div className="flex justify-center py-12">
				<CircularProgress />
			</div>
		);
	}

	if (cards.length === 0) {
		return (
			<Paper className="flex flex-col items-center gap-2 rounded-2xl p-10 text-center shadow-sm">
				<FuseSvgIcon
					size={40}
					className="text-gray-400"
				>
					lucide:file-text
				</FuseSvgIcon>
				<Typography className="font-semibold">No report cards yet</Typography>
				<Typography color="text.secondary">Report cards appear here once the school publishes them.</Typography>
			</Paper>
		);
	}

	return (
		<div className="flex flex-col gap-4">
			{error && <Alert severity="error">{error}</Alert>}
			{cards.map((card) => (
				<Paper
					key={card.id}
					className="flex flex-col gap-4 rounded-2xl p-5 shadow-sm"
				>
					<div className="flex flex-wrap items-center justify-between gap-3">
						<div>
							<Typography className="text-lg font-bold">{card.term}</Typography>
							<div className="mt-1 flex flex-wrap gap-2">
								{card.totalScore != null && (
									<Chip
										size="small"
										label={`Total ${Math.round(card.totalScore)}`}
									/>
								)}
								{card.rank != null && (
									<Chip
										size="small"
										color="secondary"
										label={`Position ${card.rank}`}
									/>
								)}
								<Chip
									size="small"
									variant="outlined"
									label={`${card.subjectGrades.length} subjects`}
								/>
							</div>
						</div>
						<Button
							variant="outlined"
							disabled={downloading === card.id}
							onClick={() => download(card)}
							startIcon={
								downloading === card.id ? (
									<CircularProgress size={16} />
								) : (
									<FuseSvgIcon size={16}>lucide:download</FuseSvgIcon>
								)
							}
						>
							Download PDF
						</Button>
					</div>
					<div className="divide-y divide-gray-100">
						{card.subjectGrades.map((g) => (
							<div
								key={g.id}
								className="flex flex-wrap justify-between gap-2 py-2 text-sm"
							>
								<span className="font-medium">{g.subject.name}</span>
								<span className="text-right">
									<strong>{g.gradeValue}</strong>
									{g.teacherRemark && <span className="block text-gray-500">{g.teacherRemark}</span>}
								</span>
							</div>
						))}
					</div>
					{card.adminRemark && (
						<Typography
							variant="body2"
							color="text.secondary"
						>
							<strong>Principal&apos;s remarks:</strong> {card.adminRemark}
						</Typography>
					)}
				</Paper>
			))}
		</div>
	);
}
