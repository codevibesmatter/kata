---
name: debugging
description: "Systematic hypothesis-driven debugging with reproduction, root cause analysis, and fix. Activate when entering debug mode."
---

> **Session setup:** If you haven't already, run `kata enter debug` to register this session for task tracking, stop-condition enforcement, and phase guidance. The skill provides methodology; the CLI provides workflow infrastructure.

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

## Subagent: Debug Tracer

When you need to trace a bug's execution path, spawn a debug tracer agent using the
prompt template in `debugging/tracer-prompt.md`:

```
Agent(subagent_type="debug-agent", prompt=<contents of tracer-prompt.md + bug context>)
```

The tracer follows data and control flow through all layers without making changes,
returning a root cause report with file:line references.

---

# Debug Methodology

## Step 1: Reproduce
- Capture exact reproduction steps
- Copy error messages verbatim
- Copy stack traces in full
- Write expected vs actual behavior

## Step 2: Map the System
Before reading code, draw the system map:
1. Which layers are involved? (data, API, frontend, infra)
2. What's the data flow? `[Trigger] → [Handler] → [Service] → [Store]`
3. Where could the failure originate?

## Step 3: Classify the Bug

| Type | Symptoms |
|------|----------|
| Data bug | Wrong values, missing data, stale data |
| Logic bug | Wrong calculation, wrong condition, off-by-one |
| State bug | Works once but not twice, stale UI |
| Async bug | Race condition, timing-dependent |
| Config bug | Wrong env var, missing setting |
| Integration bug | External API, schema mismatch |

## Step 4: Form 3 Hypotheses
1. **Most likely:** {hypothesis} — because {reason}
2. **Plausible:** {hypothesis} — because {reason}
3. **Unlikely but worth checking:** {hypothesis}

## Step 5: Trace and Confirm
- Start from the entry point (API route, UI event, job trigger)
- Follow through all layers
- Find where actual diverges from expected
- Document: file:line of the root cause

## Step 6: Fix
- Minimal change to fix the root cause
- Add regression test/guard
- Verify the original bug is resolved
- Check for regressions in related code paths
