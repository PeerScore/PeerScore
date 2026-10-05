import Link from "next/link";
import { BTN_DARK, BTN_OUTLINE } from "@/components/ui";

export default function NotFound() {
  return (
    <div className="site-container flex flex-col items-start py-20 sm:py-28">
      <span className="font-mono text-[12px] uppercase tracking-[0.1em] text-muted">404 · not found</span>
      <h1 className="mt-3 font-serif text-[34px] font-medium leading-tight text-ink sm:text-[44px]">This page is not in the index.</h1>
      <p className="mt-3 max-w-[520px] text-[16px] text-muted">
        The researcher may not have been submitted yet, or the address is wrong. You can search the index or queue a new analysis.
      </p>
      <div className="mt-6 flex flex-wrap gap-2">
        <Link href="/researchers" className={BTN_DARK}>
          Browse the index
        </Link>
        <Link href="/submit" className={BTN_OUTLINE}>
          Submit a researcher
        </Link>
      </div>
    </div>
  );
}
