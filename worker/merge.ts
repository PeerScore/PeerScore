// Pure merge logic shared by the pipeline and the unit tests: no database,
// no network. `analyze.ts` re-exports everything here.

import { completeAnalysis, type LlmProvider } from "./llm";
import { errorMessage, logger } from "./log";
import type { AnalysisOutput } from "./schema";
import type { ModelScoreInput } from "../src/lib/repositories/runs";
import { CRITERIA, weightedScore, type Criterion, type CriterionWeights } from "../src/lib/scoring";
import type { AnalysisSection } from "../src/lib/types";

export interface ModelResult {
  model: string;
  output: AnalysisOutput;
  weighted: number;
}

export interface MergedAnalysis {
  modelScores: ModelScoreInput[];
  summary: string;
  disagreement: string | null;
  sections: AnalysisSection[];
  /** Per-publication mean score (index-aligned), null when no model provided them. */
  publicationScores: (number | null)[];
}

// ---------------------------------------------------------------------------
// Pure merge helpers (unit-tested)
// ---------------------------------------------------------------------------

export function medianIndex(values: readonly number[]): number {
  const order = values.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v || a.i - b.i);
  return order[Math.floor((order.length - 1) / 2)].i;
}

const CRITERION_LABEL: Record<Criterion, string> = {
  rigor: "rigor",
  reproducibility: "reproducibility",
  novelty: "novelty",
  impact: "impact",
  clarity: "clarity",
};

/**
 * Markdown paragraph describing where the models disagree most: the criterion
 * with the largest spread, which model is the outlier (farthest from the
 * others' mean) and its rationale. Null with fewer than two models.
 */
export function describeDisagreement(results: readonly ModelResult[]): string | null {
  if (results.length < 2) return null;
  let worst: { criterion: Criterion; spread: number } | null = null;
  for (const c of CRITERIA) {
    const vals = results.map((r) => r.output.scores[c]);
    const s = Math.max(...vals) - Math.min(...vals);
    if (!worst || s > worst.spread) worst = { criterion: c, spread: s };
  }
  if (!worst) return null;
  const { criterion, spread } = worst;
  if (spread === 0) {
    return `All ${results.length} models agree on every criterion; there is no notable disagreement.`;
  }
  const vals = results.map((r) => r.output.scores[criterion]);
  const total = vals.reduce((a, b) => a + b, 0);
  let outlierIdx = 0;
  let outlierDist = -1;
  vals.forEach((v, i) => {
    const othersMean = (total - v) / (vals.length - 1);
    const dist = Math.abs(v - othersMean);
    if (dist > outlierDist) {
      outlierDist = dist;
      outlierIdx = i;
    }
  });
  const outlier = results[outlierIdx];
  const others = results.filter((_, i) => i !== outlierIdx);
  const othersMean = Math.round(others.reduce((a, r) => a + r.output.scores[criterion], 0) / others.length);
  const direction = outlier.output.scores[criterion] > othersMean ? "higher" : "lower";
  const label = CRITERION_LABEL[criterion];
  const othersList = others.map((r) => `${r.model} (${r.output.scores[criterion]})`).join(", ");
  const why = outlier.output.rationale[criterion].trim();
  return (
    `The models disagree most on **${label}** (spread ${spread} points). ` +
    `**${outlier.model}** scored it ${outlier.output.scores[criterion]}, ${direction} than ${othersList}` +
    ` — on average ${othersMean}. Its reasoning: "${why}"`
  );
}

/** Element-wise mean of the per-publication scores the models returned (null when none did). */
export function mergePublicationScores(results: readonly ModelResult[], count: number): (number | null)[] {
  const sums = new Array<number>(count).fill(0);
  const counts = new Array<number>(count).fill(0);
  for (const r of results) {
    const ps = r.output.publicationScores;
    if (!ps || ps.length === 0) continue;
    for (let i = 0; i < Math.min(count, ps.length); i++) {
      sums[i] += ps[i];
      counts[i] += 1;
    }
  }
  return sums.map((s, i) => (counts[i] > 0 ? Math.round(s / counts[i]) : null));
}

export function mergeResults(results: readonly ModelResult[], weights: CriterionWeights, publicationCount: number): MergedAnalysis {
  if (results.length === 0) throw new Error("mergeResults needs at least one model result");
  const medianModel = results[medianIndex(results.map((r) => r.weighted))];
  const modelScores: ModelScoreInput[] = results.map((r) => ({
    model: r.model,
    ...r.output.scores,
    weighted: weightedScore(r.output.scores, weights),
    rationale: {
      ...r.output.rationale,
      strengths: r.output.strengths,
      concerns: r.output.concerns,
    },
  }));
  return {
    modelScores,
    summary: medianModel.output.summary,
    disagreement: describeDisagreement(results),
    sections: medianModel.output.sections.map((s) => ({ title: s.title, body: s.body })),
    publicationScores: mergePublicationScores(results, publicationCount),
  };
}

// ---------------------------------------------------------------------------
// LLM fan-out
// ---------------------------------------------------------------------------

export async function runProviders(
  providers: readonly LlmProvider[],
  system: string,
  user: string,
  weights: CriterionWeights,
): Promise<ModelResult[]> {
  if (providers.length === 0) throw new Error("No LLM providers configured");
  const settled = await Promise.allSettled(
    providers.map(async (p): Promise<ModelResult> => {
      const started = Date.now();
      const output = await completeAnalysis(p, system, user);
      logger.info("model completed", { model: p.id, ms: Date.now() - started, weighted: weightedScore(output.scores, weights) });
      return { model: p.id, output, weighted: weightedScore(output.scores, weights) };
    }),
  );
  const results: ModelResult[] = [];
  const failures: string[] = [];
  settled.forEach((s, i) => {
    if (s.status === "fulfilled") results.push(s.value);
    else {
      failures.push(`${providers[i].id}: ${errorMessage(s.reason)}`);
      logger.warn("model failed", { model: providers[i].id, error: errorMessage(s.reason) });
    }
  });
  if (results.length === 0) throw new Error(`All LLM providers failed — ${failures.join(" | ")}`);
  return results;
}
