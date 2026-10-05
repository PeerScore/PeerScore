import type { Metadata } from "next";
import { getFormatter, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { listQueue } from "@/lib/repositories";
import type { SubmissionStatus } from "@/lib/types";
import { shortId } from "@/lib/format";
import { ButtonLink, Card, SegmentedTabs, Table, Td, Th, Tr, cx } from "@/components/ui";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("queue");
  return { title: t("metaTitle") };
}

const STATUS_STYLE: Record<SubmissionStatus, { cls: string; dot: string }> = {
  QUEUED: { cls: "bg-mid-bg text-mid", dot: "bg-mid" },
  RESOLVING: { cls: "bg-chip text-chip-text", dot: "bg-chip-text" },
  FETCHING: { cls: "bg-chip text-chip-text", dot: "bg-chip-text" },
  ANALYZING: { cls: "bg-chip text-chip-text", dot: "bg-chip-text animate-pulse" },
  PUBLISHED: { cls: "bg-high-bg text-high", dot: "bg-high" },
  FAILED: { cls: "bg-low-bg text-low", dot: "bg-low" },
};

export default async function QueuePage() {
  const [items, t, c, st, fmt] = await Promise.all([
    listQueue({ limit: 200 }),
    getTranslations("queue"),
    getTranslations("common"),
    getTranslations("status"),
    getFormatter(),
  ]);
  const waiting = items.filter((s) => s.status === "QUEUED").length;
  const dateTime = (iso: string) => c("utc", { dateTime: fmt.dateTime(new Date(iso), "dateTime") });

  return (
    <div className="site-container py-8 sm:py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SegmentedTabs
          ariaLabel={c("indexViews")}
          items={[
            { label: c("tabIndex"), href: "/researchers" },
            { label: c("tabRecent"), href: "/researchers?sort=recent" },
            { label: c("tabQueue"), href: "/queue", active: true },
            { label: c("tabStats"), href: "/#stats" },
          ]}
        />
        <ButtonLink href="/submit">{c("submitResearcher")}</ButtonLink>
      </div>

      <h1 className="mt-6 font-serif text-[32px] font-medium leading-tight text-ink sm:text-[40px]">{t("title")}</h1>
      <p className="mt-2 max-w-[640px] text-[15px] text-muted">
        {t.rich("intro", { count: waiting, n: (chunks) => <span className="font-mono text-ink">{chunks}</span> })}
      </p>
      {/* React 19 hoists this into <head>: a plain auto-refresh that needs no JS. */}
      <meta httpEquiv="refresh" content="60" />

      <Card className="mt-6" padded={false}>
        {items.length === 0 ? (
          <p className="px-6 py-12 text-center text-[14px] text-muted">
            {t("empty")}{" "}
            <Link href="/submit" className="font-medium text-link hover:underline">
              {c("submitResearcher")}
            </Link>
            .
          </p>
        ) : (
          <div className="px-5 sm:px-6">
            <Table minWidth={560}>
              <thead>
                <tr>
                  <Th align="right">{t("thPosition")}</Th>
                  <Th>{t("thName")}</Th>
                  <Th>{t("thStatus")}</Th>
                  <Th>{t("thRequest")}</Th>
                  <Th align="right">{t("thSubmitted")}</Th>
                </tr>
              </thead>
              <tbody>
                {items.map((s) => {
                  const style = STATUS_STYLE[s.status];
                  return (
                    <Tr key={s.id}>
                      <Td align="right" mono className="text-muted">
                        {s.position ?? "—"}
                      </Td>
                      <Td>
                        {s.researcherSlug ? (
                          <Link href={`/researchers/${s.researcherSlug}`} className="font-semibold text-ink hover:underline">
                            {s.name}
                          </Link>
                        ) : (
                          <span className="font-semibold text-ink">{s.name}</span>
                        )}
                        {s.error && <div className="text-[12.5px] text-low">{s.error}</div>}
                      </Td>
                      <Td>
                        <span className={cx("inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-[12px] font-medium", style.cls)}>
                          <span className={cx("h-1.5 w-1.5 rounded-full", style.dot)} aria-hidden="true" />
                          {st(s.status)}
                        </span>
                      </Td>
                      <Td mono className="text-muted">
                        #{shortId(s.id)}
                      </Td>
                      <Td align="right" mono className="whitespace-nowrap text-muted">
                        {dateTime(s.createdAt)}
                      </Td>
                    </Tr>
                  );
                })}
              </tbody>
            </Table>
          </div>
        )}
      </Card>
    </div>
  );
}
