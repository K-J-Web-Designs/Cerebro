"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowUpRight,
  BookMarked,
  Compass,
  FileText,
  Lightbulb,
  Network,
  Plus,
} from "lucide-react";
import { useWorkspace } from "@/components/workspace/WorkspaceProvider";
import {
  computeIceScore,
  saveItemOfflineFirst,
} from "@/lib/offline/sync-client";
import styles from "./workspace.module.css";

export default function WorkspaceOverviewPage() {
  const router = useRouter();
  const { user, items, highlights, edges, tags, triggerSync } = useWorkspace();

  const [quickTitle, setQuickTitle] = useState("");
  const [quickKind, setQuickKind] = useState<"note" | "idea" | "url">("note");
  const [capturing, setCapturing] = useState(false);

  const notes = items.filter((i) => i.type === "note");
  const readings = items.filter(
    (i) => i.type === "bookmark" || i.type === "paper"
  );
  const ideas = items
    .filter((i) => i.type === "idea")
    .sort(
      (a, b) => computeIceScore(b.metadata) - computeIceScore(a.metadata)
    );
  const topics = items.filter((i) => i.type === "topic");

  async function handleQuickCapture(e: React.FormEvent) {
    e.preventDefault();
    const val = quickTitle.trim();
    if (!val) return;
    setCapturing(true);

    try {
      if (quickKind === "url") {
        const res = await fetch("/api/read-later", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: val }),
        });
        if (res.ok) {
          const data = (await res.json()) as { item: { id: string } };
          await triggerSync();
          setQuickTitle("");
          router.push(`/workspace/read-later?id=${data.item.id}`);
          return;
        }
      }

      const created = await saveItemOfflineFirst({
        userId: user.id,
        type: quickKind === "idea" ? "idea" : "note",
        title: val,
        contentMd: "",
        summary: "",
        metadata:
          quickKind === "idea"
            ? {
                ideaStage: "spark",
                impact: 7,
                confidence: 6,
                effort: 4,
                iceScore: 10.5,
              }
            : {},
      });
      void triggerSync();
      setQuickTitle("");
      router.push(
        quickKind === "idea"
          ? `/workspace/ideas?id=${created.id}`
          : `/workspace/notes?id=${created.id}`
      );
    } finally {
      setCapturing(false);
    }
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.greeting}>Welcome back, {user.name}</p>
          <h1 className={styles.title}>Knowledge Studio</h1>
        </div>
        <div className={styles.headerLinks}>
          <Link href="/workspace/explore" className="btn">
            <Compass size={15} /> Explore Topic
          </Link>
          <Link href="/workspace/graph" className="btn btn-primary">
            <Network size={15} /> Open Graph
          </Link>
        </div>
      </header>

      {/* Quick Capture Bar */}
      <form onSubmit={handleQuickCapture} className={`card ${styles.captureCard}`}>
        <div className={styles.captureModes}>
          <button
            type="button"
            className={quickKind === "note" ? styles.modeActive : styles.modeBtn}
            onClick={() => setQuickKind("note")}
          >
            Note
          </button>
          <button
            type="button"
            className={quickKind === "idea" ? styles.modeActive : styles.modeBtn}
            onClick={() => setQuickKind("idea")}
          >
            Idea Spark
          </button>
          <button
            type="button"
            className={quickKind === "url" ? styles.modeActive : styles.modeBtn}
            onClick={() => setQuickKind("url")}
          >
            Read Later URL
          </button>
        </div>
        <div className={styles.captureRow}>
          <input
            id="overview-quick-capture"
            type={quickKind === "url" ? "url" : "text"}
            className="input"
            placeholder={
              quickKind === "url"
                ? "Paste an article or arXiv URL to clip for offline reading..."
                : quickKind === "idea"
                  ? "Capture an idea spark to develop in the Incubator..."
                  : "Start a new research note..."
            }
            value={quickTitle}
            onChange={(e) => setQuickTitle(e.target.value)}
          />
          <button
            type="submit"
            className="btn btn-primary"
            disabled={capturing || !quickTitle.trim()}
          >
            <Plus size={15} />
            {capturing ? "Saving..." : "Capture"}
          </button>
        </div>
      </form>

      {/* Metrics Strip */}
      <section className={styles.statsRow} aria-label="Workspace summary">
        <Link href="/workspace/notes" className={`card ${styles.statCard}`}>
          <FileText size={18} className={styles.amberIcon} />
          <div>
            <span className={styles.statVal}>{notes.length}</span>
            <span className={styles.statLabel}>Notes</span>
          </div>
        </Link>
        <Link href="/workspace/read-later" className={`card ${styles.statCard}`}>
          <BookMarked size={18} className={styles.tealIcon} />
          <div>
            <span className={styles.statVal}>{readings.length}</span>
            <span className={styles.statLabel}>
              Readings · {highlights.length} highlights
            </span>
          </div>
        </Link>
        <Link href="/workspace/ideas" className={`card ${styles.statCard}`}>
          <Lightbulb size={18} className={styles.terraIcon} />
          <div>
            <span className={styles.statVal}>{ideas.length}</span>
            <span className={styles.statLabel}>Incubated Ideas</span>
          </div>
        </Link>
        <Link href="/workspace/graph" className={`card ${styles.statCard}`}>
          <Network size={18} className={styles.sageIcon} />
          <div>
            <span className={styles.statVal}>{edges.length}</span>
            <span className={styles.statLabel}>
              Graph Links · {topics.length} maps · {tags.length} tags
            </span>
          </div>
        </Link>
      </section>

      {/* Two-Column Curated Panels */}
      <div className={styles.columns}>
        <section className={`card ${styles.panel}`}>
          <div className={styles.panelHead}>
            <h2>Recent Notes &amp; Readings</h2>
            <Link href="/workspace/notes" className={styles.panelLink}>
              View all <ArrowUpRight size={14} />
            </Link>
          </div>
          <div className={styles.itemList}>
            {items.slice(0, 5).map((item) => (
              <Link
                key={item.id}
                href={
                  item.type === "note"
                    ? `/workspace/notes?id=${item.id}`
                    : item.type === "idea"
                      ? `/workspace/ideas?id=${item.id}`
                      : item.type === "topic"
                        ? `/workspace/explore?id=${item.id}`
                        : `/workspace/read-later?id=${item.id}`
                }
                className={styles.itemRow}
              >
                <div>
                  <div className={styles.itemTitle}>{item.title}</div>
                  {item.summary && (
                    <p className={styles.itemSummary}>
                      {item.summary.slice(0, 110)}
                    </p>
                  )}
                </div>
                <span className="badge">{item.type}</span>
              </Link>
            ))}
            {items.length === 0 && (
              <p className={styles.empty}>
                Capture your first note, paper, or topic above.
              </p>
            )}
          </div>
        </section>

        <section className={`card ${styles.panel}`}>
          <div className={styles.panelHead}>
            <h2>Top Prioritized Ideas (ICE)</h2>
            <Link href="/workspace/ideas" className={styles.panelLink}>
              Open Incubator <ArrowUpRight size={14} />
            </Link>
          </div>
          <div className={styles.itemList}>
            {ideas.slice(0, 4).map((idea) => (
              <Link
                key={idea.id}
                href={`/workspace/ideas?id=${idea.id}`}
                className={styles.itemRow}
              >
                <div>
                  <div className={styles.itemTitle}>{idea.title}</div>
                  <p className={styles.itemSummary}>
                    Stage: {idea.metadata.ideaStage ?? "spark"}
                  </p>
                </div>
                <span className="badge badge-amber font-mono">
                  ICE {computeIceScore(idea.metadata)}
                </span>
              </Link>
            ))}
            {ideas.length === 0 && (
              <p className={styles.empty}>
                No ideas in the incubator yet. Capture a spark above!
              </p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
