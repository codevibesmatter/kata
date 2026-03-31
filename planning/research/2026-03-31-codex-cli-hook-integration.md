# Research: Codex CLI Hook Integration for kata-wm

**Date:** 2026-03-31
**Status:** Complete

## Summary

OpenAI's Codex CLI (v0.116.0+) now supports lifecycle hooks behind an experimental feature flag. The hook system closely mirrors Claude Code's, making kata-wm integration feasible. kata already has a Codex provider for sub-agent spawning (`src/providers/codex.ts`), but no hook registration or handler compatibility for running kata _inside_ Codex CLI sessions.

## Codex CLI Hooks — Key Facts

### Availability
- **Feature flag required:** `[features] codex_hooks = true` in `config.toml`
- **Added:** v0.116.0 (2026-03-19) added `UserPromptSubmit`; earlier versions had `SessionStart`, `PreToolUse`, `PostToolUse`, `Stop`
- **Latest stable:** v0.117.0 (2026-03-26)

### Hook Events Mapping

| Claude Code Event | Codex Event | kata Hook Handler | Compatibility |
|---|---|---|---|
| `SessionStart` | `SessionStart` | `session-start` | Near-identical |
| `UserPromptSubmit` | `UserPromptSubmit` | `user-prompt` | Near-identical |
| `PreToolUse` | `PreToolUse` | `mode-gate`, `task-deps`, `task-evidence` | Compatible (matcher differs) |
| `Stop` | `Stop` | `stop-conditions` | Compatible (response format differs slightly) |
| — | `PostToolUse` | — | No kata handler yet |
| — | `PermissionRequest` | — | Codex-specific |
| — | `SubagentStart/Stop` | — | Multi-agent lifecycle |

### Configuration Format

**Claude Code:** `.claude/settings.json` (JSON)
```json
{
  "hooks": {
    "PreToolUse": [{
      "matcher": "TaskUpdate",
      "hooks": [{ "type": "command", "command": "kata hook task-deps", "timeout": 10 }]
    }]
  }
}
```

**Codex CLI:** `.codex/hooks.json` (JSON) or `config.toml` (TOML)
```json
{
  "hooks": {
    "PreToolUse": [{
      "matcher": "Bash",
      "hooks": [{ "type": "command", "command": "kata hook mode-gate", "timeout": 10 }]
    }]
  }
}
```

The top-level structure is **identical** — same `hooks` map of event names to arrays of entries with `matcher` and `hooks` sub-arrays.

### Stdin/Stdout Protocol Differences

**Stdin (hook receives):**

| Field | Claude Code | Codex CLI |
|---|---|---|
| Session ID | `session_id` | `session_id` |
| User message | `user_message` (fallback: `prompt`) | `prompt` |
| Tool name | `tool_name` | `tool_name` |
| Tool input | `tool_input` | `tool_input` |
| Extra fields | — | `transcript_path`, `cwd`, `model`, `permission_mode`, `hook_event_name` |

**Stdout (hook returns):**

| Purpose | Claude Code | Codex CLI |
|---|---|---|
| Block PreToolUse | `hookSpecificOutput.permissionDecision: "deny"` | Same format, OR exit code 2 + stderr |
| Inject context | `hookSpecificOutput.additionalContext` | `systemMessage` or `additionalContext` |
| Block Stop | `{ decision: "block", reason: "..." }` | Same format |
| Rewrite input | `hookSpecificOutput.updatedInput` | `updatedInput` or `updated_input` |

### Key Behavioral Differences
- Codex runs multiple matching hooks **concurrently** (Claude Code: sequential)
- Codex supports `once: true` (fire at most once per session)
- Codex supports `async: true` (fire-and-forget, non-blocking)
- Codex matchers use **regex** (Claude Code uses exact string matching)
- Codex has three handler types: `command`, `prompt` (LLM eval), `agent` (sub-agent)
- Codex supports exit code 2 as shorthand for "deny with stderr as reason"

## Integration Surface for kata-wm

### What Already Works
- **Provider:** `src/providers/codex.ts` handles sub-agent spawning (verify-run, etc.)
- **Hook handlers:** The stdin JSON is similar enough that most handlers would work as-is with minor field-name normalization

### What Needs to Change

#### 1. Hook Registration (`setup.ts`)

`buildHookEntries()` currently generates Claude Code format only. Needs:
- A parallel `buildCodexHookEntries()` or a `target` parameter
- Write to `.codex/hooks.json` instead of `.claude/settings.json`
- Codex tool names may differ (e.g., `Bash` vs `shell` for shell commands)

#### 2. Stdin Normalization (`hook.ts`)

Create a thin normalization layer at the top of hook dispatch:
```typescript
function normalizeHookInput(raw: Record<string, unknown>): HookInput {
  return {
    session_id: raw.session_id as string,
    user_message: (raw.user_message ?? raw.prompt) as string | undefined,
    tool_name: raw.tool_name as string | undefined,
    tool_input: raw.tool_input as Record<string, unknown> | undefined,
    source: raw.source as string | undefined,
  }
}
```

Most handlers already handle `user_message ?? prompt` fallback. The main normalization is already in place.

#### 3. Tool Name Mapping

Codex may use different tool names than Claude Code:
- `shell` vs `Bash`
- Write/Edit equivalents may differ
- Need a mapping table for mode-gate's write-deny logic

#### 4. Session ID Resolution

Codex uses its own session directory structure. kata's session storage (`.kata/sessions/`) is CLI-agnostic, but the session ID format and lifecycle may differ.

#### 5. Project Instructions

Codex uses `AGENTS.md` instead of `CLAUDE.md`. The SessionStart hook's context injection would need to reference the correct file, or kata could write both.

#### 6. Setup Detection

`kata setup` should auto-detect which CLI is installed, or accept `--target=claude|codex|both`:
- Check for `codex` binary in PATH
- Check for `.codex/` directory
- Default to Claude Code if both present (or install both)

### Recommended Approach

**Phase 1 — Compatibility layer (low effort):**
- Normalize stdin field names in `hook.ts` (already mostly done)
- Add tool name mapping table for mode-gate
- This lets kata hooks work if someone manually configures Codex hooks.json

**Phase 2 — Setup integration (medium effort):**
- Add `--target=codex` to `kata setup`
- Generate `.codex/hooks.json` with correct format
- Ensure `codex_hooks = true` is set in user's config.toml (or warn)

**Phase 3 — Full parity (higher effort):**
- AGENTS.md generation alongside CLAUDE.md
- Codex-specific session lifecycle handling
- Eval scenario for Codex CLI (requires codex binary in CI)

## Decision Points

1. **Do we maintain two settings writers or abstract?** The JSON format is nearly identical — a single writer with target-specific path logic may suffice.
2. **Tool name mapping:** Should we maintain a static map or discover Codex tool names dynamically?
3. **Feature flag:** Should `kata setup --target=codex` automatically enable `codex_hooks` in the user's config.toml, or just warn?
4. **Testing:** Can we test Codex hook integration without the Codex binary? (Unit tests with mock stdin should suffice for handlers; integration requires codex.)
