-- Parent fee payments: M-Pesa STK Push requests and bank deposit claims awaiting finance verification. Safe to re-run.

CREATE TABLE IF NOT EXISTS "MpesaRequest" (
    "id" TEXT NOT NULL,
    "checkoutRequestId" TEXT NOT NULL,
    "merchantRequestId" TEXT,
    "studentId" TEXT NOT NULL,
    "term" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "phone" TEXT NOT NULL,
    "initiatedById" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "resultCode" INTEGER,
    "resultDesc" TEXT,
    "mpesaReceiptNumber" TEXT,
    "transactionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MpesaRequest_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "MpesaRequest_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "MpesaRequest_checkoutRequestId_key" ON "MpesaRequest" ("checkoutRequestId");
CREATE INDEX IF NOT EXISTS "MpesaRequest_studentId_createdAt_idx" ON "MpesaRequest" ("studentId", "createdAt");
CREATE INDEX IF NOT EXISTS "MpesaRequest_status_idx" ON "MpesaRequest" ("status");

CREATE TABLE IF NOT EXISTS "BankPaymentClaim" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "term" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "transactionCode" TEXT NOT NULL,
    "bankName" TEXT,
    "paidAt" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "submittedById" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "transactionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BankPaymentClaim_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "BankPaymentClaim_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "BankPaymentClaim_status_createdAt_idx" ON "BankPaymentClaim" ("status", "createdAt");
CREATE INDEX IF NOT EXISTS "BankPaymentClaim_studentId_idx" ON "BankPaymentClaim" ("studentId");
CREATE INDEX IF NOT EXISTS "BankPaymentClaim_transactionCode_idx" ON "BankPaymentClaim" ("transactionCode");
