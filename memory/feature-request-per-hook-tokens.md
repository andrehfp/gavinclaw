# Feature Request: Per-Mapping Webhook Tokens

**Submitted:** 2026-02-07
**Status:** Draft (ready to submit to GitHub)

## Summary

Allow individual webhook mappings to have their own authentication tokens, in addition to the global `hooks.token`.

## Current Behavior

```json
{
  "hooks": {
    "enabled": true,
    "token": "shared-secret",  // Single token for ALL webhooks
    "mappings": [
      { "id": "viralclip", ... },
      { "id": "github", ... },
      { "id": "stripe", ... }
    ]
  }
}
```

All webhooks share the same token. If compromised, all integrations are exposed.

## Proposed Behavior

```json
{
  "hooks": {
    "enabled": true,
    "token": "default-fallback-token",
    "mappings": [
      { 
        "id": "viralclip",
        "token": "viralclip-specific-token",  // NEW: per-mapping token
        ...
      },
      { 
        "id": "github",
        "token": "github-specific-token",
        ...
      },
      { 
        "id": "stripe",
        // No token = falls back to hooks.token
        ...
      }
    ]
  }
}
```

## Benefits

1. **Security isolation**: Compromised service token doesn't expose others
2. **Rotation flexibility**: Rotate individual tokens without updating all services
3. **Audit clarity**: Know which service made which request
4. **Zero trust**: Each external service gets minimal access

## Implementation Notes

- Per-mapping `token` field (optional)
- Falls back to `hooks.token` if not specified
- Backwards compatible (existing configs work unchanged)
- Token check in mapping lookup: `mapping.token || hooks.token`

## Use Cases

- SaaS webhooks (Stripe, LemonSqueezy, GitHub)
- Internal service integrations
- Multi-tenant setups
- B2B API products (each customer gets unique token)

---

*Feature suggested by @andrefprado while building ViralClaw API*
