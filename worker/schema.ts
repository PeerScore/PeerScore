// Strict JSON contract between the reviewer prompts (prompts/*.md) and the
// worker. Every LLM provider must return a document matching `AnalysisOutput`.

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

export const analysisOutputSchema = z.object({
  scores: scoresSchema,
  rationale: rationaleSchema,
  /** Markdown, two paragraphs, encyclopedic third person, cites publications like [3]. */
  summary: z.string().min(1),
  /** Exactly three sections: "Methods and rigor", "Reproducibility", "Field impact". */
  sections: z.array(sectionSchema).min(1),
  strengths: z.array(z.string()).default([]),
  concerns: z.array(z.string()).default([]),
  /** Optional per-publication scores, same order as the publications in the prompt. */
  publicationScores: z.array(z.coerce.number().int().min(0).max(100)).optional(),
});

export type AnalysisOutput = z.infer<typeof analysisOutputSchema>;
export type AnalysisScores = z.infer<typeof scoresSchema>;

export const SECTION_TITLES = ["Methods and rigor", "Reproducibility", "Field impact"] as const;

export { CRITERIA };
