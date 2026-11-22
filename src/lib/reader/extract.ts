import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";
import { extractArxivId, parseArxivAtomXml } from "@/lib/research/arxiv";

export interface ExtractedArticle {
  title: string;
  contentText: string;
  contentHtml: string;
  siteName: string;
  authors: string[];
  publishedAt?: string;
  wordCount: number;
  readingTimeMinutes: number;
  arxivId?: string;
}

const PRIVATE_HOST_PATTERNS = [
  /^localhost$/i,
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[0-1])\./,
  /^169\.254\./,
  /^0\./,
  /^::1$/,
];

export function isSafePublicHttpUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return false;
    }
    const host = parsed.hostname.toLowerCase();
    return !PRIVATE_HOST_PATTERNS.some((re) => re.test(host));
  } catch {
    return false;
  }
}

export function sanitizeReaderHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, "")
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/javascript:/gi, "");
}

export function extractArticleFromHtml(
  html: string,
  url: string
): ExtractedArticle {
  const { document } = parseHTML(html);
  // Ensure Readability sees a base URL
  try {
    Object.defineProperty(document, "documentURI", {
      value: url,
      configurable: true,
    });
  } catch {
    // ignore if readonly
  }

  const reader = new Readability(document as unknown as Document);
  const parsed = reader.parse();
  const hostname = (() => {
    try {
      return new URL(url).hostname.replace(/^www\./, "");
    } catch {
      return "Web";
    }
  })();

  const rawText = (parsed?.textContent ?? document.body?.textContent ?? "")
    .replace(/\s+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  const words = rawText.split(/\s+/).filter(Boolean).length;
  const readingTimeMinutes = Math.max(1, Math.ceil(words / 220));

  return {
    title: parsed?.title?.trim() || document.title?.trim() || hostname,
    contentText: rawText,
    contentHtml: sanitizeReaderHtml(parsed?.content ?? `<p>${rawText}</p>`),
    siteName: parsed?.siteName?.trim() || hostname,
    authors: parsed?.byline
      ? parsed.byline
          .split(/,|and/)
          .map((s) => s.trim())
          .filter(Boolean)
      : [],
    publishedAt: parsed?.publishedTime ?? undefined,
    wordCount: words,
    readingTimeMinutes,
  };
}

export async function extractArticleFromUrl(
  rawUrl: string
): Promise<ExtractedArticle> {
  if (!isSafePublicHttpUrl(rawUrl)) {
    throw new Error("URL must be a valid public http(s) address.");
  }

  const arxivId = extractArxivId(rawUrl);
  if (arxivId) {
    try {
      const res = await fetch(
        `https://export.arxiv.org/api/query?id_list=${encodeURIComponent(arxivId)}`,
        { signal: AbortSignal.timeout(6000) }
      );
      if (res.ok) {
        const xml = await res.text();
        const [paper] = parseArxivAtomXml(xml);
        if (paper) {
          const words = paper.abstract.split(/\s+/).filter(Boolean).length;
          return {
            title: paper.title,
            contentText: paper.abstract,
            contentHtml: `<p>${paper.abstract}</p>`,
            siteName: "arXiv",
            authors: paper.authors,
            publishedAt: paper.year ? String(paper.year) : undefined,
            wordCount: words,
            readingTimeMinutes: Math.max(1, Math.ceil(words / 200)),
            arxivId,
          };
        }
      }
    } catch {
      // Fall back to regular HTML extraction
    }
  }

  const response = await fetch(rawUrl, {
    headers: {
      "User-Agent": "CerebroReader/1.0 (+https://cerebro.app)",
      Accept: "text/html,application/xhtml+xml",
    },
    signal: AbortSignal.timeout(7000),
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch URL (HTTP ${response.status}).`);
  }

  const html = await response.text();
  return extractArticleFromHtml(html, rawUrl);
}
