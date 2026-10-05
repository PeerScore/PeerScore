// UI primitives shared across pages (see docs/SPEC.md "Components to build").
import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import type { ScoreBand } from "@/lib/types";
import { scoreBand } from "@/lib/scoring";
import { WarningIcon } from "./icons";

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

// ---------------------------------------------------------------------------
// Chip
// ---------------------------------------------------------------------------

export function Chip({
  children,
  href,
  muted,
  className,
}: {
  children: ReactNode;
  href?: string;
  /** Neutral (grey) variant for topics / secondary labels. */
  muted?: boolean;
  className?: string;
}) {
  const cls = cx(
    "inline-flex h-6 items-center whitespace-nowrap rounded-full px-2.5 text-[12px] font-medium leading-none",
    muted ? "bg-page text-muted border border-border" : "bg-chip text-chip-text",
    href && "hover:opacity-85",
    className,
  );
  return href ? (
    <Link href={href} className={cls}>
      {children}
    </Link>
  ) : (
    <span className={cls}>{children}</span>
  );
}

// ---------------------------------------------------------------------------
// Score colors
// ---------------------------------------------------------------------------

export const BAND_TEXT: Record<ScoreBand, string> = {
  high: "text-high",
  mid: "text-mid",
  low: "text-low",
};

export const BAND_BG: Record<ScoreBand, string> = {
  high: "bg-high-bg text-high",
  mid: "bg-mid-bg text-mid",
  low: "bg-low-bg text-low",
};

export const BAND_FILL: Record<ScoreBand, string> = {
  high: "bg-high",
  mid: "bg-mid",
  low: "bg-low",
};

export function ScorePill({ score, className }: { score: number; className?: string }) {
  const band = scoreBand(score);
  return (
    <span
      className={cx(
        "inline-flex h-7 min-w-11 items-center justify-center rounded-full px-2.5 font-mono text-[13px] font-semibold tabular",
        BAND_BG[band],
        className,
      )}
    >
      {score}
    </span>
  );
}

export function ScoreBar({
  score,
  className,
  width,
}: {
  score: number;
  className?: string;
  /** CSS width of the track; defaults to 100 %. */
  width?: string;
}) {
  const band = scoreBand(score);
  const t = useTranslations("common");
  return (
    <span
      className={cx("block h-1.5 overflow-hidden rounded-full bg-hairline", className)}
      style={width ? { width } : undefined}
      role="img"
      aria-label={t("scoreOutOf", { score })}
    >
      <span className={cx("block h-full rounded-full", BAND_FILL[band])} style={{ width: `${Math.max(0, Math.min(100, score))}%` }} />
    </span>
  );
}

/**
 * SVG ring. `stroke` / `track` override the band colors (the dark infobox
 * uses a fixed green on a dark track).
 */
export function ScoreRing({
  score,
  size = 84,
  stroke,
  track,
  strokeWidth,
  className,
  label,
}: {
  score: number;
  size?: number;
  stroke?: string;
  track?: string;
  strokeWidth?: number;
  className?: string;
  /** Small caption rendered under the number (e.g. "/ 100"). */
  label?: string;
}) {
  const band = scoreBand(score);
  const t = useTranslations("common");
  const sw = strokeWidth ?? Math.max(4, Math.round(size / 12));
  const r = (size - sw) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, score)) / 100;
  const fontSize = Math.round(size * 0.3);
  return (
    <div className={cx("relative inline-flex shrink-0 items-center justify-center", className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={t("peerScoreOutOf", { score })}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track ?? "var(--c-hairline)"} strokeWidth={sw} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={stroke ?? `var(--c-${band})`}
          strokeWidth={sw}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
        <span className={cx("font-mono font-semibold tabular", !stroke && BAND_TEXT[band])} style={{ fontSize, color: stroke }}>
          {score}
        </span>
        {label && <span className="mt-1 font-mono text-[10px] uppercase tracking-wide opacity-60">{label}</span>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Card / Notice / tiles
// ---------------------------------------------------------------------------

export function Card({
  children,
  className,
  padded = true,
  as: Tag = "section",
  id,
}: {
  children: ReactNode;
  className?: string;
  padded?: boolean;
  as?: "section" | "div" | "article" | "aside";
  id?: string;
}) {
  return (
    <Tag id={id} className={cx("rounded-card border border-border bg-surface shadow-card", padded && "p-5 sm:p-6", className)}>
      {children}
    </Tag>
  );
}

/** Serif 20px card title with a small colored dot before it. */
export function CardTitle({
  children,
  dot = "bg-accent",
  className,
  action,
}: {
  children: ReactNode;
  /** Tailwind bg class for the dot. */
  dot?: string;
  className?: string;
  action?: ReactNode;
}) {
  return (
    <div className={cx("mb-4 flex flex-wrap items-center justify-between gap-2", className)}>
      <h2 className="flex items-center gap-2.5 font-serif text-[20px] font-medium text-ink">
        <span className={cx("inline-block h-2 w-2 rounded-full", dot)} aria-hidden="true" />
        {children}
      </h2>
      {action}
    </div>
  );
}

export function Notice({ children, title, className }: { children: ReactNode; title?: string; className?: string }) {
  return (
    <div className={cx("flex gap-3 rounded-[12px] border border-mid/30 bg-mid-bg px-4 py-3 text-[13.5px] text-text", className)} role="note">
      <span className="mt-0.5 shrink-0 text-mid">
        <WarningIcon />
      </span>
      <div>
        {title && <p className="font-semibold text-ink">{title}</p>}
        <div>{children}</div>
      </div>
    </div>
  );
}

export function StatTile({
  label,
  value,
  hint,
  tone,
  className,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: "amber" | "green";
  className?: string;
}) {
  return (
    <div className={cx("rounded-card border border-border bg-surface px-4 py-3.5 shadow-card", className)}>
      <div className="font-mono text-[10.5px] font-medium uppercase tracking-[0.08em] text-muted">{label}</div>
      <div className={cx("mt-1 font-mono text-[22px] font-semibold leading-tight tabular", tone === "amber" ? "text-mid" : tone === "green" ? "text-high" : "text-ink")}>
        {value}
      </div>
      {hint && <div className="mt-0.5 text-[12px] text-muted">{hint}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SegmentedTabs (links)
// ---------------------------------------------------------------------------

export interface TabItem {
  label: ReactNode;
  href: string;
  active?: boolean;
}

export function SegmentedTabs({ items, className, ariaLabel }: { items: TabItem[]; className?: string; ariaLabel?: string }) {
  return (
    <nav aria-label={ariaLabel} className={cx("inline-flex max-w-full flex-wrap gap-0.5 rounded-full border border-border bg-page p-1", className)}>
      {items.map((t, i) => (
        <Link
          key={i}
          href={t.href}
          aria-current={t.active ? "page" : undefined}
          className={cx(
            "inline-flex h-9 items-center rounded-full px-3.5 text-[13.5px] font-medium whitespace-nowrap",
            t.active ? "bg-surface text-ink shadow-card border border-border" : "text-muted hover:text-ink",
          )}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}

// ---------------------------------------------------------------------------
// ContentsRail
// ---------------------------------------------------------------------------

export interface RailItem {
  label: string;
  href: string;
  active?: boolean;
  sub?: boolean;
  /** Plain <a> (e.g. API routes, which live outside the locale prefix). */
  external?: boolean;
}

export function ContentsRail({
  title: titleProp,
  items,
  tools,
  className,
}: {
  title?: string;
  items: RailItem[];
  tools?: RailItem[];
  className?: string;
}) {
  const t = useTranslations("common");
  const title = titleProp ?? t("contents");
  return (
    <nav className={cx("text-[13.5px]", className)} aria-label={title}>
      <div className="mb-2 font-mono text-[10.5px] font-medium uppercase tracking-[0.08em] text-muted">{title}</div>
      <ol className="flex flex-col gap-0.5">
        {items.map((it) => (
          <li key={it.href + it.label}>
            <Link
              href={it.href}
              aria-current={it.active ? "location" : undefined}
              className={cx(
                "block rounded-[10px] px-3 py-1.5 leading-snug",
                it.sub && "ps-6 text-[13px]",
                it.active ? "border border-border bg-surface font-medium text-ink shadow-card" : "text-text hover:bg-surface hover:text-ink",
              )}
            >
              {it.label}
            </Link>
          </li>
        ))}
      </ol>
      {tools && tools.length > 0 && (
        <>
          <div className="mb-2 mt-6 font-mono text-[10.5px] font-medium uppercase tracking-[0.08em] text-muted">{t("tools")}</div>
          <ul className="flex flex-col gap-0.5">
            {tools.map((it) => (
              <li key={it.href + it.label}>
                {it.external ? (
                  <a href={it.href} className="block rounded-[10px] px-3 py-1.5 leading-snug text-text hover:bg-surface hover:text-ink">
                    {it.label}
                  </a>
                ) : (
                  <Link href={it.href} className="block rounded-[10px] px-3 py-1.5 leading-snug text-text hover:bg-surface hover:text-ink">
                    {it.label}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </nav>
  );
}

// ---------------------------------------------------------------------------
// DataTable primitives — no cell borders, hairline row dividers.
// ---------------------------------------------------------------------------

export function Table({ children, className, minWidth }: { children: ReactNode; className?: string; minWidth?: number }) {
  return (
    <div className="table-scroll -mx-5 sm:-mx-6">
      <table className={cx("w-full border-collapse text-[14px]", className)} style={minWidth ? { minWidth } : undefined}>
        {children}
      </table>
    </div>
  );
}

export function Th({ children, className, align = "left" }: { children?: ReactNode; className?: string; align?: "left" | "right" | "center" }) {
  return (
    <th
      scope="col"
      className={cx(
        "whitespace-nowrap border-b border-border px-3 py-2.5 font-mono text-[11px] font-medium uppercase tracking-[0.06em] text-muted first:ps-5 last:pe-5 sm:first:ps-6 sm:last:pe-6",
        align === "right" && "text-end",
        align === "center" && "text-center",
        align === "left" && "text-start",
        className,
      )}
    >
      {children}
    </th>
  );
}

export function Tr({ children, className, muted }: { children: ReactNode; className?: string; muted?: boolean }) {
  return <tr className={cx("border-b border-hairline last:border-b-0", muted && "opacity-60", className)}>{children}</tr>;
}

export function Td({ children, className, align = "left", mono }: { children?: ReactNode; className?: string; align?: "left" | "right" | "center"; mono?: boolean }) {
  return (
    <td
      className={cx(
        "px-3 py-3 align-middle first:ps-5 last:pe-5 sm:first:ps-6 sm:last:pe-6",
        mono && "font-mono text-[13px] tabular",
        align === "right" && "text-end",
        align === "center" && "text-center",
        className,
      )}
    >
      {children}
    </td>
  );
}

// ---------------------------------------------------------------------------
// Buttons
// ---------------------------------------------------------------------------

const BTN_BASE = "inline-flex h-11 items-center justify-center gap-2 rounded-button px-4 text-[14px] font-medium whitespace-nowrap transition-opacity disabled:opacity-50";
export const BTN_DARK = cx(BTN_BASE, "bg-cta text-cta-text hover:opacity-90");
export const BTN_OUTLINE = cx(BTN_BASE, "border border-border bg-surface text-ink hover:bg-page");

export function ButtonLink({ href, children, variant = "dark", className }: { href: string; children: ReactNode; variant?: "dark" | "outline"; className?: string }) {
  return (
    <Link href={href} className={cx(variant === "dark" ? BTN_DARK : BTN_OUTLINE, className)}>
      {children}
    </Link>
  );
}
