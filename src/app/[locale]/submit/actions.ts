"use server";

import { createSubmission, validateName, normaliseName } from "@/lib/repositories";

/** Validation outcome, translated on the client (`submit.error*` messages). */
export type SubmitErrorCode = "tooShort" | "tooLong" | "invalid" | "server";

export type SubmitState =
  | { kind: "idle" }
  | { kind: "error"; code: SubmitErrorCode; name: string }
  | { kind: "queued"; id: string; position: number; name: string }
  | { kind: "exists"; slug: string; name: string };

/** Maps the repository's English validation message to a translatable code. */
function errorCode(message: string): SubmitErrorCode {
  if (message.includes("at least")) return "tooShort";
  if (message.includes("at most")) return "tooLong";
  return "invalid";
}

export async function submitResearcher(_prev: SubmitState, formData: FormData): Promise<SubmitState> {
  const raw = formData.get("name");
  const error = validateName(raw);
  if (error) return { kind: "error", code: errorCode(error), name: typeof raw === "string" ? raw : "" };
  const name = normaliseName(raw as string);
  try {
    const result = await createSubmission(name);
    if (result.existingSlug !== undefined) return { kind: "exists", slug: result.existingSlug, name };
    return { kind: "queued", id: result.id, position: result.position, name };
  } catch (e) {
    console.error("createSubmission failed", e);
    return { kind: "error", code: "server", name };
  }
}
