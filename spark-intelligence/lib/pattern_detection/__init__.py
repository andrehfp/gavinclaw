"""
Spark Pattern Detection Layer

Detects meaningful patterns from raw events:
- CorrectionDetector: "no, I meant..." signals
- SentimentDetector: satisfaction/frustration
- RepetitionDetector: same request 3+ times
- SemanticIntentDetector: polite redirects and implicit preferences
- WhyDetector: reasoning, causality, and principles (HIGH VALUE)

EIDOS Integration (Pattern → EIDOS):
- RequestTracker: Wraps user requests in EIDOS Step envelopes
- PatternDistiller: Converts patterns to EIDOS Distillations
- MemoryGate: Filters low-value items before persistence

The key shift: Patterns become structured decision packets,
not shallow keyword tracking.
"""

from .base import PatternDetector, DetectedPattern, PatternType
from .correction import CorrectionDetector
from .sentiment import SentimentDetector
from .repetition import RepetitionDetector
from .semantic import SemanticIntentDetector
from .why import WhyDetector
from .engagement_surprise import EngagementSurpriseDetector
from .aggregator import PatternAggregator, get_aggregator
from .worker import process_pattern_events, get_pattern_backlog

# EIDOS Integration components
from .request_tracker import RequestTracker, get_request_tracker
from .distiller import PatternDistiller, get_pattern_distiller
from .memory_gate import MemoryGate, get_memory_gate, GateScore

__all__ = [
    # Pattern detectors
    "PatternDetector",
    "DetectedPattern",
    "PatternType",
    "CorrectionDetector",
    "SentimentDetector",
    "RepetitionDetector",
    "SemanticIntentDetector",
    "WhyDetector",
    "EngagementSurpriseDetector",
    "PatternAggregator",
    "get_aggregator",
    "process_pattern_events",
    "get_pattern_backlog",
    # EIDOS Integration
    "RequestTracker",
    "get_request_tracker",
    "PatternDistiller",
    "get_pattern_distiller",
    "MemoryGate",
    "get_memory_gate",
    "GateScore",
]
