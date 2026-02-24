# Stage 12: Tuneables

> Part of the [[../flow|Intelligence Flow]]
> Upstream: External events
> Downstream: End of flow

**Purpose:** Central configuration for all pipeline stages. Supports hot-reload. Available in both runtime (~/.spark/tuneables.json) and version-controlled (config/tuneables.json) locations.
## Health

| Metric | Value | Status |
|--------|-------|--------|
| Source | versioned | healthy |
| Sections | 27 | healthy |
| Last modified | 1.4d ago | healthy |
## Sections

| Section | Keys | Sample Keys |
|---------|------|-------------|
| **advisor** | 19 | `min_reliability`, `min_validations_strong`, `max_items`, `cache_ttl`, `min_rank_score`, ... |
| **advisory_engine** | 13 | `enabled`, `max_ms`, `include_mind`, `prefetch_queue_enabled`, `prefetch_inline_enabled`, ... |
| **advisory_gate** | 7 | `max_emit_per_call`, `tool_cooldown_s`, `advice_repeat_cooldown_s`, `warning_threshold`, `note_threshold`, ... |
| **advisory_packet_store** | 19 | `packet_ttl_s`, `max_index_packets`, `relaxed_effectiveness_weight`, `relaxed_low_effectiveness_threshold`, `relaxed_low_effectiveness_penalty`, ... |
| **advisory_preferences** | 4 | `memory_mode`, `guidance_style`, `source`, `updated_at` |
| **advisory_prefetch** | 4 | `worker_enabled`, `max_jobs_per_run`, `max_tools_per_job`, `min_probability` |
| **advisory_quality** | 6 | `profile`, `preferred_provider`, `ai_timeout_s`, `minimax_model`, `source`, ... |
| **auto_tuner** | 9 | `enabled`, `mode`, `last_run`, `run_interval_s`, `max_change_per_run`, ... |
| **bridge_worker** | 1 | `enabled` |
| **chip_merge** | 7 | `duplicate_churn_ratio`, `duplicate_churn_min_processed`, `duplicate_churn_cooldown_s`, `min_cognitive_value`, `min_actionability`, ... |
| **eidos** | 5 | `max_steps`, `max_time_seconds`, `max_retries_per_error`, `max_file_touches`, `no_evidence_limit` |
| **memory_capture** | 2 | `enabled`, `auto_save_threshold` |
| **memory_emotion** | 4 | `enabled`, `write_capture_enabled`, `retrieval_state_match_weight`, `retrieval_min_state_similarity` |
| **memory_learning** | 4 | `enabled`, `retrieval_learning_weight`, `retrieval_min_learning_signal`, `calm_mode_bonus` |
| **memory_retrieval_guard** | 3 | `enabled`, `base_score_floor`, `max_total_boost` |
| **meta_ralph** | 9 | `quality_threshold`, `needs_work_threshold`, `needs_work_close_delta`, `min_outcome_samples`, `min_tuneable_samples`, ... |
| **observatory** | 16 | `enabled`, `auto_sync`, `sync_cooldown_s`, `vault_dir`, `generate_canvas`, ... |
| **production_gates** | 10 | `enforce_meta_ralph_quality_band`, `min_quality_samples`, `min_quality_rate`, `max_quality_rate`, `min_advisory_readiness_ratio`, ... |
| **promotion** | 5 | `adapter_budgets`, `confidence_floor`, `min_age_hours`, `auto_interval_s`, `threshold` |
| **retrieval** | 4 | `level`, `overrides`, `domain_profile_enabled`, `domain_profiles` |
| **scheduler** | 1 | `enabled` |
| **semantic** | 17 | `enabled`, `min_similarity`, `min_fusion_score`, `weight_recency`, `weight_outcome`, ... |
| **source_roles** | 4 | `_doc`, `distillers`, `direct_advisory`, `disabled_from_advisory` |
| **sync** | 1 | `mode` |
| **synthesizer** | 6 | `mode`, `ai_timeout_s`, `cache_ttl_s`, `max_cache_entries`, `preferred_provider`, ... |
| **triggers** | 2 | `enabled`, `rules_file` |
| **values** | 10 | `min_occurrences`, `min_occurrences_critical`, `confidence_threshold`, `gate_threshold`, `max_retries_per_error`, ... |

## Which Stages Each Section Configures

- `values` — [[03-pipeline|Pipeline]], [[07-eidos|EIDOS]]
- `semantic` — [[08-advisory|Advisory]]
- `promotion` — [[09-promotion|Promotion]]
- `advisor` — [[08-advisory|Advisory]]
- `meta_ralph` — [[05-meta-ralph|Meta-Ralph]]
- `eidos` — [[07-eidos|EIDOS]]
- `observatory` — Observatory auto-sync

## Source Files

- `lib/tuneables_schema.py + lib/tuneables_reload.py` — Core implementation
- `~/.spark/tuneables.json` — State storage

Version-controlled: `config/tuneables.json`
