-- Named breaks with their own times in the bell schedule. Safe to re-run.

CREATE TABLE IF NOT EXISTS "TtBreak" (
    "afterIndex" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,

    CONSTRAINT "TtBreak_pkey" PRIMARY KEY ("afterIndex")
);
