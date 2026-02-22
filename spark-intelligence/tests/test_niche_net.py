#!/usr/bin/env python3
"""Tests for NicheNet - Niche Intelligence Network."""

import json
import sys
import time
from pathlib import Path

import pytest

# Ensure project root is on path
ROOT = Path(__file__).parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


# ---------------------------------------------------------------------------
# NicheMapper tests
# ---------------------------------------------------------------------------


class TestNicheMapper:
    """Tests for the core NicheMapper."""

    @pytest.fixture(autouse=True)
    def setup(self, tmp_path, monkeypatch):
        # Niche dir
        self.niche_dir = tmp_path / "niche_intel"
        self.niche_dir.mkdir()
        monkeypatch.setattr("lib.niche_mapper.NICHE_DIR", self.niche_dir)
        monkeypatch.setattr("lib.niche_mapper.ACCOUNTS_FILE", self.niche_dir / "tracked_accounts.json")
        monkeypatch.setattr("lib.niche_mapper.HUBS_FILE", self.niche_dir / "hubs.json")
        monkeypatch.setattr("lib.niche_mapper.OPPORTUNITIES_FILE", self.niche_dir / "opportunities.json")

        # XVoice deps
        xv_dir = tmp_path / "x_voice"
        xv_dir.mkdir()
        monkeypatch.setattr("lib.x_voice.X_VOICE_DIR", xv_dir)
        monkeypatch.setattr("lib.x_voice.PROFILES_FILE", xv_dir / "profiles.json")

        sv_dir = tmp_path / "spark_voice"
        sv_dir.mkdir()
        monkeypatch.setattr("lib.spark_voice.SPARK_DIR", sv_dir)
        monkeypatch.setattr("lib.spark_voice.VOICE_FILE", sv_dir / "voice.json")

        # Reset singletons
        import lib.niche_mapper
        import lib.x_voice
        import lib.spark_voice
        lib.niche_mapper._mapper = None
        lib.x_voice._x_voice = None
        lib.spark_voice._voice = None

    def _get_mapper(self):
        from lib.niche_mapper import NicheMapper
        return NicheMapper()

    # --- Account Discovery ---

    def test_discover_account(self):
        nm = self._get_mapper()
        acct = nm.discover_account("testuser", topics=["AI", "coding"], relevance=0.8)
        assert acct.handle == "testuser"
        assert "AI" in acct.topics
        assert acct.relevance == 0.8
        assert acct.warmth == "cold"

    def test_discover_account_strips_at(self):
        nm = self._get_mapper()
        acct = nm.discover_account("@TestUser")
        assert acct.handle == "testuser"

    def test_discover_account_updates_existing(self):
        nm = self._get_mapper()
        nm.discover_account("user1", topics=["AI"], relevance=0.5)
        acct = nm.discover_account("user1", topics=["ML"], relevance=0.9)
        assert "AI" in acct.topics
        assert "ML" in acct.topics
        assert acct.relevance == 0.9

    def test_discover_account_persists(self):
        from lib.niche_mapper import NicheMapper

        nm1 = self._get_mapper()
        nm1.discover_account("persist_user", relevance=0.7)

        nm2 = self._get_mapper()
        assert "persist_user" in nm2.accounts

    def test_discover_account_prunes_at_max(self):
        nm = self._get_mapper()
        nm.MAX_TRACKED = 3

        nm.discover_account("a", relevance=0.9)
        nm.discover_account("b", relevance=0.5)
        nm.discover_account("c", relevance=0.8)
        nm.discover_account("d", relevance=0.95)  # Should prune least relevant

        assert len(nm.accounts) <= 3
        # "b" should have been pruned (lowest relevance + cold)
        assert "b" not in nm.accounts

    # --- Relationship Tracking ---

    def test_update_relationship_increments_count(self):
        nm = self._get_mapper()
        nm.discover_account("rel_user")
        nm.update_relationship("rel_user", "reply")
        acct = nm.accounts["rel_user"]
        assert acct.interaction_count == 1
        assert acct.we_initiated_count == 1

    def test_update_relationship_they_initiated(self):
        nm = self._get_mapper()
        nm.discover_account("init_user")
        nm.update_relationship("init_user", "reply_received", they_initiated=True)
        acct = nm.accounts["init_user"]
        assert acct.they_initiated_count == 1
        assert acct.we_initiated_count == 0

    def test_update_relationship_auto_discovers(self):
        nm = self._get_mapper()
        nm.update_relationship("new_user", "reply")
        assert "new_user" in nm.accounts

    def test_warmth_progression(self):
        nm = self._get_mapper()
        nm.discover_account("warm_user")

        result = nm.update_relationship("warm_user", "reply")
        assert result is not None
        assert result == ("cold", "cool")

        result = nm.update_relationship("warm_user", "reply_received")
        assert result is not None
        assert result[1] == "warm"

    def test_get_account(self):
        nm = self._get_mapper()
        nm.discover_account("find_me")
        assert nm.get_account("find_me") is not None
        assert nm.get_account("nonexistent") is None

    def test_get_accounts_by_warmth(self):
        nm = self._get_mapper()
        nm.discover_account("cold1")
        nm.discover_account("cold2")
        nm.discover_account("warm1")
        nm.update_relationship("warm1", "reply")  # cold -> cool

        cold_accounts = nm.get_accounts_by_warmth("cold")
        assert len(cold_accounts) == 2

    # --- Hub Identification ---

    def test_identify_hub(self):
        nm = self._get_mapper()
        hub = nm.identify_hub(
            hub_type="topic",
            description="AI Agent Development",
            key_accounts=["user1", "user2"],
            topics=["agents", "AI"],
            engagement_level=7.0,
        )
        assert hub.hub_type == "topic"
        assert hub.engagement_level == 7.0
        assert len(hub.key_accounts) == 2

    def test_identify_hub_updates_existing(self):
        nm = self._get_mapper()
        nm.identify_hub("topic", "AI Agents", key_accounts=["a"], engagement_level=5.0)
        hub = nm.identify_hub("topic", "AI Agents", key_accounts=["b"], engagement_level=8.0)
        assert hub.times_observed == 2
        assert "a" in hub.key_accounts and "b" in hub.key_accounts
        # Engagement should be weighted average
        assert hub.engagement_level > 5.0

    def test_get_active_hubs(self):
        nm = self._get_mapper()
        nm.identify_hub("topic", "High Active", engagement_level=8.0)
        nm.identify_hub("topic", "Low Active", engagement_level=1.0)
        nm.identify_hub("topic", "Mid Active", engagement_level=5.0)

        active = nm.get_active_hubs(min_engagement=3.0)
        assert len(active) == 2
        assert active[0].description == "High Active"

    def test_hub_prunes_at_max(self):
        nm = self._get_mapper()
        nm.MAX_HUBS = 2

        nm.identify_hub("topic", "Hub 1", engagement_level=5.0)
        nm.identify_hub("topic", "Hub 2", engagement_level=8.0)
        nm.identify_hub("topic", "Hub 3", engagement_level=9.0)

        assert len(nm.hubs) <= 2

    # --- Engagement Opportunities ---

    def test_generate_opportunity(self):
        nm = self._get_mapper()
        opp = nm.generate_opportunity(
            target="opp_user",
            reason="They asked about AI agents",
            urgency=4,
            suggested_tone="technical",
        )
        assert opp.target == "opp_user"
        assert opp.urgency == 4
        assert not opp.acted_on

    def test_generate_opportunity_with_expiry(self):
        nm = self._get_mapper()
        opp = nm.generate_opportunity(
            target="exp_user",
            reason="Time-sensitive thread",
            urgency=5,
            expires_hours=2,
        )
        assert opp.expires_at > 0
        assert opp.expires_at > time.time()

    def test_get_active_opportunities_filters_expired(self):
        nm = self._get_mapper()
        nm.generate_opportunity("fresh", "Active opportunity", urgency=3)

        # Create an expired one
        opp = nm.generate_opportunity("expired", "Old opportunity", urgency=5)
        # Manually expire it
        nm.opportunities[-1].expires_at = time.time() - 100

        active = nm.get_active_opportunities()
        assert len(active) == 1
        assert active[0].target == "fresh"

    def test_get_active_opportunities_filters_acted(self):
        nm = self._get_mapper()
        nm.generate_opportunity("acted", "Done", urgency=3)
        nm.act_on_opportunity("acted")

        active = nm.get_active_opportunities()
        assert len(active) == 0

    def test_get_active_opportunities_sorted_by_urgency(self):
        nm = self._get_mapper()
        nm.generate_opportunity("low", "Low urgency", urgency=1)
        nm.generate_opportunity("high", "High urgency", urgency=5)
        nm.generate_opportunity("mid", "Mid urgency", urgency=3)

        active = nm.get_active_opportunities()
        assert active[0].urgency == 5
        assert active[-1].urgency == 1

    def test_act_on_opportunity(self):
        nm = self._get_mapper()
        nm.generate_opportunity("act_user", "Should engage")
        result = nm.act_on_opportunity("act_user")
        assert result is True

        # Can't act twice
        result = nm.act_on_opportunity("act_user")
        assert result is False

    def test_act_on_nonexistent(self):
        nm = self._get_mapper()
        result = nm.act_on_opportunity("nobody")
        assert result is False

    def test_urgency_clamped(self):
        nm = self._get_mapper()
        opp = nm.generate_opportunity("user", "test", urgency=10)
        assert opp.urgency == 5

        opp2 = nm.generate_opportunity("user2", "test", urgency=-1)
        assert opp2.urgency == 1

    # --- Network Stats ---

    def test_get_network_stats_empty(self):
        nm = self._get_mapper()
        stats = nm.get_network_stats()
        assert stats["tracked_accounts"] == 0
        assert stats["active_hubs"] == 0
        assert stats["reciprocity_rate"] == 0.0

    def test_get_network_stats_with_data(self):
        nm = self._get_mapper()
        nm.discover_account("user1", topics=["AI"])
        nm.discover_account("user2", topics=["AI", "ML"])
        nm.update_relationship("user1", "reply")
        nm.update_relationship("user2", "reply_received", they_initiated=True)
        nm.identify_hub("topic", "AI Hub", engagement_level=7.0)
        nm.generate_opportunity("user1", "Active thread", urgency=4)

        stats = nm.get_network_stats()
        assert stats["tracked_accounts"] == 2
        assert stats["total_interactions"] == 2
        assert stats["active_hubs"] == 1
        assert stats["active_opportunities"] == 1
        assert "AI" in stats["top_topics"]
        assert stats["reciprocity_rate"] == 0.5  # 1 they / 2 total

    def test_reciprocity_rate(self):
        nm = self._get_mapper()
        nm.discover_account("user1")
        nm.discover_account("user2")

        # All initiated by us
        nm.update_relationship("user1", "reply")
        nm.update_relationship("user2", "reply")

        stats = nm.get_network_stats()
        assert stats["reciprocity_rate"] == 0.0  # No reciprocity

        # They initiate one
        nm.update_relationship("user1", "reply_received", they_initiated=True)

        stats = nm.get_network_stats()
        assert stats["reciprocity_rate"] > 0


# ---------------------------------------------------------------------------
# TrackedAccount dataclass tests
# ---------------------------------------------------------------------------


class TestTrackedAccount:
    """Tests for the TrackedAccount dataclass."""

    def test_defaults(self):
        from lib.niche_mapper import TrackedAccount

        acct = TrackedAccount(handle="test")
        assert acct.warmth == "cold"
        assert acct.interaction_count == 0
        assert acct.topics == []
        assert acct.relevance == 0.5

    def test_custom_values(self):
        from lib.niche_mapper import TrackedAccount

        acct = TrackedAccount(
            handle="custom",
            topics=["AI"],
            relevance=0.9,
            warmth="warm",
        )
        assert acct.handle == "custom"
        assert acct.warmth == "warm"
        assert acct.relevance == 0.9


# ---------------------------------------------------------------------------
# EngagementOpportunity dataclass tests
# ---------------------------------------------------------------------------


class TestEngagementOpportunity:
    """Tests for the EngagementOpportunity dataclass."""

    def test_defaults(self):
        from lib.niche_mapper import EngagementOpportunity

        opp = EngagementOpportunity(target="user", reason="Test")
        assert opp.urgency == 3
        assert opp.acted_on is False
        assert opp.expires_at == 0

    def test_custom_values(self):
        from lib.niche_mapper import EngagementOpportunity

        opp = EngagementOpportunity(
            target="user",
            reason="High urgency",
            urgency=5,
            suggested_tone="witty",
        )
        assert opp.urgency == 5
        assert opp.suggested_tone == "witty"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
