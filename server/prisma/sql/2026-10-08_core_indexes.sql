-- Indexes for per-student / per-class lookups (Postgres does not index foreign keys on its own).
-- Safe to re-run. CONCURRENTLY avoids locking writes; run outside a transaction.

CREATE INDEX CONCURRENTLY IF NOT EXISTS "User_role_idx" ON "User" ("role");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "User_classId_idx" ON "User" ("classId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "AuditLog_createdAt_idx" ON "AuditLog" ("createdAt");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "AuditLog_actorId_idx" ON "AuditLog" ("actorId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "StudentParent_parentId_idx" ON "StudentParent" ("parentId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "FeeRecord_studentId_idx" ON "FeeRecord" ("studentId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "FeeTransaction_studentId_createdAt_idx" ON "FeeTransaction" ("studentId", "createdAt");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Grade_studentId_term_idx" ON "Grade" ("studentId", "term");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Grade_subjectId_term_idx" ON "Grade" ("subjectId", "term");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "GradeAuditLog_gradeId_idx" ON "GradeAuditLog" ("gradeId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "GradeAuditLog_status_idx" ON "GradeAuditLog" ("status");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "AttendanceRecord_studentId_date_idx" ON "AttendanceRecord" ("studentId", "date");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "AttendanceRecord_date_idx" ON "AttendanceRecord" ("date");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "TimetableSlot_classId_idx" ON "TimetableSlot" ("classId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "TimetableSlot_teacherId_idx" ON "TimetableSlot" ("teacherId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Assignment_classId_idx" ON "Assignment" ("classId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Assignment_teacherId_idx" ON "Assignment" ("teacherId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "AssignmentSubmission_assignmentId_idx" ON "AssignmentSubmission" ("assignmentId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "AssignmentSubmission_studentId_idx" ON "AssignmentSubmission" ("studentId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "QuizQuestion_assignmentId_idx" ON "QuizQuestion" ("assignmentId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "QuizResponse_submissionId_idx" ON "QuizResponse" ("submissionId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "CommunicationLog_campaignId_idx" ON "CommunicationLog" ("campaignId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ReportCard_studentId_term_idx" ON "ReportCard" ("studentId", "term");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ReportCardSubject_reportCardId_idx" ON "ReportCardSubject" ("reportCardId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "TeacherSubjectClass_classId_idx" ON "TeacherSubjectClass" ("classId");
