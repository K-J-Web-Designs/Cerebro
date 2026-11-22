export interface ResearchWork {
  id: string;
  source: "openalex" | "arxiv";
  title: string;
  abstract: string;
  authors: string[];
  year: number | null;
  url: string;
  citationCount: number;
  venue?: string;
}

export interface OpenAlexConcept {
  id: string;
  name: string;
  level: number;
  worksCount: number;
  description?: string;
}

interface OpenAlexRawWork {
  id: string;
  title?: string;
  publication_year?: number;
  cited_by_count?: number;
  doi?: string;
  primary_location?: {
    landing_page_url?: string;
    source?: { display_name?: string };
  };
  authorships?: Array<{
    author?: { display_name?: string };
  }>;
  abstract_inverted_index?: Record<string, number[]>;
}

export function reconstructOpenAlexAbstract(
  inverted?: Record<string, number[]>
): string {
  if (!inverted) return "";
  const words: Array<[number, string]> = [];
  for (const [token, positions] of Object.entries(inverted)) {
    for (const pos of positions) {
      words.push([pos, token]);
    }
  }
  words.sort((a, b) => a[0] - b[0]);
  return words.map(([, w]) => w).join(" ");
}

export function normalizeOpenAlexWork(raw: OpenAlexRawWork): ResearchWork {
  const url =
    raw.primary_location?.landing_page_url ||
    raw.doi ||
    raw.id ||
    "https://openalex.org";

  return {
    id: raw.id,
    source: "openalex",
    title: raw.title?.trim() || "Untitled Research Work",
    abstract: reconstructOpenAlexAbstract(raw.abstract_inverted_index),
    authors: (raw.authorships ?? [])
      .map((a) => a.author?.display_name)
      .filter((n): n is string => Boolean(n))
      .slice(0, 5),
    year: raw.publication_year ?? null,
    url,
    citationCount: raw.cited_by_count ?? 0,
    venue: raw.primary_location?.source?.display_name,
  };
}

export async function searchOpenAlexWorks(
  query: string,
  limit = 6
): Promise<ResearchWork[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const params = new URLSearchParams({
    search: trimmed,
    "per-page": String(limit),
    sort: "relevance_score:desc",
  });
  const politeEmail = process.env.OPENALEX_POLITE_EMAIL?.trim();
  if (politeEmail) {
    params.set("mailto", politeEmail);
  }

  try {
    const res = await fetch(
      `https://api.openalex.org/works?${params.toString()}`,
      {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(5500),
      }
    );
    if (!res.ok) return [];
    const data = (await res.json()) as { results?: OpenAlexRawWork[] };
    return (data.results ?? []).map(normalizeOpenAlexWork);
  } catch (err) {
    console.warn("OpenAlex works search unavailable:", err);
    return [];
  }
}

export async function searchOpenAlexConcepts(
  query: string,
  limit = 6
): Promise<OpenAlexConcept[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const params = new URLSearchParams({
    search: trimmed,
    "per-page": String(limit),
  });
  const politeEmail = process.env.OPENALEX_POLITE_EMAIL?.trim();
  if (politeEmail) {
    params.set("mailto", politeEmail);
  }

  try {
    const res = await fetch(
      `https://api.openalex.org/concepts?${params.toString()}`,
      {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(5500),
      }
    );
    if (!res.ok) return [];
    const data = (await res.json()) as {
      results?: Array<{
        id: string;
        display_name?: string;
        level?: number;
        works_count?: number;
        description?: string;
      }>;
    };
    return (data.results ?? []).map((c) => ({
      id: c.id,
      name: c.display_name ?? "Concept",
      level: c.level ?? 1,
      worksCount: c.works_count ?? 0,
      description: c.description,
    }));
  } catch (err) {
    console.warn("OpenAlex concepts search unavailable:", err);
    return [];
  }
}
