"use client";

import { useEffect, useRef } from "react";
import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from "d3-force";
import type { LocalKnowledgeEdge, LocalKnowledgeItem } from "@/lib/offline/db";

interface GraphNode extends SimulationNodeDatum {
  id: string;
  item: LocalKnowledgeItem;
  degree: number;
}

interface GraphLink extends SimulationLinkDatum<GraphNode> {
  id: string;
  relationType: string;
  aiGenerated: boolean;
}

const NODE_COLORS: Record<string, string> = {
  note: "#c87d1a",
  paper: "#216869",
  bookmark: "#216869",
  idea: "#9e473b",
  topic: "#2f6f4e",
};

export function KnowledgeGraphCanvas({
  items,
  edges,
  selectedId,
  onSelectNode,
}: {
  items: LocalKnowledgeItem[];
  edges: LocalKnowledgeEdge[];
  selectedId: string | null;
  onSelectNode: (id: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const selectedRef = useRef(selectedId);

  useEffect(() => {
    selectedRef.current = selectedId;
  }, [selectedId]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = canvas.parentElement?.clientWidth ?? 760;
    const height = 540;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const itemIds = new Set(items.map((i) => i.id));
    const degreeMap = new Map<string, number>();
    const validEdges = edges.filter(
      (e) => itemIds.has(e.sourceItemId) && itemIds.has(e.targetItemId)
    );
    for (const e of validEdges) {
      degreeMap.set(e.sourceItemId, (degreeMap.get(e.sourceItemId) ?? 0) + 1);
      degreeMap.set(e.targetItemId, (degreeMap.get(e.targetItemId) ?? 0) + 1);
    }

    const nodes: GraphNode[] = items.map((item, idx) => ({
      id: item.id,
      item,
      degree: degreeMap.get(item.id) ?? 0,
      x: width / 2 + Math.cos(idx) * 120,
      y: height / 2 + Math.sin(idx) * 120,
    }));

    const links: GraphLink[] = validEdges.map((e) => ({
      id: e.id,
      source: e.sourceItemId,
      target: e.targetItemId,
      relationType: e.relationType,
      aiGenerated: e.aiGenerated,
    }));

    let hoveredId: string | null = null;
    let draggedNode: GraphNode | null = null;
    const transform = { x: 0, y: 0, k: 1 };
    let isPanning = false;
    let panStart = { x: 0, y: 0 };

    const simulation = forceSimulation<GraphNode>(nodes)
      .force(
        "link",
        forceLink<GraphNode, GraphLink>(links)
          .id((d) => d.id)
          .distance(115)
      )
      .force("charge", forceManyBody().strength(-260))
      .force("center", forceCenter(width / 2, height / 2))
      .force("collide", forceCollide<GraphNode>().radius(34));

    const draw = () => {
      const isDark =
        document.documentElement.getAttribute("data-theme") === "dark";
      const textColor = isDark ? "#f2ede3" : "#1c1915";
      const edgeColor = isDark ? "rgba(242,237,227,0.22)" : "rgba(28,25,21,0.2)";
      const labelMuted = isDark ? "#b9b1a3" : "#544e44";

      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, width, height);

      ctx.translate(transform.x, transform.y);
      ctx.scale(transform.k, transform.k);

      // Draw edges
      for (const link of links) {
        const s = link.source as GraphNode;
        const t = link.target as GraphNode;
        if (s.x === undefined || s.y === undefined || t.x === undefined || t.y === undefined)
          continue;

        const highlight =
          selectedRef.current &&
          (s.id === selectedRef.current || t.id === selectedRef.current);

        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(t.x, t.y);
        ctx.strokeStyle = highlight ? "#c87d1a" : edgeColor;
        ctx.lineWidth = highlight ? 2.2 : 1.2;
        if (link.aiGenerated) {
          ctx.setLineDash([4, 4]);
        } else {
          ctx.setLineDash([]);
        }
        ctx.stroke();

        // Edge label when selected
        if (highlight) {
          const mx = (s.x + t.x) / 2;
          const my = (s.y + t.y) / 2;
          ctx.fillStyle = labelMuted;
          ctx.font = "10px monospace";
          ctx.fillText(link.relationType, mx + 4, my - 4);
        }
      }
      ctx.setLineDash([]);

      // Draw nodes
      for (const node of nodes) {
        if (node.x === undefined || node.y === undefined) continue;
        const r = Math.min(18, 8 + node.degree * 2);
        const isSelected = node.id === selectedRef.current;
        const isHovered = node.id === hoveredId;
        const fill = NODE_COLORS[node.item.type] ?? "#c87d1a";

        ctx.beginPath();
        ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
        ctx.fillStyle = fill;
        ctx.fill();

        if (isSelected || isHovered) {
          ctx.lineWidth = 3;
          ctx.strokeStyle = textColor;
          ctx.stroke();
        }

        const label =
          node.item.title.length > 26
            ? `${node.item.title.slice(0, 24)}…`
            : node.item.title;
        ctx.font = isSelected ? "600 12px sans-serif" : "11px sans-serif";
        ctx.fillStyle = textColor;
        ctx.textAlign = "center";
        ctx.fillText(label, node.x, node.y + r + 14);
      }

      ctx.restore();
    };

    simulation.on("tick", draw);

    const toGraphCoords = (clientX: number, clientY: number) => {
      const rect = canvas.getBoundingClientRect();
      const x = (clientX - rect.left - transform.x) / transform.k;
      const y = (clientY - rect.top - transform.y) / transform.k;
      return { x, y };
    };

    const findNodeAt = (gx: number, gy: number): GraphNode | null => {
      for (let i = nodes.length - 1; i >= 0; i--) {
        const n = nodes[i];
        if (n.x === undefined || n.y === undefined) continue;
        const dx = n.x - gx;
        const dy = n.y - gy;
        if (dx * dx + dy * dy <= 22 * 22) return n;
      }
      return null;
    };

    const onPointerDown = (e: PointerEvent) => {
      const { x, y } = toGraphCoords(e.clientX, e.clientY);
      const hit = findNodeAt(x, y);
      if (hit) {
        draggedNode = hit;
        hit.fx = hit.x;
        hit.fy = hit.y;
        simulation.alphaTarget(0.25).restart();
        onSelectNode(hit.id);
      } else {
        isPanning = true;
        panStart = { x: e.clientX - transform.x, y: e.clientY - transform.y };
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      if (draggedNode) {
        const { x, y } = toGraphCoords(e.clientX, e.clientY);
        draggedNode.fx = x;
        draggedNode.fy = y;
        return;
      }
      if (isPanning) {
        transform.x = e.clientX - panStart.x;
        transform.y = e.clientY - panStart.y;
        draw();
        return;
      }
      const { x, y } = toGraphCoords(e.clientX, e.clientY);
      const hit = findNodeAt(x, y);
      hoveredId = hit?.id ?? null;
      canvas.style.cursor = hit ? "pointer" : "grab";
      draw();
    };

    const onPointerUp = () => {
      if (draggedNode) {
        draggedNode.fx = null;
        draggedNode.fy = null;
        draggedNode = null;
        simulation.alphaTarget(0);
      }
      isPanning = false;
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.08 : 0.92;
      const nextK = Math.min(2.4, Math.max(0.45, transform.k * factor));
      transform.k = nextK;
      draw();
    };

    canvas.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("wheel", onWheel, { passive: false });

    return () => {
      simulation.stop();
      canvas.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("wheel", onWheel);
    };
  }, [items, edges, onSelectNode]);

  return (
    <canvas
      ref={canvasRef}
      aria-label="Interactive Knowledge Graph"
      style={{ display: "block", width: "100%", height: "540px" }}
    />
  );
}
