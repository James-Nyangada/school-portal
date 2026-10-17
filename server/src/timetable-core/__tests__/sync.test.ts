import { execFileSync } from 'child_process';
import path from 'path';
import { describe, expect, it } from 'vitest';

describe('portal copy of timetable-core', () => {
	it('is in sync with the server source (run `npm run sync:tt-core` if this fails)', () => {
		const script = path.join(__dirname, '..', '..', '..', 'scripts', 'sync-tt-core.js');
		expect(() => execFileSync('node', [script, '--check'], { stdio: 'pipe' })).not.toThrow();
	});
});
