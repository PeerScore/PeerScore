// PeerScore analysis worker — long-running loop that turns QUEUED submissions
// into published researcher articles.
//
//   npm run worker          # poll forever (POLL_INTERVAL_MS, default 10s)
//   npm run worker:once     # WORKER_ONCE=1: process one submission (or none) and exit
//
// Pipeline per submission (see analyze.ts): RESOLVING (claim) → FETCHING →
// ANALYZING → PUBLISHED, or FAILED with the error message.

import "dotenv/config";
import { prisma } from "../src/lib/db";
import { claimNextSubmission } from "../src/lib/repositories/submissions";
import { processSubmission } from "./analyze";
import { errorMessage, logger } from "./log";

const POLL_INTERVAL_MS = Math.max(250, Number(process.env.POLL_INTERVAL_MS ?? 10_000) || 10_000);
const ONCE = process.env.WORKER_ONCE === "1";

let stopping = false;
let wake: (() => void) | null = null;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      wake = null;
      resolve();
    }, ms);
    // Allow a shutdown signal to cut the sleep short.
    wake = () => {
      clearTimeout(timer);
      wake = null;
      resolve();
    };
  });
}

function requestStop(signal: string): void {
  if (stopping) {
    logger.warn("forced exit", { signal });
    process.exit(130);
  }
  stopping = true;
  logger.info("shutdown requested, finishing current submission", { signal });
  wake?.();
}

/**
 * One pass: claim and process a single submission.
 * Returns true when a submission was processed (successfully or not), false
 * when the queue was empty.
 */
export async function runOnce(): Promise<boolean> {
  const submission = await claimNextSubmission();
  if (!submission) return false;
  logger.info("claimed submission", { submissionId: submission.id, name: submission.name });
  const started = Date.now();
  try {
    const result = await processSubmission(submission);
    logger.info("published", {
      submissionId: result.submissionId,
      slug: result.slug,
      score: result.score,
      spread: result.spread,
      models: result.models,
      ms: Date.now() - started,
    });
  } catch (err) {
    // processSubmission already marked the submission FAILED and logged it.
    logger.warn("submission not published", { submissionId: submission.id, error: errorMessage(err), ms: Date.now() - started });
  }
  return true;
}

async function main(): Promise<void> {
  process.on("SIGTERM", () => requestStop("SIGTERM"));
  process.on("SIGINT", () => requestStop("SIGINT"));

  logger.info("worker started", {
    once: ONCE,
    pollIntervalMs: POLL_INTERVAL_MS,
    llmMock: process.env.LLM_MOCK === "1",
    openalexFixture: process.env.OPENALEX_FIXTURE === "1",
    providers: process.env.LLM_PROVIDERS ?? "(auto)",
  });

  if (ONCE) {
    const processed = await runOnce();
    if (!processed) logger.info("queue empty");
    return;
  }

  while (!stopping) {
    let processed = false;
    try {
      processed = await runOnce();
    } catch (err) {
      // Database / claim errors: log and back off rather than crash the loop.
      logger.error("worker pass failed", { error: errorMessage(err) });
    }
    if (stopping) break;
    if (!processed) {
      logger.debug("queue empty, sleeping", { ms: POLL_INTERVAL_MS });
      await sleep(POLL_INTERVAL_MS);
    }
  }
  logger.info("worker stopped");
}

main()
  .then(async () => {
    await prisma.$disconnect();
    process.exit(0);
  })
  .catch(async (err) => {
    logger.error("worker crashed", { error: errorMessage(err) });
    await prisma.$disconnect().catch(() => undefined);
    process.exit(1);
  });
