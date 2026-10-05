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
      className="relative inline-flex h-11 items-center rounded-full text-muted transition-colors hover:bg-page hover:text-ink"
      title={t("language")}
    >
      <span className="sr-only">{t("language")}</span>
      <span className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2" aria-hidden="true">
        <GlobeIcon />
      </span>
      <select
        id={id}
        value={locale}
        onChange={onChange}
        disabled={pending}
        className="h-11 max-w-[150px] cursor-pointer appearance-none truncate rounded-full bg-transparent pe-3 ps-9 text-[14px] font-medium text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-link"
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
