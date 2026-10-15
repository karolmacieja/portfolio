-- CreateEnum
CREATE TYPE "InvoiceKind" AS ENUM ('INVOICE', 'CORRECTION');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('PENDING', 'ISSUED', 'FAILED');

-- CreateEnum
CREATE TYPE "KsefStatus" AS ENUM ('NOT_SENT', 'PROCESSING', 'ACCEPTED', 'ERROR', 'NOT_APPLICABLE');

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "providerChargeRef" TEXT,
ADD COLUMN     "refundedAmount" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "kind" "InvoiceKind" NOT NULL,
    "correctedInvoiceId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'PENDING',
    "number" TEXT,
    "providerInvoiceId" TEXT,
    "issueDate" TIMESTAMP(3),
    "sellDate" TIMESTAMP(3) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'PLN',
    "vatRate" TEXT NOT NULL,
    "netAmount" INTEGER NOT NULL,
    "vatAmount" INTEGER NOT NULL,
    "grossAmount" INTEGER NOT NULL,
    "reverseCharge" BOOLEAN NOT NULL DEFAULT false,
    "positionName" TEXT NOT NULL,
    "buyer" JSONB NOT NULL,
    "seller" JSONB NOT NULL,
    "ksefStatus" "KsefStatus" NOT NULL DEFAULT 'NOT_SENT',
    "ksefNumber" TEXT,
    "ksefError" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "emailedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceDocument" (
    "invoiceId" TEXT NOT NULL,
    "content" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvoiceDocument_pkey" PRIMARY KEY ("invoiceId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_idempotencyKey_key" ON "Invoice"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Invoice_userId_createdAt_idx" ON "Invoice"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Invoice_status_updatedAt_idx" ON "Invoice"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "Invoice_ksefStatus_idx" ON "Invoice"("ksefStatus");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_providerChargeRef_key" ON "Payment"("providerChargeRef");

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_correctedInvoiceId_fkey" FOREIGN KEY ("correctedInvoiceId") REFERENCES "Invoice"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceDocument" ADD CONSTRAINT "InvoiceDocument_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

