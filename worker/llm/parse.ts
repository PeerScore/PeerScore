// Robust parsing of the model output: strip code fences, locate the outermost
// JSON object, zod-validate, and optionally ask the provider once to repair
// invalid JSON. Used for the per-publication reviews and for the synthesis.

import type { z } from "zod";
import { paperAnalysisSchema, synthesisSchema, type PaperAnalysisOutput, type SynthesisOutput } from "../schema";
import type { LlmProvider } from "./types";

export class LlmOutputError extends Error {
  constructor(message: string, public readonly raw: string) {
    super(message);
    this.name = "LlmOutputError";
  }
}

/** Remove ```json fences and leading/trailing prose around the JSON object. */
export function extractJson(text: string): string {
  let s = text.trim();
  const fence = s.match(/```(?:json|JSON)?\s*([\s\S]*?)```/);
  if (fence) s = fence[1].trim();
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) throw new LlmOutputError("No JSON object found in model output", text);
  return s.slice(start, end + 1);
}

/** Parse + validate against `schema`; throws LlmOutputError with the zod issues when invalid. */
export function parseJsonOutput<S extends z.ZodTypeAny>(text: string, schema: S): z.infer<S> {
  const json = extractJson(text);
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch (err) {
    throw new LlmOutputError(`Invalid JSON: ${(err as Error).message}`, text);
  }
  const result = schema.safeParse(data);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ");
    throw new LlmOutputError(`Output does not match schema: ${issues}`, text);
  }
  return result.data;
}

/** Per-publication review. */
export function parseAnalysis(text: string): PaperAnalysisOutput {
  return parseJsonOutput(text, paperAnalysisSchema);
}

/** Researcher-level synthesis. */
export function parseSynthesis(text: string): SynthesisOutput {
  return parseJsonOutput(text, synthesisSchema);
}

/**
 * Ask the provider, parse, and on failure ask once more with the error and
 * the previous output so the model can fix it.
 */
export async function completeJson<S extends z.ZodTypeAny>(
  provider: LlmProvider,
  system: string,
  user: string,
  schema: S,
): Promise<z.infer<S>> {
  const raw = await provider.complete(system, user);
  try {
    return parseJsonOutput(raw, schema);
  } catch (err) {
    if (!(err instanceof LlmOutputError)) throw err;
    const repairUser =
      `${user}\n\n---\nYour previous answer could not be used: ${err.message}.\n` +
      `Previous answer (truncated):\n${raw.slice(0, 6000)}\n\n` +
      `Return ONLY the corrected JSON object, with no code fences and no commentary.`;
    const repaired = await provider.complete(system, repairUser);
    return parseJsonOutput(repaired, schema);
  }
}

/** One model's review of one publication (with one repair round). */
export function completeAnalysis(provider: LlmProvider, system: string, user: string): Promise<PaperAnalysisOutput> {
  return completeJson(provider, system, user, paperAnalysisSchema);
}

/** The researcher-level synthesis (with one repair round). */
export function completeSynthesis(provider: LlmProvider, system: string, user: string): Promise<SynthesisOutput> {
  return completeJson(provider, system, user, synthesisSchema);
}
