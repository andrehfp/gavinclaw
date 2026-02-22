"""
EIDOS Memory Gate: Earn the Right to Persist

Not everything becomes durable memory. Steps must earn persistence
through measurable signals of importance.

Scoring Signals:
- High impact (unblocked progress)     +0.3
- Novelty (new pattern)                +0.2
- Surprise (prediction ≠ outcome)      +0.3
- Recurrence (3+ times)                +0.2
- Irreversible (security, prod, funds) +0.4

Score > 0.5 → durable memory
Score < 0.5 → short-lived cache (24-72 hours)
"""

import re
import time
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Set, Tuple

from .models import Step, Evaluation


@dataclass
class ImportanceScore:
    """Detailed breakdown of a step's importance score."""
    total: float
    impact: float = 0.0
    novelty: float = 0.0
    surprise: float = 0.0
    recurrence: float = 0.0
    irreversibility: float = 0.0
    reasons: List[str] = field(default_factory=list)

    @property
    def is_durable(self) -> bool:
        """Should this step become durable memory?"""
        return self.total >= 0.5


# Keywords that suggest irreversible or high-stakes actions
IRREVERSIBLE_KEYWORDS = [
    "production", "prod", "deploy", "delete", "drop", "truncate",
    "security", "auth", "password", "secret", "key", "token",
    "payment", "billing", "charge", "funds", "transfer",
    "migration", "schema", "database", "backup",
    "publish", "release", "merge main", "push to main"
]

# Keywords that suggest unblocking progress
IMPACT_KEYWORDS = [
    "fixed", "solved", "working", "success", "resolved",
    "unblocked", "breakthrough", "found the issue", "root cause",
    "finally", "that was it", "figured out"
]

# Keywords that suggest novelty
NOVELTY_KEYWORDS = [
    "never seen", "new pattern", "first time", "didn't know",
    "learned", "discovered", "unexpected", "interesting",
    "undocumented", "edge case"
]


class MemoryGate:
    """
    Gate that determines which steps earn durable memory status.

    The gate maintains state to track:
    - Seen patterns (for novelty detection)
    - Recent lessons (for recurrence detection)
    - Domains touched (for context)
    """

    def __init__(self):
        # Pattern tracking
        self.seen_patterns: Set[str] = set()
        self.lesson_counts: Dict[str, int] = {}  # lesson_hash -> count
        self.pattern_timestamps: Dict[str, float] = {}  # pattern -> last_seen

        # Cache for short-lived items
        self.cache_expiry: Dict[str, float] = {}  # step_id -> expiry_timestamp

    def score_step(self, step: Step, context: Optional[Dict[str, Any]] = None) -> ImportanceScore:
        """
        Score a step's importance for memory persistence.

        Args:
            step: The step to score
            context: Optional context (domain, recent_steps, etc.)

        Returns:
            ImportanceScore with breakdown and total
        """
        context = context or {}
        reasons = []

        # 1. Impact score (did it unblock progress?)
        impact = self._score_impact(step, context)
        if impact > 0:
            reasons.append(f"Impact: unblocked progress ({impact:.2f})")

        # 2. Novelty score (is this a new pattern?)
        novelty = self._score_novelty(step, context)
        if novelty > 0:
            reasons.append(f"Novelty: new pattern ({novelty:.2f})")

        # 3. Surprise score (prediction ≠ outcome)
        surprise = self._score_surprise(step)
        if surprise > 0:
            reasons.append(f"Surprise: unexpected outcome ({surprise:.2f})")

        # 4. Recurrence score (seen this 3+ times)
        recurrence = self._score_recurrence(step)
        if recurrence > 0:
            reasons.append(f"Recurrence: pattern repeated ({recurrence:.2f})")

        # 5. Irreversibility score (high-stakes action)
        irreversibility = self._score_irreversibility(step, context)
        if irreversibility > 0:
            reasons.append(f"Irreversible: high-stakes action ({irreversibility:.2f})")

        total = impact + novelty + surprise + recurrence + irreversibility

        # Cap at 1.0
        total = min(total, 1.0)

        return ImportanceScore(
            total=total,
            impact=impact,
            novelty=novelty,
            surprise=surprise,
            recurrence=recurrence,
            irreversibility=irreversibility,
            reasons=reasons
        )

    def _score_impact(self, step: Step, context: Dict[str, Any]) -> float:
        """Score based on whether step unblocked progress."""
        score = 0.0

        # Success evaluation is impactful
        if step.evaluation == Evaluation.PASS:
            score += 0.15

        # Check result and lesson for impact keywords
        text = f"{step.result} {step.lesson}".lower()
        for keyword in IMPACT_KEYWORDS:
            if keyword in text:
                score += 0.05
                break  # Only count once

        # High confidence increase is impactful
        confidence_delta = step.confidence_after - step.confidence_before
        if confidence_delta > 0.3:
            score += 0.1

        return min(score, 0.3)

    def _score_novelty(self, step: Step, context: Dict[str, Any]) -> float:
        """Score based on whether this is a new pattern."""
        score = 0.0

        # Create pattern signature
        pattern = self._create_pattern_signature(step)

        # Check if we've seen this pattern before
        if pattern not in self.seen_patterns:
            score += 0.15
            self.seen_patterns.add(pattern)
            self.pattern_timestamps[pattern] = time.time()
        else:
            # Check if it's been a while since we saw it
            last_seen = self.pattern_timestamps.get(pattern, 0)
            days_since = (time.time() - last_seen) / 86400
            if days_since > 7:
                score += 0.1  # Semi-novel if >7 days

        # Check for novelty keywords
        text = f"{step.result} {step.lesson}".lower()
        for keyword in NOVELTY_KEYWORDS:
            if keyword in text:
                score += 0.05
                break

        return min(score, 0.2)

    def _score_surprise(self, step: Step) -> float:
        """Score based on prediction vs outcome mismatch."""
        # Use the step's calculated surprise level
        if step.surprise_level > 0:
            return step.surprise_level * 0.3

        # Calculate our own surprise if not set
        if step.evaluation == Evaluation.FAIL and step.confidence_before > 0.7:
            return 0.25  # High confidence + failure = surprising

        if step.evaluation == Evaluation.PASS and step.confidence_before < 0.3:
            return 0.2  # Low confidence + success = somewhat surprising

        return 0.0

    def _score_recurrence(self, step: Step) -> float:
        """Score based on how often we've seen this lesson."""
        if not step.lesson:
            return 0.0

        # Hash the lesson for tracking
        lesson_hash = self._hash_lesson(step.lesson)

        # Increment count
        self.lesson_counts[lesson_hash] = self.lesson_counts.get(lesson_hash, 0) + 1
        count = self.lesson_counts[lesson_hash]

        # 3+ occurrences is significant
        if count >= 3:
            return 0.2
        elif count == 2:
            return 0.1

        return 0.0

    def _score_irreversibility(self, step: Step, context: Dict[str, Any]) -> float:
        """Score based on whether action is irreversible/high-stakes."""
        score = 0.0

        # Check action details and result
        text = f"{step.intent} {step.decision} {step.result}".lower()
        text += " " + str(step.action_details).lower()

        for keyword in IRREVERSIBLE_KEYWORDS:
            if keyword in text:
                score += 0.2
                break

        # Check domain context
        domain = context.get("domain", "")
        if domain in ["production", "security", "fintech", "payments"]:
            score += 0.2

        return min(score, 0.4)

    def _create_pattern_signature(self, step: Step) -> str:
        """Create a signature for pattern matching."""
        # Combine key fields into a normalized signature
        parts = [
            step.action_type.value if step.action_type else "",
            step.intent[:50] if step.intent else "",
            step.evaluation.value if step.evaluation else ""
        ]
        return "|".join(parts).lower()

    def _hash_lesson(self, lesson: str) -> str:
        """Create a hash of a lesson for tracking recurrence."""
        # Simple normalization
        normalized = lesson.lower().strip()
        # Remove punctuation
        normalized = re.sub(r'[^\w\s]', '', normalized)
        # Take first 100 chars
        return normalized[:100]

    def should_persist(self, step: Step, context: Optional[Dict[str, Any]] = None) -> Tuple[bool, ImportanceScore]:
        """
        Determine if a step should be persisted to durable memory.

        Returns:
            Tuple of (should_persist, score)
        """
        score = self.score_step(step, context)
        return (score.is_durable, score)

    def set_cache_expiry(self, step_id: str, hours: int = 24):
        """Mark a step for cache expiry (short-lived memory)."""
        self.cache_expiry[step_id] = time.time() + (hours * 3600)

    def get_expired_cache_items(self) -> List[str]:
        """Get step IDs that have expired from cache."""
        now = time.time()
        expired = [sid for sid, expiry in self.cache_expiry.items() if now > expiry]
        # Clean up
        for sid in expired:
            del self.cache_expiry[sid]
        return expired

    def get_stats(self) -> Dict[str, Any]:
        """Get statistics about the memory gate."""
        return {
            "unique_patterns": len(self.seen_patterns),
            "lesson_variants": len(self.lesson_counts),
            "recurring_lessons": len([c for c in self.lesson_counts.values() if c >= 3]),
            "cached_items": len(self.cache_expiry)
        }


def score_step_importance(step: Step, context: Optional[Dict[str, Any]] = None) -> ImportanceScore:
    """
    Convenience function to score a step's importance.

    Args:
        step: The step to score
        context: Optional context

    Returns:
        ImportanceScore with breakdown
    """
    gate = MemoryGate()
    return gate.score_step(step, context)
