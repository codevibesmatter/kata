---
date: 2026-03-16
topic: Stop hook behavior when background agents are active
status: complete
github_issue: null
---

# Research: Stop Hook + Background Agent Waiting Strategy

## Context

When CC has background agents running and the main conversation has nothing else to do, CC naturally tries to stop. The stop hook fires, sees pending/in-progress tasks, and blocks with a "do the next task" message. But the main conversation can't do the next task — agents are already doing it. This creates a frustrating loop where CC keeps trying to stop, keeps getting blocked, and keeps seeing "do the next task" guidance that doesn't apply.

## Questions Explored

1. How does the stop hook determine "incomplete work"?
2. Can it distinguish "agent actively working" from "task genuinely abandoned"?
3. What response options does the stop hook protocol support?
4. What's the simplest fix?

## Findings

### Stop Hook Flow (codebase)

1. `handleStopConditions` (`src/commands/hook.ts:459`) fires on CC Stop event
2. Calls `canExit --json` → `validateCanExit()` (`src/commands/can-exit.ts:212`)
3. `countPendingNativeTasks()` counts ALL tasks where `status !== 'completed'` — no distinction between `pending` and `in_progress`
4. If count > 0: returns `decision: "block"` with task list + "Next task: do X" guidance
5. CC sees block, shows message, continues — but if it's waiting for agents, it tries to stop again → same block → loop

### Key Code Points

- `countPendingNativeTasks` (`src/commands/enter/task-factory.ts:510`): `tasks.filter(t => t.status !== 'completed').length`
- `buildStopGuidance` (`src/commands/can-exit.ts:313`): always shows "Next task" if tasks are open
- Stop hook protocol: only two responses — `block` (with reason text) or allow (no output). No "wait" hint.

### Root Cause

Two sub-problems:
1. **No status awareness**: Stop hook treats `in_progress` and `pending` identically
2. **Wrong guidance**: When tasks are in-progress (being worked by agents), the "do the next task" message is incorrect — CC should wait, not try to do work

## Recommendations

| Option | Description | Pros | Cons | Fit |
|--------|-------------|------|------|-----|
| **C: Message-based signaling** | Detect all-in-progress state, change guidance to "wait for agents" | Works within existing protocol, simple | Relies on CC reading message | **High** |
| A: New "wait" hint | Add `hint: "waiting"` to block response | Clean semantics | CC may not understand new field | Med |
| B: Task-aware blocking | Differentiate pending vs in-progress in count | Simple code change | Still blocks, same friction | Med |
| D: Allow exit when agents own all work | Treat all-in-progress as "can exit" | Eliminates loop | Agents might fail silently | Low |
| E: Skip hook when agents active | Track agent count, suppress hook | Clean | Requires agent lifecycle tracking | Low |

### Recommended: Option C — Message-based signaling

**Implementation:**

In `buildStopGuidance` (or `validateCanExit`), check if all non-completed tasks are `in_progress`:

```typescript
// In validateCanExit or buildStopGuidance
const tasks = readNativeTaskFiles(sessionId)
const nonCompleted = tasks.filter(t => t.status !== 'completed')
const allInProgress = nonCompleted.length > 0 && nonCompleted.every(t => t.status === 'in_progress')

if (allInProgress) {
  // Change guidance: "wait for agents" instead of "do the next task"
  nextStepMessage = `\n**${nonCompleted.length} task(s) in progress** (background agents are working).\nWait for task completion notifications. Do NOT try to do this work yourself.\nThe stop hook will allow exit once all tasks complete.`
} else {
  // Normal "next task" guidance
  nextStepMessage = `\n**Next task:** [${firstTask.id}] ${firstTask.title}\n\nComplete with: TaskUpdate(taskId="${firstTask.id}", status="completed")`
}
```

**Why this works:**
- CC reads "wait for agents" and stops trying to act
- Still blocks premature exit (tasks not done)
- No protocol changes needed
- Falls back to normal "do the next task" if some tasks are genuinely pending

**Edge case — mixed state:** If some tasks are `in_progress` and some are `pending` (agents working on early tasks, later tasks blocked), the guidance should show the pending tasks as the "next" work while noting that agents are active on others.

## Open Questions

- Does CC actually loop or does it just show the message once and wait? (Observed: it does loop)
- Could we also add a `waiting` field to the JSON response that CC could optionally use in the future?
- Should `in_progress` tasks with an `owner` field be treated differently from `in_progress` without owner?

## Next Steps

- Create an issue for implementing Option C
- Implementation is small: ~20 lines in `can-exit.ts`
