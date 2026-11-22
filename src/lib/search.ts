import { and, eq, isNull } from "drizzle-orm";
import { ensureSchema, schema } from "@/db";
import type { KnowledgeItemRow, KnowledgeItemType } from "@/db/schema";
import { generateEmbedding } from "@/lib/ai/provider";
import { cosineSimilarity, extractWikilinks } from "./wikilinks";

export { cosineSimilarity, extractWikilinks };

export interface HybridSearchParams {
  userId: string;
  query: string;
  types?: KnowledgeItemType[];
  tagIds?: string[];
  mode?: "hybrid" | "keyword" | "semantic";
  limit?: number;
}

export interface SearchHit {
  item: KnowledgeItemRow;
  score: number;
  matchKind: "keyword" | "semantic" | "hybrid";
  matchedHighlight?: string;
}

export async function hybridSearchItems(
  params: HybridSearchParams
): Promise<SearchHit[]> {
  const db = await ensureSchema();
  const limit = params.limit ?? 20;
  const mode = params.mode ?? "hybrid";
  const q = params.query.trim().toLowerCase();

  const [allItems, allHighlights, allItemTags] = await Promise.all([
    db
      .select()
      .from(schema.knowledgeItems)
      .where(
        and(
          eq(schema.knowledgeItems.userId, params.userId),
          isNull(schema.knowledgeItems.deletedAt)
        )
      ),
    db
      .select()
      .from(schema.highlights)
      .where(
        and(
          eq(schema.highlights.userId, params.userId),
          isNull(schema.highlights.deletedAt)
        )
      ),
    db.select().from(schema.itemTags),
  ]);

  const tagsByItem = new Map<string, Set<string>>();
  for (const row of allItemTags) {
    let set = tagsByItem.get(row.itemId);
    if (!set) {
      set = new Set();
      tagsByItem.set(row.itemId, set);
    }
    set.add(row.tagId);
  }

  const highlightsByItem = new Map<string, string[]>();
  for (const h of allHighlights) {
    const list = highlightsByItem.get(h.itemId) ?? [];
    list.push(`${h.quoteText} ${h.annotationMd}`);
    highlightsByItem.set(h.itemId, list);
  }

  const filtered = allItems.filter((item) => {
    if (params.types?.length && !params.types.includes(item.type)) {
      return false;
    }
    if (params.tagIds?.length) {
      const itemTagSet = tagsByItem.get(item.id);
      if (!itemTagSet) return false;
      const hasAny = params.tagIds.some((tid) => itemTagSet.has(tid));
      if (!hasAny) return false;
    }
    return true;
  });

  if (!q) {
    return filtered
      .sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      )
      .slice(0, limit)
      .map((item) => ({
        item,
        score: 1,
        matchKind: "keyword",
      }));
  }

  const queryVec =
    mode === "keyword" ? null : await generateEmbedding(params.query);
  const terms = q.split(/\s+/).filter(Boolean);

  const hits: SearchHit[] = [];

  for (const item of filtered) {
    const titleLower = item.title.toLowerCase();
    const summaryLower = item.summary.toLowerCase();
    const contentLower = item.contentMd.toLowerCase();
    const itemHighlights = highlightsByItem.get(item.id) ?? [];

    let keywordScore = 0;
    if (mode !== "semantic") {
      if (titleLower.includes(q)) keywordScore += 0.7;
      if (summaryLower.includes(q)) keywordScore += 0.35;
      if (contentLower.includes(q)) keywordScore += 0.25;

      let termHits = 0;
      for (const term of terms) {
        if (
          titleLower.includes(term) ||
          summaryLower.includes(term) ||
          contentLower.includes(term)
        ) {
          termHits += 1;
        }
      }
      if (terms.length > 0) {
        keywordScore += 0.3 * (termHits / terms.length);
      }
    }

    let matchedHighlight: string | undefined;
    for (const hText of itemHighlights) {
      if (hText.toLowerCase().includes(q)) {
        keywordScore += 0.35;
        matchedHighlight = hText.slice(0, 140);
        break;
      }
    }

    let semanticScore = 0;
    if (queryVec && item.embedding && Array.isArray(item.embedding)) {
      semanticScore = Math.max(0, cosineSimilarity(queryVec, item.embedding));
    }

    const totalScore =
      mode === "keyword"
        ? keywordScore
        : mode === "semantic"
          ? semanticScore
          : keywordScore * 0.65 + semanticScore * 0.55;

    if (totalScore > 0.08) {
      hits.push({
        item,
        score: Number(totalScore.toFixed(4)),
        matchKind:
          keywordScore > 0 && semanticScore > 0.12
            ? "hybrid"
            : semanticScore > keywordScore
              ? "semantic"
              : "keyword",
        matchedHighlight,
      });
    }
  }

  return hits.sort((a, b) => b.score - a.score).slice(0, limit);
}
