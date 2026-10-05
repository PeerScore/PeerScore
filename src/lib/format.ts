// Presentation helpers (server-safe, deterministic: dates are formatted in UTC
// so server and client output never differ).

const dateFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const dateTimeFmt = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "UTC",
});

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : dateFmt.format(d);
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : `${dateTimeFmt.format(d)} UTC`;
}

export function formatNumber(n: number): string {
  return new Intl.NumberFormat("en-US").format(n);
}

export function formatDuration(sec: number | null | undefined): string {
  if (sec == null) return "—";
  if (sec < 60) return `${sec} s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m < 60) return s ? `${m} min ${s} s` : `${m} min`;
  const h = Math.floor(m / 60);
  return `${h} h ${m % 60} min`;
}

/** "clx1abc…" → "clx1abc" (first 7 chars) for compact ids. */
export function shortId(id: string, n = 7): string {
  return id.slice(0, n);
}

/** First paragraph of a markdown text, truncated at a word boundary. */
export function excerpt(markdown: string | null | undefined, max = 220): string {
  if (!markdown) return "";
  const first = markdown.split(/\n\s*\n/)[0].replace(/\*\*/g, "").replace(/\s+/g, " ").trim();
  if (first.length <= max) return first;
  const cut = first.slice(0, max);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), max - 30))}…`;
}

/** Short model labels: ["model-a", "model-b"] → ["A", "B"]. */
export function modelLabel(model: string, index: number): string {
  const m = /([a-z0-9])$/i.exec(model.trim());
  const tail = m ? m[1].toUpperCase() : "";
  return tail.length === 1 && /[A-Z]/.test(tail) ? tail : String.fromCharCode(65 + index);
}

export function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Year range like "2015 – present". */
export function activeRange(from: number | null, to: number | null): string {
  if (from == null && to == null) return "—";
  return `${from ?? "…"} – ${to ?? "present"}`;
}
