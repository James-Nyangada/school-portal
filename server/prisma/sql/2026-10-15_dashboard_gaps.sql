-- Feature toggles, installment plans, admission drafts, leavers' clearance, fee reminders and
-- M-Pesa reconciliation runs. Safe to re-run.

ALTER TABLE "SchoolSettings" ADD COLUMN IF NOT EXISTS "mpesaEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "SchoolSettings" ADD COLUMN IF NOT EXISTS "smsEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "SchoolSettings" ADD COLUMN IF NOT EXISTS "newsletterEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "SchoolSettings" ADD COLUMN IF NOT EXISTS "assignmentsEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "SchoolSettings" ADD COLUMN IF NOT EXISTS "paymentPlans" JSONB NOT NULL DEFAULT '[{"code":"FULL","name":"Full term","milestones":[{"week":2,"percent":100}]},{"code":"INSTALLMENTS_2","name":"Two installments","milestones":[{"week":2,"percent":50},{"week":7,"percent":100}]},{"code":"INSTALLMENTS_3","name":"Three installments","milestones":[{"week":2,"percent":30},{"week":6,"percent":65},{"week":10,"percent":100}]}]';

ALTER TABLE "FeeRecord" ADD COLUMN IF NOT EXISTS "paymentPlan" TEXT NOT NULL DEFAULT 'FULL';

ALTER TABLE "Class" ADD COLUMN IF NOT EXISTS "studentsCanPay" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS "AdmissionDraft" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "step" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AdmissionDraft_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "AdmissionDraft_updatedAt_idx" ON "AdmissionDraft"("updatedAt");

CREATE TABLE IF NOT EXISTS "ClearanceRequest" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "leavingStatus" "Status" NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "libraryHold" BOOLEAN NOT NULL DEFAULT false,
    "libraryNote" TEXT,
    "disciplinaryHold" BOOLEAN NOT NULL DEFAULT false,
    "disciplinaryNote" TEXT,
    "requestedById" TEXT NOT NULL,
    "releasedById" TEXT,
    "releasedAt" TIMESTAMP(3),
    "certificateNumber" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ClearanceRequest_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ClearanceRequest_studentId_key" ON "ClearanceRequest"("studentId");
CREATE UNIQUE INDEX IF NOT EXISTS "ClearanceRequest_certificateNumber_key" ON "ClearanceRequest"("certificateNumber");
CREATE INDEX IF NOT EXISTS "ClearanceRequest_status_idx" ON "ClearanceRequest"("status");
DO $$ BEGIN
    ALTER TABLE "ClearanceRequest" ADD CONSTRAINT "ClearanceRequest_studentId_fkey"
        FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "FeeReminder" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "term" TEXT NOT NULL,
    "balance" DOUBLE PRECISION NOT NULL,
    "message" TEXT NOT NULL,
    "phones" TEXT[],
    "status" TEXT NOT NULL,
    "error" TEXT,
    "sentById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FeeReminder_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "FeeReminder_studentId_createdAt_idx" ON "FeeReminder"("studentId", "createdAt");

CREATE TABLE IF NOT EXISTS "MpesaReconciliationRun" (
    "id" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "checked" INTEGER NOT NULL DEFAULT 0,
    "recovered" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "mismatches" JSONB NOT NULL DEFAULT '[]',
    "error" TEXT,
    CONSTRAINT "MpesaReconciliationRun_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "MpesaReconciliationRun_startedAt_idx" ON "MpesaReconciliationRun"("startedAt");

-- Speeds up the failed-login alert on the Super Admin overview
CREATE INDEX IF NOT EXISTS "AuditLog_action_createdAt_idx" ON "AuditLog"("action", "createdAt");
