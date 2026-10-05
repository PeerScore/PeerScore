import { hasLocale } from "next-intl";
import { getRequestConfig } from "next-intl/server";
import { formats } from "./formats";
import { routing } from "./routing";

export default getRequestConfig(async ({ requestLocale }) => {
  // `requestLocale` is the `[locale]` segment matched by the proxy (or the
  // X-NEXT-INTL-LOCALE header it sets, which also covers server actions and
  // route handlers). Anything unknown falls back to the default locale.
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
    formats,
    // Deterministic server/client output, as before (see src/lib/format.ts).
    timeZone: "UTC",
  };
});
