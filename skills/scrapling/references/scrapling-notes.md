# Scrapling notes

## Core docs
- Home: https://scrapling.readthedocs.io
- Fetchers: https://scrapling.readthedocs.io/en/latest/fetching/choosing/
- Selection: https://scrapling.readthedocs.io/en/latest/parsing/selection/
- Spiders: https://scrapling.readthedocs.io/en/latest/spiders/architecture.html
- Proxy + blocking: https://scrapling.readthedocs.io/en/latest/spiders/proxy-blocking.html

## Practical defaults
- Start with `Fetcher` for static pages.
- Move to `DynamicFetcher` for JS-heavy pages.
- Use `StealthyFetcher` only when needed, because it is heavier.
- Validate selector quality on 3-5 sample pages before large crawls.
- Persist outputs as JSONL for incremental pipelines.

## Common failure modes
- Empty result set: selector mismatch or content rendered post-load.
- Intermittent blocks: lower concurrency, rotate proxies, add jitter.
- Layout drift: use adaptive selector flow (`auto_save` then `adaptive=True`).
