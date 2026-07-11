# School Dashboard — Full UI & Logic Specification
### All Roles: Page Inventory, Components, Data, Actions & Business Rules

---

## HOW TO READ THIS DOCUMENT

For every page in every role's dashboard, five things are defined:
- **Purpose** — what problem this page solves
- **UI Components** — what's actually on the screen
- **Data Displayed** — what information populates it
- **Actions Available** — what the user can do
- **Logic & Rules** — the business logic governing behavior on that page

This is the complete site map + functional spec. Once this is locked, building the actual pages becomes a matter of implementation, not design decisions.

---

# 1. SUPER ADMIN DASHBOARD

### Sidebar Navigation
Overview · User Management · Audit Logs · System Settings · Roles & Permissions

---

## 1.1 Overview
**Purpose:** Single-glance system health check — the IT technician's morning check-in screen.

**UI Components:** Stat cards row, activity feed panel, user distribution chart, system alerts banner.

**Data Displayed:**
- Total users (broken down: Admins / Teachers / Finance / Students / Parents)
- Total fee collected this term vs. target
- System uptime / last backup timestamp
- Pending items count (grade approvals stuck >48hrs, unresolved payment mismatches from M-Pesa reconciliation)
- Last 5 audit log entries (account creations, role changes, failed login spikes)

**Actions Available:** Click through to any flagged item (jumps to relevant page), acknowledge/dismiss system alerts.

**Logic & Rules:**
- Alert banner triggers when: nightly M-Pesa reconciliation job finds mismatches, failed login attempts exceed threshold on any account, or a grade-approval request has sat unactioned past a configurable SLA (e.g. 48 hours).
- User distribution numbers pull live, not cached — this page should never show stale counts since it's the trust anchor for the whole system.

---

## 1.2 User Management
**Purpose:** Create, view, and manage every account in the system — the direct-override capability discussed in the auth spec.

**UI Components:** Role filter tabs (All / Admin / Teacher / Finance / Student / Parent), search bar, data table, "Create Account" button, per-row action menu.

**Data Displayed (table columns):** Name, Role, Email/Phone, Status (Active/Pending Activation/Suspended), Created By, Date Created, Last Login.

**Actions Available:**
- Create Account (opens role-specific form — see auth spec Section 3 for the exact fields/flow per role)
- Suspend / Reactivate an account
- Force password reset on any account
- View account detail (full profile + audit trail of that specific user)
- Impersonate/view-as (optional, high-risk feature — see note below)

**Logic & Rules:**
- Create Account form adapts fields based on role selected (Admin/Finance need employee ID + department; Student needs admission form fields + parent linkage; Parent needs phone verification).
- Suspend action requires a reason (stored, not optional) — feeds the audit trail.
- Super Admin can create any role directly (per the `canCreate()` guard from the auth spec) — this page is where that override capability actually lives in the UI.
- **Impersonate/view-as** should log a highly visible audit event and display a persistent banner while active ("Viewing as [user] — Super Admin session") — never allow silent impersonation, since it's an easy trust-breaker if discovered without disclosure.

---

## 1.3 Audit Logs
**Purpose:** Full accountability trail — answers "who did what, when" for any dispute (grade change disputes, payment disputes, unauthorized access concerns).

**UI Components:** Filterable table (by actor, action type, date range, target user), export button.

**Data Displayed:** Timestamp, Actor (who), Action (what — e.g. "GRADE_EDITED", "STUDENT_ADMITTED", "LOGIN_FAILED"), Target (affected record/user), IP address, Device/User-Agent.

**Actions Available:** Filter/search, export to CSV/PDF for offline record-keeping or board reporting, click into a log entry for full detail (before/after values on data changes).

**Logic & Rules:**
- Every write operation across the entire system (grade changes, fee record updates, account creation/suspension, timetable edits, approval decisions) writes here — this table is append-only, never editable or deletable, even by Super Admin.
- Retention: keep indefinitely or per the school's data policy — these logs are often the only evidence in a parent/staff dispute months later.

---

## 1.4 System Settings
**Purpose:** School-wide configuration that shouldn't be touched by day-to-day Admin users.

**UI Components:** Tabbed sections — School Info, Academic Calendar, Fee Structure, Feature Toggles, Integrations.

**Data Displayed / Editable:**
- School Info: name, logo, domain used for staff/student email generation, contact details
- Academic Calendar: term start/end dates, holiday dates (base data that populates the school calendar all roles see)
- Fee Structure: fee items per class/grade level (tuition, transport, lunch, activity, exam fee), payment plan templates, sibling discount rules
- Feature Toggles: on/off switches for M-Pesa payments, SMS notifications, CBC grading mode vs. numeric grading, newsletter module, assignment/quiz module
- Integrations: M-Pesa Daraja API credentials, SMS gateway (Africa's Talking) credentials, email service credentials — masked/redacted display, re-entry only

**Actions Available:** Edit any setting, save with confirmation dialog for high-impact changes (e.g. changing fee structure mid-term).

**Logic & Rules:**
- Changing the fee structure mid-term should NOT retroactively alter already-generated FeeRecords for current students — only apply to new admissions or the next term, unless explicitly confirmed as a retroactive change (with a warning about the impact).
- Feature toggle changes should log to Audit Logs, since disabling something like fee-gating system-wide is a major behavioral change everyone should be able to trace back.
- Integration credentials are never displayed in plaintext once saved — only "Connected" / "Not Connected" status shown, with a "Replace credentials" action.

---

## 1.5 Roles & Permissions
**Purpose:** Read-only (or carefully-gated editable) reference showing exactly what each role can and cannot do — useful for onboarding new Admin staff and for resolving "why can't I do X" support questions.

**UI Components:** Permission matrix table (Role × Feature grid, same structure as the earlier permission matrix document).

**Data Displayed:** Every feature in the system crossed against every role, showing Full Access / Read Only / No Access.

**Actions Available:** View only in v1. (Future: allow Super Admin to create custom permission overrides for edge cases — e.g., a senior teacher who also needs limited Finance visibility — but this adds real complexity and should be a deliberate v2 decision, not a default.)

**Logic & Rules:** This page should be generated FROM the actual permission-check logic in the codebase (single source of truth), not maintained as a separate document that can drift out of sync with what the system actually enforces.

---

# 2. ADMIN DASHBOARD

### Sidebar Navigation
Overview · Admissions · Staff & Students · Timetable Builder · Grade Approvals · Analytics · Newsletter

---

## 2.1 Overview
**Purpose:** Admin's daily operational snapshot.

**UI Components:** Stat cards, fee collection trend chart, recent admissions list, pending-approvals widget.

**Data Displayed:**
- New admissions this term
- Fee collection % (school-wide)
- Pending grade approvals count
- Today's school-wide attendance %
- Upcoming calendar events (next 7 days)

**Actions Available:** Click-through to any widget's full page.

**Logic & Rules:** Same real-time principle as Super Admin overview — no cached/stale stats, since Admin uses this to decide where to spend their day.

---

## 2.2 Admissions
**Purpose:** The core Admin workflow — onboarding a new student and their parent together in one motion (per the auth spec's `admitStudent` flow).

**UI Components:** Multi-step form (Student Bio Data → Parent/Guardian Details → Class Placement → Document Upload → Fee Plan Assignment → Review & Submit), progress indicator, recent admissions table below the form.

**Data Displayed (form fields):**
- Student: full name, date of birth, gender, previous school, medical notes/allergies, class/grade placement
- Parent/Guardian: name, phone (primary login identifier), email (optional), relationship, national ID, secondary guardian (optional)
- Documents: birth certificate upload, previous report card upload, passport photo
- Fee plan: which fee structure applies (based on class), payment plan selection (full term / installments)

**Actions Available:** Save as draft (incomplete admission), Submit (finalizes and creates accounts), view/edit a recently admitted student's record.

**Logic & Rules:**
- On submit: triggers the full `admitStudent` logic from the auth spec — generates student email + admission number, checks for existing parent by phone (sibling case, auto-links instead of duplicating), creates initial FeeRecord, sends credentials via SMS to parent.
- Duplicate detection: if a submitted National ID or phone number for the parent already exists, system prompts "This parent already has an account — link this student to it?" rather than silently creating a duplicate parent record.
- Class placement determines which Timetable and which Fee Structure the student is automatically enrolled into — this is a cascading effect, not a manual second step.

---

## 2.3 Staff & Students
**Purpose:** Ongoing management of Teacher and Finance accounts, plus a searchable view of the full student roster (view/edit, not creation — creation happens via Admissions).

**UI Components:** Tabs (Teachers / Finance / Students), search + filter (by class, status), data table, "Add Teacher"/"Add Finance" buttons.

**Data Displayed:**
- Teachers: Name, Subjects taught, Classes assigned, Status, Email
- Finance: Name, Email, Status
- Students: Name, Admission No., Class, Fee Status badge, Parent linked, Status (Active/Graduated/Transferred)

**Actions Available:** Create Teacher/Finance account (per auth spec 3.2), edit staff details, suspend/reactivate, assign/reassign a teacher to subjects and classes, view a student's full profile (links to their grades, attendance, fee history — read view for Admin).

**Logic & Rules:**
- Creating a Teacher requires assigning at least one subject + class before the account is marked fully set up — an "orphaned" teacher account with no assignments should show a clear warning badge ("Not yet assigned to any class").
- Student status change to "Graduated" or "Transferred" triggers deactivation logic (per auth spec Section 6.5) — never a hard delete.

---

## 2.4 Timetable Builder
**Purpose:** Create and maintain the master weekly timetable, assigned per class/stream, automatically visible to every enrolled student and assigned teacher.

**UI Components:** Weekly grid (Days × Periods), drag-or-click-to-assign slot editor, class/stream selector, conflict warning modal.

**Data Displayed:** Current timetable grid for the selected class, showing subject + teacher per slot; a separate "Teacher View" toggle to check a specific teacher's full week across all their classes.

**Actions Available:** Add/edit/remove a lesson slot, assign teacher + subject + room to a slot, publish changes (push live to all affected student/teacher dashboards).

**Logic & Rules:**
- Clash detection runs on every slot save: checks teacher double-booking, class double-booking, and room double-booking (if rooms are tracked) — save is blocked with a specific conflict message until resolved, not just a generic error.
- A single timetable write should cascade to every enrolled student in that class and the assigned teacher — Admin does this once, not once per student.
- Changes to a published timetable should notify affected teachers (in-app + optionally SMS) since a shifted lesson time is disruptive if discovered only by showing up at the wrong time.

---

## 2.5 Grade Approvals
**Purpose:** The approval checkpoint for any teacher's post-publish grade edit (per the grade-edit-approval workflow in the first spec document).

**UI Components:** Queue table (pending items first), detail panel per request (old value vs. new value side-by-side), Approve/Reject buttons with mandatory reason field on reject.

**Data Displayed:** Student, Subject, Original Grade, Requested New Grade, Teacher who requested it, Reason given by teacher, Date requested, Days pending.

**Actions Available:** Approve (grade goes live, student/parent notified), Reject (reverts to original, teacher notified with the rejection reason), bulk-approve for low-risk cases (optional, use cautiously).

**Logic & Rules:**
- Directly mirrors the state machine from the first spec doc: `PENDING_APPROVAL → PUBLISHED` (approve) or `PENDING_APPROVAL → PUBLISHED` reverted (reject).
- SLA tracking: items pending >48hrs surface on the Admin Overview page as a flagged item.
- Every decision writes to the Grade Audit Log with Admin's ID as approver, timestamp, and reason if rejected.

---

## 2.6 Analytics
**Purpose:** Performance and operational insight for decision-making — board reporting, identifying weak subjects/classes, tracking collection trends.

**UI Components:** Chart dashboard — performance trend by class/subject over terms, attendance heatmap, fee collection trend, comparison views (this term vs. last term).

**Data Displayed:** Average scores by subject/class/term, attendance % trends, chronic absentee list, fee collection rate over time, teacher-level performance patterns (aggregate, not punitive framing).

**Actions Available:** Filter by term/class/subject, export charts/reports as PDF for board meetings.

**Logic & Rules:**
- All analytics are computed from the same underlying Grade/Attendance/FeeRecord tables Teachers/Finance write to — no separate manually-maintained analytics dataset, or it will drift from reality.
- Performance comparisons should always show trend direction (up/down vs. prior term), not just a static snapshot — that's what makes it actionable for a board meeting.

---

## 2.7 Newsletter
**Purpose:** Reduce paper waste, communicate directly and traceably with parents.

**UI Components:** Composer (subject, rich-text body, audience selector), send button, delivery history table.

**Data Displayed (composer):** Audience targeting options — All Parents / Specific Class or Stream / Parents with Outstanding Balances / Custom selection.

**Actions Available:** Compose and send immediately, schedule for later, save as draft, view delivery history (sent, opened where trackable, failed).

**Logic & Rules:**
- Sends via email primarily, with an option to mirror as SMS for high-priority items (e.g. urgent closure notice) — email alone has known low open rates for this audience, per the Kenya-context notes from the first spec doc.
- Delivery Log records recipient count, delivery success/failure per recipient — needed when a parent claims "I never got that notice."
- Targeting "Parents with Outstanding Balances" pulls live from FeeRecord data — never a manually curated list that goes stale.

---

# 3. TEACHER DASHBOARD

### Sidebar Navigation
Overview · My Timetable · Gradebook · Attendance · Assignments & Quizzes · Calendar

---

## 3.1 Overview
**Purpose:** Teacher's daily working view.

**UI Components:** Today's lesson list (time-ordered), pending-tasks widget, quick stats.

**Data Displayed:** Today's schedule (subject, class, time, room), attendance not-yet-marked count for today's completed lessons, ungraded submission count, average score across their classes this term.

**Actions Available:** Jump directly into "mark attendance" or "grade submissions" from the pending-tasks widget.

**Logic & Rules:** "Attendance not yet marked" should only flag lessons that have already occurred (by time), not future lessons — avoid nagging a teacher about a class that hasn't happened yet.

---

## 3.2 My Timetable
**Purpose:** Read view of the teacher's own weekly schedule across all assigned classes.

**UI Components:** Weekly grid, filterable by class if the teacher handles many streams.

**Data Displayed:** Subject, class, time, room, per slot — sourced from the same master timetable Admin builds (Section 2.4), filtered to this teacher's assignments only.

**Actions Available:** View only — Teachers cannot edit the timetable, only Admin can.

**Logic & Rules:** Always reflects the live/published timetable; any Admin edit appears here immediately, with a "recently changed" indicator on slots modified in the last 48 hours.

---

## 3.3 Gradebook
**Purpose:** Post and edit grades, with the edit-approval constraint always enforced.

**UI Components:** Class/subject selector, gradebook table (students as rows, assessment columns), inline editing, "Publish" button, status badges per entry.

**Data Displayed:** Student name, CAT scores, exam score, computed total, current status (Draft / Published / Pending Approval).

**Actions Available:**
- Enter new grades (Draft state) and Publish them
- Edit a Published grade → automatically creates a Pending Approval request rather than changing the live value
- View history of previous edits/approvals for any student's grade entry

**Logic & Rules:**
- Directly implements the grade state machine from the first spec document: `DRAFT → PUBLISHED → (edit) → PENDING_APPROVAL → PUBLISHED (approved/reverted)`.
- Teachers see a clear visual distinction between what's currently live (what students/parents see) and what's awaiting approval — never ambiguous.
- No delete button exists for Teachers at all — only "Request Correction," which routes to Admin.
- For CBC-mode classes, the gradebook shows competency levels (EE/ME/AE/BE) per strand instead of numeric columns — the UI adapts based on the grading mode set in System Settings.

---

## 3.4 Attendance
**Purpose:** Mark attendance per lesson, feeding both student-level and school-wide attendance tracking.

**UI Components:** Lesson selector (auto-defaults to current time-slot lesson), class roster list with Present/Absent/Late toggle per student, "Mark all present" bulk action, submit button.

**Data Displayed:** Student roster for the selected lesson/class.

**Actions Available:** Mark each student's status, submit for the lesson, view past attendance records for a class.

**Logic & Rules:**
- On submit, the system runs the absence-pattern check described in the first spec doc: 3+ consecutive absences or <75% monthly attendance triggers an auto-flag to Admin and a notification to the parent.
- Attendance for a given lesson can only be submitted once per day per class — resubmission should be an explicit "edit today's attendance" action, not a silent overwrite, to preserve a clean audit trail.

---

## 3.5 Assignments & Quizzes
**Purpose:** Create, distribute, and grade coursework outside the formal exam gradebook.

**UI Components:** "Create Assignment/Quiz" form (title, class, instructions, due date, question builder for quizzes), assignment list, submissions view per assignment, grading interface.

**Data Displayed:** List of created assignments/quizzes with submission counts (e.g. "18/25 submitted"), per-student submission content, grading status.

**Actions Available:** Create/edit an assignment (before any submissions exist — after that, edits should be restricted to avoid unfairness), grade submissions (auto-grade for MCQ, manual for open-ended), release grades to students.

**Logic & Rules:**
- MCQ/objective questions auto-score on submission; essay/open-ended questions queue into a "needs grading" list for the teacher.
- Grades from assignments/quizzes feed into the overall gradebook only if the teacher explicitly marks them as "counts toward term grade" — not every quiz should silently affect the formal report card.

---

## 3.6 Calendar
**Purpose:** View school-wide events and term dates (read-only, same data Admin manages).

**UI Components:** Month/week calendar view, event list sidebar.

**Data Displayed:** Term dates, holidays, school events, exam schedules — all sourced from Admin/System Settings.

**Actions Available:** View only.

**Logic & Rules:** This page is never fee-gated for any role — calendar visibility should never be tied to payment status (per the earlier fee-gating design principle: gate narrowly).

---

# 4. FINANCE DASHBOARD

### Sidebar Navigation
Overview · Fee Records · Record Payment · Reports

---

## 4.1 Overview
**Purpose:** Finance officer's daily snapshot of collection status.

**UI Components:** Stat cards (Total Collected This Term, Fully Paid count, Partial count, Unpaid count), collection trend chart, pie chart of payment status distribution.

**Data Displayed:** Real-time aggregates across all active students' FeeRecords.

**Actions Available:** Click through to filtered Fee Records view (e.g. clicking "Unpaid" jumps straight to that filtered list).

**Logic & Rules:** These numbers must match exactly what Fee Records shows when filtered — no separate cached summary that can drift from the underlying transaction data.

---

## 4.2 Fee Records
**Purpose:** The core Finance workflow — see exactly who has paid, who hasn't, and who's partial.

**UI Components:** Filter tabs (All / Paid / Partial / Unpaid), search by student name/admission number/class, data table, per-row detail expand.

**Data Displayed:** Student, Admission No., Class, Total Billed, Amount Paid, Balance, % Cleared, Last Payment Date, Payment Method breakdown.

**Actions Available:** View full transaction history for a student, initiate a "prompt parent" action (sends an SMS reminder), jump to Record Payment pre-filled for that student.

**Logic & Rules:**
- Status classification: `Paid` = 100% cleared, `Partial` = >0% and <100%, `Unpaid` = 0% paid — computed live from FeeRecord, never manually tagged.
- "Prompt Parent" sends a templated SMS with the current balance and a payment link/instructions — logs the reminder in that student's transaction history so Finance can see reminder history, not just payments.

---

## 4.3 Record Payment
**Purpose:** Log a manual payment (bank deposit, office cash/cheque payment) that didn't come through the M-Pesa STK Push flow.

**UI Components:** Student search/select, amount field, payment method selector (Bank Transfer / Cash / Cheque), receipt/reference number field, date field, submit button, recent manual entries table below.

**Data Displayed:** Recently recorded manual payments (for Finance's own reference/audit).

**Actions Available:** Submit a new manual payment record.

**Logic & Rules:**
- On submit: creates a FeeTransaction record (source: MANUAL, recordedBy: Finance user ID), updates the student's FeeRecord.amountPaid, and re-triggers the access-check logic (Section 3.1 of the auth/fee spec) — if this payment crosses the 50%/100% threshold, the student's grades/timetable/certificate access unlocks immediately, same as an M-Pesa payment would.
- Receipt/reference number is mandatory and should be checked for duplicates (prevents accidental double-entry of the same bank slip).
- This action is logged to Audit Logs with full detail — money-related entries deserve extra traceability given how often "I paid but it's not showing" disputes happen.

---

## 4.4 Reports
**Purpose:** Term-end and ad-hoc financial reporting.

**UI Components:** Report type selector (Collection Summary / Outstanding Balances / Payment Method Breakdown / Class-wise Collection), date range filter, export button.

**Data Displayed:** Aggregated financial data per selected report type, presented as both chart and exportable table.

**Actions Available:** Generate report, export as PDF/Excel for board or auditor use.

**Logic & Rules:** Reports should be regenerable for any past term/date range — Finance will regularly need to answer "what did we collect last term" months after the fact, so this can't only show current-term data.

---

# 5. PARENT DASHBOARD

### Sidebar Navigation
Overview · Fees & Payment · Grades · Timetable · Attendance · Calendar

---

## 5.1 Overview
**Purpose:** Parent's home screen — especially important since a parent may have multiple children.

**UI Components:** Child selector (tabs or dropdown if more than one linked student), per-child summary cards.

**Data Displayed (per selected child):** Fee balance + % cleared, attendance %, latest grade summary (if unlocked), upcoming events.

**Actions Available:** Switch between children, click through to any detail page (scoped to the currently selected child).

**Logic & Rules:**
- The child selector persists across the whole session — once a parent selects "Child A," every subsequent page (Fees, Grades, Timetable) stays scoped to Child A until they switch, rather than asking them to reselect on every page.
- If a fee balance exists, a prominent "Pay Now" call-to-action appears here regardless of which child is selected — this is the highest-value nudge on the whole dashboard.

---

## 5.2 Fees & Payment
**Purpose:** The parent-facing side of the M-Pesa payment flow — this is the single most important page in the entire system for solving the original "parents can't get to the bank" problem.

**UI Components:** Fee statement breakdown (itemized: tuition, transport, lunch, activity, exam fee), balance summary, amount input, "Pay via M-Pesa" button, payment history table, downloadable receipt per transaction.

**Data Displayed:** Full itemized bill for the current term, amount paid to date, remaining balance, full payment history across terms.

**Actions Available:** Enter an amount and trigger M-Pesa STK Push, view/download past receipts, view a full statement for any previous term.

**Logic & Rules:**
- Directly implements the M-Pesa payment flow from the first spec document: STK Push triggered → Daraja callback confirms → FeeRecord updates → access re-check runs → SMS+email receipt sent.
- If payment fails/times out, the UI should clearly show "Payment not completed" and offer an immediate retry — never leave the parent uncertain whether it went through.
- Partial payment is always allowed unless the school's fee structure enforces a minimum (configurable in System Settings).

---

## 5.3 Grades
**Purpose:** View the selected child's academic performance — fee-gated.

**UI Components:** If unlocked: subject-by-subject grade table (or CBC competency view), term-over-term trend. If locked: a locked-state banner explaining exactly why and how to unlock it.

**Data Displayed (when unlocked):** Published grades only (never Pending Approval values) per subject, per term, with teacher comments if provided.

**Actions Available (when locked):** "Pay Now" button that jumps directly to Fees & Payment, pre-scoped to the selected child.

**Logic & Rules:**
- Directly implements the `checkAccess()` function from the first spec document: 50% threshold for ongoing students, 100% for final-year/completing students.
- The locked-state message states the exact current balance and exact amount needed to unlock — not a vague "fees pending" message, since specificity is what actually drives the parent to act.

---

## 5.4 Timetable
**Purpose:** View the selected child's weekly lesson schedule — fee-gated, same threshold logic as Grades.

**UI Components:** Same weekly grid used elsewhere, or locked-state banner.

**Data Displayed:** Subject, teacher, time, room per lesson slot for the child's class.

**Actions Available:** View only when unlocked; "Pay Now" CTA when locked.

**Logic & Rules:** Same `checkAccess("TIMETABLE")` logic — note that for a student marked `COMPLETED` (graduated/left), this page shows a neutral "No longer applicable" state rather than a locked/payment-prompt state, since gating a leaver toward payment for a timetable they'll never use again doesn't make sense (only Grades/Certificates should still gate for leavers, per the original design).

---

## 5.5 Attendance
**Purpose:** View the selected child's attendance record — never gated.

**UI Components:** Calendar heatmap or monthly table, attendance % summary, absence reason notes if a teacher/admin logged one.

**Data Displayed:** Present/Absent/Late per school day, monthly and term aggregate %.

**Actions Available:** View only; filter by month/term.

**Logic & Rules:** Never fee-gated — per the design principle that punitive gating should stay narrow (grades, timetable, certificates only).

---

## 5.6 Calendar
**Purpose:** View school events and term dates — never gated.

**UI Components / Data / Actions:** Same as Teacher's Calendar page (Section 3.6), read-only.

---

# 6. STUDENT DASHBOARD

### Sidebar Navigation
Overview · Grades · Timetable · Fees · Assignments · Calendar

---

## 6.1 Overview
**Purpose:** Student's home screen.

**UI Components:** Stat cards (attendance %, fee balance, latest grade average if unlocked), today's lesson list (if unlocked), pending assignment count.

**Data Displayed:** Same scope as the Parent Overview but for the logged-in student only (no child-switching, obviously).

**Actions Available:** Click through to detail pages.

**Logic & Rules:** If grades/timetable are locked, this page shows the same locked-state messaging pattern as the Parent dashboard, with a note that a parent can complete the payment on their end too — since the student themselves usually can't pay.

---

## 6.2 Grades
**Purpose:** View own academic performance — fee-gated, identical logic to Parent's Grades page (Section 5.3), scoped to self.

---

## 6.3 Timetable
**Purpose:** View own weekly lesson schedule — fee-gated, identical logic to Parent's Timetable page (Section 5.4), scoped to self.

---

## 6.4 Fees
**Purpose:** View own fee statement and balance. Whether a Student can also *initiate* payment (vs. view-only, with Parent doing the actual paying) is a product decision worth locking down explicitly.

**UI Components:** Same itemized statement as Parent's Fees page.

**Actions Available:** View always. Payment initiation — recommend allowing it for older/independent students (e.g. upper secondary) but defaulting to view-only for younger grade levels, configurable per class/grade level in System Settings.

**Logic & Rules:** Same underlying FeeRecord and payment logic as Parent's Fees page — whichever party (student or parent) initiates payment, the same `checkAccess()` re-evaluation and receipt logic applies identically.

---

## 6.5 Assignments
**Purpose:** View and submit coursework assigned by teachers.

**UI Components:** List of assignments/quizzes (grouped by status: Not Started / Submitted / Graded), submission interface, grade + teacher feedback view once released.

**Data Displayed:** Assignment title, subject, due date, instructions, own submission status, grade + feedback (once the teacher releases it).

**Actions Available:** Submit work (text entry, file upload, or quiz answers depending on type), view feedback once graded.

**Logic & Rules:**
- Never fee-gated — coursework and assignments stay accessible regardless of fee status, since gating this too would be punitive toward ongoing schoolwork, not just toward end-of-term deliverables (grades/timetable/certificates).
- Late submissions should be clearly flagged (visually distinct) but not blocked outright unless the teacher explicitly closes the assignment.

---

## 6.6 Calendar
**Purpose:** View school events and term dates — never gated. Same as Teacher/Parent Calendar pages.

---

# 7. CROSS-ROLE SYSTEM LOGIC — HOW IT ALL CONNECTS

This section ties the individual pages above back to the shared logic engines that run underneath all of them, so the whole system reads as one coherent machine rather than six separate apps.

**One fee-gating engine, checked everywhere:** Admin's Fee Approvals aren't a thing — but every page that reads Grades or Timetable (Parent 5.3/5.4, Student 6.2/6.3) calls the same `checkAccess()` logic. Change the threshold once in System Settings, and it applies everywhere instantly — no page has its own hardcoded copy of "50%."

**One grade state machine, three different views of it:** Teacher's Gradebook (3.3) writes to it, Admin's Grade Approvals (2.5) governs its transitions, and Parent/Student Grades pages (5.3/6.2) only ever read the `PUBLISHED` state. No page bypasses this chain — even Admin's own edits should route through the same approval logging for consistency, even if Admin can self-approve instantly.

**One timetable, cascading to many dashboards:** Admin builds it once (2.4); Teacher's My Timetable (3.2), Parent's Timetable (5.4), and Student's Timetable (6.3) are all filtered reads of the same underlying data — never separately maintained copies.

**One attendance pipeline, feeding three different alerts:** Teacher marks it (3.4) → feeds the student's own attendance view (Parent 5.5, Student equivalent), feeds Admin's Analytics (2.6), and triggers the absence-pattern alert to both Admin and Parent automatically. One write, three read-surfaces, one alerting rule.

**One payment engine, two entry points:** Whether a payment comes through Parent/Student's "Pay via M-Pesa" (5.2/6.4) or Finance's manual "Record Payment" (4.3), both funnel into the exact same FeeTransaction → FeeRecord update → access re-check → receipt/notification chain. Finance never needs a "sync" step because there's no second source of truth to reconcile against — there's one FeeRecord per student, written to by two different front doors.

**One audit log, written by everyone:** Every creation, edit, approval, payment, and login event across every role above writes to the same Audit Log (Super Admin 1.3). This is what makes the system defensible when disputes come up — and it's why nearly every "Logic & Rules" section above ends with some version of "this writes to the audit trail."
