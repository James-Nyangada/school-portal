-- Teacher-uploaded handouts (PDF/DOCX/TXT) on FILE_UPLOAD assignments. Safe to re-run.

ALTER TABLE "Assignment" ADD COLUMN IF NOT EXISTS "attachmentUrl" TEXT;
ALTER TABLE "Assignment" ADD COLUMN IF NOT EXISTS "attachmentName" TEXT;
