import type { Metadata } from "next";
import { listQueue, queuedCount } from "@/lib/repositories";
import { Card, ContentsRail, StatTile } from "@/components/ui";
import { SubmitForm } from "./submit-form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Submit a researcher" };

const STEPS = [
  { n: "01", when: "minutes", title: "Queued", body: "Your request is stored with a public id and a position in the queue. Nothing else is collected about you." },
  { n: "02", when: "hours", title: "Publications collected", body: "A worker resolves the name in open scholarly records and downloads publication metadata, abstracts and code links." },
  { n: "03", when: "hours", title: "Field-specific analysis", body: "Several language models read the publications with a prompt written for the field and score five criteria independently." },
  { n: "04", when: "24–48 h", title: "Article published", body: "The scores are aggregated, the write-up and every disagreement are published, and the page goes live automatically." },
];

const ELIGIBLE = [
  "Any researcher with publicly indexed publications (journals, conferences, preprints).",
  "Living or deceased, active or retired — the analysis reads the published record only.",
  "Names are resolved in open scholarly records; if several people share a name, the best-documented match is used and shown in the infobox.",
  "No private data is used: nothing beyond publication metadata, abstracts and public code repositories.",
  "Duplicate requests are merged; a researcher already in the index is linked instead of queued again.",
];

export default async function SubmitPage() {
  const [queued, queue] = await Promise.all([queuedCount(), listQueue({ includeFailed: false, limit: 200 })]);
  const analyzing = queue.filter((s) => s.status !== "QUEUED").length;

  return (
    <div className="site-container py-8 sm:py-10">
      <div className="flex flex-col gap-8 lg:flex-row lg:gap-10">
        <aside className="w-full shrink-0 lg:sticky lg:top-6 lg:w-[220px] lg:self-start">
          <ContentsRail
            title="On this page"
            items={[
              { label: "Submit a name", href: "#form", active: true },
              { label: "What happens next", href: "#next" },
              { label: "Who can be submitted", href: "#who" },
              { label: "Current queue", href: "#queue" },
            ]}
          />
        </aside>

        <div className="min-w-0 max-w-[760px] flex-1">
          <h1 className="font-serif text-[32px] font-medium leading-tight text-ink sm:text-[40px]">Submit a researcher</h1>
          <p className="mt-2 text-[15.5px] text-muted">
            One field, no account. The request joins a public queue and the article is published automatically once the
            analysis completes.
          </p>

          <Card id="form" className="mt-6 scroll-mt-6">
            <SubmitForm />
          </Card>

          <section id="next" className="mt-12 scroll-mt-6">
            <h2 className="font-serif text-[26px] font-medium text-ink">What happens next</h2>
            <ol className="mt-4 grid gap-3 sm:grid-cols-2">
              {STEPS.map((st) => (
                <li key={st.n} className="rounded-card border border-border bg-surface p-4 shadow-card">
                  <div className="flex items-center justify-between font-mono text-[11px] text-muted">
                    <span className="font-semibold text-ink">{st.n}</span>
                    <span className="uppercase tracking-[0.06em]">{st.when}</span>
                  </div>
                  <div className="mt-2 text-[15px] font-semibold text-ink">{st.title}</div>
                  <p className="mt-1 text-[13.5px] leading-relaxed text-muted">{st.body}</p>
                </li>
              ))}
            </ol>
          </section>

          <section id="who" className="mt-12 scroll-mt-6">
            <h2 className="font-serif text-[26px] font-medium text-ink">Who can be submitted</h2>
            <ul className="mt-4 list-disc space-y-2 pl-5 text-[15px] text-text marker:text-muted">
              {ELIGIBLE.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </section>

          <section id="queue" className="mt-12 scroll-mt-6">
            <h2 className="font-serif text-[26px] font-medium text-ink">Current queue</h2>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
              <StatTile label="Waiting" value={queued} tone="amber" />
              <StatTile label="Being analyzed" value={analyzing} />
              <StatTile label="Median time" value="[N] h" hint="from submission to article" />
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
