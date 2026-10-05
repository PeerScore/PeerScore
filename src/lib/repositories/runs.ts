import type { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { aggregateResearcherScore, consensus, median, spread, weightedScore, type CriterionScores } from "../scoring";
import type { AnalysisSection, AnalysisRunSummary, PublicationAnalysisSummary } from "../types";
import { runAnalysesInclude, toPublicationAnalysis, toRunSummary, toWeights } from "./mappers";

export interface CreateRunInput {
  researcherId: string;
  promptKey: string;
  promptVersion: string;
  promptSha: string;
  /** Provider ids taking part in the run. */
  models?: string[];
  /** Defaults to now(). */
  startedAt?: Date;
}

/** Worker: open a new RUNNING analysis run (not current until completed). */
export async function createRun(input: CreateRunInput): Promise<{ id: string; startedAt: Date }> {
  return prisma.analysisRun.create({
    data: {
      researcherId: input.researcherId,
      status: "RUNNING",
      promptKey: input.promptKey,
      promptVersion: input.promptVersion,
      promptSha: input.promptSha,
      models: input.models ?? [],
      startedAt: input.startedAt ?? new Date(),
      isCurrent: false,
    },
    select: { id: true, startedAt: true },
  });
}

export interface ModelScoreInput extends CriterionScores {
  model: string;
  /** Computed with the field weights when omitted. */
  weighted?: number;
  rationale?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Per-publication analyses
// ---------------------------------------------------------------------------

/** Worker: open a RUNNING analysis of one publication within a run. */
export async function createPublicationAnalysis(runId: string, publicationId: string): Promise<{ id: string }> {
  return prisma.publicationAnalysis.create({
    data: { runId, publicationId, status: "RUNNING", isCurrent: false },
    select: { id: true },
  });
}

export interface CompletePublicationAnalysisInput {
  modelScores: ModelScoreInput[];
  summary?: string | null;
  strengths?: string[];
  concerns?: string[];
  /** Defaults to now(). */
  finishedAt?: Date;
}

/**
 * Worker: store the model scores of one publication, derive its consensus
 * score / spread and mark it COMPLETED. It becomes current when the run
 * completes (`completeRun`).
 */
export async function completePublicationAnalysis(
  analysisId: string,
  input: CompletePublicationAnalysisInput,
): Promise<PublicationAnalysisSummary> {
  if (input.modelScores.length === 0) throw new Error("completePublicationAnalysis needs at least one model score");
  const analysis = await prisma.publicationAnalysis.findUniqueOrThrow({
    where: { id: analysisId },
    select: { run: { select: { researcher: { select: { field: { select: { weights: true } } } } } } },
  });
  const weights = toWeights(analysis.run.researcher.field.weights);
  const modelScores = input.modelScores.map((m) => ({
    model: m.model,
    rigor: m.rigor,
    reproducibility: m.reproducibility,
    novelty: m.novelty,
    impact: m.impact,
    clarity: m.clarity,
    weighted: m.weighted ?? weightedScore(m, weights),
    rationale: (m.rationale ?? {}) as Prisma.InputJsonObject,
  }));
  const weighted = modelScores.map((m) => m.weighted);
  const updated = await prisma.$transaction(async (tx) => {
    await tx.modelScore.deleteMany({ where: { analysisId } });
    await tx.modelScore.createMany({ data: modelScores.map((m) => ({ analysisId, ...m })) });
    return tx.publicationAnalysis.update({
      where: { id: analysisId },
      data: {
        status: "COMPLETED",
        score: consensus(weighted),
        spread: spread(weighted),
        summary: input.summary ?? null,
        strengths: (input.strengths ?? []) as Prisma.InputJsonArray,
        concerns: (input.concerns ?? []) as Prisma.InputJsonArray,
        finishedAt: input.finishedAt ?? new Date(),
      },
      include: { modelScores: { orderBy: { model: "asc" } } },
    });
  });
  return toPublicationAnalysis(updated);
}

/** Worker: mark one publication analysis FAILED (excluded from the aggregate). */
export async function failPublicationAnalysis(analysisId: string, finishedAt: Date = new Date()): Promise<void> {
  await prisma.publicationAnalysis.update({
    where: { id: analysisId },
    data: { status: "FAILED", isCurrent: false, finishedAt },
  });
}

// ---------------------------------------------------------------------------
// Run completion
// ---------------------------------------------------------------------------

export interface CompleteRunInput {
  summary?: string | null;
  disagreement?: string | null;
  sections?: AnalysisSection[];
  /** Computed from the other live runs of the same field when omitted. */
  fieldMedian?: number | null;
  /** Defaults to now(). */
  finishedAt?: Date;
  /** Computed from startedAt/finishedAt when omitted. */
  durationSec?: number | null;
}

/**
 * Worker: store the synthesis, derive the researcher aggregate from the
 * COMPLETED publication analyses of the run (citation-weighted mean, spread =
 * max − min of the publication scores), mark the run COMPLETED and make it —
 * and its publication analyses — current (older ones are unset) in one
 * transaction. Requires at least one completed publication analysis.
 */
export async function completeRun(runId: string, input: CompleteRunInput = {}): Promise<AnalysisRunSummary> {
  const run = await prisma.analysisRun.findUniqueOrThrow({
    where: { id: runId },
    select: {
      researcherId: true,
      startedAt: true,
      researcher: { select: { fieldId: true } },
      publicationAnalyses: {
        where: { status: "COMPLETED", score: { not: null } },
        select: { id: true, publicationId: true, score: true, publication: { select: { citationCount: true } } },
      },
    },
  });
  const analyses = run.publicationAnalyses;
  if (analyses.length === 0) throw new Error("completeRun needs at least one completed publication analysis");

  const pubScores = analyses.map((a) => a.score as number);
  const score = aggregateResearcherScore(analyses.map((a) => ({ score: a.score, citationCount: a.publication.citationCount })));
  const finishedAt = input.finishedAt ?? new Date();
  const durationSec =
    input.durationSec ?? Math.max(0, Math.round((finishedAt.getTime() - run.startedAt.getTime()) / 1000));

  let fieldMedian = input.fieldMedian;
  if (fieldMedian === undefined) {
    const others = await prisma.analysisRun.findMany({
      where: {
        isCurrent: true,
        status: "COMPLETED",
        score: { not: null },
        researcher: { fieldId: run.researcher.fieldId },
        NOT: { id: runId },
      },
      select: { score: true },
    });
    const values = others.map((o) => o.score as number);
    if (score !== null) values.push(score);
    fieldMedian = median(values);
  }

  const updated = await prisma.$transaction(async (tx) => {
    await tx.analysisRun.updateMany({
      where: { researcherId: run.researcherId, isCurrent: true, NOT: { id: runId } },
      data: { isCurrent: false },
    });
    await tx.publicationAnalysis.updateMany({
      where: { publication: { researcherId: run.researcherId }, isCurrent: true, NOT: { runId } },
      data: { isCurrent: false },
    });
    await tx.publicationAnalysis.updateMany({
      where: { id: { in: analyses.map((a) => a.id) } },
      data: { isCurrent: true },
    });
    return tx.analysisRun.update({
      where: { id: runId },
      data: {
        status: "COMPLETED",
        finishedAt,
        durationSec,
        score,
        spread: spread(pubScores),
        fieldMedian,
        publicationsAnalyzed: analyses.length,
        summary: input.summary ?? null,
        disagreement: input.disagreement ?? null,
        sections: (input.sections ?? []) as unknown as Prisma.InputJsonArray,
        isCurrent: true,
      },
      include: runAnalysesInclude,
    });
  });
  return toRunSummary(updated);
}

/** Worker: mark a run FAILED (it never becomes current); its RUNNING analyses fail too. */
export async function failRun(runId: string, finishedAt: Date = new Date()): Promise<void> {
  const run = await prisma.analysisRun.findUniqueOrThrow({ where: { id: runId }, select: { startedAt: true } });
  await prisma.$transaction([
    prisma.publicationAnalysis.updateMany({
      where: { runId, status: "RUNNING" },
      data: { status: "FAILED", isCurrent: false, finishedAt },
    }),
    prisma.analysisRun.update({
      where: { id: runId },
      data: {
        status: "FAILED",
        isCurrent: false,
        finishedAt,
        durationSec: Math.max(0, Math.round((finishedAt.getTime() - run.startedAt.getTime()) / 1000)),
      },
    }),
  ]);
}

/** Current run of a researcher (completed or not), or null. */
export async function getCurrentRun(researcherId: string): Promise<AnalysisRunSummary | null> {
  const run = await prisma.analysisRun.findFirst({
    where: { researcherId, isCurrent: true },
    include: runAnalysesInclude,
  });
  return run ? toRunSummary(run) : null;
}

/** All runs of a researcher, newest first (provenance / history). */
export async function listRuns(researcherId: string): Promise<AnalysisRunSummary[]> {
  const runs = await prisma.analysisRun.findMany({
    where: { researcherId },
    orderBy: [{ startedAt: "desc" }, { id: "asc" }],
    include: runAnalysesInclude,
  });
  return runs.map(toRunSummary);
}
