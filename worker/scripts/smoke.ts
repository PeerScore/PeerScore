// Smoke test: run one worker pass against the local database in mock mode
// (LLM_MOCK=1, OPENALEX_FIXTURE=1) and print the published slug, the
// aggregate score and the per-publication scores.
// Exits 0 when the database is unreachable (prints why) so it is safe in CI.
//
//   npx tsx worker/scripts/smoke.ts

import "dotenv/config";

process.env.LLM_MOCK = "1";
process.env.OPENALEX_FIXTURE = "1";

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    console.log("smoke: DATABASE_URL not set — skipping");
    return;
  }
  // Imported after the env is set so the providers / fixtures pick it up.
  const { prisma } = await import("../../src/lib/db");
  const { claimNextSubmission } = await import("../../src/lib/repositories/submissions");
  const { processSubmission } = await import("../analyze");

  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (err) {
    console.log(`smoke: database unreachable (${(err as Error).message}) — skipping`);
    await prisma.$disconnect().catch(() => undefined);
    return;
  }

  try {
    const submission = await claimNextSubmission();
    if (!submission) {
      console.log("smoke: no QUEUED submission — nothing to do (run `npm run db:seed` to queue two)");
      return;
    }
    console.log(`smoke: processing "${submission.name}" (${submission.id})`);
    const result = await processSubmission(submission);
    console.log(
      `smoke: PUBLISHED /researchers/${result.slug} — score ${result.score} (spread ${result.spread}) ` +
        `from ${result.publicationsAnalyzed}/${result.publications.length} publications read by ${result.models.join(", ")}`,
    );
    for (const p of result.publications) {
      console.log(`smoke:   ${p.score ?? "FAILED"}${p.spread != null ? ` (±${p.spread})` : ""}  ${p.citationCount} cit.  ${p.title}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("smoke: FAILED", err);
  process.exit(1);
});
