import { describe, expect, it } from 'vitest';
import { normalizeOptionalRoomType, normalizeRoomType } from '../roomTypes';

describe('room types', () => {
	it('stores "classroom" as the general room type the generator uses', () => {
		expect(['Classroom', ' classroom ', 'general', 'CLASSROOM'].map(normalizeRoomType)).toEqual(Array(4).fill('general'));
	});

	it('keeps other types as typed', () => {
		expect(['field', 'lab', 'Lab', ' hall '].map(normalizeRoomType)).toEqual(['field', 'lab', 'Lab', 'hall']);
		expect([null, undefined].map(normalizeOptionalRoomType)).toEqual([null, undefined]);
	});
});
