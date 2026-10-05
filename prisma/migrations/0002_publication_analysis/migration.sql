-- Publication-level analysis: the unit of analysis becomes the publication.
-- Pre-release: the old researcher-level model scores are dropped (data loss accepted).

-- DropForeignKey
ALTER TABLE "ModelScore" DROP CONSTRAINT "ModelScore_runId_fkey";

-- DropIndex
DROP INDEX "ModelScore_runId_model_key";

-- AlterTable
ALTER TABLE "AnalysisRun" ADD COLUMN     "models" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "publicationsAnalyzed" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Publication" DROP COLUMN "score",
ADD COLUMN     "citationCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "openalexId" TEXT;

-- CreateTable
CREATE TABLE "PublicationAnalysis" (
    "id" TEXT NOT NULL,
    "publicationId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "status" "RunStatus" NOT NULL DEFAULT 'RUNNING',
    "score" INTEGER,
    "spread" INTEGER,
    "summary" TEXT,
    "strengths" JSONB NOT NULL DEFAULT '[]',
    "concerns" JSONB NOT NULL DEFAULT '[]',
    "isCurrent" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "PublicationAnalysis_pkey" PRIMARY KEY ("id")
);

-- AlterTable: ModelScore now belongs to a PublicationAnalysis (old rows cannot be mapped)
DELETE FROM "ModelScore";
ALTER TABLE "ModelScore" DROP COLUMN "runId",
ADD COLUMN     "analysisId" TEXT NOT NULL;

-- Old researcher-level runs have no publication analyses: they are removed so that
-- every live run is backed by per-publication data.
DELETE FROM "AnalysisRun";

-- CreateIndex
CREATE UNIQUE INDEX "PublicationAnalysis_runId_publicationId_key" ON "PublicationAnalysis"("runId", "publicationId");

-- CreateIndex
CREATE INDEX "PublicationAnalysis_publicationId_isCurrent_idx" ON "PublicationAnalysis"("publicationId", "isCurrent");

-- CreateIndex
CREATE UNIQUE INDEX "ModelScore_analysisId_model_key" ON "ModelScore"("analysisId", "model");

-- AddForeignKey
ALTER TABLE "PublicationAnalysis" ADD CONSTRAINT "PublicationAnalysis_publicationId_fkey" FOREIGN KEY ("publicationId") REFERENCES "Publication"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublicationAnalysis" ADD CONSTRAINT "PublicationAnalysis_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AnalysisRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModelScore" ADD CONSTRAINT "ModelScore_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES "PublicationAnalysis"("id") ON DELETE CASCADE ON UPDATE CASCADE;
