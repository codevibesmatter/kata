---
date: 2026-04-10
topic: Stop hook system incompatibility with async agent patterns
status: complete
github_issue: null
---

# Research: Stop Hook System vs Async Agent Patterns

## Context

Claude Code has evolved toward an async/await-first model for agent coordination:
sub-agents run in background, agent teams coordinate via shared task lists, and
new hook events (`SubagentStop`, `TeammateIdle`, `TaskCreated`, `TaskCompleted`)
provide lifecycle observability. Meanwhile, kata-wm's stop hook system predates
all of this. It uses a synchronous `decision: "block"` + sleep-keepalive pattern
that fights the async model instead of working with it.

## Questions Explored

1. What async/await agent patterns has Claude Code recently adopted?
2. How does kata-wm's current stop hook + keepalive system work, and where does it conflict?
3. What new hook events and response fields are now available?
4. What would a compatible architecture look like?

## Findings

### 1. Claude Code's Async Agent Evolution

**Sub-agents** (`Agent` tool) can run `run_in_background: true`. The parent
agent is notified when the sub-agent completes — no polling needed. Sub-agents
get their own context window, return a summary, and can use custom tools/models.

**Agent teams** (experimental, `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS`) go further:
multiple Claude Code instances coordinate via shared task list, direct messaging,
and a team lead. Teammates have their own sessions and communicate peer-to-peer.

**SDK pattern**: `query()` returns an `AsyncGenerator` — the canonical consumption
pattern is `for await (const message of query(...))`, yielding messages as Claude
thinks, calls tools, and produces results.

### 2. Current Stop Hook Architecture (kata-wm)

The flow today:

```
Claude tries to stop
  → Stop hook fires (.claude/settings.json)
  → kata hook stop-conditions
    → reads stdin JSON (session_id)
    → calls canExit(--json --session=ID)
      → validateCanExit() checks:
        - tasks_complete: countPendingNativeTasks() — ANY non-completed task blocks
        - committed/pushed: git status checks
        - tests_pass, feature_tests_added, spec_valid
    → if canExit=false: outputs { decision: "block", reason: "..." }
  → Claude sees block, continues conversation
  → Has nothing to do → tries to stop again → LOOP
```

**The keepalive hack**: When background agents are running, the stop hook guidance
tells Claude to run `sleep 30` to "keep the session alive." This is documented in
the stop hook message itself (`can-exit.ts:368-375`):

```typescript
nextStepMessage = `...Wait for agent completion notifications by running:
\`\`\`bash
sleep 30  # Keep session alive while agents work
\`\`\`
Then check results with \`TaskOutput\`. Repeat sleep + check until agents complete.`
```

**Problems with this approach:**
- **Fights async model**: The whole point of background agents is that you get
  notified when they complete. Sleep-polling defeats this.
- **Stop hook fires repeatedly**: Claude has nothing to do, tries to stop, gets
  blocked, runs sleep, sleep ends, tries to stop again — O(n) hook firings for
  one wait period.
- **No semantic distinction**: The stop hook can only say "block" or "allow."
  There's no "wait — agents are working, check back later" semantic.
- **Token waste**: Each stop-block-sleep cycle costs tokens for the block message,
  the sleep command, and Claude's reasoning about what to do next.

### 3. New Hook Events & Response Fields Available

The hooks system has evolved significantly. Key discoveries:

#### New Response Fields (all hooks)
```json
{
  "continue": false,        // Stop Claude ENTIRELY (takes precedence over decision)
  "stopReason": "message",  // Shown to user when continue=false
  "systemMessage": "warning" // Warning shown to user
}
```

#### New Hook Events
| Event | Purpose | Can Block? |
|-------|---------|------------|
| `SubagentStop` | Fires when a sub-agent completes | Yes |
| `TeammateIdle` | Fires when a teammate finishes | Yes (exit 2 keeps working) |
| `TaskCreated` | Task being created | Yes (exit 2 rolls back) |
| `TaskCompleted` | Task being marked complete | Yes (exit 2 blocks) |
| `SessionEnd` | Session ending | No (observability only) |

#### Async Hooks
Hooks now support `"async": true` for non-blocking background execution:
```json
{
  "type": "command",
  "command": "/path/to/script.sh",
  "async": true
}
```

#### PreToolUse: `defer` (v2.1.89+)
New `permissionDecision: "defer"` pauses Claude at tool call, returns
`stop_reason: "tool_deferred"` with a payload. External process handles it and
resumes with `--resume <session-id>`. This is the pattern kata already uses for
`AskUserQuestion` in eval.

### 4. Where Kata's Stop Hook Doesn't Match

| Claude Code Pattern | Kata's Current Approach | Gap |
|---|---|---|
| Background agents complete → notification | Sleep-poll loop | Should use SubagentStop or just trust the notification |
| Agent teams with shared task list | N/A — kata tracks tasks separately | Parallel tracking systems |
| `TaskCompleted` hook event | kata's own task-evidence hook | Duplicate mechanism |
| `TeammateIdle` hook | N/A | No concept of teammate lifecycle |
| `async: true` hooks | All hooks synchronous | Could use for logging/observability |
| `continue: false` (hard stop) | Not used | Could replace `decision: block` for fatal errors |

### 5. Prior Research (2026-03-16)

Previous research (`planning/research/2026-03-16-stop-hook-agent-waiting.md`)
identified the core loop problem and implemented "Option C: Message-based
signaling" — detecting when all open tasks are `in_progress` and changing guidance
from "do next task" to "wait for agents." This was a mitigation, not a fix.

The code at `can-exit.ts:363-375` now detects `allInProgress` state and emits
the sleep guidance. But the fundamental problem remains: the stop hook still
fires, still blocks, and Claude still needs the sleep hack.

## Recommendations

| Option | Description | Pros | Cons | Fit |
|--------|-------------|------|------|-----|
| **A: SubagentStop-driven completion** | Register a SubagentStop hook that marks kata tasks as completed when sub-agents finish. Stop hook then sees no pending tasks and allows exit naturally. | Works with platform semantics; no sleep needed | Requires mapping sub-agent IDs to kata tasks | **High** |
| **B: Allow-when-all-in-progress** | When all tasks are `in_progress` (agents working), stop hook returns ALLOW instead of block. Trust that Claude gets notified when agents complete and will resume. | Eliminates the sleep loop entirely; simple change | If Claude actually exits, agents may be orphaned | **High** |
| **C: Adopt agent teams** | Replace kata's task tracking with Claude Code's native team coordination (shared task list, TeammateIdle, TaskCompleted hooks). | Full platform alignment; no parallel tracking | Experimental feature; major architectural change; kata's value-add is the structured workflow layer on top | **Low** |
| **D: `defer` pattern** | Use PreToolUse `defer` to pause the agent when it tries to stop, external process resumes when agents complete. | Clean async handoff | Over-engineered for this use case; adds external process dependency | **Low** |
| **E: Hybrid — B + SubagentStop observability** | Allow exit when all-in-progress (B), plus register an async SubagentStop hook for logging/evidence. | Best of both; simple core change; extensible | Need to handle "agent failed after main exited" edge case | **High** |

### Recommended: Option E (Hybrid)

**Core change** (Option B): In `handleStopConditions`, when `areAllOpenTasksInProgress()` returns true, output nothing (allow exit) instead of blocking. Claude's built-in notification system handles the rest — when background agents complete, Claude is notified and can resume work or exit cleanly.

**Observability layer**: Register an `async: true` SubagentStop hook that logs agent completion to kata's session log. This is fire-and-forget — doesn't block anything.

**Why this works:**
1. Claude already gets notifications when background agents complete (built-in)
2. The stop hook only needs to block when there's genuinely *unstarted* work
3. `in_progress` tasks owned by agents don't need the main conversation to babysit
4. Eliminates: sleep loops, repeated stop-hook firings, token waste, keepalive hacks

**Edge case — agent failure after main exits:**
- Sub-agents that fail will produce a SubagentStop notification with error context
- Claude re-engages when notified (if session is still active)
- If session ended: the async SubagentStop hook captures the failure in session logs
- kata's `can-exit` already handles this gracefully — tasks stay in_progress, next session sees them

## Open Questions

- Does Claude Code actually resume the main conversation when a background agent completes and the main was "stopped"? (Need to test — the docs say "you will be notified automatically when it completes")
- Should we register a `TaskCompleted` hook to replace kata's task-evidence check, aligning with the platform's native task lifecycle?
- With agent teams being experimental, should kata's structured workflow layer prepare to act as a "team lead" coordinator?

## Next Steps

- **Immediate**: Implement Option B — change stop hook to ALLOW when all tasks are in_progress. This is ~5 lines in `handleStopConditions`.
- **Short-term**: Register async SubagentStop hook for completion logging.
- **Medium-term**: Evaluate replacing kata's task-evidence PreToolUse hook with native `TaskCompleted` hook.
- **Long-term**: Watch agent teams stabilize; consider kata as a structured workflow layer that coordinates teams rather than fighting the stop hook.

## Sources

- [Claude Code sub-agents docs](https://code.claude.com/docs/en/sub-agents)
- [Claude Code hooks docs](https://code.claude.com/docs/en/hooks)
- [Claude Code agent teams docs](https://code.claude.com/docs/en/agent-teams)
- [Agent SDK overview](https://platform.claude.com/docs/en/agent-sdk/overview)
- [Prior research: stop hook agent waiting](../research/2026-03-16-stop-hook-agent-waiting.md)
- [GitHub: Background Agent Execution feature request](https://github.com/anthropics/claude-code/issues/9905)
