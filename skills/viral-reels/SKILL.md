---
name: viral-reels
description: "Create viral Instagram Reels for @studio.maia.arch (MoldaSpace AI design account). Use when: generating reel ideas, writing hooks, producing Remotion videos, or planning content batches for the Maia Instagram. Covers 4 hook frameworks (Tips/Hacks, Instant Hooks, How-To, Storytelling), Remotion pipeline, asset inventory, and posting workflow. NOT for: generic social media posts (use content-brainstorm), carousels, or non-video content."
---

# Viral Reels — @studio.maia.arch

## Pipeline

1. **Pick hook type** → see `references/hooks.md` for 40+ ready-to-use templates
2. **Generate images** → NBP sketch + render via `scripts/moldaspace_reel.py`
3. **Build Remotion comp** → `~/Projects/moldaspace-reels/` (Claude Code with Opus 4.6)
4. **Render** → `npx remotion render <CompositionId> out/<name>.mp4`
5. **Post** → `python3 scripts/instagram_reel.py <file> --account maia --caption "<cap>"`

## Assets Available (`~/Projects/moldaspace-reels/public/`)

**Before/After pairs:**
- `scandinavian-kitchen-before.png` / `scandinavian-kitchen-after.png`
- `modern-living-room-before.png` / `modern-living-room-after.png`
- `japandi-bedroom-before.png` / `japandi-bedroom-after.png`
- `bathroom-minimalist-before.png` / `bathroom-minimalist-after.png`
- `office-industrial-before.png` / `office-industrial-after.png`
- `sketchup-before.png` / `sketchup-rendered.png`
- `revit-before.jpg` / `revit-after.png`
- `floorplan-before.png` / `floorplan-after.png`

**Style thumbnails:** `scandinavian.png`, `modern.png`, `minimalist.png`, `japandi.png`, `industrial.png`, `mid-century.png`, `bohemian.png`

## Remotion Compositions

- `BeforeAfterReveal` — wipe transition, portrait 9:16
- `MoldaSpaceExplainer` — 6-scene explainer v1
- `MoldaSpaceExplainerV2` — 6-scene explainer v2 with multiple examples
- New comps → add to `src/Root.tsx`, register with `<Composition />`

## Content Mix (80/20 rule)

- **80%** — pure value: renders, design tips, style comparisons, before/after
- **20%** — product context: "generated with MoldaSpace", workflow demos
- Bio does the heavy lifting: "Renders by @moldaspace"

## Hook Priority (test first → most viral potential)

1. Instant Hooks — first 2s attention grab
2. Tips & Hacks — save/share magnets
3. Beginners/How-To — authority building
4. Storytelling — deep connection (lower volume)

## Remotion + Claude Code

Always spawn with Opus 4.6:
```bash
cd ~/Projects/moldaspace-reels && ANTHROPIC_MODEL="claude-opus-4-6" claude --dangerously-skip-permissions "<task>"
```

Notify on completion:
```
openclaw system event --text "Done: <video>.mp4 rendered" --mode now
```

## References

- **Hook templates**: `references/hooks.md` — 40+ hooks in 4 categories, adapted for Maia
- **Top 10 reel ideas**: `references/reel-ideas.md` — specific production-ready concepts
