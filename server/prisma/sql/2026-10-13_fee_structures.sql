-- Itemised fee structures per class and term, with a capped revision history once published. Safe to re-run.

CREATE TABLE IF NOT EXISTS "FeeStructure" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "term" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "revisionCount" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "publishedById" TEXT,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FeeStructure_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "FeeStructure_term_status_idx" ON "FeeStructure" ("term", "status");

CREATE TABLE IF NOT EXISTS "FeeStructureItem" (
    "id" TEXT NOT NULL,
    "structureId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "FeeStructureItem_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "FeeStructureItem_structureId_fkey" FOREIGN KEY ("structureId") REFERENCES "FeeStructure"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "FeeStructureItem_structureId_idx" ON "FeeStructureItem" ("structureId");

CREATE TABLE IF NOT EXISTS "FeeStructureClass" (
    "structureId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "term" TEXT NOT NULL,
    CONSTRAINT "FeeStructureClass_pkey" PRIMARY KEY ("structureId", "classId"),
    CONSTRAINT "FeeStructureClass_structureId_fkey" FOREIGN KEY ("structureId") REFERENCES "FeeStructure"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FeeStructureClass_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "FeeStructureClass_classId_term_key" ON "FeeStructureClass" ("classId", "term");

CREATE TABLE IF NOT EXISTS "FeeStructureRevision" (
    "id" TEXT NOT NULL,
    "structureId" TEXT NOT NULL,
    "revisionNumber" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "previousItems" JSONB NOT NULL,
    "newItems" JSONB NOT NULL,
    "previousTotal" DOUBLE PRECISION NOT NULL,
    "newTotal" DOUBLE PRECISION NOT NULL,
    "changedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FeeStructureRevision_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "FeeStructureRevision_structureId_fkey" FOREIGN KEY ("structureId") REFERENCES "FeeStructure"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "FeeStructureRevision_structureId_revisionNumber_key" ON "FeeStructureRevision" ("structureId", "revisionNumber");

ALTER TABLE "FeeRecord" ADD COLUMN IF NOT EXISTS "feeStructureId" TEXT;
ALTER TABLE "FeeRecord" ADD COLUMN IF NOT EXISTS "manualOverride" BOOLEAN NOT NULL DEFAULT false;
DO $$ BEGIN
    ALTER TABLE "FeeRecord" ADD CONSTRAINT "FeeRecord_feeStructureId_fkey" FOREIGN KEY ("feeStructureId") REFERENCES "FeeStructure"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS "FeeRecord_studentId_term_idx" ON "FeeRecord" ("studentId", "term");
CREATE INDEX IF NOT EXISTS "FeeRecord_feeStructureId_idx" ON "FeeRecord" ("feeStructureId");
