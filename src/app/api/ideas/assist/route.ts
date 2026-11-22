import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/supabase/server";
import { expandIdeaWithAI } from "@/lib/ai/provider";
import { hybridSearchItems } from "@/lib/search";

const assistSchema = z.object({
  title: z.string().min(1).max(240),
  content: z.string().default(""),
  mode: z.enum(["expand", "critique", "connect"]).optional().default("expand"),
});

export async function POST(request: Request) {
  const user = await getAuthenticatedUser();
  const userId = user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = assistSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Provide an idea title to analyze." },
      { status: 400 }
    );
  }

  const related = await hybridSearchItems({
    userId,
    query: `${parsed.data.title} ${parsed.data.content.slice(0, 200)}`,
    limit: 6,
  });

  const relatedTitles = related
    .map((r) => r.item.title)
    .filter((t) => t.toLowerCase() !== parsed.data.title.toLowerCase());

  const result = await expandIdeaWithAI({
    title: parsed.data.title,
    content: parsed.data.content,
    mode: parsed.data.mode,
    relatedTitles,
  });

  return NextResponse.json({
    ...result,
    relatedItems: related.slice(0, 3).map((r) => ({
      id: r.item.id,
      title: r.item.title,
      type: r.item.type,
    })),
  });
}
