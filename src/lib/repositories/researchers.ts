import { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { median, slugify } from "../scoring";
import type {
  FeaturedResearcher,
  Paginated,
  ResearcherArticle,
  ResearcherListParams,
  ResearcherPublication,
  ResearcherSort,
  ResearcherStatus,
  ResearcherSummary,
  SiteStats,
} from "../types";
import {
  liveRun,
  researcherSummaryInclude,
  toFieldSummary,
  toPublication,
  toResearcherSummary,
  toFeatured,
  toRunSummary,
  deriveStatus,
  type ResearcherSummaryRow,
} from "./mappers";

export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 100;

/** A "live" run: the current run of a researcher that completed. */
const LIVE_RUN: Prisma.AnalysisRunWhereInput = { isCurrent: true, status: "COMPLETED" };
const RUNNING_RUN: Prisma.AnalysisRunWhereInput = { status: "RUNNING" };

function statusWhere(status: ResearcherStatus | undefined): Prisma.ResearcherWhereInput {
  switch (status) {
    case "published":
      return { runs: { some: LIVE_RUN } };
    case "analyzing":
      return { runs: { some: RUNNING_RUN, none: LIVE_RUN } };
    case "pending":
      return { runs: { none: { OR: [LIVE_RUN, RUNNING_RUN] } } };
    default:
      return {};
  }
}

function buildWhere(params: ResearcherListParams): Prisma.ResearcherWhereInput {
  const and: Prisma.ResearcherWhereInput[] = [];
  const q = params.q?.trim();
  if (q) {
    and.push({
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { affiliation: { contains: q, mode: "insensitive" } },
      ],
    });
  }
  if (params.field) and.push({ field: { slug: params.field } });
  const letter = params.letter?.trim().charAt(0);
  if (letter && /[a-z]/i.test(letter)) {
    and.push({ name: { startsWith: letter, mode: "insensitive" } });
  }
  if (typeof params.minScore === "number" && Number.isFinite(params.minScore)) {
    and.push({ runs: { some: { ...LIVE_RUN, score: { gte: Math.round(params.minScore) } } } });
  }
  and.push(statusWhere(params.status));
  return and.length ? { AND: and } : {};
}

function normalisePage(params: ResearcherListParams): { page: number; pageSize: number } {
  const page = Math.max(1, Math.floor(params.page ?? 1));
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(params.pageSize ?? DEFAULT_PAGE_SIZE)));
  return { page, pageSize };
}

async function fetchRowsInOrder(ids: string[]): Promise<ResearcherSummaryRow[]> {
  if (ids.length === 0) return [];
  const rows = await prisma.researcher.findMany({
    where: { id: { in: ids } },
    include: researcherSummaryInclude,
  });
  const byId = new Map(rows.map((r) => [r.id, r]));
  return ids.map((id) => byId.get(id)).filter((r): r is ResearcherSummaryRow => Boolean(r));
}

/**
 * Researcher index. Default sort is `score`: published researchers first (best
 * score first), then the unpublished ones alphabetically. `recent` orders by
 * publication date (newest first), unpublished last. `name` is A→Z.
 */
export async function listResearchers(
  params: ResearcherListParams = {},
): Promise<Paginated<ResearcherSummary>> {
  const { page, pageSize } = normalisePage(params);
  const sort: ResearcherSort = params.sort ?? "score";
  const where = buildWhere(params);
  const skip = (page - 1) * pageSize;

  if (sort === "name") {
    const [total, rows] = await Promise.all([
      prisma.researcher.count({ where }),
      prisma.researcher.findMany({
        where,
        orderBy: [{ name: "asc" }, { id: "asc" }],
        skip,
        take: pageSize,
        include: researcherSummaryInclude,
      }),
    ]);
    return paginate(rows.map(toResearcherSummary), total, page, pageSize);
  }

  // score / recent: two ordered sources — live runs first, then researchers without one.
  const publishedWhere: Prisma.AnalysisRunWhereInput = { ...LIVE_RUN, researcher: where };
  const unpublishedWhere: Prisma.ResearcherWhereInput = { AND: [where, { runs: { none: LIVE_RUN } }] };
  const runOrder: Prisma.AnalysisRunOrderByWithRelationInput[] =
    sort === "recent"
      ? [{ finishedAt: "desc" }, { researcher: { name: "asc" } }, { id: "asc" }]
      : [{ score: "desc" }, { researcher: { name: "asc" } }, { id: "asc" }];

  const [publishedTotal, unpublishedTotal] = await Promise.all([
    prisma.analysisRun.count({ where: publishedWhere }),
    prisma.researcher.count({ where: unpublishedWhere }),
  ]);

  const ids: string[] = [];
  if (skip < publishedTotal) {
    const runs = await prisma.analysisRun.findMany({
      where: publishedWhere,
      orderBy: runOrder,
      skip,
      take: pageSize,
      select: { researcherId: true },
    });
    ids.push(...runs.map((r) => r.researcherId));
  }
  const remaining = pageSize - ids.length;
  if (remaining > 0) {
    const offset = Math.max(0, skip - publishedTotal);
    const rest = await prisma.researcher.findMany({
      where: unpublishedWhere,
      orderBy: [{ name: "asc" }, { id: "asc" }],
      skip: offset,
      take: remaining,
      select: { id: true },
    });
    ids.push(...rest.map((r) => r.id));
  }

  const rows = await fetchRowsInOrder(ids);
  return paginate(rows.map(toResearcherSummary), publishedTotal + unpublishedTotal, page, pageSize);
}

function paginate<T>(items: T[], total: number, page: number, pageSize: number): Paginated<T> {
  return { items, total, page, pageSize, pageCount: Math.max(1, Math.ceil(total / pageSize)) };
}

/** Full article payload for /researchers/[slug]; null when the slug is unknown. */
export async function getResearcherBySlug(slug: string): Promise<ResearcherArticle | null> {
  const row = await prisma.researcher.findUnique({
    where: { slug },
    include: {
      ...researcherSummaryInclude,
      field: true,
      publications: { orderBy: [{ year: "desc" }, { title: "asc" }] },
    },
  });
  if (!row) return null;

  const [researcherCount, publishedCount] = await Promise.all([
    prisma.researcher.count({ where: { fieldId: row.fieldId } }),
    prisma.researcher.count({ where: { fieldId: row.fieldId, runs: { some: LIVE_RUN } } }),
  ]);

  const run = liveRun(row) ?? row.runs[0] ?? null;
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    affiliation: row.affiliation,
    country: row.country,
    orcid: row.orcid,
    openalexId: row.openalexId,
    activeFrom: row.activeFrom,
    activeTo: row.activeTo,
    publicationCount: row.publicationCount,
    openCodeCount: row.openCodeCount,
    topics: row.topics,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    status: deriveStatus(row),
    field: toFieldSummary(row.field, { researcherCount, publishedCount }),
    run: run ? toRunSummary(run) : null,
    publications: row.publications.map(toPublication),
  };
}

/** Most recently published researchers (live runs, newest first). */
export async function recentlyPublished(n = 6): Promise<ResearcherSummary[]> {
  const runs = await prisma.analysisRun.findMany({
    where: LIVE_RUN,
    orderBy: [{ finishedAt: "desc" }, { id: "asc" }],
    take: Math.max(1, n),
    select: { researcherId: true },
  });
  const rows = await fetchRowsInOrder(runs.map((r) => r.researcherId));
  return rows.map(toResearcherSummary);
}

/**
 * Featured analysis for the home page: the best-scoring researcher among the
 * most recent `withinLast` publications (so the spot rotates), or null when
 * nothing is published.
 */
export async function featured(withinLast = 10): Promise<FeaturedResearcher | null> {
  const recent = await prisma.analysisRun.findMany({
    where: LIVE_RUN,
    orderBy: [{ finishedAt: "desc" }, { id: "asc" }],
    take: Math.max(1, withinLast),
    select: { researcherId: true, score: true },
  });
  if (recent.length === 0) return null;
  const best = recent.reduce((a, b) => ((b.score ?? -1) > (a.score ?? -1) ? b : a));
  const [row] = await fetchRowsInOrder([best.researcherId]);
  return row ? toFeatured(row) : null;
}

/** A random published researcher (for the "Random" nav link); null when none. */
export async function randomPublished(): Promise<ResearcherSummary | null> {
  const total = await prisma.analysisRun.count({ where: LIVE_RUN });
  if (total === 0) return null;
  const run = await prisma.analysisRun.findFirst({
    where: LIVE_RUN,
    orderBy: { id: "asc" },
    skip: Math.floor(Math.random() * total),
    select: { researcherId: true },
  });
  if (!run) return null;
  const [row] = await fetchRowsInOrder([run.researcherId]);
  return row ? toResearcherSummary(row) : null;
}

/** Counters for the home page "stats" strip. */
export async function stats(): Promise<SiteStats> {
  const [researchers, published, fields, publications, queued, scores, models] = await Promise.all([
    prisma.researcher.count(),
    prisma.analysisRun.count({ where: LIVE_RUN }),
    prisma.field.count(),
    prisma.publication.count(),
    prisma.submission.count({ where: { status: { notIn: ["PUBLISHED", "FAILED"] } } }),
    prisma.analysisRun.findMany({ where: { ...LIVE_RUN, score: { not: null } }, select: { score: true } }),
    prisma.modelScore.findMany({ where: { run: LIVE_RUN }, distinct: ["model"], select: { model: true } }),
  ]);
  return {
    researchers,
    published,
    fields,
    publications,
    queued,
    medianScore: median(scores.map((s) => s.score as number)),
    models: models.length,
  };
}

/** Letters (upper-case) that have at least one researcher, for the A–Z nav. */
export async function availableLetters(): Promise<string[]> {
  const rows = await prisma.researcher.findMany({ select: { name: true } });
  const letters = new Set<string>();
  for (const { name } of rows) {
    const first = name.trim().charAt(0).toUpperCase();
    if (/[A-Z]/.test(first)) letters.add(first);
  }
  return [...letters].sort();
}

// ---------------------------------------------------------------------------
// Write side (used by the worker and the seed script)
// ---------------------------------------------------------------------------

export interface UpsertResearcherInput {
  name: string;
  /** Defaults to slugify(name). */
  slug?: string;
  fieldSlug: string;
  affiliation?: string | null;
  country?: string | null;
  orcid?: string | null;
  openalexId?: string | null;
  activeFrom?: number | null;
  activeTo?: number | null;
  topics?: string[];
}

/** Create or update a researcher by slug. Returns { id, slug }. */
export async function upsertResearcher(input: UpsertResearcherInput): Promise<{ id: string; slug: string }> {
  const slug = input.slug ?? slugify(input.name);
  if (!slug) throw new Error(`Cannot derive a slug from "${input.name}"`);
  const field = await prisma.field.findUnique({ where: { slug: input.fieldSlug }, select: { id: true } });
  if (!field) throw new Error(`Unknown field "${input.fieldSlug}"`);
  const data = {
    name: input.name,
    fieldId: field.id,
    affiliation: input.affiliation ?? null,
    country: input.country ?? null,
    orcid: input.orcid ?? null,
    openalexId: input.openalexId ?? null,
    activeFrom: input.activeFrom ?? null,
    activeTo: input.activeTo ?? null,
    topics: input.topics ?? [],
  };
  const row = await prisma.researcher.upsert({
    where: { slug },
    create: { slug, ...data },
    update: data,
    select: { id: true, slug: true },
  });
  return row;
}

export type PublicationInput = Omit<ResearcherPublication, "id"> & { id?: string };

/**
 * Replace the publication list of a researcher and refresh the
 * publicationCount / openCodeCount counters, in one transaction.
 */
export async function replacePublications(researcherId: string, publications: PublicationInput[]): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.publication.deleteMany({ where: { researcherId } });
    if (publications.length > 0) {
      await tx.publication.createMany({
        data: publications.map((p) => ({
          id: p.id,
          researcherId,
          title: p.title,
          year: p.year,
          venue: p.venue ?? null,
          doi: p.doi ?? null,
          url: p.url ?? null,
          abstract: p.abstract ?? null,
          hasCode: p.hasCode ?? false,
          score: p.score ?? null,
        })),
      });
    }
    await tx.researcher.update({
      where: { id: researcherId },
      data: {
        publicationCount: publications.length,
        openCodeCount: publications.filter((p) => p.hasCode).length,
      },
    });
  });
}
