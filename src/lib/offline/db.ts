import Dexie, { type Table } from "dexie";
import type {
  EdgeRelationType,
  KnowledgeItemType,
  KnowledgeMetadata,
} from "@/db/schema";

export interface LocalKnowledgeItem {
  id: string;
  userId: string;
  type: KnowledgeItemType;
  title: string;
  contentMd: string;
  summary: string;
  sourceUrl: string | null;
  metadata: KnowledgeMetadata;
  version: number;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LocalHighlight {
  id: string;
  itemId: string;
  userId: string;
  quoteText: string;
  prefixContext: string;
  suffixContext: string;
  annotationMd: string;
  color: string;
  positionOffset: number;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LocalTag {
  id: string;
  userId: string;
  name: string;
  color: string;
  category: string;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LocalItemTag {
  key: string; // `${itemId}:${tagId}`
  itemId: string;
  tagId: string;
  updatedAt: string;
}

export interface LocalKnowledgeEdge {
  id: string;
  userId: string;
  sourceItemId: string;
  targetItemId: string;
  relationType: EdgeRelationType;
  weight: number;
  aiGenerated: boolean;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type OutboxEntity = "item" | "highlight" | "tag" | "itemTag" | "edge";

export interface OutboxMutation {
  id?: number;
  entity: OutboxEntity;
  entityId: string;
  op: "upsert" | "delete";
  payload: Record<string, unknown>;
  clientTimestamp: string;
  retries: number;
}

export interface SyncMetaRecord {
  key: string;
  value: string;
}

export class CerebroOfflineDb extends Dexie {
  items!: Table<LocalKnowledgeItem, string>;
  highlights!: Table<LocalHighlight, string>;
  tags!: Table<LocalTag, string>;
  itemTags!: Table<LocalItemTag, string>;
  edges!: Table<LocalKnowledgeEdge, string>;
  outbox!: Table<OutboxMutation, number>;
  syncMeta!: Table<SyncMetaRecord, string>;

  constructor(name = "cerebro-workspace-v1") {
    super(name);
    this.version(1).stores({
      items: "id, userId, type, updatedAt, deletedAt",
      highlights: "id, itemId, userId, updatedAt, deletedAt",
      tags: "id, userId, name, updatedAt, deletedAt",
      itemTags: "key, itemId, tagId",
      edges: "id, userId, sourceItemId, targetItemId, updatedAt, deletedAt",
      outbox: "++id, entity, entityId, clientTimestamp",
      syncMeta: "key",
    });
  }
}

let dbInstance: CerebroOfflineDb | null = null;

export function getOfflineDb(): CerebroOfflineDb {
  if (!dbInstance) {
    dbInstance = new CerebroOfflineDb();
  }
  return dbInstance;
}
