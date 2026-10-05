"use client";

import type { ReactNode } from "react";
import { useLocale } from "next-intl";
import { getPathname } from "@/i18n/navigation";

/**
 * Plain GET form (works without JS) whose `action` points at the localized
 * index, so a search from /fr lands on /fr/researchers?q=…
 */
export function SearchForm({ children, className }: { children: ReactNode; className?: string }) {
  const locale = useLocale();
  return (
    <form action={getPathname({ href: "/researchers", locale })} method="get" role="search" className={className}>
      {children}
    </form>
  );
}
