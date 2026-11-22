import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/supabase/server";
import { ensureSchema, schema } from "@/db";
import { extractArticleFromUrl } from "@/lib/reader/extract";
import { generateEmbedding, summarizeArticleWithAI } from "@/lib/ai/provider";

const ingestSchema = z.object({
  url: z.string().url().optional(),
  title: z.string().min(1).max(300).optional(),
  content: z.string().optional(),
  authors: z.array(z.string()).optional(),
  type: z.enum(["bookmark", "paper"]).optional(),
});

export async function POST(request: Request) {
  const user = await getAuthenticatedUser();
  const userId = user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = ingestSchema.safeParse(body);
  if (!parsed.success || (!parsed.data.url && !parsed.data.content)) {
    return NextResponse.json(
      { error: "Provide a valid URL or manual article content." },
      { status: 400 }
    );
  }

  const db = await ensureSchema();
  const now = new Date();

  let title = parsed.data.title?.trim() ?? "";
  let contentText = parsed.data.content?.trim() ?? "";
  let contentHtml = contentText
    ? contentText
        .split(/\n{2,}/)
        .map((p) => `<p>${p}</p>`)
        .join("\n")
    : "";
  let siteName = "Saved Note";
  let authors = parsed.data.authors ?? [];
  let publishedAt: string | undefined;
  let wordCount = contentText.split(/\s+/).filter(Boolean).length;
  let readingTimeMinutes = Math.max(1, Math.ceil(wordCount / 220));
  let arxivId: string | undefined;
  let extractNotice: string | undefined;

  if (parsed.data.url && !contentText) {
    try {
      const extracted = await extractArticleFromUrl(parsed.data.url);
      title = title || extracted.title;
      contentText = extracted.contentText;
      contentHtml = extracted.contentHtml;
      siteName = extracted.siteName;
      authors = authors.length ? authors : extracted.authors;
      publishedAt = extracted.publishedAt;
      wordCount = extracted.wordCount;
      readingTimeMinutes = extracted.readingTimeMinutes;
      arxivId = extracted.arxivId;
    } catch (err) {
      // Allow graceful bookmark save even when remote site blocks scraping
      const hostname = new URL(parsed.data.url).hostname.replace(/^www\./, "");
      title = title || `Saved Link — ${hostname}`;
      siteName = hostname;
      contentText = `Bookmarked URL: ${parsed.data.url}\n\n(Full article text could not be fetched automatically; paste excerpts or add notes here.)`;
      contentHtml = `<p>Bookmarked URL: <a href="${parsed.data.url}" target="_blank" rel="noreferrer">${parsed.data.url}</a></p>`;
      extractNotice =
        err instanceof Error ? err.message : "Could not extract remote content";
    }
  }

  const aiSummary = await summarizeArticleWithAI(title, contentText);
  const embedding = await generateEmbedding(
    `${title}\n${aiSummary.summary}\n${contentText}`
  );
  const itemType =
    parsed.data.type ?? (arxivId || parsed.data.url?.includes("arxiv.org") ? "paper" : "bookmark");

  const id = crypto.randomUUID();
  const record = {
    id,
    userId,
    type: itemType as "bookmark" | "paper",
    title: title || "Untitled Reading",
    contentMd: contentText,
    summary: aiSummary.summary,
    sourceUrl: parsed.data.url ?? null,
    metadata: {
      authors,
      siteName,
      publishedAt,
      wordCount,
      readingTimeMinutes,
      readingStatus: "unread" as const,
      extractedHtml: contentHtml,
      arxivId,
      keyTakeaways: aiSummary.keyTakeaways,
      suggestedTags: aiSummary.suggestedTags,
    },
    embedding,
    version: 1,
    createdAt: now,
    updatedAt: now,
  };

  await db.insert(schema.knowledgeItems).values(record);

  return NextResponse.json(
    {
      notice: extractNotice,
      item: {
        ...record,
        embedding: undefined,
        deletedAt: null,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      },
    },
    { status: 201 }
  );
}
