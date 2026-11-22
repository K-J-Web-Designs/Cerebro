import { eq } from "drizzle-orm";
import { ensureSchema, schema } from "./index";

export async function seedDemoWorkspace(userId: string): Promise<void> {
  const db = await ensureSchema();

  const existing = await db
    .select({ id: schema.knowledgeItems.id })
    .from(schema.knowledgeItems)
    .where(eq(schema.knowledgeItems.userId, userId))
    .limit(1);

  if (existing.length > 0) {
    return;
  }

  const now = new Date();
  const tagIds = {
    aiSystems: crypto.randomUUID(),
    msis: crypto.randomUUID(),
    research: crypto.randomUUID(),
    product: crypto.randomUUID(),
  };

  await db.insert(schema.tags).values([
    {
      id: tagIds.aiSystems,
      userId,
      name: "Agentic AI",
      color: "#c87d1a",
      category: "Research",
      createdAt: now,
      updatedAt: now,
    },
    {
      id: tagIds.msis,
      userId,
      name: "MSIS Curriculum",
      color: "#2a6f97",
      category: "Academic",
      createdAt: now,
      updatedAt: now,
    },
    {
      id: tagIds.research,
      userId,
      name: "Knowledge Graphs",
      color: "#3a7d44",
      category: "Architecture",
      createdAt: now,
      updatedAt: now,
    },
    {
      id: tagIds.product,
      userId,
      name: "Blue Bridge Labs",
      color: "#9a4c3b",
      category: "Strategy",
      createdAt: now,
      updatedAt: now,
    },
  ]);

  const itemIds = {
    noteMemory: crypto.randomUUID(),
    noteCurriculum: crypto.randomUUID(),
    paperGraph: crypto.randomUUID(),
    ideaCompass: crypto.randomUUID(),
    topicAgents: crypto.randomUUID(),
  };

  await db.insert(schema.knowledgeItems).values([
    {
      id: itemIds.noteMemory,
      userId,
      type: "note",
      title: "Episodic vs. Semantic Memory in Research Assistants",
      summary:
        "Synthesis comparing vector-backed episodic recall against structured graph memory for long-horizon synthesis.",
      contentMd: `# Episodic vs. Semantic Memory in Research Assistants

Long-lived knowledge assistants fail when they treat every retrieved snippet as flat text. Combining **pgvector semantic recall** with explicit **entity-relationship edges** lets researchers trace *why* two papers disagree.

## Key Architectural Principles
- Anchor every extracted claim to its original [[GraphRAG: Connecting Structured Knowledge and LLM Retrieval]] highlight.
- Promote recurring cross-paper patterns into [[AI Research Synthesis Studio for MSIS Capstones]].
- Keep offline-first IndexedDB state synchronized via deterministic delta outboxes.

## Open Questions
- How should confidence decay over time when newer empirical studies supersede older preprints?`,
      metadata: {
        wordCount: 92,
      },
      version: 1,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: itemIds.noteCurriculum,
      userId,
      type: "note",
      title: "MSIS Applied AI Systems Track — Module Outline",
      summary:
        "Draft syllabus connecting enterprise knowledge architecture, RAG evaluation, and human-centered decision tooling.",
      contentMd: `# MSIS Applied AI Systems Track

Designing a capstone sequence where graduate students ship real knowledge systems rather than toy notebooks.

## Core Modules
1. Information Retrieval & Hybrid Vector/Graph Indexing
2. Evaluation Harnesses & Citation Grounding
3. Local-First Progressive Web Architectures

Connects directly with [[Episodic vs. Semantic Memory in Research Assistants]] and [[AI Research Synthesis Studio for MSIS Capstones]].`,
      metadata: {
        wordCount: 61,
      },
      version: 1,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: itemIds.paperGraph,
      userId,
      type: "paper",
      title: "GraphRAG: Connecting Structured Knowledge and LLM Retrieval",
      summary:
        "Academic brief examining how community-clustered knowledge graphs improve global sensemaking over large corpora compared to naive chunk retrieval.",
      sourceUrl: "https://arxiv.org/abs/2404.16130",
      contentMd: `Global sensemaking queries over large private corpora require understanding corpus-wide themes rather than localized top-k passages.

By extracting entities, relationships, and hierarchical community summaries, graph-indexed retrieval supports both local fact lookup and thematic synthesis across hundreds of documents.

In practical research workspaces, combining lightweight user-curated wikilinks with automated concept extraction balances precision with discovery.`,
      metadata: {
        authors: ["Darren Edge", "Ha Trinh", "Newman Cheng"],
        siteName: "arXiv",
        publishedAt: "2024-04-24",
        readingStatus: "reading",
        readingTimeMinutes: 14,
        wordCount: 2800,
        arxivId: "2404.16130",
      },
      version: 1,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: itemIds.ideaCompass,
      userId,
      type: "idea",
      title: "AI Research Synthesis Studio for MSIS Capstones",
      summary:
        "A guided workspace that turns student literature reviews into live citation graphs with automated contradiction alerts.",
      contentMd: `Students spend weeks drowning in PDFs without seeing how methodologies conflict across papers.

If Cerebro pairs Read Later highlights with an Idea Incubator scoring rubric (Impact, Confidence, Effort), cohorts can validate thesis gaps in days instead of months.`,
      metadata: {
        ideaStage: "exploring",
        impact: 9,
        confidence: 8,
        effort: 4,
        iceScore: 18,
        aiSuggestions: [
          {
            id: crypto.randomUUID(),
            kind: "angle",
            text: "Add a 'Methodology Matrix' export so MSIS students can compare sample sizes, baselines, and limitations side-by-side.",
            createdAt: now.toISOString(),
          },
          {
            id: crypto.randomUUID(),
            kind: "critique",
            text: "Avoid black-box synthesis: require every AI claim to link back to an explicit user highlight or paper abstract.",
            createdAt: now.toISOString(),
          },
        ],
      },
      version: 1,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: itemIds.topicAgents,
      userId,
      type: "topic",
      title: "Personal Knowledge Graphs",
      summary:
        "Saved exploration map linking graph-structured retrieval, spatial mind mapping, and offline-first sync.",
      contentMd:
        "Saved Topic Explorer map covering Personal Knowledge Graphs, GraphRAG, and local-first CRDT/outbox synchronization.",
      metadata: {
        mindMapNodes: [
          {
            id: "root",
            label: "Personal Knowledge Graphs",
            kind: "root",
            summary: "Core synthesis theme across research and product design.",
          },
          {
            id: "c1",
            label: "Hybrid Vector + Graph Retrieval",
            kind: "concept",
            parentId: "root",
            summary: "Combines semantic similarity with explicit typed edges.",
          },
          {
            id: "c2",
            label: "Offline-First Sync",
            kind: "concept",
            parentId: "root",
            summary: "IndexedDB outbox + delta sync for multi-device continuity.",
          },
          {
            id: "p1",
            label: "GraphRAG (Edge et al., 2024)",
            kind: "paper",
            parentId: "c1",
            url: "https://arxiv.org/abs/2404.16130",
            year: 2024,
          },
        ],
      },
      version: 1,
      createdAt: now,
      updatedAt: now,
    },
  ]);

  await db.insert(schema.itemTags).values([
    { itemId: itemIds.noteMemory, tagId: tagIds.aiSystems, updatedAt: now },
    { itemId: itemIds.noteMemory, tagId: tagIds.research, updatedAt: now },
    { itemId: itemIds.noteCurriculum, tagId: tagIds.msis, updatedAt: now },
    { itemId: itemIds.paperGraph, tagId: tagIds.research, updatedAt: now },
    { itemId: itemIds.paperGraph, tagId: tagIds.aiSystems, updatedAt: now },
    { itemId: itemIds.ideaCompass, tagId: tagIds.msis, updatedAt: now },
    { itemId: itemIds.ideaCompass, tagId: tagIds.product, updatedAt: now },
    { itemId: itemIds.topicAgents, tagId: tagIds.research, updatedAt: now },
  ]);

  await db.insert(schema.highlights).values([
    {
      id: crypto.randomUUID(),
      itemId: itemIds.paperGraph,
      userId,
      quoteText:
        "Global sensemaking queries over large private corpora require understanding corpus-wide themes rather than localized top-k passages.",
      prefixContext: "",
      suffixContext: " By extracting entities, relationships",
      annotationMd:
        "Directly validates why Cerebro unifies Read Later highlights with the Knowledge Graph rather than leaving them in folders.",
      color: "amber",
      positionOffset: 0,
      createdAt: now,
      updatedAt: now,
    },
  ]);

  await db.insert(schema.knowledgeEdges).values([
    {
      id: crypto.randomUUID(),
      userId,
      sourceItemId: itemIds.noteMemory,
      targetItemId: itemIds.paperGraph,
      relationType: "cites",
      weight: 1,
      aiGenerated: false,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: crypto.randomUUID(),
      userId,
      sourceItemId: itemIds.noteMemory,
      targetItemId: itemIds.ideaCompass,
      relationType: "expands",
      weight: 0.9,
      aiGenerated: false,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: crypto.randomUUID(),
      userId,
      sourceItemId: itemIds.noteCurriculum,
      targetItemId: itemIds.ideaCompass,
      relationType: "related_to",
      weight: 0.85,
      aiGenerated: false,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: crypto.randomUUID(),
      userId,
      sourceItemId: itemIds.topicAgents,
      targetItemId: itemIds.paperGraph,
      relationType: "cites",
      weight: 0.95,
      aiGenerated: true,
      createdAt: now,
      updatedAt: now,
    },
  ]);
}
