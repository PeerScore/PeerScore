import { parseResearcherListParams } from "@/lib/query";
import { listResearchers } from "@/lib/repositories";

export const dynamic = "force-dynamic";

function csvCell(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** GET /researchers/export?… — CSV version of the index (same params as /api/researchers). */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const params = parseResearcherListParams(searchParams);
  const { items } = await listResearchers({ ...params, pageSize: params.pageSize ?? 100 });
  const header = ["name", "slug", "affiliation", "country", "field", "status", "score", "spread", "publications", "publications_analyzed", "open_code", "published_at"];
  const lines = [header.join(",")];
  for (const r of items) {
    lines.push(
      [r.name, r.slug, r.affiliation, r.country, r.field.name, r.status, r.score, r.spread, r.publicationCount, r.publicationsAnalyzed, r.openCodeCount, r.publishedAt]
        .map(csvCell)
        .join(","),
    );
  }
  return new Response(lines.join("\n") + "\n", {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="peerscore-researchers.csv"',
    },
  });
}
