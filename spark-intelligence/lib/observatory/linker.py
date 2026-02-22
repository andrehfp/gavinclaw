"""Wiki-link utilities for Obsidian cross-references."""

from __future__ import annotations

STAGE_SLUGS = {
    1: "01-event-capture",
    2: "02-queue",
    3: "03-pipeline",
    4: "04-memory-capture",
    5: "05-meta-ralph",
    6: "06-cognitive-learner",
    7: "07-eidos",
    8: "08-advisory",
    9: "09-promotion",
    10: "10-chips",
    11: "11-predictions",
    12: "12-tuneables",
}

STAGE_NAMES = {
    1: "Event Capture",
    2: "Queue",
    3: "Pipeline",
    4: "Memory Capture",
    5: "Meta-Ralph",
    6: "Cognitive Learner",
    7: "EIDOS",
    8: "Advisory",
    9: "Promotion",
    10: "Chips",
    11: "Predictions",
    12: "Tuneables",
}


def stage_link(num: int, display: str | None = None) -> str:
    """Generate [[stages/01-event-capture|Event Capture]] style link."""
    slug = STAGE_SLUGS.get(num, f"{num:02d}-unknown")
    label = display or STAGE_NAMES.get(num, f"Stage {num}")
    return f"[[stages/{slug}|{label}]]"


def stage_link_from_stage(num: int, display: str | None = None) -> str:
    """Link from within stages/ directory to a sibling stage."""
    slug = STAGE_SLUGS.get(num, f"{num:02d}-unknown")
    label = display or STAGE_NAMES.get(num, f"Stage {num}")
    return f"[[{slug}|{label}]]"


def flow_link() -> str:
    """Link back to the main flow dashboard from a stage page."""
    return "[[../flow|Intelligence Flow]]"


def existing_link(page: str, display: str | None = None) -> str:
    """Link to existing pages (watchtower, packets/index) from _observatory/."""
    label = display or page
    return f"[[../{page}|{label}]]"


def health_badge(status: str) -> str:
    """Return a text badge for health status."""
    if status == "healthy":
        return "healthy"
    elif status == "warning":
        return "WARNING"
    elif status == "critical":
        return "CRITICAL"
    return status


def fmt_ts(ts: float | None) -> str:
    """Format a unix timestamp as human-readable, or 'never'."""
    if not ts:
        return "never"
    import datetime
    try:
        dt = datetime.datetime.fromtimestamp(ts)
        return dt.strftime("%Y-%m-%d %H:%M:%S")
    except Exception:
        return str(ts)


def fmt_ago(ts: float | None) -> str:
    """Format a unix timestamp as 'Xs ago' / 'Xm ago' / 'Xh ago'."""
    if not ts:
        return "never"
    import time
    diff = time.time() - ts
    if diff < 0:
        return "just now"
    if diff < 60:
        return f"{int(diff)}s ago"
    if diff < 3600:
        return f"{int(diff/60)}m ago"
    if diff < 86400:
        return f"{diff/3600:.1f}h ago"
    return f"{diff/86400:.1f}d ago"


def fmt_size(size_bytes: int) -> str:
    """Format bytes as human-readable size."""
    if size_bytes < 1024:
        return f"{size_bytes}B"
    if size_bytes < 1024 * 1024:
        return f"{size_bytes/1024:.1f}KB"
    return f"{size_bytes/(1024*1024):.1f}MB"


def fmt_num(n: int | float) -> str:
    """Format large numbers with commas."""
    if isinstance(n, float):
        return f"{n:,.1f}"
    return f"{n:,}"
