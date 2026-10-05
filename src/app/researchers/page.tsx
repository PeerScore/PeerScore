import Link from "next/link";
import type { Metadata } from "next";
import { parseResearcherListParams } from "@/lib/query";
import { availableLetters, listFields, listResearchers } from "@/lib/repositories";
import type { ResearcherListParams, ResearcherSort } from "@/lib/types";
import { formatDate, formatNumber } from "@/lib/format";
import { buildQuery } from "@/lib/url";
import { AutoSubmitForm } from "@/components/auto-submit-form";
import { Card, Chip, ScoreBar, SegmentedTabs, Table, Td, Th, Tr, cx } from "@/components/ui";
import { ChevronLeftIcon, ChevronRightIcon } from "@/components/ui/icons";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Index of researchers" };

const PAGE_SIZE = 50;
const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

type SearchParams = Record<string, string | string[] | undefined>;

export default async function ResearchersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const raw = await searchParams;
  const parsed = parseResearcherListParams(raw);

  // UI conventions on top of the shared parser: a 0 minimum score means "no
  // minimum", and ticking both status boxes means "no status filter".
  const statusValues = Array.isArray(raw.status) ? raw.status : raw.status ? [raw.status] : [];
  const params: ResearcherListParams = {
    ...parsed,
    minScore: parsed.minScore && parsed.minScore > 0 ? parsed.minScore : undefined,
    status: statusValues.length === 1 ? parsed.status : undefined,
    pageSize: parsed.pageSize ?? PAGE_SIZE,
  };
  const sort: ResearcherSort = params.sort ?? "score";

  const [result, fields, letters] = await Promise.all([listResearchers(params), listFields(), availableLetters()]);
  const { items, total, page, pageSize, pageCount } = result;
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);

  // Base query for links (keeps every active filter).
  const base = {
    q: params.q,
    field: params.field,
    minScore: params.minScore,
    status: statusValues.length === 1 ? statusValues[0] : undefined,
    letter: params.letter,
    sort: params.sort,
  };
  const apiQuery = buildQuery({ ...base, page: page > 1 ? page : undefined, pageSize: params.pageSize !== PAGE_SIZE ? params.pageSize : undefined });

  const published = statusValues.includes("published");
  const pending = statusValues.includes("pending");

  return (
    <div className="site-container py-8 sm:py-10">
      <div className="flex flex-col gap-8 lg:flex-row lg:gap-10">
        {/* Filter rail */}
        <aside className="w-full shrink-0 lg:w-[220px]">
          <AutoSubmitForm action="/researchers" className="flex flex-col gap-7">
            {params.q && <input type="hidden" name="q" value={params.q} />}
            {params.sort && <input type="hidden" name="sort" value={params.sort} />}
            {params.letter && <input type="hidden" name="letter" value={params.letter} />}

            <fieldset>
              <legend className="mb-2 font-mono text-[10.5px] font-medium uppercase tracking-[0.08em] text-muted">Field</legend>
              <ul className="flex flex-col gap-0.5 text-[13.5px]">
                <li>
                  <Link
                    href={buildQuery(base, { field: undefined, page: undefined })}
                    className={cx(
                      "flex items-center justify-between rounded-[10px] px-3 py-1.5",
                      !params.field ? "border border-border bg-surface font-medium text-ink shadow-card" : "text-text hover:bg-surface",
                    )}
                  >
                    All fields
                    <span className="font-mono text-[11.5px] text-muted">{formatNumber(fields.reduce((a, f) => a + f.researcherCount, 0))}</span>
                  </Link>
                </li>
                {fields.map((f) => {
                  const active = params.field === f.slug;
                  return (
                    <li key={f.id}>
                      <Link
                        href={buildQuery(base, { field: active ? undefined : f.slug, page: undefined })}
                        aria-current={active ? "true" : undefined}
                        className={cx(
                          "flex items-center justify-between gap-2 rounded-[10px] px-3 py-1.5",
                          active ? "border border-border bg-surface font-medium text-ink shadow-card" : "text-text hover:bg-surface",
                        )}
                      >
                        <span className="truncate">{f.name}</span>
                        <span className="font-mono text-[11.5px] text-muted">{f.researcherCount}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
              {params.field && <input type="hidden" name="field" value={params.field} />}
            </fieldset>

            <fieldset>
              <legend className="mb-2 font-mono text-[10.5px] font-medium uppercase tracking-[0.08em] text-muted">Status</legend>
              <div className="flex flex-col gap-1 text-[13.5px] text-text">
                <label className="flex min-h-9 cursor-pointer items-center gap-2.5 px-1">
                  <input type="checkbox" name="status" value="published" defaultChecked={published} className="h-4 w-4 accent-[var(--c-link)]" />
                  Published
                </label>
                <label className="flex min-h-9 cursor-pointer items-center gap-2.5 px-1">
                  <input type="checkbox" name="status" value="pending" defaultChecked={pending} className="h-4 w-4 accent-[var(--c-link)]" />
                  In queue
                </label>
                <label className="flex min-h-9 items-center gap-2.5 px-1 text-muted">
                  <input type="checkbox" disabled className="h-4 w-4" />
                  Disputed
                  <span className="font-mono text-[10.5px] uppercase">soon</span>
                </label>
              </div>
            </fieldset>

            <fieldset>
              <legend className="mb-2 font-mono text-[10.5px] font-medium uppercase tracking-[0.08em] text-muted">Minimum score</legend>
              <label className="block px-1 text-[13.5px] text-text">
                <span className="flex items-center justify-between">
                  <span>At least</span>
                  <output className="font-mono text-[12px] text-muted">{params.minScore ?? "any"}</output>
                </span>
                <input
                  type="range"
                  name="minScore"
                  min={0}
                  max={100}
                  step={5}
                  defaultValue={params.minScore ?? 0}
                  className="mt-2 h-11 w-full accent-[var(--c-link)]"
                  aria-label="Minimum score"
                />
              </label>
            </fieldset>

            <button type="submit" className="inline-flex h-11 items-center justify-center rounded-button border border-border bg-surface px-4 text-[14px] font-medium text-ink hover:bg-page">
              Apply filters
            </button>
          </AutoSubmitForm>
        </aside>

        {/* Main */}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <SegmentedTabs
              ariaLabel="Index views"
              items={[
                { label: "Index", href: "/researchers", active: sort !== "recent" },
                { label: "Recent changes", href: "/researchers?sort=recent", active: sort === "recent" },
                { label: "Queue", href: "/queue" },
                { label: "Statistics", href: "/#stats" },
              ]}
            />
            <div className="flex items-center gap-1.5 text-[13px] text-muted">
              <span>Export</span>
              <a href={`/researchers/export${apiQuery}`} className="font-medium text-link hover:underline">
                CSV
              </a>
              <span>·</span>
              <a href={`/api/researchers${apiQuery}`} className="font-medium text-link hover:underline">
                JSON
              </a>
              <span>·</span>
              <Link href="/api/researchers" className="font-medium text-link hover:underline">
                API
              </Link>
            </div>
          </div>

          <h1 className="mt-6 font-serif text-[32px] font-medium leading-tight text-ink sm:text-[40px]">Index of researchers</h1>
          <p className="mt-2 max-w-[640px] text-[15px] text-muted">
            {params.q ? (
              <>
                Results for <span className="font-medium text-ink">“{params.q}”</span> ·{" "}
              </>
            ) : null}
            Every researcher in PeerScore, published or waiting in the queue. Scores are weighted consensus values from several
            language models.
          </p>

          {/* A–Z */}
          <nav aria-label="Browse by letter" className="mt-6 overflow-x-auto rounded-full border border-border bg-surface p-1.5 shadow-card">
            <ul className="flex min-w-max items-center gap-0.5">
              <li>
                <Link
                  href={buildQuery(base, { letter: undefined, page: undefined })}
                  className={cx(
                    "flex h-8 items-center justify-center rounded-[8px] px-2.5 font-mono text-[12.5px] font-medium",
                    !params.letter ? "bg-cta text-cta-text" : "text-muted hover:text-ink",
                  )}
                >
                  All
                </Link>
              </li>
              {LETTERS.map((l) => {
                const enabled = letters.includes(l);
                const active = params.letter?.toUpperCase() === l;
                if (!enabled)
                  return (
                    <li key={l}>
                      <span className="flex h-8 w-7 items-center justify-center font-mono text-[12.5px] text-muted/40" aria-disabled="true">
                        {l}
                      </span>
                    </li>
                  );
                return (
                  <li key={l}>
                    <Link
                      href={buildQuery(base, { letter: active ? undefined : l, page: undefined })}
                      aria-current={active ? "true" : undefined}
                      className={cx(
                        "flex h-8 w-7 items-center justify-center rounded-[8px] font-mono text-[12.5px] font-medium",
                        active ? "bg-cta text-cta-text" : "text-ink hover:bg-page",
                      )}
                    >
                      {l}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>

          {/* Results */}
          <Card className="mt-5" padded={false}>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3 text-[13px] text-muted sm:px-6">
              <span>
                Showing <span className="font-mono text-ink">{from}–{to}</span> of <span className="font-mono text-ink">{formatNumber(total)}</span>
              </span>
              <span className="flex flex-wrap items-center gap-1">
                <span className="mr-1">Sort:</span>
                {(
                  [
                    ["name", "Name"],
                    ["score", "Score"],
                    ["recent", "Last analysis"],
                  ] as const
                ).map(([key, label], i) => (
                  <span key={key} className="flex items-center gap-1">
                    {i > 0 && <span aria-hidden="true">·</span>}
                    <Link
                      href={buildQuery(base, { sort: key === "score" ? undefined : key, page: undefined })}
                      aria-current={sort === key ? "true" : undefined}
                      className={cx("rounded-md px-1.5 py-1", sort === key ? "font-semibold text-ink" : "hover:text-ink")}
                    >
                      {label}
                    </Link>
                  </span>
                ))}
              </span>
            </div>

            {items.length === 0 ? (
              <p className="px-5 py-12 text-center text-[14px] text-muted sm:px-6">
                No researcher matches these filters.{" "}
                <Link href="/submit" className="font-medium text-link hover:underline">
                  Submit one
                </Link>
                .
              </p>
            ) : (
              <div className="px-5 sm:px-6">
                <Table minWidth={720}>
                  <thead>
                    <tr>
                      <Th>Researcher</Th>
                      <Th>Field</Th>
                      <Th align="right">Pubs.</Th>
                      <Th>Score</Th>
                      <Th align="right">Analyzed</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((r) => {
                      const isPublished = r.status === "published" && r.score != null;
                      return (
                        <Tr key={r.id} muted={!isPublished}>
                          <Td>
                            <Link href={`/researchers/${r.slug}`} className="font-semibold text-ink hover:underline">
                              {r.name}
                            </Link>
                            {r.affiliation && <div className="text-[12.5px] text-muted">{r.affiliation}</div>}
                          </Td>
                          <Td>
                            <Chip href={`/researchers?field=${r.field.slug}`}>{r.field.name}</Chip>
                          </Td>
                          <Td align="right" mono>
                            {r.publicationCount}
                          </Td>
                          <Td className="w-[220px]">
                            {isPublished ? (
                              <div className="flex items-center gap-3">
                                <span className="w-7 font-mono text-[13.5px] font-semibold tabular text-ink">{r.score}</span>
                                <ScoreBar score={r.score as number} width="200px" className="max-w-full" />
                              </div>
                            ) : (
                              <span className="inline-flex items-center gap-2 text-[12.5px] text-muted">
                                <span className="h-2 w-2 rounded-full bg-mid" aria-hidden="true" />
                                {r.status === "analyzing" ? "analyzing" : "in queue · 24–48 h"}
                              </span>
                            )}
                          </Td>
                          <Td align="right" mono className="whitespace-nowrap text-muted">
                            {isPublished ? formatDate(r.publishedAt) : "—"}
                          </Td>
                        </Tr>
                      );
                    })}
                  </tbody>
                </Table>
              </div>
            )}

            {/* Pagination */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-3 text-[13px] sm:px-6">
              <nav className="flex flex-wrap items-center gap-1" aria-label="Pagination">
                <PageLink href={buildQuery(base, { page: page - 1 })} disabled={page <= 1}>
                  <ChevronLeftIcon /> Previous
                </PageLink>
                {pageNumbers(page, pageCount).map((p, i) =>
                  p === "…" ? (
                    <span key={`e${i}`} className="px-1.5 text-muted">
                      …
                    </span>
                  ) : (
                    <Link
                      key={p}
                      href={buildQuery(base, { page: p === 1 ? undefined : p })}
                      aria-current={p === page ? "page" : undefined}
                      className={cx(
                        "inline-flex h-9 min-w-9 items-center justify-center rounded-[8px] px-2 font-mono text-[12.5px]",
                        p === page ? "bg-cta text-cta-text" : "text-ink hover:bg-page",
                      )}
                    >
                      {p}
                    </Link>
                  ),
                )}
                <PageLink href={buildQuery(base, { page: page + 1 })} disabled={page >= pageCount}>
                  Next <ChevronRightIcon />
                </PageLink>
              </nav>
              <span className="font-mono text-[12px] text-muted">{pageSize} per page</span>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function PageLink({ href, disabled, children }: { href: string; disabled: boolean; children: React.ReactNode }) {
  const cls = "inline-flex h-9 items-center gap-1 rounded-[8px] px-2.5 text-[13px] font-medium";
  if (disabled) {
    return (
      <span className={cx(cls, "text-muted/50")} aria-disabled="true">
        {children}
      </span>
    );
  }
  return (
    <Link href={href || "?"} className={cx(cls, "text-ink hover:bg-page")}>
      {children}
    </Link>
  );
}

function pageNumbers(page: number, count: number): Array<number | "…"> {
  if (count <= 7) return Array.from({ length: count }, (_, i) => i + 1);
  const pages = new Set<number>([1, 2, count - 1, count, page - 1, page, page + 1].filter((p) => p >= 1 && p <= count));
  const sorted = [...pages].sort((a, b) => a - b);
  const out: Array<number | "…"> = [];
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i] - sorted[i - 1] > 1) out.push("…");
    out.push(sorted[i]);
  }
  return out;
}
