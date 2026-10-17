import type { SchoolConfig } from './types';

export const totalSlots = (cfg: SchoolConfig) => cfg.days * cfg.periodsPerDay;

export const slotIndex = (day: number, period: number, ppd: number) => day * ppd + period;

export const dayOf = (slot: number, ppd: number) => Math.floor(slot / ppd);

export const periodOf = (slot: number, ppd: number) => slot % ppd;

/** True when `slot` and the next period are on the same day with no break between them. */
export function sameBlock(cfg: SchoolConfig, slot: number): boolean {
	const p = periodOf(slot, cfg.periodsPerDay);

	return p + 1 < cfg.periodsPerDay && cfg.blockOf[p] === cfg.blockOf[p + 1];
}

/** Slots covered by a card of `length` starting at `slot`. */
export function coveredSlots(slot: number, length: number): number[] {
	return length === 2 ? [slot, slot + 1] : [slot];
}

/** Can a card of this length start at this slot at all (ignoring resources)? */
export function validStart(cfg: SchoolConfig, slot: number, length: number): 'ok' | 'out_of_range' | 'double_day_end' | 'double_break' {
	if (slot < 0 || slot >= totalSlots(cfg)) return 'out_of_range';

	if (length === 2) {
		const p = periodOf(slot, cfg.periodsPerDay);

		if (p + 1 >= cfg.periodsPerDay) return 'double_day_end';

		if (cfg.blockOf[p] !== cfg.blockOf[p + 1]) return 'double_break';
	}

	return 'ok';
}

/** Deterministic PRNG so generation runs are reproducible from a seed. */
export function mulberry32(seed: number): () => number {
	let a = seed >>> 0;

	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);

		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}
