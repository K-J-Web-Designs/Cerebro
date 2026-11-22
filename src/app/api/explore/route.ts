import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/supabase/server";
import { searchOpenAlexConcepts, searchOpenAlexWorks } from "@/lib/research/openalex";
import { searchArxivPapers } from "@/lib/research/arxiv";
import { expandTopicConceptsWithAI } from "@/lib/ai/provider";
import { hybridSearchItems } from "@/lib/search";

const exploreSchema = z.object({
  topic: z.string().min(2).max(160),
});

export interface MindMapNodeDTO {
  id: string;
  label: string;
  kind: "root" | "concept" | "paper" | "note";
  summary?: string;
  url?: string;
  authors?: string[];
  year?: number | null;
  parentId?: string;
  sourceItemId?: string;
}

export async function POST(request: Request) {
  const user = await getAuthenticatedUser();
  const userId = user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = exploreSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Enter a topic between 2 and 160 characters." },
      { status: 400 }
    );
  }

  const topic = parsed.data.topic.trim();

  const [relatedHits, openAlexWorks, openAlexConcepts, arxivPapers] =
    await Promise.all([
      hybridSearchItems({ userId, query: topic, limit: 4 }),
      searchOpenAlexWorks(topic, 5),
      searchOpenAlexConcepts(topic, 4),
      searchArxivPapers(topic, 4),
    ]);

  const relatedNoteTitles = relatedHits.map((h) => h.item.title);
  const aiExpansion = await expandTopicConceptsWithAI(topic, relatedNoteTitles);

  const nodes: MindMapNodeDTO[] = [
    {
      id: "root",
      label: topic,
      kind: "root",
      summary: `Synthesized exploration map combining ${openAlexWorks.length + arxivPapers.length} research works, ${aiExpansion.branches.length} conceptual branches, and ${relatedHits.length} personal workspace matches.`,
    },
  ];

  // Add AI conceptual branches + subtopics
  aiExpansion.branches.forEach((branch) => {
    nodes.push({
      id: branch.id,
      label: branch.label,
      kind: "concept",
      summary: branch.summary,
      parentId: "root",
    });

    branch.subtopics.forEach((sub, idx) => {
      nodes.push({
        id: `${branch.id}-sub-${idx}`,
        label: sub,
        kind: "concept",
        summary: `Sub-concept under ${branch.label}`,
        parentId: branch.id,
      });
    });
  });

  // Add OpenAlex concepts if available and not already covered
  openAlexConcepts.slice(0, 2).forEach((concept, idx) => {
    nodes.push({
      id: `oa-concept-${idx}`,
      label: concept.name,
      kind: "concept",
      summary:
        concept.description ||
        `OpenAlex research domain (${concept.worksCount.toLocaleString()} indexed works).`,
      parentId: "root",
    });
  });

  // Attach academic works across the conceptual branches
  const combinedPapers = [...arxivPapers, ...openAlexWorks].slice(0, 6);
  combinedPapers.forEach((paper, idx) => {
    const parentBranch =
      aiExpansion.branches[idx % aiExpansion.branches.length]?.id ?? "root";
    nodes.push({
      id: `paper-${idx}`,
      label:
        paper.title.length > 64
          ? `${paper.title.slice(0, 61)}...`
          : paper.title,
      kind: "paper",
      summary:
        paper.abstract ||
        `${paper.source.toUpperCase()} publication${paper.year ? ` (${paper.year})` : ""}.`,
      url: paper.url,
      authors: paper.authors,
      year: paper.year,
      parentId: parentBranch,
    });
  });

  // Attach user's matching personal workspace notes/ideas
  relatedHits.slice(0, 3).forEach((hit, idx) => {
    nodes.push({
      id: `note-${idx}`,
      label: hit.item.title,
      kind: "note",
      summary: hit.item.summary || hit.item.contentMd.slice(0, 180),
      parentId: "root",
      sourceItemId: hit.item.id,
    });
  });

  return NextResponse.json({
    topic,
    provider: aiExpansion.provider,
    nodes,
    papers: combinedPapers,
  });
}
