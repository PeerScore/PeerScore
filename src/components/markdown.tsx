import type { ReactNode } from "react";
import { cx } from "./ui";

/**
 * Minimal markdown renderer for LLM write-ups: paragraphs (blank-line
 * separated), `- ` bullet lists, and **bold** / *italic* / `code` inline
 * marks. Anything else is rendered as plain text — no HTML passthrough.
 */
export function Markdown({ text, className }: { text: string | null | undefined; className?: string }) {
  if (!text) return null;
  const blocks = text
    .replace(/\r\n/g, "\n")
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean);

  return (
    <div className={cx("flex flex-col gap-4 text-[16px] leading-[1.65] text-text", className)}>
      {blocks.map((block, i) => {
        const lines = block.split("\n");
        if (lines.every((l) => /^[-*]\s+/.test(l))) {
          return (
            <ul key={i} className="list-disc space-y-1 pl-5">
              {lines.map((l, j) => (
                <li key={j}>{inline(l.replace(/^[-*]\s+/, ""))}</li>
              ))}
            </ul>
          );
        }
        const heading = /^(#{1,3})\s+(.*)$/.exec(block);
        if (heading && lines.length === 1) {
          return (
            <h4 key={i} className="font-serif text-[18px] font-medium text-ink">
              {inline(heading[2])}
            </h4>
          );
        }
        return <p key={i}>{inline(lines.join(" "))}</p>;
      })}
    </div>
  );
}

const INLINE = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g;

export function inline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  INLINE.lastIndex = 0;
  while ((m = INLINE.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith("**")) out.push(<strong key={m.index} className="font-semibold text-ink">{tok.slice(2, -2)}</strong>);
    else if (tok.startsWith("`")) out.push(<code key={m.index} className="rounded bg-page px-1 font-mono text-[0.9em]">{tok.slice(1, -1)}</code>);
    else out.push(<em key={m.index}>{tok.slice(1, -1)}</em>);
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}
