# AGI Scientist Matrix (Carmack-Style Mapping To Spark)

Date: 2026-02-15
Repo: vibeforge1111/vibeship-spark-intelligence
Goal: A "who / what / contribution / how it maps / what to steal" matrix for AGI-adjacent researchers,
written to be usable for Spark engineering decisions (bounded, measurable, low-complexity).

This is not a popularity list. It is a set of lenses that match Spark's actual surfaces:
- routing (fast path vs slow path)
- advisory generation and suppression
- memory representations and retrieval
- outcome attribution and policy updates
- stability and scalability constraints

---

## 1) John Carmack (Engineering-First AGI Work, Keen)

What he did:
- shipped multiple performance-critical realtime systems (game engines, VR stacks)
- built organizations around hard budgets, profiling, and "make it work, then make it fast"
- left Meta/Oculus to focus on AGI work (Keen Technologies)

What he brought to the table (transferable principles):
- critical-path obsession: know the value path, then protect it
- deterministic failure modes: "why did it do that?" must be answerable from logs
- strict budgets and graceful degradation: fail cheap, never explode tails silently
- default simplicity: features earn their way into default only if they move a KPI

How Spark connects:
- Spark already has a fast path (packet lookup) and a slow path (live advisor retrieval).
- Spark already has budgets (timeouts, rate caps, max_queries) but must keep them "default-on".
- The advisory system is the policy surface Carmack would demand be bounded and measurable.

Where Spark differs:
- Spark is a runtime system around an external LLM/tooling interface, not an end-to-end trained agent.
- Learning is largely symbolic/statistical policy updates and memory promotion, not gradient-updated policies.

What to steal today (Carmack-simple):
- keep advisory synthesis deterministic by default (decode late; do not pay network cost by default)
- keep escalation rare and explainable (budget-based denial, rate caps, recorded reasons)
- enforce "evidence or delete": every subsystem needs cost and benefit metrics

Primary sources (public):
- Lex Fridman interview page: https://lexfridman.com/john-carmack/
- AMII video: Keen research directions talk: https://www.amii.ca/videos/keen-technologies-research-directions-john-carmack-upper-bound-2025
- Reporting on Keen + Sutton: https://www.theregister.com/2023/09/26/john_carmack_agi/

---

## 2) Richard Sutton (Reinforcement Learning, Continual Learning Agenda)

What he did:
- foundational RL work (temporal-difference learning, the policy/value framing)
- long-horizon agent agenda: continual learning from interaction, not static datasets

What he brought:
- credit assignment over time as the organizing problem (what helped, later?)
- a clean interface for self-improvement: policy + value + reward/outcomes
- anti-fragility: algorithms should get better with more compute and data (not hand-built tricks)

How Spark connects:
- advisory actions are "policy decisions" that can be scored by outcomes
- packet reuse is a lightweight form of "experience replay" (but must stay bounded)

Where Spark differs:
- sparse, noisy reward signals (tool success is not the same as "user got value")
- no learned value function; uses heuristics and reliability gates

What to steal today:
- formalize outcome tags for advisory (acted/ignored/harmful/blocked) with strict collection windows
- treat tuneables as a policy vector and maintain a conservative "suggest then apply" loop
- enforce bounded memory and decay tied to measured usefulness

Primary sources:
- Alberta Plan (arXiv): https://arxiv.org/abs/2208.11173
- AMII announcement referencing Carmack: https://www.globenewswire.com/news-release/2025/03/05/3038076/0/en/Computer-scientist-Richard-Sutton-wins-2024-AM-Turing-Award.html

---

## 3) Yann LeCun (World Models, Predictive Representation, JEPA)

What he did:
- key deep learning and self-supervised learning contributions
- strong focus on "world models" and prediction as the substrate for intelligence

What he brought:
- learn compact state representations by prediction, not by labeling everything
- separate representation learning from downstream action and language

How Spark connects:
- embeddings + retrieval are a representation layer
- advisory synthesis is decoding to language at the boundary

Where Spark differs:
- Spark does not learn its embedding space end-to-end from outcomes

What to steal today:
- "decode late": keep internal state/policy in compact representations; generate text only when emitting
- build state-transition logging: (intent, tool, constraints) -> (advice, action) -> (outcome)
- use outcomes to re-rank retrieval items (not just popularity/reliability)

Primary sources:
- LeCun, "A Path Towards Autonomous Machine Intelligence" (arXiv): https://arxiv.org/abs/2205.01943
- I-JEPA (arXiv): https://arxiv.org/abs/2301.08243

---

## 4) Demis Hassabis and David Silver (DeepMind: Search + Value + Representation)

What they did:
- built systems combining representation learning and planning/search (AlphaGo, MuZero line)

What they brought:
- separation of fast priors (cheap proposals) and expensive search (rare escalation)
- a strong bias toward measured improvements over aesthetic complexity

How Spark connects:
- packet exact/relaxed lookup is a fast prior
- agentic facet queries are the expensive search-like escalation

What to steal today:
- make escalation "rare and justified": require explicit signals and preserve hard caps
- track ROI per route: if escalation does not improve outcomes, reduce it

Primary sources:
- AlphaGo (Nature): https://www.nature.com/articles/nature16961
- MuZero (Nature): https://www.nature.com/articles/s41586-020-03051-4

---

## 5) Yoshua Bengio (Bottlenecks, Structured Latents, System 2 Discipline)

What he did:
- foundational deep learning work and proposals for more structured cognition

What he brought:
- bottleneck discipline: small working set, selective attention, structured latent variables

How Spark connects:
- advisory output limits, gating, and dedupe are the practical "bottleneck"

What to steal today:
- enforce a minimal advisory template (1 diagnosis, 1 next check, up to 2 evidence lines)
- keep "working set" explicit and tiny (intent, constraint, action)

Primary sources:
- The Consciousness Prior (arXiv): https://arxiv.org/abs/1709.08568

---

## 6) Geoffrey Hinton and Ilya Sutskever (Scaling, Representation Learning)

What they did:
- core representation learning ideas and the scaling-centered engineering that enabled modern LLMs

What they brought:
- training stability and optimization pragmatics matter as much as model ideas

How Spark connects:
- Spark is not training a foundation model, but it is still optimizing policies in a noisy environment

What to steal today:
- shrink the tuning surface area; prefer stable defaults; run repeatable harnesses before changing knobs

---

## 7) Jeff Hawkins (HTM / Thousand Brains, Prediction-First Cognition)

What he did:
- built an alternative cognition theory centered on prediction and hierarchical memory

What he brought:
- "prediction is the core primitive" framing (useful even if you disagree with the implementation)

How Spark connects:
- Spark can treat advice as a prediction about what will work next; outcomes validate or refute it

What to steal today:
- explicitly log "expected next check outcome" on high-stakes actions
- treat prediction error as a trigger for storage and policy adjustment (bounded)

Primary sources:
- Thousand Brains Theory (Numenta): https://www.numenta.com/resources/thousand-brains-theory-of-intelligence/

---

## 8) Judea Pearl (Causality, Counterfactuals)

What he did:
- formalized causal inference frameworks used widely beyond ML

What he brought:
- do-calculus and counterfactual reasoning: "what would have happened if we did X?"

How Spark connects:
- Spark's advice evaluation should avoid naive correlation (some advice appears helpful only because context differed)

What to steal today:
- add lightweight counterfactual fields to evaluation: "would I have succeeded anyway?"
- require evidence provenance for high-stakes advice claims

Primary sources:
- Judea Pearl lab page: https://bayes.cs.ucla.edu/jp_home.html

---

## 9) Gary Marcus (Critique Of Pure Scaling, Hybrid Systems)

What he did:
- argued for hybrid approaches and highlighted brittleness in purely statistical systems

What he brought:
- stress tests as a first-class discipline (failure mode taxonomies, not just average-case demos)

How Spark connects:
- Spark is a production system; tail failures matter more than average wins

What to steal today:
- maintain a "known failure modes" test suite for advisory and retrieval routing
- when a knob is added, add the regression case that justified it

Primary sources:
- Author page: https://garymarcus.com/

---

## 10) Spark-Specific Translation: The Only Questions That Matter

When reading any AGI research or scientist commentary, translate it into:
- Which Spark surface does this affect: routing, memory, advisory, outcomes, or stability?
- What KPI is expected to move (and what is the guardrail KPI that must not regress)?
- What is the lowest-complexity implementation that lets us test the idea in production?
- What is the rollback trigger and the failure classification?

If you cannot answer those four questions, the idea stays research-only.
