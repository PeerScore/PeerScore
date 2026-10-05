// Unit tests for the pure parts of the worker (no network, no database).
// Run with `npm test` (tsx --test).

import { test } from "node:test";
import assert from "node:assert/strict";
import { describeDisagreement, medianIndex, mergePublicationScores, mergeResults, type ModelResult } from "./merge";
import { mapOpenAlexField, mapTopic, primaryFieldFromTopics } from "./fields";
import { createMockProvider, generateMockOutput } from "./llm/mock";
import { completeAnalysis, extractJson, LlmOutputError, parseAnalysis } from "./llm/parse";
import { buildProviders } from "./llm";
import { buildUserMessage, parseFrontMatter, loadPrompt, promptSha, truncate } from "./prompts";
import { analysisOutputSchema, type AnalysisOutput } from "./schema";
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
    assert.equal(p.version, "1");
    assert.match(p.sha, /^sha256:[0-9a-f]{12}$/);
    assert.ok(p.system.includes("Methods and rigor"), `${key} prompt names the sections`);
  }
  assert.equal(loadPrompt("does-not-exist").promptKey, "general");
});

test("buildUserMessage numbers publications and truncates abstracts", () => {
  const user = buildUserMessage(
    { name: "Ada Lovelace", affiliation: "Analytical Engine Co", country: "UK", activeFrom: 1840, activeTo: null, topics: ["computing"] },
    [
      { title: "Notes", year: 1843, venue: "Taylor's Scientific Memoirs", abstract: "x ".repeat(2000), hasCode: true, doi: "10.1/notes" },
      { title: "Letters", year: 1845, venue: null, abstract: null, hasCode: false, doi: null },
    ],
    "Applied Mathematics",
  );
  assert.match(user, /^Name: Ada Lovelace$/m);
  assert.match(user, /^\[1\] Notes \(1843, \*Taylor's Scientific Memoirs\*\) — code available — doi:10\.1\/notes$/m);
  assert.match(user, /^\[2\] Letters \(1845\)$/m);
  assert.ok(user.includes("Abstract: not available."));
  assert.ok(user.includes("exactly 2 integers"));
  assert.ok(truncate("x ".repeat(2000)).length <= 901);
});

// ---------------------------------------------------------------------------
// JSON parsing / repair
// ---------------------------------------------------------------------------

function sampleOutput(overrides: Partial<AnalysisOutput> = {}): AnalysisOutput {
  return {
    scores: { rigor: 70, reproducibility: 60, novelty: 65, impact: 72, clarity: 68 },
    rationale: { rigor: "r", reproducibility: "p", novelty: "n", impact: "i", clarity: "c" },
    summary: "Para one.\n\nPara two.",
    sections: [
      { title: "Methods and rigor", body: "m" },
      { title: "Reproducibility", body: "r" },
      { title: "Field impact", body: "f" },
    ],
    strengths: ["s"],
    concerns: ["c"],
    ...overrides,
  };
}

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
  const coerced = analysisOutputSchema.parse({ ...sampleOutput(), scores: { rigor: "70", reproducibility: "60", novelty: "65", impact: "72", clarity: "68" }, strengths: undefined });
  assert.equal(coerced.scores.rigor, 70);
  assert.deepEqual(coerced.strengths, []);
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
});

// ---------------------------------------------------------------------------
// Mock provider
// ---------------------------------------------------------------------------

const USER = buildUserMessage(
  { name: "Noor El-Sayed", affiliation: null, country: null, activeFrom: null, activeTo: null, topics: [] },
  [
    { title: "A", year: 2020, venue: null, abstract: null, hasCode: false, doi: null },
    { title: "B", year: 2021, venue: null, abstract: null, hasCode: true, doi: null },
    { title: "C", year: 2022, venue: null, abstract: null, hasCode: false, doi: null },
  ],
  "Computational Biology",
);

test("mock provider is deterministic per (name, id) and differs across ids", async () => {
  const a1 = parseAnalysis(await createMockProvider("model-a").complete("", USER));
  const a2 = parseAnalysis(await createMockProvider("model-a").complete("", USER));
  const b = parseAnalysis(await createMockProvider("model-b").complete("", USER));
  assert.deepEqual(a1, a2);
  assert.notDeepEqual(a1.scores, b.scores);
  assert.equal(a1.publicationScores?.length, 3);
  assert.equal(a1.sections.length, 3);
  assert.ok(a1.summary.includes("Noor El-Sayed"));
  assert.ok(/\[\d\]/.test(a1.summary));
  const direct = generateMockOutput("Noor El-Sayed::model-a", USER);
  assert.deepEqual(direct, a1);
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
// Merge / disagreement
// ---------------------------------------------------------------------------

function result(model: string, scores: Partial<AnalysisOutput["scores"]>, rationale: Partial<AnalysisOutput["rationale"]> = {}): ModelResult {
  const output = sampleOutput({
    scores: { ...sampleOutput().scores, ...scores },
    rationale: { ...sampleOutput().rationale, ...rationale },
    summary: `summary by ${model}`,
    sections: sampleOutput().sections.map((s) => ({ ...s, body: `${s.body} by ${model}` })),
    publicationScores: model === "model-c" ? undefined : [80, 60],
  });
  return { model, output, weighted: 0 };
}

test("describeDisagreement names the widest criterion and the outlier", () => {
  const results = [
    result("model-a", { novelty: 80 }, { novelty: "very new" }),
    result("model-b", { novelty: 78 }),
    result("model-c", { novelty: 40 }, { novelty: "seen before" }),
  ];
  const text = describeDisagreement(results)!;
  assert.ok(text.includes("**novelty**"));
  assert.ok(text.includes("spread 40"));
  assert.ok(text.includes("**model-c**"));
  assert.ok(text.includes("lower"));
  assert.ok(text.includes("seen before"));
  assert.equal(describeDisagreement([results[0]]), null);
  assert.match(describeDisagreement([result("a", {}), result("b", {})])!, /agree on every criterion/);
});

test("mergeResults uses the median model's text and averages publication scores", () => {
  const results = [
    result("model-a", { rigor: 90, reproducibility: 90, novelty: 90, impact: 90, clarity: 90 }),
    result("model-b", { rigor: 50, reproducibility: 50, novelty: 50, impact: 50, clarity: 50 }),
    result("model-c", { rigor: 70, reproducibility: 70, novelty: 70, impact: 70, clarity: 70 }),
  ].map((r) => ({ ...r, weighted: r.output.scores.rigor }));
  assert.equal(medianIndex([90, 50, 70]), 2);
  const merged = mergeResults(results, DEFAULT_WEIGHTS, 2);
  assert.equal(merged.summary, "summary by model-c");
  assert.equal(merged.sections[0].body, "m by model-c");
  assert.equal(merged.modelScores.length, 3);
  assert.equal(merged.modelScores[0].weighted, 90);
  assert.deepEqual(merged.modelScores[0].rationale?.strengths, ["s"]);
  assert.deepEqual(merged.publicationScores, [80, 60]);
  assert.deepEqual(mergePublicationScores([result("model-c", {})], 2), [null, null]);
  assert.ok(merged.disagreement);
});
