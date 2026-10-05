import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { ThemeToggle } from "./theme-toggle";
import { LanguageSwitcher } from "./language-switcher";
import { SearchIcon } from "./ui/icons";
import { SearchShortcut } from "./search-shortcut";
import { SearchForm } from "./search-form";

async function Logo() {
  const t = await getTranslations("common");
  const h = await getTranslations("header");
  return (
    <Link href="/" className="flex items-center gap-3 shrink-0" aria-label={h("home")}>
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#16181D]">
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
          <path
            d="M2 13.5 6 8.5l3 3 6.5-7"
            stroke="#2DD4A8"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      <span className="flex flex-col leading-none">
        <span className="font-serif text-[19px] font-semibold text-ink">{t("siteName")}</span>
        <span className="mt-0.5 text-[11.5px] text-muted">{t("tagline")}</span>
      </span>
    </Link>
  );
}

export async function Header() {
  const t = await getTranslations("header");
  const c = await getTranslations("common");
  const nav = [
    { href: "/researchers", label: t("index") },
    { href: "/researchers?sort=recent", label: t("recent") },
    { href: "/researchers/random", label: t("random") },
  ];

  return (
    <header className="border-b border-border bg-surface">
      <div className="site-container flex flex-wrap items-center gap-x-6 gap-y-3 py-3">
        <Logo />

        <SearchForm className="order-last w-full basis-full min-w-0 xl:order-none xl:w-auto xl:basis-auto xl:flex-1 xl:max-w-[520px]">
          <label className="relative block">
            <span className="sr-only">{t("search")}</span>
            <span className="pointer-events-none absolute start-4 top-1/2 -translate-y-1/2 text-muted">
              <SearchIcon />
            </span>
            <input
              id="site-search"
              type="search"
              name="q"
              placeholder={t("searchPlaceholder")}
              className="h-11 w-full rounded-full border border-border bg-page ps-11 pe-12 text-[14px] text-ink placeholder:text-muted focus:border-link focus:outline-none"
            />
            <kbd className="pointer-events-none absolute end-3 top-1/2 flex h-6 min-w-6 -translate-y-1/2 items-center justify-center rounded-md border border-border bg-surface px-1.5 text-[11px] text-muted">
              /
            </kbd>
          </label>
        </SearchForm>
        <SearchShortcut targetId="site-search" />

        <nav className="ms-auto flex shrink-0 items-center gap-1" aria-label={t("primaryNav")}>
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="hidden h-11 items-center whitespace-nowrap rounded-full px-3 text-[14px] font-medium text-text hover:bg-page hover:text-ink sm:inline-flex"
            >
              {item.label}
            </Link>
          ))}
          <LanguageSwitcher />
          <ThemeToggle />
          <Link
            href="/submit"
            className="ms-1 inline-flex h-11 items-center whitespace-nowrap rounded-full bg-cta px-4 text-[14px] font-medium text-cta-text hover:opacity-90"
          >
            {c("submitResearcher")}
          </Link>
        </nav>
      </div>
    </header>
  );
}
