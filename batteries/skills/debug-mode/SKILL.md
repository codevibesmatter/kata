---
name: debug-mode
description: "Systematic hypothesis-driven debugging with reproduction, root cause analysis, and fix. Activate when entering debug mode."
---

# Debug Mode

Systematic, hypothesis-driven debugging. No guessing — reproduce first, hypothesize, trace, fix.

## Phase Flow

```
P0: Reproduce & Map
    ├── Capture exact error evidence
    ├── Map affected system layers
    └── Classify bug type

P1: Investigate
    ├── Form 3 hypotheses (ranked)
    ├── Trace code path (Explore agent)
    └── Confirm root cause

P2: Fix
    ├── Minimal targeted fix
    └── Regression test/guard

P3: Verify
    ├── Confirm original bug resolved
    ├── Check for regressions
    └── Commit + close issue
```

## Rules

- **Reproduce first** — never fix what you haven't reproduced
- **Map before reading** — understand the system before diving into code
- **Three hypotheses** — don't anchor on the first idea
- **Minimal fix** — fix the root cause, not symptoms
- **Regression guard** — leave a test so it can't come back silently
