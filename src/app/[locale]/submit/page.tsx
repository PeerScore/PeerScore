import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { listQueue, queuedCount } from "@/lib/repositories";
import { Card, ContentsRail, StatTile } from "@/components/ui";
import { SubmitForm } from "./submit-form";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("submit");
  return { title: t("metaTitle") };
}

const STEP_KEYS = ["1", "2", "3", "4"] as const;
const ELIGIBLE_KEYS = ["1", "2", "3", "4", "5"] as const;

export default async function SubmitPage() {
  const [queued, queue, t] = await Promise.all([queuedCount(), listQueue({ includeFailed: false, limit: 200 }), getTranslations("submit")]);
  const analyzing = queue.filter((s) => s.status !== "QUEUED").length;

  return (
    <div className="site-container py-8 sm:py-10">
      <div className="flex flex-col gap-8 lg:flex-row lg:gap-10">
        <aside className="w-full shrink-0 lg:sticky lg:top-6 lg:w-[220px] lg:self-start">
          <ContentsRail
            title={t("onThisPage")}
            items={[
              { label: t("navForm"), href: "#form", active: true },
              { label: t("navNext"), href: "#next" },
              { label: t("navWho"), href: "#who" },
              { label: t("navQueue"), href: "#queue" },
            ]}
          />
        </aside>

        <div className="min-w-0 max-w-[760px] flex-1">
          <h1 className="font-serif text-[32px] font-medium leading-tight text-ink sm:text-[40px]">{t("title")}</h1>
          <p className="mt-2 text-[15.5px] text-muted">{t("intro")}</p>

          <Card id="form" className="mt-6 scroll-mt-6">
            <SubmitForm />
          </Card>

          <section id="next" className="mt-12 scroll-mt-6">
            <h2 className="font-serif text-[26px] font-medium text-ink">{t("whatHappensNext")}</h2>
            <ol className="mt-4 grid gap-3 sm:grid-cols-2">
              {STEP_KEYS.map((k, i) => (
                <li key={k} className="rounded-card border border-border bg-surface p-4 shadow-card">
                  <div className="flex items-center justify-between font-mono text-[11px] text-muted">
                    <span className="font-semibold text-ink">{String(i + 1).padStart(2, "0")}</span>
                    <span className="uppercase tracking-[0.06em]">{t(`steps.${k}.when`)}</span>
                  </div>
                  <div className="mt-2 text-[15px] font-semibold text-ink">{t(`steps.${k}.title`)}</div>
                  <p className="mt-1 text-[13.5px] leading-relaxed text-muted">{t(`steps.${k}.body`)}</p>
                </li>
              ))}
            </ol>
          </section>

          <section id="who" className="mt-12 scroll-mt-6">
            <h2 className="font-serif text-[26px] font-medium text-ink">{t("whoCanBeSubmitted")}</h2>
            <ul className="mt-4 list-disc space-y-2 ps-5 text-[15px] text-text marker:text-muted">
              {ELIGIBLE_KEYS.map((k) => (
                <li key={k}>{t(`eligible.${k}`)}</li>
              ))}
            </ul>
          </section>

          <section id="queue" className="mt-12 scroll-mt-6">
            <h2 className="font-serif text-[26px] font-medium text-ink">{t("currentQueue")}</h2>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
              <StatTile label={t("waiting")} value={queued} tone="amber" />
              <StatTile label={t("beingAnalyzed")} value={analyzing} />
              <StatTile label={t("medianTime")} value={t("medianValue")} hint={t("medianHint")} />
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
