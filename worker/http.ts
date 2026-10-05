// Small fetch wrapper: timeout + retries with exponential backoff. Uses the
// global fetch (Node 18+). Retries on network errors, 429 and 5xx.

export interface FetchJsonOptions {
  timeoutMs?: number;
  retries?: number;
  /** Base delay of the backoff (doubles each attempt). */
  backoffMs?: number;
  headers?: Record<string, string>;
}

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly url: string,
    body?: string,
  ) {
    super(`HTTP ${status} for ${url}${body ? `: ${body.slice(0, 200)}` : ""}`);
    this.name = "HttpError";
  }
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function isRetryable(err: unknown): boolean {
  if (err instanceof HttpError) return err.status === 429 || err.status >= 500;
  return true; // network error / timeout
}

export async function fetchJson<T = unknown>(url: string, options: FetchJsonOptions = {}): Promise<T> {
  const timeoutMs = options.timeoutMs ?? Number(process.env.HTTP_TIMEOUT_MS ?? 15_000);
  const retries = options.retries ?? 3;
  const backoffMs = options.backoffMs ?? 500;
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { accept: "application/json", "user-agent": "PeerScore worker (+https://github.com/peerscore)", ...options.headers },
      });
      if (!res.ok) throw new HttpError(res.status, url, await res.text().catch(() => ""));
      return (await res.json()) as T;
    } catch (err) {
      lastError = err;
      if (attempt === retries || !isRetryable(err)) break;
      await sleep(backoffMs * 2 ** attempt);
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}
