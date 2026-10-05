import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { useTranslations, useFormatter } from "next-intl";
import { Link } from "@/i18n/navigation";
import { getResearcherBySlug, listRuns } from "@/lib/repositories";
import { CRITERIA } from "@/lib/scoring";
import type { AnalysisRunSummary, Criterion, ResearcherArticle } from "@/lib/types";
import { excerpt, modelLabel, shortId } from "@/lib/format";
import { Markdown, inline } from "@/components/markdown";
import { BTN_DARK, BTN_OUTLINE, Card, Chip, ContentsRail, Notice, ScoreBar, ScorePill, ScoreRing, SegmentedTabs, Table, Td, Th, Tr, cx, type RailItem } from "@/components/ui";
import { CheckIcon, DownloadIcon, RefreshIcon } from "@/components/ui/icons";

export const dynamic = "force-dynamic";

type Params = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const [r, t] = await Promise.all([getResearcherBySlug(slug), getTranslations("article")]);
  if (!r) return { title: t("notFoundTitle") };
  return {
    title: r.name,
    description: r.run?.summary ? excerpt(r.run.summary, 160) : t("metaDescription", { name: r.name }),
  };
}

type Formatter = ReturnType<typeof useFormatter>;
const fmtDate = (fmt: Formatter, iso: string | null | undefined) => (iso ? fmt.dateTime(new Date(iso), "date") : "—");

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export default async function ResearcherPage({ params }: { params: Params }) {
  const { slug } = await params;
  const r = await getResearcherBySlug(slug);
  if (!r) notFound();

  const run = r.run && r.run.status === "COMPLETED" ? r.run : null;
  const [runs, t, fmt] = await Promise.all([listRuns(r.id), getTranslations("article"), getFormatter()]);
  const previousRuns = Math.max(0, runs.filter((x) => x.status === "COMPLETED").length - (run ? 1 : 0));
  const sectionItems: RailItem[] = (run?.sections ?? []).map((s) => ({ label: s.title, href: `#section-${slugify(s.title)}`, sub: true }));
  const contents: RailItem[] = [
    { label: t("overview"), href: "#overview", active: true },
    { label: t("scoreBreakdown"), href: "#score-breakdown" },
    { label: t("analysis"), href: "#analysis" },
    ...sectionItems,
    { label: t("publications"), href: "#publications" },
    { label: t("provenance"), href: "#provenance" },
    { label: t("references"), href: "#references" },
  ];
  const tools: RailItem[] = [
    { label: t("cite"), href: "#references" },
    { label: t("downloadJson"), href: `/api/researchers/${r.slug}`, external: true },
    { label: t("requestReanalysis"), href: "/submit" },
    { label: t("reportError"), href: "#" },
  ];

  return (
    <div className="site-container py-6 sm:py-8">
      {/* Tabs + status */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SegmentedTabs
          ariaLabel={t("pageViews")}
          items={[
            { label: t("tabArticle"), href: `/researchers/${r.slug}`, active: true },
            { label: t("tabDiscussion"), href: "#" },
            { label: t("tabHistory"), href: "#" },
            {
              label: (
                <>
                  {t("tabRuns")} <span className="ms-1 font-mono text-[11px] text-muted">{runs.length}</span>
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
              {t("publishedRun")} <span className="font-mono">#{shortId(run.id)}</span> · <span className="font-mono">{fmtDate(fmt, run.finishedAt)}</span>
            </>
          ) : (
            <>
              <span className="h-2 w-2 rounded-full bg-mid" aria-hidden="true" />
              {r.status === "analyzing" ? t("analysisInProgress") : t("queuedNotAnalyzed")}
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
            {t("from")}{r.affiliation ? ` · ${r.affiliation}` : ""}
            {r.country ? `, ${r.country}` : ""}
          </p>

          {run ? (
            <>
              <div className="mt-6">
                <Markdown text={run.summary} className="text-[17px]" />
              </div>

              <Notice className="mt-6">{t("notice")}</Notice>

              <ScoreBreakdown r={r} run={run} />

              {/* Analysis */}
              <section id="analysis" className="mt-10 scroll-mt-6">
                <h2 className="font-serif text-[28px] font-medium text-ink">{t("analysis")}</h2>
                <div className="mt-4 flex flex-col gap-8">
                  {run.sections.map((s) => (
                    <section key={s.title} id={`section-${slugify(s.title)}`} className="scroll-mt-6">
                      <h3 className="mb-2 font-serif text-[21px] font-medium text-ink">{s.title}</h3>
                      <Markdown text={s.body} />
                    </section>
                  ))}
                </div>
                {run.disagreement && (
                  <aside className="mt-8 border-s-[3px] border-mid bg-surface py-3 ps-5 pe-4 rounded-e-[12px]">
                    <h3 className="mb-1.5 font-serif text-[19px] font-medium text-ink">{t("disagreeTitle")}</h3>
                    <p className="text-[12.5px] text-muted">
                      {t.rich("spreadPoints", { spread: run.spread ?? "—", n: (chunks) => <span className="font-mono text-ink">{chunks}</span> })}
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
            <span className="me-1 font-mono text-[10.5px] uppercase tracking-[0.08em]">{t("categories")}</span>
            <Chip href={`/researchers?field=${r.field.slug}`}>{r.field.name}</Chip>
            {r.country && <Chip muted>{r.country}</Chip>}
            {r.topics.map((t) => (
              <Chip key={t} muted>
                {t}
              </Chip>
            ))}
            <Chip muted>{run ? t("published") : t("inQueue")}</Chip>
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
  const t = useTranslations("article");
  const c = useTranslations("common");
  const fmt = useFormatter();
  const activeRange =
    r.activeFrom == null && r.activeTo == null ? "—" : `${r.activeFrom ?? "…"} – ${r.activeTo ?? c("present")}`;
  const rows: Array<[string, React.ReactNode]> = [
    [t("infoField"), <Link key="f" href={`/researchers?field=${r.field.slug}`} className="text-link hover:underline">{r.field.name}</Link>],
    [t("infoAffiliation"), r.affiliation ?? "—"],
    [t("infoCountry"), r.country ?? "—"],
    [
      t("infoOrcid"),
      r.orcid ? (
        <a key="o" href={`https://orcid.org/${r.orcid}`} className="font-mono text-[12.5px] text-link hover:underline" rel="noreferrer">
          {r.orcid}
        </a>
      ) : (
        "—"
      ),
    ],
    [t("infoActive"), <span key="a" className="font-mono text-[12.5px]">{activeRange}</span>],
    [t("infoPublications"), <span key="p" className="font-mono text-[12.5px]">{r.publicationCount}</span>],
    [t("infoOpenCode"), <span key="c" className="font-mono text-[12.5px]">{r.openCodeCount} / {r.publicationCount}</span>],
    [t("infoTopics"), r.topics.length ? fmt.list(r.topics) : "—"],
    [t("infoLastRun"), <span key="l" className="font-mono text-[12.5px]">{run ? fmtDate(fmt, run.finishedAt) : "—"}</span>],
  ];
  return (
    <div className="overflow-hidden rounded-card border border-border shadow-card">
      <div className="flex flex-col items-center bg-infobox px-5 py-6 text-center text-[#F4F5F7]">
        <div className="font-mono text-[10.5px] font-medium uppercase tracking-[0.14em] text-[#8B919C]">{c("siteName")}</div>
        {run && run.score != null ? (
          <>
            <ScoreRing score={run.score} size={150} stroke="#2DD4A8" track="var(--c-ring-track)" strokeWidth={10} className="mt-4" label={t("ringLabel")} />
            <p className="mt-4 font-mono text-[12px] text-[#8B919C]">
              {t("infoStats", { spread: run.spread ?? "—", median: run.fieldMedian ?? "—", models: run.modelScores.length })}
            </p>
          </>
        ) : (
          <>
            <div className="mt-4 flex h-[150px] w-[150px] items-center justify-center rounded-full border-[10px] border-[#2a2e36] font-mono text-[14px] text-[#8B919C]">
              {r.status === "analyzing" ? t("analyzing") : t("queued")}
            </div>
            <p className="mt-4 font-mono text-[12px] text-[#8B919C]">{t("scoreWithin")}</p>
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
            <RefreshIcon /> {t("requestReanalysis")}
          </Link>
          <a href={`/api/researchers/${r.slug}`} className={BTN_OUTLINE}>
            <DownloadIcon /> {t("downloadJson")}
          </a>
        </div>
      </div>
    </div>
  );
}

function ScoreBreakdown({ r, run }: { r: ResearcherArticle; run: AnalysisRunSummary }) {
  const t = useTranslations("article");
  const tc = useTranslations("common");
  const models = run.modelScores;
  const weights = r.field.weights;
  const totalW = CRITERIA.reduce((a, c) => a + (Number(weights[c]) || 0), 0) || 1;

  const consensusFor = (c: Criterion) => (models.length ? Math.round(models.reduce((a, m) => a + m[c], 0) / models.length) : null);
  const lowestModel = models.length > 1 ? models.reduce((lo, m) => (m.weighted < lo.weighted ? m : lo), models[0]).model : null;

  return (
    <Card id="score-breakdown" className="mt-8 scroll-mt-6" padded>
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-serif text-[24px] font-medium text-ink">{t("scoreBreakdown")}</h2>
        <p className="text-[12.5px] text-muted">{t("breakdownHint")}</p>
      </div>
      <Table minWidth={560}>
        <thead>
          <tr>
            <Th>{t("thCriterion")}</Th>
            <Th className="w-[240px]">{t("thConsensus")}</Th>
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
                  <span className="font-medium text-ink">{t(`criteria.${c}`)}</span>{" "}
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
              <span className="font-semibold text-ink">{tc("siteName")}</span>{" "}
              <span className="text-[12px] text-muted">{t("weighted")}</span>
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
  const t = useTranslations("article");
  const pubs = [...r.publications].sort((a, b) => b.year - a.year);
  return (
    <Card id="publications" className="mt-10 scroll-mt-6">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-serif text-[24px] font-medium text-ink">{t("publicationsAnalyzed")}</h2>
        <p className="text-[12.5px] text-muted">{t("papersWithCode", { papers: pubs.length, code: r.openCodeCount })}</p>
      </div>
      {pubs.length === 0 ? (
        <p className="text-[14px] text-muted">{t("noPublications")}</p>
      ) : (
        <Table minWidth={480}>
          <thead>
            <tr>
              <Th>{t("thYear")}</Th>
              <Th>{t("thTitle")}</Th>
              <Th>{t("thVenue")}</Th>
              <Th align="center">{t("thCode")}</Th>
              <Th align="right">{t("thScore")}</Th>
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
                    <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-high-bg text-high" title={t("publicCode")}>
                      <CheckIcon size={13} />
                      <span className="sr-only">{t("publicCode")}</span>
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
  const t = useTranslations("article");
  const c = useTranslations("common");
  const fmt = useFormatter();
  const duration = (sec: number | null | undefined): string => {
    if (sec == null) return "—";
    if (sec < 60) return c("seconds", { n: sec });
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    if (m < 60) return s ? `${c("minutes", { n: m })} ${c("seconds", { n: s })}` : c("minutes", { n: m });
    return `${c("hours", { n: Math.floor(m / 60) })} ${c("minutes", { n: m % 60 })}`;
  };
  const tiles: Array<{ label: string; value: React.ReactNode; hint?: string }> = [
    {
      label: t("provPrompt"),
      value: (
        <>
          {run.promptKey} · v{run.promptVersion}
        </>
      ),
      hint: t("provSha", { sha: shortId(run.promptSha, 12) }),
    },
    { label: t("provModels"), value: run.modelScores.map((m) => m.model).join(", ") || "—", hint: t("provReadings", { count: run.modelScores.length }) },
    { label: t("provRun"), value: `#${shortId(run.id)}`, hint: t("provDuration", { duration: duration(run.durationSec) }) },
    { label: t("provSources"), value: t("provSourcesValue"), hint: r.openalexId ? `OpenAlex ${r.openalexId}` : "OpenAlex" },
    { label: t("provSubmitted"), value: fmtDate(fmt, r.createdAt), hint: t("provPublished", { date: fmtDate(fmt, run.finishedAt) }) },
    { label: t("provPreviousRuns"), value: String(previousRuns), hint: previousRuns === 0 ? t("provFirst") : t("provEarlierKept") },
  ];
  return (
    <section id="provenance" className="mt-10 scroll-mt-6">
      <h2 className="font-serif text-[28px] font-medium text-ink">{t("provenance")}</h2>
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
  const t = useTranslations("article");
  const pubs = [...r.publications].sort((a, b) => b.year - a.year);
  const year = run.finishedAt ? new Date(run.finishedAt).getUTCFullYear() : "—";
  return (
    <section id="references" className="mt-10 scroll-mt-6">
      <h2 className="font-serif text-[28px] font-medium text-ink">{t("references")}</h2>
      <ol className="mt-4 list-decimal space-y-2 ps-6 text-[14px] text-text marker:font-mono marker:text-[12px] marker:text-muted">
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
          {t("referenceLine", { year, name: r.name, run: shortId(run.id), prompt: run.promptKey, version: run.promptVersion })}{" "}
          <a href={`/api/researchers/${r.slug}`} className="font-mono text-[12.5px] text-link hover:underline">
            /api/researchers/{r.slug}
          </a>
        </li>
      </ol>
    </section>
  );
}

function QueuedState({ r }: { r: ResearcherArticle }) {
  const t = useTranslations("article");
  const c = useTranslations("common");
  const analyzing = r.status === "analyzing";
  return (
    <Card className="mt-6">
      <div className="flex items-start gap-4">
        <span className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-mid-bg text-mid">
          <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-mid" aria-hidden="true" />
        </span>
        <div>
          <h2 className="font-serif text-[24px] font-medium text-ink">{analyzing ? t("analysisInProgress") : t("waitingTitle")}</h2>
          <p className="mt-2 text-[15px] leading-relaxed text-text">
            {t("queuedBody", { name: r.name })} {analyzing ? t("analyzingNow") : t("workerWill")} {t("goesLive")}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href="/queue" className={BTN_OUTLINE}>
              {c("followQueue")}
            </Link>
            <Link href="/researchers" className={BTN_OUTLINE}>
              {c("browseIndex")}
            </Link>
          </div>
        </div>
      </div>
    </Card>
  );
}
