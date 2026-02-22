#!/usr/bin/env python3
"""Tests for Engagement Pulse - Async engagement tracking and prediction."""

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
# EngagementTracker tests
# ---------------------------------------------------------------------------


class TestEngagementTracker:
    """Tests for the core engagement tracker."""

    @pytest.fixture(autouse=True)
    def setup(self, tmp_path, monkeypatch):
        self.pulse_dir = tmp_path / "engagement_pulse"
        self.pulse_dir.mkdir()
        monkeypatch.setattr("lib.engagement_tracker.PULSE_DIR", self.pulse_dir)
        monkeypatch.setattr(
            "lib.engagement_tracker.TRACKED_FILE",
            self.pulse_dir / "tracked_tweets.json",
        )

        # Reset singleton
        import lib.engagement_tracker
        lib.engagement_tracker._tracker = None

    def _get_tracker(self):
        from lib.engagement_tracker import EngagementTracker
        return EngagementTracker()

    # --- Registration ---

    def test_register_tweet(self):
        et = self._get_tracker()
        tweet = et.register_tweet(
            tweet_id="123",
            content="This is a test tweet about AI",
            tone="technical",
            topic="AI",
        )
        assert tweet.tweet_id == "123"
        assert tweet.content_preview == "This is a test tweet about AI"
        assert tweet.tone == "technical"
        assert tweet.prediction is not None

    def test_register_tweet_persists(self):
        from lib.engagement_tracker import EngagementTracker

        et1 = self._get_tracker()
        et1.register_tweet("456", "Test tweet")

        et2 = self._get_tracker()
        assert "456" in et2.tracked

    def test_register_reply(self):
        et = self._get_tracker()
        tweet = et.register_tweet(
            "789", "Reply content", is_reply=True
        )
        assert tweet.is_reply is True

    def test_register_thread(self):
        et = self._get_tracker()
        tweet = et.register_tweet(
            "101", "Thread start", is_thread=True
        )
        assert tweet.is_thread is True

    # --- Prediction ---

    def test_predict_engagement_returns_prediction(self):
        et = self._get_tracker()
        pred = et.predict_engagement(tone="witty", topic="AI")
        assert pred.predicted_likes > 0
        assert pred.predicted_replies > 0
        assert 0 < pred.confidence <= 1.0
        assert pred.reasoning != ""

    def test_predict_reply_lower_likes(self):
        et = self._get_tracker()
        original = et.predict_engagement(tone="conversational")
        reply = et.predict_engagement(tone="conversational", is_reply=True)
        assert reply.predicted_likes <= original.predicted_likes

    def test_predict_thread_higher_retweets(self):
        et = self._get_tracker()
        single = et.predict_engagement(tone="conversational")
        thread = et.predict_engagement(tone="conversational", is_thread=True)
        assert thread.predicted_retweets >= single.predicted_retweets

    def test_predict_provocative_higher_engagement(self):
        et = self._get_tracker()
        calm = et.predict_engagement(tone="conversational")
        bold = et.predict_engagement(tone="provocative")
        assert bold.predicted_total >= calm.predicted_total

    # --- Snapshots ---

    def test_take_snapshot_untracked_returns_none(self):
        et = self._get_tracker()
        result = et.take_snapshot("nonexistent", likes=10)
        assert result is None

    def test_take_snapshot_1h(self):
        et = self._get_tracker()
        tweet = et.register_tweet("snap1", "Test")
        # Backdate to 1 hour ago
        et.tracked["snap1"].posted_at = time.time() - 3600

        snapshot = et.take_snapshot("snap1", likes=15, replies=3, retweets=2)
        assert snapshot is not None
        assert snapshot.age_label == "1h"
        assert snapshot.likes == 15

    def test_take_snapshot_no_duplicate(self):
        et = self._get_tracker()
        et.register_tweet("snap2", "Test")
        et.tracked["snap2"].posted_at = time.time() - 3600

        # First snapshot succeeds
        s1 = et.take_snapshot("snap2", likes=10)
        assert s1 is not None

        # Second snapshot for same interval returns None
        s2 = et.take_snapshot("snap2", likes=20)
        assert s2 is None

    def test_snapshot_6h(self):
        et = self._get_tracker()
        et.register_tweet("snap3", "Test")
        et.tracked["snap3"].posted_at = time.time() - 21600  # 6 hours

        snapshot = et.take_snapshot("snap3", likes=50, replies=10)
        assert snapshot is not None
        assert snapshot.age_label == "6h"

    def test_snapshot_24h(self):
        et = self._get_tracker()
        et.register_tweet("snap4", "Test")
        et.tracked["snap4"].posted_at = time.time() - 86400  # 24 hours

        snapshot = et.take_snapshot("snap4", likes=100, replies=20, retweets=10)
        assert snapshot is not None
        assert snapshot.age_label == "24h"

    # --- Pending snapshots ---

    def test_get_pending_snapshots(self):
        et = self._get_tracker()
        et.register_tweet("pend1", "Test")
        et.tracked["pend1"].posted_at = time.time() - 3600  # 1h ago

        pending = et.get_pending_snapshots()
        assert len(pending) > 0
        assert any(tid == "pend1" for tid, _ in pending)

    def test_no_pending_for_recent_tweet(self):
        et = self._get_tracker()
        et.register_tweet("recent", "Test")
        # Just posted, no snapshots should be due

        pending = et.get_pending_snapshots()
        assert not any(tid == "recent" for tid, _ in pending)

    # --- Surprise Detection ---

    def test_detect_overperform(self):
        et = self._get_tracker()
        et.register_tweet("over1", "Test", tone="conversational")
        et.tracked["over1"].posted_at = time.time() - 3600

        # Take snapshot with much higher than predicted
        et.take_snapshot("over1", likes=100, replies=50, retweets=20)

        surprise = et.detect_surprise("over1")
        assert surprise is not None
        assert surprise["surprise_type"] == "overperform"
        assert surprise["surprise_ratio"] > 2.0

    def test_detect_underperform(self):
        et = self._get_tracker()
        et.register_tweet("under1", "Test", tone="provocative")
        et.tracked["under1"].posted_at = time.time() - 3600

        # Take snapshot with much lower than predicted
        et.take_snapshot("under1", likes=0, replies=0, retweets=0)

        surprise = et.detect_surprise("under1")
        assert surprise is not None
        assert surprise["surprise_type"] == "underperform"

    def test_no_surprise_for_normal(self):
        et = self._get_tracker()
        et.register_tweet("normal1", "Test", tone="conversational")
        et.tracked["normal1"].posted_at = time.time() - 3600

        # Take snapshot near prediction
        pred = et.tracked["normal1"].prediction
        et.take_snapshot(
            "normal1",
            likes=pred["predicted_likes"],
            replies=pred["predicted_replies"],
        )

        surprise = et.detect_surprise("normal1")
        assert surprise is None

    def test_detect_surprise_untracked_returns_none(self):
        et = self._get_tracker()
        assert et.detect_surprise("nonexistent") is None

    # --- Prediction Accuracy ---

    def test_prediction_accuracy_empty(self):
        et = self._get_tracker()
        accuracy = et.get_prediction_accuracy()
        assert accuracy["total_predictions"] == 0
        assert accuracy["accuracy"] == 0.0

    def test_prediction_accuracy_with_data(self):
        et = self._get_tracker()

        # Register and snapshot a few tweets
        for i in range(5):
            tid = f"acc{i}"
            et.register_tweet(tid, f"Test {i}", tone="conversational")
            et.tracked[tid].posted_at = time.time() - 3600
            # Close to prediction = accurate
            pred = et.tracked[tid].prediction
            et.take_snapshot(tid, likes=pred["predicted_likes"], replies=pred["predicted_replies"])

        accuracy = et.get_prediction_accuracy()
        assert accuracy["total_predictions"] == 5
        assert accuracy["accuracy"] > 0

    # --- Stats ---

    def test_get_stats_empty(self):
        et = self._get_tracker()
        stats = et.get_stats()
        assert stats["tracked_tweets"] == 0
        assert stats["total_snapshots"] == 0

    def test_get_stats_with_data(self):
        et = self._get_tracker()
        et.register_tweet("stat1", "Test")
        et.tracked["stat1"].posted_at = time.time() - 3600
        et.take_snapshot("stat1", likes=10)

        stats = et.get_stats()
        assert stats["tracked_tweets"] == 1
        assert stats["total_snapshots"] == 1

    # --- Cleanup ---

    def test_cleanup_old(self):
        et = self._get_tracker()
        et.register_tweet("old1", "Old tweet")
        et.tracked["old1"].posted_at = time.time() - (8 * 86400)  # 8 days ago
        et.register_tweet("new1", "New tweet")

        et.cleanup_old(max_age_days=7)
        assert "old1" not in et.tracked
        assert "new1" in et.tracked


# ---------------------------------------------------------------------------
# EngagementSurpriseDetector tests
# ---------------------------------------------------------------------------


class TestEngagementSurpriseDetector:
    """Tests for the pattern detector."""

    def _get_detector(self):
        from lib.pattern_detection.engagement_surprise import EngagementSurpriseDetector
        return EngagementSurpriseDetector()

    def test_detects_overperform_surprise(self):
        detector = self._get_detector()
        event = {
            "event_type": "engagement_surprise",
            "data": {
                "surprise_type": "overperform",
                "surprise_ratio": 3.5,
                "tweet_id": "123",
                "content_preview": "AI is fascinating",
                "tone": "witty",
                "topic": "AI",
            },
            "session_id": "test",
        }
        patterns = detector.process_event(event)
        assert len(patterns) == 1
        assert patterns[0].context["surprise_type"] == "overperform"
        assert "overperformed" in patterns[0].suggested_insight

    def test_detects_underperform_surprise(self):
        detector = self._get_detector()
        event = {
            "event_type": "engagement_surprise",
            "data": {
                "surprise_type": "underperform",
                "surprise_ratio": 0.1,
                "tweet_id": "456",
                "tone": "technical",
                "topic": "code",
            },
            "session_id": "test",
        }
        patterns = detector.process_event(event)
        assert len(patterns) == 1
        assert patterns[0].context["surprise_type"] == "underperform"

    def test_detects_high_engagement_from_reply_event(self):
        detector = self._get_detector()
        event = {
            "event_type": "x_reply_engagement",
            "data": {
                "likes": 25,
                "replies": 10,
                "engagement_total": 35,
                "tweet_id": "789",
            },
            "session_id": "test",
        }
        patterns = detector.process_event(event)
        assert len(patterns) == 1
        assert "high_engagement" in patterns[0].context["surprise_type"]

    def test_ignores_low_engagement(self):
        detector = self._get_detector()
        event = {
            "event_type": "x_reply_engagement",
            "data": {
                "likes": 2,
                "replies": 1,
                "engagement_total": 3,
            },
            "session_id": "test",
        }
        patterns = detector.process_event(event)
        assert len(patterns) == 0

    def test_ignores_irrelevant_events(self):
        detector = self._get_detector()
        event = {
            "event_type": "user_message",
            "data": {"content": "hello"},
            "session_id": "test",
        }
        patterns = detector.process_event(event)
        assert len(patterns) == 0

    def test_no_surprise_type_returns_empty(self):
        detector = self._get_detector()
        event = {
            "event_type": "engagement_surprise",
            "data": {},
            "session_id": "test",
        }
        patterns = detector.process_event(event)
        assert len(patterns) == 0


# ---------------------------------------------------------------------------
# PatternType enum test
# ---------------------------------------------------------------------------


class TestPatternTypeExtension:
    """Verify ENGAGEMENT_SURPRISE was added to PatternType."""

    def test_engagement_surprise_in_enum(self):
        from lib.pattern_detection.base import PatternType
        assert hasattr(PatternType, "ENGAGEMENT_SURPRISE")
        assert PatternType.ENGAGEMENT_SURPRISE.value == "engagement_surprise"


# ---------------------------------------------------------------------------
# EngagementPrediction dataclass tests
# ---------------------------------------------------------------------------


class TestEngagementPrediction:
    """Tests for the prediction dataclass."""

    def test_predicted_total(self):
        from lib.engagement_tracker import EngagementPrediction

        pred = EngagementPrediction(
            predicted_likes=10, predicted_replies=5, predicted_retweets=3
        )
        assert pred.predicted_total == 18

    def test_default_confidence(self):
        from lib.engagement_tracker import EngagementPrediction

        pred = EngagementPrediction()
        assert pred.confidence == 0.5


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
