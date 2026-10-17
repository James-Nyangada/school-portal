-- Paybill (M-Pesa C2B) payments reported by Safaricom's confirmation webhook. Safe to re-run.

CREATE TABLE IF NOT EXISTS "MpesaC2BPayment" (
    "id" TEXT NOT NULL,
    "transId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "billRef" TEXT NOT NULL,
    "shortcode" TEXT,
    "msisdn" TEXT,
    "payerName" TEXT,
    "transTime" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'UNMATCHED',
    "studentId" TEXT,
    "transactionId" TEXT,
    "assignedById" TEXT,
    "raw" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MpesaC2BPayment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "MpesaC2BPayment_transId_key" ON "MpesaC2BPayment"("transId");
CREATE INDEX IF NOT EXISTS "MpesaC2BPayment_status_createdAt_idx" ON "MpesaC2BPayment"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "MpesaC2BPayment_studentId_idx" ON "MpesaC2BPayment"("studentId");
