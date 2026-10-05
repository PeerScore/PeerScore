import Link from "next/link";
import type { Metadata } from "next";
import { listQueue } from "@/lib/repositories";
import type { SubmissionStatus } from "@/lib/types";
import { formatDateTime, shortId } from "@/lib/format";
import { ButtonLink, Card, SegmentedTabs, Table, Td, Th, Tr, cx } from "@/components/ui";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Queue" };

const STATUS: Record<SubmissionStatus, { label: string; cls: string; dot: string }> = {
  QUEUED: { label: "Queued", cls: "bg-mid-bg text-mid", dot: "bg-mid" },
  RESOLVING: { label: "Resolving", cls: "bg-chip text-chip-text", dot: "bg-chip-text" },
  FETCHING: { label: "Fetching", cls: "bg-chip text-chip-text", dot: "bg-chip-text" },
  ANALYZING: { label: "Analyzing", cls: "bg-chip text-chip-text", dot: "bg-chip-text animate-pulse" },
  PUBLISHED: { label: "Published", cls: "bg-high-bg text-high", dot: "bg-high" },
  FAILED: { label: "Failed", cls: "bg-low-bg text-low", dot: "bg-low" },
};

export default async function QueuePage() {
  const items = await listQueue({ limit: 200 });
  const waiting = items.filter((s) => s.status === "QUEUED").length;

  return (
    <div className="site-container py-8 sm:py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SegmentedTabs
          ariaLabel="Index views"
          items={[
            { label: "Index", href: "/researchers" },
            { label: "Recent changes", href: "/researchers?sort=recent" },
            { label: "Queue", href: "/queue", active: true },
            { label: "Statistics", href: "/#stats" },
          ]}
        />
        <ButtonLink href="/submit">Submit a researcher</ButtonLink>
      </div>

      <h1 className="mt-6 font-serif text-[32px] font-medium leading-tight text-ink sm:text-[40px]">Public queue</h1>
      <p className="mt-2 max-w-[640px] text-[15px] text-muted">
        Every request that has not been published yet, oldest first. <span className="font-mono text-ink">{waiting}</span> waiting.
        This page refreshes itself every minute; articles go live within 24–48 h.
      </p>
      {/* React 19 hoists this into <head>: a plain auto-refresh that needs no JS. */}
      <meta httpEquiv="refresh" content="60" />

      <Card className="mt-6" padded={false}>
        {items.length === 0 ? (
          <p className="px-6 py-12 text-center text-[14px] text-muted">
            The queue is empty.{" "}
            <Link href="/submit" className="font-medium text-link hover:underline">
              Submit a researcher
            </Link>
            .
          </p>
        ) : (
          <div className="px-5 sm:px-6">
            <Table minWidth={560}>
              <thead>
                <tr>
                  <Th align="right">#</Th>
                  <Th>Name</Th>
                  <Th>Status</Th>
                  <Th>Request</Th>
                  <Th align="right">Submitted</Th>
                </tr>
              </thead>
              <tbody>
                {items.map((s) => {
                  const st = STATUS[s.status];
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
                        <span className={cx("inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-[12px] font-medium", st.cls)}>
                          <span className={cx("h-1.5 w-1.5 rounded-full", st.dot)} aria-hidden="true" />
                          {st.label}
                        </span>
                      </Td>
                      <Td mono className="text-muted">
                        #{shortId(s.id)}
                      </Td>
                      <Td align="right" mono className="whitespace-nowrap text-muted">
                        {formatDateTime(s.createdAt)}
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
