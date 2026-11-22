import { describe, expect, it } from "vitest";
import { ensureSchema, resetTestDatabase, schema } from "@/db";
import { seedDemoWorkspace } from "@/db/seed";
import { extractWikilinks, hybridSearchItems } from "./search";

describe("Wikilinks & Database Hybrid Search", () => {
  it("extracts unique [[wikilink]] targets from markdown", () => {
    const links = extractWikilinks(
      "See [[GraphRAG|Paper]] and [[Episodic Memory]] plus [[GraphRAG|Again]]."
    );
    expect(links).toEqual(["GraphRAG", "Episodic Memory"]);
  });

  it("seeds demo workspace in PGlite and returns ranked hybrid search hits", async () => {
    const db = await ensureSchema();
    await resetTestDatabase();

    const userId = "test-user-1";
    await db.insert(schema.users).values({
      id: userId,
      name: "Kris Jones",
      email: "kris@test.local",
    });

    await seedDemoWorkspace(userId);

    const hits = await hybridSearchItems({
      userId,
      query: "GraphRAG",
      limit: 5,
    });

    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].item.title).toContain("GraphRAG");
  });
});
