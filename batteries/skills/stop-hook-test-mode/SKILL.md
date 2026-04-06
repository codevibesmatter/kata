---
name: stop-hook-test-mode
description: "Eval-only mode that exercises each stop condition in isolation. Not for interactive use."
---

# Stop Hook Test Mode

**Eval-only mode** — exercises each stop condition in isolation.

## Purpose

This mode creates a sequence of trivial tasks designed to trigger
the stop hook at each stage:

1. **After writing** — stop hook blocks: uncommitted changes + tasks pending
2. **After committing** — stop hook blocks: unpushed commits + tasks pending
3. **After pushing** — stop hook blocks: tasks still pending
4. **After completing all tasks** — stop hook allows exit

## How It Works

Each phase has a single trivial step with an explicit "STOP after this step"
instruction. When the agent tries to end its response, the stop hook fires
and blocks because remaining conditions aren't met.

The final phase reverts the probe file so the project stays clean.

## Stop Conditions

- `tasks_complete` — all native tasks must be completed
- `committed` — no uncommitted tracked changes
- `pushed` — all commits pushed to remote

## Usage

This mode is designed for the eval harness, not interactive use:
```bash
npm run eval -- --scenario=stop-hook-test --project=/path/to/project
```
