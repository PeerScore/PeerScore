// Loads prompts/<promptKey>.md, parses the YAML-ish front-matter, computes the
// prompt sha and builds the user message from the researcher + publications.

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { ResolvedPublication, ResolvedResearcher } from "./sources/openalex";

export const PROMPTS_DIR = process.env.PROMPTS_DIR ?? path.join(__dirname, "..", "prompts");

export interface LoadedPrompt {
  promptKey: string;
  /** From the front-matter `version`, as a string (e.g. "1"). */
  version: string;
  /** "sha256:" + first 12 hex chars of the sha256 of the whole file. */
  sha: string;
  /** Other front-matter keys. */
  meta: Record<string, string>;
  /** The system prompt (file body without front-matter). */
  system: string;
}

/** Split `---\nkey: value\n---\nbody`. Returns an empty meta when no front-matter. */
export function parseFrontMatter(raw: string): { meta: Record<string, string>; body: string } {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) return { meta: {}, body: raw };
  const meta: Record<string, string> = {};
  for (const line of match[1].split(/\r?\n/)) {
    const idx = line.indexOf(":");
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    meta[key] = value;
  }
  return { meta, body: raw.slice(match[0].length) };
}

export function promptSha(raw: string): string {
  return `sha256:${createHash("sha256").update(raw).digest("hex").slice(0, 12)}`;
}

export function promptPath(promptKey: string): string {
  if (!/^[a-z0-9-]+$/i.test(promptKey)) throw new Error(`Invalid promptKey "${promptKey}"`);
  return path.join(PROMPTS_DIR, `${promptKey}.md`);
}

/** Load prompts/<promptKey>.md, falling back to prompts/general.md when missing. */
export function loadPrompt(promptKey: string): LoadedPrompt {
  let key = promptKey;
  let file = promptPath(key);
  if (!existsSync(file)) {
    key = "general";
    file = promptPath(key);
    if (!existsSync(file)) throw new Error(`Prompt file not found: ${promptPath(promptKey)} (and no general.md fallback)`);
  }
  const raw = readFileSync(file, "utf8");
  const { meta, body } = parseFrontMatter(raw);
  const { version = "1", ...rest } = meta;
  return { promptKey: key, version, sha: promptSha(raw), meta: rest, system: body.trim() };
}

export const ABSTRACT_MAX_CHARS = Number(process.env.ABSTRACT_MAX_CHARS ?? 900);

export function truncate(text: string, max = ABSTRACT_MAX_CHARS): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return `${cut.slice(0, lastSpace > max * 0.6 ? lastSpace : max).trimEnd()}…`;
}

export type PromptPublication = Pick<ResolvedPublication, "title" | "year" | "venue" | "abstract" | "hasCode" | "doi">;
export type PromptResearcher = Pick<ResolvedResearcher, "name" | "affiliation" | "country" | "activeFrom" | "activeTo" | "topics">;

/** Build the user message: researcher header + numbered publication list. */
export function buildUserMessage(researcher: PromptResearcher, publications: readonly PromptPublication[], fieldName: string): string {
  const lines: string[] = [];
  lines.push(`# Researcher`);
  lines.push(`Name: ${researcher.name}`);
  if (researcher.affiliation) lines.push(`Affiliation: ${researcher.affiliation}${researcher.country ? ` (${researcher.country})` : ""}`);
  lines.push(`Field: ${fieldName}`);
  if (researcher.activeFrom) lines.push(`Active: ${researcher.activeFrom}–${researcher.activeTo ?? "present"}`);
  if (researcher.topics.length) lines.push(`Topics: ${researcher.topics.join(", ")}`);
  lines.push("");
  lines.push(`# Publications (${publications.length}, most cited first; cite them by index like [2])`);
  lines.push("");
  publications.forEach((p, i) => {
    const idx = i + 1;
    const venue = p.venue ? `, *${p.venue}*` : "";
    lines.push(`[${idx}] ${p.title} (${p.year}${venue})${p.hasCode ? " — code available" : ""}${p.doi ? ` — doi:${p.doi}` : ""}`);
    lines.push(p.abstract ? `    Abstract: ${truncate(p.abstract)}` : "    Abstract: not available.");
    lines.push("");
  });
  lines.push(
    `Return the JSON object described in your instructions. If you include "publicationScores", give exactly ${publications.length} integers in the order above.`,
  );
  return lines.join("\n");
}
