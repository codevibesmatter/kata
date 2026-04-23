---
date: 2026-04-23
topic: SDK sessions emit user prompts as string-form content, defeating stop-hook staleness guard
type: debug / root-cause
status: complete
github_issue: 60 (re-opens — prior fix incomplete for SDK-driven sessions)
related: [61 (prior fix), src/commands/hook.ts hasActiveBackgroundAgents]
items_researched: 8
---

# SDK session transcript shape defeats the stop-hook "allow stop" staleness guard

## Summary

The stop-hook escape hatch (`hasActiveBackgroundAgents` in
`src/commands/hook.ts:610-671`) is silently broken for **SDK-driven sessions**
(`entrypoint: "sdk-ts"`), including duraclaw and anything using
`@anthropic-ai/claude-agent-sdk`. The staleness heuristic added in PR #61
(issue #60) never fires on those transcripts because SDK user prompts use a
different encoding. Unmatched `Agent` tool_use IDs accumulate and the guard
false-allows exit for the rest of the session — exactly the symptom issue #60
was filed to fix, still present.

## Mechanism of the guard

`src/commands/hook.ts:610-671`:

```ts
export function hasActiveBackgroundAgents(transcriptPath: string | undefined): boolean {
  ...
  for (const line of lines) {
    const msg = JSON.parse(line)
    if (msg.type === 'assistant') {
      const contentBlocks = (msg.message?.content ?? msg.content) as Array<...> ?? []
      for (const block of contentBlocks) {
        if (block.type === 'tool_use' && block.name === 'Agent' && ...) {
          agentToolUseIds.add(block.id)
        }
      }
    }
    if (msg.type === 'user') {
      const contentBlocks = (msg.message?.content ?? msg.content) as Array<...> ?? []
      let hasToolResult = false, hasUserText = false
      for (const block of contentBlocks) {
        if (block.type === 'tool_result') { agentToolUseIds.delete(block.tool_use_id); hasToolResult = true }
        if (block.type === 'text' && block.text?.trim()) hasUserText = true
      }
      // #61 staleness clear:
      if (hasUserText && !hasToolResult) agentToolUseIds.clear()
    }
  }
  return agentToolUseIds.size > 0
}
```

Called from `handleStopConditions` (lines 716-726): when `canExit` returns
false, the hook ASKs this function "are agents still running?". If yes, the
hook returns **no decision** (allow exit) trusting the agents to emit their
own completion notifications.

## What PR #61 assumed about user prompts

#61 assumed user-typed prompts arrive as a **content-block array** with at
least one `{type: 'text', text: '...'}` block:

```json
{"type":"user","message":{"role":"user","content":[{"type":"text","text":"next task"}]}}
```

With that shape, `hasUserText` flips true → `agentToolUseIds.clear()` runs →
stale IDs from earlier turns are discarded → guard correctly returns false.

## What SDK sessions actually emit

Direct inspection of recent duraclaw transcripts
(`~/.claude/projects/-data-projects-duraclaw-dev*/*.jsonl`,
`version: 2.1.98, entrypoint: sdk-ts`): user-typed prompts arrive as a **bare
string** on `message.content`, not an array:

```json
{"type":"user","message":{"role":"user","content":"fix location of scrolldown button to not overlap input panel"}}
```

Tool results from the agent to Claude use the array-of-blocks form, as
expected:

```json
{"type":"user","message":{"role":"user","content":[{"tool_use_id":"toolu_...","type":"tool_result","content":"...","is_error":false}]}}
```

Sampled one representative SDK session
(`/home/ubuntu/.claude/projects/-data-projects-duraclaw-dev2/8d76757f-...jsonl`,
594 lines):

| user `message.content` shape | count |
|---|---|
| STRING (typed prompt) | 5 |
| ARRAY with `[0].type == 'tool_result'` | 138 |
| ARRAY with `[0].type == 'text'` | **0** |

By comparison, a CLI-entrypoint transcript in the same tree (`entrypoint:
"cli"`) had 4 `ARRAY_text` entries alongside 5 `STRING` (slash-command stdout).
The array-of-text form is where the staleness clear fires. **SDK sessions
literally never produce it.**

## Why the scanner silently "succeeds" on string content

```ts
const contentBlocks = (message.content as Array<Record<string, unknown>>) ?? []
for (const block of contentBlocks) { ... }
```

When `message.content` is a string:
- The `??` fallback does not replace it (string is not null/undefined).
- `for...of` on a string iterates **characters** (JS string iterator returns
  one-character strings).
- Each `block` is a one-char string primitive; `block.type` is `undefined`.
- `hasUserText` stays false, `hasToolResult` stays false, the staleness clear
  branch is never taken.

No TypeScript error, no runtime exception — the scan just silently treats a
typed user prompt as "no-op" and keeps stale IDs around.

## Scenario that reproduces the symptom

1. SDK orchestrator (e.g. duraclaw gateway) opens a session, sends a typed
   prompt → recorded as STRING content.
2. Assistant spawns a subagent: `{type:'tool_use', name:'Agent', id:'toolu_X'}`.
   ID added to `agentToolUseIds`.
3. Subagent's result never lands as a top-level `tool_result` in this
   transcript (delivered via a different route: internal SDK summary, a
   sidechain file, or a hook rewriter — any path the scanner doesn't watch).
   `toolu_X` remains in the set.
4. User later sends a new prompt via the gateway → STRING content again.
   `hasUserText` stays false. `agentToolUseIds.clear()` **never runs**.
5. Every subsequent Stop hook fire this session: `hasActiveBackgroundAgents`
   returns true → stop-conditions silently allows exit despite
   `canExit=false` (pending tasks, uncommitted changes, etc.).

This matches the duraclaw evidence logged in issue #60 verbatim: same
symptom, same escape hatch, same persistence across the session.

## Other SDK-vs-CLI transcript differences noted (and whether they matter)

| Difference | Impact on guard |
|---|---|
| Envelope fields: `parentUuid`, `isSidechain`, `promptId`, `entrypoint: "sdk-ts"` | None — scanner ignores the envelope. |
| Tool-spawn tool name (`Agent` vs `Task`) across CC versions | Mixed: 2.1.98/2.1.112/2.1.118 SDK and CLI sessions we sampled emit `"name":"Agent"`. Older 2.1.50 emits `"name":"Task"`. Current guard only matches `Agent` — misses older `Task`. In practice recent sessions match. |
| Tool results possibly routed via `tool_use_summary` or sidechains | Plausible but not directly observed in the sampled SDK transcripts — the user-prompt shape alone is sufficient to reproduce the symptom. |
| `promptId` groups multiple user/tool messages into one logical turn | Guard ignores it; not a source of error but a missed opportunity for a cleaner turn-boundary heuristic. |
| `compact_file_reference` / compaction entries | Not observed as a dropped-tool-result source in the sessions inspected. |

## Answering the original question

> "research if sdk run sessions have different outputs for agents because the
> guard for allow stop is not working"

**Yes, they do.** Confirmed differences that affect the guard:

1. **User-typed prompts are string-form `content`, not an
   `[{type:'text',text:'...'}]` array.** This is the direct cause: it disables
   the #61 staleness heuristic, so stale Agent IDs persist and the guard keeps
   false-firing for the whole session.
2. **Tool-spawn tool name differs across CC versions** (`Task` in older,
   `Agent` in current). Guard only recognizes `Agent`. Recent SDK sessions
   are fine; older ones silently produce zero detections.

The guard is not "not working" in the sense of a thrown error; it is working
exactly as written, but its written logic does not match the transcript shape
that SDK sessions actually produce.

## Recommendations (for a follow-up debug/fix, not this research)

Order: smallest diff first.

**(1) Normalize user-content handling.** Accept both string and array forms:

```ts
const rawContent = message.content
const contentBlocks: Array<Record<string, unknown>> =
  Array.isArray(rawContent)
    ? rawContent as Array<Record<string, unknown>>
    : typeof rawContent === 'string' && rawContent.trim()
      ? [{ type: 'text', text: rawContent }]
      : []
```

This alone restores the #61 staleness clear for SDK sessions.

**(2) Add a time-based staleness floor** (issue #60 option (a)), because even
with (1), an SDK session that never sends a second user prompt (fire-and-forget
orchestrator) will still accumulate stale IDs. Track each `Agent` tool_use's
timestamp; ignore IDs older than e.g. 120s when deciding "active".

**(3) Also match `block.name === 'Task'`** to cover older CC versions and any
SDK tool-allowlist that whitelists `Task` (the eval harness passes
`allowedTools: [..., 'Task', ...]` in `eval/harness.ts:310`).

**(4) Unit tests in `src/commands/hook.test.ts`:**
- SDK transcript fixture: STRING-content user prompt after unmatched Agent →
  guard returns false after fix (currently returns true).
- Transcript with 2.1.50-shape `"name":"Task"` subagent → guard detects active
  when fresh, ignores when stale.
- Recency-filter boundary case.

## Evidence references

- Guard implementation: `src/commands/hook.ts:610-671, 716-726` (commit
  `01b233b fix(hook): ignore stale unmatched Agent tool_uses`, PR #61).
- Original bug report with duraclaw log excerpt: GH issue #60 (closed).
- Sampled SDK session showing STRING-form user prompts:
  `~/.claude/projects/-data-projects-duraclaw-dev2/8d76757f-cf6e-4aee-b9b5-daf2e9a064e7.jsonl`,
  lines 8 (STRING prompt), 14-16 (assistant Agent tool_use),
  18 (ARRAY tool_result), `entrypoint: "sdk-ts"`, `version: 2.1.98`.
- Tool-name distribution by session:
  `~/.claude/projects/-data-projects-duraclaw-dev1/*.jsonl` — `Task`-named
  subagents only in 2.1.50 sessions; `Agent` in 2.1.98+.
- Harness `allowedTools` includes `Task`: `eval/harness.ts:310`.
- Prior research on async-agent compat: `planning/research/2026-04-10-stop-hook-async-agent-compat.md`.
