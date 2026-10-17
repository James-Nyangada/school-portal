# Timetabling Module — Implementation Plan

Companion to `school-timetabling-feature.md` (the design guide). The design guide says **what** to build; this plan says **in what order, in which files, and how to know each step is done**.

**Stack:** Next.js (App Router) · Express.js · Supabase (Postgres, Auth, Realtime) · Tailwind CSS
**Assumed team:** 1 full-stack developer. Estimates are working days.
**Total:** roughly **8–10 weeks** to a production-ready v1, with a usable manual timetabler by about week 5.

---

## 0. Ground Rules

1. **Build vertically.** Each phase ends with something runnable and testable, not half of every layer.
2. **The shared validator is the source of truth.** Frontend, backend and generator all import the same `canPlace`. Never duplicate clash logic.
3. **Database is the last line of defence.** Every write to `tt_entries` writes `tt_occupancy` in the **same transaction**.
4. **Use a direct Postgres connection in Express for timetable writes.** `supabase-js` cannot run multi-statement transactions. Use `postgres` (postgres.js) with the Supabase connection string, and keep `supabase-js` for auth checks and Realtime.
5. **The generator never runs inside a request.** It runs as a background job, so Express must be hosted somewhere that allows long-running processes (Render, Railway, Fly.io, a VPS). Vercel serverless functions are not suitable for the generator.

---

## Phase 0 — Project Setup (1–2 days)

### Tasks
- [ ] Convert the repo to a **pnpm workspace** (or Turborepo) so Next.js and Express can share a package:
  ```
  /apps/web        (existing Next.js)
  /apps/api        (existing Express)
  /packages/timetable-core
  /supabase        (migrations, seed)
  ```
  `pnpm-workspace.yaml`:
  ```yaml
  packages:
    - "apps/*"
    - "packages/*"
  ```
- [ ] Create `packages/timetable-core` with TypeScript, `tsup` for building, and Vitest:
  ```bash
  cd packages/timetable-core
  pnpm init
  pnpm add -D typescript tsup vitest
  ```
  `package.json` → `"name": "@school/timetable-core"`, `"main": "dist/index.js"`, `"types": "dist/index.d.ts"`.
- [ ] Add it as a dependency in both apps: `"@school/timetable-core": "workspace:*"`.
- [ ] Install the Supabase CLI and link the project:
  ```bash
  pnpm add -D supabase
  npx supabase init
  npx supabase link --project-ref <ref>
  ```
- [ ] API dependencies:
  ```bash
  cd apps/api
  pnpm add postgres zod pg-boss @supabase/supabase-js exceljs
  pnpm add -D @types/express vitest supertest
  ```
- [ ] Web dependencies:
  ```bash
  cd apps/web
  pnpm add @tanstack/react-query zustand @dnd-kit/core @dnd-kit/utilities react-hook-form zod @hookform/resolvers
  ```
- [ ] Environment variables:
  ```
  # apps/api/.env
  DATABASE_URL=postgresql://...      # Supabase direct/pooler (session mode) connection string
  SUPABASE_URL=...
  SUPABASE_SERVICE_ROLE_KEY=...
  GENERATOR_TIME_LIMIT_SEC=60

  # apps/web/.env.local
  NEXT_PUBLIC_SUPABASE_URL=...
  NEXT_PUBLIC_SUPABASE_ANON_KEY=...
  NEXT_PUBLIC_API_URL=http://localhost:4000
  ```

### Done when
`pnpm -r build` succeeds, and both apps can import a dummy `hello()` from `@school/timetable-core`.

---

## Phase 1 — Database (2–3 days)

### Tasks
- [ ] Migration `supabase/migrations/<ts>_tt_core.sql`: all tables from section 3 of the design guide (`tt_days`, `tt_periods`, `tt_teachers`, `tt_classes`, `tt_rooms`, `tt_subjects`, `tt_unavailability`, `tt_timetables`, `tt_parallel_groups`, `tt_lessons`, `tt_lesson_classes`, `tt_lesson_teachers`, `tt_entries`, `tt_occupancy`).
- [ ] Migration `<ts>_tt_jobs_subs.sql`:
  ```sql
  create table tt_jobs (
    id uuid primary key default gen_random_uuid(),
    timetable_id uuid not null references tt_timetables(id) on delete cascade,
    status text not null default 'queued' check (status in ('queued','running','done','failed','cancelled')),
    progress smallint not null default 0,
    placed int, total int,
    result jsonb,                 -- unplaced cards + reasons, score
    error text,
    created_by uuid references auth.users(id),
    created_at timestamptz default now(),
    finished_at timestamptz
  );

  create table tt_substitutions (
    id uuid primary key default gen_random_uuid(),
    school_id uuid not null,
    date date not null,
    entry_id uuid not null references tt_entries(id) on delete cascade,
    absent_teacher_id uuid not null references tt_teachers(id),
    cover_teacher_id uuid references tt_teachers(id),
    note text,
    unique (date, entry_id)
  );

  create table tt_settings (
    school_id uuid primary key references schools(id),
    ignore_general_rooms boolean not null default true,
    rules jsonb not null default '{"spreadSubjects":true,"noSameSubjectTwiceADay":true,"minimiseTeacherGaps":true,"respectMaxPerDay":true,"preferMorning":true}'
  );
  ```
- [ ] Indexes for read paths:
  ```sql
  create index on tt_entries (timetable_id, day_index, period_index);
  create index on tt_lesson_classes (class_id);
  create index on tt_lesson_teachers (teacher_id);
  create index on tt_occupancy (timetable_id, resource_type, resource_id);
  ```
- [ ] Migration `<ts>_tt_rls.sql`. Enable RLS on every `tt_*` table. Helper:
  ```sql
  create or replace function tt_has_role(p_school uuid, p_roles text[])
  returns boolean language sql stable security definer as $$
    select exists (
      select 1 from school_members m
      where m.user_id = auth.uid() and m.school_id = p_school and m.role = any(p_roles)
    );
  $$;
  ```
  Policies:
  - Setup tables: `select/insert/update/delete` when `tt_has_role(school_id, '{admin,timetabler}')`.
  - `tt_entries` select: timetabler, **or** the parent timetable is `published` and the user is a member of that school.
  - Enable Realtime on `tt_jobs` (Dashboard → Database → Replication, or `alter publication supabase_realtime add table tt_jobs;`).

  Adapt `school_members` to whatever table your portal already uses for roles.
- [ ] Seed `supabase/seed/tt_demo.sql`: 5 days, 9 periods in 3 blocks, 16 classes (Form 1–4 × 4 streams), 45 teachers, 12 subjects, 3 labs, a computer room, about 200 lessons including one option block for Form 3 and Form 4.
- [ ] Generate types:
  ```bash
  npx supabase gen types typescript --linked > packages/timetable-core/src/db.types.ts
  ```

### Done when
- `npx supabase db reset` applies migrations and seed cleanly.
- A manual SQL test that inserts two occupancy rows for the same teacher and slot fails with `23505`.

---

## Phase 2 — Express Foundation & Setup CRUD (3 days)

### Files
```
apps/api/src/
  db.ts                     postgres.js client
  supabase.ts               service-role client
  middleware/auth.ts        verify JWT, load school + role
  middleware/requireRole.ts
  middleware/errors.ts      zod → 400, 23505 → 409, 23503 → 409
  routes/tt/index.ts
  routes/tt/setup.routes.ts days, periods, subjects, teachers, classes, rooms, unavailability
  schemas/tt.schemas.ts     zod schemas
```

### Key code

`db.ts`
```ts
import postgres from 'postgres';
export const sql = postgres(process.env.DATABASE_URL!, { max: 10, prepare: false });
```

`middleware/auth.ts`
```ts
export async function auth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Not signed in' });
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return res.status(401).json({ error: 'Invalid session' });
  const [member] = await sql`
    select school_id, role from school_members where user_id = ${data.user.id} limit 1`;
  if (!member) return res.status(403).json({ error: 'No school access' });
  req.user = { id: data.user.id, schoolId: member.school_id, role: member.role };
  next();
}
```

`middleware/errors.ts`
```ts
export function errorHandler(err, _req, res, _next) {
  if (err instanceof ZodError) return res.status(400).json({ error: 'Invalid input', details: err.flatten() });
  if (err.code === '23505') return res.status(409).json({ error: 'Clash or duplicate', detail: err.detail });
  if (err.code === '23503') return res.status(409).json({ error: 'Record is in use' });
  console.error(err);
  res.status(500).json({ error: 'Server error' });
}
```

### Tasks
- [ ] Auth + role middleware; every query is scoped by `req.user.schoolId`, never by a client-sent school id.
- [ ] Generic CRUD for the six setup resources (list, create, update, delete) with zod validation.
- [ ] `PUT /api/tt/unavailability/:type/:id`: delete then insert in one transaction.
- [ ] `GET/PUT /api/tt/settings`.
- [ ] Supertest tests: 401 without token, 403 for a student, CRUD happy path, 409 on duplicate short name.

### Done when
All setup endpoints work from Postman/Bruno against the seeded school.

---

## Phase 3 — Setup Screens (4 days)

### Files
```
apps/web/
  lib/api.ts                      fetch wrapper adding the Supabase access token
  lib/queries/tt.ts               TanStack Query hooks (useSubjects, useTeachers...)
  app/(admin)/timetable/layout.tsx
  app/(admin)/timetable/setup/page.tsx            tabs
  components/timetable/setup/BellScheduleEditor.tsx
  components/timetable/setup/ResourceTable.tsx     reusable table + inline edit
  components/timetable/setup/AvailabilityGrid.tsx  days × periods, click/drag to toggle
```

### Tasks
- [ ] `lib/api.ts`: get the session from `supabase.auth.getSession()` and send `Authorization: Bearer`.
- [ ] Bell schedule editor: add periods, set times, and insert a "break" marker between periods (which sets `block`). Show a preview of the school day.
- [ ] One reusable `ResourceTable` for subjects, teachers, classes and rooms (columns passed as config). Subjects get a colour picker.
- [ ] `AvailabilityGrid`: click or drag across cells to mark unavailable (grey). Used from the teacher, class and room rows.
- [ ] Guard the whole `/timetable` section with a server-side role check in `layout.tsx`.

### Done when
An admin can set up a school from scratch in the UI without touching SQL.

---

## Phase 4 — Lessons (4 days)

### Tasks
- [ ] API (`routes/tt/timetables.routes.ts`, `lessons.routes.ts`):
  - `GET/POST /timetables`, with `copyFromId` duplicating lessons, groups and lesson links in one transaction.
  - `GET/POST/PATCH/DELETE` lessons, writing `tt_lessons`, `tt_lesson_classes` and `tt_lesson_teachers` together.
  - `POST /timetables/:id/parallel-groups`, and attaching/detaching lessons to a group.
  - `GET /timetables/:id/teacher-loads` returns `{ teacherId, assigned, available }`.
- [ ] UI `app/(admin)/timetable/[id]/lessons/page.tsx`:
  - **List view:** a filterable table (by class, teacher, subject).
  - **Matrix view** (`LessonMatrix.tsx`): rows are classes of one level, columns are subjects; each cell has periods/week, doubles and a teacher select. Includes an "Apply to all streams of this level" button.
  - **Teacher load sidebar:** turns red when assigned exceeds available.
  - Option block builder: pick a level, then add the elective lessons that run together.
- [ ] Excel import (`POST /import`) with a downloadable template (`exceljs`), covering teachers, classes, subjects and lessons. Validate all rows first, then insert in one transaction, and return row-level errors.

### Done when
The full demo school's lessons can be entered via the matrix in under 15 minutes, and teacher loads are visible.

---

## Phase 5 — `timetable-core`: Model & Validator (4 days)

This phase is the foundation for everything after it, so test it thoroughly.

### Files
```
packages/timetable-core/src/
  types.ts        SchoolConfig, Card, Entry, State, Reason
  slots.ts        slotIndex(), dayOf(), periodOf(), sameBlock(), slotMask()
  load.ts         buildModel(dbRows) → { config, cards, lockedEntries }
  state.ts        createState(), commit(), undo(), clone()
  validate.ts     canPlace(), findRoom(), explain()
  score.ts        softScore(state, config)
  index.ts
  __tests__/
```

### Key code

`slots.ts`
```ts
export const slotIndex = (day: number, period: number, ppd: number) => day * ppd + period;
export const slotMask = (slot: number, length: 1 | 2): bigint =>
  length === 1 ? 1n << BigInt(slot) : (3n << BigInt(slot));
export function sameBlock(cfg: SchoolConfig, slot: number): boolean {
  const p = slot % cfg.periodsPerDay;
  return p + 1 < cfg.periodsPerDay && cfg.blockOf[p] === cfg.blockOf[p + 1];
}
```

`load.ts` card expansion:
```ts
// 5 periods, 1 double → lengths [2,1,1,1]
function expandLesson(l: Lesson): Card[] {
  const singles = l.periodsPerWeek - 2 * l.doublesPerWeek;
  const lengths = [...Array(l.doublesPerWeek).fill(2), ...Array(singles).fill(1)];
  return lengths.map((len, i) => ({ id: `${l.id}#${i}`, lessonIds: [l.id], length: len, ... }));
}
// Parallel group: zip the cards of each member lesson by index into one combined card.
// Validation: all lessons in a group must have the same periods/doubles pattern.
```

`state.ts` holds the busy masks per teacher, class and room, plus an `unavailable` mask per resource precomputed from `tt_unavailability`.

### Tests (Vitest)
- [ ] Slot math, including the last period of a day (a double must not wrap to the next day).
- [ ] A double across a break is rejected.
- [ ] Teacher, class and room clashes are rejected, each with the correct reason text.
- [ ] Unavailability is respected.
- [ ] A parallel group occupies the class once, all teachers, and one room each.
- [ ] Combined classes (two classes, one lesson) block both classes.
- [ ] `commit` followed by `undo` restores the exact previous state.

### Done when
More than 95% line coverage on `validate.ts` and `state.ts`, and all tests pass.

---

## Phase 6 — Saving Entries & Grid Views (4 days)

### Tasks
- [ ] Service `apps/api/src/services/tt/entries.service.ts`, used by every write path (editor, generator, publish):
  ```ts
  export async function placeEntry(tx, timetableId, card, day, period, roomIds, locked = false) {
    const [entry] = await tx`
      insert into tt_entries (timetable_id, lesson_id, day_index, period_index, length, room_id, locked)
      values (...) returning id`;
    const rows = occupancyRows(entry.id, card, day, period, roomIds); // teachers, classes (group_key), rooms × length
    await tx`insert into tt_occupancy ${tx(rows)} on conflict do nothing`; // see note
    return entry;
  }
  ```
  **Note:** use `on conflict do nothing` **only** for class rows of parallel groups (the shared `group_key`). Teacher and room rows must use a plain insert so a clash raises `23505`. Split them into two inserts.
- [ ] Read endpoint `GET /timetables/:id/grid?view=class|teacher|room&id=...` returns entries with joined subject, teacher, class and room short names and colour.
- [ ] Master endpoint `GET /timetables/:id/master`.
- [ ] UI components:
  ```
  components/timetable/grid/TimetableGrid.tsx   days × periods, breaks as thin separators
  components/timetable/grid/LessonCard.tsx       colour, subject, teacher/class short names, 🔒
  components/timetable/grid/MasterGrid.tsx       classes × all slots, compact
  ```
  Doubles render as one card spanning 2 columns (CSS grid `col-span-2`).
- [ ] View switcher: Class / Teacher / Room / Master, with a selector for which class, teacher or room.

### Done when
Entries inserted via SQL render correctly in all four views, and a deliberately clashing insert through the service returns 409.

---

## Phase 7 — Manual Editor (6 days)

This is the most important user-facing screen. Most of the aSc "feel" comes from it.

### Tasks
- [ ] API (`routes/tt/entries.routes.ts`):
  - `POST /entries/move`: in a transaction, load the model, delete the old entry and its occupancy, run `canPlace` (server-side), insert the new entry. Return `{ ok, entry }` or 409 with `reasons[]`.
  - `POST /entries/swap`: remove both, check A at B's position and B at A's, insert both, else roll back.
  - `POST /entries/place` from the unplaced tray; `DELETE /entries/:id` to unplace; `PATCH /entries/:id` to lock or unlock.
  - `GET /timetables/:id/model` returns everything the browser needs to build a `State` (config, cards, entries) in one call.
- [ ] Editor store `apps/web/stores/editorStore.ts` (Zustand): holds the `State` built with `timetable-core`, and applies moves locally.
- [ ] `app/(admin)/timetable/[id]/editor/page.tsx`:
  - Left: `UnplacedTray.tsx` (cards not yet placed = all cards minus placed).
  - Centre: `TimetableGrid` in edit mode with `@dnd-kit` draggable cards and droppable cells.
  - **On drag start:** compute `canPlace` for every slot and tint cells green, amber (soft-rule hit) or red.
  - **Hover a red cell:** tooltip with the reasons.
  - **Drop on an occupied cell:** a "Swap?" popover appears if both directions are valid.
  - **Right-click menu:** Lock/Unlock, Unplace, Change room, Open teacher view.
  - **Optimistic update:** apply locally, call the API, revert and toast the reasons on 409.
- [ ] Undo/redo (keep the last 20 actions in the store; undo calls the inverse API action).
- [ ] Keyboard: `L` to lock, `Delete` to unplace, `Ctrl+Z` to undo.

### Done when
A user can build the demo timetable entirely by hand, it's impossible to create a clash from the UI **or** with a hand-crafted API call, and each red cell explains why.

> **Milestone (end of about week 5):** the module is usable in a real school with manual timetabling only.

---

## Phase 8 — Feasibility Check (2 days)

### Tasks
- [ ] `timetable-core/src/feasibility.ts` → `checkFeasibility(model): Check[]` where `Check = { level: 'ok'|'warn'|'error', message, link? }`. Implement the checks in section 5 of the design guide.
- [ ] Also check: lessons with no teacher or no class, parallel groups with mismatched period patterns, and subjects needing a room type with no such room.
- [ ] `GET /timetables/:id/feasibility`.
- [ ] UI on `/timetable/[id]/generate`: a checklist where each error links to the record to fix. The Generate button is disabled while there are errors.

### Done when
Seeded "broken" fixtures (overloaded teacher, no lab, impossible double) each produce the correct error.

---

## Phase 9 — Generator (7–8 days)

### Files
```
packages/timetable-core/src/generator/
  order.ts        MRV + tie-breakers
  search.ts       backtracking with forward checking, step limit
  generate.ts     restarts, time budget, best-partial tracking, progress callback
  improve.ts      (Phase 10)
  reasons.ts      (Phase 10)
apps/api/src/
  jobs/queue.ts            pg-boss setup
  jobs/generate.job.ts     loads model, runs worker thread, saves result
  workers/generate.worker.ts   runs generate() off the main thread
  routes/tt/generate.routes.ts
```

### Key code

`generate.ts` (outline)
```ts
export function generate(model: Model, opts: { timeLimitMs: number; seed?: number; onProgress?: (p: Progress) => void }): GenResult {
  const deadline = Date.now() + opts.timeLimitMs;
  let best: GenResult | null = null;
  let attempt = 0;
  while (Date.now() < deadline) {
    const rng = mulberry32((opts.seed ?? Date.now()) + attempt++);
    const state = createState(model);                     // locked entries pre-applied
    const result = search(model, state, { rng, stepLimit: 20_000, deadline, onProgress: opts.onProgress });
    if (!best || result.placed > best.placed) best = result;
    if (result.placed === model.cards.length) break;      // full solution found
  }
  return best!;
}
```

`search.ts`: iterative (not recursive) backtracking with an explicit stack, to avoid stack overflow on 900+ cards. At each step:
1. Pick the unplaced card with the smallest live domain (MRV).
2. Order its candidate slots by `softDelta` + small `rng` jitter.
3. Commit the first valid one and forward-check that no remaining card has an empty domain; otherwise try the next slot.
4. If none work, pop and backtrack.
5. If the step limit is hit, return the current best partial.

`generate.job.ts`
```ts
boss.work('tt-generate', async ([job]) => {
  const { timetableId, jobRowId, keepLocked, timeLimitSec } = job.data;
  await sql`update tt_jobs set status='running' where id=${jobRowId}`;
  const model = await loadModel(timetableId, { keepLocked });
  const result = await runInWorker(model, timeLimitSec * 1000, async (p) => {
    await sql`update tt_jobs set progress=${p.percent}, placed=${p.placed}, total=${p.total} where id=${jobRowId}`;
  });                                            // throttle progress writes to ~1/sec
  await sql.begin(async (tx) => {
    await deleteUnlockedEntries(tx, timetableId);
    for (const e of result.entries) await placeEntry(tx, timetableId, ...);
  });
  await sql`update tt_jobs set status='done', progress=100, result=${sql.json(result.summary)}, finished_at=now() where id=${jobRowId}`;
});
```
Use bulk inserts for entries and occupancy rather than one insert per entry; with 900+ cards this matters.

### Tasks
- [ ] Implement `order.ts`, `search.ts`, `generate.ts` with a seeded RNG so runs are reproducible.
- [ ] Worker thread wrapper (`worker_threads`) passing the model in and progress messages out.
- [ ] pg-boss queue and job; `POST /generate` creates a `tt_jobs` row and enqueues; `POST /jobs/:id/cancel` sets a flag the worker checks.
- [ ] Prevent two concurrent generation jobs for the same timetable.
- [ ] UI: the Generate button opens a progress panel subscribed to the `tt_jobs` row via Supabase Realtime (`supabase.channel().on('postgres_changes', { table: 'tt_jobs', filter: 'id=eq.<id>' })`). On done, link to the editor.
- [ ] Tests:
  - **Property test:** 50 random feasible schools; assert no clashes and exact period counts.
  - Locked entries are untouched after generation.
  - The demo school solves fully in under 60 s on the target server.

### Done when
The demo school generates a complete, clash-free timetable from the UI with live progress, and partial results are saved when a school is infeasible.

---

## Phase 10 — Quality Pass & Unplaced Reasons (3–4 days)

### Tasks
- [ ] `score.ts`: implement the soft rules from the design guide, each togglable from `tt_settings.rules`.
- [ ] `improve.ts`: hill climbing after a full placement. Pick a random non-locked card and try a move or swap; accept if valid and the score improves. Stop after a time budget (about 10 s) or N iterations without improvement.
- [ ] `reasons.ts`: for each unplaced card, aggregate the failure reasons across all slots into the top 1–2 human-readable causes ("OTI is busy or unavailable in all 7 remaining slots that 3E is free").
- [ ] UI: unplaced report on the generate page with a "Show in editor" link for each card.
- [ ] Settings page: rule toggles plus "Ignore general rooms".

### Done when
In the demo output, no class has the same subject twice in a day (except doubles), teacher gaps visibly drop compared with Phase 9, and every unplaced card has a reason a non-technical user understands.

---

## Phase 11 — Publish, My Timetable, Exports (4 days)

### Tasks
- [ ] `POST /timetables/:id/publish`: block if unplaced cards exist (unless `force`); archive the previously published timetable for that term in the same transaction.
- [ ] `GET /published/me`: resolve the user to a teacher (via `staff_id`) or a student (via their class) and return the right grid.
- [ ] `app/(portal)/my-timetable/page.tsx`: read-only grid that highlights the current period and "next lesson".
- [ ] Dashboard widget: "Today's lessons" for teachers and students.
- [ ] Print route `/timetable/[id]/print?view=class|teacher|room|master&ids=...` using Tailwind `print:` styles, one timetable per page (`break-after-page`), master sheet in A3 landscape (`@page { size: A3 landscape }`).
- [ ] Excel export with `exceljs` (one sheet per class, a teacher sheet, and the master).
- [ ] Optional server PDF: Puppeteer in Express rendering the print route. Skip it if browser printing is good enough.

### Done when
Publishing makes the timetable appear for a test teacher and a test student, and printed class timetables fit cleanly on A4.

---

## Phase 12 — Substitutions Lite (3 days)

### Tasks
- [ ] `POST /substitutions/absence { teacherId, date }`: create `tt_substitutions` rows for every entry of that teacher on that weekday in the published timetable.
- [ ] `GET /substitutions?date=`: for each affected lesson, list free teachers in that slot, ranked by (a) teaches the same subject, (b) fewest lessons that day, (c) fewest covers this week.
- [ ] `POST /substitutions/:id/assign`.
- [ ] UI `/timetable/substitutions`: date picker, absent-teacher multi-select, a table of affected lessons with a cover dropdown, and a printable daily cover sheet.
- [ ] Show cover duties on the covering teacher's dashboard.

### Done when
Marking one teacher absent produces correct suggestions, and the assigned cover appears on the covering teacher's dashboard.

---

## Phase 13 — Hardening & Launch (4–5 days)

### Tasks
- [ ] **Security review:** every route scoped by `schoolId`; RLS tested with anon, student, teacher and timetabler JWTs; service-role key never sent to the browser.
- [ ] **Concurrency:** use a timetable-level advisory lock (`pg_advisory_xact_lock(hashtext(timetable_id))`) on every write, so an editor save and a generation job can't interleave. While a generation job runs, the editor shows read-only mode.
- [ ] **Performance:** a large fixture (30 streams, 70 teachers, 1,200 cards) generates within budget; grid endpoints respond in under 300 ms.
- [ ] **Audit log:** a `tt_audit` table recording who moved, locked or published what and when.
- [ ] **Backups:** a "Duplicate timetable" button before big changes (reuses the `copyFromId` logic, including entries).
- [ ] **E2E tests** (Playwright): set up → lessons → generate → edit → publish → teacher sees timetable.
- [ ] **Deploy:** Next.js on Vercel; Express plus the pg-boss worker on a long-running host; migrations via `npx supabase db push` in CI.
- [ ] **User guide:** a one-page "How to make your timetable" with screenshots, aimed at deputy principals.

### Done when
A pilot school completes its real term timetable end to end without developer help.

---

## Timeline Summary

| Week | Phases | Outcome |
|---|---|---|
| 1 | 0, 1, start 2 | Repo, schema, RLS, seed |
| 2 | 2, 3 | Setup API and screens |
| 3 | 4, 5 | Lessons entry; validator with tests |
| 4 | 6, start 7 | Saving and grid views |
| 5 | 7 | **Manual editor: first usable release** |
| 6 | 8, start 9 | Feasibility check; generator core |
| 7 | 9 | Generator with jobs and live progress |
| 8 | 10, 11 | Quality pass; publish, my timetable, exports |
| 9 | 12, 13 | Substitutions; hardening |
| 10 | 13 | Pilot school, fixes, launch |

---

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Option blocks modelled wrongly, breaking clash logic | Build and test them in Phases 1 and 5, not at the end; include them in seed data from day one |
| Generator hangs or fails on real data | Feasibility check first, a step limit with restarts, always save the best partial, and clear unplaced reasons |
| Bad data from schools (overloaded teachers, too many periods) | Teacher load sidebar during lesson entry; feasibility errors link straight to the fix |
| Express host times out long jobs | Run the generator via pg-boss on a long-running host, never on serverless |
| Editor and generator writing at the same time | Advisory lock per timetable; editor goes read-only during a job |
| Validator differs between browser and server | One shared `timetable-core` package; server always re-validates |
| Scope creep (exams, A/B weeks, room booking) | Keep the "Out of scope" list in the design guide; add only after v1 is in a school |