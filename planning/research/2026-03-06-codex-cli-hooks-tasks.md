---
date: 2026-03-06
topic: OpenAI Codex CLI hooks and tasks — kata adaptation feasibility
status: complete
github_issue: null
---

# Research: OpenAI Codex CLI — Can kata be adapted?

## Context

Exploring whether kata-wm can be adapted to support the OpenAI Codex CLI as a runtime, in addition to (or instead of) Claude Code. The question: does Codex have equivalent lifecycle hooks and a native task system?

## Questions Explored

1. Does Codex CLI have lifecycle hooks (session-start, pre-tool, stop)?
2. Does it have a native task/todo system like Claude Code's TodoWrite/TaskUpdate?
3. What is its settings/config format?
4. What would kata need to change to support Codex CLI?

## Findings

### Hooks — The Core Blocker

**Codex has NO shipped lifecycle hooks** (as of March 2026, v0.111.0).

The only hook-adjacent feature today is `notify` in `config.toml`:
```toml
notify = ["bash", "-lc", "notify-send 'Codex done'"]
```
This is fire-and-forget (observer only), fires on `agent-turn-complete` only. It **cannot block execution, modify tool inputs, or gate session exit.**

**Hooks are actively in development.** Two closed community PRs proposed a full system:
- [PR #11067](https://github.com/openai/codex/pull/11067): Proposed `pre_tool_use`, `post_tool_use`, `session_stop`, `user_prompt_submit`, `after_agent` with `Proceed`/`Block`/`Modify` outcomes — nearly identical to Claude Code's hook model.
- Closed with: "We are actively working on designing a hooks system"

**When hooks ship, the API maps 1:1 to Claude Code:**

| Codex (proposed) | Claude Code | Kata uses |
|---|---|---|
| `pre_tool_use` | `PreToolUse` | mode-gate, task-deps |
| `session_stop` | `Stop` | stop-conditions |
| `user_prompt_submit` | `UserPromptSubmit` | user-prompt/suggest |
| `post_tool_use` | `PostToolUse` | (not used) |
| `after_agent` | n/a | n/a |

### Native Tasks

Codex has `update_plan` / `todo_write` as built-in solver tools. From the [Codex Prompting Guide](https://developers.openai.com/cookbook/examples/gpt-5/codex_prompting_guide/):

> Default solver tools: git, rg, read_file, list_dir, glob_file_search, apply_patch, **todo_write/update_plan**, shell_command

Tasks track `pending` / `in_progress` / `completed` status. However:
- **Not file-based** — stored internally (no `~/.codex/tasks/{session}/` equivalent exposed)
- Low CLI visibility (no visible panel in TUI; VS Code extension has one)
- No stop-hook enforcement (can't block exit on pending tasks)

Claude Code's task system writes JSON files to `~/.claude/tasks/{sessionId}/{id}.json` which kata reads in its Stop hook. This file-based bridge doesn't exist in Codex.

### Configuration Format

Codex uses **TOML** (not JSON):
- User config: `~/.codex/config.toml`
- Project config: `.codex/config.toml`
- No `[hooks]` section today

Key config options:
```toml
model = "gpt-5.4"
approval_policy = "on-request"
sandbox_mode = "workspace-write"
notify = ["notify-send", "Codex"]

[shell_environment_policy]
include_only = ["PATH", "HOME"]

[features]
multi_agent = true
```

Claude Code uses `.claude/settings.json` (JSON) with a `hooks` key. Completely different format.

### Context Injection

Codex uses **`AGENTS.md`** — the direct equivalent of Claude Code's `CLAUDE.md`:
- Discovery: walks from git root → CWD, reading each `AGENTS.md` found, concatenated root-to-leaf
- Override: `~/.codex/AGENTS.override.md` checked first (global)
- Configurable fallback filenames: `TEAM_GUIDE.md`, `.agents.md`, etc.

This is how kata could inject mode context today (file-based, not hook-based).

### What kata does that depends on Claude Code specifically

| Feature | Mechanism | Claude Code | Codex |
|---|---|---|---|
| Mode write gating | PreToolUse → block | ✅ | ❌ (not shipped) |
| Stop condition enforcement | Stop → block | ✅ | ❌ (not shipped) |
| Session context injection | SessionStart → additionalContext | ✅ | ❌ (not shipped) |
| Mode detection from message | UserPromptSubmit | ✅ | ❌ (not shipped) |
| Task file bridge | `~/.claude/tasks/{session}/` | ✅ | ❌ (no file equivalent) |
| Hook registration | `.claude/settings.json` hooks key | ✅ | ❌ |

## Recommendations

### Today: Not feasible for full kata support

Core kata features (mode enforcement, stop conditions, task gating) require hooks that can **block** execution. Codex has none. A degraded "soft kata" could work:
- Write mode context to `.codex/AGENTS.md` on `kata enter <mode>`
- Modes become suggestions, not gates
- No stop condition enforcement
- No task completion checking before exit

This loses kata's core value proposition.

### Near-future: Adaptation straightforward once hooks ship

Once Codex ships hooks (likely — OpenAI confirmed it's in development), adaptation would require:

1. **New setup command** — write `[hooks]` section to `.codex/config.toml` instead of `.claude/settings.json`
2. **Hook handler adapters** — Codex sends different stdin JSON schema; need adapters per event
3. **AGENTS.md for context** — instead of `hookSpecificOutput.additionalContext`, write to `.codex/AGENTS.md` on session start
4. **Task bridge** — skip file-based task bridge; use AGENTS.md to inject task list or skip enforcement
5. **Config reader** — parse TOML instead of JSON for settings

### Architecture recommendation

If adapting kata for Codex:
- Introduce a **runtime abstraction** (`ClaudeCodeRuntime`, `CodexRuntime`) that implements the hook registration, stdin parsing, and output formatting
- Keep all mode/phase/template logic unchanged (it's already generic)
- The `setup.ts` command would detect which runtime to configure based on presence of `.codex/` vs `.claude/`

## Open Questions

- Will Codex hook output format differ from Claude Code's `hookSpecificOutput` schema?
- Will Codex expose task files for external inspection, or keep them internal?
- Will `update_plan` tasks be visible/readable from outside (file path)?

## Next Steps

Watch Codex CLI releases for hooks shipping. Track:
- [GitHub Discussion #2150](https://github.com/openai/codex/discussions/2150) — hooks feature request
- [Codex Changelog](https://developers.openai.com/codex/changelog/)

No implementation action needed until hooks ship. Consider creating a tracking issue.
