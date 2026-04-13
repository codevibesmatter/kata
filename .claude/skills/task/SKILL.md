---
name: task
description: "Combined planning + implementation for small tasks, chores, and quick fixes. Activate when entering task mode."
---

> **Session setup:** If you haven't already, run `kata enter task` to register this session for task tracking, stop-condition enforcement, and phase guidance. The skill provides methodology; the CLI provides workflow infrastructure.

# Task Mode

**For small tasks and chores** — combined planning + implementation in one flow.

## When to Use

- Chores (refactoring, cleanup, config, docs)
- Small features (< 3 files, < ~100 lines)
- Quick fixes (bugs, typos, edge cases)
- Work that doesn't need a full spec

## When NOT to Use

- Features needing full design → `kata enter planning`
- Complex multi-file changes → `kata enter planning`
- Bugs needing systematic investigation → `kata enter debug`
- Work spanning multiple sessions → `kata enter planning`

## Flow

```
P0: Plan (5-10 min)
    ├── Classify: chore / feature / fix
    ├── Quick context search (Explore agent)
    └── 3-5 line scope + approach

P1: Implement
    ├── Make minimal, focused changes
    └── Verify as you go (typecheck, tests)

P2: Complete
    ├── Final checks
    ├── Commit + push
    └── Close GitHub issue (if any)
```

## Key Principle

**Do less, verify more.** Task mode is for focused, bounded work.

---

# Quick Planning Methodology

1. **Understand the request** — Read the task prompt carefully. Identify what is being asked.
2. **Scope the work** — List the files that will change and the ones that won't.
3. **Identify risks** — What could go wrong? Are there edge cases?
4. **Define verification** — How will you know the implementation is correct?
5. **Outline steps** — Write a short numbered plan before touching any code.
