-- AlterTable
ALTER TABLE "alert_history" ADD COLUMN     "idempotencyKey" TEXT;

-- AlterTable
ALTER TABLE "alert_rules" ADD COLUMN     "criticalOverridesQuietHours" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "portal_users" ADD COLUMN     "notifyCriticalAlerts" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "notifyReports" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "emailUndeliverableAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "alert_history_idempotencyKey_key" ON "alert_history"("idempotencyKey");

