import type { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { slugify } from "../scoring";
import type { CreateSubmissionResult, SubmissionStatus, SubmissionSummary } from "../types";

export const NAME_MIN_LENGTH = 2;
export const NAME_MAX_LENGTH = 120;

/** Statuses of submissions still being processed (not terminal). */
export const PENDING_STATUSES: readonly SubmissionStatus[] = ["QUEUED", "RESOLVING", "FETCHING", "ANALYZING"];

const submissionSelect = {
  id: true,
  name: true,
  status: true,
  error: true,
  createdAt: true,
  updatedAt: true,
  researcher: { select: { slug: true } },
} satisfies Prisma.SubmissionSelect;

type SubmissionRow = Prisma.SubmissionGetPayload<{ select: typeof submissionSelect }>;

/** Normalise a submitted name: trim + collapse whitespace. */
export function normaliseName(name: string): string {
  return name.replace(/\s+/g, " ").trim();
}

/** Returns null when valid, otherwise a human-readable error. */
export function validateName(name: unknown): string | null {
  if (typeof name !== "string") return "name must be a string";
  const n = normaliseName(name);
  if (n.length < NAME_MIN_LENGTH) return `name must be at least ${NAME_MIN_LENGTH} characters`;
  if (n.length > NAME_MAX_LENGTH) return `name must be at most ${NAME_MAX_LENGTH} characters`;
  if (!slugify(n)) return "name must contain letters or digits";
  return null;
}

/** 1-based rank of a QUEUED submission; null when it is no longer queued. */
async function queuePosition(row: { id: string; status: SubmissionStatus; createdAt: Date }): Promise<number | null> {
  if (row.status !== "QUEUED") return null;
  const ahead = await prisma.submission.count({
    where: {
      status: "QUEUED",
      OR: [{ createdAt: { lt: row.createdAt } }, { createdAt: row.createdAt, id: { lt: row.id } }],
    },
  });
  return ahead + 1;
}

async function toSummary(row: SubmissionRow): Promise<SubmissionSummary> {
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    error: row.error,
    researcherSlug: row.researcher?.slug ?? null,
    position: await queuePosition(row),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Submit a researcher name.
 * - If a researcher with the same slug already exists → { existingSlug }, nothing created.
 * - If an identical name is already in the pipeline → that submission's { id, position }.
 * - Otherwise a new QUEUED submission → { id, position }.
 * Throws on invalid names (validate with `validateName` first for a 400).
 */
export async function createSubmission(name: string): Promise<CreateSubmissionResult> {
  const error = validateName(name);
  if (error) throw new Error(error);
  const clean = normaliseName(name);
  const slug = slugify(clean);

  const existing = await prisma.researcher.findUnique({ where: { slug }, select: { slug: true } });
  if (existing) return { existingSlug: existing.slug };

  const pending = await prisma.submission.findFirst({
    where: { status: { in: [...PENDING_STATUSES] }, name: { equals: clean, mode: "insensitive" } },
    orderBy: { createdAt: "asc" },
    select: { id: true, status: true, createdAt: true },
  });
  if (pending) {
    return { id: pending.id, position: (await queuePosition(pending)) ?? 0 };
  }

  const created = await prisma.submission.create({
    data: { name: clean, status: "QUEUED" },
    select: { id: true, status: true, createdAt: true },
  });
  return { id: created.id, position: (await queuePosition(created)) ?? 1 };
}

/** One submission by id (for the confirmation page), or null. */
export async function getSubmission(id: string): Promise<SubmissionSummary | null> {
  const row = await prisma.submission.findUnique({ where: { id }, select: submissionSelect });
  return row ? toSummary(row) : null;
}

/**
 * The /queue page: every non-published submission, oldest first. Includes
 * FAILED ones so visitors can see what went wrong; pass `includeFailed: false`
 * to hide them.
 */
export async function listQueue(options: { includeFailed?: boolean; limit?: number } = {}): Promise<SubmissionSummary[]> {
  const statuses: SubmissionStatus[] = options.includeFailed === false ? [...PENDING_STATUSES] : [...PENDING_STATUSES, "FAILED"];
  const rows = await prisma.submission.findMany({
    where: { status: { in: statuses } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: options.limit,
    select: submissionSelect,
  });
  // Positions are computed in one pass instead of one count per row.
  let position = 0;
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    status: row.status,
    error: row.error,
    researcherSlug: row.researcher?.slug ?? null,
    position: row.status === "QUEUED" ? ++position : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }));
}

/**
 * Worker: atomically claim the oldest QUEUED submission (QUEUED → RESOLVING).
 * Safe with several workers: the update is guarded by the status check, and a
 * lost race simply retries with the next candidate. Returns null when the
 * queue is empty.
 */
export async function claimNextSubmission(): Promise<SubmissionSummary | null> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const claimed = await prisma.$transaction(async (tx) => {
      const candidate = await tx.submission.findFirst({
        where: { status: "QUEUED" },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: { id: true },
      });
      if (!candidate) return "empty" as const;
      const { count } = await tx.submission.updateMany({
        where: { id: candidate.id, status: "QUEUED" },
        data: { status: "RESOLVING", error: null },
      });
      if (count === 0) return "lost" as const;
      return tx.submission.findUniqueOrThrow({ where: { id: candidate.id }, select: submissionSelect });
    });
    if (claimed === "empty") return null;
    if (claimed === "lost") continue;
    return toSummary(claimed);
  }
  return null;
}

/** Worker: move a submission to a new status, optionally recording an error. */
export async function setSubmissionStatus(id: string, status: SubmissionStatus, error?: string | null): Promise<void> {
  await prisma.submission.update({
    where: { id },
    data: { status, error: error === undefined ? (status === "FAILED" ? undefined : null) : error },
  });
}

/** Worker: link a submission to the researcher it resolved to. */
export async function attachResearcher(id: string, researcherId: string): Promise<void> {
  await prisma.submission.update({ where: { id }, data: { researcherId } });
}

/** Number of submissions currently waiting (QUEUED). */
export async function queuedCount(): Promise<number> {
  return prisma.submission.count({ where: { status: "QUEUED" } });
}
