"use client";

import { useActionState, useId, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { submitResearcher, type SubmitState } from "./actions";
import { BTN_DARK, BTN_OUTLINE, cx } from "@/components/ui";
import { CheckIcon } from "@/components/ui/icons";

const initial: SubmitState = { kind: "idle" };
// Mirrors NAME_MIN_LENGTH / NAME_MAX_LENGTH in src/lib/repositories/submissions.ts.
const NAME_MIN = 2;
const NAME_MAX = 120;

/** Remounting the inner form (new key) resets the action state. */
export function SubmitForm() {
  const [epoch, setEpoch] = useState(0);
  return <SubmitFormInner key={epoch} onReset={() => setEpoch((e) => e + 1)} />;
}

function SubmitFormInner({ onReset }: { onReset: () => void }) {
  const [state, action, pending] = useActionState(submitResearcher, initial);
  const inputId = useId();
  const t = useTranslations("submit");

  if (state.kind === "queued") {
    return (
      <Confirmation
        onReset={onReset}
        title={t("queuedTitle", { name: state.name })}
        tiles={[
          { label: t("tileRequest"), value: `#${state.id.slice(0, 7)}` },
          { label: t("tilePosition"), value: t("positionValue", { position: state.position }) },
          {
            label: t("tileStatus"),
            value: (
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-mid" aria-hidden="true" />
                {t("statusQueued")}
              </span>
            ),
          },
          {
            label: t("tileFollow"),
            value: (
              <Link href="/queue" className="text-link hover:underline">
                {t("publicQueueLink")}
              </Link>
            ),
          },
        ]}
      >
        <p className="text-[15px] text-text">{t.rich("queuedBody", { b: (chunks) => <span className="font-medium text-ink">{chunks}</span> })}</p>
      </Confirmation>
    );
  }

  if (state.kind === "exists") {
    return (
      <Confirmation
        onReset={onReset}
        title={t("existsTitle", { name: state.name })}
        tiles={[
          {
            label: t("tileStatus"),
            value: (
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-high" aria-hidden="true" />
                {t("statusIndexed")}
              </span>
            ),
          },
          {
            label: t("tileArticle"),
            value: (
              <Link href={`/researchers/${state.slug}`} className="text-link hover:underline">
                {t("openPage")}
              </Link>
            ),
          },
        ]}
        primary={{ href: `/researchers/${state.slug}`, label: t("openArticle") }}
      >
        <p className="text-[15px] text-text">{t("existsBody")}</p>
      </Confirmation>
    );
  }

  const error =
    state.kind === "error"
      ? state.code === "tooShort"
        ? t("errorTooShort", { min: NAME_MIN })
        : state.code === "tooLong"
          ? t("errorTooLong", { max: NAME_MAX })
          : state.code === "server"
            ? t("errorServer")
            : t("errorInvalid")
      : null;

  return (
    <form action={action} className="flex flex-col gap-4">
      <div>
        <label htmlFor={inputId} className="block text-[14px] font-semibold text-ink">
          {t("nameLabel")}
        </label>
        <input
          id={inputId}
          name="name"
          type="text"
          required
          minLength={NAME_MIN}
          maxLength={NAME_MAX}
          autoComplete="off"
          defaultValue={state.kind === "error" ? state.name : ""}
          placeholder={t("namePlaceholder")}
          aria-invalid={error ? true : undefined}
          aria-describedby={`${inputId}-help`}
          className={cx(
            "mt-2 h-[52px] w-full rounded-input border bg-page px-4 text-[16px] text-ink placeholder:text-muted focus:border-link focus:outline-none",
            error ? "border-low" : "border-border",
          )}
        />
        <p id={`${inputId}-help`} className={cx("mt-2 text-[13px]", error ? "text-low" : "text-muted")}>
          {error ?? t("nameHelp")}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className={BTN_DARK}>
          {pending ? t("queuing") : t("start")}
        </button>
        <span className="text-[13px] text-muted">{t("publicQueueNoAccount")}</span>
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
  const t = useTranslations("submit");
  const c = useTranslations("common");
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
        {tiles.map((tile) => (
          <div key={tile.label} className="rounded-[12px] border border-border bg-page px-4 py-3">
            <div className="font-mono text-[10.5px] font-medium uppercase tracking-[0.08em] text-muted">{tile.label}</div>
            <div className="mt-1 font-mono text-[14px] font-medium text-ink">{tile.value}</div>
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
          {t("submitAnother")}
        </button>
        <Link href="/researchers" className={BTN_OUTLINE}>
          {c("browseIndex")}
        </Link>
      </div>
    </div>
  );
}
