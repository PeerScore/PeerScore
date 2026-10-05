import Link from "next/link";
import { featured, listFields, recentlyPublished, stats } from "@/lib/repositories";
import { excerpt, formatNumber } from "@/lib/format";
import { Card, CardTitle, Chip, ScorePill, ScoreRing, StatTile, BTN_OUTLINE, cx } from "@/components/ui";
import { ArrowRightIcon, GitHubIcon, InfoIcon } from "@/components/ui/icons";

export const dynamic = "force-dynamic";

const STEPS = [
  { n: "01", title: "Submit a name", body: "Anyone can submit a researcher. One field, no account — the request joins a public queue." },
  { n: "02", title: "Publications are collected", body: "A worker resolves the researcher in open scholarly records and downloads publication metadata and abstracts." },
  { n: "03", title: "Field-specific analysis", body: "Several language models read the publications with a prompt written for the field and score five criteria independently." },
  { n: "04", title: "The article goes live", body: "Scores are aggregated into a weighted consensus and the full write-up, with every disagreement, is published within 24–48 h." },
];

export default async function HomePage() {
  const [s, feat, recent, fields] = await Promise.all([stats(), featured(), recentlyPublished(5), listFields()]);

  return (
    <div className="site-container py-10 sm:py-14">
      {/* Intro */}
      <section className="flex flex-wrap items-end justify-between gap-x-10 gap-y-8">
        <div className="max-w-[640px]">
          <h1 className="font-serif text-[34px] font-medium leading-[1.08] text-ink sm:text-[44px]">
            The open encyclopedia of research output.
          </h1>
          <p className="mt-4 max-w-[560px] text-[16.5px] leading-relaxed text-muted">
            PeerScore indexes researchers worldwide and asks several language models to read their publications with a prompt
            written for their field. Every score, rationale and disagreement is public.
          </p>
        </div>
        <div id="stats" className="grid w-full scroll-mt-6 grid-cols-2 gap-3 sm:w-auto sm:grid-cols-4">
          <StatTile label="Researchers" value={formatNumber(s.researchers)} />
          <StatTile label="Papers read" value={formatNumber(s.publications)} />
          <StatTile label="Fields" value={formatNumber(s.fields)} />
          <StatTile label="In queue" value={formatNumber(s.queued)} tone="amber" />
        </div>
      </section>

      {/* Cards */}
      <section className="mt-10 grid gap-5 [grid-template-columns:repeat(auto-fit,minmax(min(100%,420px),1fr))]">
        {/* Featured analysis */}
        <Card>
          <CardTitle dot="bg-high">Featured analysis</CardTitle>
          {feat && feat.score != null ? (
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-start gap-4">
                <ScoreRing score={feat.score} size={84} />
                <div className="min-w-0 flex-1">
                  <Link href={`/researchers/${feat.slug}`} className="font-serif text-[22px] font-medium leading-tight text-ink hover:underline">
                    {feat.name}
                  </Link>
                  {feat.affiliation && <p className="mt-0.5 text-[14px] text-muted">{feat.affiliation}</p>}
                  <div className="mt-2.5 flex flex-wrap items-center gap-2">
                    <Chip href={`/researchers?field=${feat.field.slug}`}>{feat.field.name}</Chip>
                    <span className="font-mono text-[12px] text-muted">
                      {feat.publicationCount} papers · {feat.modelScores.length} models
                    </span>
                  </div>
                </div>
              </div>
              <p className="text-[15px] leading-relaxed text-text">{excerpt(feat.summary, 260)}</p>
              <Link href={`/researchers/${feat.slug}`} className="inline-flex items-center gap-1.5 text-[14px] font-medium text-link hover:underline">
                Read the analysis <ArrowRightIcon />
              </Link>
            </div>
          ) : (
            <p className="text-[14px] text-muted">No analysis has been published yet. The first submission in the queue will appear here.</p>
          )}
        </Card>

        {/* Recently published */}
        <Card>
          <CardTitle
            dot="bg-link"
            action={
              <Link href="/researchers?sort=recent" className="text-[13.5px] font-medium text-link hover:underline">
                View all
              </Link>
            }
          >
            Recently published
          </CardTitle>
          {recent.length === 0 ? (
            <p className="text-[14px] text-muted">Nothing published yet.</p>
          ) : (
            <ul className="-mx-2 divide-y divide-hairline">
              {recent.map((r) => (
                <li key={r.id}>
                  <Link href={`/researchers/${r.slug}`} className="flex items-center gap-3 rounded-[10px] px-2 py-2.5 hover:bg-page">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[15px] font-medium text-ink">{r.name}</div>
                      <div className="truncate text-[13px] text-muted">{r.field.name}</div>
                    </div>
                    {r.score != null && <ScorePill score={r.score} />}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Browse by field */}
        <Card>
          <CardTitle dot="bg-chip-text">Browse by field</CardTitle>
          <div className="flex flex-wrap gap-2">
            {fields.map((f) => (
              <Link
                key={f.id}
                href={`/researchers?field=${f.slug}`}
                className="inline-flex h-8 items-center gap-2 rounded-full border border-border bg-page pl-3 pr-1.5 text-[13px] font-medium text-ink hover:border-link"
              >
                {f.name}
                <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-surface px-1.5 font-mono text-[11px] text-muted">
                  {f.researcherCount}
                </span>
              </Link>
            ))}
          </div>
          <Link href="/researchers" className="mt-4 inline-flex items-center gap-1.5 text-[14px] font-medium text-link hover:underline">
            All fields <ArrowRightIcon />
          </Link>
        </Card>

        {/* How it works */}
        <Card>
          <CardTitle dot="bg-mid">How PeerScore works</CardTitle>
          <ol className="flex flex-col gap-3.5">
            {STEPS.map((st) => (
              <li key={st.n} className="flex gap-3.5">
                <span className="mt-0.5 font-mono text-[12px] font-semibold text-muted">{st.n}</span>
                <div>
                  <div className="text-[15px] font-semibold text-ink">{st.title}</div>
                  <p className="text-[14px] leading-relaxed text-muted">{st.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </Card>
      </section>

      {/* Transparency notice */}
      <Card className="mt-5">
        <div className="flex flex-wrap items-center gap-4">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-page text-muted">
            <InfoIcon />
          </span>
          <div className="min-w-[240px] flex-1">
            <p className="text-[15px] font-semibold text-ink">Every analysis is reproducible.</p>
            <p className="text-[14px] text-muted">
              Prompts are versioned and hashed, model outputs are stored verbatim, and the whole pipeline is open source. Analyses
              are generated by language models and can contain errors — report one from any article page.
            </p>
          </div>
          <Link href="#" className={cx(BTN_OUTLINE)}>
            <GitHubIcon /> Contribute on GitHub
          </Link>
        </div>
      </Card>
    </div>
  );
}
