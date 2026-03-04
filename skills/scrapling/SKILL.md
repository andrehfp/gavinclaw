---
name: scrapling
description: Use Scrapling for robust web scraping in Python with anti-bot handling, dynamic page fetching, adaptive selectors, and crawl workflows. Trigger when scraping is brittle (Cloudflare/JS-heavy pages), when CSS/XPath selectors keep breaking, or when you need scalable crawls with concurrency/sessions/proxy rotation. Do not use for simple static page extraction that web_fetch already handles.
---

# Scrapling

## Quick start

Use this skill when `web_fetch` is not enough and you need resilient scraping.

1. Install in a venv:
   - `python3 -m venv .venv && source .venv/bin/activate`
   - `pip install -U pip scrapling playwright patchright browserforge curl_cffi msgspec`
2. For quick verification, run:
   - `python scripts/scrapling_probe.py https://example.com`
3. For basic extraction in code:

```python
from scrapling.fetchers import Fetcher

page = Fetcher.get("https://example.com")
title = page.css("title::text").get()
print(title)
```

## Workflow decision

- Use `web_fetch` first for cheap/fast extraction.
- Switch to Scrapling when:
  - content depends on JS rendering,
  - anti-bot blocks appear,
  - selectors break frequently,
  - you need repeatable crawling at scale.

## Recommended patterns

### 1) Static pages (fast)

```python
from scrapling.fetchers import Fetcher

p = Fetcher.fetch("https://site.com")
items = [x.text for x in p.css(".card h2")]
```

### 2) Dynamic/JS pages

```python
from scrapling.fetchers import DynamicFetcher

p = DynamicFetcher.fetch("https://site.com", headless=True, network_idle=True)
```

### 3) Hard targets / anti-bot

```python
from scrapling.fetchers import StealthyFetcher

StealthyFetcher.adaptive = True
p = StealthyFetcher.fetch("https://site.com", headless=True, network_idle=True)
```

### 4) Adaptive selectors (layout changed)

Save stable targets once, then recover later:

```python
products = p.css(".product", auto_save=True)
# later after layout changes
products = p.css(".product", adaptive=True)
```

## Guardrails

- Respect robots.txt, Terms of Service, and local law.
- Prefer low request rates and polite concurrency.
- Avoid collecting sensitive personal data unless explicitly required.
- Start with one URL and validate extraction quality before scaling.

## References

- Read docs index: `references/scrapling-notes.md`
- Use probe script: `scripts/scrapling_probe.py`
