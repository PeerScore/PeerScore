import { defineRouting } from "next-intl/routing";

/** Supported UI locales. The first entry is the default (served unprefixed). */
export const LOCALES = [
  "en",
  "fr",
  "es",
  "de",
  "it",
  "pt",
  "nl",
  "pl",
  "ru",
  "uk",
  "tr",
  "ar",
  "he",
  "hi",
  "zh",
  "ja",
  "ko",
  "id",
  "vi",
  "sv",
] as const;

export type AppLocale = (typeof LOCALES)[number];

/** Native language names, shown in the language switcher. */
export const LOCALE_NAMES: Record<AppLocale, string> = {
  en: "English",
  fr: "Français",
  es: "Español",
  de: "Deutsch",
  it: "Italiano",
  pt: "Português",
  nl: "Nederlands",
  pl: "Polski",
  ru: "Русский",
  uk: "Українська",
  tr: "Türkçe",
  ar: "العربية",
  he: "עברית",
  hi: "हिन्दी",
  zh: "中文",
  ja: "日本語",
  ko: "한국어",
  id: "Bahasa Indonesia",
  vi: "Tiếng Việt",
  sv: "Svenska",
};

/** Locales written right-to-left. */
export const RTL_LOCALES: ReadonlySet<string> = new Set<AppLocale>(["ar", "he"]);

export const isRtl = (locale: string): boolean => RTL_LOCALES.has(locale);

export const routing = defineRouting({
  locales: LOCALES,
  defaultLocale: "en",
  // English stays at `/`, every other locale is prefixed (`/fr/...`).
  localePrefix: "as-needed",
});
