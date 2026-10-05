"use client";

import type { FormEvent, ReactNode } from "react";

/**
 * A plain GET form that also submits itself whenever one of its controls
 * changes (checkboxes, radios, selects). Text / number inputs submit on
 * blur-change as usual; the "Apply" button keeps it working without JS.
 */
export function AutoSubmitForm({ action, children, className }: { action: string; children: ReactNode; className?: string }) {
  function onChange(e: FormEvent<HTMLFormElement>) {
    const t = e.target as HTMLInputElement;
    if (t.type === "checkbox" || t.type === "radio" || t.tagName === "SELECT" || t.type === "range") {
      e.currentTarget.requestSubmit();
    }
  }
  return (
    <form action={action} method="get" onChange={onChange} className={className}>
      {children}
    </form>
  );
}
