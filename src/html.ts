const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  mdash: "—",
  ndash: "–",
  hellip: "…",
  rsquo: "'",
  lsquo: "'",
  rdquo: '"',
  ldquo: '"',
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, code: string) => {
    if (code[0] === "#") {
      const n = code[1]?.toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m;
    }
    return ENTITIES[code.toLowerCase()] ?? m;
  });
}

function stripTags(html: string): string {
  return decodeEntities(
    html
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<(script|style|noscript|template|svg|iframe)\b[\s\S]*?<\/\1>/gi, " ")
      .replace(/<(br|p|div|li|h[1-6]|tr|section|article|header|footer)\b[^>]*>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t\f\v\r]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();
}

/** Visible text of an HTML document, as a crawler that does not run JavaScript sees it. */
export function visibleText(html: string): string {
  const body = /<body[^>]*>([\s\S]*)<\/body>/i.exec(html)?.[1] ?? html;
  const main = /<main[^>]*>([\s\S]*?)<\/main>/i.exec(body)?.[1];
  if (main) {
    const mainText = stripTags(main);
    if (wordCount(mainText) >= 50) return mainText;
  }
  return stripTags(body);
}

export function words(text: string): string[] {
  return text.split(/\s+/).filter((w) => /[\p{L}\p{N}$€£]/u.test(w));
}

export function wordCount(text: string): number {
  return words(text).length;
}

export function metaContent(html: string, key: string): string | undefined {
  const k = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(
    `<meta[^>]+(?:name|property)=["']${k}["'][^>]*content=["']([^"']*)["']|<meta[^>]+content=["']([^"']*)["'][^>]*(?:name|property)=["']${k}["']`,
    "i",
  );
  const m = re.exec(html);
  const v = m?.[1] ?? m?.[2];
  return v ? decodeEntities(v).trim() : undefined;
}

export function pageTitle(html: string): string | undefined {
  const t = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1];
  return t ? decodeEntities(t).replace(/\s+/g, " ").trim() : undefined;
}

export interface JsonLdResult {
  types: string[];
  blocks: number;
  errors: number;
}

export function jsonLd(html: string): JsonLdResult {
  const types = new Set<string>();
  let blocks = 0;
  let errors = 0;
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  for (const m of html.matchAll(re)) {
    blocks++;
    try {
      collectTypes(JSON.parse(m[1] ?? ""), types);
    } catch {
      errors++;
    }
  }
  return { types: [...types], blocks, errors };
}

function collectTypes(node: unknown, out: Set<string>): void {
  if (Array.isArray(node)) {
    for (const n of node) collectTypes(n, out);
    return;
  }
  if (!node || typeof node !== "object") return;
  const obj = node as Record<string, unknown>;
  const t = obj["@type"];
  for (const v of Array.isArray(t) ? t : [t]) if (typeof v === "string") out.add(v);
  for (const [k, v] of Object.entries(obj)) if (k !== "@context" && typeof v === "object") collectTypes(v, out);
}
