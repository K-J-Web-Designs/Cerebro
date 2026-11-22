import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/supabase/server";
import { hybridSearchItems } from "@/lib/search";
import type { KnowledgeItemType } from "@/db/schema";

const searchBodySchema = z.object({
  query: z.string().default(""),
  types: z
    .array(z.enum(["note", "idea", "bookmark", "paper", "topic"]))
    .optional(),
  tagIds: z.array(z.string()).optional(),
  mode: z.enum(["hybrid", "keyword", "semantic"]).optional(),
  limit: z.number().int().min(1).max(50).optional(),
});

export async function POST(request: Request) {
  const user = await getAuthenticatedUser();
  const userId = user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = searchBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid search query" }, { status: 400 });
  }

  const hits = await hybridSearchItems({
    userId,
    query: parsed.data.query,
    types: parsed.data.types as KnowledgeItemType[] | undefined,
    tagIds: parsed.data.tagIds,
    mode: parsed.data.mode,
    limit: parsed.data.limit,
  });

  return NextResponse.json({
    hits: hits.map((h) => ({
      score: h.score,
      matchKind: h.matchKind,
      matchedHighlight: h.matchedHighlight,
      item: {
        ...h.item,
        embedding: undefined,
        deletedAt: h.item.deletedAt ? h.item.deletedAt.toISOString() : null,
        createdAt: h.item.createdAt.toISOString(),
        updatedAt: h.item.updatedAt.toISOString(),
      },
    })),
  });
}
