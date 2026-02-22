"""
ConvoIQ Event Pipeline - Convert X conversation data into Spark events.

Follows the same pattern as x_research_events.py but for conversation
intelligence: replies sent, engagement observed, DNA extracted.

Events flow through the chip system, allowing the social-convo chip to:
1. Observe reply patterns
2. Extract conversation DNA
3. Store chip insights for validation
4. Eventually promote high-confidence patterns
"""

import json
import time
from pathlib import Path
from typing import Dict, List, Any, Optional
from datetime import datetime


CONVO_EVENTS_FILE = Path.home() / ".spark" / "convo_events.jsonl"


def create_reply_event(
    reply_text: str,
    parent_text: str,
    author_handle: str = "",
    tone_used: str = "conversational",
    hook_type: str = "observation",
    thread_depth: int = 1,
    tweet_id: str = "",
    reply_to_id: str = "",
    metadata: Optional[Dict] = None,
) -> Dict[str, Any]:
    """Create a reply event for chip processing.

    Args:
        reply_text: The reply we sent
        parent_text: The tweet we replied to
        author_handle: Who we replied to
        tone_used: Which tone style was used
        hook_type: How we opened the reply
        thread_depth: Position in thread
        tweet_id: ID of our reply tweet
        reply_to_id: ID of the parent tweet
        metadata: Additional metadata

    Returns:
        Event dict ready for chip processing
    """
    return {
        "event_type": "x_reply",
        "tool_name": "ConvoIQ",
        "timestamp": time.time(),
        "session_id": f"convo_{datetime.now().strftime('%Y%m%d')}",
        "data": {
            "reply_text": reply_text,
            "parent_text": parent_text,
            "author_handle": author_handle,
            "tone_used": tone_used,
            "hook_type": hook_type,
            "thread_depth": thread_depth,
            "tweet_id": tweet_id,
            "reply_to_id": reply_to_id,
            **(metadata or {}),
        },
        "input": {
            "content": reply_text,
            "parent_content": parent_text,
        },
    }


def create_engagement_event(
    tweet_id: str,
    likes: int = 0,
    replies: int = 0,
    retweets: int = 0,
    author_responded: bool = False,
    warmth_change: str = "",
    metadata: Optional[Dict] = None,
) -> Dict[str, Any]:
    """Create an engagement outcome event.

    Args:
        tweet_id: Which reply we're tracking
        likes: Like count
        replies: Reply count
        retweets: Retweet count
        author_responded: Did the original author respond
        warmth_change: Whether warmth changed (increased/decreased/none)
        metadata: Additional metadata

    Returns:
        Event dict for chip processing
    """
    return {
        "event_type": "x_reply_engagement",
        "tool_name": "ConvoIQ",
        "timestamp": time.time(),
        "session_id": f"convo_{datetime.now().strftime('%Y%m%d')}",
        "data": {
            "tweet_id": tweet_id,
            "likes": likes,
            "replies": replies,
            "retweets": retweets,
            "author_responded": author_responded,
            "warmth_change": warmth_change,
            "engagement_total": likes + replies * 2 + retweets,
            **(metadata or {}),
        },
        "input": {
            "tweet_id": tweet_id,
        },
    }


def create_dna_event(
    pattern_type: str,
    hook_type: str,
    tone: str,
    engagement_score: float,
    example_text: str = "",
    topic_tags: Optional[List[str]] = None,
    metadata: Optional[Dict] = None,
) -> Dict[str, Any]:
    """Create a conversation DNA extraction event.

    Args:
        pattern_type: hook_and_expand | question_chain | build_together | debate
        hook_type: question | observation | challenge | agreement | addition
        tone: witty | technical | conversational | provocative
        engagement_score: How well it performed (0-10)
        example_text: The actual reply text
        topic_tags: Tags for categorization
        metadata: Additional metadata

    Returns:
        Event dict for chip processing
    """
    return {
        "event_type": "x_conversation_dna",
        "tool_name": "ConvoIQ",
        "timestamp": time.time(),
        "session_id": f"convo_{datetime.now().strftime('%Y%m%d')}",
        "data": {
            "pattern_type": pattern_type,
            "hook_type": hook_type,
            "tone": tone,
            "engagement_score": engagement_score,
            "example_text": example_text[:280],
            "topic_tags": topic_tags or [],
            **(metadata or {}),
        },
        "input": {
            "pattern_type": pattern_type,
            "content": example_text[:280],
        },
    }


def store_convo_events(events: List[Dict[str, Any]]) -> int:
    """Store conversation events for later processing."""
    if not events:
        return 0

    CONVO_EVENTS_FILE.parent.mkdir(parents=True, exist_ok=True)
    with CONVO_EVENTS_FILE.open("a", encoding="utf-8") as f:
        for event in events:
            f.write(json.dumps(event, ensure_ascii=False) + "\n")

    return len(events)


def read_pending_convo_events(limit: int = 100) -> List[Dict[str, Any]]:
    """Read pending conversation events for chip processing."""
    if not CONVO_EVENTS_FILE.exists():
        return []

    try:
        lines = CONVO_EVENTS_FILE.read_text(encoding="utf-8").splitlines()
        events = []
        for line in lines[-limit:]:
            if line.strip():
                events.append(json.loads(line))
        return events
    except Exception:
        return []


def process_convo_through_chips(
    reply_data: List[Dict[str, Any]],
    project_path: Optional[str] = None,
) -> Dict[str, Any]:
    """Process conversation data through the chip system.

    Main entry point for conversation intelligence -> Spark learning.

    Args:
        reply_data: List of reply dicts with keys:
            - reply_text: The reply sent
            - parent_text: What was replied to
            - author_handle: Who was replied to
            - tone_used: Tone style used
            - hook_type: How the reply opened
            - engagement: Optional engagement metrics dict
        project_path: Optional project path for chip activation

    Returns:
        Stats about processing
    """
    from lib.chips.runtime import get_runtime

    stats = {
        "events_created": 0,
        "insights_captured": 0,
        "chips_used": set(),
    }

    runtime = get_runtime()

    for reply in reply_data:
        # Create reply event
        event = create_reply_event(
            reply_text=reply.get("reply_text", ""),
            parent_text=reply.get("parent_text", ""),
            author_handle=reply.get("author_handle", ""),
            tone_used=reply.get("tone_used", "conversational"),
            hook_type=reply.get("hook_type", "observation"),
        )

        stats["events_created"] += 1

        # Process through chip system
        insights = runtime.process_event(event, project_path)
        stats["insights_captured"] += len(insights)

        for insight in insights:
            stats["chips_used"].add(insight.chip_id)

        # If engagement data is provided, create engagement event too
        engagement = reply.get("engagement")
        if engagement:
            eng_event = create_engagement_event(
                tweet_id=reply.get("tweet_id", ""),
                likes=engagement.get("likes", 0),
                replies=engagement.get("replies", 0),
                retweets=engagement.get("retweets", 0),
                author_responded=engagement.get("author_responded", False),
            )
            insights = runtime.process_event(eng_event, project_path)
            stats["events_created"] += 1
            stats["insights_captured"] += len(insights)

    # Store events for audit trail
    events = []
    for r in reply_data:
        events.append(create_reply_event(
            reply_text=r.get("reply_text", ""),
            parent_text=r.get("parent_text", ""),
            author_handle=r.get("author_handle", ""),
            tone_used=r.get("tone_used", "conversational"),
            hook_type=r.get("hook_type", "observation"),
        ))
    store_convo_events(events)

    stats["chips_used"] = list(stats["chips_used"])
    return stats
