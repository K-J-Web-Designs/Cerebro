import { describe, expect, it } from "vitest";
import {
  normalizeOpenAlexWork,
  reconstructOpenAlexAbstract,
} from "./openalex";
import { parseArxivAtomXml } from "./arxiv";

describe("Research API adapters", () => {
  it("reconstructs OpenAlex inverted abstract indexes in word order", () => {
    const abstract = reconstructOpenAlexAbstract({
      graphs: [1],
      Knowledge: [0],
      unify: [2],
      ideas: [3],
    });
    expect(abstract).toBe("Knowledge graphs unify ideas");
  });

  it("normalizes OpenAlex work payload", () => {
    const work = normalizeOpenAlexWork({
      id: "https://openalex.org/W123",
      title: "GraphRAG Synthesis",
      publication_year: 2024,
      cited_by_count: 42,
      primary_location: {
        landing_page_url: "https://example.org/paper",
        source: { display_name: "SIGIR" },
      },
      authorships: [{ author: { display_name: "Kris Jones" } }],
      abstract_inverted_index: { Structured: [0], retrieval: [1] },
    });

    expect(work.title).toBe("GraphRAG Synthesis");
    expect(work.authors).toEqual(["Kris Jones"]);
    expect(work.citationCount).toBe(42);
    expect(work.abstract).toBe("Structured retrieval");
  });

  it("parses arXiv Atom XML feeds into normalized ResearchWork items", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <feed xmlns="http://www.w3.org/2005/Atom">
        <entry>
          <id>http://arxiv.org/abs/2404.16130v1</id>
          <published>2024-04-24T12:00:00Z</published>
          <title>From Local to Global: A Graph RAG Approach</title>
          <summary>Query-focused summarization over private text corpora.</summary>
          <author><name>Darren Edge</name></author>
          <author><name>Ha Trinh</name></author>
        </entry>
      </feed>`;

    const works = parseArxivAtomXml(xml);
    expect(works).toHaveLength(1);
    expect(works[0].source).toBe("arxiv");
    expect(works[0].year).toBe(2024);
    expect(works[0].authors).toEqual(["Darren Edge", "Ha Trinh"]);
  });
});
