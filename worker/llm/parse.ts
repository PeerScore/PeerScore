// Robust parsing of the model output into AnalysisOutput: strip code fences,
// locate the outermost JSON object, zod-validate, and optionally ask the
// provider once to repair invalid JSON.

import { analysisOutputSchema, type AnalysisOutput } from "../schema";
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

/** Parse + validate; throws LlmOutputError with the zod issues when invalid. */
export function parseAnalysis(text: string): AnalysisOutput {
  const json = extractJson(text);
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch (err) {
    throw new LlmOutputError(`Invalid JSON: ${(err as Error).message}`, text);
  }
  const result = analysisOutputSchema.safeParse(data);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ");
    throw new LlmOutputError(`Output does not match schema: ${issues}`, text);
  }
  return result.data;
}

/**
 * Ask the provider, parse, and on failure ask once more with the error and
 * the previous output so the model can fix it.
 */
export async function completeAnalysis(provider: LlmProvider, system: string, user: string): Promise<AnalysisOutput> {
  const raw = await provider.complete(system, user);
  try {
    return parseAnalysis(raw);
  } catch (err) {
    if (!(err instanceof LlmOutputError)) throw err;
    const repairUser =
      `${user}\n\n---\nYour previous answer could not be used: ${err.message}.\n` +
      `Previous answer (truncated):\n${raw.slice(0, 6000)}\n\n` +
      `Return ONLY the corrected JSON object, with no code fences and no commentary.`;
    const repaired = await provider.complete(system, repairUser);
    return parseAnalysis(repaired);
  }
}
