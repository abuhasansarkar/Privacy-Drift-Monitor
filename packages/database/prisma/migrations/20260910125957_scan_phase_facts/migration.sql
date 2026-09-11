-- AlterTable
ALTER TABLE "scan_phases" ADD COLUMN     "buttonGeometry" JSONB,
ADD COLUMN     "domGating" JSONB,
ADD COLUMN     "fingerprint" JSONB,
ADD COLUMN     "formSubmission" JSONB;
