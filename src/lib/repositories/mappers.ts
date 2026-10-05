// Internal: Prisma row → plain DTO mappers shared by the repositories.
import type { Prisma } from "@prisma/client";
import { CRITERIA, scoreBand, type CriterionWeights, DEFAULT_WEIGHTS } from "../scoring";
import type {
  AnalysisRunSummary,
  AnalysisSection,
  FeaturedResearcher,
  FieldRef,
  FieldSummary,
  ModelScoreSummary,
  ResearcherPublication,
  ResearcherStatus,
  ResearcherSummary,
} from "../types";

/** Shape used by list / summary queries. */
export const researcherSummaryInclude = {
  field: { select: { slug: true, name: true } },
  runs: {
    where: { isCurrent: true },
    take: 1,
    include: { modelScores: { orderBy: { model: "asc" } } },
  },
  _count: { select: { runs: { where: { status: "RUNNING" } } } },
} satisfies Prisma.ResearcherInclude;

export type ResearcherSummaryRow = Prisma.ResearcherGetPayload<{
  include: typeof researcherSummaryInclude;
}>;

type RunRow = ResearcherSummaryRow["runs"][number];

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

function toRationale(json: Prisma.JsonValue | null | undefined): Record<string, unknown> {
  return json && typeof json === "object" && !Array.isArray(json)
    ? (json as Record<string, unknown>)
    : {};
}

export function toModelScore(row: RunRow["modelScores"][number]): ModelScoreSummary {
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

export function toRunSummary(run: RunRow): AnalysisRunSummary {
  return {
    id: run.id,
    status: run.status,
    promptKey: run.promptKey,
    promptVersion: run.promptVersion,
    promptSha: run.promptSha,
    startedAt: run.startedAt.toISOString(),
    finishedAt: run.finishedAt ? run.finishedAt.toISOString() : null,
    durationSec: run.durationSec,
    score: run.score,
    band: run.score === null ? null : scoreBand(run.score),
    spread: run.spread,
    fieldMedian: run.fieldMedian,
    summary: run.summary,
    disagreement: run.disagreement,
    sections: toSections(run.sections),
    modelScores: run.modelScores.map(toModelScore),
  };
}

/** The current run counts as "live" only when it completed with a score. */
export function liveRun(row: { runs: RunRow[] }): RunRow | null {
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
    modelScores: run ? run.modelScores.map(toModelScore) : [],
  };
}

export function toPublication(row: {
  id: string;
  title: string;
  year: number;
  venue: string | null;
  doi: string | null;
  url: string | null;
  abstract: string | null;
  hasCode: boolean;
  score: number | null;
}): ResearcherPublication {
  return {
    id: row.id,
    title: row.title,
    year: row.year,
    venue: row.venue,
    doi: row.doi,
    url: row.url,
    abstract: row.abstract,
    hasCode: row.hasCode,
    score: row.score,
  };
}
