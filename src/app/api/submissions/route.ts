import { NextResponse } from "next/server";
import { createSubmission, validateName } from "@/lib/repositories/submissions";

export const dynamic = "force-dynamic";

/**
 * POST /api/submissions  { name }
 * 201 { id, position }  — queued (or already in the pipeline)
 * 200 { existingSlug }  — a researcher with that name already has a page
 * 400 { error }         — invalid payload
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON: { \"name\": string }" }, { status: 400 });
  }
  const name = body && typeof body === "object" ? (body as { name?: unknown }).name : undefined;
  const error = validateName(name);
  if (error) return NextResponse.json({ error }, { status: 400 });

  const result = await createSubmission(name as string);
  if (result.existingSlug) {
    return NextResponse.json({ existingSlug: result.existingSlug }, { status: 200 });
  }
  return NextResponse.json({ id: result.id, position: result.position }, { status: 201 });
}
