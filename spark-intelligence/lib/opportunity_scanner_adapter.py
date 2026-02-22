"""
Adapter for opportunity_scanner — future migration path to spark-learning-systems.

Currently delegates to the local lib.opportunity_scanner module.
When opportunity_scanner moves to spark-learning-systems (system 27),
update the try/except below to prefer the external package.

Created 2026-02-22 as part of advisory system overhaul.
"""

from __future__ import annotations

try:
    # Future: import from spark-learning-systems package
    # from spark_learning_systems.opportunity_scanner import (
    #     scan_runtime_opportunities,
    #     get_recent_self_opportunities,
    #     generate_user_opportunities,
    #     get_scanner_status,
    # )
    # from spark_learning_systems.opportunity_inbox import (
    #     load_self_opportunities,
    #     resolve_opportunity,
    #     record_decision,
    # )
    raise ImportError("spark_learning_systems not installed yet")
except ImportError:
    # Local fallback (current production path)
    from .opportunity_scanner import (  # noqa: F401
        scan_runtime_opportunities,
        get_recent_self_opportunities,
        generate_user_opportunities,
        get_scanner_status,
    )
    from .opportunity_inbox import (  # noqa: F401
        load_self_opportunities,
        resolve_opportunity,
        record_decision,
    )
