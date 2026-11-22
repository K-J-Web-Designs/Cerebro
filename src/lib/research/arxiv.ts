import { XMLParser } from "fast-xml-parser";
import type { ResearchWork } from "./openalex";

interface ArxivEntry {
  id?: string;
  title?: string;
  summary?: string;
  published?: string;
  author?: { name?: string } | Array<{ name?: string }>;
}

export function parseArxivAtomXml(xml: string): ResearchWork[] {
  const parser = new XMLParser({
    ignoreAttributes: false,
    trimValues: true,
  });

  const parsed = parser.parse(xml) as {
    feed?: { entry?: ArxivEntry | ArxivEntry[] };
  };
  const rawEntries = parsed?.feed?.entry;
  if (!rawEntries) return [];

  const entries = Array.isArray(rawEntries) ? rawEntries : [rawEntries];

  return entries.map((entry) => {
    const rawAuthors = entry.author
      ? Array.isArray(entry.author)
        ? entry.author
        : [entry.author]
      : [];
    const authors = rawAuthors
      .map((a) => a.name?.trim())
      .filter((n): n is string => Boolean(n))
      .slice(0, 5);

    const year = entry.published
      ? Number(entry.published.slice(0, 4)) || null
      : null;

    return {
      id: entry.id?.trim() || crypto.randomUUID(),
      source: "arxiv" as const,
      title: (entry.title ?? "Untitled Preprint").replace(/\s+/g, " ").trim(),
      abstract: (entry.summary ?? "").replace(/\s+/g, " ").trim(),
      authors,
      year,
      url: entry.id?.trim() || "https://arxiv.org",
      citationCount: 0,
      venue: "arXiv",
    };
  });
}

export async function searchArxivPapers(
  query: string,
  limit = 5
): Promise<ResearchWork[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const params = new URLSearchParams({
    search_query: `all:${trimmed}`,
    start: "0",
    max_results: String(limit),
  });

  try {
    const res = await fetch(
      `https://export.arxiv.org/api/query?${params.toString()}`,
      {
        headers: { Accept: "application/atom+xml" },
        signal: AbortSignal.timeout(5500),
      }
    );
    if (!res.ok) return [];
    const xml = await res.text();
    return parseArxivAtomXml(xml);
  } catch (err) {
    console.warn("arXiv search unavailable:", err);
    return [];
  }
}

export function extractArxivId(url: string): string | null {
  const match = url.match(/arxiv\.org\/(?:abs|pdf)\/([0-9]+\.[0-9]+(?:v[0-9]+)?)/i);
  return match ? match[1] : null;
}
