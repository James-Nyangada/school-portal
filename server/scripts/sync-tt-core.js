#!/usr/bin/env node
/**
 * Copies the shared timetable core (server/src/timetable-core) into the portal so the editor
 * can validate drags instantly in the browser with exactly the same canPlace() the server uses.
 * The server copy is the source of truth — never edit portal/src/lib/timetable-core by hand.
 *
 *   node server/scripts/sync-tt-core.js          # copy
 *   node server/scripts/sync-tt-core.js --check  # exit 1 if the portal copy is out of date
 */
const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '..', 'src', 'timetable-core');
const dest = path.join(__dirname, '..', '..', 'portal', 'src', 'lib', 'timetable-core');
const SKIP = new Set(['__tests__', 'fixtures']);
const HEADER = '// GENERATED from server/src/timetable-core by server/scripts/sync-tt-core.js — do not edit.\n/* eslint-disable */\n';

function files(dir, rel = '') {
	return fs.readdirSync(path.join(dir, rel), { withFileTypes: true }).flatMap((e) => {
		if (SKIP.has(e.name)) return [];

		const r = path.join(rel, e.name);

		return e.isDirectory() ? files(dir, r) : e.name.endsWith('.ts') ? [r] : [];
	});
}

const check = process.argv.includes('--check');
let stale = 0;

for (const rel of files(src)) {
	const out = path.join(dest, rel);
	const content = HEADER + fs.readFileSync(path.join(src, rel), 'utf8');

	if (check) {
		if (!fs.existsSync(out) || fs.readFileSync(out, 'utf8') !== content) {
			console.error(`out of date: ${rel}`);
			stale++;
		}

		continue;
	}

	fs.mkdirSync(path.dirname(out), { recursive: true });
	fs.writeFileSync(out, content);
}

if (check && stale) {
	console.error('Run: node server/scripts/sync-tt-core.js');
	process.exit(1);
}

if (!check) console.log(`timetable-core synced to ${path.relative(process.cwd(), dest)}`);
