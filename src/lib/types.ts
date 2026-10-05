// Plain TypeScript types returned by the repositories (src/lib/repositories/*)
// and consumed by the UI / API routes. UI code should import from here, never
// from @prisma/client. Dates are ISO-8601 strings so values are serialisable
// across the server/client boundary.

import type { Criterion, CriterionScores, CriterionWeights, ScoreBand } from "./scoring";

export type { Criterion, CriterionScores, CriterionWeights, ScoreBand };

export type SubmissionStatus =
  | "QUEUED"
  | "RESOLVING"
  | "FETCHING"
  | "ANALYZING"
  | "PUBLISHED"
  | "FAILED";

export const SUBMISSION_STATUSES: readonly SubmissionStatus[] = [
  "QUEUED",
  "RESOLVING",
  "FETCHING",
  "ANALYZING",
  "PUBLISHED",
  "FAILED",
];

export type RunStatus = "RUNNING" | "COMPLETED" | "FAILED";

/**
 * Derived researcher status for the index filters:
 * - `published`: has a current, completed analysis run (article is live)
 * - `analyzing`: has a run in progress and no published article yet
 * - `pending`: indexed but no analysis yet
 */
export type ResearcherStatus = "published" | "analyzing" | "pending";

export const RESEARCHER_STATUSES: readonly ResearcherStatus[] = ["published", "analyzing", "pending"];

export type ResearcherSort = "score" | "name" | "recent";

export const RESEARCHER_SORTS: readonly ResearcherSort[] = ["score", "name", "recent"];

export interface FieldRef {
  slug: string;
  name: string;
}

export interface FieldSummary extends FieldRef {
  id: string;
  promptKey: string;
  weights: CriterionWeights;
  /** Number of researchers attached to the field. */
  researcherCount: number;
  /** Number of researchers with a live (current, completed) analysis. */
  publishedCount: number;
}

/** One row of the researcher index / cards on the home page. */
export interface ResearcherSummary {
  id: string;
  slug: string;
  name: string;
  affiliation: string | null;
  country: string | null;
  field: FieldRef;
  status: ResearcherStatus;
  /** Weighted consensus 0–100 of the current run, null when not published. */
  score: number | null;
  band: ScoreBand | null;
  /** max − min of the model weighted scores of the current run. */
  spread: number | null;
  publicationCount: number;
  openCodeCount: number;
  topics: string[];
  /** ISO date the current analysis finished, null when not published. */
  publishedAt: string | null;
}

export interface FeaturedResearcher extends ResearcherSummary {
  /** Markdown summary of the current run (first paragraph is a good teaser). */
  summary: string | null;
  modelScores: ModelScoreSummary[];
}

export interface ModelScoreSummary extends CriterionScores {
  model: string;
  weighted: number;
  /** Free-form per-criterion rationale, typically { [criterion]: string }. */
  rationale: Record<string, unknown>;
}

export interface AnalysisSection {
  title: string;
  body: string; // markdown
}

export interface AnalysisRunSummary {
  id: string;
  status: RunStatus;
  promptKey: string;
  promptVersion: string;
  promptSha: string;
  startedAt: string;
  finishedAt: string | null;
  durationSec: number | null;
  score: number | null;
  band: ScoreBand | null;
  spread: number | null;
  fieldMedian: number | null;
  summary: string | null; // markdown
  disagreement: string | null; // markdown
  sections: AnalysisSection[];
  modelScores: ModelScoreSummary[];
}

export interface ResearcherPublication {
  id: string;
  title: string;
  year: number;
  venue: string | null;
  doi: string | null;
  url: string | null;
  abstract: string | null;
  hasCode: boolean;
  score: number | null;
}

/** Everything the article page (/researchers/[slug]) and the JSON export need. */
export interface ResearcherArticle {
  id: string;
  slug: string;
  name: string;
  affiliation: string | null;
  country: string | null;
  orcid: string | null;
  openalexId: string | null;
  activeFrom: number | null;
  activeTo: number | null;
  publicationCount: number;
  openCodeCount: number;
  topics: string[];
  createdAt: string;
  updatedAt: string;
  status: ResearcherStatus;
  field: FieldSummary;
  /** Current analysis run, null when the researcher has not been analysed yet. */
  run: AnalysisRunSummary | null;
  publications: ResearcherPublication[];
}

export interface ResearcherListParams {
  /** Free-text search on name / affiliation (case-insensitive contains). */
  q?: string;
  /** Field slug. */
  field?: string;
  /** Only researchers whose current score is ≥ minScore (implies published). */
  minScore?: number;
  status?: ResearcherStatus;
  /** First letter of the name (A–Z, case-insensitive). */
  letter?: string;
  /** 1-based page. */
  page?: number;
  pageSize?: number;
  /** Default: `score` (published first, best first). */
  sort?: ResearcherSort;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

export interface SiteStats {
  researchers: number;
  published: number;
  fields: number;
  publications: number;
  /** Submissions still in the pipeline (not PUBLISHED / FAILED). */
  queued: number;
  /** Median of all current scores, null when nothing is published. */
  medianScore: number | null;
  /** Number of distinct LLMs that contributed to current runs. */
  models: number;
}

export interface SubmissionSummary {
  id: string;
  name: string;
  status: SubmissionStatus;
  error: string | null;
  /** Slug of the researcher once resolved, null before. */
  researcherSlug: string | null;
  /** 1-based rank among QUEUED submissions, null once processing started. */
  position: number | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Result of submitting a name. When a researcher with the same slug already
 * exists nothing is created and `existingSlug` is returned instead.
 */
export type CreateSubmissionResult =
  | { id: string; position: number; existingSlug?: undefined }
  | { existingSlug: string; id?: undefined; position?: undefined };
