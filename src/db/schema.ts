import {
  pgTable,
  text,
  integer,
  boolean,
  real,
  timestamp,
  jsonb,
  primaryKey,
  index,
} from "drizzle-orm/pg-core";

export type KnowledgeItemType =
  | "note"
  | "idea"
  | "bookmark"
  | "paper"
  | "topic";

export type EdgeRelationType =
  | "related_to"
  | "cites"
  | "expands"
  | "contradicts"
  | "derived_from"
  | "mentions";

export type IdeaStage =
  | "spark"
  | "exploring"
  | "validated"
  | "actionable"
  | "archived";

export type ReadingStatus = "unread" | "reading" | "archived";

export interface KnowledgeMetadata {
  // Read Later / Paper fields
  authors?: string[];
  siteName?: string;
  publishedAt?: string;
  wordCount?: number;
  readingTimeMinutes?: number;
  readingStatus?: ReadingStatus;
  extractedHtml?: string;
  doi?: string;
  arxivId?: string;
  citationCount?: number;

  // Idea Incubator fields
  ideaStage?: IdeaStage;
  impact?: number; // 1-10
  confidence?: number; // 1-10
  effort?: number; // 1-10
  iceScore?: number;
  aiSuggestions?: Array<{
    id: string;
    kind: "angle" | "critique" | "question" | "connection";
    text: string;
    createdAt: string;
  }>;

  // Topic Explorer mind-map snapshot
  mindMapNodes?: Array<{
    id: string;
    label: string;
    kind: "root" | "concept" | "paper" | "note";
    summary?: string;
    url?: string;
    authors?: string[];
    year?: number;
    parentId?: string;
  }>;

  [key: string]: unknown;
}

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash"),
  image: text("image"),
  role: text("role").notNull().default("member"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const knowledgeItems = pgTable(
  "knowledge_items",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").$type<KnowledgeItemType>().notNull().default("note"),
    title: text("title").notNull(),
    contentMd: text("content_md").notNull().default(""),
    summary: text("summary").notNull().default(""),
    sourceUrl: text("source_url"),
    metadata: jsonb("metadata").$type<KnowledgeMetadata>().notNull().default({}),
    embedding: jsonb("embedding").$type<number[] | null>(),
    version: integer("version").notNull().default(1),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_items_user_updated").on(table.userId, table.updatedAt),
    index("idx_items_user_type").on(table.userId, table.type),
  ]
);

export const highlights = pgTable(
  "highlights",
  {
    id: text("id").primaryKey(),
    itemId: text("item_id")
      .notNull()
      .references(() => knowledgeItems.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    quoteText: text("quote_text").notNull(),
    prefixContext: text("prefix_context").notNull().default(""),
    suffixContext: text("suffix_context").notNull().default(""),
    annotationMd: text("annotation_md").notNull().default(""),
    color: text("color").notNull().default("amber"),
    positionOffset: integer("position_offset").notNull().default(0),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_highlights_item").on(table.itemId),
    index("idx_highlights_user_updated").on(table.userId, table.updatedAt),
  ]
);

export const tags = pgTable(
  "tags",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    color: text("color").notNull().default("#c87d1a"),
    category: text("category").notNull().default("General"),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("idx_tags_user_name").on(table.userId, table.name)]
);

export const itemTags = pgTable(
  "item_tags",
  {
    itemId: text("item_id")
      .notNull()
      .references(() => knowledgeItems.id, { onDelete: "cascade" }),
    tagId: text("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.itemId, table.tagId] })]
);

export const knowledgeEdges = pgTable(
  "knowledge_edges",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    sourceItemId: text("source_item_id")
      .notNull()
      .references(() => knowledgeItems.id, { onDelete: "cascade" }),
    targetItemId: text("target_item_id")
      .notNull()
      .references(() => knowledgeItems.id, { onDelete: "cascade" }),
    relationType: text("relation_type")
      .$type<EdgeRelationType>()
      .notNull()
      .default("related_to"),
    weight: real("weight").notNull().default(1),
    aiGenerated: boolean("ai_generated").notNull().default(false),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_edges_user").on(table.userId),
    index("idx_edges_source").on(table.sourceItemId),
    index("idx_edges_target").on(table.targetItemId),
  ]
);

export type UserRow = typeof users.$inferSelect;
export type KnowledgeItemRow = typeof knowledgeItems.$inferSelect;
export type HighlightRow = typeof highlights.$inferSelect;
export type TagRow = typeof tags.$inferSelect;
export type KnowledgeEdgeRow = typeof knowledgeEdges.$inferSelect;
