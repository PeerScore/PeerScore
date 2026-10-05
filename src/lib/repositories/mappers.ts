// Internal: Prisma row → plain DTO mappers shared by the repositories.
import type { Prisma } from "@prisma/client";
import { CRITERIA, scoreBand, type CriterionWeights, DEFAULT_WEIGHTS } from "../scoring";
import type {
  AnalysisRunSummary,
  AnalysisSection,
  FeaturedResearcher,
  FieldRef,
  FieldSummary,
  ModelAverage,
  ModelScoreSummary,
  PublicationAnalysisSummary,
  ResearcherPublication,
  ResearcherStatus,
  ResearcherSummary,
} from "../types";

/** Shape used by list / summary queries (run columns only, no nested analyses). */
export const researcherSummaryInclude = {
  field: { select: { slug: true, name: true } },
  runs: { where: { isCurrent: true }, take: 1 },
  _count: { select: { runs: { where: { status: "RUNNING" } } } },
} satisfies Prisma.ResearcherInclude;

export type ResearcherSummaryRow = Prisma.ResearcherGetPayload<{
  include: typeof researcherSummaryInclude;
}>;

type RunRow = ResearcherSummaryRow["runs"][number];

/** Completed per-publication analyses of a run, with their model scores. */
export const runAnalysesInclude = {
  publicationAnalyses: {
    where: { status: "COMPLETED" },
    include: { modelScores: { orderBy: { model: "asc" } } },
  },
} satisfies Prisma.AnalysisRunInclude;

export type RunWithAnalysesRow = Prisma.AnalysisRunGetPayload<{ include: typeof runAnalysesInclude }>;

export type ModelScoreRow = RunWithAnalysesRow["publicationAnalyses"][number]["modelScores"][number];

export type PublicationAnalysisRow = Prisma.PublicationAnalysisGetPayload<{
  include: { modelScores: true };
}>;

export function toWeights(json: Prisma.JsonValue | null | undefined): CriterionWeights {
  const out: CriterionWeights = { ...DEFAULT_WEIGHTS };
  if (json && typeof json === "object" && !Array.isArray(json)) {
    for (const key of CRITERIA) {
      const v = (json as Record<string, unknown>)[key];
      if (typeof v === "number" && Number.isFinite(v) && v >= 0) out[key] = v;
    }
  }
  return out;
}

export function toSections(json: Prisma.JsonValue | null | undefined): AnalysisSection[] {
  if (!Array.isArray(json)) return [];
  const sections: AnalysisSection[] = [];
  for (const item of json) {
    if (item && typeof item === "object" && !Array.isArray(item)) {
      const { title, body } = item as Record<string, unknown>;
      if (typeof title === "string" && typeof body === "string") sections.push({ title, body });
    }
  }
  return sections;
}

export function toStringList(json: Prisma.JsonValue | null | undefined): string[] {
  return Array.isArray(json) ? json.filter((v): v is string => typeof v === "string") : [];
}

function toRationale(json: Prisma.JsonValue | null | undefined): Record<string, unknown> {
  return json && typeof json === "object" && !Array.isArray(json)
    ? (json as Record<string, unknown>)
    : {};
}

export function toModelScore(row: ModelScoreRow): ModelScoreSummary {
  return {
    model: row.model,
    rigor: row.rigor,
    reproducibility: row.reproducibility,
    novelty: row.novelty,
    impact: row.impact,
    clarity: row.clarity,
    weighted: row.weighted,
    rationale: toRationale(row.rationale),
  };
}

/** Per-model criterion averages over a set of publication analyses (A→Z by model). */
export function modelAverages(analyses: readonly { modelScores: readonly ModelScoreRow[] }[]): ModelAverage[] {
  const acc = new Map<string, { n: number; sums: Record<string, number> }>();
  for (const a of analyses) {
    for (const m of a.modelScores) {
      const entry = acc.get(m.model) ?? { n: 0, sums: Object.fromEntries([...CRITERIA, "weighted"].map((k) => [k, 0])) };
      entry.n += 1;
      for (const c of CRITERIA) entry.sums[c] += m[c];
      entry.sums.weighted += m.weighted;
      acc.set(m.model, entry);
    }
  }
  return [...acc.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([model, { n, sums }]) => ({
      model,
      publications: n,
      rigor: Math.round(sums.rigor / n),
      reproducibility: Math.round(sums.reproducibility / n),
      novelty: Math.round(sums.novelty / n),
      impact: Math.round(sums.impact / n),
      clarity: Math.round(sums.clarity / n),
      weighted: Math.round(sums.weighted / n),
    }));
}

export function toPublicationAnalysis(row: PublicationAnalysisRow): PublicationAnalysisSummary {
  return {
    id: row.id,
    runId: row.runId,
    status: row.status,
    score: row.score,
    band: row.score === null ? null : scoreBand(row.score),
    spread: row.spread,
    summary: row.summary,
    strengths: toStringList(row.strengths),
    concerns: toStringList(row.concerns),
    modelScores: [...row.modelScores].sort((a, b) => a.model.localeCompare(b.model)).map(toModelScore),
    finishedAt: row.finishedAt ? row.finishedAt.toISOString() : null,
  };
}

export function toRunSummary(run: RunRow & Partial<Pick<RunWithAnalysesRow, "publicationAnalyses">>): AnalysisRunSummary {
  return {
    id: run.id,
    status: run.status,
    promptKey: run.promptKey,
    promptVersion: run.promptVersion,
    promptSha: run.promptSha,
    models: run.models,
    startedAt: run.startedAt.toISOString(),
    finishedAt: run.finishedAt ? run.finishedAt.toISOString() : null,
    durationSec: run.durationSec,
    score: run.score,
    band: run.score === null ? null : scoreBand(run.score),
    spread: run.spread,
    fieldMedian: run.fieldMedian,
    publicationsAnalyzed: run.publicationsAnalyzed,
    summary: run.summary,
    disagreement: run.disagreement,
    sections: toSections(run.sections),
    modelAverages: modelAverages(run.publicationAnalyses ?? []),
  };
}

/** The current run counts as "live" only when it completed with a score. */
export function liveRun<R extends RunRow>(row: { runs: R[] }): R | null {
  const run = row.runs[0];
  return run && run.status === "COMPLETED" ? run : null;
}

export function deriveStatus(row: ResearcherSummaryRow): ResearcherStatus {
  if (liveRun(row)) return "published";
  if (row._count.runs > 0) return "analyzing";
  return "pending";
}

export function toFieldRef(field: { slug: string; name: string }): FieldRef {
  return { slug: field.slug, name: field.name };
}

export function toFieldSummary(
  field: { id: string; slug: string; name: string; promptKey: string; weights: Prisma.JsonValue },
  counts: { researcherCount: number; publishedCount: number },
): FieldSummary {
  return {
    id: field.id,
    slug: field.slug,
    name: field.name,
    promptKey: field.promptKey,
    weights: toWeights(field.weights),
    ...counts,
  };
}

export function toResearcherSummary(row: ResearcherSummaryRow): ResearcherSummary {
  const run = liveRun(row);
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    affiliation: row.affiliation,
    country: row.country,
    field: toFieldRef(row.field),
    status: deriveStatus(row),
    score: run?.score ?? null,
    band: run && run.score !== null ? scoreBand(run.score) : null,
    spread: run?.spread ?? null,
    publicationsAnalyzed: run ? run.publicationsAnalyzed : null,
    publicationCount: row.publicationCount,
    openCodeCount: row.openCodeCount,
    topics: row.topics,
    publishedAt: run?.finishedAt ? run.finishedAt.toISOString() : null,
  };
}

export function toFeatured(row: ResearcherSummaryRow): FeaturedResearcher {
  const run = liveRun(row);
  return {
    ...toResearcherSummary(row),
    summary: run?.summary ?? null,
    models: run?.models ?? [],
  };
}

export function toPublication(
  row: {
    id: string;
    title: string;
    year: number;
    venue: string | null;
    doi: string | null;
    url: string | null;
    abstract: string | null;
    hasCode: boolean;
    citationCount: number;
    openalexId: string | null;
  },
  analysis: PublicationAnalysisRow | null = null,
): ResearcherPublication {
  return {
    id: row.id,
    title: row.title,
    year: row.year,
    venue: row.venue,
    doi: row.doi,
    url: row.url,
    abstract: row.abstract,
    hasCode: row.hasCode,
    citationCount: row.citationCount,
    openalexId: row.openalexId,
    analysis: analysis ? toPublicationAnalysis(analysis) : null,
  };
}
