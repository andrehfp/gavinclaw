# Top 10 Reel Ideas — Production Ready

Priority order: test hooks 1–3 first (highest viral potential).

---

## 🔥 Priority 1: Instant Hooks

### Reel #1 — "Stuck forever"
**Hook:** "I thought I'd be stuck doing slow renders forever until I tried this"
**Visuals:** SketchUp gray model (3s) → wipe → photorealistic render (3s) → CTA "moldaspace.com"
**Assets:** `sketchup-before.png` / `sketchup-rendered.png`
**Duration:** ~15s

### Reel #2 — "Wrong render"
**Hook:** "You're probably doing your renders wrong (and don't even realize it)"
**Visuals:** Dark/flat render with bad lighting (NBP generate) → same room with warm natural light → text overlay "the difference: AI styling"
**Assets:** Generate with NBP (same room, different lighting)
**Duration:** ~15s

### Reel #3 — "AI renders look real"
**Hook:** "Everyone told me AI renders wouldn't look real... until they did"
**Visuals:** Rapid before/after sequence — 5 rooms, 2s each
**Assets:** All 5 before/after pairs in `public/`
**Duration:** ~12s

---

## 💾 Priority 2: Tips & Hacks (Save Magnets)

### Reel #4 — "Cut render time in half"
**Hook:** "How to cut your render time in half without losing quality"
**Visuals:** Split screen — traditional workflow (long) vs MoldaSpace workflow (fast). Add countdown timer overlay.
**Duration:** ~20s

### Reel #5 — "3 styles to try"
**Hook:** "3 render styles every architect should try in 2025"
**Visuals:** Japandi → Modern → Industrial, each 3s with name label. Same room, 3 styles.
**Assets:** `japandi.png`, `modern.png`, `industrial.png` thumbnails + generate 3 renders of same room
**Duration:** ~15s

### Reel #6 — "Lazy render workflow"
**Hook:** "The lazy way I deliver renders to clients (but it works)"
**Visuals:** 3-step screen: 1. Upload model 2. Pick style 3. Download render. Fast cuts.
**Assets:** Dashboard screenshots (needs MoldaSpace access)
**Duration:** ~20s

---

## 🎓 Priority 3: How-To (Authority Building)

### Reel #7 — "My exact workflow"
**Hook:** "My exact workflow for photorealistic renders — you can copy it"
**Visuals:** Real dashboard walkthrough — upload, style picker, generate, download
**Assets:** Screen recording of MoldaSpace dashboard (needs login)
**Duration:** ~45-60s

### Reel #8 — "Beginner mistake"
**Hook:** "The mistake every beginner makes in SketchUp rendering"
**Visuals:** Common mistake (flat model, no materials) → reveal: AI fixes it instantly
**Assets:** `sketchup-before.png` / `sketchup-rendered.png`
**Duration:** ~20s

---

## 💬 Priority 4: Storytelling (1x/week)

### Reel #9 — "7 styles, same room"
**Hook:** "What I learned by rendering the same room in 7 different styles"
**Visuals:** Same room layout, all 7 style variations cycling
**Assets:** Generate 7 renders of same NBP room with each style
**Duration:** ~20s

### Reel #10 — "Stopped chasing perfection"
**Hook:** "Why I stopped chasing perfection in my renders"
**Visuals:** "Good enough" render vs over-processed render. Text reflection overlaid.
**Duration:** ~30s, voiceover or text-only

---

## Production Notes

- Reels #1, #3, #5, #8 can be built NOW (all assets available)
- Reel #7 needs dashboard login (Camoufox walkthrough)
- Reel #9 needs NBP batch generation (~30min)
- All Remotion comps: 1080x1920, dark bg (#0A0A0A), gold accent (#D4A574)
- Claude Code command: `ANTHROPIC_MODEL="claude-opus-4-6" claude --dangerously-skip-permissions "<task>"`
