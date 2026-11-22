"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  type Edge,
  type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import dagre from "@dagrejs/dagre";
import {
  BookMarked,
  Compass,
  ExternalLink,
  FileText,
  Save,
  Sparkles,
} from "lucide-react";
import { useWorkspace } from "@/components/workspace/WorkspaceProvider";
import {
  saveEdgeOfflineFirst,
  saveItemOfflineFirst,
} from "@/lib/offline/sync-client";
import type { MindMapNodeDTO } from "@/app/api/explore/route";
import styles from "./explore.module.css";

const STARTER_TOPICS = [
  "Agentic Memory Systems",
  "Personal Knowledge Graphs",
  "AI Curriculum Design",
  "Local-First Software",
];

function layoutMindMap(rawNodes: MindMapNodeDTO[]): {
  nodes: Node[];
  edges: Edge[];
} {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "LR", nodesep: 32, ranksep: 90 });

  const width = 220;
  const height = 66;

  for (const n of rawNodes) {
    g.setNode(n.id, { width, height });
  }

  const edges: Edge[] = [];
  for (const n of rawNodes) {
    if (n.parentId) {
      g.setEdge(n.parentId, n.id);
      edges.push({
        id: `${n.parentId}->${n.id}`,
        source: n.parentId,
        target: n.id,
        animated: n.kind === "paper",
        style: { stroke: "var(--border-strong)", strokeWidth: 1.5 },
      });
    }
  }

  dagre.layout(g);

  const toneColors: Record<MindMapNodeDTO["kind"], { bg: string; border: string }> =
    {
      root: { bg: "var(--accent-amber-soft)", border: "var(--accent-amber)" },
      concept: { bg: "var(--bg-elevated)", border: "var(--border-strong)" },
      paper: { bg: "var(--accent-teal-soft)", border: "var(--accent-teal)" },
      note: { bg: "var(--accent-sage-soft)", border: "var(--accent-sage)" },
    };

  const nodes: Node[] = rawNodes.map((n) => {
    const pos = g.node(n.id);
    const tone = toneColors[n.kind];
    return {
      id: n.id,
      position: { x: pos.x - width / 2, y: pos.y - height / 2 },
      data: {
        label: n.label,
        raw: n,
      },
      style: {
        width,
        padding: "10px 12px",
        borderRadius: 10,
        background: tone.bg,
        border: `1.5px solid ${tone.border}`,
        color: "var(--text-primary)",
        fontSize: "12.5px",
        fontWeight: n.kind === "root" ? 600 : 500,
        boxShadow: "var(--shadow-sm)",
      },
    };
  });

  return { nodes, edges };
}

function TopicExplorerInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedId = searchParams.get("id");
  const requestedTopic = searchParams.get("topic");

  const { user, items, triggerSync } = useWorkspace();
  const savedMaps = useMemo(
    () => items.filter((i) => i.type === "topic"),
    [items]
  );

  const defaultSavedMap = useMemo(() => {
    if (requestedId) {
      return savedMaps.find((m) => m.id === requestedId) ?? null;
    }
    return savedMaps[0] ?? null;
  }, [requestedId, savedMaps]);

  const [topicInputOverride, setTopicInputOverride] = useState<string | null>(
    null
  );
  const [activeTopicOverride, setActiveTopicOverride] = useState<string | null>(
    null
  );
  const [rawNodesState, setRawNodesState] = useState<MindMapNodeDTO[]>([]);
  const [selectedNode, setSelectedNode] = useState<MindMapNodeDTO | null>(null);
  const [providerUsed, setProviderUsed] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);

  const rawNodes = useMemo(
    () =>
      rawNodesState.length > 0
        ? rawNodesState
        : ((defaultSavedMap?.metadata.mindMapNodes as
            | MindMapNodeDTO[]
            | undefined) ?? []),
    [rawNodesState, defaultSavedMap]
  );

  const activeTopic =
    activeTopicOverride ??
    requestedTopic ??
    defaultSavedMap?.title ??
    "Personal Knowledge Graphs";

  const topicInput =
    topicInputOverride ??
    requestedTopic ??
    defaultSavedMap?.title ??
    "Personal Knowledge Graphs";

  const runExplore = useCallback(async (topic: string) => {
    const clean = topic.trim();
    if (!clean) return;
    setLoading(true);
    setSavedNotice(null);
    try {
      const res = await fetch("/api/explore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: clean }),
      });
      if (res.ok) {
        const data = (await res.json()) as {
          topic: string;
          provider: string;
          nodes: MindMapNodeDTO[];
        };
        setActiveTopicOverride(data.topic);
        setTopicInputOverride(data.topic);
        setProviderUsed(data.provider);
        setRawNodesState(data.nodes);
        setSelectedNode(data.nodes[0] ?? null);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!requestedTopic) return;
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/explore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: requestedTopic.trim() }),
      });
      if (!res.ok || cancelled) return;
      const data = (await res.json()) as {
        topic: string;
        provider: string;
        nodes: MindMapNodeDTO[];
      };
      if (cancelled) return;
      setActiveTopicOverride(data.topic);
      setTopicInputOverride(data.topic);
      setProviderUsed(data.provider);
      setRawNodesState(data.nodes);
      setSelectedNode(data.nodes[0] ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [requestedTopic]);

  const { nodes: flowNodes, edges: flowEdges } = useMemo(
    () => layoutMindMap(rawNodes),
    [rawNodes]
  );

  async function handleSaveMap() {
    if (!rawNodes.length) return;
    await saveItemOfflineFirst({
      userId: user.id,
      type: "topic",
      title: activeTopic,
      summary: `Topic Mind Map with ${rawNodes.length} synthesized concepts and research works.`,
      contentMd: rawNodes
        .map((n) => `- **${n.label}** (${n.kind}): ${n.summary ?? ""}`)
        .join("\n"),
      metadata: {
        mindMapNodes: rawNodes.map((n) => ({
          id: n.id,
          label: n.label,
          kind: n.kind,
          summary: n.summary,
          url: n.url,
          authors: n.authors,
          year: n.year ?? undefined,
          parentId: n.parentId,
        })),
      },
    });
    void triggerSync();
    setSavedNotice("Mind map saved to your workspace!");
  }

  async function handleSaveNodePaper(node: MindMapNodeDTO) {
    const created = await saveItemOfflineFirst({
      userId: user.id,
      type: "paper",
      title: node.label,
      sourceUrl: node.url ?? null,
      summary: node.summary ?? "",
      contentMd: node.summary ?? "",
      metadata: {
        authors: node.authors ?? [],
        siteName: node.url?.includes("arxiv") ? "arXiv" : "OpenAlex",
        publishedAt: node.year ? String(node.year) : undefined,
        readingStatus: "unread",
      },
    });
    void triggerSync();
    router.push(`/workspace/read-later?id=${created.id}`);
  }

  async function handleCreateLinkedNote(node: MindMapNodeDTO) {
    const created = await saveItemOfflineFirst({
      userId: user.id,
      type: "note",
      title: `${node.label} — Synthesis`,
      summary: node.summary ?? "",
      contentMd: `# ${node.label}\n\n${node.summary ?? ""}\n\nExplored from topic **${activeTopic}**.${
        node.url ? `\n\nReference: ${node.url}` : ""
      }`,
    });
    if (node.sourceItemId) {
      await saveEdgeOfflineFirst({
        userId: user.id,
        sourceItemId: created.id,
        targetItemId: node.sourceItemId,
        relationType: "expands",
      });
    }
    void triggerSync();
    router.push(`/workspace/notes?id=${created.id}`);
  }

  return (
    <div className={styles.page}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void runExplore(topicInput);
        }}
        className={`card ${styles.searchCard}`}
      >
        <div className={styles.topRow}>
          <div>
            <h1>Topic Explorer</h1>
            <p className={styles.sub}>
              Generate an interactive mind map combining OpenAlex concepts,
              arXiv papers, and your personal notes.
            </p>
          </div>
          {rawNodes.length > 0 && (
            <button
              id="save-mindmap-btn"
              type="button"
              className="btn"
              onClick={() => void handleSaveMap()}
            >
              <Save size={15} /> Save Map
            </button>
          )}
        </div>

        <div className={styles.inputRow}>
          <input
            id="topic-explorer-input"
            type="text"
            className="input"
            placeholder="Enter a research topic, concept, or question..."
            value={topicInput}
            onChange={(e) => setTopicInputOverride(e.target.value)}
            required
          />
          <button
            id="explore-topic-btn"
            type="submit"
            className="btn btn-primary"
            disabled={loading}
          >
            <Compass size={15} />
            {loading ? "Mapping..." : "Generate Map"}
          </button>
        </div>

        <div className={styles.chipsRow}>
          {STARTER_TOPICS.map((t) => (
            <button
              key={t}
              type="button"
              className={styles.starterChip}
              onClick={() => {
                setTopicInputOverride(t);
                void runExplore(t);
              }}
            >
              <Sparkles size={12} /> {t}
            </button>
          ))}
          {savedNotice && (
            <span className={styles.savedBadge}>{savedNotice}</span>
          )}
          {providerUsed && (
            <span className="badge font-mono">AI: {providerUsed}</span>
          )}
        </div>
      </form>

      <div className={styles.canvasWrap}>
        <div className={`card ${styles.flowPane}`}>
          {flowNodes.length > 0 ? (
            <ReactFlow
              nodes={flowNodes}
              edges={flowEdges}
              fitView
              onNodeClick={(_, node) => {
                const raw = (node.data as { raw?: MindMapNodeDTO })?.raw;
                if (raw) setSelectedNode(raw);
              }}
            >
              <Background gap={22} size={1} />
              <MiniMap pannable zoomable />
              <Controls />
            </ReactFlow>
          ) : (
            <div className={styles.emptyCanvas}>
              <Compass size={30} />
              <p>Enter a topic above to generate a live research mind map.</p>
            </div>
          )}
        </div>

        <aside className={`card ${styles.inspectorPane}`}>
          <h2>Node Inspector</h2>
          {selectedNode ? (
            <div className={styles.inspectorBody}>
              <span className="badge">{selectedNode.kind}</span>
              <h3>{selectedNode.label}</h3>
              {selectedNode.authors && selectedNode.authors.length > 0 && (
                <p className={styles.authors}>
                  {selectedNode.authors.join(", ")}
                  {selectedNode.year ? ` (${selectedNode.year})` : ""}
                </p>
              )}
              <p className={styles.summary}>
                {selectedNode.summary ||
                  "Select an action below to bring this node into your Cerebro knowledge base."}
              </p>

              <div className={styles.inspectorActions}>
                {selectedNode.kind === "paper" && (
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => void handleSaveNodePaper(selectedNode)}
                  >
                    <BookMarked size={14} /> Save to Read Later
                  </button>
                )}
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => void handleCreateLinkedNote(selectedNode)}
                >
                  <FileText size={14} /> Create Linked Note
                </button>
                {selectedNode.url && (
                  <a
                    href={selectedNode.url}
                    target="_blank"
                    rel="noreferrer"
                    className="btn btn-ghost btn-sm"
                  >
                    Open Source <ExternalLink size={13} />
                  </a>
                )}
              </div>
            </div>
          ) : (
            <p className={styles.inspectorHint}>
              Click any concept, paper, or note node in the mind map to inspect
              details and save it to your workspace.
            </p>
          )}

          {savedMaps.length > 0 && (
            <div className={styles.savedList}>
              <div className={styles.savedTitle}>Saved Maps</div>
              {savedMaps.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  className={styles.savedItem}
                  onClick={() => {
                    if (m.metadata.mindMapNodes?.length) {
                      setActiveTopicOverride(m.title);
                      setTopicInputOverride(m.title);
                      setRawNodesState(
                        m.metadata.mindMapNodes as MindMapNodeDTO[]
                      );
                    }
                  }}
                >
                  {m.title}
                </button>
              ))}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

export default function TopicExplorerPage() {
  return (
    <Suspense fallback={<div>Loading Topic Explorer...</div>}>
      <TopicExplorerInner />
    </Suspense>
  );
}
