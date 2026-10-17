/** Suggested room types. "classroom" is stored as "general" — the type ordinary lessons use. */
export const ROOM_TYPE_OPTIONS = ['classroom', 'field', 'lab', 'computer', 'hall'];

export const roomTypeLabel = (type: string) => (type === 'general' ? 'classroom' : type);
