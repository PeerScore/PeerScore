-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "SubmissionStatus" AS ENUM ('QUEUED', 'RESOLVING', 'FETCHING', 'ANALYZING', 'PUBLISHED', 'FAILED');

-- CreateEnum
CREATE TYPE "RunStatus" AS ENUM ('RUNNING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "Submission" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "SubmissionStatus" NOT NULL DEFAULT 'QUEUED',
    "error" TEXT,
    "researcherId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Submission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Field" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "promptKey" TEXT NOT NULL,
    "weights" JSONB NOT NULL,

    CONSTRAINT "Field_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Researcher" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "affiliation" TEXT,
    "country" TEXT,
    "orcid" TEXT,
    "openalexId" TEXT,
    "fieldId" TEXT NOT NULL,
    "activeFrom" INTEGER,
    "activeTo" INTEGER,
    "publicationCount" INTEGER NOT NULL DEFAULT 0,
    "openCodeCount" INTEGER NOT NULL DEFAULT 0,
    "topics" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Researcher_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Publication" (
    "id" TEXT NOT NULL,
    "researcherId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "venue" TEXT,
    "doi" TEXT,
    "url" TEXT,
    "abstract" TEXT,
    "hasCode" BOOLEAN NOT NULL DEFAULT false,
    "score" INTEGER,

    CONSTRAINT "Publication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalysisRun" (
    "id" TEXT NOT NULL,
    "researcherId" TEXT NOT NULL,
    "status" "RunStatus" NOT NULL DEFAULT 'RUNNING',
    "promptKey" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "promptSha" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "durationSec" INTEGER,
    "score" INTEGER,
    "spread" INTEGER,
    "fieldMedian" INTEGER,
    "summary" TEXT,
    "disagreement" TEXT,
    "sections" JSONB NOT NULL DEFAULT '[]',
    "isCurrent" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "AnalysisRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModelScore" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "rigor" INTEGER NOT NULL,
    "reproducibility" INTEGER NOT NULL,
    "novelty" INTEGER NOT NULL,
    "impact" INTEGER NOT NULL,
    "clarity" INTEGER NOT NULL,
    "weighted" INTEGER NOT NULL,
    "rationale" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "ModelScore_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Submission_status_createdAt_idx" ON "Submission"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Submission_researcherId_idx" ON "Submission"("researcherId");

-- CreateIndex
CREATE UNIQUE INDEX "Field_slug_key" ON "Field"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Researcher_slug_key" ON "Researcher"("slug");

-- CreateIndex
CREATE INDEX "Researcher_fieldId_idx" ON "Researcher"("fieldId");

-- CreateIndex
CREATE INDEX "Researcher_name_idx" ON "Researcher"("name");

-- CreateIndex
CREATE INDEX "Publication_researcherId_year_idx" ON "Publication"("researcherId", "year");

-- CreateIndex
CREATE INDEX "AnalysisRun_researcherId_isCurrent_idx" ON "AnalysisRun"("researcherId", "isCurrent");

-- CreateIndex
CREATE INDEX "AnalysisRun_isCurrent_finishedAt_idx" ON "AnalysisRun"("isCurrent", "finishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ModelScore_runId_model_key" ON "ModelScore"("runId", "model");

-- AddForeignKey
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_researcherId_fkey" FOREIGN KEY ("researcherId") REFERENCES "Researcher"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Researcher" ADD CONSTRAINT "Researcher_fieldId_fkey" FOREIGN KEY ("fieldId") REFERENCES "Field"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Publication" ADD CONSTRAINT "Publication_researcherId_fkey" FOREIGN KEY ("researcherId") REFERENCES "Researcher"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalysisRun" ADD CONSTRAINT "AnalysisRun_researcherId_fkey" FOREIGN KEY ("researcherId") REFERENCES "Researcher"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModelScore" ADD CONSTRAINT "ModelScore_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AnalysisRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

