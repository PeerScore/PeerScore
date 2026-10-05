import Anthropic from "@anthropic-ai/sdk";
import { MAX_OUTPUT_TOKENS, type LlmProvider } from "./types";

export const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-4-5";

export function createAnthropicProvider(options: { apiKey?: string; model?: string; id?: string } = {}): LlmProvider {
  const apiKey = options.apiKey ?? process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");
  const model = options.model ?? process.env.ANTHROPIC_MODEL ?? DEFAULT_ANTHROPIC_MODEL;
  const client = new Anthropic({ apiKey, maxRetries: 3, timeout: Number(process.env.LLM_TIMEOUT_MS ?? 180_000) });
  return {
    id: options.id ?? "anthropic",
    async complete(system, user) {
      const res = await client.messages.create({
        model,
        max_tokens: MAX_OUTPUT_TOKENS,
        temperature: 0.2,
        system,
        messages: [{ role: "user", content: user }],
      });
      return res.content
        .map((block) => (block.type === "text" ? block.text : ""))
        .join("")
        .trim();
    },
  };
}
