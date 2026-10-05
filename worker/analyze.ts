// Pipeline orchestration: OpenAlex resolution → LLM analysis (all providers in
// parallel) → merge → persist through the repositories.

import { getFieldBySlug, upsertField } from "../src/lib/repositories/fields";
import { replacePublications, upsertResearcher, type PublicationInput } from "../src/lib/repositories/researchers";
import { completeRun, createRun, failRun } from "../src/lib/repositories/runs";
import { attachResearcher, setSubmissionStatus } from "../src/lib/repositories/submissions";
import type { SubmissionStatus, SubmissionSummary } from "../src/lib/types";
import { GENERAL_FIELD } from "./fields";
import { buildProviders, type LlmProvider } from "./llm";
import { errorMessage, logger } from "./log";
import { mergeResults, runProviders } from "./merge";
import { buildUserMessage, loadPrompt } from "./prompts";
import { resolveResearcher, type OpenAlexResolution } from "./sources/openalex";

export * from "./merge";

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
}

export interface ProcessResult {
  submissionId: string;
  researcherId: string;
  slug: string;
  runId: string;
  score: number | null;
  spread: number | null;
  models: string[];
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
  let runId: string | null = null;

  try {
    // RESOLVING (set by claimNextSubmission) → find the researcher and their works.
    const { researcher, publications } = await resolve(name);
    logger.info("resolved researcher", {
      submissionId,
      name,
      openalexId: researcher.openalexId,
      field: researcher.fieldSlug,
      works: publications.length,
    });

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
    await replacePublications(researcherId, publications.map(toPublicationInput));

    // ANALYZING → prompts + models.
    await step(submissionId, "ANALYZING");
    const prompt = loadPrompt(field.promptKey);
    const run = await createRun({ researcherId, promptKey: prompt.promptKey, promptVersion: prompt.version, promptSha: prompt.sha });
    runId = run.id;
    const user = buildUserMessage(researcher, publications, field.name);
    const results = await runProviders(providers, prompt.system, user, field.weights);
    const merged = mergeResults(results, field.weights, publications.length);

    // Per-publication scores (when the models provided them).
    if (merged.publicationScores.some((s) => s !== null)) {
      await replacePublications(
        researcherId,
        publications.map((p, i) => ({ ...toPublicationInput(p), score: merged.publicationScores[i] })),
      );
    }

    const completed = await completeRun(runId, {
      modelScores: merged.modelScores,
      summary: merged.summary,
      disagreement: merged.disagreement,
      sections: merged.sections,
    });

    await step(submissionId, "PUBLISHED");
    return {
      submissionId,
      researcherId,
      slug,
      runId,
      score: completed.score,
      spread: completed.spread,
      models: results.map((r) => r.model),
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

function toPublicationInput(p: OpenAlexResolution["publications"][number]): PublicationInput {
  return {
    title: p.title,
    year: p.year,
    venue: p.venue,
    doi: p.doi,
    url: p.url,
    abstract: p.abstract,
    hasCode: p.hasCode,
    score: null,
  };
}
