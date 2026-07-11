# Timetable Generation Module — Implementation Guide

## Purpose

Add an automatic timetable engine to the school management system that can:
1. Generate **class timetables** (weekly grid, subjects/teachers/rooms, with parallel/split groups like PE Boys/Girls or Sport Group 1/2)
2. Generate **teacher timetables** (same underlying data, pivoted by teacher)
3. Generate **exam timetables** (conflict-free exam sessions, invigilator + room assignment)
4. Export any of the above as a **downloadable PDF** matching a printed-grid layout (aSc TimeTables style)
5. **Publish/share** a generated timetable with a given class or teacher

This document specifies data model, constraint logic, generation algorithm, API surface, PDF rendering, and rollout plan. Stack assumptions: Next.js (frontend), Express.js (API), PostgreSQL (data), but the logic is stack-agnostic.

---

## 1. Core Concepts (borrowed from aSc TimeTables)

Understanding these terms is essential before touching the schema — they map directly to tables below.

| aSc concept | Meaning | Your equivalent |
|---|---|---|
| **Subject** | A course, e.g. Math, Sport | `subjects` table |
| **Class** | A cohort of students, e.g. "5.A" | `classes` table |
| **Teacher** | Staff who can teach one or more subjects | `teachers` table |
| **Room/Classroom** | Physical space, may have a type (lab, gym, normal) | `rooms` table |
| **Period/Time slot** | A fixed daily time block (e.g. Period 1 = 08:00–08:45) | `periods` table |
| **Card / Lesson** | One occurrence of "Subject X taught by Teacher Y to Class Z in Room W" — the atomic unit that gets placed onto the grid | `lesson_requirements` (need) → `timetable_entries` (placed) |
| **Subject-group / Split** | A class splitting into subgroups for a subject (e.g. "Sport Group 1" vs "Group 2", or "PE Boys"/"PE Girls") each taught by a **different** teacher **at the same time** | `student_groups` + `parallel_group_id` link |
| **Card relationship / parallel cards** | Two or more cards that MUST occupy the identical day+period across the week (this is what makes split groups line up on the grid) | `lesson_requirements.parallel_group_id` |
| **Availability** | Per-teacher/per-room slots that are blocked (unavailable) | `teacher_availability`, `room_availability` |
| **Card duration** | Some lessons span 2 consecutive periods (double period) | `lesson_requirements.duration_periods` |
| **Generator** | The constraint-solving engine that assigns every card a day+period+room | Section 4 |
| **Substitution** | Ad hoc teacher swap for a single day due to absence (not covered by generator, but schema should support it) | `substitutions` table (Section 8) |

---

## 2. Database Schema (PostgreSQL)

```sql
-- ========== ORGANIZATIONAL ==========

CREATE TABLE terms (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id       UUID NOT NULL REFERENCES schools(id),
    name            TEXT NOT NULL,             -- "Term 2, 2026"
    start_date      DATE NOT NULL,
    end_date        DATE NOT NULL,
    is_active       BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE working_days (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    term_id         UUID NOT NULL REFERENCES terms(id) ON DELETE CASCADE,
    day_of_week     SMALLINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6) -- 0=Mon
);

CREATE TABLE periods (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id       UUID NOT NULL REFERENCES schools(id),
    period_index    SMALLINT NOT NULL,          -- 0,1,2,3... order on grid
    label           TEXT,                       -- "Period 1", or null for breaks
    start_time      TIME NOT NULL,
    end_time        TIME NOT NULL,
    is_break        BOOLEAN NOT NULL DEFAULT false, -- lunch/short break, excluded from lesson placement
    UNIQUE (school_id, period_index)
);

-- ========== ACADEMIC ENTITIES ==========

CREATE TABLE grades (              -- "Grade 5", "Form 3"
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id       UUID NOT NULL REFERENCES schools(id),
    name            TEXT NOT NULL,
    curriculum      TEXT NOT NULL DEFAULT 'CBC'  -- CBC / 8-4-4 / IGCSE etc.
);

CREATE TABLE classes (              -- "5.A" — a specific stream within a grade
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    grade_id        UUID NOT NULL REFERENCES grades(id),
    name            TEXT NOT NULL,               -- "5.A"
    student_count   INT NOT NULL DEFAULT 0
);

CREATE TABLE subjects (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id       UUID NOT NULL REFERENCES schools(id),
    code            TEXT NOT NULL,               -- "Sp", "Ma", "Ge"
    name            TEXT NOT NULL,                -- "Sport", "Mathematics"
    color_hex       TEXT DEFAULT '#CCCCCC',       -- for PDF/grid rendering
    requires_room_type TEXT DEFAULT 'normal'      -- normal|lab|gym|field|music
);

CREATE TABLE teachers (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id       UUID NOT NULL REFERENCES schools(id),
    staff_id        UUID REFERENCES users(id),    -- link to login/account
    initials        TEXT NOT NULL,                 -- "Jo", "Ma" — shown on grid
    full_name       TEXT NOT NULL,
    max_periods_per_day    SMALLINT DEFAULT 8,
    max_periods_per_week    SMALLINT DEFAULT 30
);

CREATE TABLE teacher_subjects (      -- which teacher can teach which subject
    teacher_id      UUID NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
    subject_id      UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
    PRIMARY KEY (teacher_id, subject_id)
);

CREATE TABLE rooms (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id       UUID NOT NULL REFERENCES schools(id),
    code            TEXT NOT NULL,                -- "S106"
    room_type       TEXT DEFAULT 'normal',
    capacity        INT DEFAULT 40,
    building        TEXT                          -- for transfer-time logic (Section 4.6)
);

-- ========== AVAILABILITY (hard constraints) ==========

CREATE TABLE teacher_availability (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    teacher_id      UUID NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
    day_of_week     SMALLINT NOT NULL,
    period_id       UUID NOT NULL REFERENCES periods(id),
    status          TEXT NOT NULL DEFAULT 'unavailable' -- unavailable|preferred_free
);

CREATE TABLE room_availability (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id         UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    day_of_week     SMALLINT NOT NULL,
    period_id       UUID NOT NULL REFERENCES periods(id),
    status          TEXT NOT NULL DEFAULT 'unavailable'
);

-- ========== STUDENT GROUPS (for splits like PE Boys/Girls) ==========

CREATE TABLE student_groups (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    class_id        UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    label           TEXT NOT NULL                 -- "Group 1", "Boys"
);

-- ========== LESSON REQUIREMENTS (the "need", before placement) ==========

CREATE TABLE lesson_requirements (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    term_id             UUID NOT NULL REFERENCES terms(id) ON DELETE CASCADE,
    class_id            UUID NOT NULL REFERENCES classes(id),
    subject_id          UUID NOT NULL REFERENCES subjects(id),
    teacher_id          UUID NOT NULL REFERENCES teachers(id),
    student_group_id    UUID REFERENCES student_groups(id),   -- null = whole class
    room_id             UUID REFERENCES rooms(id),             -- null = any matching room_type
    periods_per_week    SMALLINT NOT NULL,
    duration_periods    SMALLINT NOT NULL DEFAULT 1,           -- 2 = double period
    parallel_group_id   UUID,                                  -- shared id across cards that must sync in time
    priority            SMALLINT NOT NULL DEFAULT 5,           -- 1 (hardest to place) .. 10 (flexible), drives placement order
    prefer_period_range  INT4RANGE,                            -- e.g. [0,3) morning-only preference
    avoid_double_same_day BOOLEAN DEFAULT true
);

-- ========== PLACED TIMETABLE (the "solution") ==========

CREATE TABLE timetables (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    term_id         UUID NOT NULL REFERENCES terms(id),
    version         INT NOT NULL DEFAULT 1,
    status          TEXT NOT NULL DEFAULT 'draft',  -- draft|generating|failed|published|archived
    generated_at    TIMESTAMPTZ,
    published_at    TIMESTAMPTZ,
    score            NUMERIC,                        -- soft-constraint quality score
    UNIQUE (term_id, version)
);

CREATE TABLE timetable_entries (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    timetable_id        UUID NOT NULL REFERENCES timetables(id) ON DELETE CASCADE,
    lesson_requirement_id UUID NOT NULL REFERENCES lesson_requirements(id),
    day_of_week         SMALLINT NOT NULL,
    period_id           UUID NOT NULL REFERENCES periods(id),
    room_id             UUID NOT NULL REFERENCES rooms(id),
    UNIQUE (timetable_id, lesson_requirement_id, day_of_week, period_id)
);

-- Fast conflict-checking indexes — critical for generator performance
CREATE INDEX idx_entries_teacher_slot ON timetable_entries (timetable_id, day_of_week, period_id);
CREATE INDEX idx_entries_room_slot ON timetable_entries (timetable_id, room_id, day_of_week, period_id);

-- ========== EXAMS ==========

CREATE TABLE exams (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    term_id         UUID NOT NULL REFERENCES terms(id),
    name            TEXT NOT NULL,                 -- "Mid-Term Exams"
    start_date      DATE NOT NULL,
    end_date        DATE NOT NULL
);

CREATE TABLE exam_sessions (                        -- "Day 1 Morning 08:00-10:00"
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    exam_id         UUID NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
    date            DATE NOT NULL,
    start_time      TIME NOT NULL,
    end_time        TIME NOT NULL,
    label           TEXT                            -- "Morning", "Afternoon"
);

CREATE TABLE exam_papers (                           -- one exam paper = one subject+grade
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    exam_id         UUID NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
    grade_id        UUID NOT NULL REFERENCES grades(id),
    subject_id      UUID NOT NULL REFERENCES subjects(id),
    duration_minutes INT NOT NULL DEFAULT 120
);

CREATE TABLE exam_placements (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    exam_paper_id   UUID NOT NULL REFERENCES exam_papers(id) ON DELETE CASCADE,
    session_id      UUID NOT NULL REFERENCES exam_sessions(id),
    room_id         UUID NOT NULL REFERENCES rooms(id),
    invigilator_id  UUID NOT NULL REFERENCES teachers(id)
);

-- ========== SUBSTITUTIONS (day-to-day, not generator output) ==========

CREATE TABLE substitutions (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    timetable_entry_id  UUID NOT NULL REFERENCES timetable_entries(id),
    date                DATE NOT NULL,
    absent_teacher_id   UUID NOT NULL REFERENCES teachers(id),
    covering_teacher_id UUID NOT NULL REFERENCES teachers(id),
    reason              TEXT
);

-- ========== SHARING / PUBLISHING ==========

CREATE TABLE timetable_shares (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    timetable_id    UUID NOT NULL REFERENCES timetables(id),
    scope_type      TEXT NOT NULL,      -- 'class' | 'teacher' | 'grade' | 'school'
    scope_id        UUID,               -- class_id / teacher_id / grade_id, null for school-wide
    pdf_url         TEXT,
    shared_at       TIMESTAMPTZ DEFAULT now(),
    shared_via      TEXT                -- email|sms|portal
);
```

### Key design notes
- `parallel_group_id` is what links "Sport – Group 1" and "Sport – Group 2" so the generator always places them in the same day+period, reproducing the dashed-line split cell in your reference image.
- `priority` drives the most-constrained-first ordering in the generator (Section 4.2) — a school computer lab with only 2 rooms should have `priority = 1` (place first), while a flexible subject with many free teachers can be `priority = 10`.
- `timetable_entries` is versioned via `timetables.version` — regenerating never overwrites a published timetable; it creates a new draft version.

---

## 3. Constraint Catalogue

### 3.1 Hard constraints (must NEVER be violated — reject any placement that breaks these)

| # | Constraint | Check |
|---|---|---|
| H1 | Teacher not double-booked | No two entries share `(timetable_id, teacher, day, period)` |
| H2 | Class/subgroup not double-booked | No two entries share `(timetable_id, class_id or student_group_id, day, period)` |
| H3 | Room not double-booked | No two entries share `(timetable_id, room_id, day, period)`, unless room explicitly allows co-use (e.g. shared gym under capacity) |
| H4 | Teacher availability respected | Slot not in `teacher_availability` with `status='unavailable'` |
| H5 | Room availability respected | Slot not in `room_availability` with `status='unavailable'` |
| H6 | Room type match | `room.room_type` matches `subject.requires_room_type` (or `lesson_requirements.room_id` is explicitly pinned) |
| H7 | Room capacity | `room.capacity >= class.student_count` (or subgroup size) |
| H8 | Parallel cards synced | All cards sharing a `parallel_group_id` occupy the identical `(day, period)` |
| H9 | Double-period contiguity | If `duration_periods = 2`, both consecutive periods must be free for teacher/class/room, and must not straddle a break |
| H10 | Weekly quota met | Every `lesson_requirement` has exactly `periods_per_week` entries placed by the time generation completes |

### 3.2 Soft constraints (scored — generator tries to minimize total penalty)

| # | Constraint | Typical weight |
|---|---|---|
| S1 | Teacher gaps (free period sandwiched between two teaching periods in a day) | High penalty per gap |
| S2 | Same subject appearing more than once a day for a class (unless double period intended) | Medium |
| S3 | Uneven spread of a subject's periods across the week (e.g. all 3 Math periods on Monday) | Medium |
| S4 | Heavy/cognitive subjects (Math, Sciences) scheduled late in the day | Low–Medium |
| S5 | Teacher's `preferred_free` slots used | High |
| S6 | Teacher daily load imbalance (e.g. 6 periods Monday, 1 period Tuesday) | Medium |
| S7 | Building-transfer time — consecutive periods for one teacher in different buildings without enough break time | High (Section 4.6) |
| S8 | First/last period avoided for a specific subject (admin-defined per-subject rule) | Low |

Weights should be configurable per school (a JSON `constraint_weights` config row), since priorities differ (a school offering many parallel labs will care more about S7/room contention than S4).

---

## 4. Generation Algorithm

This is a **Constraint Satisfaction Problem (CSP)** solved via greedy construction + backtracking + local-search optimization — the same family of algorithm aSc/FET-style engines use.

### 4.1 Pre-processing — "explode" requirements into placement units

```
for each lesson_requirement:
    create `periods_per_week` lesson instances
    if duration_periods == 2:
        pair them into double-period blocks (fewer, larger units)

group instances that share parallel_group_id into a single PlacementUnit
  (placing a unit means placing ALL its member cards atomically)
```

### 4.2 Ordering — most-constrained-first

Sort all `PlacementUnit`s by a constrainedness score (higher = place earlier):
```
score = 
    (1 / count_of_valid_teacher_free_slots) 
  + (requires_scarce_room_type ? +50 : 0)
  + (is_parallel_group ? +30 : 0)
  + (10 - lesson_requirements.priority)   -- lower priority number = harder = placed first
```
Placing the hardest-to-place lessons first (labs, split groups, teachers with few free slots) dramatically reduces backtracking later — this mirrors why aSc places "Sport" (2-teacher split) before flexible single-teacher subjects.

### 4.3 Greedy placement with backtracking

```
placed = []
queue = ordered PlacementUnits

function place_all(queue):
    if queue is empty: return SUCCESS
    unit = queue.pop_front()
    candidates = get_valid_slots(unit)   # checks H1–H9 against `placed`
    candidates = sort_by_soft_score(candidates)  # best S1–S8 score first

    for slot in candidates (try top-K, K ~ 5-10):
        tentatively place unit at slot
        placed.append(unit)
        if place_all(queue):
            return SUCCESS
        # backtrack
        placed.remove(unit)

    # no candidate worked — try backjumping:
    # remove the most recently placed CONFLICTING unit, requeue it, retry
    if backjump_possible:
        victim = find_conflicting_recent_unit(unit)
        placed.remove(victim)
        queue.push_front(victim)
        queue.push_front(unit)
        return place_all(queue)

    return FAILURE(unit)   # report exactly which lesson could not be placed and why
```

Practical limits: cap total backtracking attempts (e.g. 50,000) and total runtime (e.g. 30s) before falling back to reporting partial failure — never let generation hang indefinitely on a genuinely infeasible dataset (e.g. a teacher assigned more periods than slots exist in the week).

### 4.4 Local search / optimization pass (post-placement polish)

Once every unit has a hard-constraint-valid slot:

```
repeat for N iterations (e.g. 20,000) or until time budget exhausted:
    pick two placed units at random (or targeted: pick from units with worst local soft score)
    if swapping their (day, period, room) assignments is still hard-constraint-valid:
        compute soft_score_before and soft_score_after
        if soft_score_after < soft_score_before (lower penalty):
            accept swap
        else:
            accept with small probability (simulated annealing, probability decays over iterations)
            else revert
```
This is what turns a "technically valid but full of gaps" timetable into the clean, dense grid seen in the reference image.

### 4.5 Convergence & output

- Store final `score` (sum of soft penalties) on the `timetables` row.
- Persist every placed unit's member cards as rows in `timetable_entries`.
- If any unit failed to place (Step 4.3 FAILURE), set `timetables.status = 'failed'` and store a structured failure list — do not silently produce an incomplete timetable.

### 4.6 Building-transfer logic (matches aSc's 2026 "Building Transfer Assistant")

For any teacher with consecutive periods in `room_a.building != room_b.building`:
```
required_gap = building_transfer_minutes[building_a][building_b]  -- configurable matrix
available_gap = time_between(period_a.end_time, period_b.start_time)
if available_gap < required_gap:
    treat as soft violation (S7) unless a break period sits between them with
    break.duration >= required_gap, in which case it's fine
```

### 4.7 Failure reporting (critical for usability)

Never expose raw constraint-solver output to school admins. Translate failures into actionable messages:
```
"Could not place: Chemistry, Grade 10B, 3rd of 5 required periods.
 Reason: Teacher Mwangi has only 4 free periods this week but needs 5.
 Suggestion: Reduce periods_per_week, add a free slot, or reassign a period to another teacher."
```
Build this by tracing which hard constraint (H1–H9) blocked every failed candidate slot and picking the most frequent blocker as the primary reason.

---

## 5. Exam Timetable Logic (separate, simpler algorithm)

Exams don't need period-optimization — they need **conflict-free session assignment**, which is a graph-coloring problem.

### 5.1 Build the conflict graph
```
nodes = all exam_papers for this exam
edge(paper_A, paper_B) exists if any single student is enrolled in both
  (in practice: same grade+stream almost always conflicts; cross-grade electives need explicit student enrollment data)
```

### 5.2 Welsh-Powell greedy coloring
```
sort papers by degree (number of conflicts) DESCENDING
sessions_used = []
for paper in sorted_papers:
    for session in existing sessions_used (in order):
        if paper conflicts with no paper already in `session`:
            assign paper to session
            break
    else:
        create a new session, assign paper to it
```
This yields the minimum number of exam sessions needed with zero student double-bookings.

### 5.3 Room + invigilator assignment (same hard-constraint pattern as Section 3.1)
```
for each (paper, session) pair:
    assign room: capacity >= number of candidates sitting that paper, room not already used that session
    assign invigilator: teacher free that session, not teaching that subject (avoid conflict of interest, configurable), 
                         fairly rotate invigilation load across the staff list (track running total per teacher)
```

### 5.4 Output
Persist to `exam_placements`. PDF export follows the same rendering pipeline as class/teacher timetables (Section 6) but with exam-specific columns: Date, Session Time, Subject, Grade, Room, Invigilator.

---

## 6. PDF Generation (matching the aSc-style printed grid)

### 6.1 Shared data shape

Both class and teacher views pivot the **same** `timetable_entries` table — no separate generation logic needed:

```ts
type GridCell = {
  subject_code: string;
  teacher_initials?: string;   // shown on class view
  class_name?: string;         // shown on teacher view
  room_code: string;
  split?: {                    // present when parallel_group_id links >1 card in this slot
    group_label: string;       // "Group 1", "Boys"
    subject_code: string;
    teacher_initials: string;
    room_code: string;
  }[];
};

type TimetableGrid = {
  title: string;                       // "5.A" or teacher full name
  days: string[];                      // ["Mo","Tu","We","Th","Fr"]
  periods: { index: number; time_range: string }[];
  cells: Record<string, GridCell>;     // key = `${day}-${period_index}`
  generated_date: string;
  footer_label: string;                // "aSc Timetables" equivalent branding
};
```

- **Class view query:** `WHERE lesson_requirements.class_id = :classId`, group by day/period, and if two entries share the same `(day, period)` via `parallel_group_id`, nest them into `cell.split[]` (reproduces the dashed-line stacked cell for Sport/PE in your reference image).
- **Teacher view query:** `WHERE lesson_requirements.teacher_id = :teacherId`, same pivot, but `class_name` is shown instead of `teacher_initials` in each cell.

### 6.2 Rendering approach

Use **Puppeteer** (Express backend) to render an HTML/CSS table matching the exact printed layout, then export via `page.pdf()`:

```
Row 0: Period headers (index + time range), styled small, top-aligned
Column 0: Day labels ("Mo","Tu","We","Th","Fr"), large bold serif font — matches image
Cell: subject_code large + teacher_initials small colored (subjects.color_hex) + room_code bottom-right small
Split cell: two sub-rows separated by a horizontal dashed border, each with its own group_label, subject, teacher, room
Header: class/teacher name centered, large
Footer: "Timetable generated: <date>" bottom-left, product/school branding bottom-right
```

Alternative if you want to avoid a headless-browser dependency: `@react-pdf/renderer`, laying out a `<Grid>` of `<View>` cells — more setup work for split cells but avoids Puppeteer's memory footprint on the server.

### 6.3 Export endpoint behavior
- Render once, cache the PDF (S3/Cloudinary), store the URL on `timetable_shares.pdf_url`.
- Re-render only when the underlying `timetable_entries` change (new version) or a manual "regenerate PDF" action is triggered — don't regenerate on every download request.

---

## 7. API Design (Express)

```
POST   /api/terms/:termId/lesson-requirements        # bulk-create requirements (teacher, subject, class, periods/week, parallel links)
GET    /api/terms/:termId/lesson-requirements         # list/validate before generation

POST   /api/terms/:termId/timetables/generate          # kicks off generation (async job)
GET    /api/timetables/:id/status                      # poll: draft|generating|failed|published
GET    /api/timetables/:id/failures                    # structured list of unplaceable lessons (Section 4.7)

GET    /api/timetables/:id/grid?scope=class&id=:classId    # returns TimetableGrid JSON
GET    /api/timetables/:id/grid?scope=teacher&id=:teacherId

GET    /api/timetables/:id/pdf?scope=class&id=:classId     # streams/returns cached PDF URL
GET    /api/timetables/:id/pdf?scope=teacher&id=:teacherId

POST   /api/timetables/:id/publish                     # marks status=published, generates+caches all PDFs
POST   /api/timetables/:id/share                        # { scope_type, scope_id, via: 'email'|'sms' } -> creates timetable_shares row, dispatches

PATCH  /api/timetables/:id/entries/:entryId             # manual drag-and-drop override (re-validates H1-H9 before saving)

POST   /api/terms/:termId/exams                         # create exam + papers
POST   /api/exams/:examId/generate                       # runs Section 5 algorithm
GET    /api/exams/:examId/pdf?scope=grade&id=:gradeId
```

Generation should run as a **background job** (e.g. BullMQ + Redis, or a simple async worker) since a full-school timetable with backtracking can take several seconds to tens of seconds — never block the HTTP request thread.

---

## 8. Manual Editing & Substitutions

- After generation, admins need drag-and-drop editing on the grid. Every manual move must re-run the **hard constraint check (H1–H9)** for just that entry before saving — reject with a clear message if it breaks something ("Teacher Ma is already teaching 5.B at this time").
- Day-to-day teacher absences use the separate `substitutions` table — these do NOT alter `timetable_entries` (the master timetable stays intact); they're an overlay looked up by date when rendering "today's timetable" or sending daily notifications.

---

## 9. Sharing & Notifications

1. On `publish`, generate PDFs for every class and every teacher (loop scope, cache each).
2. `timetable_shares` records who received what and how — supports resend/audit.
3. Delivery channels:
   - **Email** (existing notification infra)
   - **SMS** via Africa's Talking (practical for Kenyan parents without reliable email/data)
   - **In-portal** — student/parent/teacher dashboard shows current published timetable + PDF download link, no push needed
4. Versioning: publishing a new version does not delete the old one (`timetables.version` increments) — old shares remain valid until explicitly archived, giving you an audit trail and rollback safety.

---

## 10. Validation Before Generation (pre-flight checks)

Run these checks and surface warnings **before** attempting generation — catches infeasibility early instead of wasting solver time:

- `SUM(periods_per_week)` per teacher `<=` teacher's `max_periods_per_week`
- `SUM(periods_per_week)` per class `<=` total available (non-break) periods per week
- Every `subject.requires_room_type` has at least one matching room with sufficient capacity
- Every `parallel_group_id` group has members with non-overlapping student sets (a student can't be required in two parallel groups at once)
- No teacher is double-assigned to overlapping `lesson_requirements` at the data-entry level

---

## 11. Suggested Build Order

1. Schema migration (Section 2) + seed data for one grade/class to test against
2. Lesson requirement CRUD (admin UI to define subjects/teachers/periods-per-week/splits)
3. Pre-flight validation (Section 10)
4. Core generator: hard constraints + greedy placement + backtracking (Section 4.1–4.3) — get a *valid* (if ugly) timetable first
5. Local search optimization pass (Section 4.4) — polish quality
6. Grid query endpoints (Section 6.1) + JSON rendering in the frontend (build the UI grid before PDF)
7. PDF export via Puppeteer (Section 6.2)
8. Publish/share workflow (Section 9)
9. Exam module (Section 5) — reuses rooms/teachers/PDF pipeline, independent algorithm
10. Manual editing + substitutions (Section 8) — last, since it depends on a stable generated timetable to edit

---

## 12. Performance Notes

- A mid-size Kenyan secondary school (~20 classes × ~10 subjects × ~5 periods/week ≈ 1,000 placement units) should generate in single-digit seconds with the greedy+backtrack approach — no need for heavier metaheuristics initially.
- If generation time becomes a bottleneck at scale, the next upgrade path is a proper CSP library (e.g. `google-ortools` CP-SAT solver, which has Node bindings) rather than hand-rolled backtracking — worth flagging as a v2 option, not needed for v1.
