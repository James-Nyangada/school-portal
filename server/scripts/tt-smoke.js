// End-to-end smoke test for /api/tt against a running server (npm run dev). Creates a temporary
// bell schedule, room and timetable, exercises every endpoint, then deletes everything it made.
// Usage: npm run test:tt-smoke   (needs at least 2 classes, 3 subjects and 1 teacher in the DB)
const path = require('path').join(__dirname, '..') + '/';
require(path + 'node_modules/dotenv').config({ path: path + '.env', quiet: true });
const jwt = require(path + 'node_modules/jsonwebtoken');
const { PrismaClient } = require(path + 'node_modules/@prisma/client');
const prisma = new PrismaClient();
const API = 'http://localhost:4000/api/tt';
const secret = process.env.JWT_SECRET || 'supersecret_for_dev_only_jemafaith';
const started = new Date();
const log = (...a) => console.log(...a);
let failures = 0;
const check = (cond, msg) => { if (!cond) { failures++; log('  ✗', msg); } else log('  ✓', msg); };

async function call(token, method, url, body) {
  const res = await fetch(API + url, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const ct = res.headers.get('content-type') || '';
  const data = ct.includes('json') ? await res.json() : Buffer.from(await res.arrayBuffer());
  return { status: res.status, data };
}

(async () => {
  // Safety: the cleanup removes the bell schedule, so only run on a school with no timetable data yet.
  const existing = await Promise.all([prisma.ttDay.count(), prisma.ttPeriod.count(), prisma.ttTimetable.count(), prisma.ttUnavailability.count()]);
  if (existing.some((n) => n > 0)) {
    console.error('Refusing to run: timetable data already exists (days, periods, timetables or unavailability).\nThis smoke test is for a fresh setup only, because its cleanup removes the bell schedule.');
    await prisma.$disconnect();
    process.exit(2);
  }
  const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
  const teachers = await prisma.user.findMany({ where: { role: 'TEACHER' } });
  const classes = await prisma.class.findMany({ take: 2 });
  const subjects = await prisma.subject.findMany({ take: 3 });
  const A = jwt.sign({ userId: admin.id, role: 'ADMIN' }, secret);
  const T = jwt.sign({ userId: teachers[0].id, role: 'TEACHER' }, secret);
  const preInfo = new Set((await prisma.ttSubjectInfo.findMany()).map((s) => s.subjectId));
  const created = { timetables: [], room: null, teacherSubjects: [] };
  log(`Using ${classes.length} classes, ${subjects.length} subjects, ${teachers.length} teachers`);

  try {
    log('Auth');
    check((await fetch(API + '/setup')).status === 401, 'no token → 401');
    check((await call(T, 'GET', '/setup')).status === 403, 'teacher → 403 on admin route');

    log('Setup (Phase 2/3)');
    let r = await call(A, 'PUT', '/setup/days', { days: ['Monday','Tuesday','Wednesday','Thursday','Friday'].map((n) => ({ name: n, short: n.slice(0,3) })) });
    check(r.status === 200 && r.data.days.length === 5, 'days saved');
    r = await call(A, 'PUT', '/setup/periods', { periods: [['08:00','08:40',0],['08:40','09:20',0],['09:20','10:00',0],['10:30','11:10',1],['11:10','11:50',1],['11:50','12:30',1]].map(([s,e,b],i)=>({ name:`P${i+1}`, startTime:s, endTime:e, block:b })) });
    check(r.status === 200 && r.data.periods.length === 6, 'periods saved (break after P3)');
    r = await call(A, 'PUT', '/setup/periods', { periods: [{ name: 'P1', startTime: '09:00', endTime: '08:00', block: 0 }] });
    check(r.status === 400, 'period ending before it starts → 400');
    r = await call(A, 'POST', '/setup/rooms', { name: 'SMOKE Lab', short: 'SLAB', type: 'lab' });
    check(r.status === 201, 'room created'); created.room = r.data.id;
    r = await call(A, 'POST', '/setup/rooms', { name: 'SMOKE Lab', short: 'SLAB', type: 'lab' });
    check(r.status === 409, 'duplicate room name → 409');
    r = await call(A, 'PUT', `/setup/subjects/${subjects[2].id}`, { short: 'SCI', color: '#10b981', roomType: 'lab' });
    check(r.status === 200, 'subject timetable info saved');
    r = await call(A, 'PUT', `/setup/unavailability/teacher/${teachers[0].id}`, { slots: [{ dayIndex: 0, periodIndex: 0 }] });
    check(r.status === 200, 'teacher unavailability saved');
    r = await call(A, 'GET', '/setup');
    check(r.status === 200 && r.data.unavailability.length >= 1, 'setup bundle loads');

    log('Timetable + lessons (Phase 4)');
    r = await call(A, 'POST', '/timetables', { name: 'SMOKE TEST', term: 'SMOKE-T1' });
    check(r.status === 201, 'timetable created'); const tid = r.data.id; created.timetables.push(tid);
    const t2 = teachers[1] ?? teachers[0];
    const lessons = [
      { subjectId: subjects[0].id, classIds: [classes[0].id], teacherIds: [teachers[0].id], periodsPerWeek: 5, doublesPerWeek: 1 },
      { subjectId: subjects[1].id, classIds: [classes[1 % classes.length].id], teacherIds: [teachers[0].id], periodsPerWeek: 4, doublesPerWeek: 0 },
      { subjectId: subjects[2].id, classIds: [classes[0].id], teacherIds: [t2.id], periodsPerWeek: 3, doublesPerWeek: 1 }
    ];
    // Lessons require each teacher to teach the subject; add any missing links (removed in cleanup).
    for (const l of lessons) {
      for (const teacherId of l.teacherIds) {
        const key = { teacherId, subjectId: l.subjectId };
        if (!(await prisma.teacherSubject.findUnique({ where: { teacherId_subjectId: key } })) && !created.teacherSubjects.some((k) => k.teacherId === teacherId && k.subjectId === l.subjectId)) {
          await prisma.teacherSubject.create({ data: key }); created.teacherSubjects.push(key);
        }
      }
    }
    const outsider = teachers.find((t) => !lessons.some((l) => l.teacherIds.includes(t.id)));
    if (outsider && !(await prisma.teacherSubject.findUnique({ where: { teacherId_subjectId: { teacherId: outsider.id, subjectId: subjects[0].id } } }))) {
      r = await call(A, 'POST', `/timetables/${tid}/lessons`, { ...lessons[0], teacherIds: [outsider.id] });
      check(r.status === 400, 'teacher who does not teach the subject → 400');
    }
    for (const l of lessons) { r = await call(A, 'POST', `/timetables/${tid}/lessons`, l); check(r.status === 201, `lesson ${l.periodsPerWeek}/wk created`); }
    r = await call(A, 'POST', `/timetables/${tid}/lessons`, { ...lessons[0], doublesPerWeek: 3 });
    check(r.status === 400, 'too many doubles → 400');
    r = await call(A, 'GET', `/timetables/${tid}/teacher-loads`);
    check(r.data.find((x) => x.teacherId === teachers[0].id)?.assigned === 9, 'teacher load = 9');

    log('Feasibility + generate (Phase 8/9/10)');
    r = await call(A, 'GET', `/timetables/${tid}/feasibility`);
    check(r.data.canGenerate === true, `feasible (${r.data.checks.map((c) => c.level).join(',')})`);
    r = await call(A, 'POST', `/timetables/${tid}/generate`, { timeLimitSec: 5 });
    check(r.status === 202, 'job started'); if (r.status !== 202) log(r.status, JSON.stringify(r.data)); const jobId = r.data.id;
    r = await call(A, 'POST', `/timetables/${tid}/generate`, { timeLimitSec: 5 });
    check(r.status === 409, 'second concurrent job → 409');
    r = await call(A, 'POST', `/timetables/${tid}/entries/clear`, {});
    check(r.status === 423, 'editor is read-only while generating → 423');
    let job;
    for (let i = 0; i < 60; i++) { await new Promise((s) => setTimeout(s, 1000)); job = (await call(A, 'GET', `/jobs/${jobId}`)).data; if (!['queued','running'].includes(job.status)) break; }
    check(job.status === 'done', `job finished: ${job.status} ${job.error ?? ''}`);
    check(job.placed === job.total && job.total > 0, `all cards placed (${job.placed}/${job.total})`);

    log('Grid + editor (Phase 6/7)');
    r = await call(A, 'GET', `/timetables/${tid}/model`);
    check(r.data.placements.length === job.total, 'model returns placements');
    const occ = await prisma.ttOccupancy.findMany({ where: { timetableId: tid, resourceType: 'teacher', resourceId: teachers[0].id } });
    check(!occ.some((o) => o.dayIndex === 0 && o.periodIndex === 0), 'teacher unavailability respected');
    const cards = r.data.cards; const placements = r.data.placements;
    const p0 = placements[0];
    r = await call(A, 'GET', `/timetables/${tid}/cards/${encodeURIComponent(p0.cardId)}/options`);
    check(r.data.options.length === 30 && r.data.options.some((o) => o.status === 'blocked'), 'drag options computed (30 cells)');
    const blocked = r.data.options.find((o) => o.status === 'blocked' && o.reasons.length);
    const okCell = r.data.options.find((o) => o.status !== 'blocked' && !(o.dayIndex === p0.dayIndex && o.periodIndex === p0.periodIndex));
    r = await call(A, 'POST', `/timetables/${tid}/entries/place`, { cardKey: p0.cardId, dayIndex: blocked.dayIndex, periodIndex: blocked.periodIndex });
    check(r.status === 409 && r.data.details?.reasons?.length > 0, `clashing move → 409 (${r.data.details?.reasons?.[0]})`);
    r = await call(A, 'POST', `/timetables/${tid}/entries/place`, { cardKey: p0.cardId, dayIndex: okCell.dayIndex, periodIndex: okCell.periodIndex });
    check(r.status === 200, 'valid move → 200');
    r = await call(A, 'POST', `/timetables/${tid}/entries/lock`, { cardKey: p0.cardId, locked: true });
    check(r.status === 200, 'lock');
    r = await call(A, 'POST', `/timetables/${tid}/entries/unplace`, { cardKey: p0.cardId });
    check(r.status === 409, 'locked card cannot be unplaced → 409');
    await call(A, 'POST', `/timetables/${tid}/entries/lock`, { cardKey: p0.cardId, locked: false });
    r = await call(A, 'POST', `/timetables/${tid}/entries/unplace`, { cardKey: p0.cardId });
    check(r.status === 200, 'unplace');
    r = await call(A, 'GET', `/timetables/${tid}/unplaced`);
    check(r.data.unplaced.length === 1 && r.data.unplaced[0].reasons.length >= 0, 'unplaced tray shows 1 card');
    r = await call(A, 'POST', `/timetables/${tid}/entries/place`, { cardKey: p0.cardId, dayIndex: okCell.dayIndex, periodIndex: okCell.periodIndex });
    check(r.status === 200, 'place from tray');
    // Swap two cards of the same class & length if possible
    const m2 = (await call(A, 'GET', `/timetables/${tid}/model`)).data;
    const byKey = new Map(m2.cards.map((c) => [c.id, c]));
    const singles = m2.placements.filter((p) => byKey.get(p.cardId).length === 1);
    let swapped = false;
    for (let i = 0; i < singles.length && !swapped; i++) for (let j = i + 1; j < singles.length && !swapped; j++) {
      const s = await call(A, 'POST', `/timetables/${tid}/entries/swap`, { cardA: singles[i].cardId, cardB: singles[j].cardId });
      if (s.status === 200) swapped = true;
    }
    check(swapped, 'a swap succeeded');
    // Database is the last line of defence: a raw duplicate occupancy row must fail.
    const any = await prisma.ttOccupancy.findFirst({ where: { timetableId: tid } });
    let dbErr = null;
    try { await prisma.ttOccupancy.create({ data: { ...any, id: undefined } }); } catch (e) { dbErr = e.code; }
    check(dbErr === 'P2002', `raw double-booking rejected by the database (${dbErr}, Postgres 23505)`);
    r = await call(A, 'GET', `/timetables/${tid}/grid?view=class&id=${classes[0].id}`);
    check(r.status === 200 && r.data.cells.length > 0, `class grid (${r.data.cells.length} cells)`);
    r = await call(A, 'GET', `/timetables/${tid}/grid?view=teacher&id=${teachers[0].id}`);
    check(r.status === 200 && r.data.cells.length > 0, 'teacher grid');
    r = await call(A, 'GET', `/timetables/${tid}/grid?view=room&id=${created.room}`);
    check(r.status === 200 && r.data.cells.length > 0, `room grid (lab lessons in SMOKE Lab: ${r.data.cells.length})`);
    r = await call(A, 'GET', `/timetables/${tid}/master`);
    check(r.status === 200 && r.data.cells.length > 0, 'master grid');

    log('Publish, my timetable, exports (Phase 11)');
    r = await call(T, 'GET', '/published/me');
    const before = r.data.timetable?.id;
    r = await call(A, 'POST', `/timetables/${tid}/publish`, {});
    check(r.status === 200, 'published');
    r = await call(T, 'GET', '/published/me');
    check(r.status === 200 && r.data.timetable?.id === tid && r.data.cells.length > 0, `teacher sees published timetable (${r.data.cells?.length} lessons)`);
    r = await call(T, 'GET', '/published/today?date=2026-10-05');
    check(r.status === 200 && Array.isArray(r.data.lessons), `today widget (Monday: ${r.data.lessons?.length} lessons)`);
    r = await call(A, 'GET', `/timetables/${tid}/export.xlsx`);
    check(r.status === 200 && r.data.length > 3000 && r.data.slice(0, 2).toString() === 'PK', `Excel export (${r.data.length} bytes)`);
    r = await call(A, 'GET', '/import/template.xlsx');
    check(r.status === 200 && r.data.slice(0, 2).toString() === 'PK', 'import template');

    log('Substitutions (Phase 12)');
    r = await call(A, 'POST', '/substitutions/absence', { teacherId: teachers[0].id, date: '2026-10-06' });
    check(r.status === 200, `absence recorded (${r.data.lessons} lessons on Tuesday)`);
    r = await call(A, 'GET', '/substitutions?date=2026-10-06');
    check(r.status === 200 && r.data.rows.length === (await prisma.ttSubstitution.count({ where: { timetableId: tid } })), `affected lessons listed (${r.data.rows.length})`);
    const row = r.data.rows.find((x) => x.suggestions.length > 0);
    if (row) {
      r = await call(A, 'POST', `/substitutions/${row.id}/assign`, { coverTeacherId: row.suggestions[0].teacherId });
      check(r.status === 200, `cover assigned to ${row.suggestions[0].name}`);
    } else log('  - no free cover teacher in this tiny school (expected with 2 teachers)');

    log('Duplicate + audit (Phase 13)');
    r = await call(A, 'POST', '/timetables', { name: 'SMOKE COPY', term: 'SMOKE-T1', copyFromId: tid, includeEntries: true });
    check(r.status === 201, 'duplicated with entries'); created.timetables.push(r.data.id);
    const [e1, e2] = await Promise.all([prisma.ttEntry.count({ where: { timetableId: tid } }), prisma.ttEntry.count({ where: { timetableId: r.data.id } })]);
    check(e1 === e2 && e2 > 0, `copy has the same ${e2} entries`);
    r = await call(A, 'GET', `/timetables/${tid}/audit`);
    check(r.data.length >= 8, `audit trail recorded (${r.data.length} events)`);
    r = await call(A, 'PUT', '/setup/days', { days: [{ name: 'Monday', short: 'Mon' }] });
    check(r.status === 409, 'changing day count while entries exist → 409');
  } catch (e) {
    failures++; console.error('CRASH', e);
  } finally {
    log('Cleanup');
    for (const id of created.timetables) {
      await prisma.ttTimetable.update({ where: { id }, data: { status: 'draft' } }).catch(() => {});
      await prisma.ttTimetable.delete({ where: { id } }).catch((e) => log('  ! could not delete timetable', e.message));
    }
    for (const key of created.teacherSubjects) await prisma.teacherSubject.delete({ where: { teacherId_subjectId: key } }).catch(() => {});
    if (created.room) await prisma.ttRoom.delete({ where: { id: created.room } }).catch(() => {});
    await prisma.ttUnavailability.deleteMany({ where: { resourceType: 'teacher', resourceId: { in: (await prisma.user.findMany({ where: { role: 'TEACHER' } })).map((t) => t.id) } } });
    await prisma.ttSubjectInfo.deleteMany({ where: { subjectId: { notIn: [...preInfo] } } });
    await prisma.ttDay.deleteMany(); await prisma.ttPeriod.deleteMany();
    await prisma.ttAudit.deleteMany({ where: { createdAt: { gte: started } } });
    const left = await Promise.all([prisma.ttTimetable.count(), prisma.ttEntry.count(), prisma.ttRoom.count(), prisma.ttDay.count(), prisma.ttJob.count()]);
    log('  remaining tt rows (timetables, entries, rooms, days, jobs):', left.join(', '));
    await prisma.$disconnect();
    log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
    process.exit(failures ? 1 : 0);
  }
})();
