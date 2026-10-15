-- CreateEnum
CREATE TYPE "DomainOrderStatus" AS ENUM ('PENDING_PAYMENT', 'REGISTERING', 'ACTIVE', 'FAILED', 'EXPIRED', 'CANCELED');

-- AlterEnum
ALTER TYPE "DomainStatus" ADD VALUE 'DISABLED';

-- AlterEnum
ALTER TYPE "PaymentKind" ADD VALUE 'DOMAIN';

-- AlterTable
ALTER TABLE "Domain" ADD COLUMN     "activatedAt" TIMESTAMP(3),
ADD COLUMN     "checkedAt" TIMESTAMP(3),
ADD COLUMN     "dnsRecords" JSONB,
ADD COLUMN     "entitlementLostAt" TIMESTAMP(3),
ADD COLUMN     "lastError" TEXT,
ADD COLUMN     "orderId" TEXT,
ADD COLUMN     "providerHostnameId" TEXT,
ADD COLUMN     "sslStatus" TEXT;

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "domainOrderId" TEXT;

-- CreateTable
CREATE TABLE "DomainOrder" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "siteId" TEXT,
    "domainName" TEXT NOT NULL,
    "status" "DomainOrderStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
    "priceAmount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'PLN',
    "registrarCost" INTEGER,
    "registrarCurrency" TEXT,
    "registrant" JSONB NOT NULL,
    "registrarHandle" TEXT,
    "registrarDomainId" TEXT,
    "expiresAt" TIMESTAMP(3),
    "autoRenew" BOOLEAN NOT NULL DEFAULT true,
    "providerSubscriptionId" TEXT,
    "remindersSent" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "lastRenewedAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DomainOrder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DomainOrder_providerSubscriptionId_key" ON "DomainOrder"("providerSubscriptionId");

-- CreateIndex
CREATE INDEX "DomainOrder_userId_idx" ON "DomainOrder"("userId");

-- CreateIndex
CREATE INDEX "DomainOrder_domainName_idx" ON "DomainOrder"("domainName");

-- CreateIndex
CREATE INDEX "DomainOrder_status_expiresAt_idx" ON "DomainOrder"("status", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Domain_providerHostnameId_key" ON "Domain"("providerHostnameId");

-- CreateIndex
CREATE INDEX "Domain_status_checkedAt_idx" ON "Domain"("status", "checkedAt");

-- AddForeignKey
ALTER TABLE "Domain" ADD CONSTRAINT "Domain_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "DomainOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DomainOrder" ADD CONSTRAINT "DomainOrder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DomainOrder" ADD CONSTRAINT "DomainOrder_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_domainOrderId_fkey" FOREIGN KEY ("domainOrderId") REFERENCES "DomainOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

