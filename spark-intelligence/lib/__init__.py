"""
Spark Library - Self-evolving intelligence layer for AI agents.
"""

from .cognitive_learner import (
    CognitiveCategory,
    CognitiveInsight,
    CognitiveLearner,
    get_cognitive_learner,
)

from .mind_bridge import (
    MindBridge,
    get_mind_bridge,
    sync_insight_to_mind,
    sync_all_to_mind,
    retrieve_from_mind,
)

from .markdown_writer import (
    MarkdownWriter,
    get_markdown_writer,
    write_learning,
    write_error,
)

from .promoter import (
    Promoter,
    get_promoter,
    check_and_promote,
)

__all__ = [
    # Cognitive Learning
    "CognitiveCategory",
    "CognitiveInsight", 
    "CognitiveLearner",
    "get_cognitive_learner",
    # Mind Bridge
    "MindBridge",
    "get_mind_bridge",
    "sync_insight_to_mind",
    "sync_all_to_mind",
    "retrieve_from_mind",
    # Markdown Writer
    "MarkdownWriter",
    "get_markdown_writer",
    "write_learning",
    "write_error",
    # Promoter
    "Promoter",
    "get_promoter",
    "check_and_promote",
]
