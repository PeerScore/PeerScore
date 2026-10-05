import type { Metadata } from "next";
import { Instrument_Sans, JetBrains_Mono, Source_Serif_4 } from "next/font/google";
import { notFound } from "next/navigation";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import "../globals.css";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { isRtl, routing } from "@/i18n/routing";
import { getPathname } from "@/i18n/navigation";

const sourceSerif = Source_Serif_4({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-source-serif",
  display: "swap",
});

const instrumentSans = Instrument_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-instrument-sans",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

type Props = { children: React.ReactNode; params: Promise<{ locale: string }> };

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: Omit<Props, "children">): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: "metadata" });
  // hreflang alternates for the home page; `x-default` is the unprefixed English page.
  const languages: Record<string, string> = Object.fromEntries(
    routing.locales.map((l) => [l, getPathname({ href: "/", locale: l })]),
  );
  languages["x-default"] = getPathname({ href: "/", locale: routing.defaultLocale });
  return {
    title: { default: t("title"), template: "%s · PeerScore" },
    description: t("description"),
    alternates: { languages },
  };
}

// Runs before first paint: applies the persisted theme (or the OS preference)
// so there is no flash of the wrong theme. Mirrors ThemeToggle's logic.
const themeScript = `(function(){try{var t=localStorage.getItem("peerscore-theme");var d=t==="dark"||(t!=="light"&&window.matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d);}catch(e){}})();`;

export default async function RootLayout({ children, params }: Props) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  return (
    <html
      lang={locale}
      dir={isRtl(locale) ? "rtl" : "ltr"}
      suppressHydrationWarning
      className={`${sourceSerif.variable} ${instrumentSans.variable} ${jetbrainsMono.variable}`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-screen flex flex-col">
        <NextIntlClientProvider>
          <Header />
          <main className="flex-1">{children}</main>
          <Footer />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
