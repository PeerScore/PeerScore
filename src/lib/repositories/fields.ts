import { prisma } from "../db";
import type { CriterionWeights, FieldSummary } from "../types";
import { toFieldSummary } from "./mappers";

/** All fields (A→Z) with researcher counts, for "browse by field" and filters. */
export async function listFields(): Promise<FieldSummary[]> {
  const [fields, totals, published] = await Promise.all([
    prisma.field.findMany({ orderBy: { name: "asc" } }),
    prisma.researcher.groupBy({ by: ["fieldId"], _count: { _all: true } }),
    prisma.researcher.groupBy({
      by: ["fieldId"],
      where: { runs: { some: { isCurrent: true, status: "COMPLETED" } } },
      _count: { _all: true },
    }),
  ]);
  const totalBy = new Map(totals.map((t) => [t.fieldId, t._count._all]));
  const publishedBy = new Map(published.map((t) => [t.fieldId, t._count._all]));
  return fields.map((f) =>
    toFieldSummary(f, {
      researcherCount: totalBy.get(f.id) ?? 0,
      publishedCount: publishedBy.get(f.id) ?? 0,
    }),
  );
}

/** One field by slug (with counts), or null. */
export async function getFieldBySlug(slug: string): Promise<FieldSummary | null> {
  const field = await prisma.field.findUnique({ where: { slug } });
  if (!field) return null;
  const [researcherCount, publishedCount] = await Promise.all([
    prisma.researcher.count({ where: { fieldId: field.id } }),
    prisma.researcher.count({
      where: { fieldId: field.id, runs: { some: { isCurrent: true, status: "COMPLETED" } } },
    }),
  ]);
  return toFieldSummary(field, { researcherCount, publishedCount });
}

export interface UpsertFieldInput {
  slug: string;
  name: string;
  promptKey: string;
  weights: CriterionWeights;
}

/** Create or update a field by slug (used by the seed / admin tooling). */
export async function upsertField(input: UpsertFieldInput): Promise<{ id: string; slug: string }> {
  return prisma.field.upsert({
    where: { slug: input.slug },
    create: { slug: input.slug, name: input.name, promptKey: input.promptKey, weights: input.weights },
    update: { name: input.name, promptKey: input.promptKey, weights: input.weights },
    select: { id: true, slug: true },
  });
}
