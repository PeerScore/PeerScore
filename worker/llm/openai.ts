import OpenAI from "openai";
import { MAX_OUTPUT_TOKENS, type LlmProvider } from "./types";

export const DEFAULT_OPENAI_MODEL = "gpt-4o";

export function createOpenAiProvider(options: { apiKey?: string; model?: string; id?: string; baseURL?: string } = {}): LlmProvider {
  const apiKey = options.apiKey ?? process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set");
  const model = options.model ?? process.env.OPENAI_MODEL ?? DEFAULT_OPENAI_MODEL;
  const client = new OpenAI({
    apiKey,
    baseURL: options.baseURL ?? process.env.OPENAI_BASE_URL,
    maxRetries: 3,
    timeout: Number(process.env.LLM_TIMEOUT_MS ?? 180_000),
  });
  return {
    id: options.id ?? "openai",
    async complete(system, user) {
      const res = await client.chat.completions.create({
        model,
        max_completion_tokens: MAX_OUTPUT_TOKENS,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      });
      return (res.choices[0]?.message?.content ?? "").trim();
    },
  };
}
