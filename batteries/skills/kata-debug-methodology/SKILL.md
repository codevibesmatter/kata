---
description: "Systematic hypothesis-driven debugging — reproduce, form hypotheses, trace via agents, fix via agents, minimal change."
context: inline
---

# Debug Methodology

You are the debug orchestrator. You investigate to understand the problem, then delegate all code changes to agents.

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

Spawn debug-agents to investigate each hypothesis in parallel:

```
Agent(subagent_type="debug-agent", prompt="
  Investigate hypothesis: {hypothesis}
  Start from: {entry point — API route, UI event, job trigger}
  Trace through: {layers}
  Look for: where actual diverges from expected
  Report: file:line of root cause, or rule out this hypothesis
")
```

- Run up to 3 agents in parallel (one per hypothesis)
- Each agent traces one hypothesis independently
- Consolidate findings: identify confirmed root cause with file:line

## Step 6: Fix

Spawn an impl-agent to apply the minimal fix:

```
Agent(subagent_type="impl-agent", prompt="
  Fix bug: {description}
  Root cause: {file:line} — {explanation}
  Fix: {specific change to make}
  Also: add a regression test that reproduces the original bug
  After fixing, run: {build_command} && {test_command}
")
```

If the fix is multi-part (e.g., fix + migration + test), spawn one agent per concern.

## Step 7: Verify

After the fix agent completes:
- Reproduce the original bug — confirm it's resolved
- Run full test suite — confirm no regressions
- If regressions: spawn another impl-agent targeting the specific failure

## Rules

- **Reproduce first** — never fix what you haven't reproduced
- **Map before reading** — understand the system before diving into code
- **Three hypotheses** — don't anchor on the first idea
- **Never write code yourself** — spawn debug-agents to trace, impl-agents to fix
- **Minimal fix** — fix the root cause, not symptoms
- **Regression guard** — every fix includes a test
