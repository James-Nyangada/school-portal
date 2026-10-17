-- Grading system: numeric (CAT + exam) and CBC modes, edit-approval requests, school settings. Safe to re-run.

DO $$ BEGIN CREATE TYPE "GradingMode" AS ENUM ('NUMERIC', 'CBC'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "CompetencyLevel" AS ENUM ('EE', 'ME', 'AE', 'BE'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "AssessmentType" AS ENUM ('FORMATIVE', 'SUMMATIVE'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "GradeRequestType" AS ENUM ('EDIT', 'DELETE'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "GradeRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "Class" ADD COLUMN IF NOT EXISTS "gradingMode" "GradingMode";

ALTER TABLE "Grade" ADD COLUMN IF NOT EXISTS "mode" "GradingMode" NOT NULL DEFAULT 'NUMERIC';
ALTER TABLE "Grade" ADD COLUMN IF NOT EXISTS "catScores" DOUBLE PRECISION[] DEFAULT ARRAY[]::DOUBLE PRECISION[];
ALTER TABLE "Grade" ADD COLUMN IF NOT EXISTS "examScore" DOUBLE PRECISION;
ALTER TABLE "Grade" ADD COLUMN IF NOT EXISTS "total" DOUBLE PRECISION;
ALTER TABLE "Grade" ADD COLUMN IF NOT EXISTS "letterGrade" TEXT;
ALTER TABLE "Grade" ADD COLUMN IF NOT EXISTS "strand" TEXT;
ALTER TABLE "Grade" ADD COLUMN IF NOT EXISTS "subStrand" TEXT;
ALTER TABLE "Grade" ADD COLUMN IF NOT EXISTS "competencyLevel" "CompetencyLevel";
ALTER TABLE "Grade" ADD COLUMN IF NOT EXISTS "assessmentType" "AssessmentType";
ALTER TABLE "Grade" ADD COLUMN IF NOT EXISTS "enteredById" TEXT;
ALTER TABLE "Grade" ADD COLUMN IF NOT EXISTS "publishedAt" TIMESTAMP(3);
ALTER TABLE "Grade" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);

ALTER TABLE "GradeAuditLog" ADD COLUMN IF NOT EXISTS "action" TEXT NOT NULL DEFAULT 'EDIT_REQUESTED';

CREATE TABLE IF NOT EXISTS "GradeChangeRequest" (
    "id" TEXT NOT NULL,
    "gradeId" TEXT NOT NULL,
    "type" "GradeRequestType" NOT NULL,
    "status" "GradeRequestStatus" NOT NULL DEFAULT 'PENDING',
    "previousData" JSONB NOT NULL,
    "newData" JSONB,
    "previousValue" TEXT NOT NULL,
    "newValue" TEXT,
    "reason" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GradeChangeRequest_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "GradeChangeRequest_gradeId_fkey" FOREIGN KEY ("gradeId") REFERENCES "Grade"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "GradeChangeRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "GradeChangeRequest_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "GradeChangeRequest_status_createdAt_idx" ON "GradeChangeRequest"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "GradeChangeRequest_gradeId_idx" ON "GradeChangeRequest"("gradeId");

CREATE TABLE IF NOT EXISTS "SchoolSettings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "gradingMode" "GradingMode" NOT NULL DEFAULT 'NUMERIC',
    "currentTerm" TEXT NOT NULL DEFAULT 'Term 1',
    "catCount" INTEGER NOT NULL DEFAULT 2,
    "catMaxScore" DOUBLE PRECISION NOT NULL DEFAULT 30,
    "examMaxScore" DOUBLE PRECISION NOT NULL DEFAULT 100,
    "catWeight" DOUBLE PRECISION NOT NULL DEFAULT 30,
    "examWeight" DOUBLE PRECISION NOT NULL DEFAULT 70,
    "gradeBoundaries" JSONB NOT NULL DEFAULT '[{"grade":"A","min":80},{"grade":"A-","min":75},{"grade":"B+","min":70},{"grade":"B","min":65},{"grade":"B-","min":60},{"grade":"C+","min":55},{"grade":"C","min":50},{"grade":"C-","min":45},{"grade":"D+","min":40},{"grade":"D","min":35},{"grade":"D-","min":30},{"grade":"E","min":0}]',
    "approvalSlaHours" INTEGER NOT NULL DEFAULT 48,
    "feeGateThreshold" DOUBLE PRECISION NOT NULL DEFAULT 50,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SchoolSettings_pkey" PRIMARY KEY ("id")
);

-- Backfill grades entered before this migration (they only had a free-text value)
UPDATE "Grade" SET "mode" = 'CBC', "competencyLevel" = "value"::"CompetencyLevel"
    WHERE "competencyLevel" IS NULL AND "value" IN ('EE', 'ME', 'AE', 'BE');
UPDATE "Grade" SET "total" = "value"::DOUBLE PRECISION
    WHERE "mode" = 'NUMERIC' AND "total" IS NULL AND "value" ~ '^\s*\d+(\.\d+)?\s*$';
UPDATE "Grade" SET "publishedAt" = "updatedAt" WHERE "status" <> 'DRAFT' AND "publishedAt" IS NULL;

-- Move edits still waiting under the old flow (pending GradeAuditLog rows) into the approval queue
INSERT INTO "GradeChangeRequest" ("id", "gradeId", "type", "status", "previousData", "newData", "previousValue", "newValue", "reason", "requestedById", "createdAt")
SELECT l."id", l."gradeId", 'EDIT', 'PENDING',
       jsonb_build_object('value', l."previousValue"), jsonb_build_object('value', l."newValue"),
       COALESCE(l."previousValue", ''), l."newValue", COALESCE(l."reason", 'Edit to published grade'), l."changedById", l."createdAt"
FROM "GradeAuditLog" l
JOIN "Grade" g ON g."id" = l."gradeId" AND g."status" = 'PENDING_APPROVAL'
WHERE l."status" = 'PENDING'
ON CONFLICT ("id") DO NOTHING;
