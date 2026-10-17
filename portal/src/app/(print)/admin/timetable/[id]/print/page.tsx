'use client';

import { ReactNode, useEffect, useState } from 'react';
import { Button, CircularProgress } from '@mui/material';
import AuthGuardRedirect from '@auth/AuthGuardRedirect';
import FuseSvgIcon from '@fuse/core/FuseSvgIcon';
import { errorMessage } from '@/components/timetable/api';
import { useTimetable } from '@/components/timetable/useTimetable';
import { breakAfter, GridCell, Lookups, TtDay, TtPeriod } from '@/components/timetable/types';

type View = 'class' | 'teacher' | 'room' | 'master';
type Master = {
	days: TtDay[];
	periods: TtPeriod[];
	classes: { id: string; name: string }[];
	cells: GridCell[];
};

/**
 * Print route: /admin/timetable/[id]/print?view=class|teacher|room|master&ids=all|<id>,<id>
 * One timetable per page (A4 landscape), laid out like aSc: the class/teacher/room name as the
 * title, the grid filling the page, and the date the timetable was created in the footer. The
 * master sheet prints on A3 landscape. Use the browser's "Save as PDF" for a PDF copy.
 */
export default function PrintPage() {
	const { id, timetable, api } = useTimetable();
	const [master, setMaster] = useState<Master | null>(null);
	const [lookups, setLookups] = useState<Lookups | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [params, setParams] = useState<{ view: View; ids: string }>({
		view: 'class',
		ids: 'all'
	});

	useEffect(() => {
		const q = new URLSearchParams(window.location.search);
		setParams({
			view: (q.get('view') as View) || 'class',
			ids: q.get('ids') || 'all'
		});
	}, []);

	useEffect(() => {
		if (!api.ready || !id) return;

		Promise.all([api.get<Master>(`/timetables/${id}/master`), api.get<Lookups>('/setup')])
			.then(([m, l]) => {
				setMaster(m);
				setLookups(l);
			})
			.catch((e) => setError(errorMessage(e)));
	}, [api, id]);

	// The browser uses the document title as the default PDF file name
	useEffect(() => {
		if (!master || !lookups || !timetable) return;

		const q = params.ids.split(',');
		const single =
			params.view !== 'master' && params.ids !== 'all' && q.length === 1
				? [...lookups.classes, ...lookups.teachers, ...lookups.rooms].find((e) => e.id === q[0])?.name
				: null;
		const previous = document.title;
		document.title = [
			single ?? (params.view === 'master' ? 'Master timetable' : 'Timetables'),
			timetable.name,
			timetable.term
		].join(' - ');

		return () => {
			document.title = previous;
		};
	}, [master, lookups, timetable, params]);

	if (error) return <div className="p-8 text-red-600">{error}</div>;

	if (!master || !lookups) {
		return (
			<div className="flex justify-center p-16">
				<CircularProgress />
			</div>
		);
	}

	const { view } = params;
	const entities =
		view === 'teacher'
			? lookups.teachers.map((t) => ({
					id: t.id,
					name: `${t.name} (${t.short})`
				}))
			: view === 'room'
				? lookups.rooms.map((r) => ({ id: r.id, name: r.name }))
				: lookups.classes.map((c) => ({ id: c.id, name: c.name }));
	const wanted = params.ids === 'all' ? entities : entities.filter((e) => params.ids.split(',').includes(e.id));

	const created = timetable ? new Date(timetable.createdAt).toLocaleDateString('en-GB') : '';
	const footer = (
		<div className="tt-footer">
			<span>Timetable generated: {created}</span>
			<span>
				{timetable?.name} · {timetable?.term}
			</span>
		</div>
	);
	const sheet = (title: ReactNode, body: ReactNode) => (
		<div className="tt-sheet">
			<h1 className="tt-title">{title}</h1>
			<div className="tt-body">{body}</div>
			{footer}
		</div>
	);

	const pageFor = (entityId: string) =>
		master.cells
			.map((c) => ({
				...c,
				lessons: c.lessons.filter((l) =>
					view === 'teacher'
						? l.teacherIds.includes(entityId)
						: view === 'room'
							? l.roomId === entityId
							: l.classIds.includes(entityId)
				)
			}))
			.filter((c) => c.lessons.length > 0);

	return (
		<AuthGuardRedirect auth={['SUPER_ADMIN', 'ADMIN']}>
			<style>{`
				/* margin: 0 also stops the browser printing its own date, title and URL on the page */
				@page { size: ${view === 'master' ? 'A3' : 'A4'} landscape; margin: 0; }
				.tt-sheet {
					width: ${view === 'master' ? '420mm' : '297mm'}; height: ${view === 'master' ? '297mm' : '210mm'};
					padding: 12mm 12mm 8mm; box-sizing: border-box; background: #fff; color: #000;
					display: flex; flex-direction: column; margin: 0 auto 24px; box-shadow: 0 1px 6px rgba(0,0,0,.2);
					font-family: Arial, Helvetica, sans-serif; overflow: hidden;
				}
				.tt-title { text-align: center; font-size: 26pt; font-weight: 700; margin: 0 0 6mm; letter-spacing: .5px; }
				.tt-body { flex: 1; min-height: 0; display: flex; }
				.tt-footer { display: flex; justify-content: space-between; font-size: 9pt; margin-top: 4mm; color: #333; }
				.tt-table { border-collapse: collapse; width: 100%; height: 100%; table-layout: fixed; }
				.tt-table th, .tt-table td { border: 1px solid #000; padding: 3px; text-align: center; vertical-align: middle; }
				.tt-table thead th { background: #f1f5f9; }
				.tt-table td.brk { background: #e2e8f0; width: 6px; padding: 0; }
				@media print {
					html, body { background: #fff !important; margin: 0 !important; }
					.no-print { display: none !important; }
					/* dev-only floating widgets (query devtools) */
					[class*='tsqd'] { display: none !important; }
					.tt-sheet { margin: 0; box-shadow: none; break-after: page; page-break-after: always; }
					.tt-sheet:last-child { break-after: auto; page-break-after: auto; }
					* { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
				}
			`}</style>
			<div className="min-h-screen bg-gray-200 py-6 text-black print:bg-white print:py-0">
				<div className="no-print mx-auto mb-6 flex items-center gap-3 px-6">
					<Button
						variant="contained"
						color="secondary"
						onClick={() => window.print()}
						startIcon={<FuseSvgIcon size={16}>lucide:printer</FuseSvgIcon>}
					>
						Print / Save as PDF
					</Button>
					<span className="text-sm text-gray-500">
						{view === 'master'
							? 'Master sheet (A3 landscape)'
							: `${wanted.length} timetable(s), one per A4 page`}
					</span>
				</div>

				{view === 'master'
					? sheet(
							'Master timetable',
							<table
								className="tt-table"
								style={{ fontSize: '7pt' }}
							>
								<thead>
									<tr>
										<th style={{ width: 50 }} />
										{master.days.map((d) => (
											<th
												key={d.index}
												colSpan={master.periods.length}
											>
												{d.name}
											</th>
										))}
									</tr>
									<tr>
										<th />
										{master.days.map((d) =>
											master.periods.map((p) => (
												<th
													key={`${d.index}-${p.index}`}
													style={{ fontWeight: 500 }}
												>
													{p.name}
												</th>
											))
										)}
									</tr>
								</thead>
								<tbody>
									{master.classes.map((cls) => {
										const mine = pageFor(cls.id);

										return (
											<tr key={cls.id}>
												<th>{cls.name}</th>
												{master.days.map((d) =>
													master.periods.map((p) => {
														const c = mine.find(
															(x) =>
																x.dayIndex === d.index &&
																x.periodIndex <= p.index &&
																p.index < x.periodIndex + x.length
														);
														const l = c?.lessons[0];

														return (
															<td
																key={`${d.index}-${p.index}`}
																style={{
																	background: l ? `${l.color}33` : undefined
																}}
															>
																{c ? c.lessons.map((x) => x.subject).join('/') : ''}
															</td>
														);
													})
												)}
											</tr>
										);
									})}
								</tbody>
							</table>
						)
					: wanted.map((e) => {
							const mine = pageFor(e.id);

							return (
								<div key={e.id}>
									{sheet(
										e.name,
										<table
											className="tt-table"
											style={{ fontSize: '10pt' }}
										>
											<thead>
												<tr>
													<th style={{ width: 100 }} />
													{master.periods.map((p, i) => [
														<th key={p.index}>
															<div>{p.name}</div>
															<div style={{ fontWeight: 400, fontSize: '7pt' }}>
																{p.startTime}–{p.endTime}
															</div>
														</th>,
														breakAfter(master.periods, i) ? (
															<td
																key={`b${p.index}`}
																className="brk"
															/>
														) : null
													])}
												</tr>
											</thead>
											<tbody>
												{master.days.map((d) => {
													let skip = 0;

													return (
														<tr key={d.index}>
															<th>{d.name}</th>
															{master.periods.map((p, i) => {
																const brk = breakAfter(master.periods, i) ? (
																	<td
																		key={`b${p.index}`}
																		className="brk"
																	/>
																) : null;

																if (skip > 0) {
																	skip--;

																	return brk;
																}

																const c = mine.find(
																	(x) =>
																		x.dayIndex === d.index &&
																		x.periodIndex === p.index
																);

																if (c && c.length > 1) skip = c.length - 1;

																return [
																	<td
																		key={p.index}
																		colSpan={c?.length ?? 1}
																		style={{
																			background: c
																				? `${c.lessons[0]!.color}29`
																				: undefined
																		}}
																	>
																		{c?.lessons.map((l, k) => (
																			<div key={k}>
																				<div style={{ fontWeight: 700 }}>
																					{l.subject}
																				</div>
																				<div style={{ fontSize: '7.5pt' }}>
																					{view === 'teacher'
																						? [l.classes.join(','), l.room]
																								.filter(Boolean)
																								.join(' · ')
																						: view === 'room'
																							? `${l.classes.join(',')} · ${l.teachers.join(',')}`
																							: [
																									l.teachers.join(
																										','
																									),
																									l.room
																								]
																									.filter(Boolean)
																									.join(' · ')}
																				</div>
																			</div>
																		))}
																	</td>,
																	brk
																];
															})}
														</tr>
													);
												})}
											</tbody>
										</table>
									)}
								</div>
							);
						})}
			</div>
		</AuthGuardRedirect>
	);
}
