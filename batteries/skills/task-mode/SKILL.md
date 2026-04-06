---
name: task-mode
description: "Combined planning + implementation for small tasks, chores, and quick fixes. Activate when entering task mode."
---

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
