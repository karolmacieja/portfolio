-- AlterTable
ALTER TABLE "Plan" ADD COLUMN     "highlights" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "isFeatured" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "UsageSnapshot" (
    "day" DATE NOT NULL,
    "clients" INTEGER NOT NULL,
    "payingClients" INTEGER NOT NULL,
    "sites" INTEGER NOT NULL,
    "publishedSites" INTEGER NOT NULL,
    "storageBytes" BIGINT NOT NULL,
    "databaseBytes" BIGINT NOT NULL,
    "pageViews" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UsageSnapshot_pkey" PRIMARY KEY ("day")
);

