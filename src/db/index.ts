import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import postgres from "postgres";
import { PGlite } from "@electric-sql/pglite";
import { mkdirSync } from "node:fs";
import path from "node:path";
import * as schema from "./schema";

type CerebroDb = ReturnType<typeof drizzlePostgres<typeof schema>>;

interface GlobalDbState {
  db?: CerebroDb;
  pglite?: PGlite;
  pgClient?: postgres.Sql;
  schemaReadyPromise?: Promise<void>;
}

const globalForDb = globalThis as unknown as {
  __cerebroDbState?: GlobalDbState;
};

function getState(): GlobalDbState {
  if (!globalForDb.__cerebroDbState) {
    globalForDb.__cerebroDbState = {};
  }
  return globalForDb.__cerebroDbState;
}

export function getDb(): CerebroDb {
  const state = getState();
  if (state.db) {
    return state.db;
  }

  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (databaseUrl) {
    const client = postgres(databaseUrl, {
      max: 10,
      prepare: false,
    });
    state.pgClient = client;
    state.db = drizzlePostgres(client, { schema });
    return state.db;
  }

  const isTest = Boolean(process.env.VITEST);
  if (isTest) {
    const pglite = new PGlite("memory://");
    state.pglite = pglite;
    state.db = drizzlePglite(pglite, { schema }) as unknown as CerebroDb;
    return state.db;
  }

  const dataDir = path.resolve(process.cwd(), ".cerebro-data", "pg");
  mkdirSync(dataDir, { recursive: true });
  const pglite = new PGlite(dataDir);
  state.pglite = pglite;
  state.db = drizzlePglite(pglite, { schema }) as unknown as CerebroDb;
  return state.db;
}

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT,
  image TEXT,
  role TEXT NOT NULL DEFAULT 'member',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS knowledge_items (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'note',
  title TEXT NOT NULL,
  content_md TEXT NOT NULL DEFAULT '',
  summary TEXT NOT NULL DEFAULT '',
  source_url TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  embedding JSONB,
  version INTEGER NOT NULL DEFAULT 1,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_items_user_updated ON knowledge_items (user_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_items_user_type ON knowledge_items (user_id, type);

CREATE TABLE IF NOT EXISTS highlights (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL REFERENCES knowledge_items(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  quote_text TEXT NOT NULL,
  prefix_context TEXT NOT NULL DEFAULT '',
  suffix_context TEXT NOT NULL DEFAULT '',
  annotation_md TEXT NOT NULL DEFAULT '',
  color TEXT NOT NULL DEFAULT 'amber',
  position_offset INTEGER NOT NULL DEFAULT 0,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_highlights_item ON highlights (item_id);
CREATE INDEX IF NOT EXISTS idx_highlights_user_updated ON highlights (user_id, updated_at);

CREATE TABLE IF NOT EXISTS tags (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#c87d1a',
  category TEXT NOT NULL DEFAULT 'General',
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tags_user_name ON tags (user_id, name);

CREATE TABLE IF NOT EXISTS item_tags (
  item_id TEXT NOT NULL REFERENCES knowledge_items(id) ON DELETE CASCADE,
  tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (item_id, tag_id)
);

CREATE TABLE IF NOT EXISTS knowledge_edges (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_item_id TEXT NOT NULL REFERENCES knowledge_items(id) ON DELETE CASCADE,
  target_item_id TEXT NOT NULL REFERENCES knowledge_items(id) ON DELETE CASCADE,
  relation_type TEXT NOT NULL DEFAULT 'related_to',
  weight REAL NOT NULL DEFAULT 1,
  ai_generated BOOLEAN NOT NULL DEFAULT FALSE,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_edges_user ON knowledge_edges (user_id);
CREATE INDEX IF NOT EXISTS idx_edges_source ON knowledge_edges (source_item_id);
CREATE INDEX IF NOT EXISTS idx_edges_target ON knowledge_edges (target_item_id);
`;

export async function ensureSchema(): Promise<CerebroDb> {
  const db = getDb();
  const state = getState();

  if (!state.schemaReadyPromise) {
    state.schemaReadyPromise = (async () => {
      if (state.pglite) {
        await state.pglite.exec(SCHEMA_SQL);
      } else if (state.pgClient) {
        await state.pgClient.unsafe(SCHEMA_SQL);
        // Attempt pgvector setup if available on external Postgres
        try {
          await state.pgClient.unsafe(
            `CREATE EXTENSION IF NOT EXISTS vector;`
          );
        } catch {
          // pgvector extension optional if not installed on host
        }
      }
    })();
  }

  await state.schemaReadyPromise;
  return db;
}

export async function resetTestDatabase(): Promise<void> {
  const state = getState();
  if (state.pglite) {
    await state.pglite.exec(`
      TRUNCATE TABLE knowledge_edges, item_tags, tags, highlights, knowledge_items, users CASCADE;
    `);
  }
}

export { schema };
