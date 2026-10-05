// Unit tests for the pure parts of the worker (no network, no database).
// Run with `npm test` (tsx --test).

import { test } from "node:test";
import assert from "node:assert/strict";
import { describeDisagreement, mapLimit, medianIndex, mergePaperResults, widestDisagreement, type ModelResult } from "./merge";
import { mapOpenAlexField, mapTopic, primaryFieldFromTopics } from "./fields";
import { createMockProvider, generateMockPaperOutput, generateMockSynthesis } from "./llm/mock";
import { completeAnalysis, completeSynthesis, extractJson, LlmOutputError, parseAnalysis, parseSynthesis } from "./llm/parse";
import { buildProviders } from "./llm";
import { buildPaperMessage, buildSynthesisMessage, parseFrontMatter, loadPrompt, loadSynthesisPrompt, promptSha, truncate, type SynthesisPaper } from "./prompts";
import { paperAnalysisSchema, type PaperAnalysisOutput } from "./schema";
import {
  detectCode,
  loadFixture,
  mapAuthor,
  mapWork,
  nameSimilarity,
  pickBestAuthor,
  reconstructAbstract,
  resolveField,
  type OpenAlexAuthor,
  type OpenAlexList,
  type OpenAlexWork,
} from "./sources/openalex";
import { DEFAULT_WEIGHTS } from "../src/lib/scoring";

// ---------------------------------------------------------------------------
// Field mapping
// ---------------------------------------------------------------------------

test("mapOpenAlexField maps subfield and field names, falls back to general", () => {
  assert.equal(mapOpenAlexField("Artificial Intelligence"), "ml");
  assert.equal(mapOpenAlexField("Oncology"), "oncology");
  assert.equal(mapOpenAlexField("Astronomy and Astrophysics"), "astrophysics");
  assert.equal(mapOpenAlexField("Mathematics"), "applied-math");
  assert.equal(mapOpenAlexField("Underwater basket weaving"), "general");
  assert.equal(mapOpenAlexField(null), "general");
});

test("mapTopic prefers subfield over field over topic keywords", () => {
  assert.equal(mapTopic({ display_name: "x", subfield: { display_name: "Condensed Matter Physics" }, field: { display_name: "Medicine" } }), "physics-cm");
  assert.equal(mapTopic({ display_name: "x", subfield: { display_name: "Unknown" }, field: { display_name: "Computer Science" } }), "ml");
  assert.equal(mapTopic({ display_name: "Coral reef resilience", subfield: null, field: null }), "marine-ecology");
  assert.equal(mapTopic({ display_name: "Medieval poetry" }), null);
});

test("primaryFieldFromTopics takes the first topic that maps", () => {
  assert.equal(primaryFieldFromTopics([{ display_name: "Medieval poetry" }, { display_name: "x", field: { display_name: "Economics, Econometrics and Finance" } }]), "behavioral-econ");
  assert.equal(primaryFieldFromTopics([]), "general");
});

test("resolveField falls back to the works' topics when the author has none", () => {
  const author = { id: "A1", display_name: "X", works_count: 1, topics: [] } as OpenAlexAuthor;
  const works = [
    { id: "W1", topics: [{ display_name: "Tumour immunology", subfield: { display_name: "Oncology" } }] },
    { id: "W2", topics: [{ display_name: "Tumour immunology", subfield: { display_name: "Oncology" } }] },
    { id: "W3", topics: [{ display_name: "Deep learning", subfield: { display_name: "Artificial Intelligence" } }] },
  ] as OpenAlexWork[];
  assert.equal(resolveField(author, works), "oncology");
});

// ---------------------------------------------------------------------------
// OpenAlex mapping
// ---------------------------------------------------------------------------

test("reconstructAbstract rebuilds text from an inverted index", () => {
  const index = { the: [0, 4], cat: [1], sat: [2], on: [3], mat: [5] };
  assert.equal(reconstructAbstract(index), "the cat sat on the mat");
  assert.equal(reconstructAbstract(null), null);
  assert.equal(reconstructAbstract({}), null);
});

test("detectCode uses repository URLs or abstract phrasing", () => {
  assert.equal(detectCode({ locations: [{ landing_page_url: "https://github.com/x/y" }] }, null), true);
  assert.equal(detectCode({ locations: [{ landing_page_url: "https://doi.org/10.1/x" }] }, "Code is publicly available."), true);
  assert.equal(detectCode({ locations: [{ landing_page_url: "https://doi.org/10.1/x" }] }, "We measured things."), false);
});

test("mapWork maps the fixture works (doi cleaned, venue, hasCode)", () => {
  const works = loadFixture<OpenAlexList<OpenAlexWork>>("openalex-works.json").results;
  const mapped = works.map(mapWork).filter((p) => p !== null);
  assert.ok(mapped.length >= 5);
  const first = mapped[0]!;
  assert.equal(first.doi, "10.1101/gr.000001");
  assert.equal(first.year, 2023);
  assert.ok(first.citedBy > 0);
  assert.match(first.openalexId ?? "", /^W\d+$/);
  assert.ok(first.venue);
  assert.ok(first.abstract && first.abstract.length > 20);
  assert.ok(mapped.some((p) => p.hasCode));
  assert.ok(mapped.some((p) => !p.hasCode));
  assert.equal(mapWork({ id: "W0", title: "", publication_year: 2020 }), null);
});

test("nameSimilarity and pickBestAuthor favour the closest name", () => {
  assert.equal(nameSimilarity("Noor El-Sayed", "Noor El-Sayed"), 1);
  assert.ok(nameSimilarity("Noor El-Sayed", "N. El-Sayed") > 0.5);
  assert.ok(nameSimilarity("Noor El-Sayed", "John Smith") < 0.2);
  const authors = loadFixture<OpenAlexList<OpenAlexAuthor>>("openalex-authors.json").results;
  const best = pickBestAuthor("Noor El-Sayed", authors);
  assert.equal(best?.id, "https://openalex.org/A5000000001");
  assert.equal(pickBestAuthor("x", []), null);
});

test("mapAuthor strips id/orcid prefixes and derives field + activity years", () => {
  const author = loadFixture<OpenAlexList<OpenAlexAuthor>>("openalex-authors.json").results[0];
  const r = mapAuthor(author);
  assert.equal(r.openalexId, "A5000000001");
  assert.equal(r.orcid, "0000-0002-1825-0097");
  assert.ok(r.affiliation);
  assert.ok(r.country);
  assert.ok(r.activeFrom && r.activeTo && r.activeFrom <= r.activeTo);
  assert.ok(r.topics.length <= 3 && r.topics.length > 0);
  assert.notEqual(r.fieldSlug, "general");
});

// ---------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------

test("parseFrontMatter + loadPrompt read version and compute a stable sha", () => {
  const { meta, body } = parseFrontMatter("---\nversion: 1\nfield: \"X\"\n---\nBody here");
  assert.deepEqual(meta, { version: "1", field: "X" });
  assert.equal(body, "Body here");
  assert.equal(promptSha("a"), promptSha("a"));
  assert.notEqual(promptSha("a"), promptSha("b"));
  for (const key of ["compbio", "ml", "physics-cm", "oncology", "applied-math", "marine-ecology", "behavioral-econ", "astrophysics", "general"]) {
    const p = loadPrompt(key);
    assert.equal(p.promptKey, key);
    assert.equal(p.version, "2");
    assert.match(p.sha, /^sha256:[0-9a-f]{12}$/);
    assert.ok(p.system.includes("ONE publication"), `${key} prompt reviews one publication`);
    assert.ok(!p.system.includes("publicationScores"), `${key} prompt has no per-list scores any more`);
  }
  assert.equal(loadPrompt("does-not-exist").promptKey, "general");
  const synth = loadSynthesisPrompt();
  assert.equal(synth.promptKey, "_synthesis");
  assert.equal(synth.version, "2");
  assert.ok(synth.system.includes("Methods and rigor"), "synthesis prompt names the sections");
});

const ADA = { name: "Ada Lovelace", affiliation: "Analytical Engine Co", country: "UK", activeFrom: 1840, activeTo: null, topics: ["computing"] };

test("buildPaperMessage describes one paper and truncates the abstract", () => {
  const user = buildPaperMessage(ADA, { title: "Notes", year: 1843, venue: "Taylor's Scientific Memoirs", abstract: "x ".repeat(2000), hasCode: true, doi: "10.1/notes", citedBy: 12 }, "Applied Mathematics");
  assert.match(user, /^# Publication$/m);
  assert.match(user, /^Title: Notes$/m);
  assert.match(user, /^Venue: Taylor's Scientific Memoirs$/m);
  assert.match(user, /^Citations: 12$/m);
  assert.match(user, /^Code available: yes$/m);
  assert.match(user, /^Name: Ada Lovelace$/m);
  assert.ok(user.indexOf("# Publication") < user.indexOf("# Author context"));
  const abstractLine = user.match(/^Abstract: (.+)$/m)![1];
  assert.ok(abstractLine.length <= 901);
  const bare = buildPaperMessage(ADA, { title: "Letters", year: 1845, venue: null, abstract: null, hasCode: false, doi: null }, "Applied Mathematics");
  assert.match(bare, /^Venue: not available$/m);
  assert.match(bare, /^Abstract: not available\.$/m);
  assert.match(bare, /^Code available: not found$/m);
  assert.ok(truncate("x ".repeat(2000)).length <= 901);
});

function paper(title: string, overrides: Partial<SynthesisPaper> = {}): SynthesisPaper {
  const scores = { rigor: 70, reproducibility: 60, novelty: 65, impact: 72, clarity: 68 };
  return {
    title,
    year: 2020,
    venue: "Venue",
    citationCount: 10,
    hasCode: false,
    score: 67,
    spread: 4,
    summary: `summary of ${title}`,
    strengths: ["s"],
    concerns: ["c"],
    modelScores: [
      { model: "model-a", weighted: 69, scores, rationale: { novelty: "a says" } },
      { model: "model-b", weighted: 65, scores, rationale: { novelty: "b says" } },
    ],
    ...overrides,
  };
}

test("buildSynthesisMessage numbers the per-paper reviews and carries the disagreement", () => {
  const user = buildSynthesisMessage({
    researcher: ADA,
    fieldName: "Applied Mathematics",
    papers: [paper("Notes", { citationCount: 50, hasCode: true }), paper("Letters")],
    aggregateScore: 68,
    disagreement: "They disagree on X.",
    failedCount: 1,
  });
  assert.match(user, /^# Researcher$/m);
  assert.match(user, /^Aggregate score: 68/m);
  assert.match(user, /could not be reviewed: 1/m);
  assert.match(user, /^\[1\] Notes \(2020, \*Venue\*\) — 50 citations — code available$/m);
  assert.match(user, /^\[2\] Letters \(2020, \*Venue\*\) — 10 citations$/m);
  assert.match(user, /^\s+Score: 67 \(model spread 4\); per model: model-a 69, model-b 65$/m);
  assert.match(user, /^\s+Summary: summary of Notes$/m);
  assert.ok(user.includes("They disagree on X."));
});

// ---------------------------------------------------------------------------
// JSON parsing / repair
// ---------------------------------------------------------------------------

function sampleOutput(overrides: Partial<PaperAnalysisOutput> = {}): PaperAnalysisOutput {
  return {
    scores: { rigor: 70, reproducibility: 60, novelty: 65, impact: 72, clarity: 68 },
    rationale: { rigor: "r", reproducibility: "p", novelty: "n", impact: "i", clarity: "c" },
    summary: "One paragraph about the paper.",
    strengths: ["s"],
    concerns: ["c"],
    ...overrides,
  };
}

const SAMPLE_SYNTHESIS = {
  summary: "Para one.\n\nPara two.",
  sections: [
    { title: "Methods and rigor", body: "m" },
    { title: "Reproducibility", body: "r" },
    { title: "Field impact", body: "f" },
  ],
  disagreement: "They disagree on novelty of [1].",
};

test("extractJson strips fences and surrounding prose", () => {
  assert.equal(extractJson('Sure!\n```json\n{"a":1}\n```\nDone.'), '{"a":1}');
  assert.equal(extractJson('Here you go: {"a":{"b":2}} thanks'), '{"a":{"b":2}}');
  assert.throws(() => extractJson("no json here"), LlmOutputError);
});

test("parseAnalysis validates against the zod schema", () => {
  const good = parseAnalysis("```json\n" + JSON.stringify(sampleOutput()) + "\n```");
  assert.equal(good.scores.rigor, 70);
  assert.deepEqual(good.strengths, ["s"]);
  assert.throws(() => parseAnalysis(JSON.stringify({ ...sampleOutput(), scores: { rigor: 101 } })), /scores\.rigor|Output does not match schema/);
  assert.throws(() => parseAnalysis("{ not json }"), /Invalid JSON/);
  // string scores are coerced, defaults applied
  const coerced = paperAnalysisSchema.parse({ ...sampleOutput(), scores: { rigor: "70", reproducibility: "60", novelty: "65", impact: "72", clarity: "68" }, strengths: undefined });
  assert.equal(coerced.scores.rigor, 70);
  assert.deepEqual(coerced.strengths, []);
});

test("parseSynthesis validates the synthesis contract", () => {
  const good = parseSynthesis(JSON.stringify(SAMPLE_SYNTHESIS));
  assert.equal(good.sections.length, 3);
  assert.equal(good.disagreement, "They disagree on novelty of [1].");
  assert.equal(parseSynthesis(JSON.stringify({ ...SAMPLE_SYNTHESIS, disagreement: undefined })).disagreement, "");
  assert.throws(() => parseSynthesis(JSON.stringify({ summary: "x", sections: [] })), /sections/);
});

test("completeAnalysis retries once with a repair request", async () => {
  const calls: string[] = [];
  const provider = {
    id: "flaky",
    async complete(_system: string, user: string) {
      calls.push(user);
      return calls.length === 1 ? "oops {" : JSON.stringify(sampleOutput());
    },
  };
  const out = await completeAnalysis(provider, "sys", "user msg");
  assert.equal(out.scores.impact, 72);
  assert.equal(calls.length, 2);
  assert.ok(calls[1].startsWith("user msg"));
  assert.ok(calls[1].includes("could not be used"));

  const alwaysBad = { id: "bad", async complete() { return "nope"; } };
  await assert.rejects(() => completeAnalysis(alwaysBad, "s", "u"), LlmOutputError);
  const synth = { id: "synth", async complete() { return JSON.stringify(SAMPLE_SYNTHESIS); } };
  assert.equal((await completeSynthesis(synth, "s", "u")).sections[2].title, "Field impact");
});

// ---------------------------------------------------------------------------
// Mock provider
// ---------------------------------------------------------------------------

const NOOR = { name: "Noor El-Sayed", affiliation: null, country: null, activeFrom: null, activeTo: null, topics: [] };
const PAPER_A = buildPaperMessage(NOOR, { title: "A", year: 2020, venue: null, abstract: null, hasCode: false, doi: null }, "Computational Biology");
const PAPER_B = buildPaperMessage(NOOR, { title: "B", year: 2021, venue: "V", abstract: "We release the code.", hasCode: true, doi: null }, "Computational Biology");

test("mock provider is deterministic per (title, id), differs across ids and papers", async () => {
  const a1 = parseAnalysis(await createMockProvider("model-a").complete("", PAPER_A));
  const a2 = parseAnalysis(await createMockProvider("model-a").complete("", PAPER_A));
  const b = parseAnalysis(await createMockProvider("model-b").complete("", PAPER_A));
  const other = parseAnalysis(await createMockProvider("model-a").complete("", PAPER_B));
  assert.deepEqual(a1, a2);
  assert.notDeepEqual(a1.scores, b.scores);
  assert.notDeepEqual(a1.scores, other.scores);
  assert.ok(a1.summary.includes('"A"'));
  assert.ok(a1.strengths.length >= 1 && a1.concerns.length >= 1);
  assert.ok(other.strengths.includes("Public code accompanies the paper"));
  const direct = generateMockPaperOutput("A::model-a", PAPER_A);
  assert.deepEqual(direct, a1);
});

test("mock provider answers the synthesis message with sections and the disagreement", async () => {
  const user = buildSynthesisMessage({
    researcher: NOOR,
    fieldName: "Computational Biology",
    papers: [paper("A"), paper("B")],
    aggregateScore: 67,
    disagreement: "The models disagree most on **novelty** of [1].",
  });
  const out = parseSynthesis(await createMockProvider("model-a").complete("", user));
  assert.equal(out.sections.length, 3);
  assert.equal(out.sections[0].title, "Methods and rigor");
  assert.ok(out.summary.includes("Noor El-Sayed"));
  assert.ok(/\[\d\]/.test(out.summary));
  assert.equal(out.disagreement, "The models disagree most on **novelty** of [1].");
  assert.deepEqual(generateMockSynthesis("Noor El-Sayed::model-a", user), out);
});

test("buildProviders picks mocks when no keys, explicit list otherwise", () => {
  assert.deepEqual(buildProviders({}).map((p) => p.id), ["model-a", "model-b", "model-c"]);
  assert.deepEqual(buildProviders({ LLM_MOCK: "1", ANTHROPIC_API_KEY: "k" }).map((p) => p.id), ["model-a", "model-b", "model-c"]);
  assert.deepEqual(buildProviders({ ANTHROPIC_API_KEY: "k" }).map((p) => p.id), ["anthropic"]);
  assert.deepEqual(buildProviders({ LLM_PROVIDERS: "openai,mock", OPENAI_API_KEY: "k" }).map((p) => p.id), ["openai", "model-a", "model-b", "model-c"]);
  assert.throws(() => buildProviders({ LLM_PROVIDERS: "anthropic" }), /ANTHROPIC_API_KEY/);
  assert.throws(() => buildProviders({ LLM_PROVIDERS: "gemini" }), /Unknown LLM provider/);
});

// ---------------------------------------------------------------------------
// Merge / disagreement / concurrency
// ---------------------------------------------------------------------------

function result(model: string, scores: Partial<PaperAnalysisOutput["scores"]>, rationale: Partial<PaperAnalysisOutput["rationale"]> = {}): ModelResult {
  const output = sampleOutput({
    scores: { ...sampleOutput().scores, ...scores },
    rationale: { ...sampleOutput().rationale, ...rationale },
    summary: `summary by ${model}`,
    strengths: [`strength by ${model}`],
  });
  return { model, output, weighted: 0 };
}

test("mergePaperResults keeps every model's scores and the median model's prose", () => {
  const results = [
    result("model-a", { rigor: 90, reproducibility: 90, novelty: 90, impact: 90, clarity: 90 }),
    result("model-b", { rigor: 50, reproducibility: 50, novelty: 50, impact: 50, clarity: 50 }),
    result("model-c", { rigor: 70, reproducibility: 70, novelty: 70, impact: 70, clarity: 70 }),
  ];
  assert.equal(medianIndex([90, 50, 70]), 2);
  const merged = mergePaperResults(results, DEFAULT_WEIGHTS);
  assert.equal(merged.summary, "summary by model-c");
  assert.deepEqual(merged.strengths, ["strength by model-c"]);
  assert.equal(merged.modelScores.length, 3);
  assert.equal(merged.modelScores[0].weighted, 90);
  assert.equal(merged.modelScores[0].rationale?.rigor, "r");
  assert.equal(merged.score, 70);
  assert.equal(merged.spread, 40);
  assert.throws(() => mergePaperResults([], DEFAULT_WEIGHTS));
});

test("describeDisagreement names the paper, the widest criterion and the outlier", () => {
  const scoresOf = (novelty: number) => ({ rigor: 70, reproducibility: 60, novelty, impact: 72, clarity: 68 });
  const papers = [
    paper("Calm paper"),
    paper("Contested paper", {
      modelScores: [
        { model: "model-a", weighted: 70, scores: scoresOf(80), rationale: { novelty: "very new" } },
        { model: "model-b", weighted: 70, scores: scoresOf(78), rationale: {} },
        { model: "model-c", weighted: 60, scores: scoresOf(40), rationale: { novelty: "seen before" } },
      ],
    }),
  ];
  assert.deepEqual(widestDisagreement(papers), { paperIndex: 1, criterion: "novelty", spread: 40 });
  const text = describeDisagreement(papers)!;
  assert.ok(text.includes("**novelty**"));
  assert.ok(text.includes('[2] "Contested paper"'));
  assert.ok(text.includes("spread 40"));
  assert.ok(text.includes("**model-c**"));
  assert.ok(text.includes("lower"));
  assert.ok(text.includes("seen before"));
  assert.equal(describeDisagreement([paper("Solo", { modelScores: [paper("x").modelScores[0]] })]), null);
  assert.match(describeDisagreement([paper("Agreed")])!, /agree on every criterion/);
});

test("mapLimit bounds concurrency and keeps the input order", async () => {
  let running = 0;
  let peak = 0;
  const out = await mapLimit([1, 2, 3, 4, 5], 2, async (n) => {
    running++;
    peak = Math.max(peak, running);
    await new Promise((r) => setTimeout(r, 5));
    running--;
    return n * 10;
  });
  assert.deepEqual(out, [10, 20, 30, 40, 50]);
  assert.equal(peak, 2);
  assert.deepEqual(await mapLimit([], 3, async () => 1), []);
});
