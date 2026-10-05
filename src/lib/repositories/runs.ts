import type { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { consensus, median, spread, weightedScore, type CriterionScores } from "../scoring";
import type { AnalysisSection, AnalysisRunSummary } from "../types";
import { toRunSummary, toWeights } from "./mappers";

type RunWithScores = Prisma.AnalysisRunGetPayload<{ include: { modelScores: true } }>;

export interface CreateRunInput {
  researcherId: string;
  promptKey: string;
  promptVersion: string;
  promptSha: string;
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

export interface CompleteRunInput {
  modelScores: ModelScoreInput[];
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
 * Worker: store the model scores and the write-up, derive the consensus
 * score / spread, mark the run COMPLETED and make it the researcher's current
 * run (any previous current run is unset) — all in one transaction.
 */
export async function completeRun(runId: string, input: CompleteRunInput): Promise<AnalysisRunSummary> {
  if (input.modelScores.length === 0) throw new Error("completeRun needs at least one model score");

  const run = await prisma.analysisRun.findUniqueOrThrow({
    where: { id: runId },
    select: { researcherId: true, startedAt: true, researcher: { select: { fieldId: true, field: { select: { weights: true } } } } },
  });
  const weights = toWeights(run.researcher.field.weights);
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
  const score = consensus(weighted);
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

  const updated = await prisma.$transaction(async (tx): Promise<RunWithScores> => {
    await tx.modelScore.deleteMany({ where: { runId } });
    await tx.modelScore.createMany({ data: modelScores.map((m) => ({ runId, ...m })) });
    await tx.analysisRun.updateMany({
      where: { researcherId: run.researcherId, isCurrent: true, NOT: { id: runId } },
      data: { isCurrent: false },
    });
    return tx.analysisRun.update({
      where: { id: runId },
      data: {
        status: "COMPLETED",
        finishedAt,
        durationSec,
        score,
        spread: spread(weighted),
        fieldMedian,
        summary: input.summary ?? null,
        disagreement: input.disagreement ?? null,
        sections: (input.sections ?? []) as unknown as Prisma.InputJsonArray,
        isCurrent: true,
      },
      include: { modelScores: { orderBy: { model: "asc" } } },
    });
  });
  return toRunSummary(updated);
}

/** Worker: mark a run FAILED (it never becomes current). */
export async function failRun(runId: string, finishedAt: Date = new Date()): Promise<void> {
  const run = await prisma.analysisRun.findUniqueOrThrow({ where: { id: runId }, select: { startedAt: true } });
  await prisma.analysisRun.update({
    where: { id: runId },
    data: {
      status: "FAILED",
      isCurrent: false,
      finishedAt,
      durationSec: Math.max(0, Math.round((finishedAt.getTime() - run.startedAt.getTime()) / 1000)),
    },
  });
}

/** Current run of a researcher (completed or not), or null. */
export async function getCurrentRun(researcherId: string): Promise<AnalysisRunSummary | null> {
  const run = await prisma.analysisRun.findFirst({
    where: { researcherId, isCurrent: true },
    include: { modelScores: { orderBy: { model: "asc" } } },
  });
  return run ? toRunSummary(run) : null;
}

/** All runs of a researcher, newest first (provenance / history). */
export async function listRuns(researcherId: string): Promise<AnalysisRunSummary[]> {
  const runs = await prisma.analysisRun.findMany({
    where: { researcherId },
    orderBy: [{ startedAt: "desc" }, { id: "asc" }],
    include: { modelScores: { orderBy: { model: "asc" } } },
  });
  return runs.map(toRunSummary);
}
