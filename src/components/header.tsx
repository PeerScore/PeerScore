import Link from "next/link";
import { ThemeToggle } from "./theme-toggle";
import { SearchIcon } from "./ui/icons";
import { SearchShortcut } from "./search-shortcut";

function Logo() {
  return (
    <Link href="/" className="flex items-center gap-3 shrink-0" aria-label="PeerScore home">
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
        <span className="font-serif text-[19px] font-semibold text-ink">PeerScore</span>
        <span className="mt-0.5 text-[11.5px] text-muted">The open researcher index</span>
      </span>
    </Link>
  );
}

const nav = [
  { href: "/researchers", label: "Index" },
  { href: "/researchers?sort=recent", label: "Recent" },
  { href: "/researchers/random", label: "Random" },
];

export function Header() {
  return (
    <header className="border-b border-border bg-surface">
      <div className="site-container flex flex-wrap items-center gap-x-6 gap-y-3 py-3">
        <Logo />

        <form
          action="/researchers"
          method="get"
          role="search"
          className="order-last w-full basis-full md:order-none md:w-auto md:basis-auto md:flex-1 md:min-w-[260px] md:max-w-[520px]"
        >
          <label className="relative block">
            <span className="sr-only">Search</span>
            <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted">
              <SearchIcon />
            </span>
            <input
              id="site-search"
              type="search"
              name="q"
              placeholder="Search a researcher, a field, an institution"
              className="h-11 w-full rounded-full border border-border bg-page pl-11 pr-12 text-[14px] text-ink placeholder:text-muted focus:border-link focus:outline-none"
            />
            <kbd className="pointer-events-none absolute right-3 top-1/2 flex h-6 min-w-6 -translate-y-1/2 items-center justify-center rounded-md border border-border bg-surface px-1.5 text-[11px] text-muted">
              /
            </kbd>
          </label>
        </form>
        <SearchShortcut targetId="site-search" />

        <nav className="ml-auto flex flex-wrap items-center gap-1" aria-label="Primary">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="inline-flex h-11 items-center rounded-full px-3 text-[14px] font-medium text-text hover:bg-page hover:text-ink"
            >
              {item.label}
            </Link>
          ))}
          <ThemeToggle />
          <Link
            href="/submit"
            className="ml-1 inline-flex h-11 items-center rounded-full bg-cta px-4 text-[14px] font-medium text-cta-text hover:opacity-90"
          >
            Submit a researcher
          </Link>
        </nav>
      </div>
    </header>
  );
}
