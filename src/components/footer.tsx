import { getTranslations } from "next-intl/server";
import NextLink from "next/link";
import { Link } from "@/i18n/navigation";

export async function Footer() {
  const t = await getTranslations("footer");
  const links = [
    { href: "#", label: t("about") },
    { href: "#", label: t("methodology") },
    { href: "/api/researchers", label: t("api"), external: true },
    { href: "#", label: t("privacy") },
    { href: "#", label: t("github") },
  ];
  return (
    <footer className="mt-16 border-t border-border">
      <div className="site-container flex flex-wrap items-center justify-between gap-x-6 gap-y-3 py-6 text-[13px] text-muted">
        <p className="max-w-[640px]">{t("notice")}</p>
        <nav className="flex flex-wrap gap-x-5 gap-y-2" aria-label={t("nav")}>
          {links.map((l) =>
            l.external ? (
              // API routes live outside the locale prefix: plain next/link, not the i18n Link.
              <NextLink key={l.label} href={l.href} className="hover:text-ink">
                {l.label}
              </NextLink>
            ) : (
              <Link key={l.label} href={l.href} className="hover:text-ink">
                {l.label}
              </Link>
            ),
          )}
        </nav>
      </div>
    </footer>
  );
}
