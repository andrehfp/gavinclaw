---
name: social-media-poster
description: >
  Unified social media posting skill for cross-platform content distribution.
  Use when: user wants to post simultaneously or manage content across multiple social platforms (LinkedIn, Twitter/X, Instagram, Facebook).
  Don't use when: creating initial content draft (use content-brainstorm or hormozi-content-engine), or generating images (use nano-banana-pro).
  Outputs: cross-platform post scheduling, platform-specific formatting, tracking of published posts.
---

# Social Media Poster

Unified interface for multi-platform social media publishing.

## Supported Platforms
- [x] LinkedIn (scripts/linkedin_post.py)
- [x] Twitter/X (scripts/twitter_post.py)
- [ ] Instagram (Meta Business API)
- [ ] Facebook (Meta Business API)

## Workflow

1. **Receive Content**
   - Single post draft
   - Multiple platform-specific variations
   - Metadata (tags, CTAs, etc)

2. **Platform Validation**
   - Check credentials for each platform
   - Verify posting permissions
   - Handle authentication refreshes

3. **Platform-Specific Formatting**
   - Adjust text length
   - Modify hashtags
   - Adapt tone
   - Manage media attachments

4. **Scheduling & Publishing**
   - Immediate post
   - Schedule for specific time
   - Batch posting across platforms

5. **Post-Publishing**
   - Track post URLs
   - Record engagement metrics
   - Store in `memory/social_posts.jsonl`

## Configuration

Requires:
- OAuth tokens for each platform
- `~/.openclaw/.secrets/` credential files
- Active API access

## Pending Integrations
- Twitter/X: Waiting for Read+Write permissions
- Instagram: Waiting for Meta Business API setup

## Monitoring
- Log all posting attempts
- Alert on failed posts
- Auto-retry with exponential backoff