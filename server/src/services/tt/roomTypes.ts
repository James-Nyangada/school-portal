/**
 * Room types are free text that subjects/lessons match against rooms. "general" is the type the
 * generator gives every lesson that doesn't ask for one — i.e. an ordinary classroom — so
 * "classroom" is shown in the UI and stored as "general".
 */
export const CLASSROOM = 'general';

export function normalizeRoomType(type: string): string {
	const t = type.trim();

	return /^(classroom|general)$/i.test(t) ? CLASSROOM : t;
}

export function normalizeOptionalRoomType<T extends string | null | undefined>(type: T): T | string {
	return typeof type === 'string' ? normalizeRoomType(type) : type;
}
