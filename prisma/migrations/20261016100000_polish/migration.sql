-- AlterTable
ALTER TABLE "User" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "deletionScheduledAt" TIMESTAMP(3),
ADD COLUMN     "termsAcceptedAt" TIMESTAMP(3),
ADD COLUMN     "termsVersion" TEXT;

-- CreateTable
CREATE TABLE "ContactMessage" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "senderHash" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContactMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SiteDailyStat" (
    "siteId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "path" TEXT NOT NULL,
    "views" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "SiteDailyStat_pkey" PRIMARY KEY ("siteId","day","path")
);

-- CreateTable
CREATE TABLE "SiteDailyVisitor" (
    "siteId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "hash" TEXT NOT NULL,

    CONSTRAINT "SiteDailyVisitor_pkey" PRIMARY KEY ("siteId","day","hash")
);

-- CreateTable
CREATE TABLE "SiteDailyUnique" (
    "siteId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "visitors" INTEGER NOT NULL,

    CONSTRAINT "SiteDailyUnique_pkey" PRIMARY KEY ("siteId","day")
);

-- CreateIndex
CREATE INDEX "ContactMessage_siteId_createdAt_idx" ON "ContactMessage"("siteId", "createdAt");

-- CreateIndex
CREATE INDEX "SiteDailyVisitor_day_idx" ON "SiteDailyVisitor"("day");

-- AddForeignKey
ALTER TABLE "ContactMessage" ADD CONSTRAINT "ContactMessage_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteDailyStat" ADD CONSTRAINT "SiteDailyStat_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteDailyVisitor" ADD CONSTRAINT "SiteDailyVisitor_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteDailyUnique" ADD CONSTRAINT "SiteDailyUnique_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

