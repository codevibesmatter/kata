---
name: research
description: "Deep exploration with parallel agent search and documented findings. Activate when entering research mode."
---

> **Session setup:** If you haven't already, run `kata enter research` to register this session for task tracking, stop-condition enforcement, and phase guidance. The skill provides methodology; the CLI provides workflow infrastructure.

# Research Mode

Deep exploration with parallel agent search and documented findings.

## Phase Flow

```
P0: Clarify (required)     → understand what to research
P1: Scope (required)       → define questions + success criteria
P2: Codebase (optional)    → parallel Explore agents
P3: External (optional)    → web search + documentation
P4: Synthesize (required)  → compile findings + write research doc
P5: Present (required)     → share results + decide next step
```

## Output

- Research doc: `{research_path}/{date}-{slug}.md` (configurable in kata.yaml)
- Structured findings with sources
- Ranked recommendations
- Next steps (none, planning, more research)
