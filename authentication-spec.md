# School Dashboard — Authentication System Specification
### (v2 — updated creation hierarchy)

---

## 1. ROLE HIERARCHY & ACCOUNT CREATION CHAIN

```
                    SUPER ADMIN
              (pre-seeded, unrestricted)
                         │
                         │ can directly create ANY account type
         ┌───────────────┼───────────────┬───────────────┐
         ▼               ▼               ▼               ▼
      ADMIN           FINANCE         STUDENT          PARENT
                                          │            (linked)
                                          │
                                          
                    ┌─────────────────────────────────────┐
                    │              ADMIN                   │
                    │  (day-to-day account provisioning)   │
                    └─────────────────────────────────────┘
                         │
                         │ creates during normal operation
         ┌───────────────┼───────────────┐
         ▼               ▼               ▼
      TEACHER      STUDENT + PARENT    FINANCE
                   (created together
                    during admission)
```

**Rules locked in:**
- **Super Admin** is never created through the app UI — seeded once at deployment. Only 1–2 of these accounts should exist (the IT technician, maybe a backup).
- **Super Admin has unrestricted creation rights** — it can directly create an Admin, a Finance account, a Student, or a Parent account, bypassing Admin entirely. This matters for real-world cases: IT technician needs to fix a broken admission, onboard a new Finance officer while Admin is unavailable, or manually patch a student record.
- **Admin** accounts can ONLY be created by Super Admin.
- **Admin creates, during normal day-to-day operation:** Teacher accounts, Finance accounts, and — specifically at the point of **admission** — Student + Parent account pairs together as a single workflow.
- **Parent** accounts are never created standalone. They only ever come into existence attached to a Student record — whether created by Admin (normal admission) or by Super Admin (override/manual case).
- No role can create a role equal to or above itself. No role can self-elevate. This is enforced server-side on every creation endpoint, never just hidden in the UI.

---

## 2. CREDENTIAL ISSUANCE LOGIC (per role)

| Role | Login identifier | Who can generate it | How password works |
|---|---|---|---|
| Super Admin | Personal/work email (fixed at setup) | Set once at deployment | Set at deployment, mandatory 2FA, no self-registration ever |
| Admin | School-issued email (e.g. `admin.jkimani@schoolname.ac.ke`) | Super Admin only | System generates temp password → forced reset on first login |
| Teacher | School-issued email (e.g. `t.wanjiru@schoolname.ac.ke`) | Admin (or Super Admin override) | System generates temp password → forced reset on first login |
| Finance | School-issued email (e.g. `finance.akoech@schoolname.ac.ke`) | Admin (or Super Admin override) | System generates temp password → forced reset on first login |
| Student | **School-issued email**, provided at admission (e.g. `s.omondi.2024101@schoolname.ac.ke`, admission number guarantees uniqueness) | Admin (or Super Admin override) | System generates temp password → forced reset on first login (or parent resets on their behalf for younger students) |
| Parent | **Phone number** (primary identifier — NOT school-issued, parents are external to the school) | Admin (or Super Admin override), created alongside the student at admission | Parent sets their own password via SMS invite link with a secure one-time token — never issued a temp password by the system |

**Why the student gets a school email but the parent gets a phone number:** the student is an institutional member with a school inbox; the parent isn't, and won't check an email they never open. Using phone number as the parent's identifier also matches how they'll already interact with the fee-payment side of the system (M-Pesa, SMS receipts, SMS reminders) — one consistent channel throughout.

### Student email generation algorithm
```
FUNCTION generateStudentEmail(firstName, lastName, admissionNumber, schoolDomain):
    baseHandle = lowercase(firstInitial(firstName) + "." + lastName)
    IF emailExists(baseHandle + "@" + schoolDomain):
        handle = baseHandle + "." + admissionNumber   // guarantees uniqueness
    ELSE:
        handle = baseHandle
    RETURN handle + "@" + schoolDomain
```
Same pattern applies to Teacher/Admin/Finance, just keyed on employee ID instead of admission number for the collision fallback.

---

## 3. ACCOUNT CREATION FLOWS (pseudocode)

All creation endpoints share one guard at the top: **verify the requestor's role is permitted to create the target role**, checked server-side against the database — never against a client-supplied value.

```
FUNCTION canCreate(requestorRole, targetRole):
    IF requestorRole == "SUPER_ADMIN":
        RETURN targetRole IN ["ADMIN", "FINANCE", "STUDENT", "PARENT"]
        // Super Admin never creates another Super Admin through the UI
    
    IF requestorRole == "ADMIN":
        RETURN targetRole IN ["TEACHER", "FINANCE", "STUDENT", "PARENT"]
    
    RETURN false   // every other role creates nobody
```

### 3.1 Super Admin creates an Admin
```
FUNCTION createAdminAccount(requestorId, adminData):
    requestor = getUser(requestorId)
    
    IF NOT canCreate(requestor.role, "ADMIN"):
        THROW ForbiddenError("Not authorized to create Admin accounts")
    
    validate(adminData)
    email = generateStaffEmail(adminData.firstName, adminData.lastName, schoolDomain)
    tempPassword = generateSecureTempPassword()
    
    user = createUser({
        role: "ADMIN",
        email: email,
        passwordHash: hash(tempPassword),
        status: "PENDING_ACTIVATION",
        createdBy: requestorId
    })
    
    sendCredentialsEmail(email, tempPassword)
    logAudit("ADMIN_CREATED", requestorId, user.id)
    RETURN user
```

### 3.2 Admin (or Super Admin) creates a Teacher / Finance staff
```
FUNCTION createStaffAccount(requestorId, staffData, targetRole):
    requestor = getUser(requestorId)
    
    IF NOT canCreate(requestor.role, targetRole):
        THROW ForbiddenError("Not authorized to create " + targetRole + " accounts")
    
    IF targetRole NOT IN ["TEACHER", "FINANCE"]:
        THROW ForbiddenError("Invalid role assignment")
    
    email = generateStaffEmail(staffData.firstName, staffData.lastName, schoolDomain)
    tempPassword = generateSecureTempPassword()
    
    user = createUser({
        role: targetRole,
        email: email,
        passwordHash: hash(tempPassword),
        status: "PENDING_ACTIVATION",
        createdBy: requestorId
    })
    
    sendCredentialsEmail(email, tempPassword)
    logAudit(targetRole + "_CREATED", requestorId, user.id)
    RETURN user
```

### 3.3 Admin (or Super Admin) creates Student + Parent together — the admission workflow
This is the core, most-used creation flow in the system — it happens for every single new admission.

```
FUNCTION admitStudent(requestorId, studentData, parentData):
    requestor = getUser(requestorId)
    
    IF NOT canCreate(requestor.role, "STUDENT"):
        THROW ForbiddenError("Not authorized to admit students")
    
    validate(studentData)   // full admission form: bio data, previous school,
                            // medical info, documents, class/grade placement
    
    // 1. Create the student account
    admissionNumber = generateAdmissionNumber()
    studentEmail = generateStudentEmail(studentData.firstName, studentData.lastName, admissionNumber, schoolDomain)
    studentTempPassword = generateSecureTempPassword()
    
    student = createUser({
        role: "STUDENT",
        email: studentEmail,
        admissionNumber: admissionNumber,
        passwordHash: hash(studentTempPassword),
        status: "PENDING_ACTIVATION",
        classId: studentData.classId,
        createdBy: requestorId
    })
    
    // 2. Create or link the parent account — check for sibling case first
    existingParent = findParentByPhone(parentData.phone)
    
    IF existingParent EXISTS:
        linkStudentToParent(existingParent.id, student.id)
        parent = existingParent
        notifyParent(parent.phone, "New child added to your account: " + student.fullName)
    ELSE:
        inviteToken = generateSecureOneTimeToken()
        parent = createUser({
            role: "PARENT",
            phone: parentData.phone,
            email: parentData.email,          // optional secondary contact
            status: "PENDING_INVITE",          // sets own password, no temp password issued
            inviteToken: inviteToken,
            linkedStudents: [student.id],
            createdBy: requestorId
        })
        sendInviteSMS(parent.phone, inviteToken)
    
    // 3. Create the student's initial fee record for the current term
    createFeeRecord(student.id, currentTerm)
    
    // 4. Deliver student credentials to the PARENT's phone (not the student directly —
    //    parent should be the one handing over login details, especially for younger students)
    sendCredentialsSMS(parent.phone, studentEmail, studentTempPassword)
    
    logAudit("STUDENT_ADMITTED", requestorId, student.id)
    logAudit("PARENT_LINKED", requestorId, parent.id)
    
    RETURN { student, parent }
```

### 3.4 Super Admin override — manual Student/Parent creation outside normal admission
Same function as 3.3 (`admitStudent`), just invoked by a Super Admin — the `canCreate()` guard already permits this. No separate code path needed; Super Admin simply has access to the same admission form/endpoint that Admin uses, plus the Admin/Finance creation screens that Admin itself cannot reach.

---

## 4. LOGIN FLOW LOGIC

Landing page has 5 public entry points: **Student / Parent / Teacher / Admin / Finance.** Super Admin is deliberately not a public tab (see Section 6).

### 4.1 Core principle: the tab is UX only, never the security boundary
The role is always verified server-side against the account record tied to the submitted identifier — never trusted from which tab the person clicked.

```
FUNCTION login(identifier, password, selectedTab):
    // identifier = school email (Admin/Teacher/Finance/Student) or phone number (Parent)
    
    user = findUserByIdentifier(identifier)
    
    IF user DOES NOT EXIST:
        RETURN genericError("Invalid credentials")
    
    IF user.status == "SUSPENDED":
        RETURN error("Account suspended. Contact school administration.")
    
    IF user.status == "LOCKED":
        RETURN error("Account locked due to multiple failed attempts. Try again later, or reset password.")
    
    IF NOT verifyPassword(password, user.passwordHash):
        recordFailedAttempt(user.id)
        IF failedAttempts(user.id, last15Min) >= 5:
            lockAccount(user.id, duration = 30min)
        RETURN genericError("Invalid credentials")
    
    IF selectedTab != user.role:
        logAudit("TAB_ROLE_MISMATCH", user.id, selectedTab)   // logged, not blocked
    
    IF user.status == "PENDING_ACTIVATION":
        RETURN redirectTo("FORCE_PASSWORD_RESET", user.id)
    
    IF user.status == "PENDING_INVITE":
        RETURN redirectTo("COMPLETE_PARENT_SETUP", user.id)
    
    // Success
    resetFailedAttempts(user.id)
    token = issueJWT({
        userId: user.id,
        role: user.role,
        linkedStudents: user.role == "PARENT" ? user.linkedStudents : null,
        issuedAt: now(),
        expiresAt: now() + roleBasedExpiry(user.role)
    })
    
    logAudit("LOGIN_SUCCESS", user.id, ip=request.ip, device=request.userAgent)
    RETURN { token, redirectTo: dashboardRouteFor(user.role) }
```

### 4.2 Role-based session expiry
```
FUNCTION roleBasedExpiry(role):
    SWITCH role:
        CASE "SUPER_ADMIN": RETURN 30 minutes
        CASE "ADMIN":        RETURN 1 hour
        CASE "FINANCE":      RETURN 1 hour
        CASE "TEACHER":      RETURN 4 hours
        CASE "STUDENT":      RETURN 8 hours
        CASE "PARENT":       RETURN 8 hours
```

### 4.3 Route protection middleware
```
FUNCTION authMiddleware(request):
    token = extractToken(request)
    
    IF token IS MISSING OR INVALID OR EXPIRED:
        RETURN redirectTo("/login")
    
    payload = verifyJWT(token)
    requiredRole = getRequiredRoleForRoute(request.path)
    
    IF requiredRole EXISTS AND payload.role != requiredRole AND payload.role != "SUPER_ADMIN":
        RETURN 403_Forbidden()
        // Super Admin bypasses role checks — unrestricted per spec
    
    request.user = payload
    PROCEED
```

---

## 5. FIRST LOGIN / ACCOUNT ACTIVATION FLOWS

Applies to Admin, Teacher, Finance, and Student — every role issued a system-generated temp password.

```
FLOW: First login after account creation

1. User logs in with temp password → status = PENDING_ACTIVATION
2. System blocks dashboard access, redirects to "Set New Password" screen
3. User provides new password (policy: min 8 chars, upper+lower+number, ≠ temp password) + confirms it
4. On submit:
     a. Update passwordHash
     b. status → "ACTIVE"
     c. Invalidate the temp password permanently
     d. Log the activation event
     e. Redirect to role-appropriate dashboard
```

Parent flow (status `PENDING_INVITE` — set at admission, not a temp password):
```
FLOW: Parent completes account setup via SMS invite

1. Parent taps the SMS invite link containing inviteToken (sent during admission, Section 3.3 step 2)
2. System validates token (72hr validity, single-use)
3. Parent sets their own password + confirms phone via OTP
4. status → "ACTIVE"
5. Parent lands on dashboard, sees linked student(s) and can retrieve
   the student's login credentials (delivered via SMS at admission, step 4)
```

---

## 6. SECURITY CONSIDERATIONS SPECIFIC TO THIS HIERARCHY

1. **Super Admin has no public login tab.** With unrestricted create-and-access rights across every role, this account sits behind a separate, non-advertised route (e.g. `/system-access`) with mandatory 2FA (TOTP app, not SMS — SMS is SIM-swappable). This is a layer on top of proper auth, not a substitute for it.

2. **Enforce `canCreate()` server-side on every request**, never just in the UI. Since Super Admin can now create Student/Parent/Finance/Admin directly, the guard function needs to check *both* requestor role *and* target role on every single creation endpoint — a compromised Admin session should never be able to call the Admin-creation endpoint even if it somehow reaches it.

3. **2FA recommended for Admin, Finance, and Super Admin** — these three touch money and grade-approval authority.

4. **Audit every account-creation and login event:**
   ```
   AuditLog { actorId, action, targetId, ipAddress, userAgent, timestamp }
   ```
   Since Super Admin can now bypass Admin and create Student/Parent accounts directly, it's worth tagging these override creations distinctly (e.g. `STUDENT_ADMITTED_BY_SUPERADMIN`) so Admin can still see in their own dashboard that a record was created outside their normal workflow — avoids confusion later ("I don't remember admitting this student").

5. **Deactivation, not deletion**, for anyone who leaves — preserves historical grade/attendance/fee records tied to their ID.

6. **Rate limit and CAPTCHA the login endpoint** — predictable email patterns make credential stuffing easy to attempt.

7. **Never reveal which part of a login failed** — same generic "Invalid credentials" for wrong identifier or wrong password.

---

## 7. LANDING PAGE → DASHBOARD ROUTING MAP

| Tab clicked | Identifier field shown | Backend route hit | On success, redirects to |
|---|---|---|---|
| Student | School email | `/api/auth/login` | `/student/dashboard` |
| Parent | Phone number | `/api/auth/login` | `/parent/dashboard` |
| Teacher | School email | `/api/auth/login` | `/teacher/dashboard` |
| Admin | School email | `/api/auth/login` | `/admin/dashboard` |
| Finance | School email | `/api/auth/login` | `/finance/dashboard` |
| *(not public)* Super Admin | Work email | `/api/auth/system-login` (2FA required) | `/superadmin/dashboard` |

All five public tabs hit the **same backend endpoint** — only the input field emphasis (email vs phone) and placeholder text differ. The role and redirect always come from the database record, never the tab.

---

## 8. FORGOT PASSWORD FLOW

```
FUNCTION forgotPassword(identifier, role):
    user = findUserByIdentifier(identifier)
    
    IF user DOES NOT EXIST:
        RETURN genericSuccess()   // don't reveal existence either way
    
    IF role IN ["ADMIN", "TEACHER", "FINANCE"]:
        resetToken = generateSecureToken(expiry = 1 hour)
        sendResetLink(user.recoveryPhone OR user.email, resetToken)
    
    IF role == "STUDENT":
        // route through the linked parent's phone, not the student's own inbox —
        // guards against peer-pressure/bribery-driven grade tampering attempts
        parent = getPrimaryParent(user.id)
        resetToken = generateSecureToken(expiry = 1 hour)
        sendResetLink(parent.phone, resetToken)
    
    IF role == "PARENT":
        otp = generateOTP(expiry = 10 minutes)
        sendSMS(user.phone, otp)
    
    logAudit("PASSWORD_RESET_REQUESTED", user.id)
```

---

## 9. SUMMARY: WHO CAN CREATE WHAT

| Actor | Can create |
|---|---|
| Super Admin | Admin, Finance, Student, Parent (unrestricted — direct override on any of these) |
| Admin | Teacher, Finance, Student + Parent (together, at admission) |
| Teacher | Nobody |
| Finance | Nobody |
| Parent | Nobody |
| Student | Nobody |

The one thing that hasn't changed from before: **Admin still cannot create another Admin.** That privilege stays exclusively with Super Admin — everything else (Finance, Student, Parent) can now be created either by Admin in normal operation, or by Super Admin as a direct override when needed.
