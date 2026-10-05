// Provider abstraction: every LLM backend exposes a single text completion.

export interface LlmProvider {
  /** Stable identifier stored in ModelScore.model (e.g. "anthropic", "openai", "model-a"). */
  id: string;
  /** Returns the raw assistant text for a system + user prompt. */
  complete(system: string, user: string): Promise<string>;
}

/** Max output tokens requested from real providers. */
export const MAX_OUTPUT_TOKENS = Number(process.env.LLM_MAX_OUTPUT_TOKENS ?? 4096);
