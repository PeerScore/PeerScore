// Pure scoring helpers shared by the web app, the worker and the seed script.
// All scores are integers in 0–100 (see docs/SPEC.md).

export const CRITERIA = [
  "rigor",
  "reproducibility",
  "novelty",
  "impact",
  "clarity",
] as const;

export type Criterion = (typeof CRITERIA)[number];

/** Per-criterion scores (0–100). */
export type CriterionScores = Record<Criterion, number>;

/** Per-criterion weights; they are normalised, so they do not have to sum to 1. */
export type CriterionWeights = Record<Criterion, number>;

export type ScoreBand = "high" | "mid" | "low";

export const DEFAULT_WEIGHTS: CriterionWeights = {
  rigor: 0.25,
  reproducibility: 0.2,
  novelty: 0.2,
  impact: 0.2,
  clarity: 0.15,
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Weighted average of the five criterion scores, rounded to an integer 0–100.
 * Weights are normalised by their sum; if the sum is 0 the plain mean is used.
 */
export function weightedScore(
  scores: CriterionScores,
  weights: CriterionWeights = DEFAULT_WEIGHTS,
): number {
  let total = 0;
  let weightSum = 0;
  for (const key of CRITERIA) {
    const w = Number(weights[key]) || 0;
    const s = Number(scores[key]) || 0;
    if (w < 0) throw new RangeError(`Negative weight for "${key}"`);
    total += w * s;
    weightSum += w;
  }
  if (weightSum === 0) {
    const mean = CRITERIA.reduce((acc, k) => acc + (Number(scores[k]) || 0), 0) / CRITERIA.length;
    return clamp(Math.round(mean), 0, 100);
  }
  return clamp(Math.round(total / weightSum), 0, 100);
}

/**
 * Consensus score: mean of the per-model weighted scores, rounded.
 * Returns null when there are no model scores.
 */
export function consensus(modelWeightedScores: readonly number[]): number | null {
  if (modelWeightedScores.length === 0) return null;
  const sum = modelWeightedScores.reduce((acc, v) => acc + v, 0);
  return clamp(Math.round(sum / modelWeightedScores.length), 0, 100);
}

/**
 * Spread: max − min of the per-model weighted scores.
 * Returns null when there are no model scores.
 */
export function spread(modelWeightedScores: readonly number[]): number | null {
  if (modelWeightedScores.length === 0) return null;
  return Math.max(...modelWeightedScores) - Math.min(...modelWeightedScores);
}

/** Score band used by the design tokens: high ≥ 70, mid 50–69, low < 50. */
export function scoreBand(score: number): ScoreBand {
  if (score >= 70) return "high";
  if (score >= 50) return "mid";
  return "low";
}

/**
 * URL-safe slug from a person's name: lower-case ASCII, diacritics stripped,
 * non-alphanumerics collapsed to single hyphens. "Leïla Haddad-Ž" → "leila-haddad-z".
 */
export function slugify(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[ßẞ]/g, "ss")
    .replace(/[æÆ]/g, "ae")
    .replace(/[øØ]/g, "o")
    .replace(/[đĐ]/g, "d")
    .replace(/[łŁ]/g, "l")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Median of a list of integers, rounded; null for an empty list. */
export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]
    : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}
