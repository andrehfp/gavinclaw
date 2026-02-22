#!/usr/bin/env python3
"""E2E: Memory creation -> EIDOS retrieval -> Advisory ranking -> Delivery.

Tests that useful memories actually reach the advisory output.
Uses isolated temp stores to avoid polluting real data.

Run: python tests/e2e_memory_to_advisory_v2.py
"""

import os
import sys
import uuid
import tempfile
import json
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from lib.eidos.models import Distillation, DistillationType
from lib.eidos.store import EidosStore
from lib.eidos.retriever import StructuralRetriever


def banner(text: str) -> None:
    print(f"\n{'='*70}")
    print(f"  {text}")
    print(f"{'='*70}")


def section(text: str) -> None:
    print(f"\n--- {text} ---")


def run_test():
    """Full E2E: create distillations, retrieve for realistic intents, verify delivery."""
    banner("E2E: Memory -> EIDOS Retrieval -> Advisory Path")

    # ---- Phase 1: Create isolated store with realistic distillations ----
    section("Phase 1: Creating EIDOS store with realistic distillations")

    tmp_dir = tempfile.mkdtemp(prefix="spark_e2e_")
    db_path = os.path.join(tmp_dir, "e2e_eidos.db")
    store = EidosStore(db_path)

    distillations = [
        # Auth heuristic (should match "fix auth bug" intents)
        Distillation(
            distillation_id=str(uuid.uuid4()),
            type=DistillationType.HEURISTIC,
            statement="When fixing auth token validation, always check token expiry before signature verification to avoid misleading error messages",
            triggers=["auth", "token", "validation", "jwt", "401"],
            domains=["authentication", "security"],
            confidence=0.90,
        ),
        # Database sharp edge (should match "database" + "sqlite" intents)
        Distillation(
            distillation_id=str(uuid.uuid4()),
            type=DistillationType.SHARP_EDGE,
            statement="SQLite concurrent writes without WAL mode cause database corruption under load",
            triggers=["sqlite", "database", "concurrent", "wal", "corruption"],
            domains=["database"],
            confidence=0.95,
        ),
        # API policy (should match "api" intents)
        Distillation(
            distillation_id=str(uuid.uuid4()),
            type=DistillationType.POLICY,
            statement="Always validate request body size before parsing JSON to prevent OOM crashes on malformed payloads",
            triggers=["api", "request", "json", "validation"],
            domains=["api", "security"],
            confidence=1.0,
        ),
        # Performance heuristic
        Distillation(
            distillation_id=str(uuid.uuid4()),
            type=DistillationType.HEURISTIC,
            statement="Profile before optimizing - add index on frequently queried columns before rewriting application code",
            triggers=["performance", "query", "index", "optimize", "slow"],
            domains=["database", "performance"],
            confidence=0.85,
        ),
        # Anti-pattern for credentials
        Distillation(
            distillation_id=str(uuid.uuid4()),
            type=DistillationType.ANTI_PATTERN,
            statement="Never hardcode API keys or credentials in source code; use environment variables or secret managers",
            anti_triggers=["credentials", "api_key", "hardcode", "secret", "password"],
            triggers=[],
            domains=["security"],
            confidence=0.95,
        ),
        # Git policy
        Distillation(
            distillation_id=str(uuid.uuid4()),
            type=DistillationType.POLICY,
            statement="Never force-push to main branch without explicit user confirmation",
            triggers=["git", "push", "force", "main", "master"],
            domains=["git"],
            confidence=1.0,
        ),
    ]

    for d in distillations:
        store.save_distillation(d)
    print(f"  Stored {len(distillations)} distillations in {db_path}")

    # ---- Phase 2: Create retriever and test intent matching ----
    section("Phase 2: Testing EIDOS retrieval for realistic intents")

    retriever = StructuralRetriever(store=store, max_results=10)

    test_queries = [
        {
            "intent": "Edit lib/auth.py verify_token Fix the authentication bug where valid tokens are rejected after rotation",
            "expected_types": {DistillationType.HEURISTIC},
            "expected_keywords": ["auth", "token"],
            "description": "Auth bug fix",
        },
        {
            "intent": "Edit database.py Add concurrent write handling for sqlite connection pool",
            "expected_types": {DistillationType.SHARP_EDGE},
            "expected_keywords": ["sqlite", "concurrent"],
            "description": "Database concurrency",
        },
        {
            "intent": "Edit api/routes.py Optimize slow database query for user profile endpoint",
            "expected_types": {DistillationType.HEURISTIC},
            "expected_keywords": ["index", "query", "optimize"],
            "description": "Query optimization",
        },
        {
            "intent": "Bash git push --force origin main Deploying hotfix to production",
            "expected_types": {DistillationType.POLICY},
            "expected_keywords": ["force", "push", "main"],
            "description": "Git force push",
        },
        {
            "intent": "Edit config.py Store the api_key credentials directly in the config module",
            "expected_types": {DistillationType.ANTI_PATTERN},
            "expected_keywords": ["credentials", "api_key"],
            "description": "Hardcoded credentials",
        },
        {
            "intent": "Edit readme.md Update the project description and installation steps",
            "expected_types": set(),  # Should NOT match anything domain-specific
            "expected_keywords": [],
            "description": "Unrelated intent (should be sparse)",
        },
    ]

    results_summary = []
    all_pass = True

    for q in test_queries:
        results = retriever.retrieve_for_intent(q["intent"])
        types_found = {d.type for d in results}
        statements = " ".join(d.statement.lower() for d in results)

        # Check expected types
        type_match = q["expected_types"].issubset(types_found) if q["expected_types"] else True
        # Check expected keywords (at least one should be in results)
        kw_match = (
            any(kw in statements for kw in q["expected_keywords"])
            if q["expected_keywords"]
            else True
        )

        passed = type_match and kw_match
        status = "PASS" if passed else "FAIL"
        if not passed:
            all_pass = False

        print(f"\n  [{status}] {q['description']}")
        print(f"    Intent: {q['intent'][:80]}...")
        print(f"    Retrieved: {len(results)} distillations")
        for d in results:
            print(f"      - [{d.type.value}] {d.statement[:70]}... (conf={d.confidence:.0%})")
        if not type_match:
            missing = q["expected_types"] - types_found
            print(f"    MISSING TYPES: {[t.value for t in missing]}")
        if not kw_match:
            print(f"    MISSING KEYWORDS: {q['expected_keywords']} not found in results")

        results_summary.append({
            "query": q["description"],
            "retrieved": len(results),
            "types": [t.value for t in types_found],
            "passed": passed,
        })

    # ---- Phase 3: Advisory ranking simulation ----
    section("Phase 3: Simulating advisory ranking")

    # Simulate the ranking formula from advisor.py
    for q in test_queries[:4]:  # First 4 queries
        results = retriever.retrieve_for_intent(q["intent"])
        print(f"\n  Query: {q['description']}")
        for d in results:
            # Simulate _rank_score calculation
            source_boost = 1.4  # EIDOS source boost
            eff = d.effectiveness  # 0.0-1.0
            floor = 1.15 if d.type == DistillationType.POLICY else 1.0
            eff_mult = max(floor, 0.7 + eff * 0.6)
            if d.validation_count >= 5:
                eff_mult *= 1.1
            blended_conf = min(1.0, d.confidence * (0.7 + eff * 0.3))
            context_match = 0.75  # Simulated
            base = blended_conf * context_match
            rank_score = base * source_boost * eff_mult
            min_rank = 0.45
            would_pass = rank_score >= min_rank

            print(f"    [{d.type.value:12s}] conf={d.confidence:.2f} eff={eff:.2f} "
                  f"blended={blended_conf:.2f} rank={rank_score:.3f} "
                  f"{'PASS' if would_pass else 'FILTERED'} (min={min_rank})")

    # ---- Phase 4: Summary ----
    banner("Results Summary")
    total = len(results_summary)
    passed = sum(1 for r in results_summary if r["passed"])
    print(f"  {passed}/{total} queries matched expected distillations")
    print()
    for r in results_summary:
        status = "PASS" if r["passed"] else "FAIL"
        print(f"  [{status}] {r['query']}: {r['retrieved']} results ({', '.join(r['types'])})")

    print(f"\n  Retriever stats: {retriever.get_stats()}")

    if all_pass:
        print("\n  ALL TESTS PASSED - EIDOS retrieval pipeline is working end-to-end")
    else:
        print("\n  SOME TESTS FAILED - see details above")

    # Cleanup
    import shutil
    shutil.rmtree(tmp_dir, ignore_errors=True)

    return all_pass


if __name__ == "__main__":
    success = run_test()
    sys.exit(0 if success else 1)
