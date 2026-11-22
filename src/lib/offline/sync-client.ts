import {
  getOfflineDb,
  type CerebroOfflineDb,
  type LocalHighlight,
  type LocalKnowledgeEdge,
  type LocalKnowledgeItem,
  type LocalTag,
  type OutboxMutation,
} from "./db";
import type {
  EdgeRelationType,
  KnowledgeItemType,
  KnowledgeMetadata,
} from "@/db/schema";

export interface SyncPullPayload {
  serverTime: string;
  items: LocalKnowledgeItem[];
  highlights: LocalHighlight[];
  tags: LocalTag[];
  itemTags: Array<{ itemId: string; tagId: string; updatedAt: string }>;
  edges: LocalKnowledgeEdge[];
}

export interface SyncStatus {
  isSyncing: boolean;
  pendingCount: number;
  lastSyncedAt: string | null;
  lastError: string | null;
}

export async function enqueueMutation(
  db: CerebroOfflineDb,
  mutation: Omit<OutboxMutation, "id" | "retries">
): Promise<void> {
  // Collapse redundant pending upserts for the same entityId
  const existing = await db.outbox
    .where("entityId")
    .equals(mutation.entityId)
    .and((row) => row.entity === mutation.entity)
    .toArray();

  if (existing.length > 0) {
    await db.outbox.bulkDelete(
      existing.map((r) => r.id).filter((id): id is number => id !== undefined)
    );
  }

  await db.outbox.add({
    ...mutation,
    retries: 0,
  });
}

export async function saveItemOfflineFirst(
  item: Partial<LocalKnowledgeItem> & {
    id?: string;
    userId: string;
    type: KnowledgeItemType;
    title: string;
  },
  db: CerebroOfflineDb = getOfflineDb()
): Promise<LocalKnowledgeItem> {
  const now = new Date().toISOString();
  const existing = item.id ? await db.items.get(item.id) : undefined;

  const record: LocalKnowledgeItem = {
    id: item.id ?? crypto.randomUUID(),
    userId: item.userId,
    type: item.type,
    title: item.title,
    contentMd: item.contentMd ?? existing?.contentMd ?? "",
    summary: item.summary ?? existing?.summary ?? "",
    sourceUrl: item.sourceUrl ?? existing?.sourceUrl ?? null,
    metadata: item.metadata ?? existing?.metadata ?? {},
    version: (existing?.version ?? 0) + 1,
    deletedAt: item.deletedAt ?? null,
    createdAt: existing?.createdAt ?? item.createdAt ?? now,
    updatedAt: now,
  };

  await db.transaction("rw", db.items, db.outbox, async () => {
    await db.items.put(record);
    await enqueueMutation(db, {
      entity: "item",
      entityId: record.id,
      op: record.deletedAt ? "delete" : "upsert",
      payload: record as unknown as Record<string, unknown>,
      clientTimestamp: now,
    });
  });

  return record;
}

export async function deleteItemOfflineFirst(
  itemId: string,
  db: CerebroOfflineDb = getOfflineDb()
): Promise<void> {
  const existing = await db.items.get(itemId);
  if (!existing) return;

  const now = new Date().toISOString();
  const tombstoned: LocalKnowledgeItem = {
    ...existing,
    deletedAt: now,
    updatedAt: now,
    version: existing.version + 1,
  };

  await db.transaction("rw", db.items, db.outbox, async () => {
    await db.items.put(tombstoned);
    await enqueueMutation(db, {
      entity: "item",
      entityId: itemId,
      op: "delete",
      payload: tombstoned as unknown as Record<string, unknown>,
      clientTimestamp: now,
    });
  });
}

export async function saveHighlightOfflineFirst(
  input: {
    id?: string;
    itemId: string;
    userId: string;
    quoteText: string;
    prefixContext?: string;
    suffixContext?: string;
    annotationMd?: string;
    color?: string;
    positionOffset?: number;
  },
  db: CerebroOfflineDb = getOfflineDb()
): Promise<LocalHighlight> {
  const now = new Date().toISOString();
  const existing = input.id ? await db.highlights.get(input.id) : undefined;
  const record: LocalHighlight = {
    id: input.id ?? crypto.randomUUID(),
    itemId: input.itemId,
    userId: input.userId,
    quoteText: input.quoteText,
    prefixContext: input.prefixContext ?? existing?.prefixContext ?? "",
    suffixContext: input.suffixContext ?? existing?.suffixContext ?? "",
    annotationMd: input.annotationMd ?? existing?.annotationMd ?? "",
    color: input.color ?? existing?.color ?? "amber",
    positionOffset: input.positionOffset ?? existing?.positionOffset ?? 0,
    deletedAt: null,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  await db.transaction("rw", db.highlights, db.outbox, async () => {
    await db.highlights.put(record);
    await enqueueMutation(db, {
      entity: "highlight",
      entityId: record.id,
      op: "upsert",
      payload: record as unknown as Record<string, unknown>,
      clientTimestamp: now,
    });
  });

  return record;
}

export async function saveTagOfflineFirst(
  input: {
    id?: string;
    userId: string;
    name: string;
    color?: string;
    category?: string;
  },
  db: CerebroOfflineDb = getOfflineDb()
): Promise<LocalTag> {
  const now = new Date().toISOString();
  const record: LocalTag = {
    id: input.id ?? crypto.randomUUID(),
    userId: input.userId,
    name: input.name.trim(),
    color: input.color ?? "#c87d1a",
    category: input.category ?? "General",
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
  };

  await db.transaction("rw", db.tags, db.outbox, async () => {
    await db.tags.put(record);
    await enqueueMutation(db, {
      entity: "tag",
      entityId: record.id,
      op: "upsert",
      payload: record as unknown as Record<string, unknown>,
      clientTimestamp: now,
    });
  });

  return record;
}

export async function toggleItemTagOfflineFirst(
  itemId: string,
  tagId: string,
  attach: boolean,
  db: CerebroOfflineDb = getOfflineDb()
): Promise<void> {
  const now = new Date().toISOString();
  const key = `${itemId}:${tagId}`;

  await db.transaction("rw", db.itemTags, db.outbox, async () => {
    if (attach) {
      await db.itemTags.put({ key, itemId, tagId, updatedAt: now });
    } else {
      await db.itemTags.delete(key);
    }
    await enqueueMutation(db, {
      entity: "itemTag",
      entityId: key,
      op: attach ? "upsert" : "delete",
      payload: { itemId, tagId, updatedAt: now },
      clientTimestamp: now,
    });
  });
}

export async function saveEdgeOfflineFirst(
  input: {
    id?: string;
    userId: string;
    sourceItemId: string;
    targetItemId: string;
    relationType?: EdgeRelationType;
    weight?: number;
    aiGenerated?: boolean;
  },
  db: CerebroOfflineDb = getOfflineDb()
): Promise<LocalKnowledgeEdge> {
  const now = new Date().toISOString();
  const record: LocalKnowledgeEdge = {
    id: input.id ?? crypto.randomUUID(),
    userId: input.userId,
    sourceItemId: input.sourceItemId,
    targetItemId: input.targetItemId,
    relationType: input.relationType ?? "related_to",
    weight: input.weight ?? 1,
    aiGenerated: input.aiGenerated ?? false,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
  };

  await db.transaction("rw", db.edges, db.outbox, async () => {
    await db.edges.put(record);
    await enqueueMutation(db, {
      entity: "edge",
      entityId: record.id,
      op: "upsert",
      payload: record as unknown as Record<string, unknown>,
      clientTimestamp: now,
    });
  });

  return record;
}

export async function applyServerPull(
  payload: SyncPullPayload,
  db: CerebroOfflineDb = getOfflineDb()
): Promise<void> {
  const pendingOutbox = await db.outbox.toArray();
  const pendingKeys = new Set(
    pendingOutbox.map((m) => `${m.entity}:${m.entityId}`)
  );

  await db.transaction(
    "rw",
    [db.items, db.highlights, db.tags, db.itemTags, db.edges, db.syncMeta],
    async () => {
      for (const item of payload.items) {
        if (!pendingKeys.has(`item:${item.id}`)) {
          await db.items.put(item);
        }
      }
      for (const highlight of payload.highlights) {
        if (!pendingKeys.has(`highlight:${highlight.id}`)) {
          await db.highlights.put(highlight);
        }
      }
      for (const tag of payload.tags) {
        if (!pendingKeys.has(`tag:${tag.id}`)) {
          await db.tags.put(tag);
        }
      }
      for (const it of payload.itemTags) {
        const key = `${it.itemId}:${it.tagId}`;
        if (!pendingKeys.has(`itemTag:${key}`)) {
          await db.itemTags.put({
            key,
            itemId: it.itemId,
            tagId: it.tagId,
            updatedAt: it.updatedAt,
          });
        }
      }
      for (const edge of payload.edges) {
        if (!pendingKeys.has(`edge:${edge.id}`)) {
          await db.edges.put(edge);
        }
      }
      await db.syncMeta.put({ key: "lastSyncedAt", value: payload.serverTime });
    }
  );
}

export async function syncWithServer(
  userId: string,
  db: CerebroOfflineDb = getOfflineDb()
): Promise<SyncStatus> {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    const pendingCount = await db.outbox.count();
    const meta = await db.syncMeta.get("lastSyncedAt");
    return {
      isSyncing: false,
      pendingCount,
      lastSyncedAt: meta?.value ?? null,
      lastError: null,
    };
  }

  const outbox = await db.outbox.orderBy("id").toArray();
  const lastMeta = await db.syncMeta.get("lastSyncedAt");
  const since = lastMeta?.value ?? "";

  try {
    if (outbox.length > 0) {
      const pushRes = await fetch("/api/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, mutations: outbox }),
      });

      if (!pushRes.ok) {
        throw new Error(`Sync push failed (${pushRes.status})`);
      }

      const ids = outbox
        .map((m) => m.id)
        .filter((id): id is number => id !== undefined);
      await db.outbox.bulkDelete(ids);
    }

    const pullRes = await fetch(
      `/api/sync${since ? `?since=${encodeURIComponent(since)}` : ""}`,
      { cache: "no-store" }
    );
    if (!pullRes.ok) {
      throw new Error(`Sync pull failed (${pullRes.status})`);
    }
    const payload = (await pullRes.json()) as SyncPullPayload;
    await applyServerPull(payload, db);

    return {
      isSyncing: false,
      pendingCount: await db.outbox.count(),
      lastSyncedAt: payload.serverTime,
      lastError: null,
    };
  } catch (err) {
    return {
      isSyncing: false,
      pendingCount: await db.outbox.count(),
      lastSyncedAt: lastMeta?.value ?? null,
      lastError: err instanceof Error ? err.message : "Sync failed",
    };
  }
}

export function computeIceScore(metadata: KnowledgeMetadata): number {
  const impact = Number(metadata.impact ?? 5);
  const confidence = Number(metadata.confidence ?? 5);
  const effort = Math.max(1, Number(metadata.effort ?? 5));
  return Number(((impact * confidence) / effort).toFixed(1));
}
