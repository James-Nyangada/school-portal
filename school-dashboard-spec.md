# School Management Dashboard — System Specification
### Structural, Logic & Flow Document

---

## 1. THE REAL PROBLEMS (Kenya-specific)

Before features, here's what actually breaks in Kenyan schools (private and public) that your competitors (mostly clunky desktop software like SchoolMaster, or manual Excel) don't solve well:

| Problem | Why it hurts | Who feels it |
|---|---|---|
| Fee payment requires physical bank visit or queuing at school office | Parents in rural areas lose a workday; school loses cash-flow visibility | Parents, Finance |
| No real-time balance visibility | Parents don't know exact balance until they show up; disputes over "I paid but it's not showing" | Parents, Finance |
| Fee statements done manually per student | Finance officer spends hours generating statements at term-end | Finance |
| No automated reminders before fee deadlines | Schools rely on gate-barring students, which is legally and ethically messy | Admin, Finance, Parents |
| Report cards compiled manually in Excel/Word | Teachers spend a full week at term-end doing this instead of teaching | Teachers |
| No CBC (Competency Based Curriculum) support | Most new systems are still built for old 8-4-4 grading; Kenya has moved to CBC with strand/sub-strand competency levels (EE, ME, AE, BE) not just marks | Teachers, Admin |
| Attendance tracked on paper registers | No pattern detection (chronic absenteeism goes unnoticed until it's a crisis) | Teachers, Admin, Parents |
| Parents have zero visibility into day-to-day school life | Parent only hears from school when there's a problem or a fee reminder | Parents |
| No clash detection in timetabling | Teacher double-booked, or a class has two lessons in one slot — done manually | Admin |
| Newsletters/communication via WhatsApp groups only | Info gets buried, no record, no way to target specific classes/streams | Admin |
| No M-Pesa reconciliation | Someone manually cross-checks M-Pesa statement against fee records | Finance |
| Certificates/leaving letters withheld informally | No systemic way to enforce "clear fees before final documents released" — done via gut feeling/politics | Admin, Finance |
| No sibling/family view | A parent with 3 kids in the school has to check 3 different times | Parents |
| No installment/payment plan structure | Some parents pay per week/month informally — untracked | Finance |

Your instinct on fee-gating grades/timetable is correct and is actually one of the most requested features by Kenyan private schools. Let's formalize it.

---

## 2. ROLE × PERMISSION MATRIX

| Feature | Student | Teacher | Admin | Finance | Super Admin |
|---|:---:|:---:|:---:|:---:|:---:|
| View own grades (fee-gated) | ✅ | — | — | — | ✅ |
| Post/edit grades | — | ✅ (edit needs approval) | ✅ (direct edit) | — | ✅ |
| Delete grades | — | - | ❌ (soft-delete only, audit logged) | — | ✅ (audit logged) |
| View timetable | ✅ (fee-gated) | ✅ | ✅ | — | ✅ |
| Create/edit timetable | — | — | ✅ | — | ✅ |
| Mark attendance | — | ✅ | ✅ (view + override) | — | ✅ |
| View attendance | ✅ (own) | ✅ (own classes) | ✅ (all) | — | ✅ |
| Pay fees | ✅ (on behalf via parent login) | — | — | — | — |
| View fee status (own) | ✅ | — | — | — | — |
| View fee status (all students) | — | — | ✅ (read) | ✅ (full) | ✅ |
| Record manual receipt (bank/office payment) | — | — | — | ✅ | ✅ |
| Create/grade assignments & quizzes | — | ✅ | ✅ | — | ✅ |
| Admit new student | — | — | ✅ | — | ✅ |
| View school analytics | — | — | ✅ | ✅ (financial only) | ✅ |
| Send newsletter/bulk comms | — | — | ✅ | — | ✅ |
| Approve grade edits | — | — | ✅ | — | ✅ |
| Manage users/roles | — | — | ❌ | — | ✅ |
| System configuration | — | — | ❌ | — | ✅ |
| Release final certificates/leaving docs | — | — | ✅ (fee-gated) | ✅ (confirms) | ✅ |

---

## 3. CORE LOGIC & ALGORITHMS

### 3.1 Fee-Gated Access Control (the heart of your system)

This should NOT be scattered `if` checks across your codebase — build it as a **single middleware/service** every protected route calls.

```
FUNCTION checkAccess(studentId, resourceType):
    student = getStudent(studentId)
    feeRecord = getFeeRecord(studentId, currentTerm)
    
    percentPaid = (feeRecord.amountPaid / feeRecord.totalBilled) * 100
    isCompleter = student.status == "COMPLETED" OR student.isFinalYear == true
    
    SWITCH resourceType:
        CASE "GRADES":
            IF isCompleter:
                RETURN percentPaid >= 100  // full clearance for leavers/final exams
            ELSE:
                RETURN percentPaid >= 50   // ongoing students, 50% threshold
        
        CASE "TIMETABLE":
            IF isCompleter:
                RETURN false  // no longer relevant, they've completed
            ELSE:
                RETURN percentPaid >= 50
        
        CASE "CERTIFICATE" OR "LEAVING_LETTER" OR "TRANSCRIPT":
            RETURN percentPaid >= 100  // ALWAYS full clearance, no exceptions
        
        CASE "CALENDAR", "ASSIGNMENTS_VIEW", "ATTENDANCE_VIEW":
            RETURN true  // never gate these - gating everything breeds resentment
    
    RETURN false
```

**Key design decisions embedded here:**
- **Don't gate everything.** Only gate grades, timetable, and final documents. If you lock out the calendar or attendance too, parents feel punished rather than reminded — this creates bad will. Keep the gate narrow and clearly tied to academic deliverables.
- **Show the gate, don't hide the feature.** When locked, don't just hide the "Grades" tab. Show it grayed out with: *"Grades locked — clear 100% of Term [x] fees to unlock. Current balance: KES [xxxxx]. [Pay Now]"* This converts the block into a payment prompt instead of a dead end.
- **Recompute in real time.** The moment a payment posts (M-Pesa callback or Finance-recorded receipt), re-run this check and unlock immediately — don't make the parent wait for a batch job.

### 3.2 Grade Publishing & Edit-Approval Workflow

```
STATE MACHINE for a Grade record:

DRAFT ──(teacher submits)──> PUBLISHED
PUBLISHED ──(teacher edits)──> PENDING_APPROVAL (original value frozen, shown to students until approved)
PENDING_APPROVAL ──(admin approves)──> PUBLISHED (new value live, old value archived)
PENDING_APPROVAL ──(admin rejects)──> PUBLISHED (reverts to original, teacher notified with reason)

RULES:
- Teachers can NEVER hard-delete. "Delete" by a teacher = request sent to admin.
- Every state transition writes to an immutable audit log:
  { gradeId, previousValue, newValue, changedBy, timestamp, reason, approvedBy }
- Students always see the currently PUBLISHED value — never PENDING values.
- Admin dashboard shows a queue: "3 grade changes awaiting your approval"
```

For **CBC compliance**, structure grades as competency-based, not just numeric:

```
GradeEntry {
    studentId
    subjectId
    strand          // e.g. "Number Operations"
    subStrand       // e.g. "Fractions"
    competencyLevel // EE (Exceeding), ME (Meeting), AE (Approaching), BE (Below)
    teacherComment
    term
    assessmentType  // formative / summative
}
```

### 3.3 Fee Payment Flow (M-Pesa-first, this is your biggest value-add)

This is the single feature that will sell this system to Kenyan schools. Build it around **M-Pesa Daraja API (STK Push)** since that's how 90%+ of Kenyan parents will actually pay.

```
FLOW: Parent pays fees via dashboard

1. Parent logs in (parent account linked to 1+ student profiles — sibling support)
2. Selects student → sees fee statement:
     Total Billed | Amount Paid | Balance | % Cleared
3. Parent enters amount to pay (full or partial)
4. System triggers STK Push to parent's phone via Daraja API
     - Reference: STUDENT_ADM_NO + TERM (e.g. "ADM2024-101-T2")
5. Parent enters M-Pesa PIN on their phone
6. Daraja sends async callback to your webhook endpoint:
     - success/failure, MpesaReceiptNumber, amount, phone, timestamp
7. ON SUCCESS:
     a. Create FeeTransaction record (status: CONFIRMED, source: MPESA)
     b. Update FeeRecord.amountPaid += amount
     c. Re-run checkAccess() → unlock grades/timetable if threshold crossed
     d. Send SMS + email receipt to parent (via Africa's Talking or similar SMS gateway)
     e. Push notification to Finance dashboard: "New payment: KES X from [Student]"
8. ON FAILURE/TIMEOUT:
     - Log attempt, show parent clear retry option, DO NOT update balance
9. RECONCILIATION SAFETY NET:
     - Nightly job pulls M-Pesa statement (via Daraja transaction status API) 
       and cross-checks against FeeTransaction records
     - Flags any mismatches for Finance review (catches callback failures)
```

**Also support manual bank/office payments** (some parents will always prefer this):
```
Finance records:
  { receiptNumber, bankSlipRef, amount, datePaid, recordedBy, studentId }
→ Same downstream effect: updates FeeRecord, triggers checkAccess(), sends receipt.
```

**Fee structure should support:**
- Termly fee items broken down (tuition, transport, lunch, activity fee, exam fee) — parents want to see *what* they're paying for, not just one lump number
- Payment plans/installments with due dates, so partial payment isn't just "whatever you send" but tracked against agreed milestones
- Sibling discounts applied automatically at billing time
- Carry-forward balances/overpayments across terms automatically

### 3.4 Attendance Flow

```
FLOW: Teacher marks attendance

1. Teacher opens today's timetable → selects current lesson (auto-detected by time slot)
2. Class roster loads → mark Present/Absent/Late per student (bulk "mark all present" + exceptions)
3. On submit:
     a. AttendanceRecord created per student per lesson
     b. Real-time aggregation job updates:
        - Student's personal attendance % (visible to student + parent)
        - Class attendance summary (visible to admin)
     c. THRESHOLD CHECK: if student's absence streak >= 3 consecutive days
        OR monthly attendance < 75%, auto-flag to Admin + notify parent (SMS)
4. Admin dashboard shows: attendance heatmap by class, chronic absentee list
```

This absence-pattern alerting is something almost no Kenyan school system does well — it's a genuine differentiator.

### 3.5 Timetable Creation with Clash Detection

```
FUNCTION createTimetableSlot(teacherId, classId, subjectId, day, timeSlot):
    conflicts = []
    
    IF teacherHasSlot(teacherId, day, timeSlot):
        conflicts.append("Teacher already booked at this time")
    
    IF classHasSlot(classId, day, timeSlot):
        conflicts.append("Class already has a lesson at this time")
    
    IF roomRequired AND roomHasSlot(roomId, day, timeSlot):
        conflicts.append("Room already in use")
    
    IF conflicts.length > 0:
        RETURN { success: false, conflicts }
    ELSE:
        saveSlot()
        notifyTeacher(teacherId)
        RETURN { success: true }
```

Timetable should cascade correctly: **Admin creates → assigned per class/stream → auto-appears on every enrolled student's dashboard AND the assigned teacher's dashboard.** Don't make admin manually push it to each user — one write, many reads.

### 3.6 Admission Flow

```
FLOW: New student admission (Admin)

1. Admin fills detailed admission form:
   - Bio data, previous school, parent/guardian contacts (support 2 guardians),
     medical info/allergies, birth certificate upload, previous report card upload
2. System auto-generates:
   - Admission number (sequential, school-prefixed)
   - Student login credentials (or parent-managed login, recommended for younger students)
   - Initial FeeRecord for current term based on class/grade fee structure
3. Parent account created/linked (check if parent already exists in system — sibling case)
4. Welcome SMS/email sent with login instructions
5. Student appears in class roster, timetable, attendance rosters automatically
```

### 3.7 Final Clearance Flow (leavers)

```
FUNCTION requestClearance(studentId):
    feeRecord = getFeeRecord(studentId, allTerms)
    outstandingBalance = feeRecord.totalBilled - feeRecord.totalPaid
    
    IF outstandingBalance > 0:
        RETURN { cleared: false, balance: outstandingBalance, 
                 message: "Balance must be cleared before certificate release" }
    
    hasLibraryBooksOut = checkLibrary(studentId)  // if you add library module
    hasDisciplinaryHold = checkDisciplinary(studentId)  // optional
    
    IF hasLibraryBooksOut OR hasDisciplinaryHold:
        RETURN { cleared: false, message: "Other clearance items pending" }
    
    RETURN { cleared: true }
    → Admin can now release: transcript, leaving certificate, final grade report
```

---

## 4. ADDITIONAL FEATURES WORTH BUILDING (prioritized by real-world impact)

### Tier 1 — Build these, they solve acute pain
1. **M-Pesa STK Push integration** (covered above) — the #1 value driver
2. **SMS notifications** (Africa's Talking API) for: fee reminders, attendance alerts, exam results published, newsletter — email alone has poor open rates for Kenyan parents; SMS is far more reliable
3. **Auto-generated fee statements (PDF)** — one click, per student or bulk for finance
4. **Report card generator (PDF)** — pulls grades + attendance + teacher comments into a formatted, printable/downloadable report card. This alone can save teachers a week of work per term.
5. **Parent portal with sibling linking** — one login, switch between children
6. **Fee balance dashboard widget** — visible to parent on login, with a "Pay Now" button always accessible (don't bury it in a menu)
7. **Automated fee reminder scheduler** — e.g., SMS at 14 days, 7 days, 1 day before term deadline, and on the day balance triggers gate lock

### Tier 2 — Strong differentiators, build after MVP
8. **Analytics dashboard for Admin**: class performance trends over terms, subject-wise weak areas, teacher performance patterns, fee collection rate trends — Kenyan school boards love this for board meetings
9. **Bulk newsletter/SMS with targeting** — send to "all parents," "Class 7 only," "parents with outstanding balances," etc.
10. **Assignment/quiz auto-grading** for objective (MCQ) questions, manual grading queue for essays
11. **Exam timetable generator** with clash detection (separate from the weekly lesson timetable)
12. **Installment/payment plan tracking** — agreed schedule vs actual, auto-flag missed installments
13. **Document vault per student** — birth cert, report cards, medical forms, all in one place instead of physical files

### Tier 3 — Nice-to-have, later phases
14. Transport/bus route assignment and tracking
15. Library management (borrow/return, fines)
16. Staff/teacher payroll integration
17. Multi-campus support if the school has branches
18. Parent-teacher meeting scheduler (book a slot)
19. Health records module (chronic conditions, medication schedules — important for boarding schools)
20. Offline-first PWA mode for low-connectivity areas (cache timetable/grades locally, sync when online)

---

## 5. HIGH-LEVEL DATA MODEL (entities, not full schema)

```
User (base) ─┬─ Student ─── FeeRecord ─── FeeTransaction
             ├─ Teacher ─── TeachingAssignment
             ├─ Parent  ─── (linked to 1+ Students)
             ├─ Admin
             ├─ Finance
             └─ SuperAdmin

Class/Stream ─── Timetable ─── Lesson ─── AttendanceRecord
             └─── Enrollment (Student ↔ Class, per term)

Subject ─── Grade ─── GradeAuditLog
        └─── Assignment/Quiz ─── Submission ─── Score

SchoolCalendar ─── Event/Term Date

Newsletter ─── Recipient Log (delivery status per parent)
```

Every write to **FeeRecord, Grade, and Attendance** should go through an audit log table — schools get disputes ("I paid but it's not showing," "the teacher changed my grade") and you need a paper trail to resolve them credibly.

---

## 6. RECOMMENDED STACK (aligned to what you already use)

- **Frontend:** Next.js + TypeScript + Tailwind (your existing stack — good fit, use App Router with role-based route groups: `/student`, `/teacher`, `/admin`, `/finance`, `/superadmin`) The UI is in the folder portal
- **Backend/DB:** PostgreSQL + Prisma+ EXPRESSJS NODE JS — worth weighing since financial/audit data really wants strong relational integrity and transactions. .
- **Payments:** Safaricom Daraja API (STK Push + C2B) — you'll need a paybill/till number registered to the school-THIS IS TEMPORARY NOT PERMANENT
- **SMS:** Africa's Talking (Kenya-focused, reliable, cheap)
- **Email:** Resend
- **File storage:** Cloudinary
- **PDF generation:** for report cards/statements — Puppeteer (renders your React templates to PDF) or react-pdf
- **Auth:** NextAuth/Auth.js with role-based middleware, since you have 5 distinct roles with different route access

---

## 7. SUGGESTED BUILD ORDER (MVP → full system)

**Phase 1 (MVP — get this working end-to-end first):**
Auth + roles → Student/Teacher/Class data model → Fee record + manual receipt entry (Finance) → Fee-gated grades/timetable logic → Basic grade posting (no approval flow yet) → Calendar view

**Phase 2:**
M-Pesa STK Push integration → SMS notifications → Grade edit-approval workflow → Attendance + alerting → Admission form

**Phase 3:**
Assignments/quizzes → Analytics dashboard → Newsletter system → Report card PDF generator

**Phase 4:**
Installment plans → Document vault → Advanced analytics → Offline PWA support

Building it in this order means you have a sellable demo after Phase 1-2 even before every feature exists — important if you're pitching this to a real school client.
