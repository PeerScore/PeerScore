// Development seed — fictional researchers, institutions and publications.
// Idempotent: fields and researchers are upserted by slug, runs (one
// PublicationAnalysis per publication, three mock models each, plus the
// researcher-level synthesis) are only created when a researcher has no live
// analysis yet, submissions by name.
// Run with `npm run db:seed` (or automatically by `prisma migrate reset`).
import "dotenv/config";
import { prisma } from "../src/lib/db";
import { upsertField } from "../src/lib/repositories/fields";
import { replacePublications, upsertResearcher } from "../src/lib/repositories/researchers";
import { completePublicationAnalysis, completeRun, createPublicationAnalysis, createRun } from "../src/lib/repositories/runs";
import { PENDING_STATUSES } from "../src/lib/repositories/submissions";
import { CRITERIA, type CriterionScores, type CriterionWeights } from "../src/lib/scoring";
import type { AnalysisSection } from "../src/lib/types";

const PROMPT_VERSION = "2";
const MODELS = ["model-a", "model-b", "model-c"] as const;

const fields: { slug: string; name: string; promptKey: string; weights: CriterionWeights }[] = [
  { slug: "compbio", name: "Computational Biology", promptKey: "compbio", weights: { rigor: 0.25, reproducibility: 0.3, novelty: 0.15, impact: 0.2, clarity: 0.1 } },
  { slug: "ml", name: "Machine Learning", promptKey: "ml", weights: { rigor: 0.25, reproducibility: 0.25, novelty: 0.25, impact: 0.15, clarity: 0.1 } },
  { slug: "physics-cm", name: "Condensed Matter Physics", promptKey: "physics-cm", weights: { rigor: 0.35, reproducibility: 0.2, novelty: 0.2, impact: 0.15, clarity: 0.1 } },
  { slug: "oncology", name: "Oncology", promptKey: "oncology", weights: { rigor: 0.35, reproducibility: 0.2, novelty: 0.1, impact: 0.25, clarity: 0.1 } },
  { slug: "applied-math", name: "Applied Mathematics", promptKey: "applied-math", weights: { rigor: 0.4, reproducibility: 0.15, novelty: 0.2, impact: 0.1, clarity: 0.15 } },
  { slug: "marine-ecology", name: "Marine Ecology", promptKey: "marine-ecology", weights: { rigor: 0.3, reproducibility: 0.25, novelty: 0.15, impact: 0.2, clarity: 0.1 } },
  { slug: "behavioral-econ", name: "Behavioral Economics", promptKey: "behavioral-econ", weights: { rigor: 0.3, reproducibility: 0.3, novelty: 0.15, impact: 0.15, clarity: 0.1 } },
  { slug: "astrophysics", name: "Astrophysics", promptKey: "astrophysics", weights: { rigor: 0.3, reproducibility: 0.2, novelty: 0.2, impact: 0.2, clarity: 0.1 } },
];

interface SeedPublication {
  title: string;
  year: number;
  venue: string;
  hasCode: boolean;
  /** Target consensus score of this paper; per-model criterion scores are derived from it. */
  score: number;
}

/** Deterministic, plausible citation count: older and better papers are cited more. */
function citations(p: SeedPublication): number {
  return Math.max(0, Math.round((2026 - p.year) * (p.score / 4) + (p.hasCode ? 12 : 0)));
}

interface SeedResearcher {
  name: string;
  affiliation: string;
  country: string;
  field: string;
  /** Rough overall level, used for the prose only (the score is aggregated from the papers). */
  target: number;
  activeFrom: number;
  topics: string[];
  publishedDaysAgo: number;
  summary: string;
  disagreement: string;
  publications: SeedPublication[];
}

const researchers: SeedResearcher[] = [
  {
    name: "Leila Haddad",
    affiliation: "Northbridge Institute of Genomics",
    country: "United Kingdom",
    field: "compbio",
    target: 82,
    activeFrom: 2011,
    topics: ["single-cell transcriptomics", "variant calling", "benchmarking"],
    publishedDaysAgo: 1,
    summary:
      "Haddad's work on single-cell variant calling stands out for unusually thorough benchmarking: every method paper ships a public pipeline, held-out datasets and a negative-control analysis. Effect sizes are modest but consistently replicated across cohorts.",
    disagreement:
      "model-b rated **novelty** lower, reading the 2023 pipeline paper as incremental over the 2020 method; model-a and model-c weighted the benchmark suite itself as a contribution.",
    publications: [
      { title: "CellVar: calibrated somatic variant calling from single-cell RNA-seq", year: 2023, venue: "Genome Research", hasCode: true, score: 86 },
      { title: "A negative-control benchmark for single-cell variant callers", year: 2022, venue: "Nature Methods", hasCode: true, score: 84 },
      { title: "Allelic imbalance in clonal hematopoiesis at single-cell resolution", year: 2021, venue: "Cell Reports", hasCode: true, score: 79 },
      { title: "Reproducibility of droplet-based scRNA-seq across sites", year: 2020, venue: "Genome Biology", hasCode: true, score: 81 },
      { title: "Haplotype phasing with sparse long reads", year: 2018, venue: "Bioinformatics", hasCode: false, score: 74 },
    ],
  },
  {
    name: "Tomás Ferreira-Lindqvist",
    affiliation: "Vestfold Polytechnic",
    country: "Norway",
    field: "ml",
    target: 74,
    activeFrom: 2015,
    topics: ["optimization", "sparse training", "generalization bounds"],
    publishedDaysAgo: 2,
    summary:
      "A theory-first optimization researcher whose bounds are tight and whose experiments are small but honest. Code is released for most papers, though two of the five flagship results could not be reproduced from the repositories alone.",
    disagreement:
      "model-c scored **reproducibility** 12 points below the others after failing to locate the training configs referenced in the 2022 paper.",
    publications: [
      { title: "Sharpness-aware sparse training without a dense warm-up", year: 2024, venue: "ICML", hasCode: true, score: 78 },
      { title: "Tight generalization bounds for iteratively pruned networks", year: 2022, venue: "NeurIPS", hasCode: true, score: 80 },
      { title: "On the implicit bias of momentum under weight decay", year: 2021, venue: "ICLR", hasCode: false, score: 71 },
      { title: "Lottery tickets are mostly initialization", year: 2020, venue: "ICLR", hasCode: true, score: 69 },
      { title: "Convergence of adaptive methods on non-convex objectives", year: 2018, venue: "JMLR", hasCode: false, score: 72 },
    ],
  },
  {
    name: "Priya Raghunathan",
    affiliation: "Kalinga Institute for Quantum Matter",
    country: "India",
    field: "physics-cm",
    target: 67,
    activeFrom: 2009,
    topics: ["topological insulators", "ARPES", "moiré materials"],
    publishedDaysAgo: 3,
    summary:
      "Experimental condensed-matter physicist with a strong ARPES programme. Measurements are careful and well documented, but several claims about moiré superconductivity rest on single samples that have not yet been reproduced elsewhere.",
    disagreement:
      "The models agree on rigor; the spread comes from **impact**, where model-a credits the 2021 moiré result as field-defining and model-b treats it as unconfirmed.",
    publications: [
      { title: "Flat-band superconductivity in twisted bilayer WSe2", year: 2021, venue: "Nature Physics", hasCode: false, score: 70 },
      { title: "ARPES signatures of a hinge state in bismuth nanoribbons", year: 2020, venue: "Physical Review Letters", hasCode: false, score: 68 },
      { title: "Open-source ARPES calibration for synchrotron beamlines", year: 2019, venue: "Review of Scientific Instruments", hasCode: true, score: 73 },
      { title: "Strain tuning of the topological gap in SnTe films", year: 2017, venue: "Physical Review B", hasCode: false, score: 64 },
      { title: "Surface Dirac cones under magnetic doping", year: 2014, venue: "Physical Review B", hasCode: false, score: 61 },
    ],
  },
  {
    name: "Marcus Oyelaran",
    affiliation: "St. Aldric Cancer Centre",
    country: "Canada",
    field: "oncology",
    target: 58,
    activeFrom: 2008,
    topics: ["immunotherapy", "biomarkers", "phase II trials"],
    publishedDaysAgo: 5,
    summary:
      "Clinician-scientist running mid-size immunotherapy trials. Trial design is sound, but the biomarker papers rely on retrospective subgroups with small n and no pre-registration, which limits how much can be concluded from them.",
    disagreement:
      "model-a and model-c flagged the lack of pre-registration under **rigor**; model-b was more lenient, treating the retrospective analyses as explicitly exploratory.",
    publications: [
      { title: "Circulating tumour DNA kinetics predict response to PD-1 blockade", year: 2023, venue: "Journal of Clinical Oncology", hasCode: false, score: 60 },
      { title: "Phase II trial of combined checkpoint inhibition in uveal melanoma", year: 2022, venue: "The Lancet Oncology", hasCode: false, score: 66 },
      { title: "A retrospective biomarker panel for anti-CTLA-4 toxicity", year: 2020, venue: "Clinical Cancer Research", hasCode: false, score: 52 },
      { title: "Tumour-infiltrating lymphocyte density as a prognostic marker", year: 2018, venue: "Cancer Immunology Research", hasCode: false, score: 55 },
      { title: "Open analysis scripts for immune-related adverse event scoring", year: 2017, venue: "JCO Clinical Cancer Informatics", hasCode: true, score: 58 },
    ],
  },
  {
    name: "Ingrid Vasquez-Solberg",
    affiliation: "Cordillera School of Mathematics",
    country: "Chile",
    field: "applied-math",
    target: 88,
    activeFrom: 2006,
    topics: ["numerical PDEs", "uncertainty quantification", "multigrid"],
    publishedDaysAgo: 8,
    summary:
      "Rigorous numerical analyst whose convergence proofs are complete and whose solvers are released as maintained libraries. Writing is exceptionally clear; the main limitation is a narrow focus on elliptic problems.",
    disagreement:
      "Minimal disagreement. model-b docked **novelty** slightly, noting that the multigrid work extends well-known ideas.",
    publications: [
      { title: "Adaptive multigrid for stochastic elliptic PDEs with rough coefficients", year: 2024, venue: "SIAM Journal on Numerical Analysis", hasCode: true, score: 90 },
      { title: "A posteriori error bounds for multilevel Monte Carlo", year: 2022, venue: "Numerische Mathematik", hasCode: true, score: 89 },
      { title: "CordilleraFEM: a verified finite-element library", year: 2020, venue: "ACM Transactions on Mathematical Software", hasCode: true, score: 91 },
      { title: "Robust preconditioners for heterogeneous diffusion", year: 2016, venue: "SIAM Journal on Scientific Computing", hasCode: true, score: 85 },
      { title: "Convergence of hp-FEM on anisotropic meshes", year: 2012, venue: "Mathematics of Computation", hasCode: false, score: 84 },
    ],
  },
  {
    name: "Kenji Marlowe",
    affiliation: "Tasman Bay Marine Observatory",
    country: "New Zealand",
    field: "marine-ecology",
    target: 45,
    activeFrom: 2013,
    topics: ["kelp forests", "sea urchin barrens", "citizen science"],
    publishedDaysAgo: 12,
    summary:
      "Field ecologist studying kelp forest collapse. The observational datasets are valuable and openly shared, but the causal claims about urchin barrens rest on uncontrolled comparisons and inconsistent sampling across years.",
    disagreement:
      "model-c gave a much lower **rigor** score after noting that sampling protocols changed between the 2018 and 2021 surveys without a stated correction.",
    publications: [
      { title: "Decadal kelp loss along the Tasman coast", year: 2022, venue: "Marine Ecology Progress Series", hasCode: false, score: 48 },
      { title: "Citizen-science monitoring of urchin barrens", year: 2021, venue: "Frontiers in Marine Science", hasCode: true, score: 50 },
      { title: "Temperature anomalies and kelp recruitment failure", year: 2019, venue: "Journal of Experimental Marine Biology and Ecology", hasCode: false, score: 44 },
      { title: "Diver survey protocol for subtidal reefs", year: 2018, venue: "Methods in Ecology and Evolution", hasCode: false, score: 46 },
      { title: "Predator release and urchin density: an observational study", year: 2016, venue: "Marine Biology", hasCode: false, score: 39 },
    ],
  },
  {
    name: "Aurélie Dubois-Nakamura",
    affiliation: "Rhinefeld Institute of Decision Sciences",
    country: "Germany",
    field: "behavioral-econ",
    target: 63,
    activeFrom: 2012,
    topics: ["nudges", "pre-registration", "field experiments"],
    publishedDaysAgo: 15,
    summary:
      "Runs large pre-registered field experiments on default effects. Early lab studies were underpowered and two effects later shrank in replication, but the recent field work is exemplary in design and transparency.",
    disagreement:
      "model-a weighted the recent pre-registered work heavily; model-b averaged across the whole career, pulling **reproducibility** down.",
    publications: [
      { title: "Defaults at scale: a pre-registered trial with 1.2M pension savers", year: 2023, venue: "American Economic Review", hasCode: true, score: 74 },
      { title: "When nudges fade: a two-year follow-up", year: 2021, venue: "Journal of Public Economics", hasCode: true, score: 69 },
      { title: "Loss framing and energy conservation: a field experiment", year: 2019, venue: "Journal of Economic Behavior & Organization", hasCode: false, score: 60 },
      { title: "Anchoring in charitable giving", year: 2016, venue: "Experimental Economics", hasCode: false, score: 52 },
      { title: "Present bias in the lab: a replication attempt", year: 2014, venue: "Economics Letters", hasCode: false, score: 55 },
    ],
  },
  {
    name: "Samuel Achterberg",
    affiliation: "Meridian Observatory Consortium",
    country: "Netherlands",
    field: "astrophysics",
    target: 77,
    activeFrom: 2010,
    topics: ["fast radio bursts", "pulsar timing", "open pipelines"],
    publishedDaysAgo: 20,
    summary:
      "Radio astronomer leading the Meridian FRB survey. Detection pipelines are public and well tested; population inferences are carefully caveated, though the most-cited localization result was later revised by the same group.",
    disagreement:
      "Agreement is high; model-c scored **impact** lower, treating the revised localization as a point against the original claim.",
    publications: [
      { title: "A sample of 412 fast radio bursts from the Meridian survey", year: 2024, venue: "The Astrophysical Journal Supplement", hasCode: true, score: 82 },
      { title: "Arc-second localization of a repeating FRB", year: 2022, venue: "Nature", hasCode: true, score: 76 },
      { title: "MeridianFRB: an open real-time detection pipeline", year: 2021, venue: "Astronomy and Computing", hasCode: true, score: 80 },
      { title: "Scintillation constraints on FRB host environments", year: 2019, venue: "Monthly Notices of the RAS", hasCode: false, score: 73 },
      { title: "Pulsar timing noise across the Meridian array", year: 2016, venue: "The Astrophysical Journal", hasCode: true, score: 75 },
    ],
  },
];

const queuedSubmissions = ["Noor El-Sayed", "Henrik Bjørnstad"];

// Deterministic per-model / per-criterion offsets around the target score so
// the three models disagree a little (spread > 0) without randomness.
const MODEL_SHIFT: Record<(typeof MODELS)[number], number> = { "model-a": 2, "model-b": -3, "model-c": 1 };
const CRITERION_OFFSET: Record<(typeof MODELS)[number], number[]> = {
  "model-a": [4, -3, 2, 0, -2],
  "model-b": [-2, 3, -4, 2, 1],
  "model-c": [1, 0, 3, -3, -1],
};

function clamp(v: number): number {
  return Math.max(0, Math.min(100, Math.round(v)));
}

function modelScores(target: number, model: (typeof MODELS)[number], title: string): CriterionScores & { rationale: Record<string, string> } {
  const scores = {} as CriterionScores;
  const rationale: Record<string, string> = {};
  CRITERIA.forEach((criterion, i) => {
    scores[criterion] = clamp(target + MODEL_SHIFT[model] + CRITERION_OFFSET[model][i]);
    rationale[criterion] = `${model} assessment of ${criterion} for "${title}" from its abstract and metadata.`;
  });
  return { ...scores, rationale };
}

function paperSummary(r: SeedResearcher, p: SeedPublication): string {
  const level = p.score >= 70 ? "a solid contribution" : p.score >= 50 ? "a reasonable but uneven contribution" : "a limited contribution";
  return `"${p.title}" (${p.venue}, ${p.year}) is ${level} to ${r.topics[0]}. ${p.hasCode ? "Code is publicly available, which supports reproduction of the main result." : "No public code or data were found, so the main result cannot be re-derived from released material."}`;
}

function sections(r: SeedResearcher): AnalysisSection[] {
  const withCode = r.publications.filter((p) => p.hasCode).length;
  return [
    { title: "Overview", body: r.summary },
    {
      title: "Methodology",
      body: `Across the ${r.publications.length} sampled publications (${r.publications[r.publications.length - 1].year}–${r.publications[0].year}), the methods are described in enough detail to follow the main analyses. Statistical reporting is ${r.target >= 70 ? "consistently complete" : "uneven"}.`,
    },
    {
      title: "Reproducibility",
      body: `${withCode} of ${r.publications.length} sampled papers link to public code or data. ${withCode >= 3 ? "The released artefacts cover the headline results." : "Several headline results cannot be re-derived from released material."}`,
    },
    {
      title: "Impact and reception",
      body: `Work on ${r.topics.slice(0, 2).join(" and ")} is cited within ${fields.find((f) => f.slug === r.field)?.name ?? r.field} and adjacent fields.`,
    },
    {
      title: "Limitations of this analysis",
      body: "Only abstracts and openly available full texts were analysed. Scores reflect the models' reading of the published record, not the quality of the researcher as a person.",
    },
  ];
}

async function seedFields() {
  for (const f of fields) await upsertField(f);
  console.log(`fields: ${fields.length}`);
}

async function seedResearchers() {
  const now = Date.now();
  for (const r of researchers) {
    const { id, slug } = await upsertResearcher({
      name: r.name,
      fieldSlug: r.field,
      affiliation: r.affiliation,
      country: r.country,
      activeFrom: r.activeFrom,
      activeTo: null,
      topics: r.topics,
      orcid: null,
      openalexId: null,
    });
    const stored = await replacePublications(
      id,
      r.publications.map((p) => ({ title: p.title, year: p.year, venue: p.venue, hasCode: p.hasCode, citationCount: citations(p), doi: null, url: null, abstract: null })),
    );

    const live = await prisma.analysisRun.findFirst({ where: { researcherId: id, isCurrent: true, status: "COMPLETED" } });
    if (live) {
      console.log(`researcher ${slug}: kept existing run (score ${live.score})`);
      continue;
    }
    const finishedAt = new Date(now - r.publishedDaysAgo * 86_400_000);
    const startedAt = new Date(finishedAt.getTime() - 37 * 60_000);
    const run = await createRun({
      researcherId: id,
      promptKey: r.field,
      promptVersion: PROMPT_VERSION,
      promptSha: `sha256:${slug.padEnd(12, "0").slice(0, 12)}`,
      models: [...MODELS],
      startedAt,
    });
    for (const [i, p] of r.publications.entries()) {
      const analysis = await createPublicationAnalysis(run.id, stored[i].id);
      await completePublicationAnalysis(analysis.id, {
        modelScores: MODELS.map((model) => ({ model, ...modelScores(p.score, model, p.title) })),
        summary: paperSummary(r, p),
        strengths: [p.hasCode ? "Public code accompanies the paper" : "Clear statement of the research question", `Published in ${p.venue}`],
        concerns: [p.score >= 70 ? "Limited discussion of failure modes" : "Evidence is thinner than the claims", ...(p.hasCode ? [] : ["No released artefacts"])],
        finishedAt: new Date(startedAt.getTime() + (i + 1) * 5 * 60_000),
      });
    }
    const completed = await completeRun(run.id, {
      summary: r.summary,
      disagreement: r.disagreement,
      sections: sections(r),
      finishedAt,
    });
    console.log(`researcher ${slug}: score ${completed.score} (spread ${completed.spread}, ${completed.publicationsAnalyzed} papers)`);
  }
}

async function seedSubmissions() {
  for (const name of queuedSubmissions) {
    const pending = await prisma.submission.findFirst({
      where: { name, status: { in: [...PENDING_STATUSES] } },
    });
    if (pending) continue;
    await prisma.submission.create({ data: { name, status: "QUEUED" } });
  }
  console.log(`submissions queued: ${queuedSubmissions.length}`);
}

async function main() {
  await seedFields();
  await seedResearchers();
  await seedSubmissions();
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
