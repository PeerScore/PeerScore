"use client";

import { useId, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { usePathname, useRouter } from "@/i18n/navigation";
import { LOCALES, LOCALE_NAMES, type AppLocale } from "@/i18n/routing";
import { GlobeIcon } from "./ui/icons";

/**
 * Native <select> listing every locale by its native name. Changing it
 * navigates to the same pathname (query string preserved) in the chosen
 * locale; next-intl also remembers the choice in a cookie.
 */
export function LanguageSwitcher() {
  const locale = useLocale();
  const t = useTranslations("common");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const id = useId();

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value as AppLocale;
    const query = searchParams.toString();
    const href = query ? `${pathname}?${query}` : pathname;
    startTransition(() => {
      router.replace(href, { locale: next });
    });
  }

  return (
    <label
      htmlFor={id}
      className="relative inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full px-3 text-muted transition-colors hover:bg-page hover:text-ink focus-within:ring-2 focus-within:ring-link"
      title={`${t("language")}: ${LOCALE_NAMES[locale as AppLocale]}`}
    >
      <span className="sr-only">{t("language")}</span>
      <span className="pointer-events-none" aria-hidden="true">
        <GlobeIcon />
      </span>
      <span className="pointer-events-none font-mono text-[12.5px] font-medium uppercase tracking-wide text-text" aria-hidden="true">
        {locale}
      </span>
      <select
        id={id}
        value={locale}
        onChange={onChange}
        disabled={pending}
        className="absolute inset-0 h-full w-full cursor-pointer appearance-none opacity-0 focus:outline-none"
      >
        {LOCALES.map((l) => (
          <option key={l} value={l} lang={l}>
            {LOCALE_NAMES[l]}
          </option>
        ))}
      </select>
    </label>
  );
}
