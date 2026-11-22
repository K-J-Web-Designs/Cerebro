"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Link2, Network } from "lucide-react";
import { useWorkspace } from "@/components/workspace/WorkspaceProvider";
import { KnowledgeGraphCanvas } from "@/components/graph/KnowledgeGraphCanvas";
import { saveEdgeOfflineFirst } from "@/lib/offline/sync-client";
import type { EdgeRelationType, KnowledgeItemType } from "@/db/schema";
import styles from "./graph.module.css";

const ALL_TYPES: KnowledgeItemType[] = [
  "note",
  "paper",
  "bookmark",
  "idea",
  "topic",
];

export default function KnowledgeGraphPage() {
  const { user, items, edges, triggerSync } = useWorkspace();
  const [activeTypes, setActiveTypes] = useState<Set<KnowledgeItemType>>(
    () => new Set(ALL_TYPES)
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [targetConnectId, setTargetConnectId] = useState("");
  const [relationType, setRelationType] =
    useState<EdgeRelationType>("related_to");

  const visibleItems = useMemo(
    () => items.filter((i) => activeTypes.has(i.type)),
    [items, activeTypes]
  );

  const selectedItem = useMemo(
    () => items.find((i) => i.id === selectedId) ?? visibleItems[0] ?? null,
    [items, selectedId, visibleItems]
  );

  const connections = useMemo(() => {
    if (!selectedItem) return [];
    return edges
      .filter(
        (e) =>
          e.sourceItemId === selectedItem.id ||
          e.targetItemId === selectedItem.id
      )
      .map((e) => {
        const otherId =
          e.sourceItemId === selectedItem.id
            ? e.targetItemId
            : e.sourceItemId;
        const other = items.find((i) => i.id === otherId);
        return other ? { edge: e, item: other } : null;
      })
      .filter((x): x is NonNullable<typeof x> => Boolean(x));
  }, [selectedItem, edges, items]);

  function toggleType(t: KnowledgeItemType) {
    setActiveTypes((prev) => {
      const next = new Set(prev);
      if (next.has(t)) {
        if (next.size > 1) next.delete(t);
      } else {
        next.add(t);
      }
      return next;
    });
  }

  async function handleConnect(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedItem || !targetConnectId || targetConnectId === selectedItem.id)
      return;
    await saveEdgeOfflineFirst({
      userId: user.id,
      sourceItemId: selectedItem.id,
      targetItemId: targetConnectId,
      relationType,
    });
    setTargetConnectId("");
    void triggerSync();
  }

  function itemHref(id: string, type: KnowledgeItemType): string {
    if (type === "note") return `/workspace/notes?id=${id}`;
    if (type === "idea") return `/workspace/ideas?id=${id}`;
    if (type === "topic") return `/workspace/explore?id=${id}`;
    return `/workspace/read-later?id=${id}`;
  }

  return (
    <div className={styles.page}>
      <header className={`card ${styles.toolbar}`}>
        <div>
          <h1>Knowledge Graph</h1>
          <p className={styles.sub}>
            {visibleItems.length} nodes · {edges.length} connections across
            your notes, readings, topics, and ideas.
          </p>
        </div>

        <div className={styles.legendRow}>
          {ALL_TYPES.map((type) => {
            const on = activeTypes.has(type);
            return (
              <button
                key={type}
                type="button"
                className={on ? styles.typeChipOn : styles.typeChipOff}
                data-type={type}
                onClick={() => toggleType(type)}
              >
                <span className={styles.dot} data-type={type} />
                {type}
              </button>
            );
          })}
        </div>
      </header>

      <div className={styles.grid}>
        <div className={`card ${styles.canvasCard}`}>
          {visibleItems.length > 0 ? (
            <KnowledgeGraphCanvas
              items={visibleItems}
              edges={edges}
              selectedId={selectedItem?.id ?? null}
              onSelectNode={(id) => setSelectedId(id)}
            />
          ) : (
            <div className={styles.empty}>
              <Network size={28} />
              <p>Create notes, ideas, or saved readings to populate the graph.</p>
            </div>
          )}
        </div>

        <aside className={`card ${styles.detailCard}`}>
          <h2>Node Details</h2>
          {selectedItem ? (
            <div className={styles.detailBody}>
              <span className="badge">{selectedItem.type}</span>
              <h3>{selectedItem.title}</h3>
              {selectedItem.summary && (
                <p className={styles.summary}>{selectedItem.summary}</p>
              )}

              <Link
                href={itemHref(selectedItem.id, selectedItem.type)}
                className="btn btn-primary btn-sm"
              >
                Open {selectedItem.type} <ArrowUpRight size={14} />
              </Link>

              <form onSubmit={handleConnect} className={styles.connectForm}>
                <div className={styles.connectLabel}>
                  <Link2 size={13} /> Add Relationship
                </div>
                <select
                  className="select"
                  value={relationType}
                  onChange={(e) =>
                    setRelationType(e.target.value as EdgeRelationType)
                  }
                >
                  <option value="related_to">related_to</option>
                  <option value="cites">cites</option>
                  <option value="expands">expands</option>
                  <option value="contradicts">contradicts</option>
                  <option value="derived_from">derived_from</option>
                </select>
                <select
                  className="select"
                  value={targetConnectId}
                  onChange={(e) => setTargetConnectId(e.target.value)}
                >
                  <option value="">Select target node...</option>
                  {items
                    .filter((i) => i.id !== selectedItem.id)
                    .map((i) => (
                      <option key={i.id} value={i.id}>
                        [{i.type}] {i.title}
                      </option>
                    ))}
                </select>
                <button
                  type="submit"
                  className="btn btn-sm"
                  disabled={!targetConnectId}
                >
                  Connect Nodes
                </button>
              </form>

              <div className={styles.neighbors}>
                <div className={styles.connectLabel}>
                  Connected ({connections.length})
                </div>
                {connections.map(({ edge, item }) => (
                  <button
                    key={edge.id}
                    type="button"
                    className={styles.neighborBtn}
                    onClick={() => setSelectedId(item.id)}
                  >
                    <span>{item.title}</span>
                    <span className="badge font-mono">{edge.relationType}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <p className={styles.summary}>
              Select any node on the canvas to inspect its relationships.
            </p>
          )}
        </aside>
      </div>
    </div>
  );
}
