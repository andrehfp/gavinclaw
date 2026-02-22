"""Generate Obsidian Canvas (.canvas) for spatial flow visualization."""

from __future__ import annotations

import json


def generate_canvas() -> str:
    """Generate flow.canvas JSON for Obsidian's spatial canvas view."""
    nodes = []
    edges = []
    uid = 0

    def _node(nid: str, file: str, x: int, y: int, w: int = 300, h: int = 140, color: str | None = None) -> dict:
        n: dict = {
            "id": nid,
            "type": "file",
            "file": file,
            "x": x, "y": y,
            "width": w, "height": h,
        }
        if color:
            n["color"] = color
        return n

    def _text_node(nid: str, text: str, x: int, y: int, w: int = 220, h: int = 80, color: str | None = None) -> dict:
        n: dict = {
            "id": nid,
            "type": "text",
            "text": text,
            "x": x, "y": y,
            "width": w, "height": h,
        }
        if color:
            n["color"] = color
        return n

    def _edge(eid: str, from_node: str, to_node: str, from_side: str = "right", to_side: str = "left", label: str | None = None) -> dict:
        e: dict = {
            "id": eid,
            "fromNode": from_node,
            "fromSide": from_side,
            "toNode": to_node,
            "toSide": to_side,
        }
        if label:
            e["label"] = label
        return e

    base = "_observatory/stages"

    # ── Row 1: Main pipeline (left to right) ──
    # Event Capture → Queue → Pipeline
    nodes.append(_node("capture", f"{base}/01-event-capture.md", 0, 0))
    nodes.append(_node("queue", f"{base}/02-queue.md", 380, 0))
    nodes.append(_node("pipeline", f"{base}/03-pipeline.md", 760, 0, color="4"))

    edges.append(_edge("e1", "capture", "queue"))
    edges.append(_edge("e2", "queue", "pipeline"))

    # ── Row 2: Processing branches from Pipeline ──
    # Memory Capture → Meta-Ralph → Cognitive
    nodes.append(_node("memory", f"{base}/04-memory-capture.md", 380, 220))
    nodes.append(_node("metaralph", f"{base}/05-meta-ralph.md", 760, 220, color="2"))
    nodes.append(_node("cognitive", f"{base}/06-cognitive-learner.md", 1140, 220, color="4"))

    edges.append(_edge("e3", "pipeline", "memory", from_side="bottom", to_side="top"))
    edges.append(_edge("e4", "memory", "metaralph"))
    edges.append(_edge("e5", "metaralph", "cognitive", label="pass"))

    # Rejected branch
    nodes.append(_text_node("rejected", "**Rejected**\n_Below threshold_", 760, 440, color="1"))
    edges.append(_edge("e5b", "metaralph", "rejected", from_side="bottom", to_side="top", label="reject"))

    # ── Row 3: EIDOS (parallel track below pipeline) ──
    nodes.append(_node("eidos", f"{base}/07-eidos.md", 1140, -180))
    edges.append(_edge("e6", "pipeline", "eidos", from_side="top", to_side="left"))

    # ── Row 4: Advisory (convergence point) ──
    nodes.append(_node("advisory", f"{base}/08-advisory.md", 1520, 80, w=320, h=160, color="6"))
    edges.append(_edge("e7", "cognitive", "advisory"))
    edges.append(_edge("e8", "eidos", "advisory", from_side="right", to_side="top"))

    # ── Chips branch ──
    nodes.append(_node("chips", f"{base}/10-chips.md", 1140, 440))
    edges.append(_edge("e9", "pipeline", "chips", from_side="bottom", to_side="left"))
    edges.append(_edge("e10", "chips", "advisory", from_side="right", to_side="bottom"))

    # ── Predictions (loop back to EIDOS) ──
    nodes.append(_node("predictions", f"{base}/11-predictions.md", 760, -180))
    edges.append(_edge("e11", "pipeline", "predictions", from_side="top", to_side="bottom"))
    edges.append(_edge("e12", "predictions", "eidos"))

    # ── Promotion (output) ──
    nodes.append(_node("promotion", f"{base}/09-promotion.md", 1900, 80, color="5"))
    edges.append(_edge("e13", "advisory", "promotion"))

    # ── Tuneables (configures) ──
    nodes.append(_node("tuneables", f"{base}/12-tuneables.md", 1520, -180, w=260, h=120))
    edges.append(_edge("e14", "tuneables", "metaralph", from_side="bottom", to_side="top", label="configures"))
    edges.append(_edge("e15", "tuneables", "advisory", from_side="bottom", to_side="top", label="configures"))

    # ── Flow dashboard (top-left) ──
    nodes.append(_node("flow", "_observatory/flow.md", -300, -100, w=240, h=100, color="4"))

    canvas = {
        "nodes": nodes,
        "edges": edges,
    }
    return json.dumps(canvas, indent=2)
