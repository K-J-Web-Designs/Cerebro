"use client";

import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { FileText, Link2, Plus, Tag, Trash2 } from "lucide-react";
import { useWorkspace } from "@/components/workspace/WorkspaceProvider";
import { NoteEditor } from "@/components/notes/NoteEditor";
import {
  deleteItemOfflineFirst,
  saveItemOfflineFirst,
  saveTagOfflineFirst,
  toggleItemTagOfflineFirst,
} from "@/lib/offline/sync-client";
import { extractWikilinks } from "@/lib/wikilinks";
import styles from "./notes.module.css";

function NotesWorkspaceInner() {
  const searchParams = useSearchParams();
  const requestedId = searchParams.get("id");
  const requestedTag = searchParams.get("tag");

  const {
    user,
    items,
    tags,
    edges,
    getTagsForItem,
    triggerSync,
  } = useWorkspace();

  const notes = useMemo(
    () => items.filter((i) => i.type === "note"),
    [items]
  );

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filterText, setFilterText] = useState("");
  const [tagOverride, setTagOverride] = useState<string | null | undefined>(
    undefined
  );
  const [newTagName, setNewTagName] = useState("");

  const activeTagFilter =
    tagOverride === undefined ? requestedTag : tagOverride;
  const effectiveSelectedId = selectedId ?? requestedId;

  const filteredNotes = useMemo(() => {
    const q = filterText.trim().toLowerCase();
    return notes.filter((n) => {
      if (activeTagFilter) {
        const itemTagIds = new Set(getTagsForItem(n.id).map((t) => t.id));
        if (!itemTagIds.has(activeTagFilter)) return false;
      }
      if (!q) return true;
      return (
        n.title.toLowerCase().includes(q) ||
        n.contentMd.toLowerCase().includes(q)
      );
    });
  }, [notes, filterText, activeTagFilter, getTagsForItem]);

  const activeNote = useMemo(
    () =>
      notes.find((n) => n.id === effectiveSelectedId) ??
      filteredNotes[0] ??
      null,
    [notes, effectiveSelectedId, filteredNotes]
  );

  const [titleDraft, setTitleDraft] = useState<{
    id: string;
    value: string;
  } | null>(null);
  const draftTitle =
    activeNote && titleDraft?.id === activeNote.id
      ? titleDraft.value
      : (activeNote?.title ?? "");

  const linkableTitles = useMemo(
    () =>
      items
        .filter((i) => i.id !== activeNote?.id)
        .map((i) => i.title),
    [items, activeNote?.id]
  );

  const backlinks = useMemo(() => {
    if (!activeNote) return [];
    const incomingIds = new Set(
      edges
        .filter((e) => e.targetItemId === activeNote.id)
        .map((e) => e.sourceItemId)
    );
    const outgoingIds = new Set(
      edges
        .filter((e) => e.sourceItemId === activeNote.id)
        .map((e) => e.targetItemId)
    );
    const wikilinkTitles = new Set(
      extractWikilinks(activeNote.contentMd).map((t) => t.toLowerCase())
    );
    return items.filter(
      (i) =>
        i.id !== activeNote.id &&
        (incomingIds.has(i.id) ||
          outgoingIds.has(i.id) ||
          wikilinkTitles.has(i.title.toLowerCase()))
    );
  }, [activeNote, edges, items]);

  async function handleCreateNote() {
    const created = await saveItemOfflineFirst({
      userId: user.id,
      type: "note",
      title: "Untitled Note",
      contentMd: "",
      summary: "",
    });
    setSelectedId(created.id);
    setTitleDraft({ id: created.id, value: created.title });
    void triggerSync();
  }

  async function handleTitleBlur() {
    if (!activeNote) return;
    const clean = draftTitle.trim() || "Untitled Note";
    if (clean === activeNote.title) return;
    await saveItemOfflineFirst({
      ...activeNote,
      title: clean,
    });
    void triggerSync();
  }

  async function handleEditorChange(textContent: string) {
    if (!activeNote) return;
    const summary = textContent.replace(/\s+/g, " ").trim().slice(0, 180);
    await saveItemOfflineFirst({
      ...activeNote,
      title: draftTitle.trim() || activeNote.title,
      contentMd: textContent,
      summary,
      metadata: {
        ...activeNote.metadata,
        wordCount: textContent.split(/\s+/).filter(Boolean).length,
      },
    });
  }

  async function handleAddTag(e: React.FormEvent) {
    e.preventDefault();
    if (!activeNote || !newTagName.trim()) return;
    const existing = tags.find(
      (t) => t.name.toLowerCase() === newTagName.trim().toLowerCase()
    );
    const tag =
      existing ??
      (await saveTagOfflineFirst({
        userId: user.id,
        name: newTagName.trim(),
      }));
    await toggleItemTagOfflineFirst(activeNote.id, tag.id, true);
    setNewTagName("");
    void triggerSync();
  }

  async function handleDeleteActive() {
    if (!activeNote) return;
    await deleteItemOfflineFirst(activeNote.id);
    setSelectedId(null);
    void triggerSync();
  }

  const activeTags = activeNote ? getTagsForItem(activeNote.id) : [];

  return (
    <div className={styles.layout}>
      {/* Left Notes List */}
      <section className={`card ${styles.listPane}`}>
        <div className={styles.listHeader}>
          <h1>Notes</h1>
          <button
            id="create-note-btn"
            type="button"
            className="btn btn-primary btn-sm"
            onClick={handleCreateNote}
          >
            <Plus size={14} /> New
          </button>
        </div>

        <input
          type="search"
          className="input"
          placeholder="Filter notes..."
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
        />

        {activeTagFilter && (
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => setTagOverride(null)}
          >
            Clear tag filter ×
          </button>
        )}

        <div className={styles.noteItems}>
          {filteredNotes.map((note) => {
            const isSelected = activeNote?.id === note.id;
            return (
              <button
                key={note.id}
                type="button"
                className={isSelected ? styles.noteItemActive : styles.noteItem}
                onClick={() => setSelectedId(note.id)}
              >
                <div className={styles.noteItemTitle}>{note.title}</div>
                <div className={styles.noteItemMeta}>
                  {note.summary
                    ? note.summary.slice(0, 72)
                    : "Empty note — start writing"}
                </div>
              </button>
            );
          })}
          {filteredNotes.length === 0 && (
            <p className={styles.emptyList}>No notes match this filter.</p>
          )}
        </div>
      </section>

      {/* Editor & Connections */}
      <section className={`card ${styles.editorPane}`}>
        {activeNote ? (
          <>
            <div className={styles.editorHeader}>
              <input
                id="note-title-input"
                type="text"
                className={styles.titleInput}
                value={draftTitle}
                onChange={(e) =>
                  setTitleDraft({ id: activeNote.id, value: e.target.value })
                }
                onBlur={() => void handleTitleBlur()}
                placeholder="Note title..."
              />
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => void handleDeleteActive()}
                aria-label="Delete note"
                title="Delete note"
              >
                <Trash2 size={15} />
              </button>
            </div>

            {/* Tags Row */}
            <div className={styles.tagsRow}>
              <Tag size={14} />
              {activeTags.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className="badge"
                  onClick={async () => {
                    await toggleItemTagOfflineFirst(activeNote.id, t.id, false);
                    void triggerSync();
                  }}
                  title="Click to remove tag"
                >
                  {t.name} ×
                </button>
              ))}
              <form onSubmit={handleAddTag} className={styles.addTagForm}>
                <input
                  type="text"
                  placeholder="+ Add tag"
                  value={newTagName}
                  onChange={(e) => setNewTagName(e.target.value)}
                />
              </form>
            </div>

            <NoteEditor
              noteId={activeNote.id}
              initialContent={activeNote.contentMd}
              linkableTitles={linkableTitles}
              onChange={(text) => {
                void handleEditorChange(text);
              }}
            />

            {/* Backlinks & Connected Graph Items */}
            <div className={styles.backlinks}>
              <div className={styles.backlinksTitle}>
                <Link2 size={14} /> Connected Knowledge ({backlinks.length})
              </div>
              {backlinks.length > 0 ? (
                <div className={styles.backlinkList}>
                  {backlinks.map((item) => (
                    <Link
                      key={item.id}
                      href={
                        item.type === "note"
                          ? `/workspace/notes?id=${item.id}`
                          : item.type === "idea"
                            ? `/workspace/ideas?id=${item.id}`
                            : `/workspace/read-later?id=${item.id}`
                      }
                      className={styles.backlinkChip}
                    >
                      <FileText size={13} />
                      <span>{item.title}</span>
                      <span className="badge">{item.type}</span>
                    </Link>
                  ))}
                </div>
              ) : (
                <p className={styles.backlinkHint}>
                  Use the <code>+ Link item [[...]]</code> menu above to connect
                  this note to papers, ideas, or other notes.
                </p>
              )}
            </div>
          </>
        ) : (
          <div className={styles.emptyEditor}>
            <FileText size={28} />
            <p>Select a note or create a new one to begin.</p>
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleCreateNote}
            >
              Create Note
            </button>
          </div>
        )}
      </section>
    </div>
  );
}

export default function NotesPage() {
  return (
    <Suspense fallback={<div>Loading notes...</div>}>
      <NotesWorkspaceInner />
    </Suspense>
  );
}
