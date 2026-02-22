from __future__ import annotations

import sqlite3

from lib.eidos.evidence_store import EvidenceStore
from lib.eidos.models import Distillation, DistillationType
from lib.eidos.store import EidosStore


def test_store_column_exists_rejects_non_identifier_table(tmp_path):
    store = EidosStore(str(tmp_path / "eidos.db"))
    with sqlite3.connect(store.db_path) as conn:
        assert store._column_exists(conn, "steps", "trace_id") is True
        assert store._column_exists(conn, "steps); DROP TABLE steps;--", "trace_id") is False
        assert store._column_exists(conn, "steps", "trace-id") is False


def test_evidence_store_column_exists_rejects_non_identifier_table(tmp_path):
    ev_store = EvidenceStore(str(tmp_path / "evidence.db"))
    with sqlite3.connect(ev_store.db_path) as conn:
        assert ev_store._column_exists(conn, "evidence", "trace_id") is True
        assert ev_store._column_exists(conn, "evidence); DROP TABLE evidence;--", "trace_id") is False
        assert ev_store._column_exists(conn, "evidence", "trace-id") is False


def test_prune_distillations_handles_unusual_ids_safely(tmp_path):
    store = EidosStore(str(tmp_path / "eidos.db"))
    healthy = Distillation(
        distillation_id="healthy-distillation",
        type=DistillationType.HEURISTIC,
        statement="Keep healthy distillation",
        times_used=12,
        times_helped=8,
    )
    suspicious = Distillation(
        distillation_id="bad-id') OR 1=1 --",
        type=DistillationType.HEURISTIC,
        statement="Should be pruned by low success",
        times_used=12,
        times_helped=0,
    )
    store.save_distillation(healthy)
    store.save_distillation(suspicious)

    result = store.prune_distillations()

    assert result["low_success"] == 1
    assert store.get_distillation("healthy-distillation") is not None
    assert store.get_distillation("bad-id') OR 1=1 --") is None
