export interface FetchResult {
  url: string;
  status: number;
  headers: Headers;
  body: string;
  bytes: number;
  ms: number;
  error?: string;
}

const MAX_BYTES = 3_000_000;

export async function get(url: string, userAgent: string, timeoutMs = 15_000): Promise<FetchResult> {
  const started = Date.now();
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        "user-agent": userAgent,
        accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8",
        "accept-language": "en-US,en;q=0.9",
      },
    });
    const buf = Buffer.from(await res.arrayBuffer());
    return {
      url: res.url || url,
      status: res.status,
      headers: res.headers,
      body: buf.subarray(0, MAX_BYTES).toString("utf8"),
      bytes: buf.length,
      ms: Date.now() - started,
    };
  } catch (err) {
    return {
      url,
      status: 0,
      headers: new Headers(),
      body: "",
      bytes: 0,
      ms: Date.now() - started,
      error: errorMessage(err),
    };
  }
}

export function errorMessage(err: unknown): string {
  if (err instanceof Error) {
    if (err.name === "TimeoutError") return "timed out";
    return err.cause instanceof Error ? err.cause.message : err.message;
  }
  return String(err);
}

export function isCloudflare(r: FetchResult): boolean {
  return /cloudflare/i.test(r.headers.get("server") ?? "") || r.headers.has("cf-ray");
}

/** Cloudflare managed or JS challenge pages. Crawlers cannot solve them. */
export function isChallenge(r: FetchResult): boolean {
  if (r.headers.get("cf-mitigated") === "challenge") return true;
  if (r.status !== 403 && r.status !== 503 && r.status !== 429) return false;
  return /Just a moment\.\.\.|challenge-platform|cf-chl-|Attention Required! \| Cloudflare/i.test(r.body);
}

export function isHtml(r: FetchResult): boolean {
  const type = r.headers.get("content-type") ?? "";
  return /html/i.test(type) || /^\s*<(!doctype|html)/i.test(r.body);
}
