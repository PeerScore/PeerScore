// Pipeline orchestration: OpenAlex resolution → one LLM review per
// publication (every provider, bounded concurrency) → researcher-level
// synthesis (one call) → aggregate + persist through the repositories.

import { getFieldBySlug, upsertField } from "../src/lib/repositories/fields";
import { replacePublications, upsertResearcher, type PublicationInput, type StoredPublication } from "../src/lib/repositories/researchers";
import {
  completePublicationAnalysis,
  completeRun,
  createPublicationAnalysis,
  createRun,
  failPublicationAnalysis,
  failRun,
} from "../src/lib/repositories/runs";
import { attachResearcher, setSubmissionStatus } from "../src/lib/repositories/submissions";
import { aggregateResearcherScore, type CriterionWeights } from "../src/lib/scoring";
import type { SubmissionStatus, SubmissionSummary } from "../src/lib/types";
import { GENERAL_FIELD } from "./fields";
import { buildProviders, completeSynthesis, type LlmProvider } from "./llm";
import { errorMessage, logger } from "./log";
import { describeDisagreement, mapLimit, mergePaperResults, runProviders, type MergedPaper } from "./merge";
import { buildPaperMessage, buildSynthesisMessage, loadPrompt, loadSynthesisPrompt, type PromptResearcher, type SynthesisPaper } from "./prompts";
import type { SynthesisOutput } from "./schema";
import { maxPublications, resolveResearcher, type OpenAlexResolution, type ResolvedPublication } from "./sources/openalex";

export * from "./merge";

/** Number of publications reviewed at the same time (each one fans out to every provider). */
export const PAPER_CONCURRENCY = Math.max(1, Number(process.env.PAPER_CONCURRENCY ?? 3) || 3);

/** Ensure the fallback "general" field row exists (idempotent). */
export async function ensureGeneralField(): Promise<void> {
  await upsertField({ ...GENERAL_FIELD, weights: { ...GENERAL_FIELD.weights } });
}

// ---------------------------------------------------------------------------
// Full pipeline for one submission
// ---------------------------------------------------------------------------

export interface ProcessOptions {
  providers?: LlmProvider[];
  resolve?: (name: string) => Promise<OpenAlexResolution>;
  /** Override PAPER_CONCURRENCY. */
  concurrency?: number;
}

export interface PublicationResult {
  publicationId: string;
  title: string;
  citationCount: number;
  /** Null when every provider failed on this paper (analysis FAILED, excluded). */
  score: number | null;
  spread: number | null;
}

export interface ProcessResult {
  submissionId: string;
  researcherId: string;
  slug: string;
  runId: string;
  score: number | null;
  spread: number | null;
  models: string[];
  publicationsAnalyzed: number;
  publications: PublicationResult[];
}

async function step(submissionId: string, status: SubmissionStatus): Promise<void> {
  await setSubmissionStatus(submissionId, status);
  logger.info("submission status", { submissionId, status });
}

/**
 * Turn a claimed submission (already RESOLVING) into a published researcher.
 * Throws after marking the submission FAILED (and the run FAILED when one
 * was opened).
 */
export async function processSubmission(submission: SubmissionSummary, options: ProcessOptions = {}): Promise<ProcessResult> {
  const { id: submissionId, name } = submission;
  const resolve = options.resolve ?? resolveResearcher;
  const providers = options.providers ?? buildProviders();
  const concurrency = options.concurrency ?? PAPER_CONCURRENCY;
  let runId: string | null = null;

  try {
    // RESOLVING (set by claimNextSubmission) → find the researcher and their works.
    const resolved = await resolve(name);
    const { researcher } = resolved;
    const publications = resolved.publications.slice(0, maxPublications());
    logger.info("resolved researcher", {
      submissionId,
      name,
      openalexId: researcher.openalexId,
      field: researcher.fieldSlug,
      works: publications.length,
    });
    if (publications.length === 0) throw new Error(`No usable publication found for "${name}"`);

    // FETCHING → persist researcher + publications.
    await step(submissionId, "FETCHING");
    await ensureGeneralField();
    let field = await getFieldBySlug(researcher.fieldSlug);
    if (!field) {
      logger.warn("field not found, using general", { field: researcher.fieldSlug });
      field = await getFieldBySlug(GENERAL_FIELD.slug);
      if (!field) throw new Error("General field could not be created");
    }
    const { id: researcherId, slug } = await upsertResearcher({
      name: researcher.name,
      fieldSlug: field.slug,
      affiliation: researcher.affiliation,
      country: researcher.country,
      orcid: researcher.orcid,
      openalexId: researcher.openalexId,
      activeFrom: researcher.activeFrom,
      activeTo: researcher.activeTo,
      topics: researcher.topics,
    });
    await attachResearcher(submissionId, researcherId);
    const stored = await replacePublications(researcherId, publications.map(toPublicationInput));

    // ANALYZING → one review per publication, then the synthesis.
    await step(submissionId, "ANALYZING");
    const prompt = loadPrompt(field.promptKey);
    const run = await createRun({
      researcherId,
      promptKey: prompt.promptKey,
      promptVersion: prompt.version,
      promptSha: prompt.sha,
      models: providers.map((p) => p.id),
    });
    runId = run.id;

    const papers = await analyzePublications({
      runId,
      researcher,
      fieldName: field.name,
      weights: field.weights,
      system: prompt.system,
      providers,
      publications,
      stored,
      concurrency,
    });
    const reviewed = papers.filter((p): p is ReviewedPaper => p.merged !== null);
    if (reviewed.length === 0) throw new Error(`No publication could be reviewed for "${name}"`);

    const synthesis = await synthesise({ researcher, fieldName: field.name, papers: reviewed, failedCount: papers.length - reviewed.length, providers });

    const completed = await completeRun(runId, {
      summary: synthesis.summary,
      disagreement: synthesis.disagreement || null,
      sections: synthesis.sections.map((s) => ({ title: s.title, body: s.body })),
    });

    await step(submissionId, "PUBLISHED");
    return {
      submissionId,
      researcherId,
      slug,
      runId,
      score: completed.score,
      spread: completed.spread,
      models: [...new Set(reviewed.flatMap((p) => p.merged.modelScores.map((m) => m.model)))],
      publicationsAnalyzed: completed.publicationsAnalyzed,
      publications: papers.map((p) => ({
        publicationId: p.stored.id,
        title: p.stored.title,
        citationCount: p.stored.citationCount,
        score: p.merged?.score ?? null,
        spread: p.merged?.spread ?? null,
      })),
    };
  } catch (err) {
    const message = errorMessage(err).slice(0, 1000);
    logger.error("submission failed", { submissionId, name, error: message });
    if (runId) await failRun(runId).catch((e) => logger.error("failRun failed", { runId, error: errorMessage(e) }));
    await setSubmissionStatus(submissionId, "FAILED", message).catch((e) =>
      logger.error("setSubmissionStatus failed", { submissionId, error: errorMessage(e) }),
    );
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Per-publication reviews
// ---------------------------------------------------------------------------

interface PaperOutcome {
  publication: ResolvedPublication;
  stored: StoredPublication;
  /** Null when the paper could not be reviewed (its analysis is FAILED). */
  merged: MergedPaper | null;
}

type ReviewedPaper = PaperOutcome & { merged: MergedPaper };

interface AnalyzeInput {
  runId: string;
  researcher: PromptResearcher;
  fieldName: string;
  weights: CriterionWeights;
  system: string;
  providers: LlmProvider[];
  publications: ResolvedPublication[];
  stored: StoredPublication[];
  concurrency: number;
}

/**
 * Review every publication with every provider, `concurrency` papers at a
 * time. A paper needs at least one successful model; otherwise its analysis
 * is marked FAILED and it is excluded from the aggregate. Never throws for a
 * single paper.
 */
async function analyzePublications(input: AnalyzeInput): Promise<PaperOutcome[]> {
  const { runId, researcher, fieldName, weights, system, providers, publications, stored, concurrency } = input;
  return mapLimit(publications, concurrency, async (publication, i): Promise<PaperOutcome> => {
    const row = stored[i];
    const analysis = await createPublicationAnalysis(runId, row.id);
    const context = { runId, publicationId: row.id, index: i + 1, of: publications.length };
    try {
      const user = buildPaperMessage(researcher, publication, fieldName);
      const results = await runProviders(providers, system, user, weights, context);
      const merged = mergePaperResults(results, weights);
      await completePublicationAnalysis(analysis.id, {
        modelScores: merged.modelScores,
        summary: merged.summary,
        strengths: merged.strengths,
        concerns: merged.concerns,
      });
      logger.info("publication reviewed", { ...context, score: merged.score, spread: merged.spread, models: results.length });
      return { publication, stored: row, merged };
    } catch (err) {
      logger.warn("publication review failed", { ...context, title: row.title, error: errorMessage(err) });
      await failPublicationAnalysis(analysis.id).catch((e) => logger.error("failPublicationAnalysis failed", { ...context, error: errorMessage(e) }));
      return { publication, stored: row, merged: null };
    }
  });
}

// ---------------------------------------------------------------------------
// Synthesis (one call, first provider that answers)
// ---------------------------------------------------------------------------

export function toSynthesisPaper(p: ReviewedPaper): SynthesisPaper {
  return {
    title: p.stored.title,
    year: p.stored.year,
    venue: p.publication.venue,
    citationCount: p.stored.citationCount,
    hasCode: p.stored.hasCode,
    score: p.merged.score,
    spread: p.merged.spread,
    summary: p.merged.summary,
    strengths: p.merged.strengths,
    concerns: p.merged.concerns,
    modelScores: p.merged.modelScores.map((m) => ({
      model: m.model,
      weighted: m.weighted as number,
      scores: { rigor: m.rigor, reproducibility: m.reproducibility, novelty: m.novelty, impact: m.impact, clarity: m.clarity },
      rationale: Object.fromEntries(Object.entries(m.rationale ?? {}).filter((e): e is [string, string] => typeof e[1] === "string")),
    })),
  };
}

async function synthesise(input: {
  researcher: PromptResearcher;
  fieldName: string;
  papers: ReviewedPaper[];
  failedCount: number;
  providers: LlmProvider[];
}): Promise<SynthesisOutput> {
  const papers = [...input.papers].sort((a, b) => b.stored.citationCount - a.stored.citationCount).map(toSynthesisPaper);
  const prompt = loadSynthesisPrompt();
  const user = buildSynthesisMessage({
    researcher: input.researcher,
    fieldName: input.fieldName,
    papers,
    aggregateScore: aggregateResearcherScore(papers),
    disagreement: describeDisagreement(papers),
    failedCount: input.failedCount,
  });
  const failures: string[] = [];
  for (const provider of input.providers) {
    const started = Date.now();
    try {
      const out = await completeSynthesis(provider, prompt.system, user);
      logger.info("synthesis completed", { model: provider.id, ms: Date.now() - started, papers: papers.length });
      return out;
    } catch (err) {
      failures.push(`${provider.id}: ${errorMessage(err)}`);
      logger.warn("synthesis failed", { model: provider.id, error: errorMessage(err) });
    }
  }
  throw new Error(`Synthesis failed with every provider — ${failures.join(" | ")}`);
}

function toPublicationInput(p: ResolvedPublication): PublicationInput {
  return {
    title: p.title,
    year: p.year,
    venue: p.venue,
    doi: p.doi,
    url: p.url,
    abstract: p.abstract,
    hasCode: p.hasCode,
    citationCount: p.citedBy,
    openalexId: p.openalexId ?? null,
  };
}
