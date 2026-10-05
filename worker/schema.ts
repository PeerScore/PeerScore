// Strict JSON contracts between the prompts (prompts/*.md) and the worker.
//  - `paperAnalysisSchema`: what every LLM provider returns for ONE publication
//    (field prompt).
//  - `synthesisSchema`: what the synthesis call returns for the researcher
//    (prompts/_synthesis.md), generated from the per-publication analyses.

import { z } from "zod";
import { CRITERIA } from "../src/lib/scoring";

const score = z.coerce.number().int().min(0).max(100);

export const scoresSchema = z.object({
  rigor: score,
  reproducibility: score,
  novelty: score,
  impact: score,
  clarity: score,
});

export const rationaleSchema = z.object({
  rigor: z.string().min(1),
  reproducibility: z.string().min(1),
  novelty: z.string().min(1),
  impact: z.string().min(1),
  clarity: z.string().min(1),
});

export const sectionSchema = z.object({
  title: z.string().min(1),
  body: z.string().min(1),
});

/** Per-publication review returned by each model. */
export const paperAnalysisSchema = z.object({
  scores: scoresSchema,
  rationale: rationaleSchema,
  /** Markdown, one short paragraph about this paper. */
  summary: z.string().min(1),
  strengths: z.array(z.string()).default([]),
  concerns: z.array(z.string()).default([]),
});

/** Researcher-level synthesis returned by the synthesis call. */
export const synthesisSchema = z.object({
  /** Markdown, two paragraphs, encyclopedic third person, cites publications like [3]. */
  summary: z.string().min(1),
  /** Exactly three sections: "Methods and rigor", "Reproducibility", "Field impact". */
  sections: z.array(sectionSchema).min(1),
  /** Markdown: the publication / criterion where the models disagree most. */
  disagreement: z.string().default(""),
});

export type PaperAnalysisOutput = z.infer<typeof paperAnalysisSchema>;
export type SynthesisOutput = z.infer<typeof synthesisSchema>;
export type AnalysisScores = z.infer<typeof scoresSchema>;

export const SECTION_TITLES = ["Methods and rigor", "Reproducibility", "Field impact"] as const;

export { CRITERIA };
