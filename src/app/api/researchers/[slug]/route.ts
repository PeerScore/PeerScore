import { NextResponse } from "next/server";
import { getResearcherBySlug } from "@/lib/repositories/researchers";

export const dynamic = "force-dynamic";

/** GET /api/researchers/[slug] — full article JSON export, 404 when unknown. */
export async function GET(_request: Request, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  const article = await getResearcherBySlug(slug);
  if (!article) return NextResponse.json({ error: "Researcher not found" }, { status: 404 });
  return NextResponse.json(article);
}
