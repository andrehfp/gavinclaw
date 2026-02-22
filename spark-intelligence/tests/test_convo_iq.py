#!/usr/bin/env python3
"""Tests for ConvoIQ - Conversation Intelligence engine."""

import json
import sys
from pathlib import Path
from unittest.mock import patch, MagicMock

import pytest

# Ensure project root is on path
ROOT = Path(__file__).parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


# ---------------------------------------------------------------------------
# Hook Classification tests
# ---------------------------------------------------------------------------


class TestHookClassification:
    """Tests for classify_hook and classify_structure."""

    def test_question_hook(self):
        from lib.convo_analyzer import classify_hook

        assert classify_hook("What do you think about this approach?") == "question"

    def test_question_hook_curious(self):
        from lib.convo_analyzer import classify_hook

        assert classify_hook("Curious how you handle error cases here") == "question"

    def test_observation_hook(self):
        from lib.convo_analyzer import classify_hook

        assert classify_hook("Interesting pattern - I noticed the same thing") == "observation"

    def test_challenge_hook(self):
        from lib.convo_analyzer import classify_hook

        assert classify_hook("Actually, I disagree with this take") == "challenge"

    def test_agreement_hook(self):
        from lib.convo_analyzer import classify_hook

        assert classify_hook("Exactly this! Spot on observation") == "agreement"

    def test_addition_hook(self):
        from lib.convo_analyzer import classify_hook

        assert classify_hook("Also worth adding that the perf improved 3x") == "addition"

    def test_default_hook_for_ambiguous(self):
        from lib.convo_analyzer import classify_hook

        result = classify_hook("hello world")
        assert result == "observation"  # Default

    def test_structure_short(self):
        from lib.convo_analyzer import classify_structure

        assert classify_structure("Great point!") == "short"

    def test_structure_medium(self):
        from lib.convo_analyzer import classify_structure

        text = "This is a medium length reply that has some substance to it but is not too long for a tweet."
        assert classify_structure(text) == "medium"

    def test_structure_long(self):
        from lib.convo_analyzer import classify_structure

        text = " ".join(["word"] * 50)
        assert classify_structure(text) == "long"


# ---------------------------------------------------------------------------
# ConvoAnalyzer tests
# ---------------------------------------------------------------------------


class TestConvoAnalyzer:
    """Tests for the core ConvoAnalyzer."""

    @pytest.fixture(autouse=True)
    def setup(self, tmp_path, monkeypatch):
        """Set up temporary state directories."""
        self.convo_dir = tmp_path / "convo_iq"
        self.convo_dir.mkdir()
        monkeypatch.setattr("lib.convo_analyzer.CONVO_DIR", self.convo_dir)
        monkeypatch.setattr("lib.convo_analyzer.DNA_FILE", self.convo_dir / "conversation_dna.json")
        monkeypatch.setattr("lib.convo_analyzer.REPLY_LOG", self.convo_dir / "reply_log.jsonl")

        # Mock x_voice to avoid loading real state
        self.xv_dir = tmp_path / "x_voice"
        self.xv_dir.mkdir()
        monkeypatch.setattr("lib.x_voice.X_VOICE_DIR", self.xv_dir)
        monkeypatch.setattr("lib.x_voice.PROFILES_FILE", self.xv_dir / "profiles.json")

        # Reset spark_voice state
        sv_dir = tmp_path / "spark_voice"
        sv_dir.mkdir()
        monkeypatch.setattr("lib.spark_voice.SPARK_DIR", sv_dir)
        monkeypatch.setattr("lib.spark_voice.VOICE_FILE", sv_dir / "voice.json")

        # Reset singletons
        import lib.convo_analyzer
        import lib.x_voice
        import lib.spark_voice
        lib.convo_analyzer._analyzer = None
        lib.x_voice._x_voice = None
        lib.spark_voice._voice = None

    def _get_analyzer(self):
        from lib.convo_analyzer import ConvoAnalyzer
        return ConvoAnalyzer()

    # --- analyze_reply tests ---

    def test_analyze_reply_returns_analysis(self):
        ca = self._get_analyzer()
        result = ca.analyze_reply("What do you think?", parent_text="AI is evolving fast")
        assert result.hook_type == "question"
        assert result.tone in ("witty", "technical", "conversational", "provocative")
        assert 0 <= result.estimated_engagement <= 10

    def test_analyze_reply_detects_over_length(self):
        ca = self._get_analyzer()
        long_text = "A" * 300
        result = ca.analyze_reply(long_text)
        assert any("280" in w for w in result.weaknesses)

    def test_analyze_reply_short_is_strength(self):
        ca = self._get_analyzer()
        result = ca.analyze_reply("Great point!")
        assert any("concise" in s.lower() for s in result.strengths)

    def test_analyze_reply_challenge_cold_user(self):
        ca = self._get_analyzer()
        result = ca.analyze_reply(
            "Actually, I disagree with this",
            parent_text="Hot take here",
            author_handle="colduser",
        )
        # Cold user + challenge = should flag as risky
        assert any("cold" in w.lower() or "risk" in w.lower() for w in result.weaknesses + result.suggestions)

    # --- extract_dna tests ---

    def test_extract_dna_low_engagement_returns_none(self):
        ca = self._get_analyzer()
        result = ca.extract_dna("meh reply", engagement_score=1.0)
        assert result is None

    def test_extract_dna_high_engagement_creates_pattern(self):
        ca = self._get_analyzer()
        result = ca.extract_dna(
            "What if we combined both approaches?",
            engagement_score=7.0,
            parent_text="There are two schools of thought",
            topic_tags=["architecture"],
        )
        assert result is not None
        assert result.engagement_score == 7.0
        assert result.times_seen == 1
        assert len(result.examples) == 1

    def test_extract_dna_strengthens_existing(self):
        ca = self._get_analyzer()
        # First extraction
        ca.extract_dna("What about X?", engagement_score=6.0)
        # Same pattern type
        ca.extract_dna("How about Y?", engagement_score=8.0)

        # Should have merged into one pattern
        found = False
        for dna in ca.dna_patterns.values():
            if dna.hook_type == "question" and dna.times_seen == 2:
                found = True
                break
        assert found

    def test_extract_dna_persists(self):
        from lib.convo_analyzer import ConvoAnalyzer

        ca1 = self._get_analyzer()
        ca1.extract_dna("Interesting observation here", engagement_score=8.0)

        ca2 = self._get_analyzer()
        assert len(ca2.dna_patterns) > 0

    # --- get_best_hook tests ---

    def test_best_hook_for_question_parent(self):
        ca = self._get_analyzer()
        rec = ca.get_best_hook("How do you handle error cases?")
        assert rec.hook_type == "addition"
        assert "answer" in rec.reasoning.lower()

    def test_best_hook_for_technical_content(self):
        ca = self._get_analyzer()
        rec = ca.get_best_hook("Just deployed a new API architecture with microservices")
        assert rec.tone == "technical"

    def test_best_hook_for_cold_user(self):
        ca = self._get_analyzer()
        rec = ca.get_best_hook(
            "Interesting perspective on AI development",
            author_handle="totally_new_person",
        )
        assert rec.hook_type == "question"
        assert "question" in rec.reasoning.lower() or "new" in rec.reasoning.lower()

    def test_best_hook_confidence_boosted_by_dna(self):
        ca = self._get_analyzer()
        # Add some DNA evidence
        for _ in range(3):
            ca.extract_dna("What about X?", engagement_score=8.0)

        rec = ca.get_best_hook("Here's my theory")
        # DNA-backed hooks should have higher confidence
        if rec.based_on_dna:
            assert rec.confidence > 0.5

    # --- score_reply_draft tests ---

    def test_score_reply_draft_returns_verdict(self):
        ca = self._get_analyzer()
        result = ca.score_reply_draft(
            "Great observation! I've seen similar patterns in production.",
            parent_text="AI error rates drop with better prompts",
        )
        assert "score" in result
        assert "verdict" in result
        assert result["verdict"] in ("strong", "good", "weak", "rethink")

    def test_score_reply_draft_penalizes_over_length(self):
        ca = self._get_analyzer()
        short_result = ca.score_reply_draft("Good point!", parent_text="AI")
        long_result = ca.score_reply_draft("A" * 300, parent_text="AI")
        assert short_result["score"] >= long_result["score"]

    # --- study_reply tests ---

    def test_study_reply_low_engagement_returns_none(self):
        ca = self._get_analyzer()
        result = ca.study_reply(
            "meh reply", engagement={"likes": 0, "replies": 0, "retweets": 0}
        )
        assert result is None

    def test_study_reply_high_engagement_extracts_dna(self):
        ca = self._get_analyzer()
        result = ca.study_reply(
            "What if we used a completely different approach? Here's what I've seen work...",
            engagement={"likes": 10, "replies": 5, "retweets": 2},
            parent_text="Struggling with this design decision",
            topic_tags=["architecture"],
        )
        assert result is not None
        assert result.engagement_score > 0

    # --- log_reply tests ---

    def test_log_reply_creates_file(self):
        ca = self._get_analyzer()
        ca.log_reply(
            reply_text="Great point!",
            parent_text="AI is evolving",
            author_handle="testuser",
            tone_used="conversational",
            hook_type="agreement",
        )
        log_file = self.convo_dir / "reply_log.jsonl"
        assert log_file.exists()
        lines = log_file.read_text().splitlines()
        assert len(lines) == 1
        entry = json.loads(lines[0])
        assert entry["author_handle"] == "testuser"
        assert entry["hook_type"] == "agreement"

    # --- stats tests ---

    def test_get_stats_empty(self):
        ca = self._get_analyzer()
        stats = ca.get_stats()
        assert stats["dna_patterns"] == 0
        assert stats["replies_logged"] == 0

    def test_get_stats_with_data(self):
        ca = self._get_analyzer()
        ca.extract_dna("What about this?", engagement_score=7.0)
        ca.log_reply("reply", "parent", "user", "witty", "question")
        stats = ca.get_stats()
        assert stats["dna_patterns"] > 0
        assert stats["replies_logged"] == 1


# ---------------------------------------------------------------------------
# ConvoEvents tests
# ---------------------------------------------------------------------------


class TestConvoEvents:
    """Tests for the conversation event pipeline."""

    @pytest.fixture(autouse=True)
    def setup(self, tmp_path, monkeypatch):
        self.events_file = tmp_path / "convo_events.jsonl"
        monkeypatch.setattr("lib.convo_events.CONVO_EVENTS_FILE", self.events_file)

    def test_create_reply_event_structure(self):
        from lib.convo_events import create_reply_event

        event = create_reply_event(
            reply_text="Great observation!",
            parent_text="AI is moving fast",
            author_handle="testuser",
            tone_used="witty",
            hook_type="agreement",
        )
        assert event["event_type"] == "x_reply"
        assert event["tool_name"] == "ConvoIQ"
        assert event["data"]["reply_text"] == "Great observation!"
        assert event["data"]["author_handle"] == "testuser"
        assert event["data"]["tone_used"] == "witty"
        assert event["data"]["hook_type"] == "agreement"

    def test_create_engagement_event_structure(self):
        from lib.convo_events import create_engagement_event

        event = create_engagement_event(
            tweet_id="123456",
            likes=10,
            replies=3,
            retweets=2,
            author_responded=True,
        )
        assert event["event_type"] == "x_reply_engagement"
        assert event["data"]["likes"] == 10
        assert event["data"]["author_responded"] is True
        assert event["data"]["engagement_total"] == 10 + 3 * 2 + 2

    def test_create_dna_event_structure(self):
        from lib.convo_events import create_dna_event

        event = create_dna_event(
            pattern_type="question_chain",
            hook_type="question",
            tone="technical",
            engagement_score=8.5,
            example_text="What if we tried X?",
            topic_tags=["architecture"],
        )
        assert event["event_type"] == "x_conversation_dna"
        assert event["data"]["pattern_type"] == "question_chain"
        assert event["data"]["engagement_score"] == 8.5
        assert "architecture" in event["data"]["topic_tags"]

    def test_store_and_read_events(self):
        from lib.convo_events import (
            create_reply_event,
            store_convo_events,
            read_pending_convo_events,
        )

        events = [
            create_reply_event("Reply 1", "Parent 1"),
            create_reply_event("Reply 2", "Parent 2"),
        ]
        stored = store_convo_events(events)
        assert stored == 2

        read_back = read_pending_convo_events()
        assert len(read_back) == 2
        assert read_back[0]["data"]["reply_text"] == "Reply 1"

    def test_store_empty_list_returns_zero(self):
        from lib.convo_events import store_convo_events

        assert store_convo_events([]) == 0

    def test_read_nonexistent_returns_empty(self):
        from lib.convo_events import read_pending_convo_events

        # events_file doesn't exist yet
        assert read_pending_convo_events() == []


# ---------------------------------------------------------------------------
# ConversationDNA dataclass tests
# ---------------------------------------------------------------------------


class TestConversationDNA:
    """Tests for the ConversationDNA dataclass."""

    def test_create_dna(self):
        from lib.convo_analyzer import ConversationDNA

        dna = ConversationDNA(
            pattern_type="question_chain",
            hook_type="question",
            tone="technical",
            structure="short",
            engagement_score=8.0,
            examples=["What about X?"],
            topic_tags=["coding"],
        )
        assert dna.pattern_type == "question_chain"
        assert dna.times_seen == 1
        assert dna.engagement_score == 8.0

    def test_dna_defaults(self):
        from lib.convo_analyzer import ConversationDNA

        dna = ConversationDNA(
            pattern_type="debate",
            hook_type="challenge",
            tone="provocative",
            structure="medium",
            engagement_score=5.0,
        )
        assert dna.examples == []
        assert dna.topic_tags == []
        assert dna.times_seen == 1


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
