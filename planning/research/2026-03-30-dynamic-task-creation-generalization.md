---
date: 2026-03-30
topic: Generalizing dynamic task creation beyond verify mode
status: complete
---

# Research: Dynamic Task Creation Generalization

## Questions Explored
- How does verify mode's dynamic task creation work?
- Which other modes would benefit from the same pattern?
- What changes are needed to generalize it?

## Current State

### Task creation mechanisms today

| Mode | Task Creation | Method |
|------|--------------|--------|
| planning | 16 static tasks | Template phases → `buildPhaseTasks()` at enter time |
| implementation | Static + spec-driven | Template + `buildSpecTasks()` with subphase patterns at enter time |
| task | 6 static tasks | Template phases → `buildPhaseTasks()` at enter time |
| verify | Static + **dynamic** | Template + `TaskCreate` at runtime in container phase |
| research | **None** | Has phases/steps but no tasks created |
| debug | **None** | Has phases/steps but no tasks created |
| freeform | **None** | No phases at all |

### Verify mode's pattern (the one that works)

Verify mode uses a discover-then-expand pattern:

```
P0: Setup (static tasks)
    → Discovers VP steps from spec, plan file, or git diff

P1: Execute (container: true)
    → expand-vp-steps calls TaskCreate per discovered VP step
    → Each VP step becomes a trackable, completable task

P2+: Operate on those dynamic tasks (fix loop, evidence)
```

Key design elements:
- P1 is marked `container: true` in the template YAML
- The template instruction explicitly tells the agent to call `TaskCreate`
- A special exception overrides the "no TaskCreate" rule for verify mode only
- Tasks are created ALL at once before execution begins
- Each task is independently trackable (pass/fail per VP step)

### The current gate

Verify has a hardcoded exception:

> "Verify mode is the **only mode** that uses `TaskCreate`. This overrides the standard `task_rules`..."

This is the only thing preventing other modes from using the same pattern.

## Key Finding: The Pattern is Template-Driven, Not Mode-Driven

Verify's dynamic task creation isn't special infrastructure — it's just a template instruction that says "call `TaskCreate` here." The `container: true` phase marker already exists in the schema. The only blocker is the policy gate that restricts `TaskCreate` to verify mode.

**Proposed change:** Make the `TaskCreate` exception phase-driven rather than mode-driven. Any phase with `container: true` allows `TaskCreate` within that phase.

## Candidate Modes for Dynamic Task Creation

### Planning Mode — strongest candidate

**Current problem:** P2 (Spec Writing) has 3 static tasks regardless of feature complexity. A simple config change and a complex multi-service feature get the same task structure.

**Dynamic pattern:**
```
P0: Research (static — 2 tasks)
P1: Interview (static — 5 tasks)
    → Discovers: behaviors, integration points, test scenarios

P2: Spec Writing (container: true)
    → After P1 requirements approval, expand per behavior:
      - "Write B1: auth flow"
      - "Write B2: token refresh"
      - "Write B3: session management"
    → Each behavior section independently trackable

P3: Review Gate (static — 3 tasks)
P4: Finalize (static — 3 tasks)
```

**Benefits:**
- Progress tracking per behavior (not just "spec writing in progress")
- Natural parallelism — behaviors can be written by parallel agents
- Review can reference specific behavior tasks
- Scales with feature complexity (2 behaviors = 2 tasks, 10 = 10)

**Trade-off:** Currently a single agent writes the whole spec in one shot, which preserves cross-behavior coherence. Per-behavior tasks would need a "coherence pass" afterward, or a shared context doc that each behavior writer reads.

### Debug Mode — strong candidate

**Current problem:** No tasks at all. Progress is invisible.

**Dynamic pattern:**
```
P0: Reproduce (static — 2 tasks)
    → Discovers: symptoms, affected code paths

P1: Hypotheses (container: true)
    → After reproduction, expand per hypothesis:
      - "H1: Race condition in session cleanup"
      - "H2: Stale cache after config reload"
      - "H3: Off-by-one in pagination"
    → Each hypothesis independently testable/dismissable

P2: Fix (static — depends on which hypothesis confirmed)
P3: Verify fix (static — 2 tasks)
```

**Benefits:**
- Hypotheses are tracked (tested/confirmed/dismissed)
- Stop conditions can check "at least one hypothesis confirmed"
- Natural debugging workflow — you don't know the hypotheses upfront

### Research Mode — moderate candidate

**Dynamic pattern:**
```
P0: Initial scan (static — 2 tasks)
    → Discovers: research threads to investigate

P1: Deep dive (container: true)
    → After initial scan, expand per thread:
      - "Investigate logging architecture"
      - "Map auth middleware chain"
      - "Compare caching strategies"
    → Each thread independently explorable

P2: Synthesize (static — 2 tasks)
P3: Document (static — 2 tasks)
```

**Benefits:**
- Research coverage tracked per thread
- Natural parallelism for independent threads
- Output doc can reference which threads were explored

**Trade-off:** Research is intentionally exploratory. Too much structure might constrain discovery. Could make the container phase optional — only expand if the agent identifies discrete threads.

### Task Mode — poor candidate

Already lightweight (6 tasks). The whole point is "small change, minimal ceremony." Dynamic expansion would fight the mode's purpose.

### Freeform — not a candidate

Intentionally unstructured. No phases at all.

## Implementation Path

### Step 1: Make `TaskCreate` gate phase-driven

Change the `TaskCreate` restriction from "mode === verify" to "current phase has `container: true`". This is likely in the mode-gate hook or task rules documentation.

**Files to check:**
- `src/commands/hook.ts` — mode-gate hook logic
- Template task_rules section — documentation that agents read
- Any PreToolUse hook that blocks `TaskCreate`

### Step 2: Update templates that want dynamic creation

Add `container: true` to the relevant phase and write the expand instruction. No TypeScript changes needed — this is purely template content.

### Step 3: Wire stop conditions

Modes using dynamic tasks should add `tasks_complete` to their `stop_conditions` in `modes.yaml` so the stop hook enforces completion.

### Incremental rollout

1. **First:** Just lift the verify-only restriction (step 1). No template changes yet.
2. **Then:** Update debug template to use container phase for hypotheses — simplest template to modify, low risk.
3. **Then:** Planning P2 — higher impact but needs the coherence-pass design decision.
4. **Last:** Research — only if the pattern proves valuable in debug/planning.

## Open Questions

- **Planning coherence:** If behaviors are written as separate tasks, how do you ensure cross-behavior consistency? Options: shared context doc, coherence review pass, or keep single-agent-writes-all but track per-behavior review tasks instead.
- **Task naming convention:** Verify uses `VP{N}: {title}`. Should other modes follow a similar pattern? (`H{N}:` for hypotheses, `B{N}:` for behaviors, `R{N}:` for research threads?)
- **Container phase nesting:** Can a mode have multiple container phases? (e.g., planning could have container phases in both P2 and P3 for per-behavior writing AND per-behavior review)

## Next Steps

- Create GitHub issue for this feature
- Start with step 1 (lift verify-only gate) as a small task
- Design debug template update as proof of concept
