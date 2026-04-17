---
date: 2026-04-17
topic: Post-tool-use session-scoped file tracking
type: feature
status: complete
github_issue: null
items_researched: 5
---

# Research: Post-Tool-Use Session-Scoped File Tracking

## Context

When multiple agents work concurrently in the same repo, kata's stop conditions (`committed`, `tests_pass`, `feature_tests_added`) operate on global `git status` output. They cannot distinguish which session modified which files. This causes:

- **False-positive blocking**: Agent B can't exit because Agent A left uncommitted files
- **Cross-contamination of commits**: Agent B's commit sweeps up Agent A's dirty files
- **Unnecessary test scope**: Agent B forced to test Agent A's untested changes

The feature request: reinstitute session-scoped file tracking via PostToolUse hooks so each session only owns its own mutations.

## Scope

### Items Researched

1. **PostToolUse hook mechanics** — stdin payload, tool coverage, session_id availability
2. **Current stop-condition & commit logic** — how `committed`/`tests_pass`/`feature_tests_added` evaluate today
3. **SessionState schema & editedFiles field** — existing schema shape, dead field status, write patterns
4. **Multi-agent concurrency** — state isolation, atomic writes, race conditions
5. **Bash tool file mutation detection** — command parsing vs git-snapshot approaches

### Fields Evaluated

- Implementation feasibility
- Breaking changes / migration risk
- Concurrency safety
- Performance overhead
- False positive / negative rates

## Findings

### 1. PostToolUse Hook Mechanics

**Status: Not implemented. Straightforward to add.**

- PostToolUse hooks are supported by Claude Code but not registered in `.claude/settings.json`
- Reference config exists at `reference/baseplane-config/.claude/settings.json:68-77`
- Stdin payload matches PreToolUse: `{ session_id, tool_name, tool_input: { file_path, ... } }`
- Key difference: PostToolUse observes (can't block); PreToolUse gates (can deny)
- `session_id` available in stdin JSON — same extraction as PreToolUse (`hook.ts:136,196,265`)
- Tools that expose `file_path` in `tool_input`: Edit, Write, NotebookEdit
- Bash exposes `tool_input.command` (string) — no structured file_path

**Source files:** `src/commands/hook.ts:20-22,263-329`, `src/testing/mock-hooks.ts:10-14`

### 2. Current Stop-Condition & Commit Logic

**All checks are repo-global. No session scoping.**

| Condition | How it evaluates | Multi-agent hazard |
|-----------|-----------------|-------------------|
| `committed` | `git status --porcelain`, filters `??` and `.kata/sessions/` | Any session's dirty files block ALL sessions |
| `tests_pass` | Reads verification evidence JSON, checks timestamp vs latest commit | Stale if another session commits |
| `feature_tests_added` | `git diff <base>` for test file patterns, counts `+(it\|test\|describe)` | Counts ALL branch changes, not just this session's |
| `pushed` | `git branch -r --contains HEAD` | Safe (checks HEAD, not working tree) |
| `tasks_complete` | Counts pending native tasks | Safe (tasks are session-scoped) |

**Ceremony commits** use `git add {changed_files}` with agent-filled placeholders — no `git add -A`. But agents aren't told which files are "theirs."

**Source files:** `src/commands/can-exit.ts:46-89,114-216,313-441`, `batteries/skills/kata-close/SKILL.md:39-47`

### 3. SessionState Schema & editedFiles

**Field exists. Zero writers. Ready to revive.**

- `editedFiles: z.array(z.string()).default([])` — `src/state/schema.ts:113`
- Initialized as `[]` in `src/commands/init.ts:43` and `src/commands/enter/cli.ts:63`
- No code anywhere mutates this field post-initialization
- Schema uses `.passthrough()` — backward compatible, no migration needed

**State write patterns are safe for concurrent use:**
- `writeState()` — atomic write via tmp file + rename (`src/state/writer.ts:26-31`)
- `updateState()` — read-merge-write with atomic rename (`src/state/writer.ts:44-59`)
- Sessions isolated by UUID directory: `.kata/sessions/{sessionId}/state.json`

**No path normalization exists** — paths stored as-is. Git status outputs git-root-relative paths.

**Source files:** `src/state/schema.ts:38-138`, `src/state/writer.ts:6-59`, `src/session/lookup.ts:218-222`

### 4. Multi-Agent Concurrency

**Session isolation is inherently safe. Same-session agents share state.**

| Scenario | Safety | Notes |
|----------|--------|-------|
| Separate sessions, separate state.json | Safe | UUID-keyed dirs, no overlap |
| Same session, multiple sub-agents | Shared | All write to same `editedFiles` — co-ownership |
| Concurrent PostToolUse hook calls | Safe | Atomic rename; but read-merge-write has tiny race window |
| Hook log writes | Safe | `appendFileSync` — atomic append |

**Sub-agent session inheritance:** Hooks pass `KATA_SESSION_ID` env var to child processes (`hook.ts:693`). Agent-tool sub-agents inherit parent session.

**Active agent detection:** `hasActiveBackgroundAgents()` (`hook.ts:526-587`) scans transcript for unmatched Agent tool_use IDs. Allows stop-hook to defer exit while agents are running.

**Race condition risk:** `updateState()` does read → merge → write. If two PostToolUse hooks fire simultaneously for the same session, one write could be lost. Mitigation: use append-only pattern or file-level lock.

**Source files:** `src/state/writer.ts:44-59`, `src/commands/hook.ts:526-587,693`

### 5. Bash Tool File Mutation Detection

**Hybrid approach recommended: git-snapshots as truth, command regex as advisory.**

| Approach | Pros | Cons |
|----------|------|------|
| **Command regex** | Catches before execution; cheap | Fragile (`$VAR > file`, `eval`, `xargs`); high false-neg rate |
| **Git snapshots** | Sees actual mutations; shell-agnostic; proven in codebase | Overhead per Bash call; untracked file noise |
| **Hybrid** | Best of both; regex pre-filters, git confirms | More complex; two code paths |

**Existing precedent:** Hook already parses Bash commands for kata session injection (`hook.ts:295-320`). Git-snapshot pattern used in `can-exit.ts:189-203` and task-evidence checks.

**Suspicious command patterns:** `sed -i`, `>`, `>>`, `tee`, `mv`, `cp`, `rm`, pipe to file.

**Safe-list (skip snapshot):** `git *`, `bun test *`, `ls`, `cat`, `echo` (no redirect), `cd`, `pwd`.

**Source files:** `src/commands/hook.ts:295-320,408,916`, `src/commands/can-exit.ts:189-203`

## Comparison

| Tracking Mechanism | Edit/Write/NotebookEdit | Bash (regex) | Bash (git-snapshot) | Coverage |
|-------------------|------------------------|--------------|---------------------|----------|
| Structured file_path | Yes | No | No | Partial |
| Command parsing | No | Yes (fragile) | No | Partial |
| Git diff before/after | No | No | Yes | High |
| **Combined** | **Yes** | **Advisory** | **Fallback** | **~95%** |

## Recommendations

### Architecture: Three-Layer Tracking

1. **PostToolUse hook for Edit/Write/NotebookEdit** — Extract `tool_input.file_path`, normalize to git-root-relative, append to `state.editedFiles`. Clean, structured, zero overhead.

2. **PreToolUse snapshot + PostToolUse diff for Bash** — If command matches suspicious regex, capture `git status --porcelain` in PreToolUse. In PostToolUse, diff against post-state. Store new dirty files in `editedFiles`.

3. **Scoped stop conditions** — Rewrite `committed`, `feature_tests_added`, and task-evidence warnings to filter against `state.editedFiles`. Only flag files this session owns.

### Design Decisions

| Decision | Recommendation | Rationale |
|----------|---------------|-----------|
| File shared by 2 sessions | Both own it | If you touched it, you're responsible for committing |
| Bash overhead | Snapshot only suspicious commands | Regex pre-filter keeps cost near zero for safe commands |
| Path format | Git-root-relative | Matches `git status` output natively, no conversion needed |
| Field name | Keep `editedFiles` | Already in schema, no migration |
| Commit scoping | Advisory first | Warn if staging untracked files, don't hard-block |
| Baseline snapshot | Record dirty files at session start | Exclude pre-existing dirt from stop conditions |

### Concurrency Race Mitigation

The `updateState()` read-merge-write pattern has a tiny race window when two PostToolUse hooks fire simultaneously for the same session. Options:

1. **Append-only log file** (e.g., `.kata/sessions/{id}/edits.jsonl`) — hooks append atomically, reader deduplicates
2. **File lock** (flock) around updateState — simple but adds latency
3. **Accept rare duplicate** — editedFiles is deduped on read; lost writes are re-captured on next edit

Recommendation: **Option 1 (append-only log)** — atomic appends, zero contention, cheap to read.

## Open Questions

1. **Baseline snapshot at session start** — Should we record `git status` at `kata enter` time to establish which files were already dirty? This prevents the "13 uncommitted changes" false-positive problem observed during this research session.

2. **Task-agent granularity** — Is session-level tracking sufficient, or do individual task agents need their own `editedFiles` sub-arrays? (Session-level is likely sufficient for v1.)

3. **Performance in large repos** — `git status --porcelain` on every suspicious Bash command. Need to benchmark in repos with 10k+ files. Skip-list or debounce may be needed.

4. **File deletion tracking** — If a session deletes a file, should `editedFiles` track that? (Yes — deletions are mutations that need committing.)

## Next Steps

1. **Create GitHub issue** for this feature
2. **Write spec** with behaviors (B-IDs) covering: hook registration, file tracking, scoped stop conditions, Bash snapshot, baseline snapshot
3. **Implement in phases**: PostToolUse hook → editedFiles population → scoped stop conditions → Bash snapshots → baseline snapshot
