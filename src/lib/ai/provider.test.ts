import { describe, expect, it } from "vitest";
import {
  deterministicEmbedding,
  expandIdeaWithAI,
  expandTopicConceptsWithAI,
  extractKeywords,
  getActiveAIProvider,
  summarizeArticleWithAI,
} from "./provider";
import { cosineSimilarity } from "@/lib/search";

describe("AI provider & deterministic embeddings", () => {
  it("produces 768-dim normalized vectors with higher similarity for related text", () => {
    const a = deterministicEmbedding("knowledge graph retrieval and semantic memory");
    const b = deterministicEmbedding("semantic memory with knowledge graphs");
    const c = deterministicEmbedding("sourdough bread baking fermentation recipe");

    expect(a).toHaveLength(768);
    expect(cosineSimilarity(a, b)).toBeGreaterThan(cosineSimilarity(a, c));
  });

  it("falls back to local provider when no API keys are configured", () => {
    expect(getActiveAIProvider()).toBe("local");
  });

  it("expands ideas with actionable suggestions and tags in local mode", async () => {
    const res = await expandIdeaWithAI({
      title: "MSIS AI Capstone Studio",
      content: "Combine student literature highlights into a citation graph.",
      relatedTitles: ["GraphRAG Notes"],
    });

    expect(res.provider).toBe("local");
    expect(res.suggestions.length).toBeGreaterThanOrEqual(3);
    expect(res.suggestions.some((s) => s.text.includes("GraphRAG Notes"))).toBe(true);
  });

  it("expands topic into structured conceptual branches", async () => {
    const res = await expandTopicConceptsWithAI("Agentic Memory", []);
    expect(res.branches).toHaveLength(4);
    expect(res.branches[0].subtopics.length).toBeGreaterThan(0);
  });

  it("summarizes article text and extracts keywords", async () => {
    const res = await summarizeArticleWithAI(
      "GraphRAG",
      "Global sensemaking queries require corpus-wide themes. Structured knowledge graphs improve retrieval over large document collections."
    );
    expect(res.summary.length).toBeGreaterThan(10);
    expect(extractKeywords("knowledge graph retrieval knowledge", 2)).toContain(
      "knowledge"
    );
  });
});
