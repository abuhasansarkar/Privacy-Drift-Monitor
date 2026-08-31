-- AlterTable
ALTER TABLE "ai_requests" ADD COLUMN     "creditsCharged" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "promptVersion" TEXT;

-- CreateIndex
CREATE INDEX "ai_requests_feature_promptVersion_idx" ON "ai_requests"("feature", "promptVersion");
