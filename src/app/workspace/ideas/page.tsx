"use client";

import { Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Compass,
  FileText,
  Lightbulb,
  Plus,
  ShieldAlert,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useWorkspace } from "@/components/workspace/WorkspaceProvider";
import {
  computeIceScore,
  deleteItemOfflineFirst,
  saveEdgeOfflineFirst,
  saveItemOfflineFirst,
} from "@/lib/offline/sync-client";
import type { IdeaStage } from "@/db/schema";
import styles from "./ideas.module.css";

const STAGES: IdeaStage[] = [
  "spark",
  "exploring",
  "validated",
  "actionable",
  "archived",
];

function IdeaIncubatorInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedId = searchParams.get("id");

  const { user, items, triggerSync } = useWorkspace();

  const ideas = useMemo(
    () =>
      items
        .filter((i) => i.type === "idea")
        .sort(
          (a, b) => computeIceScore(b.metadata) - computeIceScore(a.metadata)
        ),
    [items]
  );

  const [stageFilter, setStageFilter] = useState<"all" | IdeaStage>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const effectiveSelectedId = selectedId ?? requestedId;
  const [newIdeaTitle, setNewIdeaTitle] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiProvider, setAiProvider] = useState<string | null>(null);
  const [relatedState, setRelatedState] = useState<{
    ideaId: string;
    items: Array<{ id: string; title: string; type: string }>;
  } | null>(null);

  const filteredIdeas = useMemo(
    () =>
      ideas.filter((idea) =>
        stageFilter === "all"
          ? true
          : (idea.metadata.ideaStage ?? "spark") === stageFilter
      ),
    [ideas, stageFilter]
  );

  const activeIdea = useMemo(
    () =>
      ideas.find((i) => i.id === effectiveSelectedId) ??
      filteredIdeas[0] ??
      null,
    [ideas, effectiveSelectedId, filteredIdeas]
  );

  const [titleDraft, setTitleDraft] = useState<{
    id: string;
    value: string;
  } | null>(null);
  const [contentDraft, setContentDraft] = useState<{
    id: string;
    value: string;
  } | null>(null);

  const draftTitle =
    activeIdea && titleDraft?.id === activeIdea.id
      ? titleDraft.value
      : (activeIdea?.title ?? "");
  const draftContent =
    activeIdea && contentDraft?.id === activeIdea.id
      ? contentDraft.value
      : (activeIdea?.contentMd ?? "");
  const relatedSuggestions =
    activeIdea && relatedState?.ideaId === activeIdea.id
      ? relatedState.items
      : [];

  async function handleCreateIdea(e: React.FormEvent) {
    e.preventDefault();
    const title = newIdeaTitle.trim();
    if (!title) return;
    const created = await saveItemOfflineFirst({
      userId: user.id,
      type: "idea",
      title,
      contentMd: "",
      summary: "",
      metadata: {
        ideaStage: "spark",
        impact: 7,
        confidence: 6,
        effort: 4,
        iceScore: 10.5,
        aiSuggestions: [],
      },
    });
    setNewIdeaTitle("");
    setSelectedId(created.id);
    setTitleDraft({ id: created.id, value: created.title });
    setContentDraft({ id: created.id, value: "" });
    void triggerSync();
  }

  async function updateActiveIdea(
    patch: Partial<{
      title: string;
      contentMd: string;
      ideaStage: IdeaStage;
      impact: number;
      confidence: number;
      effort: number;
    }>
  ) {
    if (!activeIdea) return;
    const nextMeta = {
      ...activeIdea.metadata,
      ideaStage: patch.ideaStage ?? activeIdea.metadata.ideaStage ?? "spark",
      impact: patch.impact ?? activeIdea.metadata.impact ?? 7,
      confidence: patch.confidence ?? activeIdea.metadata.confidence ?? 6,
      effort: patch.effort ?? activeIdea.metadata.effort ?? 4,
    };
    nextMeta.iceScore = computeIceScore(nextMeta);

    const nextContent = patch.contentMd ?? activeIdea.contentMd;
    await saveItemOfflineFirst({
      ...activeIdea,
      title: patch.title ?? activeIdea.title,
      contentMd: nextContent,
      summary: nextContent.replace(/\s+/g, " ").trim().slice(0, 180),
      metadata: nextMeta,
    });
    void triggerSync();
  }

  async function runAiAssist(mode: "expand" | "critique" | "connect") {
    if (!activeIdea) return;
    setAiBusy(true);
    try {
      const res = await fetch("/api/ideas/assist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: draftTitle || activeIdea.title,
          content: draftContent,
          mode,
        }),
      });
      if (!res.ok) return;
      const data = (await res.json()) as {
        provider: string;
        suggestions: Array<{
          id: string;
          kind: "angle" | "critique" | "question" | "connection";
          text: string;
        }>;
        relatedItems: Array<{ id: string; title: string; type: string }>;
      };
      setAiProvider(data.provider);
      setRelatedState({
        ideaId: activeIdea.id,
        items: data.relatedItems ?? [],
      });

      const stamped = data.suggestions.map((s) => ({
        ...s,
        createdAt: new Date().toISOString(),
      }));
      const prev = activeIdea.metadata.aiSuggestions ?? [];
      await saveItemOfflineFirst({
        ...activeIdea,
        title: draftTitle || activeIdea.title,
        contentMd: draftContent,
        metadata: {
          ...activeIdea.metadata,
          aiSuggestions: [...stamped, ...prev].slice(0, 12),
        },
      });
      void triggerSync();
    } finally {
      setAiBusy(false);
    }
  }

  async function promoteToNote() {
    if (!activeIdea) return;
    const note = await saveItemOfflineFirst({
      userId: user.id,
      type: "note",
      title: `${activeIdea.title} — Action Plan`,
      summary: activeIdea.summary,
      contentMd: `# ${activeIdea.title}\n\n${draftContent}\n\nPromoted from Idea Incubator (ICE ${computeIceScore(activeIdea.metadata)}).`,
    });
    await saveEdgeOfflineFirst({
      userId: user.id,
      sourceItemId: note.id,
      targetItemId: activeIdea.id,
      relationType: "derived_from",
    });
    void triggerSync();
    router.push(`/workspace/notes?id=${note.id}`);
  }

  return (
    <div className={styles.page}>
      <form onSubmit={handleCreateIdea} className={`card ${styles.topBar}`}>
        <div>
          <h1>Idea Incubator</h1>
          <p className={styles.sub}>
            Develop raw sparks with AI co-thinking, ICE prioritization, and
            knowledge graph linking.
          </p>
        </div>
        <div className={styles.createRow}>
          <input
            id="new-idea-input"
            type="text"
            className="input"
            placeholder="Capture a new idea spark..."
            value={newIdeaTitle}
            onChange={(e) => setNewIdeaTitle(e.target.value)}
            required
          />
          <button
            id="create-idea-btn"
            type="submit"
            className="btn btn-primary"
          >
            <Plus size={15} /> Add Idea
          </button>
        </div>
      </form>

      <div className={styles.columns}>
        {/* Left Priority Queue */}
        <aside className={`card ${styles.listPane}`}>
          <div className={styles.stageChips}>
            <button
              type="button"
              className={
                stageFilter === "all" ? styles.stageActive : styles.stageBtn
              }
              onClick={() => setStageFilter("all")}
            >
              All
            </button>
            {STAGES.map((st) => (
              <button
                key={st}
                type="button"
                className={
                  stageFilter === st ? styles.stageActive : styles.stageBtn
                }
                onClick={() => setStageFilter(st)}
              >
                {st}
              </button>
            ))}
          </div>

          <div className={styles.ideaList}>
            {filteredIdeas.map((idea) => {
              const selected = activeIdea?.id === idea.id;
              return (
                <button
                  key={idea.id}
                  type="button"
                  className={selected ? styles.ideaItemActive : styles.ideaItem}
                  onClick={() => setSelectedId(idea.id)}
                >
                  <div className={styles.ideaItemTop}>
                    <span className={styles.ideaTitle}>{idea.title}</span>
                    <span className="badge badge-amber font-mono">
                      {computeIceScore(idea.metadata)}
                    </span>
                  </div>
                  <div className={styles.ideaStageMeta}>
                    {idea.metadata.ideaStage ?? "spark"}
                  </div>
                </button>
              );
            })}
            {filteredIdeas.length === 0 && (
              <p className={styles.empty}>No ideas in this stage yet.</p>
            )}
          </div>
        </aside>

        {/* Idea Canvas & AI Co-Thinker */}
        <section className={`card ${styles.detailPane}`}>
          {activeIdea ? (
            <>
              <div className={styles.detailHeader}>
                <input
                  id="idea-title-input"
                  type="text"
                  className={styles.titleInput}
                  value={draftTitle}
                  onChange={(e) =>
                    setTitleDraft({ id: activeIdea.id, value: e.target.value })
                  }
                  onBlur={() => void updateActiveIdea({ title: draftTitle })}
                />
                <select
                  aria-label="Idea maturity stage"
                  className="select"
                  style={{ width: "auto" }}
                  value={activeIdea.metadata.ideaStage ?? "spark"}
                  onChange={(e) =>
                    void updateActiveIdea({
                      ideaStage: e.target.value as IdeaStage,
                    })
                  }
                >
                  {STAGES.map((st) => (
                    <option key={st} value={st}>
                      {st}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={async () => {
                    await deleteItemOfflineFirst(activeIdea.id);
                    setSelectedId(null);
                    void triggerSync();
                  }}
                  aria-label="Delete idea"
                >
                  <Trash2 size={15} />
                </button>
              </div>

              {/* ICE Scoring Bar */}
              <div className={styles.iceBar}>
                <label className={styles.sliderLabel}>
                  <span>Impact: {activeIdea.metadata.impact ?? 7}</span>
                  <input
                    type="range"
                    min={1}
                    max={10}
                    value={activeIdea.metadata.impact ?? 7}
                    onChange={(e) =>
                      void updateActiveIdea({ impact: Number(e.target.value) })
                    }
                  />
                </label>
                <label className={styles.sliderLabel}>
                  <span>Confidence: {activeIdea.metadata.confidence ?? 6}</span>
                  <input
                    type="range"
                    min={1}
                    max={10}
                    value={activeIdea.metadata.confidence ?? 6}
                    onChange={(e) =>
                      void updateActiveIdea({
                        confidence: Number(e.target.value),
                      })
                    }
                  />
                </label>
                <label className={styles.sliderLabel}>
                  <span>Effort: {activeIdea.metadata.effort ?? 4}</span>
                  <input
                    type="range"
                    min={1}
                    max={10}
                    value={activeIdea.metadata.effort ?? 4}
                    onChange={(e) =>
                      void updateActiveIdea({ effort: Number(e.target.value) })
                    }
                  />
                </label>
                <div className={styles.iceScoreBox}>
                  <span>ICE Score</span>
                  <strong>{computeIceScore(activeIdea.metadata)}</strong>
                </div>
              </div>

              <textarea
                id="idea-content-input"
                className={`textarea ${styles.ideaTextarea}`}
                rows={7}
                placeholder="Flesh out the thesis, target users, evidence, and open hypotheses..."
                value={draftContent}
                onChange={(e) =>
                  setContentDraft({ id: activeIdea.id, value: e.target.value })
                }
                onBlur={() => void updateActiveIdea({ contentMd: draftContent })}
              />

              {/* AI Co-Thinker & Promotion Toolbar */}
              <div className={styles.assistToolbar}>
                <button
                  id="ai-expand-idea-btn"
                  type="button"
                  className="btn btn-primary btn-sm"
                  disabled={aiBusy}
                  onClick={() => void runAiAssist("expand")}
                >
                  <Sparkles size={14} />{" "}
                  {aiBusy ? "Thinking..." : "AI Expand Angles"}
                </button>
                <button
                  type="button"
                  className="btn btn-sm"
                  disabled={aiBusy}
                  onClick={() => void runAiAssist("critique")}
                >
                  <ShieldAlert size={14} /> Devil&apos;s Advocate
                </button>
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() =>
                    router.push(
                      `/workspace/explore?topic=${encodeURIComponent(activeIdea.title)}`
                    )
                  }
                >
                  <Compass size={14} /> Topic Mind Map
                </button>
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => void promoteToNote()}
                >
                  <FileText size={14} /> Promote to Note
                </button>
                {aiProvider && (
                  <span className="badge font-mono">AI: {aiProvider}</span>
                )}
              </div>

              {relatedSuggestions.length > 0 && (
                <div className={styles.relatedStrip}>
                  <span>Related in your workspace:</span>
                  {relatedSuggestions.map((rel) => (
                    <button
                      key={rel.id}
                      type="button"
                      className="badge badge-sage"
                      onClick={async () => {
                        await saveEdgeOfflineFirst({
                          userId: user.id,
                          sourceItemId: activeIdea.id,
                          targetItemId: rel.id,
                          relationType: "related_to",
                          aiGenerated: true,
                        });
                        void triggerSync();
                      }}
                    >
                      + Link &ldquo;{rel.title}&rdquo;
                    </button>
                  ))}
                </div>
              )}

              <div className={styles.suggestionsList}>
                {(activeIdea.metadata.aiSuggestions ?? []).map((sug) => (
                  <div key={sug.id} className={styles.suggestionCard}>
                    <span className="badge badge-terra">{sug.kind}</span>
                    <p>{sug.text}</p>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className={styles.emptyDetail}>
              <Lightbulb size={28} />
              <p>Select an idea or capture a new spark above.</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

export default function IdeaIncubatorPage() {
  return (
    <Suspense fallback={<div>Loading Idea Incubator...</div>}>
      <IdeaIncubatorInner />
    </Suspense>
  );
}
