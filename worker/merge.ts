// Pure merge logic shared by the pipeline and the unit tests: no database,
// no network. `analyze.ts` re-exports everything here.
//
//  - `mergePaperResults`: the readings of several models of ONE paper →
//    model scores + the median model's summary / strengths / concerns.
//  - `describeDisagreement`: across all reviewed papers, where the models
//    disagree most (paper × criterion) — fed to the synthesis call.
//  - `runProviders` / `mapLimit`: LLM fan-out and bounded concurrency.

import { completeAnalysis, type LlmProvider } from "./llm";
import { errorMessage, logger } from "./log";
import type { SynthesisPaper } from "./prompts";
import type { PaperAnalysisOutput } from "./schema";
import type { ModelScoreInput } from "../src/lib/repositories/runs";
import { CRITERIA, consensus, spread, weightedScore, type Criterion, type CriterionWeights } from "../src/lib/scoring";

export interface ModelResult {
  model: string;
  output: PaperAnalysisOutput;
  weighted: number;
}

/** What is stored for one paper after all models have read it. */
export interface MergedPaper {
  modelScores: ModelScoreInput[];
  /** Consensus: rounded mean of the model weighted scores. */
  score: number;
  /** max − min of the model weighted scores. */
  spread: number;
  summary: string;
  strengths: string[];
  concerns: string[];
}

// ---------------------------------------------------------------------------
// Pure merge helpers (unit-tested)
// ---------------------------------------------------------------------------

export function medianIndex(values: readonly number[]): number {
  const order = values.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v || a.i - b.i);
  return order[Math.floor((order.length - 1) / 2)].i;
}

/**
 * Merge the readings of one paper: every model's scores are kept; the prose
 * (summary, strengths, concerns) comes from the model whose weighted score is
 * the median, so the text matches the consensus rather than an outlier.
 */
export function mergePaperResults(results: readonly ModelResult[], weights: CriterionWeights): MergedPaper {
  if (results.length === 0) throw new Error("mergePaperResults needs at least one model result");
  const weighted = results.map((r) => weightedScore(r.output.scores, weights));
  const medianModel = results[medianIndex(weighted)];
  const modelScores: ModelScoreInput[] = results.map((r, i) => ({
    model: r.model,
    ...r.output.scores,
    weighted: weighted[i],
    rationale: { ...r.output.rationale },
  }));
  return {
    modelScores,
    score: consensus(weighted) as number,
    spread: spread(weighted) as number,
    summary: medianModel.output.summary,
    strengths: medianModel.output.strengths,
    concerns: medianModel.output.concerns,
  };
}

const CRITERION_LABEL: Record<Criterion, string> = {
  rigor: "rigor",
  reproducibility: "reproducibility",
  novelty: "novelty",
  impact: "impact",
  clarity: "clarity",
};

export interface Disagreement {
  /** 0-based index into the papers list. */
  paperIndex: number;
  criterion: Criterion;
  spread: number;
}

/** The (paper, criterion) with the widest spread across models; null with < 2 models everywhere. */
export function widestDisagreement(papers: readonly SynthesisPaper[]): Disagreement | null {
  let worst: Disagreement | null = null;
  papers.forEach((p, paperIndex) => {
    if (p.modelScores.length < 2) return;
    for (const criterion of CRITERIA) {
      const vals = p.modelScores.map((m) => m.scores[criterion]);
      const s = Math.max(...vals) - Math.min(...vals);
      if (!worst || s > worst.spread) worst = { paperIndex, criterion, spread: s };
    }
  });
  return worst;
}

/**
 * Markdown paragraph describing where the models disagree most across the
 * reviewed papers: the paper and criterion with the largest spread, which
 * model is the outlier (farthest from the others' mean) and its rationale.
 * Null when no paper was read by at least two models.
 */
export function describeDisagreement(papers: readonly SynthesisPaper[]): string | null {
  const worst = widestDisagreement(papers);
  if (!worst) return null;
  const paper = papers[worst.paperIndex];
  const models = paper.modelScores.length;
  if (worst.spread === 0) {
    return `All ${models} models agree on every criterion of every reviewed publication; there is no notable disagreement.`;
  }
  const { criterion, spread: s } = worst;
  const vals = paper.modelScores.map((m) => m.scores[criterion]);
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
  const outlier = paper.modelScores[outlierIdx];
  const others = paper.modelScores.filter((_, i) => i !== outlierIdx);
  const othersMean = Math.round(others.reduce((a, m) => a + m.scores[criterion], 0) / others.length);
  const direction = outlier.scores[criterion] > othersMean ? "higher" : "lower";
  const label = CRITERION_LABEL[criterion];
  const othersList = others.map((m) => `${m.model} (${m.scores[criterion]})`).join(", ");
  const why = (outlier.rationale[criterion] ?? "").trim();
  return (
    `The models disagree most on **${label}** of [${worst.paperIndex + 1}] "${paper.title}" (spread ${s} points). ` +
    `**${outlier.model}** scored it ${outlier.scores[criterion]}, ${direction} than ${othersList}` +
    ` — on average ${othersMean}.` +
    (why ? ` Its reasoning: "${why}"` : "")
  );
}

/** Map with at most `limit` promises in flight; results keep the input order. */
export async function mapLimit<T, R>(items: readonly T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}

// ---------------------------------------------------------------------------
// LLM fan-out (one paper, every provider)
// ---------------------------------------------------------------------------

export async function runProviders(
  providers: readonly LlmProvider[],
  system: string,
  user: string,
  weights: CriterionWeights,
  context: Record<string, unknown> = {},
): Promise<ModelResult[]> {
  if (providers.length === 0) throw new Error("No LLM providers configured");
  const settled = await Promise.allSettled(
    providers.map(async (p): Promise<ModelResult> => {
      const started = Date.now();
      const output = await completeAnalysis(p, system, user);
      const weighted = weightedScore(output.scores, weights);
      logger.debug("model completed", { ...context, model: p.id, ms: Date.now() - started, weighted });
      return { model: p.id, output, weighted };
    }),
  );
  const results: ModelResult[] = [];
  const failures: string[] = [];
  settled.forEach((s, i) => {
    if (s.status === "fulfilled") results.push(s.value);
    else {
      failures.push(`${providers[i].id}: ${errorMessage(s.reason)}`);
      logger.warn("model failed", { ...context, model: providers[i].id, error: errorMessage(s.reason) });
    }
  });
  if (results.length === 0) throw new Error(`All LLM providers failed — ${failures.join(" | ")}`);
  return results;
}
