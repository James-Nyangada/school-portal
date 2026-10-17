import type { Card, Model, Reason, UnplacedReport } from '../types';
import { cardLabel } from '../load';
import { canPlace } from '../validate';
import type { State } from '../state';
import { startSlots } from './order';

const names = (model: Model, kind: 'teachers' | 'classes', ids: string[]) => ids.map((id) => model.names[kind][id] ?? id).join(', ');

/**
 * Turn per-slot failure reasons into the top 1–2 causes a non-technical user understands,
 * e.g. "OTI is busy or unavailable in all 7 slots where 3E is free".
 */
export function explainUnplaced(model: Model, state: State, card: Card): UnplacedReport {
	const starts = startSlots(model, card.length);
	const label = cardLabel(model, card);

	if (starts.length === 0) {
		return { cardId: card.id, label, reasons: ['No two periods sit together without a break, so this double cannot fit anywhere.'] };
	}

	const perSlot = starts.map((s) => canPlace(model, state, card, s).reasons);
	const classFree = perSlot.filter((rs) => !rs.some((r) => r.code === 'class_busy' || r.code === 'class_unavailable'));
	const reasons: string[] = [];
	const classes = names(model, 'classes', card.classIds);

	if (classFree.length === 0) {
		reasons.push(`${classes} ${card.classIds.length > 1 ? 'have' : 'has'} no free ${card.length === 2 ? 'double ' : ''}period left in the week.`);
	} else {
		// Among the slots where the class is free, what blocks it most often?
		const counts = new Map<string, { n: number; sample: Reason }>();

		classFree.forEach((rs) => {
			const seen = new Set<string>();
			rs.forEach((r) => {
				const kind = r.code === 'teacher_busy' || r.code === 'teacher_unavailable' ? 'teacher' : r.code;
				const key = `${kind}:${r.resourceId ?? ''}`;

				if (seen.has(key)) return;

				seen.add(key);
				counts.set(key, { n: (counts.get(key)?.n ?? 0) + 1, sample: r });
			});
		});

		const top = [...counts.values()].sort((a, b) => b.n - a.n).slice(0, 2);
		const total = classFree.length;

		for (const { n, sample } of top) {
			const howMany = n === total ? `all ${total}` : `${n} of the ${total}`;
			const where = `slots where ${classes} ${card.classIds.length > 1 ? 'are' : 'is'} free`;

			if (sample.resourceType === 'teacher' && sample.code !== 'teacher_max_day') {
				reasons.push(`${names(model, 'teachers', [sample.resourceId!])} is busy or unavailable in ${howMany} ${where}.`);
			} else if (sample.code === 'teacher_max_day') {
				reasons.push(`${names(model, 'teachers', [sample.resourceId!])} would go over their daily maximum in ${howMany} ${where}.`);
			} else if (sample.code === 'room_none') {
				reasons.push(`${sample.message.replace('at this time', '')} in ${howMany} ${where}.`);
			}
		}

		if (reasons.length === 0) reasons.push('Every remaining slot clashes with another lesson.');
	}

	return { cardId: card.id, label, reasons };
}

export function explainAllUnplaced(model: Model, state: State): UnplacedReport[] {
	return model.cards.filter((c) => !state.placements.has(c.id)).map((c) => explainUnplaced(model, state, c));
}
