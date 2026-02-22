"""
EngagementSurpriseDetector: Detects engagement surprises from X tweets.

Emits ENGAGEMENT_SURPRISE patterns when tracked tweets significantly
over- or under-perform their predictions.

This feeds into the learning pipeline so Spark can improve its
understanding of what content resonates.
"""

from typing import Any, Dict, List

from .base import DetectedPattern, PatternDetector, PatternType


class EngagementSurpriseDetector(PatternDetector):
    """Detects engagement surprise patterns from tweet tracking events.

    Triggers on events with:
    - event_type: "engagement_surprise" or "x_reply_engagement"
    - data containing surprise_type, surprise_ratio, etc.

    Emits ENGAGEMENT_SURPRISE patterns that the aggregator routes
    to EIDOS and the cognitive learner.
    """

    def __init__(self):
        super().__init__("engagement_surprise")

    def process_event(self, event: Dict) -> List[DetectedPattern]:
        """Process an event and detect engagement surprise patterns."""
        patterns: List[DetectedPattern] = []

        event_type = event.get("event_type") or event.get("type", "")
        data = event.get("data", {})

        # Handle direct engagement surprise events
        if event_type == "engagement_surprise":
            pattern = self._process_surprise_event(data, event)
            if pattern:
                patterns.append(pattern)

        # Handle engagement snapshot events that might reveal surprises
        elif event_type == "x_reply_engagement":
            pattern = self._process_engagement_event(data, event)
            if pattern:
                patterns.append(pattern)

        return patterns

    def _process_surprise_event(
        self, data: Dict, event: Dict
    ) -> DetectedPattern | None:
        """Process a direct engagement surprise event."""
        surprise_type = data.get("surprise_type", "")
        surprise_ratio = data.get("surprise_ratio", 1.0)
        tweet_id = data.get("tweet_id", "")
        content = data.get("content_preview", "")
        tone = data.get("tone", "")
        topic = data.get("topic", "")

        if not surprise_type:
            return None

        if surprise_type == "overperform":
            confidence = min(0.95, 0.6 + (surprise_ratio - 2.0) * 0.1)
            insight = (
                f"Tweet about '{topic}' with {tone} tone overperformed "
                f"{surprise_ratio}x prediction"
            )
        else:
            confidence = min(0.90, 0.5 + (1.0 / max(0.01, surprise_ratio)) * 0.1)
            insight = (
                f"Tweet about '{topic}' with {tone} tone underperformed "
                f"({surprise_ratio}x of prediction)"
            )

        return DetectedPattern(
            pattern_type=PatternType.ENGAGEMENT_SURPRISE,
            confidence=confidence,
            evidence=[
                f"surprise_type={surprise_type}",
                f"ratio={surprise_ratio}",
                f"tweet_id={tweet_id}",
            ],
            context={
                "surprise_type": surprise_type,
                "surprise_ratio": surprise_ratio,
                "tone": tone,
                "topic": topic,
                "content_preview": content[:100],
            },
            session_id=event.get("session_id"),
            suggested_insight=insight,
            suggested_category="reasoning",
        )

    def _process_engagement_event(
        self, data: Dict, event: Dict
    ) -> DetectedPattern | None:
        """Process an engagement update and detect implicit surprises."""
        likes = data.get("likes", 0)
        replies = data.get("replies", 0)
        engagement_total = data.get("engagement_total", likes + replies)

        # High engagement is notable
        if engagement_total > 20:
            return DetectedPattern(
                pattern_type=PatternType.ENGAGEMENT_SURPRISE,
                confidence=min(0.85, 0.5 + engagement_total * 0.005),
                evidence=[
                    f"high_engagement={engagement_total}",
                    f"likes={likes}",
                    f"replies={replies}",
                ],
                context={
                    "surprise_type": "high_engagement",
                    "engagement_total": engagement_total,
                    "tweet_id": data.get("tweet_id", ""),
                },
                session_id=event.get("session_id"),
                suggested_insight=(
                    f"High engagement detected ({engagement_total} total) "
                    f"- analyze what worked"
                ),
                suggested_category="reasoning",
            )

        return None
