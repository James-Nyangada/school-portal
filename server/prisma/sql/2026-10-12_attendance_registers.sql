-- Per-period attendance registers: each mark is tied to a timetable lesson + placed period. Safe to re-run.

ALTER TABLE "AttendanceRecord" ADD COLUMN IF NOT EXISTS "lessonId" TEXT;
ALTER TABLE "AttendanceRecord" ADD COLUMN IF NOT EXISTS "entryId" TEXT;
ALTER TABLE "AttendanceRecord" ADD COLUMN IF NOT EXISTS "subjectId" TEXT;
ALTER TABLE "AttendanceRecord" ADD COLUMN IF NOT EXISTS "markedById" TEXT;
ALTER TABLE "AttendanceRecord" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- One mark per student per register. Older rows have NULL lessonId/entryId and are not constrained.
CREATE UNIQUE INDEX IF NOT EXISTS "AttendanceRecord_studentId_date_lessonId_entryId_key"
    ON "AttendanceRecord" ("studentId", "date", "lessonId", "entryId");
CREATE INDEX IF NOT EXISTS "AttendanceRecord_lessonId_entryId_date_idx"
    ON "AttendanceRecord" ("lessonId", "entryId", "date");
