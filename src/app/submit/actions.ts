"use server";

import { createSubmission, validateName, normaliseName } from "@/lib/repositories";

export type SubmitState =
  | { kind: "idle" }
  | { kind: "error"; message: string; name: string }
  | { kind: "queued"; id: string; position: number; name: string }
  | { kind: "exists"; slug: string; name: string };

export async function submitResearcher(_prev: SubmitState, formData: FormData): Promise<SubmitState> {
  const raw = formData.get("name");
  const error = validateName(raw);
  if (error) return { kind: "error", message: error, name: typeof raw === "string" ? raw : "" };
  const name = normaliseName(raw as string);
  try {
    const result = await createSubmission(name);
    if (result.existingSlug !== undefined) return { kind: "exists", slug: result.existingSlug, name };
    return { kind: "queued", id: result.id, position: result.position, name };
  } catch (e) {
    console.error("createSubmission failed", e);
    return { kind: "error", message: "Something went wrong while queuing the request. Please try again.", name };
  }
}
