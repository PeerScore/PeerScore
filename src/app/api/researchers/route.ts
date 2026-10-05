import { NextResponse } from "next/server";
import { parseResearcherListParams } from "@/lib/query";
import { listResearchers } from "@/lib/repositories/researchers";

export const dynamic = "force-dynamic";

/** GET /api/researchers?q=&field=&minScore=&status=&letter=&page=&pageSize=&sort= */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const result = await listResearchers(parseResearcherListParams(searchParams));
  return NextResponse.json(result);
}
