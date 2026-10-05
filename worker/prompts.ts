// Loads prompts/<promptKey>.md, parses the YAML-ish front-matter, computes the
// prompt sha and builds the user messages:
//  - one per publication (field prompt, `buildPaperMessage`)
//  - one per researcher for the synthesis (`buildSynthesisMessage`).

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { CriterionScores } from "../src/lib/scoring";
import type { ResolvedPublication, ResolvedResearcher } from "./sources/openalex";

export const PROMPTS_DIR = process.env.PROMPTS_DIR ?? path.join(__dirname, "..", "prompts");

/** Prompt key of the researcher-level synthesis (prompts/_synthesis.md). */
export const SYNTHESIS_PROMPT_KEY = "_synthesis";

export interface LoadedPrompt {
  promptKey: string;
  /** From the front-matter `version`, as a string (e.g. "2"). */
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
  if (!/^_?[a-z0-9-]+$/i.test(promptKey)) throw new Error(`Invalid promptKey "${promptKey}"`);
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

/** Load prompts/_synthesis.md (no fallback: it is part of the worker). */
export function loadSynthesisPrompt(): LoadedPrompt {
  const file = promptPath(SYNTHESIS_PROMPT_KEY);
  if (!existsSync(file)) throw new Error(`Synthesis prompt not found: ${file}`);
  const raw = readFileSync(file, "utf8");
  const { meta, body } = parseFrontMatter(raw);
  const { version = "1", ...rest } = meta;
  return { promptKey: SYNTHESIS_PROMPT_KEY, version, sha: promptSha(raw), meta: rest, system: body.trim() };
}

export const ABSTRACT_MAX_CHARS = Number(process.env.ABSTRACT_MAX_CHARS ?? 900);

export function truncate(text: string, max = ABSTRACT_MAX_CHARS): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return `${cut.slice(0, lastSpace > max * 0.6 ? lastSpace : max).trimEnd()}…`;
}

export type PromptPublication = Pick<ResolvedPublication, "title" | "year" | "venue" | "abstract" | "hasCode" | "doi"> & {
  citedBy?: number;
};
export type PromptResearcher = Pick<ResolvedResearcher, "name" | "affiliation" | "country" | "activeFrom" | "activeTo" | "topics">;

function researcherHeader(researcher: PromptResearcher, fieldName: string, heading: string): string[] {
  const lines = [`# ${heading}`, `Name: ${researcher.name}`];
  if (researcher.affiliation) lines.push(`Affiliation: ${researcher.affiliation}${researcher.country ? ` (${researcher.country})` : ""}`);
  lines.push(`Field: ${fieldName}`);
  if (researcher.activeFrom) lines.push(`Active: ${researcher.activeFrom}–${researcher.activeTo ?? "present"}`);
  if (researcher.topics.length) lines.push(`Topics: ${researcher.topics.join(", ")}`);
  return lines;
}

/**
 * User message for ONE publication: the paper first (what is scored), then
 * the author context (calibration only).
 */
export function buildPaperMessage(researcher: PromptResearcher, publication: PromptPublication, fieldName: string): string {
  const p = publication;
  const lines: string[] = [];
  lines.push(`# Publication`);
  lines.push(`Title: ${p.title}`);
  lines.push(`Year: ${p.year}`);
  lines.push(`Venue: ${p.venue ?? "not available"}`);
  if (p.doi) lines.push(`DOI: ${p.doi}`);
  if (typeof p.citedBy === "number") lines.push(`Citations: ${p.citedBy}`);
  lines.push(`Code available: ${p.hasCode ? "yes" : "not found"}`);
  lines.push(`Abstract: ${p.abstract ? truncate(p.abstract) : "not available."}`);
  lines.push("");
  lines.push(...researcherHeader(researcher, fieldName, "Author context (do not score)"));
  lines.push("");
  lines.push(`Return the JSON object described in your instructions for this publication only.`);
  return lines.join("\n");
}

/** One reviewed paper as handed to the synthesis call. */
export interface SynthesisPaper {
  title: string;
  year: number;
  venue: string | null;
  citationCount: number;
  hasCode: boolean;
  /** Consensus score of the paper (rounded mean of the model weighted scores). */
  score: number;
  /** max − min of the model weighted scores. */
  spread: number;
  summary: string;
  strengths: string[];
  concerns: string[];
  modelScores: Array<{ model: string; weighted: number; scores: CriterionScores; rationale: Record<string, string> }>;
}

export interface SynthesisInput {
  researcher: PromptResearcher;
  fieldName: string;
  /** Papers in display order (most cited first); cited by index [i] starting at 1. */
  papers: readonly SynthesisPaper[];
  /** Citation-weighted aggregate (null when nothing scored). */
  aggregateScore: number | null;
  /** Pre-computed note on the widest model disagreement (markdown), null when fewer than 2 models. */
  disagreement: string | null;
  /** Papers that could not be reviewed (excluded from the aggregate). */
  failedCount?: number;
}

/** User message for the synthesis: researcher header + numbered per-paper reviews. */
export function buildSynthesisMessage(input: SynthesisInput): string {
  const { researcher, fieldName, papers } = input;
  const lines: string[] = [];
  lines.push(...researcherHeader(researcher, fieldName, "Researcher"));
  lines.push(`Aggregate score: ${input.aggregateScore ?? "not available"} (citation-weighted mean of the ${papers.length} paper scores below)`);
  if (input.failedCount) lines.push(`Papers that could not be reviewed: ${input.failedCount} (excluded)`);
  lines.push("");
  lines.push(`# Per-publication reviews (${papers.length}, most cited first; cite them by index like [2])`);
  lines.push("");
  papers.forEach((p, i) => {
    const venue = p.venue ? `, *${p.venue}*` : "";
    lines.push(`[${i + 1}] ${p.title} (${p.year}${venue}) — ${p.citationCount} citations${p.hasCode ? " — code available" : ""}`);
    lines.push(`    Score: ${p.score} (model spread ${p.spread}); per model: ${p.modelScores.map((m) => `${m.model} ${m.weighted}`).join(", ")}`);
    lines.push(`    Summary: ${p.summary.replace(/\s+/g, " ").trim()}`);
    if (p.strengths.length) lines.push(`    Strengths: ${p.strengths.join(" · ")}`);
    if (p.concerns.length) lines.push(`    Concerns: ${p.concerns.join(" · ")}`);
    lines.push("");
  });
  lines.push(`# Where the models disagree most`);
  lines.push(input.disagreement ?? "Only one model took part; there is no disagreement to report.");
  lines.push("");
  lines.push(`Return the JSON object described in your instructions.`);
  return lines.join("\n");
}
