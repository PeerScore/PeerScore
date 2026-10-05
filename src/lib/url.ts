// Query-string helpers for the index page links (filters, A–Z nav, sorting,
// pagination) so every link preserves the other active parameters.

export type QueryValue = string | number | undefined | null;

export function buildQuery(base: Record<string, QueryValue>, overrides: Record<string, QueryValue> = {}): string {
  const merged: Record<string, QueryValue> = { ...base, ...overrides };
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(merged)) {
    if (v === undefined || v === null || v === "") continue;
    sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}
