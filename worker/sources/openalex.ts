// OpenAlex source: resolve a researcher by name and fetch their works.
// API docs: https://docs.openalex.org/ — authors: /authors?search=…,
// works: /works?filter=authorships.author.id:A…&sort=cited_by_count:desc
//
// `OPENALEX_FIXTURE=1` makes both calls return the JSON in worker/__fixtures__/
// (used by tests and the smoke script when the API is unreachable).

import { readFileSync } from "node:fs";
import path from "node:path";
import { fetchJson } from "../http";
import { mapTopic, primaryFieldFromTopics, type FieldSlug, type TopicLike } from "../fields";

export const OPENALEX_BASE = process.env.OPENALEX_BASE_URL ?? "https://api.openalex.org";

// ---------------------------------------------------------------------------
// API shapes (only the parts we use)
// ---------------------------------------------------------------------------

export interface OpenAlexTopic extends TopicLike {
  id?: string;
  display_name: string;
  count?: number;
  subfield?: { id?: string; display_name: string } | null;
  field?: { id?: string; display_name: string } | null;
  domain?: { id?: string; display_name: string } | null;
}

export interface OpenAlexInstitution {
  id?: string;
  display_name: string;
  country_code?: string | null;
  type?: string | null;
}

export interface OpenAlexAuthor {
  id: string;
  display_name: string;
  display_name_alternatives?: string[];
  orcid?: string | null;
  works_count: number;
  cited_by_count?: number;
  last_known_institutions?: OpenAlexInstitution[] | null;
  affiliations?: { institution: OpenAlexInstitution; years: number[] }[];
  topics?: OpenAlexTopic[];
  counts_by_year?: { year: number; works_count: number; cited_by_count: number }[];
  works_api_url?: string;
}

export interface OpenAlexLocation {
  is_oa?: boolean;
  landing_page_url?: string | null;
  pdf_url?: string | null;
  source?: { id?: string; display_name?: string | null; type?: string | null; host_organization_name?: string | null } | null;
  version?: string | null;
}

export interface OpenAlexWork {
  id: string;
  title?: string | null;
  display_name?: string | null;
  publication_year?: number | null;
  doi?: string | null;
  type?: string | null;
  cited_by_count?: number;
  primary_location?: OpenAlexLocation | null;
  locations?: OpenAlexLocation[] | null;
  abstract_inverted_index?: Record<string, number[]> | null;
  topics?: OpenAlexTopic[];
}

export interface OpenAlexList<T> {
  meta?: { count?: number; page?: number; per_page?: number; next_cursor?: string | null };
  results: T[];
}

// ---------------------------------------------------------------------------
// Output shapes
// ---------------------------------------------------------------------------

export interface ResolvedPublication {
  title: string;
  year: number;
  venue: string | null;
  doi: string | null;
  url: string | null;
  abstract: string | null;
  hasCode: boolean;
  citedBy: number;
}

export interface ResolvedResearcher {
  name: string;
  openalexId: string;
  orcid: string | null;
  affiliation: string | null;
  country: string | null;
  activeFrom: number | null;
  activeTo: number | null;
  topics: string[];
  fieldSlug: FieldSlug;
  worksCount: number;
}

// ---------------------------------------------------------------------------
// Pure helpers (unit-tested)
// ---------------------------------------------------------------------------

/** Rebuild the abstract text from OpenAlex's inverted index. */
export function reconstructAbstract(index: Record<string, number[]> | null | undefined): string | null {
  if (!index) return null;
  const words: string[] = [];
  for (const [word, positions] of Object.entries(index)) {
    for (const pos of positions) words[pos] = word;
  }
  const text = words.filter((w) => w !== undefined).join(" ").replace(/\s+/g, " ").trim();
  return text.length > 0 ? text : null;
}

const CODE_URL = /github\.com|gitlab\.com|bitbucket\.org|zenodo\.org|codeocean\.com|huggingface\.co/i;
const CODE_TEXT = /\b(code (is|are) (publicly )?available|source code|open[- ]source (code|implementation|software)|github\.com|our (code|implementation) (is|can be)|software package|available at https?:\/\/)/i;

/** Heuristic: does the work ship code? */
export function detectCode(work: Pick<OpenAlexWork, "locations" | "primary_location">, abstract: string | null): boolean {
  const locations = [...(work.locations ?? []), ...(work.primary_location ? [work.primary_location] : [])];
  for (const loc of locations) {
    const urls = [loc.landing_page_url, loc.pdf_url].filter((u): u is string => Boolean(u));
    if (urls.some((u) => CODE_URL.test(u))) return true;
    if (loc.source?.type === "repository" && urls.some((u) => /github|gitlab|zenodo/i.test(u))) return true;
  }
  return abstract ? CODE_TEXT.test(abstract) : false;
}

function cleanDoi(doi: string | null | undefined): string | null {
  if (!doi) return null;
  return doi.replace(/^https?:\/\/(dx\.)?doi\.org\//i, "").trim() || null;
}

/** Map an OpenAlex work to our publication shape (null when unusable). */
export function mapWork(work: OpenAlexWork): ResolvedPublication | null {
  const title = (work.title ?? work.display_name ?? "").trim();
  const year = work.publication_year ?? null;
  if (!title || !year) return null;
  const abstract = reconstructAbstract(work.abstract_inverted_index);
  const primary = work.primary_location ?? null;
  const doi = cleanDoi(work.doi);
  const url = primary?.landing_page_url ?? (doi ? `https://doi.org/${doi}` : null) ?? work.id ?? null;
  return {
    title,
    year,
    venue: primary?.source?.display_name?.trim() || null,
    doi,
    url,
    abstract,
    hasCode: detectCode(work, abstract),
    citedBy: work.cited_by_count ?? 0,
  };
}

/** Dice coefficient on bigrams, 0–1 — good enough to compare person names. */
export function nameSimilarity(a: string, b: string): number {
  const norm = (s: string) =>
    s
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9 ]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  const x = norm(a);
  const y = norm(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  const bigrams = (s: string) => {
    const m = new Map<string, number>();
    for (let i = 0; i < s.length - 1; i++) {
      const g = s.slice(i, i + 2);
      m.set(g, (m.get(g) ?? 0) + 1);
    }
    return m;
  };
  const bx = bigrams(x);
  const by = bigrams(y);
  let overlap = 0;
  for (const [g, n] of bx) overlap += Math.min(n, by.get(g) ?? 0);
  return (2 * overlap) / (x.length - 1 + (y.length - 1));
}

/**
 * Choose the best author among search hits: name similarity first (the API
 * search is fuzzy), works_count as a tie-breaker / weak prior.
 */
export function pickBestAuthor(query: string, candidates: readonly OpenAlexAuthor[]): OpenAlexAuthor | null {
  if (candidates.length === 0) return null;
  const maxWorks = Math.max(1, ...candidates.map((c) => c.works_count ?? 0));
  let best: OpenAlexAuthor | null = null;
  let bestScore = -Infinity;
  for (const c of candidates) {
    const names = [c.display_name, ...(c.display_name_alternatives ?? [])];
    const sim = Math.max(...names.map((n) => nameSimilarity(query, n)));
    // log scale so a prolific author does not dominate a better name match
    const prolific = Math.log1p(c.works_count ?? 0) / Math.log1p(maxWorks);
    const score = sim * 0.8 + prolific * 0.2;
    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }
  return best;
}

export function mapAuthor(author: OpenAlexAuthor): ResolvedResearcher {
  const institution = author.last_known_institutions?.[0] ?? author.affiliations?.[0]?.institution ?? null;
  const years = (author.counts_by_year ?? []).map((c) => c.year).filter((y) => Number.isFinite(y));
  const affiliationYears = (author.affiliations ?? []).flatMap((a) => a.years ?? []);
  const allYears = [...years, ...affiliationYears];
  const topics = (author.topics ?? []).slice(0, 3).map((t) => t.display_name).filter(Boolean);
  return {
    name: author.display_name,
    openalexId: author.id.replace(/^https?:\/\/openalex\.org\//i, ""),
    orcid: author.orcid ? author.orcid.replace(/^https?:\/\/orcid\.org\//i, "") : null,
    affiliation: institution?.display_name ?? null,
    country: institution?.country_code ? countryName(institution.country_code) : null,
    activeFrom: allYears.length ? Math.min(...allYears) : null,
    activeTo: allYears.length ? Math.max(...allYears) : null,
    topics,
    fieldSlug: primaryFieldFromTopics(author.topics),
    worksCount: author.works_count ?? 0,
  };
}

/** Primary field from the author's topics, or from the works' topics as a fallback. */
export function resolveField(author: OpenAlexAuthor, works: readonly OpenAlexWork[]): FieldSlug {
  const fromAuthor = primaryFieldFromTopics(author.topics);
  if (fromAuthor !== "general") return fromAuthor;
  const counts = new Map<FieldSlug, number>();
  for (const w of works) {
    const slug = mapTopic(w.topics?.[0]);
    if (slug) counts.set(slug, (counts.get(slug) ?? 0) + 1);
  }
  let best: FieldSlug = "general";
  let bestCount = 0;
  for (const [slug, n] of counts) {
    if (n > bestCount) {
      best = slug;
      bestCount = n;
    }
  }
  return best;
}

let regionNames: Intl.DisplayNames | null | undefined;
function countryName(code: string): string {
  if (regionNames === undefined) {
    try {
      regionNames = new Intl.DisplayNames(["en"], { type: "region" });
    } catch {
      regionNames = null;
    }
  }
  try {
    return regionNames?.of(code.toUpperCase()) ?? code.toUpperCase();
  } catch {
    return code.toUpperCase();
  }
}

// ---------------------------------------------------------------------------
// Network / fixtures
// ---------------------------------------------------------------------------

const FIXTURES_DIR = path.join(__dirname, "..", "__fixtures__");

function fixturesEnabled(): boolean {
  return process.env.OPENALEX_FIXTURE === "1";
}

export function loadFixture<T>(name: string): T {
  return JSON.parse(readFileSync(path.join(FIXTURES_DIR, name), "utf8")) as T;
}

function withMailto(url: URL): URL {
  const mailto = process.env.OPENALEX_MAILTO;
  if (mailto) url.searchParams.set("mailto", mailto);
  return url;
}

export async function searchAuthors(name: string): Promise<OpenAlexAuthor[]> {
  if (fixturesEnabled()) {
    // Fixture mode: the stub author takes the submitted name so that the
    // pipeline can be exercised end-to-end with any queued submission.
    const results = loadFixture<OpenAlexList<OpenAlexAuthor>>("openalex-authors.json").results;
    return results.map((a, i) => (i === 0 ? { ...a, display_name: name } : a));
  }
  const url = withMailto(new URL(`${OPENALEX_BASE}/authors`));
  url.searchParams.set("search", name);
  url.searchParams.set("per-page", "10");
  const data = await fetchJson<OpenAlexList<OpenAlexAuthor>>(url.toString());
  return data.results ?? [];
}

export async function resolveAuthor(name: string): Promise<OpenAlexAuthor> {
  const hits = await searchAuthors(name);
  const best = pickBestAuthor(name, hits);
  if (!best) throw new Error(`No OpenAlex author found for "${name}"`);
  if (nameSimilarity(name, best.display_name) < 0.35) {
    throw new Error(`OpenAlex best match "${best.display_name}" is too different from "${name}"`);
  }
  return best;
}

export function maxPublications(): number {
  const n = Number(process.env.MAX_PUBLICATIONS ?? 50);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 50;
}

/** Works of an author, most cited first, up to MAX_PUBLICATIONS (paginated). */
export async function fetchWorks(authorId: string, limit = maxPublications()): Promise<OpenAlexWork[]> {
  if (fixturesEnabled()) return loadFixture<OpenAlexList<OpenAlexWork>>("openalex-works.json").results.slice(0, limit);
  const id = authorId.replace(/^https?:\/\/openalex\.org\//i, "");
  const perPage = Math.min(50, limit);
  const works: OpenAlexWork[] = [];
  for (let page = 1; works.length < limit; page++) {
    const url = withMailto(new URL(`${OPENALEX_BASE}/works`));
    url.searchParams.set("filter", `authorships.author.id:${id}`);
    url.searchParams.set("sort", "cited_by_count:desc");
    url.searchParams.set("per-page", String(perPage));
    url.searchParams.set("page", String(page));
    url.searchParams.set(
      "select",
      "id,title,display_name,publication_year,doi,type,cited_by_count,primary_location,locations,abstract_inverted_index,topics",
    );
    const data = await fetchJson<OpenAlexList<OpenAlexWork>>(url.toString());
    const batch = data.results ?? [];
    works.push(...batch);
    if (batch.length < perPage) break;
  }
  return works.slice(0, limit);
}

export interface OpenAlexResolution {
  researcher: ResolvedResearcher;
  publications: ResolvedPublication[];
}

/** Full resolution: author + mapped works + primary field. */
export async function resolveResearcher(name: string): Promise<OpenAlexResolution> {
  const author = await resolveAuthor(name);
  const works = await fetchWorks(author.id);
  const publications = works
    .map(mapWork)
    .filter((p): p is ResolvedPublication => p !== null)
    .sort((a, b) => b.citedBy - a.citedBy);
  const researcher = mapAuthor(author);
  researcher.fieldSlug = resolveField(author, works);
  if (researcher.activeFrom === null && publications.length) {
    const years = publications.map((p) => p.year);
    researcher.activeFrom = Math.min(...years);
    researcher.activeTo = Math.max(...years);
  }
  return { researcher, publications };
}
