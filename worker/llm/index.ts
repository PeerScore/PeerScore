// Builds the list of enabled providers from the environment.
//
//   LLM_MOCK=1                      → three mock providers (model-a/b/c)
//   LLM_PROVIDERS=anthropic,openai  → explicit list (also accepts "mock")
//   otherwise                       → whichever API keys exist; none → mock ×3

import { createAnthropicProvider } from "./anthropic";
import { createMockProvider } from "./mock";
import { createOpenAiProvider } from "./openai";
import type { LlmProvider } from "./types";

export type { LlmProvider } from "./types";
export { completeAnalysis, completeSynthesis, completeJson, parseAnalysis, parseSynthesis, parseJsonOutput, extractJson, LlmOutputError } from "./parse";
export { createMockProvider, generateMockPaperOutput, generateMockSynthesis } from "./mock";

export const MOCK_IDS = ["model-a", "model-b", "model-c"] as const;

export function mockProviders(): LlmProvider[] {
  return MOCK_IDS.map((id) => createMockProvider(id));
}

export type ProviderEnv = Record<string, string | undefined>;

export function buildProviders(env: ProviderEnv = process.env): LlmProvider[] {
  if (env.LLM_MOCK === "1") return mockProviders();

  const explicit = (env.LLM_PROVIDERS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  const wanted = explicit.length
    ? explicit
    : ([env.ANTHROPIC_API_KEY ? "anthropic" : null, env.OPENAI_API_KEY ? "openai" : null].filter(Boolean) as string[]);

  if (wanted.length === 0) return mockProviders();

  const providers: LlmProvider[] = [];
  for (const name of wanted) {
    switch (name) {
      case "anthropic":
        providers.push(createAnthropicProvider({ apiKey: env.ANTHROPIC_API_KEY, model: env.ANTHROPIC_MODEL }));
        break;
      case "openai":
        providers.push(createOpenAiProvider({ apiKey: env.OPENAI_API_KEY, model: env.OPENAI_MODEL, baseURL: env.OPENAI_BASE_URL }));
        break;
      case "mock":
        providers.push(...mockProviders());
        break;
      default:
        throw new Error(`Unknown LLM provider "${name}" (expected anthropic, openai or mock)`);
    }
  }
  return providers;
}
