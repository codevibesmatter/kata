# Task Output & Agent Expansion Fixes — Session Report

**Date:** 2026-04-11
**Branch:** feature/42-skills-based-methodology
**Testing ground:** baseplane-dev1 (research mode as example)

## Problem

When entering research mode in dev1, agents were:
1. Diving into deep codebase exploration during the classify step instead of doing quick classification
2. Not invoking the `/research` skill at all
3. Creating child tasks with no dependency chain (all `blockedBy: []`)
4. Not gating the next phase — child tasks were free-floating
5. Stop hook log files creating a recursive commit loop

## Root Causes

| Issue | Root Cause |
|-------|-----------|
| Deep exploration on classify | Step instruction was a bare list with no behavioral guardrails |
| Skill not invoked | Skill line was buried at the end of agent expansion protocol |
| No task chaining | Agent expansion didn't mention `addBlockedBy` |
| No cross-phase gate | Agent had no instruction to wire `addBlocks` to the next phase |
| Task titles showed useless UID | `RE-679a-0411:` prefix on every task when no issue linked |
| Recursive stop hook loop | Hook writes to `.kata/sessions/*/hooks.log.jsonl` on every invocation, creating uncommitted changes that re-trigger the committed check |

## Changes Made

### task-factory.ts
- **Instruction snippet in subject**: First meaningful line of task instruction appended to the subject so it's visible in `TaskList` without `TaskGet`
- **Skill invoked once at phase level**: `Invoke /research` prepended to agent expansion task, not repeated on every child task
- **Agent expansion protocol rewritten**: Dry, specific instructions with concrete task IDs:
  ```
  Invoke /research
  Create child tasks with TaskCreate. Max 15 tasks.
  Chain tasks with addBlockedBy so they run in order.
  Do NOT complete task #3 until all child tasks are done.
  Last child task must use addBlocks: ["4"] to gate the next phase.
  ```
- **Placeholders `{this_task_id}` and `{blocked_task_ids}`**: Resolved at native task write time when IDs are known
- **`writeNativeTaskFiles` returns `NativeTask[]`**: So callers can use resolved subjects in JSON output
- **Dry-run shows full task preview**: Subjects, complete descriptions, dependency chains printed to stderr
- **Dropped workflow ID prefix** from task titles when no issue is linked

### can-exit.ts
- **`doc_created` stop condition**: Checks `deliverable_path` from mode config for new/modified files
- **Recursive loop fix**: `.kata/sessions/` excluded from `committed` check

### batteries/kata.yaml
- **Research mode rules**: Branching context for 5 research types (feature research, library eval, brainstorming, feasibility, inspiration cataloging)
- **`deliverable_path`** added to research (`planning/research`) and planning (`planning/specs`) modes
- **`doc_created`** added to research stop conditions

### batteries/templates/research.md
- **Frame step**: "QUICK FRAMING ONLY — do NOT explore the codebase or launch agents yet"

### state/schema.ts
- Added `doc_created` to `STOP_CONDITION_TYPES` enum

### config/kata-config.ts
- Added `deliverable_path` to `KataModeConfigSchema`

## Design Decisions

- **Skill invocation is phase-level, not per-child-task** — the skill has the methodology, child tasks are units of work
- **`doc_created` reads `deliverable_path` from mode config** — no hardcoded mode names, fully pluggable
- **Agent expansion uses placeholders** (`{this_task_id}`, `{blocked_task_ids}`) resolved at write time — avoids coupling task factory to native ID assignment
- **Session logs excluded from committed check** — they're runtime artifacts, not deliverables

## Still Open

- dev1 kata.yaml needs `deliverable_path` and `doc_created` added to research mode config (currently only in batteries)
- Other modes with agent expansion (task, debug) should be verified against the new protocol format
- The `deriveActiveForm` function produces bad output for phase-level titles (e.g. "Re-07cf-0411:ing P1: Work") — needs cleanup now that workflow IDs are removed from titles
