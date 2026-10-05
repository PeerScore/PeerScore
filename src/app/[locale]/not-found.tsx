import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { BTN_DARK, BTN_OUTLINE } from "@/components/ui";

export default async function NotFound() {
  const t = await getTranslations("notFound");
  const c = await getTranslations("common");
  return (
    <div className="site-container flex flex-col items-start py-20 sm:py-28">
      <span className="font-mono text-[12px] uppercase tracking-[0.1em] text-muted">{t("code")}</span>
      <h1 className="mt-3 font-serif text-[34px] font-medium leading-tight text-ink sm:text-[44px]">{t("title")}</h1>
      <p className="mt-3 max-w-[520px] text-[16px] text-muted">{t("body")}</p>
      <div className="mt-6 flex flex-wrap gap-2">
        <Link href="/researchers" className={BTN_DARK}>
          {c("browseIndex")}
        </Link>
        <Link href="/submit" className={BTN_OUTLINE}>
          {c("submitResearcher")}
        </Link>
      </div>
    </div>
  );
}
