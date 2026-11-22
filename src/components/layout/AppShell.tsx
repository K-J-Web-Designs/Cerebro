"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import {
  BookMarked,
  Compass,
  FileText,
  Home,
  Lightbulb,
  LogOut,
  Menu,
  Moon,
  Network,
  Plus,
  RefreshCw,
  Search,
  Sun,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";
import { useWorkspace } from "@/components/workspace/WorkspaceProvider";
import { saveItemOfflineFirst } from "@/lib/offline/sync-client";
import styles from "./AppShell.module.css";

const NAV_ITEMS = [
  { href: "/workspace", label: "Overview", icon: Home },
  { href: "/workspace/notes", label: "Notes", icon: FileText },
  { href: "/workspace/read-later", label: "Read Later", icon: BookMarked },
  { href: "/workspace/explore", label: "Topic Explorer", icon: Compass },
  { href: "/workspace/graph", label: "Knowledge Graph", icon: Network },
  { href: "/workspace/ideas", label: "Idea Incubator", icon: Lightbulb },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const {
    user,
    items,
    tags,
    isOnline,
    isSyncing,
    pendingCount,
    theme,
    toggleTheme,
    triggerSync,
  } = useWorkspace();

  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [serverHits, setServerHits] = useState<
    Array<{ id: string; title: string; type: string; summary: string; score: number }>
  >([]);

  // Keyboard shortcut Cmd/Ctrl+K for Command Palette
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen((prev) => !prev);
      } else if (e.key === "Escape") {
        setSearchOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Debounced hybrid search on server when online
  useEffect(() => {
    if (!searchOpen || !searchQuery.trim() || !isOnline) {
      return;
    }
    const timer = window.setTimeout(async () => {
      try {
        const res = await fetch("/api/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: searchQuery, limit: 8 }),
        });
        if (res.ok) {
          const data = (await res.json()) as {
            hits: Array<{
              score: number;
              item: { id: string; title: string; type: string; summary: string };
            }>;
          };
          setServerHits(
            data.hits.map((h) => ({
              ...h.item,
              score: h.score,
            }))
          );
        }
      } catch {
        // Offline local results remain visible
      }
    }, 180);

    return () => window.clearTimeout(timer);
  }, [searchOpen, searchQuery, isOnline]);

  const localHits = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return items.slice(0, 6);
    return items
      .filter(
        (i) =>
          i.title.toLowerCase().includes(q) ||
          i.summary.toLowerCase().includes(q) ||
          i.contentMd.toLowerCase().includes(q)
      )
      .slice(0, 8);
  }, [items, searchQuery]);

  const mergedHits = useMemo(() => {
    if (!searchOpen || !searchQuery.trim() || !isOnline || serverHits.length === 0) {
      return localHits;
    }
    const seen = new Set(localHits.map((i) => i.id));
    const extra = serverHits.filter((s) => !seen.has(s.id));
    return [...localHits, ...extra].slice(0, 8);
  }, [localHits, serverHits, searchQuery, searchOpen, isOnline]);

  function navigateToItem(id: string, type: string) {
    setSearchOpen(false);
    setSearchQuery("");
    if (type === "note") {
      router.push(`/workspace/notes?id=${id}`);
    } else if (type === "bookmark" || type === "paper") {
      router.push(`/workspace/read-later?id=${id}`);
    } else if (type === "idea") {
      router.push(`/workspace/ideas?id=${id}`);
    } else if (type === "topic") {
      router.push(`/workspace/explore?id=${id}`);
    } else {
      router.push(`/workspace/graph`);
    }
  }

  async function handleQuickNote() {
    const created = await saveItemOfflineFirst({
      userId: user.id,
      type: "note",
      title: "Untitled Note",
      contentMd: "",
      summary: "",
    });
    void triggerSync();
    router.push(`/workspace/notes?id=${created.id}`);
  }

  return (
    <div className={styles.layout}>
      {/* Mobile Header */}
      <header className={styles.mobileBar}>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => setMobileOpen(true)}
          aria-label="Open navigation"
        >
          <Menu size={18} />
        </button>
        <Link href="/workspace" className={styles.mobileBrand}>
          <img src="/icon.svg" alt="Cerebro" width={22} height={22} />
          <span>Cerebro</span>
        </Link>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => setSearchOpen(true)}
          aria-label="Search workspace"
        >
          <Search size={18} />
        </button>
      </header>

      {/* Sidebar */}
      <aside
        className={`${styles.sidebar} ${mobileOpen ? styles.sidebarOpen : ""}`}
      >
        <div className={styles.sidebarHeader}>
          <Link href="/workspace" className={styles.brandLink}>
            <img src="/icon.svg" alt="Cerebro" width={28} height={28} />
            <div>
              <span className={styles.brandName}>Cerebro</span>
              <span className={styles.brandSub}>Knowledge OS</span>
            </div>
          </Link>
          <button
            type="button"
            className={`btn btn-ghost btn-sm ${styles.closeMobile}`}
            onClick={() => setMobileOpen(false)}
            aria-label="Close navigation"
          >
            <X size={16} />
          </button>
        </div>

        <div className={styles.quickActions}>
          <button
            id="quick-search-btn"
            type="button"
            className={styles.searchTrigger}
            onClick={() => setSearchOpen(true)}
          >
            <Search size={14} />
            <span>Search knowledge...</span>
            <kbd className="font-mono">⌘K</kbd>
          </button>
          <button
            id="quick-new-note-btn"
            type="button"
            className="btn btn-primary btn-sm"
            onClick={handleQuickNote}
            title="New Note"
          >
            <Plus size={15} />
          </button>
        </div>

        <nav className={styles.nav} aria-label="Workspace navigation">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active =
              item.href === "/workspace"
                ? pathname === "/workspace"
                : pathname.startsWith(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={active ? styles.navItemActive : styles.navItem}
                onClick={() => setMobileOpen(false)}
              >
                <Icon size={17} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className={styles.tagSection}>
          <div className={styles.sectionLabel}>Topics &amp; Tags</div>
          <div className={styles.tagList}>
            {tags.slice(0, 8).map((tag) => (
              <Link
                key={tag.id}
                href={`/workspace/notes?tag=${encodeURIComponent(tag.id)}`}
                className={styles.tagChip}
                onClick={() => setMobileOpen(false)}
              >
                <span
                  className={styles.tagDot}
                  style={{ backgroundColor: tag.color }}
                />
                <span>{tag.name}</span>
              </Link>
            ))}
            {tags.length === 0 && (
              <span className={styles.emptyTags}>No tags yet</span>
            )}
          </div>
        </div>

        <div className={styles.sidebarFooter}>
          <div className={styles.syncStatusRow}>
            <span className={styles.statusIndicator}>
              {isOnline ? (
                <Wifi size={14} className={styles.onlineIcon} />
              ) : (
                <WifiOff size={14} className={styles.offlineIcon} />
              )}
              <span>
                {!isOnline
                  ? "Offline mode"
                  : pendingCount > 0
                    ? `${pendingCount} pending sync`
                    : "Synced"}
              </span>
            </span>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => void triggerSync()}
              disabled={!isOnline || isSyncing}
              title="Sync now"
              aria-label="Sync now"
            >
              <RefreshCw
                size={14}
                className={isSyncing ? styles.spinning : ""}
              />
            </button>
          </div>

          <div className={styles.userRow}>
            <div className={styles.userMeta}>
              <span className={styles.userName}>{user.name}</span>
              <span className={styles.userEmail}>{user.email}</span>
            </div>
            <div className={styles.userActions}>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={toggleTheme}
                aria-label="Toggle color theme"
                title="Toggle light/dark theme"
              >
                {theme === "light" ? <Moon size={15} /> : <Sun size={15} />}
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={async () => {
                  const supabase = createBrowserSupabaseClient();
                  if (supabase) {
                    await supabase.auth.signOut();
                  } else {
                    await fetch("/api/auth/local-demo", { method: "DELETE" });
                  }
                  router.push("/");
                  router.refresh();
                }}
                aria-label="Sign out"
                title="Sign out"
              >
                <LogOut size={15} />
              </button>
            </div>
          </div>
        </div>
      </aside>

      {mobileOpen && (
        <div
          className={styles.backdrop}
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Main Content */}
      <main className={styles.main}>{children}</main>

      {/* Command Palette Modal */}
      {searchOpen && (
        <div
          className={styles.modalBackdrop}
          onClick={() => setSearchOpen(false)}
        >
          <div
            className={styles.commandModal}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label="Search Cerebro"
          >
            <div className={styles.commandInputRow}>
              <Search size={17} />
              <input
                id="command-palette-input"
                type="text"
                autoFocus
                placeholder="Search notes, papers, ideas, or semantic concepts..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setSearchOpen(false)}
              >
                Esc
              </button>
            </div>
            <div className={styles.commandResults}>
              {mergedHits.length === 0 ? (
                <p className={styles.commandEmpty}>
                  No matching knowledge items found.
                </p>
              ) : (
                mergedHits.map((hit) => (
                  <button
                    key={hit.id}
                    type="button"
                    className={styles.commandItem}
                    onClick={() => navigateToItem(hit.id, hit.type)}
                  >
                    <div className={styles.commandItemHeader}>
                      <span className={styles.commandItemTitle}>
                        {hit.title}
                      </span>
                      <span className="badge">{hit.type}</span>
                    </div>
                    {hit.summary && (
                      <p className={styles.commandItemSummary}>
                        {hit.summary.slice(0, 120)}
                      </p>
                    )}
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
