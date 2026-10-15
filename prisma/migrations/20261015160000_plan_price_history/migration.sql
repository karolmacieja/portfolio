-- DropIndex
DROP INDEX "PlanPrice_planId_interval_currency_key";

-- CreateIndex
CREATE INDEX "PlanPrice_planId_interval_currency_idx" ON "PlanPrice"("planId", "interval", "currency");

