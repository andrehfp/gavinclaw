#!/usr/bin/env python3
"""Test EIDOS retriever keyword matching fixes.

Verifies that:
1. _get_heuristics() finds distillations by raw keyword triggers (not just category)
2. retrieve_for_intent() returns sharp edges via trigger matching
3. _extract_keywords() removes stop words correctly
"""

import os
import sys
import tempfile
import sqlite3
import uuid

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from lib.eidos.models import Distillation, DistillationType
from lib.eidos.store import EidosStore
from lib.eidos.retriever import StructuralRetriever


@pytest.fixture
def store(tmp_path):
    """Create a temp EIDOS store with test distillations."""
    db_path = str(tmp_path / "test_eidos.db")
    s = EidosStore(db_path)

    # Heuristic with domain-specific triggers
    s.save_distillation(Distillation(
        distillation_id=str(uuid.uuid4()),
                type=DistillationType.HEURISTIC,
        statement="When fixing auth token validation, always check expiry before signature",
        triggers=["auth", "token", "validation", "401"],
        confidence=0.90,
    ))

    # Heuristic with database-specific triggers
    s.save_distillation(Distillation(
        distillation_id=str(uuid.uuid4()),
                type=DistillationType.HEURISTIC,
        statement="Add index on frequently queried columns before optimizing application code",
        triggers=["database", "query", "performance", "index", "sql"],
        confidence=0.85,
    ))

    # Sharp edge
    s.save_distillation(Distillation(
        distillation_id=str(uuid.uuid4()),
                type=DistillationType.SHARP_EDGE,
        statement="SQLite concurrent writes can corrupt the database without WAL mode",
        triggers=["sqlite", "database", "concurrent", "wal"],
        confidence=0.95,
    ))

    # Policy
    s.save_distillation(Distillation(
        distillation_id=str(uuid.uuid4()),
                type=DistillationType.POLICY,
        statement="Always validate auth tokens on every request",
        triggers=["auth", "security"],
        confidence=1.0,
    ))

    # Anti-pattern with specific trigger
    s.save_distillation(Distillation(
        distillation_id=str(uuid.uuid4()),
                type=DistillationType.ANTI_PATTERN,
        statement="Never store plaintext passwords in config files or environment variables",
        anti_triggers=["password", "credentials", "plaintext"],
        triggers=[],
        confidence=0.95,
    ))

    return s


@pytest.fixture
def retriever(store):
    return StructuralRetriever(store=store, max_results=10)


class TestExtractKeywords:
    def test_removes_stop_words(self, retriever):
        words = retriever._extract_keywords("Edit the auth file for token validation")
        assert "the" not in words
        assert "auth" in words
        assert "token" in words
        assert "validation" in words

    def test_removes_tool_stop_words(self, retriever):
        words = retriever._extract_keywords("Execute bash command to read file content")
        assert "execute" not in words
        assert "bash" not in words
        assert "command" not in words
        assert "read" not in words

    def test_deduplicates(self, retriever):
        words = retriever._extract_keywords("auth auth auth token token")
        assert words.count("auth") == 1
        assert words.count("token") == 1


class TestHeuristicRetrieval:
    def test_finds_auth_heuristic_by_trigger_keyword(self, retriever):
        """Previously returned 0 because 'fix auth bug' normalized to 'bug_fixing'."""
        results = retriever._get_heuristics("Edit lib/auth.py verify_token Fix the authentication bug")
        assert len(results) >= 1
        assert any("auth" in d.statement.lower() for d in results)

    def test_finds_database_heuristic_by_trigger_keyword(self, retriever):
        results = retriever._get_heuristics("Optimize database query performance for user table")
        assert len(results) >= 1
        assert any("index" in d.statement.lower() or "query" in d.statement.lower() for d in results)

    def test_still_finds_by_category(self, retriever, store):
        """Category-based search should still work."""
        # Store a heuristic that matches by category
        store.save_distillation(Distillation(
            distillation_id=str(uuid.uuid4()),
                        type=DistillationType.HEURISTIC,
            statement="When fixing bugs, always reproduce before patching",
            triggers=["bug_fixing", "debug"],
            confidence=0.80,
        ))
        results = retriever._get_heuristics("Fix the rendering glitch in sidebar")
        assert len(results) >= 1
        assert any("bug" in d.statement.lower() for d in results)


class TestRetrieveForIntent:
    def test_returns_auth_heuristic(self, retriever):
        """The main entry point should find auth-related heuristics."""
        results = retriever.retrieve_for_intent(
            "Edit lib/auth.py verify_token Fix authentication bug where valid tokens rejected"
        )
        types_found = {d.type for d in results}
        # Should find at least the auth heuristic and/or auth policy
        assert len(results) >= 1
        statements = " ".join(d.statement.lower() for d in results)
        assert "auth" in statements or "token" in statements

    def test_returns_sharp_edges(self, retriever):
        """retrieve_for_intent should now include sharp edges."""
        results = retriever.retrieve_for_intent(
            "Edit database.py Add concurrent write handling for sqlite"
        )
        types_found = {d.type for d in results}
        assert DistillationType.SHARP_EDGE in types_found

    def test_returns_database_heuristic_for_query(self, retriever):
        results = retriever.retrieve_for_intent(
            "Edit models.py Optimize database query for user profiles"
        )
        statements = " ".join(d.statement.lower() for d in results)
        assert "index" in statements or "query" in statements

    def test_returns_policy_with_keyword_overlap(self, retriever):
        results = retriever.retrieve_for_intent(
            "Edit auth_middleware.py Validate auth tokens on incoming requests"
        )
        types_found = {d.type for d in results}
        assert DistillationType.POLICY in types_found

    def test_empty_intent_no_crash(self, retriever):
        results = retriever.retrieve_for_intent("")
        assert isinstance(results, list)

    def test_unrelated_intent_returns_few(self, retriever):
        results = retriever.retrieve_for_intent("Edit readme.md Update project description")
        # Should not match auth/db/sqlite distillations
        assert len(results) <= 2


class TestAntiPatternRetrieval:
    def test_finds_by_anti_trigger(self, retriever):
        results = retriever._get_anti_patterns("Store the user password in config.json", "")
        assert len(results) >= 1
        assert any("password" in d.statement.lower() for d in results)
