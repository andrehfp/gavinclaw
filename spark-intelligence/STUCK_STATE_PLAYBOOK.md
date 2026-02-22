# Stuck State Playbook

> **The mantra:** "If progress is unclear, stop acting and change the question."

This playbook defines how EIDOS handles being stuck. A rabbit hole is NOT lack of intelligence - it's **loss of progress signal**.

---

## The Universal Truth

A rabbit hole is:
- NOT lack of intelligence
- NOT lack of tools
- NOT lack of ideas

A rabbit hole is **loss of progress signal**.

The moment the system cannot answer:
> "What evidence will tell me I'm making progress?"

...it's already lost.

---

## Invariant Rules (Never Break These)

### Rule 1: No Action Without Falsifiable Hypothesis

If the system cannot say:
- What it believes
- How it could be wrong
- What signal would change its mind

It **must not act**.

### Rule 2: Two Failures = Stop Modifying Reality

After two failed attempts:
- NO code edits
- NO new tools
- NO "one more try"

Only:
- Evidence gathering
- Isolation
- Explanation

**This single rule kills 80% of rabbit holes.**

### Rule 3: Progress Must Be Observable

Every step must change *something* measurable:
- State
- Evidence
- Confidence
- Scope

If nothing changed → the step was invalid.

### Rule 4: Budgets Are Capped

Every objective has:
- Step budget (default: 25)
- Retry budget (default: 2 per error)
- Time budget (default: 12 minutes)

**No exceptions.**

When a budget hits zero, authority transfers (to escalation or redesign).

### Rule 5: Memory Must Be Consulted

Before any major action:
- Retrieve memory
- Cite it
- Or explicitly say "none exists"

**Silent forgetting is forbidden.**

---

## Watcher Reference

| Watcher | Trigger | Severity | Action | Required Output |
|---------|---------|----------|--------|-----------------|
| **Repeat Failure** | Same error 2x | FORCE | → DIAGNOSE | New hypothesis + discriminating test |
| **No New Evidence** | 5 steps without evidence | FORCE | → DIAGNOSE | Evidence-gather plan only |
| **Diff Thrash** | Same file 3x | BLOCK | → SIMPLIFY | Minimal reproduction or isolation |
| **Confidence Stagnation** | Delta < 0.05 for 3 steps | FORCE | → PLAN | 2 alternate hypotheses + tests |
| **Memory Bypass** | Action without citation | BLOCK | Stop | Retrieval + citation |
| **Budget Half No Progress** | >50% budget, no progress | FORCE | → SIMPLIFY | Scope reduction + minimal failing unit |

---

## Escape Protocol Steps

When any watcher triggers twice, or budget > 80%, execute:

### Step 1: FREEZE

> No more edits, no more fixes.

```
ACTION_ALLOWED = False
EDIT_ALLOWED = False
WRITE_ALLOWED = False
```

### Step 2: SUMMARIZE

Answer these exactly:
- What is the goal?
- How many steps taken?
- What errors occurred?
- What was tried?

```yaml
summary:
  goal: "..."
  steps_taken: N
  unique_errors: N
  recent_failures:
    - decision: "..."
      result: "..."
```

### Step 3: ISOLATE

Force answer to:
> What is the *smallest* failing unit?

Can I isolate to:
- One function?
- One assumption?
- One invariant?

**If can't isolate → problem is too big.**

### Step 4: FLIP THE QUESTION

Replace:
> "How do I fix this?"

With:
> "What must be true for this to be impossible?"

This exposes hidden assumptions.

### Step 5: CHANGE MODE

Switch to ONE of:

| Mode | What It Does |
|------|--------------|
| **EXPLAIN** | Describe system behavior as if teaching a junior |
| **PROVE** | State invariants and show which is violated |
| **OBSERVE** | Only gather data, no changes |
| **SIMPLIFY** | Delete until failure disappears |

**No freeform reasoning.**

### Step 6: PRODUCE LEARNING ARTIFACT

Regardless of success, the protocol must end with:
- A new sharp edge
- An anti-pattern
- Or a "do not attempt again under X" rule

**Rabbit holes must pay rent.**

---

## Stuck State Flow

```
┌──────────────────────────────────────────────────────────────────┐
│                    STUCK STATE DETECTION                         │
└──────────────────────────────────────────────────────────────────┘

     Normal Operation
           │
           ▼
    ┌──────────────┐
    │ Watcher      │
    │ Monitors     │
    └──────┬───────┘
           │
     ┌─────┴─────┐
     │           │
  OK        ALERT
     │           │
     ▼           ▼
  Continue   ┌──────────────┐
             │ Count Alert  │
             └──────┬───────┘
                    │
             ┌──────┴──────┐
             │             │
          Count=1      Count>=2
             │             │
             ▼             ▼
         Warning      ┌──────────────┐
         (Log)        │ ESCAPE       │
                      │ PROTOCOL     │
                      └──────┬───────┘
                             │
                      ┌──────┴──────┐
                      │             │
                  Recovery      Still Stuck
                      │             │
                      ▼             ▼
               ┌─────────┐   ┌─────────────┐
               │ Resume  │   │ ESCALATE    │
               │ DIAGNOSE│   │ to Human    │
               └─────────┘   └─────────────┘
```

---

## Phase Restrictions During Stuck State

When in DIAGNOSE or SIMPLIFY:

| Tool | Allowed | Notes |
|------|---------|-------|
| Read | YES | Gather information |
| Glob | YES | Find files |
| Grep | YES | Search patterns |
| Bash (read-only) | YES | `ls`, `cat`, `echo` |
| Bash (write) | NO | No `rm`, `mv`, etc. |
| Edit | NO | Frozen |
| Write | NO | Frozen |

---

## Recovery Criteria

To exit stuck state, must demonstrate:

1. **New Information**: Something learned that wasn't known before
2. **Isolated Failure**: Can point to specific failing unit
3. **Discriminating Test**: A test that will tell us which hypothesis is correct
4. **Changed Approach**: Not retrying the same thing

---

## Example Escape Protocol Output

```yaml
escape_protocol:
  triggered: true
  reason: "Watcher REPEAT_FAILURE triggered twice"

  summary: |
    Goal: Fix login validation bug
    Steps taken: 12
    Phase: EXECUTE
    Errors: 2 unique signatures
    Recent failures:
      - Edit auth.py: old_string not found
      - Edit auth.py: old_string not found

  smallest_failing_unit: "File: auth.py"

  flipped_question: "What if the file content has already changed?"

  hypotheses:
    - "File was modified by another process"
    - "We're reading stale content"
    - "The old_string has invisible characters"

  discriminating_test: "Read auth.py and compare exact bytes"

  new_phase: DIAGNOSE

  learning_artifact:
    type: SHARP_EDGE
    statement: "When Edit fails twice with 'not found', always re-Read the file"
    domains: ["file_operations", "editing"]
    confidence: 0.7
```

---

## Time to Escape Metric

Track this number:
> **How long does it take to recognize and exit a rabbit hole?**

This number should shrink over time.

| Week | Avg Steps to Escape | Target |
|------|---------------------|--------|
| 1 | 8 | - |
| 2 | 6 | -25% |
| 3 | 4 | -33% |
| 4 | 3 | -25% |

---

## UI Integration

### Visual Cues

- **Budget bars draining** (show percentage used)
- **Repeated error warnings pulsing** (same error 2x)
- **"No new evidence" banners** (5 steps without)
- **Phase indicator flashing** when violated

### The Escape Button

Add a visible button:

```
╔══════════════════════════════════════════╗
║  🚨 I am stuck — initiate escape protocol ║
╚══════════════════════════════════════════╝
```

This should:
1. Freeze actions
2. Summarize evidence
3. Switch mode
4. Force distillation

**This button is not a failure. It's a sign of maturity.**

---

## Remember

> **No progress signal = stop acting, gather evidence, change the question.**

Rabbit holes become learning events when you:
1. Detect them early
2. Constrain behavior
3. Force learning
4. Respect limits

The goal is not "avoid rabbit holes."
The goal is **detect loss of progress early and force correction.**
