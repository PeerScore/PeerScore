import { getFormatter, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { featured, listFields, recentlyPublished, stats } from "@/lib/repositories";
import { excerpt } from "@/lib/format";
import { Card, CardTitle, Chip, ScorePill, ScoreRing, StatTile, BTN_OUTLINE, cx } from "@/components/ui";
import { ArrowRightIcon, GitHubIcon, InfoIcon } from "@/components/ui/icons";

export const dynamic = "force-dynamic";

const STEP_KEYS = ["1", "2", "3", "4"] as const;

export default async function HomePage() {
  const [s, feat, recent, fields, t, fmt] = await Promise.all([
    stats(),
    featured(),
    recentlyPublished(5),
    listFields(),
    getTranslations("home"),
    getFormatter(),
  ]);
  const n = (v: number) => fmt.number(v);

  return (
    <div className="site-container py-10 sm:py-14">
      {/* Intro */}
      <section className="flex flex-wrap items-end justify-between gap-x-10 gap-y-8">
        <div className="max-w-[640px]">
          <h1 className="font-serif text-[34px] font-medium leading-[1.08] text-ink sm:text-[44px]">{t("title")}</h1>
          <p className="mt-4 max-w-[560px] text-[16.5px] leading-relaxed text-muted">{t("intro")}</p>
        </div>
        <div id="stats" className="grid w-full scroll-mt-6 grid-cols-2 gap-3 sm:w-auto sm:grid-cols-4">
          <StatTile label={t("statResearchers")} value={n(s.researchers)} />
          <StatTile label={t("statPapers")} value={n(s.publications)} />
          <StatTile label={t("statFields")} value={n(s.fields)} />
          <StatTile label={t("statQueue")} value={n(s.queued)} tone="amber" />
        </div>
      </section>

      {/* Cards */}
      <section className="mt-10 grid gap-5 [grid-template-columns:repeat(auto-fit,minmax(min(100%,420px),1fr))]">
        {/* Featured analysis */}
        <Card>
          <CardTitle dot="bg-high">{t("featured")}</CardTitle>
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
                      {t("papersModels", { papers: feat.publicationCount, models: feat.modelScores.length })}
                    </span>
                  </div>
                </div>
              </div>
              <p className="text-[15px] leading-relaxed text-text">{excerpt(feat.summary, 260)}</p>
              <Link href={`/researchers/${feat.slug}`} className="inline-flex items-center gap-1.5 text-[14px] font-medium text-link hover:underline">
                {t("readAnalysis")} <ArrowRightIcon className="rtl:-scale-x-100" />
              </Link>
            </div>
          ) : (
            <p className="text-[14px] text-muted">{t("noAnalysis")}</p>
          )}
        </Card>

        {/* Recently published */}
        <Card>
          <CardTitle
            dot="bg-link"
            action={
              <Link href="/researchers?sort=recent" className="text-[13.5px] font-medium text-link hover:underline">
                {t("viewAll")}
              </Link>
            }
          >
            {t("recentlyPublished")}
          </CardTitle>
          {recent.length === 0 ? (
            <p className="text-[14px] text-muted">{t("nothingPublished")}</p>
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
          <CardTitle dot="bg-chip-text">{t("browseByField")}</CardTitle>
          <div className="flex flex-wrap gap-2">
            {fields.map((f) => (
              <Link
                key={f.id}
                href={`/researchers?field=${f.slug}`}
                className="inline-flex h-8 items-center gap-2 rounded-full border border-border bg-page ps-3 pe-1.5 text-[13px] font-medium text-ink hover:border-link"
              >
                {f.name}
                <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-surface px-1.5 font-mono text-[11px] text-muted">
                  {n(f.researcherCount)}
                </span>
              </Link>
            ))}
          </div>
          <Link href="/researchers" className="mt-4 inline-flex items-center gap-1.5 text-[14px] font-medium text-link hover:underline">
            {t("allFields")} <ArrowRightIcon className="rtl:-scale-x-100" />
          </Link>
        </Card>

        {/* How it works */}
        <Card>
          <CardTitle dot="bg-mid">{t("howItWorks")}</CardTitle>
          <ol className="flex flex-col gap-3.5">
            {STEP_KEYS.map((k, i) => (
              <li key={k} className="flex gap-3.5">
                <span className="mt-0.5 font-mono text-[12px] font-semibold text-muted">{String(i + 1).padStart(2, "0")}</span>
                <div>
                  <div className="text-[15px] font-semibold text-ink">{t(`steps.${k}.title`)}</div>
                  <p className="text-[14px] leading-relaxed text-muted">{t(`steps.${k}.body`)}</p>
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
            <p className="text-[15px] font-semibold text-ink">{t("reproducibleTitle")}</p>
            <p className="text-[14px] text-muted">{t("reproducibleBody")}</p>
          </div>
          <Link href="#" className={cx(BTN_OUTLINE)}>
            <GitHubIcon /> {t("contribute")}
          </Link>
        </div>
      </Card>
    </div>
  );
}
