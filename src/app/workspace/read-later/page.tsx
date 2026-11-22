"use client";

import { Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  BookMarked,
  Check,
  ExternalLink,
  Highlighter,
  Lightbulb,
  Link2,
  Plus,
  Trash2,
} from "lucide-react";
import { useWorkspace } from "@/components/workspace/WorkspaceProvider";
import {
  deleteItemOfflineFirst,
  saveEdgeOfflineFirst,
  saveHighlightOfflineFirst,
  saveItemOfflineFirst,
} from "@/lib/offline/sync-client";
import type { ReadingStatus } from "@/db/schema";
import styles from "./read-later.module.css";

function ReadLaterInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedId = searchParams.get("id");
  const sharedUrl = searchParams.get("url");
  const sharedTitle = searchParams.get("title");

  const { user, items, highlights, triggerSync } = useWorkspace();

  const readings = useMemo(
    () => items.filter((i) => i.type === "bookmark" || i.type === "paper"),
    [items]
  );

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const effectiveSelectedId = selectedId ?? requestedId;
  const [statusFilter, setStatusFilter] = useState<"all" | ReadingStatus>("all");
  const [urlInput, setUrlInput] = useState(sharedUrl ?? "");
  const [manualMode, setManualMode] = useState(false);
  const [manualTitle, setManualTitle] = useState(sharedTitle ?? "");
  const [manualText, setManualText] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const [readerFont, setReaderFont] = useState<"serif" | "sans">("serif");
  const [selectedQuote, setSelectedQuote] = useState("");
  const [annotationDraft, setAnnotationDraft] = useState("");
  const [highlightColor, setHighlightColor] = useState<"amber" | "teal" | "sage">(
    "amber"
  );

  const filteredReadings = useMemo(() => {
    return readings.filter((r) => {
      if (statusFilter === "all") return true;
      return (r.metadata.readingStatus ?? "unread") === statusFilter;
    });
  }, [readings, statusFilter]);

  const activeItem = useMemo(
    () =>
      readings.find((r) => r.id === effectiveSelectedId) ??
      filteredReadings[0] ??
      null,
    [readings, effectiveSelectedId, filteredReadings]
  );

  const activeHighlights = useMemo(
    () =>
      activeItem
        ? highlights.filter((h) => h.itemId === activeItem.id)
        : [],
    [highlights, activeItem]
  );

  async function handleSaveReading(e: React.FormEvent) {
    e.preventDefault();
    setNotice(null);
    setSaving(true);
    try {
      const payload = manualMode
        ? {
            title: manualTitle.trim() || "Saved Excerpt",
            content: manualText.trim(),
            url: urlInput.trim() || undefined,
          }
        : {
            url: urlInput.trim(),
            title: manualTitle.trim() || undefined,
          };

      const res = await fetch("/api/read-later", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as {
        error?: string;
        notice?: string;
        item?: { id: string };
      };
      if (!res.ok) {
        setNotice(data.error ?? "Unable to save reading.");
        return;
      }
      if (data.notice) setNotice(data.notice);
      await triggerSync();
      if (data.item?.id) setSelectedId(data.item.id);
      setUrlInput("");
      setManualTitle("");
      setManualText("");
      setManualMode(false);
    } finally {
      setSaving(false);
    }
  }

  function handleTextSelection() {
    const sel = window.getSelection()?.toString().trim();
    if (sel && sel.length >= 6) {
      setSelectedQuote(sel);
    }
  }

  async function handleCreateHighlight(e: React.FormEvent) {
    e.preventDefault();
    if (!activeItem || !selectedQuote.trim()) return;
    await saveHighlightOfflineFirst({
      itemId: activeItem.id,
      userId: user.id,
      quoteText: selectedQuote.trim(),
      annotationMd: annotationDraft.trim(),
      color: highlightColor,
    });
    setSelectedQuote("");
    setAnnotationDraft("");
    void triggerSync();
  }

  async function handleStatusChange(nextStatus: ReadingStatus) {
    if (!activeItem) return;
    await saveItemOfflineFirst({
      ...activeItem,
      metadata: {
        ...activeItem.metadata,
        readingStatus: nextStatus,
      },
    });
    void triggerSync();
  }

  async function promoteHighlight(
    quote: string,
    annotation: string,
    targetType: "note" | "idea"
  ) {
    if (!activeItem) return;
    const created = await saveItemOfflineFirst({
      userId: user.id,
      type: targetType,
      title: `${targetType === "idea" ? "Idea from" : "Notes on"}: ${activeItem.title.slice(0, 48)}`,
      contentMd: `> "${quote}"\n\n${annotation ? `${annotation}\n\n` : ""}Source: [[${activeItem.title}]]`,
      summary: annotation || quote.slice(0, 140),
      metadata:
        targetType === "idea"
          ? {
              ideaStage: "spark",
              impact: 7,
              confidence: 7,
              effort: 4,
              iceScore: 12.3,
            }
          : {},
    });
    await saveEdgeOfflineFirst({
      userId: user.id,
      sourceItemId: created.id,
      targetItemId: activeItem.id,
      relationType: "derived_from",
    });
    void triggerSync();
    router.push(
      targetType === "idea"
        ? `/workspace/ideas?id=${created.id}`
        : `/workspace/notes?id=${created.id}`
    );
  }

  return (
    <div className={styles.page}>
      {/* Clipper Header */}
      <form onSubmit={handleSaveReading} className={`card ${styles.clipperCard}`}>
        <div className={styles.clipperTop}>
          <div>
            <h1>Read Later</h1>
            <p className={styles.sub}>
              Clip web articles or arXiv papers for offline reading, highlights,
              and annotations.
            </p>
          </div>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => setManualMode((v) => !v)}
          >
            {manualMode ? "Clip by URL" : "Paste Excerpt Manually"}
          </button>
        </div>

        <div className={styles.clipperInputs}>
          {!manualMode ? (
            <input
              id="read-later-url-input"
              type="url"
              className="input"
              placeholder="https://arxiv.org/abs/2404.16130 or any article URL..."
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              required
            />
          ) : (
            <div className={styles.manualFields}>
              <input
                type="text"
                className="input"
                placeholder="Article or paper title"
                value={manualTitle}
                onChange={(e) => setManualTitle(e.target.value)}
                required
              />
              <textarea
                className="textarea"
                rows={3}
                placeholder="Paste article or paper text..."
                value={manualText}
                onChange={(e) => setManualText(e.target.value)}
                required
              />
            </div>
          )}
          <button
            id="save-reading-btn"
            type="submit"
            className="btn btn-primary"
            disabled={saving}
          >
            <Plus size={15} />
            {saving ? "Clipping..." : "Save to Queue"}
          </button>
        </div>
        {notice && <p className={styles.notice}>{notice}</p>}
      </form>

      <div className={styles.columns}>
        {/* Reading Queue */}
        <aside className={`card ${styles.queuePane}`}>
          <div className={styles.filterTabs}>
            {(["all", "unread", "reading", "archived"] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                className={
                  statusFilter === tab ? styles.filterActive : styles.filterBtn
                }
                onClick={() => setStatusFilter(tab)}
              >
                {tab}
              </button>
            ))}
          </div>

          <div className={styles.queueList}>
            {filteredReadings.map((item) => {
              const selected = activeItem?.id === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  className={selected ? styles.queueItemActive : styles.queueItem}
                  onClick={() => setSelectedId(item.id)}
                >
                  <div className={styles.queueTitle}>{item.title}</div>
                  <div className={styles.queueMeta}>
                    <span>{item.metadata.siteName ?? item.type}</span>
                    {item.metadata.readingTimeMinutes && (
                      <span>{item.metadata.readingTimeMinutes} min</span>
                    )}
                  </div>
                </button>
              );
            })}
            {filteredReadings.length === 0 && (
              <p className={styles.emptyQueue}>No saved items in this view.</p>
            )}
          </div>
        </aside>

        {/* Clean Reader + Highlights */}
        <section className={`card ${styles.readerPane}`}>
          {activeItem ? (
            <div className={styles.readerGrid}>
              <article
                className={styles.articleBody}
                onMouseUp={handleTextSelection}
              >
                <div className={styles.readerToolbar}>
                  <span className="badge badge-teal">{activeItem.type}</span>
                  <select
                    className="select"
                    style={{ width: "auto", padding: "0.25rem 0.5rem", fontSize: "0.8rem" }}
                    value={activeItem.metadata.readingStatus ?? "unread"}
                    onChange={(e) =>
                      void handleStatusChange(e.target.value as ReadingStatus)
                    }
                    aria-label="Reading status"
                  >
                    <option value="unread">Unread</option>
                    <option value="reading">Reading</option>
                    <option value="archived">Archived</option>
                  </select>
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() =>
                      setReaderFont((f) => (f === "serif" ? "sans" : "serif"))
                    }
                  >
                    Font: {readerFont === "serif" ? "Serif" : "Sans"}
                  </button>
                  {activeItem.sourceUrl && (
                    <a
                      href={activeItem.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="btn btn-sm"
                    >
                      Source <ExternalLink size={13} />
                    </a>
                  )}
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={async () => {
                      await deleteItemOfflineFirst(activeItem.id);
                      setSelectedId(null);
                      void triggerSync();
                    }}
                    aria-label="Remove reading"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>

                <h2 className={styles.articleTitle}>{activeItem.title}</h2>
                <div className={styles.articleByline}>
                  {activeItem.metadata.authors?.length
                    ? activeItem.metadata.authors.join(", ")
                    : activeItem.metadata.siteName ?? "Saved Article"}
                  {activeItem.metadata.publishedAt
                    ? ` · ${activeItem.metadata.publishedAt}`
                    : ""}
                </div>

                {activeItem.summary && (
                  <div className={styles.summaryBox}>
                    <strong>Executive Summary</strong>
                    <p>{activeItem.summary}</p>
                  </div>
                )}

                <div
                  className={
                    readerFont === "serif"
                      ? styles.proseSerif
                      : styles.proseSans
                  }
                >
                  {activeItem.contentMd
                    .split(/\n{2,}/)
                    .filter(Boolean)
                    .map((para, idx) => (
                      <p key={idx}>{para}</p>
                    ))}
                </div>
              </article>

              {/* Annotations & Highlight Drawer */}
              <aside className={styles.annotationsPane}>
                <div className={styles.annotationsHead}>
                  <Highlighter size={16} />
                  <h3>Highlights &amp; Notes ({activeHighlights.length})</h3>
                </div>

                <form
                  onSubmit={handleCreateHighlight}
                  className={styles.highlightForm}
                >
                  <textarea
                    id="highlight-quote-input"
                    className="textarea"
                    rows={2}
                    placeholder="Select text in the article or paste a quote to highlight..."
                    value={selectedQuote}
                    onChange={(e) => setSelectedQuote(e.target.value)}
                  />
                  <textarea
                    id="highlight-annotation-input"
                    className="textarea"
                    rows={2}
                    placeholder="Add your margin annotation..."
                    value={annotationDraft}
                    onChange={(e) => setAnnotationDraft(e.target.value)}
                  />
                  <div className={styles.highlightActions}>
                    <div className={styles.colorPickers}>
                      {(["amber", "teal", "sage"] as const).map((c) => (
                        <button
                          key={c}
                          type="button"
                          className={
                            highlightColor === c
                              ? styles.colorDotActive
                              : styles.colorDot
                          }
                          data-color={c}
                          onClick={() => setHighlightColor(c)}
                          aria-label={`Highlight color ${c}`}
                        />
                      ))}
                    </div>
                    <button
                      id="save-highlight-btn"
                      type="submit"
                      className="btn btn-primary btn-sm"
                      disabled={!selectedQuote.trim()}
                    >
                      <Check size={14} /> Save Highlight
                    </button>
                  </div>
                </form>

                <div className={styles.highlightList}>
                  {activeHighlights.map((h) => (
                    <div
                      key={h.id}
                      className={styles.highlightCard}
                      data-color={h.color}
                    >
                      <blockquote>&ldquo;{h.quoteText}&rdquo;</blockquote>
                      {h.annotationMd && (
                        <p className={styles.annotationText}>
                          {h.annotationMd}
                        </p>
                      )}
                      <div className={styles.promoteRow}>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() =>
                            void promoteHighlight(
                              h.quoteText,
                              h.annotationMd,
                              "note"
                            )
                          }
                        >
                          <Link2 size={13} /> To Note
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() =>
                            void promoteHighlight(
                              h.quoteText,
                              h.annotationMd,
                              "idea"
                            )
                          }
                        >
                          <Lightbulb size={13} /> To Idea
                        </button>
                      </div>
                    </div>
                  ))}
                  {activeHighlights.length === 0 && (
                    <p className={styles.emptyHighlights}>
                      Highlight passages while reading to build durable research
                      memory.
                    </p>
                  )}
                </div>
              </aside>
            </div>
          ) : (
            <div className={styles.emptyReader}>
              <BookMarked size={28} />
              <p>Clip an article URL above to start reading offline.</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

export default function ReadLaterPage() {
  return (
    <Suspense fallback={<div>Loading Read Later...</div>}>
      <ReadLaterInner />
    </Suspense>
  );
}
