"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  getOfflineDb,
  type LocalHighlight,
  type LocalItemTag,
  type LocalKnowledgeEdge,
  type LocalKnowledgeItem,
  type LocalTag,
} from "@/lib/offline/db";
import { syncWithServer } from "@/lib/offline/sync-client";

export interface WorkspaceUser {
  id: string;
  name: string;
  email: string;
}

interface WorkspaceContextValue {
  user: WorkspaceUser;
  items: LocalKnowledgeItem[];
  highlights: LocalHighlight[];
  tags: LocalTag[];
  itemTags: LocalItemTag[];
  edges: LocalKnowledgeEdge[];
  isOnline: boolean;
  isSyncing: boolean;
  pendingCount: number;
  lastSyncedAt: string | null;
  lastSyncError: string | null;
  theme: "light" | "dark";
  toggleTheme: () => void;
  triggerSync: () => Promise<void>;
  getTagsForItem: (itemId: string) => LocalTag[];
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

function subscribeOnlineStatus(callback: () => void) {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

export function WorkspaceProvider({
  user,
  children,
}: {
  user: WorkspaceUser;
  children: ReactNode;
}) {
  const db = useMemo(() => getOfflineDb(), []);
  const isOnline = useSyncExternalStore(
    subscribeOnlineStatus,
    () => (typeof navigator !== "undefined" ? navigator.onLine : true),
    () => true
  );
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [lastSyncError, setLastSyncError] = useState<string | null>(null);
  const [theme, setTheme] = useState<"light" | "dark">("light");

  const rawItems = useLiveQuery(
    () =>
      db.items
        .where("userId")
        .equals(user.id)
        .filter((i) => !i.deletedAt)
        .toArray(),
    [db, user.id],
    []
  );

  const rawHighlights = useLiveQuery(
    () =>
      db.highlights
        .where("userId")
        .equals(user.id)
        .filter((h) => !h.deletedAt)
        .toArray(),
    [db, user.id],
    []
  );

  const rawTags = useLiveQuery(
    () =>
      db.tags
        .where("userId")
        .equals(user.id)
        .filter((t) => !t.deletedAt)
        .toArray(),
    [db, user.id],
    []
  );

  const rawItemTags = useLiveQuery(() => db.itemTags.toArray(), [db], []);

  const rawEdges = useLiveQuery(
    () =>
      db.edges
        .where("userId")
        .equals(user.id)
        .filter((e) => !e.deletedAt)
        .toArray(),
    [db, user.id],
    []
  );

  const pendingCount = useLiveQuery(() => db.outbox.count(), [db], 0);

  const items = useMemo(
    () =>
      [...rawItems].sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      ),
    [rawItems]
  );

  const triggerSync = useCallback(async () => {
    setIsSyncing(true);
    const status = await syncWithServer(user.id, db);
    setLastSyncedAt(status.lastSyncedAt);
    setLastSyncError(status.lastError);
    setIsSyncing(false);
  }, [db, user.id]);

  // Theme initialization
  useEffect(() => {
    const saved = localStorage.getItem("cerebro-theme");
    const preferred =
      saved === "dark" ||
      (!saved && window.matchMedia("(prefers-color-scheme: dark)").matches)
        ? "dark"
        : "light";
    document.documentElement.setAttribute("data-theme", preferred);
    const raf = window.requestAnimationFrame(() => setTheme(preferred));
    return () => window.cancelAnimationFrame(raf);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next = prev === "light" ? "dark" : "light";
      document.documentElement.setAttribute("data-theme", next);
      localStorage.setItem("cerebro-theme", next);
      return next;
    });
  }, []);

  // Automatic sync on mount, reconnect, and interval
  useEffect(() => {
    const handleOnline = () => {
      void triggerSync();
    };

    window.addEventListener("online", handleOnline);
    const initialTimer = window.setTimeout(() => {
      void triggerSync();
    }, 0);

    const interval = window.setInterval(() => {
      if (navigator.onLine) {
        void triggerSync();
      }
    }, 20000);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.clearTimeout(initialTimer);
      window.clearInterval(interval);
    };
  }, [triggerSync]);

  const tagMap = useMemo(() => {
    const map = new Map<string, LocalTag>();
    for (const tag of rawTags) {
      map.set(tag.id, tag);
    }
    return map;
  }, [rawTags]);

  const getTagsForItem = useCallback(
    (itemId: string): LocalTag[] => {
      return rawItemTags
        .filter((it) => it.itemId === itemId)
        .map((it) => tagMap.get(it.tagId))
        .filter((t): t is LocalTag => Boolean(t));
    },
    [rawItemTags, tagMap]
  );

  return (
    <WorkspaceContext.Provider
      value={{
        user,
        items,
        highlights: rawHighlights,
        tags: rawTags,
        itemTags: rawItemTags,
        edges: rawEdges,
        isOnline,
        isSyncing,
        pendingCount,
        lastSyncedAt,
        lastSyncError,
        theme,
        toggleTheme,
        triggerSync,
        getTagsForItem,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) {
    throw new Error("useWorkspace must be used inside WorkspaceProvider");
  }
  return ctx;
}
