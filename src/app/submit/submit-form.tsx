"use client";

import Link from "next/link";
import { useActionState, useId, useState } from "react";
import { submitResearcher, type SubmitState } from "./actions";
import { BTN_DARK, BTN_OUTLINE, cx } from "@/components/ui";
import { CheckIcon } from "@/components/ui/icons";

const initial: SubmitState = { kind: "idle" };

/** Remounting the inner form (new key) resets the action state. */
export function SubmitForm() {
  const [epoch, setEpoch] = useState(0);
  return <SubmitFormInner key={epoch} onReset={() => setEpoch((e) => e + 1)} />;
}

function SubmitFormInner({ onReset }: { onReset: () => void }) {
  const [state, action, pending] = useActionState(submitResearcher, initial);
  const inputId = useId();

  if (state.kind === "queued") {
    return (
      <Confirmation
        onReset={onReset}
        title={`Analysis queued for ${state.name}`}
        tiles={[
          { label: "Request", value: `#${state.id.slice(0, 7)}` },
          { label: "Position", value: `${state.position} in queue` },
          { label: "Status", value: <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-mid" aria-hidden="true" />Queued</span> },
          { label: "Follow", value: <Link href="/queue" className="text-link hover:underline">Public queue →</Link> },
        ]}
      >
        <p className="text-[15px] text-text">
          Publications will be collected from open scholarly sources and analyzed by several language models with the prompt
          written for the field. The article is usually published <span className="font-medium text-ink">within 24–48 hours</span>.
        </p>
      </Confirmation>
    );
  }

  if (state.kind === "exists") {
    return (
      <Confirmation
        onReset={onReset}
        title={`${state.name} is already in the index`}
        tiles={[
          { label: "Status", value: <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-high" aria-hidden="true" />Indexed</span> },
          { label: "Article", value: <Link href={`/researchers/${state.slug}`} className="text-link hover:underline">Open the page →</Link> },
        ]}
        primary={{ href: `/researchers/${state.slug}`, label: "Open the article" }}
      >
        <p className="text-[15px] text-text">
          A researcher with this name already has a page. Open it to read the analysis, or request a re-analysis from the
          article page if it looks out of date.
        </p>
      </Confirmation>
    );
  }

  const error = state.kind === "error" ? state.message : null;

  return (
    <form action={action} className="flex flex-col gap-4">
      <div>
        <label htmlFor={inputId} className="block text-[14px] font-semibold text-ink">
          Researcher name
        </label>
        <input
          id={inputId}
          name="name"
          type="text"
          required
          minLength={2}
          maxLength={120}
          autoComplete="off"
          defaultValue={state.kind === "error" ? state.name : ""}
          placeholder="e.g. Leïla Haddad"
          aria-invalid={error ? true : undefined}
          aria-describedby={`${inputId}-help`}
          className={cx(
            "mt-2 h-[52px] w-full rounded-input border bg-page px-4 text-[16px] text-ink placeholder:text-muted focus:border-link focus:outline-none",
            error ? "border-low" : "border-border",
          )}
        />
        <p id={`${inputId}-help`} className={cx("mt-2 text-[13px]", error ? "text-low" : "text-muted")}>
          {error ?? "Full name as it appears on publications. We resolve it in open scholarly records; add an initial or an institution if the name is common."}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className={BTN_DARK}>
          {pending ? "Queuing…" : "Start the analysis"}
        </button>
        <span className="text-[13px] text-muted">Public queue · no account</span>
      </div>
    </form>
  );
}

function Confirmation({
  title,
  tiles,
  children,
  primary,
  onReset,
}: {
  onReset: () => void;
  title: string;
  tiles: Array<{ label: string; value: React.ReactNode }>;
  children: React.ReactNode;
  primary?: { href: string; label: string };
}) {
  return (
    <div className="flex flex-col gap-5" role="status">
      <div className="flex items-start gap-4">
        <span className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-high-bg text-high">
          <CheckIcon size={18} />
        </span>
        <div>
          <h2 className="font-serif text-[26px] font-medium leading-tight text-ink">{title}</h2>
          <div className="mt-2">{children}</div>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-[12px] border border-border bg-page px-4 py-3">
            <div className="font-mono text-[10.5px] font-medium uppercase tracking-[0.08em] text-muted">{t.label}</div>
            <div className="mt-1 font-mono text-[14px] font-medium text-ink">{t.value}</div>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        {primary ? (
          <Link href={primary.href} className={BTN_DARK}>
            {primary.label}
          </Link>
        ) : null}
        <button type="button" onClick={onReset} className={primary ? BTN_OUTLINE : BTN_DARK}>
          Submit another name
        </button>
        <Link href="/researchers" className={BTN_OUTLINE}>
          Browse the index
        </Link>
      </div>
    </div>
  );
}
