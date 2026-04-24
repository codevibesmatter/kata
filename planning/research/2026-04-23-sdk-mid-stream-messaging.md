# Claude Agent SDK: Mid-Stream Message Sending

**Type:** Library/tech evaluation
**Workflow:** RE-ebc6-0423
**Date:** 2026-04-23
**SDK version:** `@anthropic-ai/claude-agent-sdk` `^0.2.50`

## TL;DR

Our eval harness (`eval/harness.ts`) uses **single-message input mode** with a string
`prompt` and `options.resume` to simulate multi-turn flow. This mode *cannot* send
additional messages once the `query()` generator is running — every resume is a fresh
`query()` call. The symptoms we're seeing (race between the `init` message and
`canUseTool`, `interrupt: true` apparently being ignored so we need a 100 ms
`abortController.abort()` safety net, and sessionId being empty on the first capture)
are the documented limitations of single-message mode.

The SDK's officially recommended pattern is **streaming input mode**: pass an
`AsyncIterable<SDKUserMessage>` as `prompt`. That unlocks `interrupt()`,
`setPermissionMode()`, `streamInput()`, real mid-stream message injection, and a
stable session that doesn't require `options.resume` roundtrips.

**Recommendation:** Migrate `eval/harness.ts` from string-prompt + `options.resume`
to an async-generator prompt + `Query.interrupt()`. The pause/resume flow becomes a
queue-push operation on the same generator instead of a cold restart.

---

## 1. Current approach (what we have)

### 1.1 Where the SDK is invoked

| File | Line | Pattern |
|---|---|---|
| `eval/harness.ts` | 331 | `for await (const message of query({ prompt, options: queryOptions }))` |
| `src/providers/claude.ts` | 111 | Same |

Both sites use `prompt: string`. Neither uses the `Query` interface's control methods
(`interrupt()`, `streamInput()`, `setPermissionMode()`).

### 1.2 The pause/resume flow (single-message mode)

`eval/harness.ts:255-289` uses `canUseTool` to intercept `AskUserQuestion`:

```ts
return {
  behavior: 'deny' as const,
  message: 'Session paused — awaiting external input.',
  interrupt: true,
}
```

Then `eval/harness.ts:282`:

```ts
// Safety net: abort the query so it cannot continue even if interrupt is ignored.
// Deferred to let the deny+interrupt response propagate first.
setTimeout(() => abortController.abort(), 100)
```

Resume (`eval/harness.ts:305-326`) is a **fresh `query()` call**:

```ts
const isResume = !!options.resumeSessionId
if (isResume) queryOptions.resume = options.resumeSessionId
const prompt = isResume ? (options.resumeAnswer ?? 'Continue.') : scenario.prompt
```

### 1.3 Known flakiness documented in comments

`eval/harness.ts:262-264`:

```ts
// Record question data. sessionId may not be set yet (race with init message
// processing), so use a placeholder — we patch it after the loop ends.
pendingQuestion = { sessionId: sessionId ?? '', questions }
```

`eval/harness.ts:386-390` post-hoc patches the sessionId. Two concrete
inconsistencies the team has already worked around:

1. `canUseTool` can fire before the `init` system message is delivered → sessionId
   is empty until later.
2. `interrupt: true` on a `canUseTool` `deny` is not reliable on its own → we need
   a 100 ms deferred `abortController.abort()` as a safety net.

Both are symptoms of the same root cause: **single-message mode is not designed for
in-loop control**.

---

## 2. What the SDK actually offers

The `query()` signature (`sdk.d.ts:1166-1169`):

```ts
export declare function query(_params: {
    prompt: string | AsyncIterable<SDKUserMessage>;
    options?: Options;
}): Query;
```

The `Query` interface (`sdk.d.ts:1028-1164`) extends `AsyncGenerator<SDKMessage, void>`
and exposes control methods.

### 2.1 Mode-conditional capabilities

From the official docs (`code.claude.com/docs/en/agent-sdk/typescript`, emphasis in
the source):

> Several methods are **only available in streaming input mode** (when using
> `streamInput()`):
>
> - `interrupt()`
> - `setPermissionMode()`
> - `setModel()`

Single-message mode (`prompt: string`) gives us **none** of these. The only way to
stop a string-prompt query is to abort the controller — which is exactly the hack
we have.

### 2.2 Streaming input mode: canonical pattern

From `code.claude.com/docs/en/agent-sdk/streaming-vs-single-mode` (verbatim):

```ts
import { query } from "@anthropic-ai/claude-agent-sdk";

async function* generateMessages() {
  yield {
    type: "user" as const,
    message: {
      role: "user" as const,
      content: "Analyze this codebase for security issues"
    }
  };

  await new Promise((resolve) => setTimeout(resolve, 2000));

  yield {
    type: "user" as const,
    message: {
      role: "user" as const,
      content: [
        { type: "text", text: "Review this architecture diagram" },
        { type: "image", source: { /* ... */ } }
      ]
    }
  };
}

for await (const message of query({
  prompt: generateMessages(),
  options: { maxTurns: 10, allowedTools: ["Read", "Grep"] }
})) {
  if (message.type === "result") console.log(message.result);
}
```

The message shape matches `SDKUserMessage` (`sdk.d.ts:1763-1771`):

```ts
export declare type SDKUserMessage = {
    type: 'user';
    message: MessageParam;
    parent_tool_use_id: string | null;
    isSynthetic?: boolean;
    tool_use_result?: unknown;
    uuid?: UUID;
    session_id: string;
};
```

### 2.3 Why this solves our race condition

In streaming mode the generator yields *when we want it to*. A typical pattern:

```ts
// Pseudocode — the pattern, not a drop-in.
const inbox: SDKUserMessage[] = []
let resolveNext: (() => void) | null = null

async function* input() {
  // Seed with the initial prompt.
  yield { type: 'user', message: { role: 'user', content: scenario.prompt }, ... }
  while (true) {
    if (inbox.length === 0) {
      await new Promise<void>(r => { resolveNext = r })
    }
    yield inbox.shift()!
  }
}

function send(text: string, sessionId: string) {
  inbox.push({ type: 'user', message: { role: 'user', content: text }, session_id: sessionId, parent_tool_use_id: null })
  resolveNext?.()
}

const q = query({ prompt: input(), options: { canUseTool, ... } })

for await (const msg of q) {
  if (msg.type === 'system' && msg.subtype === 'init') {
    sessionId = msg.session_id           // Captured BEFORE any canUseTool could fire
  }
  // ... when canUseTool fires for AskUserQuestion:
  //   - we already have sessionId (init is delivered first, synchronously on the same stream)
  //   - we call await q.interrupt() to stop the current turn
  //   - we store the pendingQuestion
  //   - caller later invokes send(answer) — no new query() call needed
}
```

Key differences from our current code:

| Concern | Current (string mode) | Streaming mode |
|---|---|---|
| Stop mid-turn | `canUseTool` returns `deny+interrupt`, plus `setTimeout(abort, 100)` safety net | `await q.interrupt()` — documented, awaitable |
| Send follow-up | New `query()` call with `options.resume = sessionId` + new prompt | Push to inbox; generator yields next message |
| Session ID | Race: `canUseTool` may fire before `init` msg | `init` always arrives before any tool use → sessionId captured before pause |
| Multiple rounds | Multiple cold restarts, each with resume overhead | Single long-lived session |
| Permission change mid-run | Not possible | `await q.setPermissionMode('acceptEdits')` |
| Image attachments | Not supported (per docs) | Supported |

### 2.4 `Query` control methods we'd gain

From `sdk.d.ts:1028-1163`:

- `interrupt(): Promise<void>` — Stop the current query execution.
- `setPermissionMode(mode): Promise<void>` — change permission mode live.
- `setModel(model?): Promise<void>` — switch model mid-session.
- `streamInput(stream): Promise<void>` — explicit alternative to passing
  AsyncIterable as prompt; documented as "used internally for multi-turn
  conversations."
- `close(): void` — forcefully terminate and clean up the subprocess.
- Plus introspection: `initializationResult()`, `supportedCommands()`,
  `mcpServerStatus()`, `accountInfo()`.

### 2.5 Alpha V2 session API (optional, not recommended yet)

`sdk.d.ts:2015-2041` exposes an unstable session API:

```ts
export declare function unstable_v2_createSession(_options: SDKSessionOptions): SDKSession;
export declare function unstable_v2_resumeSession(_sessionId: string, _options: SDKSessionOptions): SDKSession;
```

with `send(message)` + `stream()` on the returned session. This is cleaner
ergonomically but explicitly marked `@alpha` / `UNSTABLE` and lacks hook support
last we checked. **Do not adopt for production eval harness** — pin to the stable
streaming-input pattern.

---

## 3. Gaps and trade-offs

### 3.1 What migration costs

- Rewrite `eval/harness.ts:305-399` — replace `options.resume` branching with a
  persistent generator + inbox.
- Rewrite `eval/run.ts:91-123` — `--resume=<id> --answer=<text>` becomes a way to
  feed a new message into an already-running harness instance. For our CLI the
  harness process exits between runs, so we still need a persistence strategy:
  either keep the process alive (long-lived eval runner) OR continue using
  `options.resume` on a fresh process but without the fragile interrupt dance.
- `src/providers/claude.ts:111` (`verify-run`) is single-shot — no migration
  needed there.

### 3.2 The CLI-exit problem

Our current eval CLI pattern is: run scenario → pause → exit process → user
resumes with a new CLI invocation. Streaming input mode *inside one process* can't
survive a process exit. Three options:

1. **Keep single-message + `options.resume` for the CLI boundary**, but use
   streaming-input inside one process when we can (most scenarios never pause).
   Fixes most flakiness without changing the pause/resume UX.
2. **Long-lived harness daemon** — eval runner stays alive, CLI pokes it via
   IPC/socket. Most elegant, biggest lift.
3. **Persist the inbox across process boundaries** via file/stdin feed — awkward.

Option 1 is the pragmatic sweet spot: streaming-input fixes the in-process race
and interrupt unreliability; `options.resume` remains only for the
process-restart boundary, where it's actually designed for that.

### 3.3 Does `interrupt()` actually stop `AskUserQuestion` cleanly?

Untested locally. Two things to verify during implementation:
- Does `canUseTool` still fire in streaming mode for `AskUserQuestion`? (Docs
  imply yes — canUseTool is listed as an `Options` field, not mode-conditional.)
- After `q.interrupt()`, does the generator finish cleanly, or do we still need
  an abort safety net? (Docs phrase: "The query will stop processing and return
  control to the caller.")

The `interrupt()` contract is stronger than the current `deny+interrupt+abort`
triple, but we should spike it before ripping the safety net.

### 3.4 `canUseTool` signature has grown

Per the current docs, `canUseTool` now receives a third `options` arg with
`signal`, `suggestions`, `blockedPath`, `decisionReason`, `toolUseID`, `agentID`.
Our harness call site at `eval/harness.ts:255` uses the two-arg form, which still
type-checks but misses useful context (notably `toolUseID` for logging and
`signal` for propagating cancellation into the handler).

---

## 4. Recommendation

**Adopt streaming input mode as the default for `eval/harness.ts`**, with a
minimal refactor:

1. Replace the `prompt: string` call with an async generator that yields the
   initial scenario prompt and then awaits a signal for follow-ups.
2. Keep the `canUseTool` AskUserQuestion interception (the behavior object is
   unchanged — `deny` is fine). Replace the `setTimeout(abort, 100)` safety net
   with `await q.interrupt()` called from the `for await` loop when we observe
   the denied tool result.
3. Capture `session_id` on the `init` message (already do this at
   `eval/harness.ts:333-339`) — race goes away because `init` always precedes
   tool dispatch on the same stream.
4. Decide separately whether to keep `options.resume` across process exits
   (recommended: yes, for CLI ergonomics) — but the *in-process* resume
   (continuing after a question in the same run) switches from `options.resume`
   to "push another message into the generator."
5. Update the `canUseTool` signature to the three-arg form and log `toolUseID`
   in the transcript.

**Success criteria for the migration:**

- No `setTimeout(abort, 100)` safety net needed.
- No "sessionId may not be set yet" patchwork at `eval/harness.ts:387-390`.
- Pause → answer → continue works in a single `query()` call for in-process
  scenarios.
- Existing transcript format and assertions unchanged.

---

## Sources

- SDK type definitions:
  `node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts:1028-1169, 1606-1621, 1763-1782, 2015-2041`
- Official docs — streaming vs single mode:
  https://code.claude.com/docs/en/agent-sdk/streaming-vs-single-mode
- Official docs — TypeScript reference (Query interface):
  https://code.claude.com/docs/en/agent-sdk/typescript
- Current harness implementation: `eval/harness.ts:240-400`
- Current provider implementation: `src/providers/claude.ts:111`
- SDK version pin: `package.json:39` (`^0.2.50`)
