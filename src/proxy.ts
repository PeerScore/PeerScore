import createMiddleware from "next-intl/middleware";
import { routing } from "@/i18n/routing";

// Next.js 16 calls this file `proxy.ts` (formerly `middleware.ts`). It detects
// the locale (URL prefix → cookie → Accept-Language), rewrites unprefixed
// paths to the default locale and redirects to the prefixed URL otherwise.
export default createMiddleware(routing);

export const config = {
  // Everything except API routes, Next internals, static files (paths with a
  // dot) and the CSV export, which is a plain route handler outside `[locale]`.
  matcher: ["/((?!api|_next|_vercel|researchers/export|.*\\..*).*)"],
};
