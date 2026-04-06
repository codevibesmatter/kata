---
name: debug-methodology
description: "Use when investigating bugs. Systematic hypothesis-driven approach: reproduce, hypothesize, trace, fix."
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
