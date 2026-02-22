# Tuneables Reference

Auto-generated from `lib/tuneables_schema.py`. Do not edit manually.

**Sections:** 25
**Total keys:** 153

## Overview

All tuneables are stored in `~/.spark/tuneables.json` (runtime) and `config/tuneables.json` (version-controlled baseline).

- **Validation**: `lib/tuneables_schema.py` validates on load
- **Hot-reload**: `lib/tuneables_reload.py` watches for file changes
- **Drift tracking**: `lib/tuneables_drift.py` monitors distance from baseline

## Section Index

- [`values`](#values) (10 keys) — `lib/pipeline.py`, `lib/advisor.py`, `lib/eidos/models.py`
- [`semantic`](#semantic) (17 keys) — `lib/semantic_retriever.py`, `lib/advisor.py`
- [`triggers`](#triggers) (2 keys) — `lib/advisor.py`
- [`promotion`](#promotion) (5 keys) — `lib/promoter.py`, `lib/auto_promote.py`
- [`synthesizer`](#synthesizer) (6 keys) — `lib/advisory_synthesizer.py`
- [`advisory_engine`](#advisory_engine) (13 keys) — `lib/advisory_engine.py`
- [`advisory_gate`](#advisory_gate) (7 keys) — `lib/advisory_gate.py`
- [`advisory_packet_store`](#advisory_packet_store) (5 keys) — `lib/advisory_packet_store.py`
- [`advisory_prefetch`](#advisory_prefetch) (4 keys) — `lib/advisory_prefetch_worker.py`
- [`advisor`](#advisor) (19 keys) — `lib/advisor.py`
- [`retrieval`](#retrieval) (4 keys) — `lib/advisor.py`, `lib/semantic_retriever.py`
- [`meta_ralph`](#meta_ralph) (9 keys) — `lib/meta_ralph.py`
- [`eidos`](#eidos) (5 keys) — `lib/eidos/models.py`
- [`scheduler`](#scheduler) (1 keys) — `lib/bridge_cycle.py`
- [`source_roles`](#source_roles) (3 keys) — `lib/advisory_engine.py`, `lib/auto_tuner.py`
- [`auto_tuner`](#auto_tuner) (9 keys) — `lib/auto_tuner.py`
- [`chip_merge`](#chip_merge) (7 keys) — `lib/chips/runtime.py`
- [`advisory_quality`](#advisory_quality) (6 keys) — `lib/advisory_synthesizer.py`
- [`advisory_preferences`](#advisory_preferences) (4 keys) — `lib/advisory_preferences.py`
- [`memory_emotion`](#memory_emotion) (4 keys) — `lib/memory_store.py`
- [`memory_learning`](#memory_learning) (4 keys) — `lib/memory_store.py`
- [`memory_retrieval_guard`](#memory_retrieval_guard) (3 keys) — `lib/memory_store.py`
- [`bridge_worker`](#bridge_worker) (1 keys) — `lib/bridge_cycle.py`
- [`memory_capture`](#memory_capture) (1 keys) — `lib/memory_capture.py`
- [`production_gates`](#production_gates) (4 keys) — `lib/production_gates.py`

## `values`

**Consumed by:** `lib/pipeline.py`, `lib/advisor.py`, `lib/eidos/models.py`

| Key | Type | Default | Min | Max | Description |
|-----|------|---------|-----|-----|-------------|
| `min_occurrences` | int | `1` | 1 | 100 | Min observations before learning |
| `min_occurrences_critical` | int | `1` | 1 | 100 | Min observations for critical insights |
| `confidence_threshold` | float | `0.6` | 0.0 | 1.0 | Confidence threshold for acceptance |
| `gate_threshold` | float | `0.45` | 0.0 | 1.0 | Quality gate threshold |
| `max_retries_per_error` | int | `3` | 1 | 20 | Max retries per error type |
| `max_file_touches` | int | `5` | 1 | 50 | Max file modifications per episode |
| `no_evidence_steps` | int | `6` | 1 | 30 | Steps without evidence before DIAGNOSE |
| `max_steps` | int | `40` | 5 | 200 | Max episode steps |
| `advice_cache_ttl` | int | `180` | 10 | 3600 | Advice cache TTL in seconds |
| `queue_batch_size` | int | `100` | 50 | 1000 | Event queue batch processing size |

## `semantic`

**Consumed by:** `lib/semantic_retriever.py`, `lib/advisor.py`

| Key | Type | Default | Min | Max | Description |
|-----|------|---------|-----|-----|-------------|
| `enabled` | bool | `True` | — | — | Enable semantic retrieval |
| `min_similarity` | float | `0.5` | 0.0 | 1.0 | Min cosine similarity for retrieval |
| `min_fusion_score` | float | `0.5` | 0.0 | 1.0 | Min fusion score for advisory ranking |
| `weight_recency` | float | `0.1` | 0.0 | 1.0 | Recency weight in fusion scoring |
| `weight_outcome` | float | `0.45` | 0.0 | 1.0 | Outcome weight in fusion scoring |
| `mmr_lambda` | float | `0.5` | 0.0 | 1.0 | MMR diversity parameter |
| `dedupe_similarity` | float | `0.88` | 0.0 | 1.0 | Similarity threshold for deduplication |
| `index_on_write` | bool | `True` | — | — | Index new entries on write |
| `index_on_read` | bool | `True` | — | — | Rebuild index on read if stale |
| `index_backfill_limit` | int | `500` | 0 | 10000 | Max entries to backfill on index build |
| `index_cache_ttl_seconds` | int | `120` | 10 | 3600 | Index cache TTL |
| `exclude_categories` | list | `[]` | — | — | Categories to exclude from retrieval |
| `category_caps` | dict | `{}` | — | — | Per-category result limits |
| `category_exclude` | list | `[]` | — | — | Categories to exclude |
| `log_retrievals` | bool | `True` | — | — | Log retrieval operations |
| `rescue_min_similarity` | float | `0.3` | 0.0 | 1.0 | Rescue path minimum similarity |
| `rescue_min_fusion_score` | float | `0.2` | 0.0 | 1.0 | Rescue path minimum fusion score |

## `triggers`

**Consumed by:** `lib/advisor.py`

| Key | Type | Default | Min | Max | Description |
|-----|------|---------|-----|-----|-------------|
| `enabled` | bool | `True` | — | — | Enable trigger rules |
| `rules_file` | str | `""` | — | — | Path to trigger rules YAML |

## `promotion`

**Consumed by:** `lib/promoter.py`, `lib/auto_promote.py`

| Key | Type | Default | Min | Max | Description |
|-----|------|---------|-----|-----|-------------|
| `adapter_budgets` | dict | `{}` | — | — | Per-adapter max item budgets |
| `confidence_floor` | float | `0.9` | 0.0 | 1.0 | Min confidence for promotion |
| `min_age_hours` | float | `2.0` | 0.0 | 168.0 | Min age in hours before promotion |
| `auto_interval_s` | int | `3600` | 300 | 86400 | Auto-promotion check interval |
| `threshold` | float | `0.5` | 0.0 | 1.0 | Promotion threshold score |

## `synthesizer`

**Consumed by:** `lib/advisory_synthesizer.py`

| Key | Type | Default | Min | Max | Description |
|-----|------|---------|-----|-----|-------------|
| `mode` | str | `auto` | — | — | Synthesis mode (auto, ai_only, programmatic) |
| `ai_timeout_s` | float | `10.0` | 0.5 | 60.0 | AI synthesis timeout |
| `cache_ttl_s` | int | `120` | 0 | 3600 | Synthesis cache TTL |
| `max_cache_entries` | int | `50` | 1 | 500 | Max cached synthesis results |
| `preferred_provider` | str | `minimax` | — | — | Preferred AI provider (minimax, ollama, gemini, openai, anthropic) |
| `minimax_model` | str | `MiniMax-M2.5` | — | — | MiniMax model name |

## `advisory_engine`

**Consumed by:** `lib/advisory_engine.py`

| Key | Type | Default | Min | Max | Description |
|-----|------|---------|-----|-----|-------------|
| `enabled` | bool | `True` | — | — | Enable the advisory engine |
| `max_ms` | float | `4000` | 250 | 20000 | Max advisory engine time budget in ms |
| `include_mind` | bool | `False` | — | — | Include Mind memory in advisory |
| `prefetch_queue_enabled` | bool | `False` | — | — | Enable prefetch queue |
| `prefetch_inline_enabled` | bool | `True` | — | — | Enable inline prefetch |
| `prefetch_inline_max_jobs` | int | `1` | 0 | 10 | Max inline prefetch jobs |
| `delivery_stale_s` | float | `600` | 60 | 86400 | Delivery staleness threshold (s) |
| `advisory_text_repeat_cooldown_s` | float | `900` | 30 | 86400 | Text repeat cooldown (s) |
| `actionability_enforce` | bool | `True` | — | — | Enforce actionability scoring |
| `force_programmatic_synth` | bool | `False` | — | — | Force programmatic synthesis |
| `selective_ai_synth_enabled` | bool | `True` | — | — | Enable selective AI synthesis |
| `selective_ai_min_remaining_ms` | float | `1800` | 0 | 20000 | Min ms remaining for AI synth |
| `selective_ai_min_authority` | str | `whisper` | — | — | Min authority for AI synth (silent, whisper, note, warning, block) |

## `advisory_gate`

**Consumed by:** `lib/advisory_gate.py`

| Key | Type | Default | Min | Max | Description |
|-----|------|---------|-----|-----|-------------|
| `max_emit_per_call` | int | `2` | 1 | 10 | Max advice items emitted per tool call |
| `tool_cooldown_s` | int | `15` | 1 | 3600 | Same-tool suppression cooldown (s) |
| `advice_repeat_cooldown_s` | int | `300` | 5 | 86400 | Repeated advice cooldown (s) |
| `warning_threshold` | float | `0.68` | 0.2 | 0.99 | Score threshold for WARNING authority |
| `note_threshold` | float | `0.38` | 0.1 | 0.95 | Score threshold for NOTE authority |
| `whisper_threshold` | float | `0.27` | 0.01 | 0.9 | Score threshold for WHISPER authority |
| `emit_whispers` | bool | `True` | — | — | Whether to emit WHISPER-level advice |

## `advisory_packet_store`

**Consumed by:** `lib/advisory_packet_store.py`

| Key | Type | Default | Min | Max | Description |
|-----|------|---------|-----|-----|-------------|
| `packet_ttl_s` | int | `600` | 60 | 7200 | Packet time-to-live (s) |
| `max_index_packets` | int | `2000` | 100 | 50000 | Max packets in index |
| `relaxed_effectiveness_weight` | float | `2.0` | 0.0 | 10.0 | Effectiveness weight (relaxed mode) |
| `relaxed_low_effectiveness_threshold` | float | `0.3` | 0.0 | 1.0 | Low effectiveness threshold |
| `relaxed_low_effectiveness_penalty` | float | `0.5` | 0.0 | 1.0 | Low effectiveness penalty |

## `advisory_prefetch`

**Consumed by:** `lib/advisory_prefetch_worker.py`

| Key | Type | Default | Min | Max | Description |
|-----|------|---------|-----|-----|-------------|
| `worker_enabled` | bool | `False` | — | — | Enable background prefetch worker |
| `max_jobs_per_run` | int | `2` | 1 | 50 | Max prefetch jobs per cycle |
| `max_tools_per_job` | int | `3` | 1 | 10 | Max tools to prefetch per job |
| `min_probability` | float | `0.25` | 0.0 | 1.0 | Min probability threshold for prefetch |

## `advisor`

**Consumed by:** `lib/advisor.py`

| Key | Type | Default | Min | Max | Description |
|-----|------|---------|-----|-----|-------------|
| `min_reliability` | float | `0.6` | 0.0 | 1.0 | Min reliability for advice |
| `min_validations_strong` | int | `2` | 1 | 20 | Min validations for strong advice |
| `max_items` | int | `4` | 1 | 20 | Max advice items per call |
| `cache_ttl` | int | `180` | 10 | 3600 | Advice cache TTL (s) |
| `min_rank_score` | float | `0.4` | 0.0 | 1.0 | Min fusion rank score |
| `max_advice_items` | int | `5` | 1 | 20 | Max advice items (alternate key) |
| `mind_max_stale_s` | int | `86400` | 0 | 604800 | Max Mind staleness (s) |
| `mind_stale_allow_if_empty` | bool | `False` | — | — | Allow stale Mind if empty |
| `mind_min_salience` | float | `0.55` | 0.0 | 1.0 | Min Mind memory salience |
| `replay_enabled` | bool | `True` | — | — | Enable replay advisory |
| `replay_min_strict` | int | `5` | 1 | 100 | Min strict samples for replay |
| `replay_min_delta` | float | `0.25` | 0.0 | 1.0 | Min improvement delta for replay |
| `replay_max_age_s` | int | `1209600` | 3600 | 2592000 | Max replay age (s, default 14d) |
| `replay_strict_window_s` | int | `1500` | 60 | 86400 | Strict replay window (s) |
| `replay_min_context` | float | `0.24` | 0.0 | 1.0 | Min context match for replay |
| `replay_max_records` | int | `2500` | 100 | 50000 | Max replay records |
| `replay_mode` | str | `standard` | — | — | Replay mode (off, standard, replay) |
| `guidance_style` | str | `balanced` | — | — | Guidance verbosity (concise, balanced, coach) |
| `source_weights` | str | `0.400` | — | — | Source weight override string |

## `retrieval`

**Consumed by:** `lib/advisor.py`, `lib/semantic_retriever.py`

| Key | Type | Default | Min | Max | Description |
|-----|------|---------|-----|-----|-------------|
| `level` | str | `2` | — | — | Retrieval complexity level |
| `overrides` | dict | `{}` | — | — | Retrieval parameter overrides |
| `domain_profile_enabled` | bool | `True` | — | — | Enable domain-specific profiles |
| `domain_profiles` | dict | `{}` | — | — | Per-domain retrieval profiles |

## `meta_ralph`

**Consumed by:** `lib/meta_ralph.py`

| Key | Type | Default | Min | Max | Description |
|-----|------|---------|-----|-----|-------------|
| `quality_threshold` | float | `4.5` | 0.0 | 10.0 | Score floor for promotion |
| `needs_work_threshold` | int | `2` | 0 | 10 | Score range for refinement |
| `needs_work_close_delta` | float | `0.5` | 0.0 | 3.0 | Proximity threshold for close-to-passing |
| `min_outcome_samples` | int | `5` | 1 | 100 | Min outcomes before quality scoring |
| `min_tuneable_samples` | int | `50` | 5 | 1000 | Min samples for tuneable validation |
| `min_needs_work_samples` | int | `5` | 1 | 100 | Min samples for needs_work verdict |
| `min_source_samples` | int | `15` | 1 | 200 | Min samples per source |
| `attribution_window_s` | int | `1800` | 60 | 86400 | Time window for attribution (s) |
| `strict_attribution_require_trace` | bool | `True` | — | — | Require trace for strict attribution |

## `eidos`

**Consumed by:** `lib/eidos/models.py`

| Key | Type | Default | Min | Max | Description |
|-----|------|---------|-----|-----|-------------|
| `max_steps` | int | `40` | 5 | 200 | Max steps per episode |
| `max_time_seconds` | int | `1200` | 60 | 7200 | Max episode time (s) |
| `max_retries_per_error` | int | `3` | 1 | 20 | Retry limit per error type |
| `max_file_touches` | int | `5` | 1 | 50 | Max times to modify same file |
| `no_evidence_limit` | int | `6` | 1 | 30 | Force DIAGNOSE after N steps without evidence |

## `scheduler`

**Consumed by:** `lib/bridge_cycle.py`

| Key | Type | Default | Min | Max | Description |
|-----|------|---------|-----|-----|-------------|
| `enabled` | bool | `True` | — | — | Enable the scheduler |

## `source_roles`

**Consumed by:** `lib/advisory_engine.py`, `lib/auto_tuner.py`

| Key | Type | Default | Min | Max | Description |
|-----|------|---------|-----|-----|-------------|
| `distillers` | dict | `{}` | — | — | Sources that distill/learn (not advisory) |
| `direct_advisory` | dict | `{}` | — | — | Sources that advise directly |
| `disabled_from_advisory` | dict | `{}` | — | — | Sources removed from advisory |

## `auto_tuner`

**Consumed by:** `lib/auto_tuner.py`

| Key | Type | Default | Min | Max | Description |
|-----|------|---------|-----|-----|-------------|
| `enabled` | bool | `True` | — | — | Enable auto-tuner |
| `mode` | str | `apply` | — | — | Tuner mode (apply, suggest) |
| `last_run` | str | `""` | — | — | Timestamp of last run |
| `run_interval_s` | int | `43200` | 3600 | 604800 | Run interval (s, default 12h) |
| `max_change_per_run` | float | `0.15` | 0.01 | 0.5 | Max boost change per run |
| `source_boosts` | dict | `{}` | — | — | Per-source boost multipliers |
| `source_effectiveness` | dict | `{}` | — | — | Computed effectiveness rates |
| `tuning_log` | list | `[]` | — | — | Recent tuning events (max 50) |
| `max_changes_per_cycle` | int | `4` | 1 | 20 | Max source adjustments per cycle |

## `chip_merge`

**Consumed by:** `lib/chips/runtime.py`

| Key | Type | Default | Min | Max | Description |
|-----|------|---------|-----|-----|-------------|
| `duplicate_churn_ratio` | float | `0.95` | 0.5 | 1.0 | Churn ratio for duplicate detection |
| `duplicate_churn_min_processed` | int | `20` | 1 | 1000 | Min processed before churn check |
| `duplicate_churn_cooldown_s` | int | `300` | 30 | 3600 | Churn check cooldown (s) |
| `min_cognitive_value` | float | `0.24` | 0.0 | 1.0 | Min cognitive value score |
| `min_actionability` | float | `0.18` | 0.0 | 1.0 | Min actionability score |
| `min_transferability` | float | `0.15` | 0.0 | 1.0 | Min transferability score |
| `min_statement_len` | int | `18` | 5 | 200 | Min statement length (chars) |

## `advisory_quality`

**Consumed by:** `lib/advisory_synthesizer.py`

| Key | Type | Default | Min | Max | Description |
|-----|------|---------|-----|-----|-------------|
| `profile` | str | `enhanced` | — | — | Quality profile name (basic, enhanced, premium) |
| `preferred_provider` | str | `minimax` | — | — | Preferred provider |
| `ai_timeout_s` | float | `15.0` | 0.5 | 60.0 | AI timeout for quality synthesis |
| `minimax_model` | str | `MiniMax-M2.5` | — | — | MiniMax model name |
| `source` | str | `""` | — | — | Config source identifier |
| `updated_at` | str | `""` | — | — | Last update timestamp |

## `advisory_preferences`

**Consumed by:** `lib/advisory_preferences.py`

| Key | Type | Default | Min | Max | Description |
|-----|------|---------|-----|-----|-------------|
| `memory_mode` | str | `standard` | — | — | Memory mode (off, standard, replay) |
| `guidance_style` | str | `balanced` | — | — | Guidance style (concise, balanced, coach) |
| `source` | str | `""` | — | — | Config source identifier |
| `updated_at` | str | `""` | — | — | Last update timestamp |

## `memory_emotion`

**Consumed by:** `lib/memory_store.py`

| Key | Type | Default | Min | Max | Description |
|-----|------|---------|-----|-----|-------------|
| `enabled` | bool | `True` | — | — | Enable emotion context in retrieval |
| `write_capture_enabled` | bool | `True` | — | — | Capture emotion on write |
| `retrieval_state_match_weight` | float | `0.22` | 0.0 | 1.0 | Weight for emotion state matching |
| `retrieval_min_state_similarity` | float | `0.3` | 0.0 | 1.0 | Min similarity for emotion match |

## `memory_learning`

**Consumed by:** `lib/memory_store.py`

| Key | Type | Default | Min | Max | Description |
|-----|------|---------|-----|-----|-------------|
| `enabled` | bool | `True` | — | — | Enable learning signal in retrieval |
| `retrieval_learning_weight` | float | `0.25` | 0.0 | 1.0 | Weight for learning signal |
| `retrieval_min_learning_signal` | float | `0.2` | 0.0 | 1.0 | Min learning signal for match |
| `calm_mode_bonus` | float | `0.08` | 0.0 | 1.0 | Bonus for calm emotional state |

## `memory_retrieval_guard`

**Consumed by:** `lib/memory_store.py`

| Key | Type | Default | Min | Max | Description |
|-----|------|---------|-----|-----|-------------|
| `enabled` | bool | `True` | — | — | Enable retrieval guard scoring |
| `base_score_floor` | float | `0.3` | 0.0 | 1.0 | Minimum base score before boosts |
| `max_total_boost` | float | `0.42` | 0.0 | 2.0 | Cap on total score boost |

## `bridge_worker`

**Consumed by:** `lib/bridge_cycle.py`

| Key | Type | Default | Min | Max | Description |
|-----|------|---------|-----|-----|-------------|
| `enabled` | bool | `True` | — | — | Enable bridge worker |

## `memory_capture`

**Consumed by:** `lib/memory_capture.py`

| Key | Type | Default | Min | Max | Description |
|-----|------|---------|-----|-----|-------------|
| `enabled` | bool | `True` | — | — | Enable memory capture |

## `production_gates`

**Consumed by:** `lib/production_gates.py`

| Key | Type | Default | Min | Max | Description |
|-----|------|---------|-----|-----|-------------|
| `enforce_meta_ralph_quality_band` | bool | `True` | — | — | Enforce quality band check |
| `min_quality_samples` | int | `50` | 5 | 1000 | Min samples for quality gate |
| `min_quality_rate` | float | `0.3` | 0.0 | 1.0 | Min quality rate (floor) |
| `max_quality_rate` | float | `0.6` | 0.0 | 1.0 | Max quality rate (ceiling) |
