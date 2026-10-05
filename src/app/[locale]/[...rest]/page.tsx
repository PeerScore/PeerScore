import { notFound } from "next/navigation";

/**
 * Catch-all under `[locale]`: any unknown path renders the localized
 * `not-found.tsx` inside the locale layout (header, footer, language).
 */
export default function CatchAllPage() {
  notFound();
}
