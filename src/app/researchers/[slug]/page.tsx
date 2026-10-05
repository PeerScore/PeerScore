import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getResearcherBySlug, listRuns } from "@/lib/repositories";
import { CRITERIA } from "@/lib/scoring";
import type { AnalysisRunSummary, Criterion, ResearcherArticle } from "@/lib/types";
import { activeRange, capitalize, excerpt, formatDate, formatDuration, modelLabel, shortId } from "@/lib/format";
import { Markdown, inline } from "@/components/markdown";
import { BTN_DARK, BTN_OUTLINE, Card, Chip, ContentsRail, Notice, ScoreBar, ScorePill, ScoreRing, SegmentedTabs, Table, Td, Th, Tr, cx, type RailItem } from "@/components/ui";
import { CheckIcon, DownloadIcon, RefreshIcon } from "@/components/ui/icons";

export const dynamic = "force-dynamic";

type Params = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const r = await getResearcherBySlug(slug);
  if (!r) return { title: "Researcher not found" };
  return {
    title: r.name,
    description: r.run?.summary ? excerpt(r.run.summary, 160) : `${r.name} on PeerScore, the open researcher index.`,
  };
}

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export default async function ResearcherPage({ params }: { params: Params }) {
  const { slug } = await params;
  const r = await getResearcherBySlug(slug);
  if (!r) notFound();

  const run = r.run && r.run.status === "COMPLETED" ? r.run : null;
  const runs = await listRuns(r.id);
  const previousRuns = Math.max(0, runs.filter((x) => x.status === "COMPLETED").length - (run ? 1 : 0));
  const sectionItems: RailItem[] = (run?.sections ?? []).map((s) => ({ label: s.title, href: `#section-${slugify(s.title)}`, sub: true }));
  const contents: RailItem[] = [
    { label: "Overview", href: "#overview", active: true },
    { label: "Score breakdown", href: "#score-breakdown" },
    { label: "Analysis", href: "#analysis" },
    ...sectionItems,
    { label: "Publications", href: "#publications" },
    { label: "Provenance", href: "#provenance" },
    { label: "References", href: "#references" },
  ];
  const tools: RailItem[] = [
    { label: "Cite this page", href: "#references" },
    { label: "Download JSON", href: `/api/researchers/${r.slug}` },
    { label: "Request re-analysis", href: "/submit" },
    { label: "Report an error", href: "#" },
  ];

  return (
    <div className="site-container py-6 sm:py-8">
      {/* Tabs + status */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SegmentedTabs
          ariaLabel="Page views"
          items={[
            { label: "Article", href: `/researchers/${r.slug}`, active: true },
            { label: "Discussion", href: "#" },
            { label: "History", href: "#" },
            {
              label: (
                <>
                  Runs <span className="ml-1 font-mono text-[11px] text-muted">{runs.length}</span>
                </>
              ),
              href: "#provenance",
            },
          ]}
        />
        <p className="flex items-center gap-2 text-[13px] text-muted">
          {run ? (
            <>
              <span className="h-2 w-2 rounded-full bg-high" aria-hidden="true" />
              Published · run <span className="font-mono">#{shortId(run.id)}</span> · <span className="font-mono">{formatDate(run.finishedAt)}</span>
            </>
          ) : (
            <>
              <span className="h-2 w-2 rounded-full bg-mid" aria-hidden="true" />
              {r.status === "analyzing" ? "Analysis in progress" : "Queued · not analyzed yet"}
            </>
          )}
        </p>
      </div>

      <div className="mt-6 flex flex-col gap-8 lg:flex-row lg:gap-10">
        {/* Contents rail */}
        <aside className="w-full shrink-0 lg:sticky lg:top-6 lg:w-[220px] lg:self-start">
          <ContentsRail items={contents} tools={tools} />
        </aside>

        {/* Article */}
        <article className="min-w-0 flex-1" id="overview">
          <div className="flex flex-wrap items-center gap-2">
            <Chip href={`/researchers?field=${r.field.slug}`}>{r.field.name}</Chip>
            {r.topics.map((t) => (
              <Chip key={t} muted>
                {t}
              </Chip>
            ))}
          </div>
          <h1 className="mt-4 font-serif text-[34px] font-medium leading-[1.08] text-ink sm:text-[44px]">{r.name}</h1>
          <p className="mt-2 text-[13.5px] text-muted">
            From PeerScore, the open researcher index{r.affiliation ? ` · ${r.affiliation}` : ""}
            {r.country ? `, ${r.country}` : ""}
          </p>

          {run ? (
            <>
              <div className="mt-6">
                <Markdown text={run.summary} className="text-[17px]" />
              </div>

              <Notice className="mt-6">
                This article was written by language models from publication metadata and abstracts. It can contain errors
                and is not a peer review. Scores reflect the models&apos; reading, not the opinion of any institution.
              </Notice>

              <ScoreBreakdown r={r} run={run} />

              {/* Analysis */}
              <section id="analysis" className="mt-10 scroll-mt-6">
                <h2 className="font-serif text-[28px] font-medium text-ink">Analysis</h2>
                <div className="mt-4 flex flex-col gap-8">
                  {run.sections.map((s) => (
                    <section key={s.title} id={`section-${slugify(s.title)}`} className="scroll-mt-6">
                      <h3 className="mb-2 font-serif text-[21px] font-medium text-ink">{s.title}</h3>
                      <Markdown text={s.body} />
                    </section>
                  ))}
                </div>
                {run.disagreement && (
                  <aside className="mt-8 border-l-[3px] border-mid bg-surface py-3 pl-5 pr-4 rounded-r-[12px]">
                    <h3 className="mb-1.5 font-serif text-[19px] font-medium text-ink">Where the models disagree</h3>
                    <p className="text-[12.5px] text-muted">
                      Spread <span className="font-mono text-ink">{run.spread ?? "—"}</span> points between the highest and lowest model.
                    </p>
                    <div className="mt-2">
                      <Markdown text={run.disagreement} className="text-[15.5px]" />
                    </div>
                  </aside>
                )}
              </section>

              <Publications r={r} />
              <Provenance r={r} run={run} previousRuns={previousRuns} />
              <References r={r} run={run} />
            </>
          ) : (
            <>
              <QueuedState r={r} />
              {r.publications.length > 0 && <Publications r={r} />}
            </>
          )}

          {/* Categories */}
          <div className="mt-10 flex flex-wrap items-center gap-2 border-t border-border pt-5 text-[13px] text-muted">
            <span className="mr-1 font-mono text-[10.5px] uppercase tracking-[0.08em]">Categories</span>
            <Chip href={`/researchers?field=${r.field.slug}`}>{r.field.name}</Chip>
            {r.country && <Chip muted>{r.country}</Chip>}
            {r.topics.map((t) => (
              <Chip key={t} muted>
                {t}
              </Chip>
            ))}
            <Chip muted>{run ? "Published" : "In queue"}</Chip>
          </div>
        </article>

        {/* Infobox */}
        <aside className="w-full shrink-0 lg:w-[300px]">
          <Infobox r={r} run={run} />
        </aside>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function Infobox({ r, run }: { r: ResearcherArticle; run: AnalysisRunSummary | null }) {
  const rows: Array<[string, React.ReactNode]> = [
    ["Field", <Link key="f" href={`/researchers?field=${r.field.slug}`} className="text-link hover:underline">{r.field.name}</Link>],
    ["Affiliation", r.affiliation ?? "—"],
    ["Country", r.country ?? "—"],
    [
      "ORCID",
      r.orcid ? (
        <a key="o" href={`https://orcid.org/${r.orcid}`} className="font-mono text-[12.5px] text-link hover:underline" rel="noreferrer">
          {r.orcid}
        </a>
      ) : (
        "—"
      ),
    ],
    ["Active", <span key="a" className="font-mono text-[12.5px]">{activeRange(r.activeFrom, r.activeTo)}</span>],
    ["Publications", <span key="p" className="font-mono text-[12.5px]">{r.publicationCount}</span>],
    ["Open code", <span key="c" className="font-mono text-[12.5px]">{r.openCodeCount} / {r.publicationCount}</span>],
    ["Topics", r.topics.length ? r.topics.join(", ") : "—"],
    ["Last run", <span key="l" className="font-mono text-[12.5px]">{run ? formatDate(run.finishedAt) : "—"}</span>],
  ];
  return (
    <div className="overflow-hidden rounded-card border border-border shadow-card">
      <div className="flex flex-col items-center bg-infobox px-5 py-6 text-center text-[#F4F5F7]">
        <div className="font-mono text-[10.5px] font-medium uppercase tracking-[0.14em] text-[#8B919C]">PeerScore</div>
        {run && run.score != null ? (
          <>
            <ScoreRing score={run.score} size={150} stroke="#2DD4A8" track="var(--c-ring-track)" strokeWidth={10} className="mt-4" label="/ 100" />
            <p className="mt-4 font-mono text-[12px] text-[#8B919C]">
              spread {run.spread ?? "—"} · field median {run.fieldMedian ?? "—"} · {run.modelScores.length} models
            </p>
          </>
        ) : (
          <>
            <div className="mt-4 flex h-[150px] w-[150px] items-center justify-center rounded-full border-[10px] border-[#2a2e36] font-mono text-[14px] text-[#8B919C]">
              {r.status === "analyzing" ? "analyzing" : "queued"}
            </div>
            <p className="mt-4 font-mono text-[12px] text-[#8B919C]">score available within 24–48 h</p>
          </>
        )}
      </div>
      <div className="bg-surface p-5">
        <dl className="divide-y divide-hairline text-[13.5px]">
          {rows.map(([k, v]) => (
            <div key={k} className="flex gap-3 py-2">
              <dt className="w-[96px] shrink-0 text-muted">{k}</dt>
              <dd className="min-w-0 flex-1 break-words text-ink">{v}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-4 flex flex-col gap-2">
          <Link href="/submit" className={BTN_DARK}>
            <RefreshIcon /> Request re-analysis
          </Link>
          <a href={`/api/researchers/${r.slug}`} className={BTN_OUTLINE}>
            <DownloadIcon /> Download JSON
          </a>
        </div>
      </div>
    </div>
  );
}

function ScoreBreakdown({ r, run }: { r: ResearcherArticle; run: AnalysisRunSummary }) {
  const models = run.modelScores;
  const weights = r.field.weights;
  const totalW = CRITERIA.reduce((a, c) => a + (Number(weights[c]) || 0), 0) || 1;

  const consensusFor = (c: Criterion) => (models.length ? Math.round(models.reduce((a, m) => a + m[c], 0) / models.length) : null);
  const lowestModel = models.length > 1 ? models.reduce((lo, m) => (m.weighted < lo.weighted ? m : lo), models[0]).model : null;

  return (
    <Card id="score-breakdown" className="mt-8 scroll-mt-6" padded>
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-serif text-[24px] font-medium text-ink">Score breakdown</h2>
        <p className="text-[12.5px] text-muted">Weights are set per field · lowest model per row highlighted</p>
      </div>
      <Table minWidth={560}>
        <thead>
          <tr>
            <Th>Criterion</Th>
            <Th className="w-[240px]">Consensus</Th>
            {models.map((m, i) => (
              <Th key={m.model} align="center" className={cx(m.model === lowestModel && "text-mid")}>
                <abbr title={m.model} className="no-underline">
                  {modelLabel(m.model, i)}
                </abbr>
              </Th>
            ))}
          </tr>
        </thead>
        <tbody>
          {CRITERIA.map((c) => {
            const cons = consensusFor(c);
            const values = models.map((m) => m[c]);
            const min = values.length > 1 ? Math.min(...values) : null;
            return (
              <Tr key={c}>
                <Td>
                  <span className="font-medium text-ink">{capitalize(c)}</span>{" "}
                  <span className="font-mono text-[11.5px] text-muted">×{(Number(weights[c]) / totalW).toFixed(2)}</span>
                </Td>
                <Td>
                  {cons != null && (
                    <div className="flex items-center gap-3">
                      <ScoreBar score={cons} className="w-[140px] max-w-full" />
                      <span className="font-mono text-[13.5px] font-semibold tabular text-ink">{cons}</span>
                    </div>
                  )}
                </Td>
                {models.map((m) => {
                  const isLow = min != null && m[c] === min && values.some((v) => v !== min);
                  return (
                    <Td key={m.model} align="center" mono className={cx(isLow && "font-semibold text-mid")}>
                      <span className={cx(isLow && "rounded-md bg-mid-bg px-1.5 py-0.5")}>{m[c]}</span>
                    </Td>
                  );
                })}
              </Tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t border-border">
            <Td className="pt-4">
              <span className="font-semibold text-ink">PeerScore</span>{" "}
              <span className="text-[12px] text-muted">(weighted)</span>
            </Td>
            <Td className="pt-4">
              <span className="font-mono text-[28px] font-semibold leading-none tabular text-high">{run.score ?? "—"}</span>
            </Td>
            {models.map((m) => (
              <Td key={m.model} align="center" mono className={cx("pt-4 font-semibold", m.model === lowestModel ? "text-mid" : "text-ink")}>
                {m.weighted}
              </Td>
            ))}
          </tr>
        </tfoot>
      </Table>
    </Card>
  );
}

function Publications({ r }: { r: ResearcherArticle }) {
  const pubs = [...r.publications].sort((a, b) => b.year - a.year);
  return (
    <Card id="publications" className="mt-10 scroll-mt-6">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-serif text-[24px] font-medium text-ink">Publications analyzed</h2>
        <p className="text-[12.5px] text-muted">
          {pubs.length} papers · {r.openCodeCount} with public code
        </p>
      </div>
      {pubs.length === 0 ? (
        <p className="text-[14px] text-muted">No publications collected yet.</p>
      ) : (
        <Table minWidth={480}>
          <thead>
            <tr>
              <Th>Year</Th>
              <Th>Title</Th>
              <Th>Venue</Th>
              <Th align="center">Code</Th>
              <Th align="right">Score</Th>
            </tr>
          </thead>
          <tbody>
            {pubs.map((p) => (
              <Tr key={p.id}>
                <Td mono className="text-muted">
                  {p.year}
                </Td>
                <Td>
                  {p.url || p.doi ? (
                    <a href={p.url ?? `https://doi.org/${p.doi}`} className="font-medium text-ink hover:underline" rel="noreferrer">
                      {p.title}
                    </a>
                  ) : (
                    <span className="font-medium text-ink">{p.title}</span>
                  )}
                </Td>
                <Td className="text-[13px] text-muted">{p.venue ?? "—"}</Td>
                <Td align="center">
                  {p.hasCode ? (
                    <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-high-bg text-high" title="Public code">
                      <CheckIcon size={13} />
                      <span className="sr-only">Public code</span>
                    </span>
                  ) : (
                    <span className="text-muted/50">—</span>
                  )}
                </Td>
                <Td align="right">{p.score != null ? <ScorePill score={p.score} /> : <span className="text-muted">—</span>}</Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      )}
    </Card>
  );
}

function Provenance({ r, run, previousRuns }: { r: ResearcherArticle; run: AnalysisRunSummary; previousRuns: number }) {
  const tiles: Array<{ label: string; value: React.ReactNode; hint?: string }> = [
    {
      label: "Prompt",
      value: (
        <>
          {run.promptKey} · v{run.promptVersion}
        </>
      ),
      hint: `sha ${shortId(run.promptSha, 12)}`,
    },
    { label: "Models", value: run.modelScores.map((m) => m.model).join(", ") || "—", hint: `${run.modelScores.length} independent readings` },
    { label: "Run", value: `#${shortId(run.id)}`, hint: `duration ${formatDuration(run.durationSec)}` },
    { label: "Sources", value: "[Open scholarly sources]", hint: r.openalexId ? `OpenAlex ${r.openalexId}` : "OpenAlex" },
    { label: "Submitted", value: formatDate(r.createdAt), hint: `published ${formatDate(run.finishedAt)}` },
    { label: "Previous runs", value: String(previousRuns), hint: previousRuns === 0 ? "this is the first analysis" : "earlier analyses are kept" },
  ];
  return (
    <section id="provenance" className="mt-10 scroll-mt-6">
      <h2 className="font-serif text-[28px] font-medium text-ink">Provenance</h2>
      <div className="mt-4 grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(170px,1fr))]">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-[12px] border border-border bg-surface px-4 py-3 shadow-card">
            <div className="font-mono text-[10.5px] font-medium uppercase tracking-[0.08em] text-muted">{t.label}</div>
            <div className="mt-1 break-words font-mono text-[13px] font-medium text-ink">{t.value}</div>
            {t.hint && <div className="mt-0.5 break-words text-[12px] text-muted">{t.hint}</div>}
          </div>
        ))}
      </div>
    </section>
  );
}

function References({ r, run }: { r: ResearcherArticle; run: AnalysisRunSummary }) {
  const pubs = [...r.publications].sort((a, b) => b.year - a.year);
  return (
    <section id="references" className="mt-10 scroll-mt-6">
      <h2 className="font-serif text-[28px] font-medium text-ink">References</h2>
      <ol className="mt-4 list-decimal space-y-2 pl-6 text-[14px] text-text marker:font-mono marker:text-[12px] marker:text-muted">
        {pubs.map((p) => (
          <li key={p.id}>
            {r.name} ({p.year}). <em>{inline(p.title)}</em>
            {p.venue ? `. ${p.venue}` : ""}
            {p.doi ? (
              <>
                . <a href={`https://doi.org/${p.doi}`} className="font-mono text-[12.5px] text-link hover:underline" rel="noreferrer">doi:{p.doi}</a>
              </>
            ) : null}
          </li>
        ))}
        <li>
          PeerScore ({formatDate(run.finishedAt).slice(-4)}). Analysis of {r.name}, run #{shortId(run.id)}, prompt {run.promptKey} v{run.promptVersion}.{" "}
          <a href={`/api/researchers/${r.slug}`} className="font-mono text-[12.5px] text-link hover:underline">
            /api/researchers/{r.slug}
          </a>
        </li>
      </ol>
    </section>
  );
}

function QueuedState({ r }: { r: ResearcherArticle }) {
  const analyzing = r.status === "analyzing";
  return (
    <Card className="mt-6">
      <div className="flex items-start gap-4">
        <span className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-mid-bg text-mid">
          <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-mid" aria-hidden="true" />
        </span>
        <div>
          <h2 className="font-serif text-[24px] font-medium text-ink">{analyzing ? "Analysis in progress" : "Waiting in the queue"}</h2>
          <p className="mt-2 text-[15px] leading-relaxed text-text">
            {r.name} is indexed but has not been analyzed yet. {analyzing ? "The models are reading the publications now." : "A worker will collect the publications and run the field-specific analysis."}{" "}
            The article usually goes live within 24–48 hours of submission.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href="/queue" className={BTN_OUTLINE}>
              Follow the queue
            </Link>
            <Link href="/researchers" className={BTN_OUTLINE}>
              Browse the index
            </Link>
          </div>
        </div>
      </div>
    </Card>
  );
}
