import { NextResponse } from "next/server";
import { and, eq, gt, inArray } from "drizzle-orm";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/supabase/server";
import { ensureSchema, schema } from "@/db";
import type {
  EdgeRelationType,
  KnowledgeItemType,
  KnowledgeMetadata,
} from "@/db/schema";
import { generateEmbedding } from "@/lib/ai/provider";
import { extractWikilinks } from "@/lib/search";

const mutationSchema = z.object({
  entity: z.enum(["item", "highlight", "tag", "itemTag", "edge"]),
  entityId: z.string().min(1),
  op: z.enum(["upsert", "delete"]),
  payload: z.record(z.string(), z.unknown()),
  clientTimestamp: z.string().optional(),
});

const pushBodySchema = z.object({
  mutations: z.array(mutationSchema).max(200),
});

export async function GET(request: Request) {
  const user = await getAuthenticatedUser();
  const userId = user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = await ensureSchema();
  const { searchParams } = new URL(request.url);
  const sinceRaw = searchParams.get("since");
  const sinceDate = sinceRaw ? new Date(sinceRaw) : null;
  const hasValidSince = sinceDate && !Number.isNaN(sinceDate.getTime());

  const [items, highlights, tags, edges] = await Promise.all([
    db
      .select()
      .from(schema.knowledgeItems)
      .where(
        hasValidSince
          ? and(
              eq(schema.knowledgeItems.userId, userId),
              gt(schema.knowledgeItems.updatedAt, sinceDate)
            )
          : eq(schema.knowledgeItems.userId, userId)
      ),
    db
      .select()
      .from(schema.highlights)
      .where(
        hasValidSince
          ? and(
              eq(schema.highlights.userId, userId),
              gt(schema.highlights.updatedAt, sinceDate)
            )
          : eq(schema.highlights.userId, userId)
      ),
    db
      .select()
      .from(schema.tags)
      .where(
        hasValidSince
          ? and(
              eq(schema.tags.userId, userId),
              gt(schema.tags.updatedAt, sinceDate)
            )
          : eq(schema.tags.userId, userId)
      ),
    db
      .select()
      .from(schema.knowledgeEdges)
      .where(
        hasValidSince
          ? and(
              eq(schema.knowledgeEdges.userId, userId),
              gt(schema.knowledgeEdges.updatedAt, sinceDate)
            )
          : eq(schema.knowledgeEdges.userId, userId)
      ),
  ]);

  const userItemIds = items.map((i) => i.id);
  const allUserItems =
    userItemIds.length > 0 && !hasValidSince
      ? userItemIds
      : (
          await db
            .select({ id: schema.knowledgeItems.id })
            .from(schema.knowledgeItems)
            .where(eq(schema.knowledgeItems.userId, userId))
        ).map((r) => r.id);

  const itemTagsRows =
    allUserItems.length > 0
      ? await db
          .select()
          .from(schema.itemTags)
          .where(inArray(schema.itemTags.itemId, allUserItems))
      : [];

  return NextResponse.json({
    serverTime: new Date().toISOString(),
    items: items.map((i) => ({
      ...i,
      embedding: undefined,
      deletedAt: i.deletedAt ? i.deletedAt.toISOString() : null,
      createdAt: i.createdAt.toISOString(),
      updatedAt: i.updatedAt.toISOString(),
    })),
    highlights: highlights.map((h) => ({
      ...h,
      deletedAt: h.deletedAt ? h.deletedAt.toISOString() : null,
      createdAt: h.createdAt.toISOString(),
      updatedAt: h.updatedAt.toISOString(),
    })),
    tags: tags.map((t) => ({
      ...t,
      deletedAt: t.deletedAt ? t.deletedAt.toISOString() : null,
      createdAt: t.createdAt.toISOString(),
      updatedAt: t.updatedAt.toISOString(),
    })),
    itemTags: itemTagsRows.map((it) => ({
      itemId: it.itemId,
      tagId: it.tagId,
      updatedAt: it.updatedAt.toISOString(),
    })),
    edges: edges.map((e) => ({
      ...e,
      deletedAt: e.deletedAt ? e.deletedAt.toISOString() : null,
      createdAt: e.createdAt.toISOString(),
      updatedAt: e.updatedAt.toISOString(),
    })),
  });
}

export async function POST(request: Request) {
  const user = await getAuthenticatedUser();
  const userId = user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = pushBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid sync payload", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const db = await ensureSchema();
  const now = new Date();
  const touchedItemIds: Array<{ id: string; title: string; contentMd: string }> =
    [];

  for (const m of parsed.data.mutations) {
    const p = m.payload;

    if (m.entity === "item") {
      const id = String(p.id ?? m.entityId);
      const title = String(p.title ?? "Untitled");
      const contentMd = String(p.contentMd ?? "");
      const summary = String(p.summary ?? "");
      const type = (p.type as KnowledgeItemType) ?? "note";
      const sourceUrl = p.sourceUrl ? String(p.sourceUrl) : null;
      const metadata = (p.metadata as KnowledgeMetadata) ?? {};
      const version = Number(p.version ?? 1);
      const deletedAt =
        m.op === "delete" || p.deletedAt
          ? new Date(String(p.deletedAt ?? now.toISOString()))
          : null;
      const updatedAt = p.updatedAt ? new Date(String(p.updatedAt)) : now;
      const createdAt = p.createdAt ? new Date(String(p.createdAt)) : now;

      const embedding = deletedAt
        ? null
        : await generateEmbedding(`${title}\n${summary}\n${contentMd}`);

      await db
        .insert(schema.knowledgeItems)
        .values({
          id,
          userId,
          type,
          title,
          contentMd,
          summary,
          sourceUrl,
          metadata,
          embedding,
          version,
          deletedAt,
          createdAt,
          updatedAt,
        })
        .onConflictDoUpdate({
          target: schema.knowledgeItems.id,
          set: {
            type,
            title,
            contentMd,
            summary,
            sourceUrl,
            metadata,
            embedding,
            version,
            deletedAt,
            updatedAt,
          },
        });

      if (!deletedAt) {
        touchedItemIds.push({ id, title, contentMd });
      }
    } else if (m.entity === "highlight") {
      const id = String(p.id ?? m.entityId);
      const itemId = String(p.itemId);
      await db
        .insert(schema.highlights)
        .values({
          id,
          itemId,
          userId,
          quoteText: String(p.quoteText ?? ""),
          prefixContext: String(p.prefixContext ?? ""),
          suffixContext: String(p.suffixContext ?? ""),
          annotationMd: String(p.annotationMd ?? ""),
          color: String(p.color ?? "amber"),
          positionOffset: Number(p.positionOffset ?? 0),
          deletedAt: m.op === "delete" ? now : null,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: schema.highlights.id,
          set: {
            quoteText: String(p.quoteText ?? ""),
            annotationMd: String(p.annotationMd ?? ""),
            color: String(p.color ?? "amber"),
            deletedAt: m.op === "delete" ? now : null,
            updatedAt: now,
          },
        });
    } else if (m.entity === "tag") {
      const id = String(p.id ?? m.entityId);
      await db
        .insert(schema.tags)
        .values({
          id,
          userId,
          name: String(p.name ?? "Tag"),
          color: String(p.color ?? "#c87d1a"),
          category: String(p.category ?? "General"),
          deletedAt: m.op === "delete" ? now : null,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: schema.tags.id,
          set: {
            name: String(p.name ?? "Tag"),
            color: String(p.color ?? "#c87d1a"),
            category: String(p.category ?? "General"),
            deletedAt: m.op === "delete" ? now : null,
            updatedAt: now,
          },
        });
    } else if (m.entity === "itemTag") {
      const itemId = String(p.itemId);
      const tagId = String(p.tagId);
      if (m.op === "delete") {
        await db
          .delete(schema.itemTags)
          .where(
            and(
              eq(schema.itemTags.itemId, itemId),
              eq(schema.itemTags.tagId, tagId)
            )
          );
      } else {
        await db
          .insert(schema.itemTags)
          .values({ itemId, tagId, updatedAt: now })
          .onConflictDoNothing();
      }
    } else if (m.entity === "edge") {
      const id = String(p.id ?? m.entityId);
      await db
        .insert(schema.knowledgeEdges)
        .values({
          id,
          userId,
          sourceItemId: String(p.sourceItemId),
          targetItemId: String(p.targetItemId),
          relationType: (p.relationType as EdgeRelationType) ?? "related_to",
          weight: Number(p.weight ?? 1),
          aiGenerated: Boolean(p.aiGenerated ?? false),
          deletedAt: m.op === "delete" ? now : null,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: schema.knowledgeEdges.id,
          set: {
            relationType:
              (p.relationType as EdgeRelationType) ?? "related_to",
            weight: Number(p.weight ?? 1),
            deletedAt: m.op === "delete" ? now : null,
            updatedAt: now,
          },
        });
    }
  }

  // Reconcile [[wikilink]] edges automatically for touched notes/ideas
  if (touchedItemIds.length > 0) {
    const userItems = await db
      .select({
        id: schema.knowledgeItems.id,
        title: schema.knowledgeItems.title,
      })
      .from(schema.knowledgeItems)
      .where(eq(schema.knowledgeItems.userId, userId));

    const titleToId = new Map<string, string>();
    for (const row of userItems) {
      titleToId.set(row.title.toLowerCase().trim(), row.id);
    }

    for (const item of touchedItemIds) {
      const links = extractWikilinks(item.contentMd);
      for (const linkTitle of links) {
        const targetId = titleToId.get(linkTitle.toLowerCase().trim());
        if (targetId && targetId !== item.id) {
          const existingEdge = await db
            .select({ id: schema.knowledgeEdges.id })
            .from(schema.knowledgeEdges)
            .where(
              and(
                eq(schema.knowledgeEdges.userId, userId),
                eq(schema.knowledgeEdges.sourceItemId, item.id),
                eq(schema.knowledgeEdges.targetItemId, targetId)
              )
            )
            .limit(1);

          if (existingEdge.length === 0) {
            await db.insert(schema.knowledgeEdges).values({
              id: crypto.randomUUID(),
              userId,
              sourceItemId: item.id,
              targetItemId: targetId,
              relationType: "mentions",
              weight: 0.9,
              aiGenerated: false,
              createdAt: now,
              updatedAt: now,
            });
          }
        }
      }
    }
  }

  return NextResponse.json({
    ok: true,
    applied: parsed.data.mutations.length,
    serverTime: now.toISOString(),
  });
}
