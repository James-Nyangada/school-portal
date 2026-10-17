'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
	Alert,
	Button,
	CircularProgress,
	Dialog,
	DialogActions,
	DialogContent,
	DialogTitle,
	FormControlLabel,
	IconButton,
	ListItemIcon,
	Menu,
	MenuItem,
	Paper,
	Switch,
	TextField,
	ToggleButton,
	ToggleButtonGroup,
	Tooltip,
	Typography
} from '@mui/material';
import FusePageSimple from '@fuse/core/FusePageSimple';
import FuseSvgIcon from '@fuse/core/FuseSvgIcon';
import AuthGuardRedirect from '@auth/AuthGuardRedirect';
import { useSnackbar } from 'notistack';
import useToast from '@/hooks/useToast';
import { ApiError, errorMessage } from '@/components/timetable/api';
import TimetableHeader from '@/components/timetable/TimetableHeader';
import TimetableGrid, { CellStatus } from '@/components/timetable/TimetableGrid';
import { useTimetable } from '@/components/timetable/useTimetable';
import type { CellLesson, GridCell, GridView, Lookups, TtDay, TtPeriod } from '@/components/timetable/types';
import {
	buildModel,
	canPlace,
	clone,
	commit,
	createState,
	explain,
	neededRoomType,
	softDelta,
	undo,
	type Card,
	type Model,
	type ModelInput,
	type Placement,
	type State
} from '@/lib/timetable-core';

type ModelResponse = {
	timetable: { id: string; status: string };
	readOnly: boolean;
	jobId: string | null;
	days: TtDay[];
	periods: TtPeriod[];
	lookups: Lookups;
	input: ModelInput;
	cards: { id: string; label: string; color: string }[];
	dropped: string[];
};

type Action =
	| { kind: 'move'; cardKey: string; from: number | null; to: number }
	| { kind: 'unplace'; cardKey: string; from: number }
	| { kind: 'swap'; a: string; b: string }
	| { kind: 'lock'; cardKey: string; locked: boolean };

const HISTORY_LIMIT = 20;

export default function EditorPage() {
	const { confirm } = useToast();
	const { id, timetable, api } = useTimetable();
	const { enqueueSnackbar } = useSnackbar();
	const [data, setData] = useState<ModelResponse | null>(null);
	const [loadError, setLoadError] = useState<string | null>(null);
	const modelRef = useRef<Model | null>(null);
	const stateRef = useRef<State | null>(null);
	const [version, setVersion] = useState(0);
	const bump = () => setVersion((v) => v + 1);

	const [view, setView] = useState<GridView>('class');
	const [entityId, setEntityId] = useState('');
	const [trayAll, setTrayAll] = useState(false);
	const [statuses, setStatuses] = useState<Map<string, CellStatus> | null>(null);
	const [dragKey, setDragKey] = useState<string | null>(null);
	const [selected, setSelected] = useState<string | null>(null);
	const [menu, setMenu] = useState<{ x: number; y: number; cardKey: string } | null>(null);
	const [swapPrompt, setSwapPrompt] = useState<{ a: string; b: string } | null>(null);
	const [roomCard, setRoomCard] = useState<string | null>(null);
	const [pending, setPending] = useState(0);
	const history = useRef<Action[]>([]);
	const queue = useRef<Promise<unknown>>(Promise.resolve());

	const load = useCallback(async () => {
		if (!api.ready || !id) return;

		try {
			const res = await api.get<ModelResponse>(`/timetables/${id}/model`);
			const model = buildModel(res.input);
			modelRef.current = model;
			stateRef.current = createState(model);
			setData(res);
			setLoadError(null);
			setEntityId((cur) => cur || res.lookups.classes[0]?.id || '');
			bump();

			// ?card=… (from "Show in editor"): select it and switch to its first class.
			const wanted = new URLSearchParams(window.location.search).get('card');
			const card = wanted ? model.cards.find((c) => c.id === wanted) : null;

			if (card) {
				setSelected(card.id);
				setView('class');
				setEntityId(card.classIds[0] ?? '');
			}
		} catch (e) {
			setLoadError(errorMessage(e));
		}
	}, [api, id]);

	useEffect(() => {
		load();
	}, [load]);

	const model = modelRef.current;
	const state = stateRef.current;
	const readOnly = Boolean(data?.readOnly);

	// ── Slot ↔ stored day/period ─────────────────────────────
	const ppd = data?.periods.length ?? 0;
	const slotOf = useCallback(
		(dayIndex: number, periodIndex: number) => {
			const d = data?.days.findIndex((x) => x.index === dayIndex) ?? -1;
			const p = data?.periods.findIndex((x) => x.index === periodIndex) ?? -1;

			return d < 0 || p < 0 ? -1 : d * ppd + p;
		},
		[data, ppd]
	);
	const dbOf = useCallback(
		(slot: number) => ({
			dayIndex: data!.days[Math.floor(slot / ppd)]!.index,
			periodIndex: data!.periods[slot % ppd]!.index
		}),
		[data, ppd]
	);

	// ── Lookups for display ──────────────────────────────────
	const look = useMemo(() => {
		const l = data?.lookups;

		return {
			subject: new Map(l?.subjects.map((s) => [s.id, s]) ?? []),
			teacher: new Map(l?.teachers.map((t) => [t.id, t]) ?? []),
			cls: new Map(l?.classes.map((c) => [c.id, c]) ?? []),
			room: new Map(l?.rooms.map((r) => [r.id, r]) ?? []),
			lesson: new Map(data?.input.lessons.map((x) => [x.id, x]) ?? [])
		};
	}, [data]);

	const cellLessons = useCallback(
		(card: Card, roomIds: (string | null)[]): CellLesson[] =>
			card.roomNeeds.map((need, i) => {
				const l = look.lesson.get(need.lessonId)!;
				const s = look.subject.get(l.subjectId);
				const roomId = roomIds[i] ?? null;

				return {
					lessonId: l.id,
					subjectId: l.subjectId,
					subject: s?.short ?? '?',
					subjectName: s?.name ?? '',
					color: s?.color ?? '#94a3b8',
					teacherIds: l.teacherIds,
					teachers: l.teacherIds.map((t) => look.teacher.get(t)?.short ?? '?'),
					classIds: l.classIds,
					classes: l.classIds.map((c) => look.cls.get(c)?.name ?? '?'),
					roomId,
					room: roomId ? (look.room.get(roomId)?.short ?? null) : null
				};
			}),
		[look]
	);

	const involves = useCallback(
		(card: Card, roomIds: (string | null)[] = []) =>
			view === 'class'
				? card.classIds.includes(entityId)
				: view === 'teacher'
					? card.teacherIds.includes(entityId)
					: roomIds.includes(entityId),
		[view, entityId]
	);

	const cells: GridCell[] = useMemo(() => {
		if (!state || !data) return [];

		return [...state.placements.values()]
			.map((p) => ({ p, card: state.cardById.get(p.cardId)! }))
			.filter(({ p, card }) => involves(card, p.roomIds))
			.map(({ p, card }) => {
				const lessons = cellLessons(card, p.roomIds).filter((l) =>
					view === 'class'
						? l.classIds.includes(entityId)
						: view === 'teacher'
							? l.teacherIds.includes(entityId)
							: l.roomId === entityId
				);

				return {
					entryId: card.id,
					cardKey: card.id,
					...dbOf(p.slot),
					length: card.length,
					locked: p.locked,
					lessons
				};
			});
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [state, data, version, involves, cellLessons, dbOf, view, entityId]);

	const unplaced = useMemo(() => {
		if (!state || !model) return [];

		return model.cards.filter((c) => !state.placements.has(c.id) && (trayAll || involves(c)));
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [state, model, version, trayAll, involves]);

	const totals = state && model ? { placed: state.placements.size, total: model.cards.length } : null;

	// ── Server sync (serialised, optimistic) ─────────────────
	const send = useCallback(
		<T,>(fn: () => Promise<T>, revert: () => void, ok?: (r: T) => void) => {
			setPending((n) => n + 1);
			queue.current = queue.current
				.then(fn)
				.then((r) => ok?.(r as T))
				.catch((e) => {
					revert();
					bump();
					const reasons = e instanceof ApiError ? e.reasons : [];
					enqueueSnackbar(
						reasons.length ? `Not saved: ${reasons.join('; ')}` : `Not saved: ${errorMessage(e)}`,
						{ variant: 'error' }
					);
				})
				.finally(() => setPending((n) => n - 1));
		},
		[enqueueSnackbar]
	);

	const remember = (a: Action) => {
		history.current = [...history.current.slice(-(HISTORY_LIMIT - 1)), a];
	};

	/** Place an unplaced card or move a placed one to `slot`. */
	const moveCard = useCallback(
		(cardKey: string, slot: number, record = true) => {
			if (!model || !state) return false;

			const card = state.cardById.get(cardKey)!;
			const before = state.placements.get(cardKey);

			if (before?.locked) {
				enqueueSnackbar('This lesson is locked. Unlock it first (right-click → Unlock, or press L).', {
					variant: 'warning'
				});

				return false;
			}

			if (before) undo(state, cardKey);

			const check = canPlace(model, state, card, slot, before ? { preferredRooms: before.roomIds } : {});

			if (!check.ok) {
				if (before) commit(state, before);

				enqueueSnackbar(explain(check), { variant: 'error' });

				return false;
			}

			const after: Placement = { cardId: cardKey, slot, roomIds: check.roomIds, locked: false };
			commit(state, after);
			bump();

			if (record) remember({ kind: 'move', cardKey, from: before?.slot ?? null, to: slot });

			send(
				() =>
					api.post<{ entry: { roomIds: (string | null)[] } }>(`/timetables/${id}/entries/place`, {
						cardKey,
						...dbOf(slot)
					}),
				() => {
					undo(state, cardKey);

					if (before) commit(state, before);
				},
				(r) => {
					// The server may pick a different free room — mirror it.
					const cur = state.placements.get(cardKey);

					if (cur && JSON.stringify(cur.roomIds) !== JSON.stringify(r.entry.roomIds)) {
						undo(state, cardKey);
						commit(state, { ...cur, roomIds: r.entry.roomIds });
						bump();
					}
				}
			);

			return true;
		},
		[model, state, api, id, dbOf, send, enqueueSnackbar]
	);

	const unplaceCard = useCallback(
		(cardKey: string, record = true) => {
			if (!state) return;

			const before = state.placements.get(cardKey);

			if (!before) return;

			if (before.locked) {
				enqueueSnackbar('Unlock this lesson before removing it from the grid.', { variant: 'warning' });

				return;
			}

			undo(state, cardKey);
			bump();

			if (record) remember({ kind: 'unplace', cardKey, from: before.slot });

			send(
				() => api.post(`/timetables/${id}/entries/unplace`, { cardKey }),
				() => commit(state, before)
			);
		},
		[state, api, id, send, enqueueSnackbar]
	);

	/** Check a swap both ways locally. Returns reasons if it's not possible. */
	const swapProblem = useCallback(
		(a: string, b: string): string | null => {
			if (!model || !state) return 'Not ready';

			const pa = state.placements.get(a);
			const pb = state.placements.get(b);

			if (!pa || !pb) return 'Both lessons must be on the grid';

			if (pa.locked || pb.locked) return 'Unlock both lessons first';

			const s2 = clone(state);
			undo(s2, a);
			undo(s2, b);
			const ca = canPlace(model, s2, s2.cardById.get(a)!, pb.slot, { preferredRooms: pa.roomIds });

			if (!ca.ok) return explain(ca);

			commit(s2, { cardId: a, slot: pb.slot, roomIds: ca.roomIds, locked: false });
			const cb = canPlace(model, s2, s2.cardById.get(b)!, pa.slot, { preferredRooms: pb.roomIds });

			return cb.ok ? null : explain(cb);
		},
		[model, state]
	);

	const swapCards = useCallback(
		(a: string, b: string, record = true) => {
			if (!model || !state) return;

			const problem = swapProblem(a, b);

			if (problem) {
				enqueueSnackbar(`Can't swap: ${problem}`, { variant: 'error' });

				return;
			}

			const pa = state.placements.get(a)!;
			const pb = state.placements.get(b)!;
			undo(state, a);
			undo(state, b);
			const ca = canPlace(model, state, state.cardById.get(a)!, pb.slot, { preferredRooms: pa.roomIds });
			commit(state, { cardId: a, slot: pb.slot, roomIds: ca.roomIds, locked: false });
			const cb = canPlace(model, state, state.cardById.get(b)!, pa.slot, { preferredRooms: pb.roomIds });
			commit(state, { cardId: b, slot: pa.slot, roomIds: cb.roomIds, locked: false });
			bump();

			if (record) remember({ kind: 'swap', a, b });

			send(
				() => api.post(`/timetables/${id}/entries/swap`, { cardA: a, cardB: b }),
				() => {
					undo(state, a);
					undo(state, b);
					commit(state, pa);
					commit(state, pb);
				}
			);
		},
		[model, state, api, id, send, swapProblem, enqueueSnackbar]
	);

	const lockCard = useCallback(
		(cardKey: string, locked: boolean, record = true) => {
			if (!state) return;

			const p = state.placements.get(cardKey);

			if (!p) return;

			state.placements.set(cardKey, { ...p, locked });
			bump();

			if (record) remember({ kind: 'lock', cardKey, locked });

			send(
				() => api.post(`/timetables/${id}/entries/lock`, { cardKey, locked }),
				() => state.placements.set(cardKey, p)
			);
		},
		[state, api, id, send]
	);

	const undoLast = useCallback(() => {
		const a = history.current.pop();

		if (!a) {
			enqueueSnackbar('Nothing to undo', { variant: 'info' });

			return;
		}

		if (a.kind === 'move') {
			if (a.from === null) unplaceCard(a.cardKey, false);
			else moveCard(a.cardKey, a.from, false);
		} else if (a.kind === 'unplace') moveCard(a.cardKey, a.from, false);
		else if (a.kind === 'swap') swapCards(a.a, a.b, false);
		else lockCard(a.cardKey, !a.locked, false);
	}, [moveCard, unplaceCard, swapCards, lockCard, enqueueSnackbar]);

	// ── Drag & drop ──────────────────────────────────────────
	const startDrag = (cardKey: string, e: React.DragEvent) => {
		if (readOnly || !model || !state) return;

		e.dataTransfer.setData('text/plain', cardKey);
		e.dataTransfer.effectAllowed = 'move';
		setDragKey(cardKey);
		setSelected(cardKey);

		// Tint every cell: green = fits, amber = fits but breaks a quality rule, red = clash.
		const card = state.cardById.get(cardKey)!;
		const before = state.placements.get(cardKey);
		const s2 = clone(state);

		if (before) undo(s2, cardKey);

		const map = new Map<string, CellStatus>();

		for (let slot = 0; slot < s2.nSlots; slot++) {
			const check = canPlace(model, s2, card, slot, before ? { preferredRooms: before.roomIds } : {});
			const key = `${dbOf(slot).dayIndex}:${dbOf(slot).periodIndex}`;

			if (check.ok) {
				const penalty = softDelta(model, s2, card, slot);
				map.set(key, {
					status: penalty >= 10 ? 'soft' : 'ok',
					reasons: penalty >= 10 ? ['Allowed, but this class already has this subject that day'] : []
				});
			} else {
				const others = new Set(check.reasons.map((r) => r.otherCardId));
				const swapWith =
					check.reasons.every((r) => r.otherCardId) && others.size === 1 ? [...others][0]! : null;
				map.set(key, {
					status: 'blocked',
					reasons: [...new Set(check.reasons.map((r) => r.message))],
					swapWith
				});
			}
		}

		setStatuses(map);
	};

	const endDrag = () => {
		setDragKey(null);
		setStatuses(null);
	};

	const dropOnCell = (dayIndex: number, periodIndex: number, e: React.DragEvent) => {
		e.preventDefault();
		const cardKey = e.dataTransfer.getData('text/plain') || dragKey;
		const st = statuses?.get(`${dayIndex}:${periodIndex}`);
		endDrag();

		if (!cardKey || !st) return;

		const slot = slotOf(dayIndex, periodIndex);

		if (st.status !== 'blocked') {
			if (state?.placements.get(cardKey)?.slot !== slot) moveCard(cardKey, slot);

			return;
		}

		if (st.swapWith && state?.placements.has(cardKey)) {
			const problem = swapProblem(cardKey, st.swapWith);

			if (!problem) {
				setSwapPrompt({ a: cardKey, b: st.swapWith });

				return;
			}
		}

		enqueueSnackbar(st.reasons.join(' · ') || 'Cannot place here', { variant: 'error' });
	};

	// ── Keyboard: L lock · Delete unplace · Ctrl+Z undo ──────
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			const tag = (e.target as HTMLElement)?.tagName;

			if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || readOnly) return;

			if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
				e.preventDefault();
				undoLast();

				return;
			}

			if (!selected || !state?.placements.has(selected)) return;

			if (e.key.toLowerCase() === 'l') lockCard(selected, !state.placements.get(selected)!.locked);

			if (e.key === 'Delete' || e.key === 'Backspace') unplaceCard(selected);
		};
		window.addEventListener('keydown', onKey);

		return () => window.removeEventListener('keydown', onKey);
	}, [selected, state, readOnly, undoLast, lockCard, unplaceCard]);

	const bulk = async (path: string, body: object, msg: string) => {
		try {
			await queue.current;
			await api.post(`/timetables/${id}/entries/${path}`, body);
			enqueueSnackbar(msg, { variant: 'success' });
			history.current = [];
			load();
		} catch (e) {
			enqueueSnackbar(errorMessage(e), { variant: 'error' });
		}
	};

	const entities =
		view === 'class'
			? (data?.lookups.classes ?? [])
			: view === 'teacher'
				? (data?.lookups.teachers ?? [])
				: (data?.lookups.rooms ?? []);
	const menuCard = menu ? state?.placements.get(menu.cardKey) : null;

	return (
		<AuthGuardRedirect auth={['SUPER_ADMIN', 'ADMIN']}>
			<FusePageSimple
				header={
					<TimetableHeader
						timetable={timetable}
						actions={
							<>
								{pending > 0 && (
									<span className="flex items-center gap-2 text-sm text-gray-500">
										<CircularProgress size={14} /> Saving…
									</span>
								)}
								<Tooltip title="Undo (Ctrl+Z)">
									<span>
										<IconButton
											onClick={undoLast}
											disabled={readOnly}
										>
											<FuseSvgIcon size={18}>lucide:undo-2</FuseSvgIcon>
										</IconButton>
									</span>
								</Tooltip>
								<Button
									size="small"
									color="inherit"
									variant="outlined"
									className="rounded-full"
									disabled={readOnly}
									onClick={() => bulk('lock-all', { locked: true }, 'All placed lessons locked')}
								>
									Lock all
								</Button>
								<Button
									size="small"
									color="inherit"
									variant="outlined"
									className="rounded-full"
									disabled={readOnly}
									onClick={() => bulk('lock-all', { locked: false }, 'All lessons unlocked')}
								>
									Unlock all
								</Button>
								<Button
									size="small"
									color="error"
									variant="outlined"
									className="rounded-full"
									disabled={readOnly}
									onClick={async () => {
										const confirmed = await confirm('Remove every unlocked lesson from the grid?', {
											confirmText: 'Clear',
											destructive: true
										});

										if (confirmed) bulk('clear', {}, 'Unlocked lessons cleared');
									}}
								>
									Clear unlocked
								</Button>
							</>
						}
					/>
				}
				content={
					<div className="flex w-full flex-col gap-4 p-6">
						{loadError && <Alert severity="error">{loadError}</Alert>}
						{!data || !state || !model ? (
							!loadError && (
								<div className="flex justify-center py-16">
									<CircularProgress />
								</div>
							)
						) : (
							<>
								{readOnly && (
									<Alert severity="info">
										{data.jobId
											? 'A generation job is running — the editor is read-only until it finishes.'
											: 'This timetable is archived and read-only.'}
									</Alert>
								)}
								{data.dropped.length > 0 && (
									<Alert severity="warning">
										{data.dropped.length} saved placement(s) now clash with the current setup and
										are shown as unplaced. Place them again or regenerate.
									</Alert>
								)}
								{data.days.length === 0 || data.periods.length === 0 ? (
									<Alert severity="warning">
										Set up days and periods first in{' '}
										<Link
											href="/admin/timetable/setup"
											className="font-semibold"
										>
											School setup
										</Link>
										.
									</Alert>
								) : (
									<div className="flex flex-col gap-4 xl:flex-row">
										<Paper
											variant="outlined"
											className="flex min-w-0 flex-1 flex-col gap-4 rounded-2xl p-4"
										>
											<div className="flex flex-wrap items-center gap-3">
												<ToggleButtonGroup
													size="small"
													exclusive
													value={view}
													onChange={(_, v: GridView | null) => {
														if (!v) return;

														setView(v);
														setEntityId(
															(v === 'class'
																? data.lookups.classes
																: v === 'teacher'
																	? data.lookups.teachers
																	: data.lookups.rooms)[0]?.id ?? ''
														);
													}}
												>
													<ToggleButton value="class">Class</ToggleButton>
													<ToggleButton value="teacher">Teacher</ToggleButton>
													<ToggleButton value="room">Room</ToggleButton>
												</ToggleButtonGroup>
												<TextField
													select
													size="small"
													value={entityId}
													onChange={(e) => setEntityId(e.target.value)}
													className="min-w-52"
												>
													{entities.map((x) => (
														<MenuItem
															key={x.id}
															value={x.id}
														>
															{x.name}
														</MenuItem>
													))}
												</TextField>
												<div className="flex-1" />
												{totals && (
													<Typography
														variant="body2"
														color="text.secondary"
													>
														{totals.placed}/{totals.total} cards placed
													</Typography>
												)}
											</div>
											<TimetableGrid
												days={data.days}
												periods={data.periods}
												cells={cells}
												view={view}
												editable={!readOnly}
												statuses={statuses}
												draggingKey={dragKey}
												selectedKey={selected}
												onCardDragStart={(c, e) => startDrag(c.cardKey, e)}
												onCardDragEnd={endDrag}
												onDropCell={dropOnCell}
												onCardClick={(c) => setSelected(c.cardKey)}
												onCardContextMenu={(c, e) => {
													e.preventDefault();
													setSelected(c.cardKey);
													setMenu({ x: e.clientX, y: e.clientY, cardKey: c.cardKey });
												}}
											/>
											<Typography
												variant="caption"
												color="text.secondary"
											>
												Drag a lesson to move it: green fits, amber fits but repeats a subject
												that day, red clashes (hover for why). Drop on a red lesson to swap if
												both fit. Right-click for more. Keys: L lock · Delete remove · Ctrl+Z
												undo.
											</Typography>
										</Paper>

										<Paper
											variant="outlined"
											className="flex w-full shrink-0 flex-col gap-3 rounded-2xl p-4 xl:w-80"
											onDragOver={(e) => e.preventDefault()}
											onDrop={(e) => {
												e.preventDefault();
												const key = e.dataTransfer.getData('text/plain');
												endDrag();

												if (key && state.placements.has(key)) unplaceCard(key);
											}}
										>
											<div className="flex items-center justify-between">
												<Typography className="font-semibold">
													Unplaced ({unplaced.length})
												</Typography>
												<FormControlLabel
													control={
														<Switch
															size="small"
															checked={trayAll}
															onChange={(e) => setTrayAll(e.target.checked)}
														/>
													}
													label={<span className="text-xs">All</span>}
												/>
											</div>
											<Typography
												variant="caption"
												color="text.secondary"
											>
												Drag onto the grid to place. Drop a lesson here to take it off the grid.
											</Typography>
											<div className="flex max-h-[60vh] flex-col gap-2 overflow-y-auto">
												{unplaced.length === 0 && (
													<Typography
														variant="body2"
														color="text.secondary"
														className="py-6 text-center"
													>
														{trayAll
															? 'Everything is placed 🎉'
															: 'Nothing unplaced for this selection.'}
													</Typography>
												)}
												{unplaced.map((card) => {
													const lessons = cellLessons(card, []);
													const color = lessons[0]?.color ?? '#94a3b8';

													return (
														<div
															key={card.id}
															draggable={!readOnly}
															onDragStart={(e) => startDrag(card.id, e)}
															onDragEnd={endDrag}
															onClick={() => setSelected(card.id)}
															className={`cursor-grab rounded-lg border-l-4 px-3 py-2 text-sm active:cursor-grabbing ${selected === card.id ? 'ring-2 ring-blue-500' : ''}`}
															style={{
																borderLeftColor: color,
																backgroundColor: `${color}1a`
															}}
														>
															<div className="flex items-center justify-between font-semibold">
																<span className="truncate">
																	{lessons.map((l) => l.subject).join(' / ')}
																</span>
																{card.length === 2 && (
																	<span className="rounded bg-gray-200 px-1 text-[10px] dark:bg-white/10">
																		double
																	</span>
																)}
															</div>
															<div className="truncate text-xs opacity-75">
																{[...new Set(lessons.flatMap((l) => l.classes))].join(
																	', '
																)}{' '}
																·{' '}
																{[...new Set(lessons.flatMap((l) => l.teachers))].join(
																	', '
																)}
															</div>
														</div>
													);
												})}
											</div>
										</Paper>
									</div>
								)}
							</>
						)}

						<Menu
							open={Boolean(menu)}
							onClose={() => setMenu(null)}
							anchorReference="anchorPosition"
							anchorPosition={menu ? { top: menu.y, left: menu.x } : undefined}
						>
							<MenuItem
								disabled={readOnly}
								onClick={() => {
									if (menu && menuCard) lockCard(menu.cardKey, !menuCard.locked);

									setMenu(null);
								}}
							>
								<ListItemIcon>
									<FuseSvgIcon size={16}>
										{menuCard?.locked ? 'lucide:lock-open' : 'lucide:lock'}
									</FuseSvgIcon>
								</ListItemIcon>
								{menuCard?.locked ? 'Unlock' : 'Lock'}
							</MenuItem>
							<MenuItem
								disabled={readOnly || menuCard?.locked}
								onClick={() => {
									if (menu) unplaceCard(menu.cardKey);

									setMenu(null);
								}}
							>
								<ListItemIcon>
									<FuseSvgIcon size={16}>lucide:undo-dot</FuseSvgIcon>
								</ListItemIcon>
								Unplace
							</MenuItem>
							<MenuItem
								disabled={
									readOnly ||
									!menu ||
									!state?.cardById
										.get(menu.cardKey)
										?.roomNeeds.some((n) => neededRoomType(model!, n.roomType))
								}
								onClick={() => {
									if (menu) setRoomCard(menu.cardKey);

									setMenu(null);
								}}
							>
								<ListItemIcon>
									<FuseSvgIcon size={16}>lucide:door-open</FuseSvgIcon>
								</ListItemIcon>
								Change room
							</MenuItem>
							<MenuItem
								onClick={() => {
									const t = menu ? state?.cardById.get(menu.cardKey)?.teacherIds[0] : null;

									if (t) {
										setView('teacher');
										setEntityId(t);
									}

									setMenu(null);
								}}
							>
								<ListItemIcon>
									<FuseSvgIcon size={16}>lucide:user</FuseSvgIcon>
								</ListItemIcon>
								Open teacher view
							</MenuItem>
						</Menu>

						<Dialog
							open={Boolean(swapPrompt)}
							onClose={() => setSwapPrompt(null)}
						>
							<DialogTitle>Swap these lessons?</DialogTitle>
							<DialogContent>
								<Typography>
									Both lessons fit in each other’s place, so they can trade positions.
								</Typography>
							</DialogContent>
							<DialogActions>
								<Button onClick={() => setSwapPrompt(null)}>Cancel</Button>
								<Button
									variant="contained"
									color="secondary"
									onClick={() => {
										if (swapPrompt) swapCards(swapPrompt.a, swapPrompt.b);

										setSwapPrompt(null);
									}}
								>
									Swap
								</Button>
							</DialogActions>
						</Dialog>

						{roomCard && model && state && data && (
							<RoomDialog
								cardKey={roomCard}
								model={model}
								state={state}
								lookups={data.lookups}
								onClose={() => setRoomCard(null)}
								onSave={(roomIds) => {
									const p = state.placements.get(roomCard)!;
									undo(state, roomCard);
									commit(state, { ...p, roomIds });
									bump();
									send(
										() =>
											api.post(`/timetables/${id}/entries/room`, { cardKey: roomCard, roomIds }),
										() => {
											undo(state, roomCard);
											commit(state, p);
										}
									);
									setRoomCard(null);
								}}
							/>
						)}
					</div>
				}
			/>
		</AuthGuardRedirect>
	);
}

/** Pick a room for each lesson in the card, listing only rooms of the right type that are free. */
function RoomDialog({
	cardKey,
	model,
	state,
	lookups,
	onClose,
	onSave
}: {
	cardKey: string;
	model: Model;
	state: State;
	lookups: Lookups;
	onClose: () => void;
	onSave: (roomIds: (string | null)[]) => void;
}) {
	const card = state.cardById.get(cardKey)!;
	const placement = state.placements.get(cardKey)!;
	const [choice, setChoice] = useState(placement.roomIds);

	const freeRooms = (i: number) => {
		const type = neededRoomType(model, card.roomNeeds[i]!.roomType);

		if (!type) return [];

		const s2 = clone(state);
		undo(s2, cardKey);

		return model.rooms
			.filter((r) => r.type === type)
			.filter((r) => {
				const pref = [...choice];
				pref[i] = r.id;
				const check = canPlace(model, s2, card, placement.slot, { preferredRooms: pref });

				return check.ok && check.roomIds[i] === r.id;
			});
	};

	const subjectName = (i: number) => {
		const lessonId = card.roomNeeds[i]!.lessonId;
		const subjectId = model.lessons.find((l) => l.id === lessonId)?.subjectId;

		return lookups.subjects.find((s) => s.id === subjectId)?.name ?? 'Lesson';
	};

	return (
		<Dialog
			open
			onClose={onClose}
			maxWidth="xs"
			fullWidth
		>
			<DialogTitle>Change room</DialogTitle>
			<DialogContent className="flex flex-col gap-4 pt-2!">
				{card.roomNeeds.map((need, i) => {
					const options = freeRooms(i);

					if (!neededRoomType(model, need.roomType)) return null;

					return (
						<TextField
							key={need.lessonId}
							select
							label={subjectName(i)}
							value={choice[i] ?? ''}
							onChange={(e) => setChoice(choice.map((c, k) => (k === i ? e.target.value : c)))}
							helperText={
								options.length === 0
									? 'No other free room of this type at this time'
									: `${options.length} free`
							}
						>
							{options.map((r) => (
								<MenuItem
									key={r.id}
									value={r.id}
								>
									{lookups.rooms.find((x) => x.id === r.id)?.name ?? r.id}
								</MenuItem>
							))}
						</TextField>
					);
				})}
			</DialogContent>
			<DialogActions>
				<Button onClick={onClose}>Cancel</Button>
				<Button
					variant="contained"
					color="secondary"
					onClick={() => onSave(choice)}
				>
					Save
				</Button>
			</DialogActions>
		</Dialog>
	);
}
