// Mapping from OpenAlex topic taxonomy (domain → field → subfield → topic)
// to PeerScore field slugs (the ones seeded in prisma/seed.ts). Anything that
// does not match falls back to the "general" field, which the worker creates
// on demand (`ensureGeneralField()` in analyze.ts). This module is pure.

import { DEFAULT_WEIGHTS } from "../src/lib/scoring";

export const GENERAL_FIELD = {
  slug: "general",
  name: "General",
  promptKey: "general",
  weights: DEFAULT_WEIGHTS,
} as const;

export const KNOWN_FIELD_SLUGS = [
  "compbio",
  "ml",
  "physics-cm",
  "oncology",
  "applied-math",
  "marine-ecology",
  "behavioral-econ",
  "astrophysics",
  "general",
] as const;

export type FieldSlug = (typeof KNOWN_FIELD_SLUGS)[number];

/**
 * OpenAlex *subfield* display names → slug. Subfields are more specific than
 * fields so they are matched first (case-insensitive, exact).
 */
const SUBFIELD_MAP: Record<string, FieldSlug> = {
  // Computational biology
  "computational biology": "compbio",
  bioinformatics: "compbio",
  "molecular biology": "compbio",
  "genetics": "compbio",
  "biochemistry": "compbio",
  "biophysics": "compbio",
  "structural biology": "compbio",
  "cell biology": "compbio",
  "computational mathematics": "applied-math",
  "systems biology": "compbio",
  // Machine learning
  "artificial intelligence": "ml",
  "computer vision and pattern recognition": "ml",
  "signal processing": "ml",
  "information systems": "ml",
  "statistics and probability": "ml",
  "statistics, probability and uncertainty": "ml",
  "computer science applications": "ml",
  "human-computer interaction": "ml",
  "computer networks and communications": "ml",
  "software": "ml",
  "theoretical computer science": "ml",
  "computational theory and mathematics": "applied-math",
  // Condensed matter physics
  "condensed matter physics": "physics-cm",
  "materials chemistry": "physics-cm",
  "electronic, optical and magnetic materials": "physics-cm",
  "surfaces, coatings and films": "physics-cm",
  "atomic and molecular physics, and optics": "physics-cm",
  "statistical and nonlinear physics": "physics-cm",
  "nuclear and high energy physics": "physics-cm",
  // Oncology
  oncology: "oncology",
  "cancer research": "oncology",
  "radiology, nuclear medicine and imaging": "oncology",
  hematology: "oncology",
  "immunology": "oncology",
  "pathology and forensic medicine": "oncology",
  // Applied mathematics
  "applied mathematics": "applied-math",
  "numerical analysis": "applied-math",
  "analysis": "applied-math",
  "algebra and number theory": "applied-math",
  "geometry and topology": "applied-math",
  "discrete mathematics and combinatorics": "applied-math",
  "control and optimization": "applied-math",
  "mathematical physics": "applied-math",
  "modeling and simulation": "applied-math",
  "logic": "applied-math",
  "mathematics (miscellaneous)": "applied-math",
  // Marine ecology
  "aquatic science": "marine-ecology",
  oceanography: "marine-ecology",
  "ecology, evolution, behavior and systematics": "marine-ecology",
  ecology: "marine-ecology",
  "global and planetary change": "marine-ecology",
  "nature and landscape conservation": "marine-ecology",
  "water science and technology": "marine-ecology",
  "environmental science": "marine-ecology",
  // Behavioral economics
  "economics and econometrics": "behavioral-econ",
  "behavioral neuroscience": "behavioral-econ",
  "social psychology": "behavioral-econ",
  "experimental and cognitive psychology": "behavioral-econ",
  "applied psychology": "behavioral-econ",
  "finance": "behavioral-econ",
  "marketing": "behavioral-econ",
  "strategy and management": "behavioral-econ",
  "sociology and political science": "behavioral-econ",
  // Astrophysics
  "astronomy and astrophysics": "astrophysics",
  "space and planetary science": "astrophysics",
  "instrumentation": "astrophysics",
};

/** OpenAlex *field* display names → slug (coarser, used when no subfield matched). */
const FIELD_MAP: Record<string, FieldSlug> = {
  "biochemistry, genetics and molecular biology": "compbio",
  "immunology and microbiology": "compbio",
  "agricultural and biological sciences": "marine-ecology",
  "computer science": "ml",
  "decision sciences": "ml",
  "physics and astronomy": "physics-cm",
  "materials science": "physics-cm",
  "chemistry": "physics-cm",
  "chemical engineering": "physics-cm",
  "engineering": "applied-math",
  medicine: "oncology",
  "health professions": "oncology",
  "pharmacology, toxicology and pharmaceutics": "oncology",
  neuroscience: "compbio",
  mathematics: "applied-math",
  "environmental science": "marine-ecology",
  "earth and planetary sciences": "astrophysics",
  "economics, econometrics and finance": "behavioral-econ",
  psychology: "behavioral-econ",
  "social sciences": "behavioral-econ",
  "business, management and accounting": "behavioral-econ",
  "arts and humanities": "general",
  nursing: "oncology",
  dentistry: "oncology",
  "veterinary": "compbio",
  energy: "physics-cm",
};

/**
 * Keyword fallbacks matched against the *topic* display names (substring,
 * case-insensitive) when neither the subfield nor the field is known.
 */
const TOPIC_KEYWORDS: [RegExp, FieldSlug][] = [
  [/\b(genom|transcriptom|proteom|single[- ]cell|sequencing|rna|dna|protein)\b/i, "compbio"],
  [/\b(deep learning|neural network|machine learning|reinforcement|language model|transformer|optimi[sz]ation algorithm)/i, "ml"],
  [/\b(superconduct|topological|graphene|quantum material|spin|magnet|lattice|semiconductor)/i, "physics-cm"],
  [/\b(cancer|tumou?r|carcinoma|oncolog|leuka?emia|lymphoma|metasta)/i, "oncology"],
  [/\b(partial differential|numerical method|finite element|dynamical system|stochastic|inverse problem)/i, "applied-math"],
  [/\b(marine|coral|reef|ocean|fisher|plankton|coastal|estuar)/i, "marine-ecology"],
  [/\b(behavio(u)?ral econ|nudg|decision[- ]making|prospect theory|experimental econ|game theory)/i, "behavioral-econ"],
  [/\b(galax|stellar|cosmolog|exoplanet|black hole|supernova|astro|gravitational wave)/i, "astrophysics"],
];

export interface TopicLike {
  display_name?: string | null;
  subfield?: { display_name?: string | null } | null;
  field?: { display_name?: string | null } | null;
}

function norm(s: string | null | undefined): string {
  return (s ?? "").trim().toLowerCase();
}

/** Map a single OpenAlex topic to a slug, or null when nothing matches. */
export function mapTopic(topic: TopicLike | null | undefined): FieldSlug | null {
  if (!topic) return null;
  const sub = SUBFIELD_MAP[norm(topic.subfield?.display_name)];
  if (sub) return sub;
  const field = FIELD_MAP[norm(topic.field?.display_name)];
  if (field) return field;
  const name = topic.display_name ?? "";
  for (const [re, slug] of TOPIC_KEYWORDS) if (re.test(name)) return slug;
  return null;
}

/**
 * Map an OpenAlex field / subfield name (or a topic object) to a PeerScore
 * field slug. Falls back to "general".
 */
export function mapOpenAlexField(input: string | TopicLike | null | undefined): FieldSlug {
  if (typeof input === "string") {
    const key = norm(input);
    return SUBFIELD_MAP[key] ?? FIELD_MAP[key] ?? "general";
  }
  return mapTopic(input) ?? "general";
}

/**
 * Pick the primary field from an author's topics (ordered by OpenAlex by
 * relevance): the first topic that maps wins; otherwise "general".
 */
export function primaryFieldFromTopics(topics: readonly TopicLike[] | null | undefined): FieldSlug {
  for (const t of topics ?? []) {
    const slug = mapTopic(t);
    if (slug) return slug;
  }
  return "general";
}
