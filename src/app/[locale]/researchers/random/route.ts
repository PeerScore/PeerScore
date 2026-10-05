import { hasLocale } from "next-intl";
import { randomPublished } from "@/lib/repositories";
import { redirect } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";

export const dynamic = "force-dynamic";

/** GET /[locale]/researchers/random → a random published researcher (or the index when none), in the same locale. */
export async function GET(_request: Request, { params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  const locale = hasLocale(routing.locales, raw) ? raw : routing.defaultLocale;
  const r = await randomPublished();
  redirect({ href: r ? `/researchers/${r.slug}` : "/researchers", locale });
}
