---
name: content-brainstorm
description: >
  Generate content ideas and ready-to-post drafts for Twitter/X, Instagram, and newsletters.
  Use when: brainstorming post ideas, creating content from a topic, repurposing across platforms, writing hooks/threads/carousels.
  Don't use when: generating images/thumbnails, or doing video repurposing (use viralclaw).
  Outputs: multiple content ideas with drafts, hooks, and CTAs.
---

# Content Brainstorm

Transform ideas into platform-ready content drafts.

## Workflow

1. **Receive input**: User provides a topic, idea, experience, or raw thought
2. **Load context**: Read `references/platforms.md` for platform rules, `references/frameworks.md` for hooks and structures
3. **Identify angle**: Pick the strongest angle (contrarian, story, tutorial, data, hot take)
4. **Generate drafts**: Create 3-5 variations per requested platform

## Output Format

For each draft, output:

```
## [Platform] — [Hook Type]

[Ready-to-post content]

---
Angle: [what makes this work]
```

## Rules

- Default language: PT-BR informal ("você", not "tu")
- If user doesn't specify platform, generate for Twitter/X + Instagram
- Each draft must be READY TO POST — no placeholders, no "[insert X here]"
- Write in the user's voice (sharp, direct, no corporate fluff — reference USER.md)
- One idea per post. If the idea is big, split into a thread
- Always include a hook in the first line that stops the scroll
- Generate at least 3 variations with different angles/hooks
- If the idea comes from a personal experience, lean into storytelling
- If the idea is technical, lean into "here's exactly how" tactical content
- If output includes newsletter draft: always run a final Humanizer pass (https://github.com/blader/humanizer) before sending final text

## Repurpose Mode

When user says "repurpose" or provides a single idea for multiple platforms:

1. Read `references/frameworks.md` → Repurposing Matrix
2. Generate one adapted version per platform
3. Each version must feel NATIVE to the platform (not copy-pasted)

## Examples of Good Triggers

- "brainstorm posts sobre X"
- "cria um post pro Twitter sobre Y"
- "tenho uma ideia: [idea]. transforma em conteúdo"
- "repurpose essa ideia pra Instagram e Twitter"
- "preciso de hooks pra um post sobre Z"
