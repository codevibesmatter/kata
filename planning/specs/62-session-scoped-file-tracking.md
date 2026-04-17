---
initiative: session-scoped-file-tracking
type: project
issue_type: feature
status: approved
priority: high
github_issue: 62
created: 2026-04-17
updated: 2026-04-18
phases:
  - id: p1
    name: "PostToolUse hook, edits log, baseline snapshot, scoped stops, Bash tracking"
    tasks:
      - "Register PostToolUse hook in .claude/settings.json for Edit, Write, NotebookEdit, Bash"
      - "Add handlePostToolUse() in src/commands/hook.ts — extract file_path from tool_input, normalize to git-root-relative, append to edits.jsonl"
      - "Create src/tracking/edits-log.ts — appendEdit(sessionDir, filePath), readEdits(sessionDir): string[], readEditsSet(sessionDir): Set<string>"
      - "Add baseline snapshot to kata enter — run git status --porcelain, write .kata/sessions/{id}/baseline.json with dirty file list"
      - "Add Bash mutation tracking — regex pre-filter in PreToolUse captures pre-snapshot, PostToolUse diffs and records changed files"
      - "Rewrite checkGlobalConditions() in can-exit.ts — filter git status output against session editedFiles, exclude baseline files"
      - "Rewrite checkFeatureTestsAdded() in can-exit.ts — intersect git diff files with session editedFiles"
      - "Update task-evidence warning in hook.ts — scope uncommitted check to session files"
      - "Add advisory warning to stop-conditions output when staging files outside session scope"
      - "Wire hookHandlers map: 'post-tool-use' -> handlePostToolUse"
    test_cases:
      - id: "post-tool-use-edit-tracked"
        description: "PostToolUse hook for Edit tool appends file_path to edits.jsonl; readEdits returns it"
        type: "unit"
      - id: "post-tool-use-write-tracked"
        description: "PostToolUse hook for Write tool appends file_path to edits.jsonl"
        type: "unit"
      - id: "post-tool-use-bash-tracked"
        description: "PostToolUse hook for Bash with suspicious command (sed -i) records git-diff'd files in edits.jsonl"
        type: "unit"
      - id: "post-tool-use-bash-safe-skipped"
        description: "PostToolUse hook for Bash with safe command (ls, git status) does NOT snapshot or record"
        type: "unit"
      - id: "baseline-snapshot-recorded"
        description: "kata enter writes baseline.json with pre-existing dirty files"
        type: "unit"
      - id: "committed-scoped-to-session"
        description: "checkGlobalConditions with committed check passes when only non-session files are dirty"
        type: "unit"
      - id: "committed-fails-for-session-files"
        description: "checkGlobalConditions with committed check fails when session-owned files are dirty"
        type: "unit"
      - id: "committed-excludes-baseline"
        description: "checkGlobalConditions ignores files present in baseline.json"
        type: "unit"
      - id: "feature-tests-scoped"
        description: "checkFeatureTestsAdded only counts test functions in files the session touched"
        type: "unit"
      - id: "edits-log-deduplicates"
        description: "readEdits returns unique file paths even when same file appended multiple times"
        type: "unit"
      - id: "edits-log-sequential-integrity"
        description: "Multiple rapid sequential appendEdit calls to same session all persist — no truncation or corruption of edits.jsonl"
        type: "unit"
      - id: "task-evidence-ignores-non-session-files"
        description: "TaskUpdate completion with pre-existing dirty files but no session edits does NOT show uncommitted changes warning"
        type: "unit"
      - id: "task-evidence-warns-for-session-files"
        description: "TaskUpdate completion with session-owned uncommitted files shows uncommitted changes warning"
        type: "unit"
      - id: "advisory-warning-shown"
        description: "Stop-conditions output includes warning when git status has files not in session editedFiles"
        type: "unit"
      - id: "edits-log-corrupt-line-resilient"
        description: "readEditsSet skips corrupt JSON lines (truncated write) and returns valid entries from remaining lines"
        type: "unit"
      - id: "rename-entries-parsed"
        description: "parseGitStatusPaths correctly splits 'R  old.ts -> new.ts' into both paths; baseline and edits include both old and new paths for renames"
        type: "unit"
      - id: "bash-unknown-command-skipped"
        description: "Bash command matching neither safe-list nor suspicious regex (e.g. 'python modify.py') does NOT trigger snapshot — documents the known coverage gap"
        type: "unit"
      - id: "path-normalization"
        description: "Absolute paths from tool_input are normalized to git-root-relative before storage"
        type: "unit"
      - id: "existing-tests-pass"
        description: "bun test src/ passes — no regressions"
        type: "integration"
      - id: "typecheck-passes"
        description: "bun run typecheck passes"
        type: "integration"
---

# Session-Scoped File Tracking via PostToolUse Hooks

## Overview

When multiple agents work concurrently in the same repo, kata's stop conditions (`committed`, `tests_pass`, `feature_tests_added`) operate on global `git status` — they can't distinguish which session modified which files. This causes false-positive blocking (Agent B can't exit because Agent A left uncommitted files), cross-contamination of commits, and unnecessary test scope. This feature adds session-scoped file tracking via PostToolUse hooks so each session only owns its own mutations.

## Feature Behaviors

### B1: PostToolUse Hook Registration

**Core:**
- **ID:** post-tool-use-hook-registration
- **Trigger:** Claude Code fires PostToolUse event after Edit, Write, NotebookEdit, or Bash tool completes
- **Expected:** Hook registered in `.claude/settings.json` under `PostToolUse` key, matched for Edit/Write/NotebookEdit/Bash tools, calls `kata hook post-tool-use`
- **Verify:** After `kata setup`, `.claude/settings.json` contains a `PostToolUse` array with matcher for the four tools and command pointing to `kata hook post-tool-use`
**Source:** `.claude/settings.json` (new section), `src/commands/hook.ts:957-965` (hookHandlers map)

#### Data Layer
- New entry in `hookHandlers` map: `'post-tool-use': handlePostToolUse`
- Settings.json gains `PostToolUse` hook array with tool matchers
- Hook registration added to `src/commands/setup.ts` — specifically in `buildHookEntries()` (line ~105) which generates hook entries, and `applySetup()` (line ~358) which writes them via `writeSettings()`. Add a new `PostToolUse` entry following the same pattern as existing PreToolUse entries.
- **PreToolUse for Bash pre-snapshot:** No new PreToolUse registration needed. The existing `PreToolUse` → `kata hook mode-gate` handler already fires for all tools including Bash. B3's pre-snapshot logic is added *inside* the existing `handlePreToolUse()` function (which already inspects `tool_name` and `tool_input`), not via a new hook entry. Only the `PostToolUse` hook is newly registered.

---

### B2: Edit/Write/NotebookEdit File Tracking

**Core:**
- **ID:** structured-file-tracking
- **Trigger:** PostToolUse fires for Edit, Write, or NotebookEdit with `tool_input.file_path` present
- **Expected:** File path normalized to git-root-relative and appended to `.kata/sessions/{sessionId}/edits.jsonl` as a JSON line `{"file": "<path>", "tool": "<tool_name>", "ts": "<ISO>"}`
- **Verify:** After an Edit operation, `edits.jsonl` contains a line with the edited file's git-root-relative path
**Source:** `src/commands/hook.ts` (new `handlePostToolUse` function)

#### Data Layer

**PostToolUse stdin JSON schema** (same structure as PreToolUse — Claude Code sends identical fields):
```typescript
interface PostToolUseStdin {
  session_id: string      // UUID — the Claude Code session ID
  tool_name: string       // "Edit" | "Write" | "NotebookEdit" | "Bash" | ...
  tool_input: {           // The tool's input parameters (tool-specific)
    file_path?: string    // Present for Edit, Write, NotebookEdit (absolute path)
    command?: string      // Present for Bash
    [key: string]: unknown
  }
  tool_result?: string    // Tool output (may be truncated)
}
```
The handler extracts `input.session_id` (string), `input.tool_name` (string), and `input.tool_input.file_path` (string, absolute path). These field names match the existing PreToolUse extraction at `hook.ts:265-268`.

- New file: `src/tracking/edits-log.ts` with `appendEdit(sessionDir, entry)` and `readEdits(sessionDir)`
- Append-only JSONL format — `fs.appendFileSync` for atomic appends, no read-modify-write
- Path normalization: `path.relative(gitRoot, absolutePath)` where `gitRoot` = `git rev-parse --show-toplevel`
- Deduplication on read: `readEditsSet()` returns `Set<string>` of unique file paths

---

### B3: Bash Tool Mutation Detection (Hybrid)

**Core:**
- **ID:** bash-mutation-tracking
- **Trigger:** PostToolUse fires for Bash tool
- **Expected:** If the Bash command matched a suspicious pattern (detected in PreToolUse), compare post-execution `git status --porcelain` against pre-snapshot. Any new dirty files are appended to `edits.jsonl`.
- **Verify:** After running `sed -i 's/foo/bar/' file.txt` via Bash, `edits.jsonl` contains `file.txt`. After running `ls -la`, `edits.jsonl` has no new entries.
**Source:** `src/commands/hook.ts` (PreToolUse addition + new PostToolUse handler)

#### Data Layer
- **PreToolUse addition:** When `tool_name === 'Bash'` and command matches suspicious regex, capture `git status --porcelain` output and store in `.kata/sessions/{id}/bash-pre-snapshot.txt` (overwritten each time)
- **Evaluation order:** Safe-list is checked **first** — if the command matches safe-list, skip snapshot entirely (no pre-snapshot taken). Only if safe-list does NOT match, check suspicious regex. If suspicious matches, take pre-snapshot. If neither matches, skip snapshot (default to no-track for unknown commands).
- **Safe-list (checked first):** `/^(git\s|bun\s+test|ls\b|cat\b|echo\b[^>]*$|cd\b|pwd\b|which\b|head\b|tail\b|wc\b|diff\b|grep\b|find\b)/`
- **Suspicious regex (checked second):** `/sed\s.*-i|>\s|>>\s|\btee\b|\bcp\b|\bmv\b|\brm\b|\bchmod\b|\bchown\b|\bpatch\b|\bcurl\b.*-o/`
- **PostToolUse diff:** Read `bash-pre-snapshot.txt`, run `git status --porcelain` again, diff the two. New dirty files → append to `edits.jsonl` with `tool: "Bash"`

---

### B4: Baseline Snapshot at Session Start

**Core:**
- **ID:** baseline-snapshot
- **Trigger:** `kata enter <mode>` initializes a new session
- **Expected:** Run `git status --porcelain`, parse file paths, write to `.kata/sessions/{id}/baseline.json` as `{"files": ["file1", "file2"], "ts": "<ISO>"}`. These files are excluded from all session-scoped stop condition checks.
- **Verify:** Enter a mode in a repo with pre-existing dirty files. `baseline.json` lists those files. `kata can-exit` committed check passes (pre-existing dirt ignored).
**Source:** `src/commands/enter/cli.ts` (add baseline capture after session init), `src/commands/can-exit.ts:46-68` (consume baseline)

#### Data Layer
- New file per session: `.kata/sessions/{id}/baseline.json`
- Schema: `{ files: string[], ts: string }`
- Parsed with same git-root-relative normalization as edits log
- **Rename handling** — `git status --porcelain` outputs renames as `R  old -> new`. The path parser must detect ` -> ` and extract both paths: the old path (deleted) and new path (added). Both are stored in baseline/edits. Helper function: `parseGitStatusPaths(line: string): string[]` returns 1 path normally, 2 paths for renames.
- **Untracked files excluded from baseline** — baseline only captures tracked-but-modified files (status `M`, `A`, `D`, `R`, etc.), not untracked (`??`). This means if a session `git add`s a pre-existing untracked file, that file transitions from `??` to `A` and won't be in baseline — it will count against the session's `committed` check. This is intentional: staging an untracked file is an explicit action the session chose to take, making it the session's responsibility to commit.

---

### B5: Scoped `committed` Stop Condition

**Core:**
- **ID:** scoped-committed-check
- **Trigger:** `kata can-exit` evaluates `committed` stop condition
- **Expected:** Instead of checking ALL dirty tracked files, filter `git status --porcelain` output to only files present in `edits.jsonl` AND not in `baseline.json`. Pass if zero session-owned dirty files remain.
- **Verify:** Session A modifies `foo.ts` but not `bar.ts`. Another process dirties `bar.ts`. Session A's `committed` check passes after committing only `foo.ts`.
**Source:** `src/commands/can-exit.ts:46-68` (rewrite `checkGlobalConditions`)

#### Data Layer
- `checkGlobalConditions` gains `sessionDir` parameter
- Reads `edits.jsonl` via `readEditsSet(sessionDir)`
- Reads `baseline.json` via `readBaseline(sessionDir)`
- **Filter logic:** A dirty file counts against this session **only if** `sessionEdits.has(file)` — the session touched it, so it's the session's responsibility (even if the file was also in baseline). Files in baseline that the session did NOT touch are ignored. Files not in baseline and not in sessionEdits are also ignored (another session's problem). In code: `if (sessionEdits.has(file)) return true; return false;` — see the Implementation Hints for the complete filter.

---

### B6: Scoped `feature_tests_added` Stop Condition

**Core:**
- **ID:** scoped-feature-tests-check
- **Trigger:** `kata can-exit` evaluates `feature_tests_added` stop condition
- **Expected:** Intersect `git diff --name-only` with session's `edits.jsonl` before counting new test functions. Only count tests in files the session touched.
- **Verify:** Session modifies `src/foo.ts` and `src/foo.test.ts`. Another branch has `src/bar.test.ts` changes. Session's `feature_tests_added` only counts functions in `foo.test.ts`.
**Source:** `src/commands/can-exit.ts:181-216` (rewrite `checkFeatureTestsAdded`)

#### Data Layer
- `checkFeatureTestsAdded` gains `sessionDir` parameter
- Reads session edits, intersects with `git diff --name-only` output
- Only diffs intersected test files for new function count

---

### B7: Scoped Task-Evidence Warning

**Core:**
- **ID:** scoped-task-evidence-warning
- **Trigger:** PreToolUse hook for TaskUpdate (task-evidence handler) checks for uncommitted changes
- **Expected:** Warning only fires if session-owned files (from edits.jsonl, excluding baseline) are uncommitted. Pre-existing dirt and other sessions' files are ignored.
- **Verify:** Session has no edits. Pre-existing dirty files exist. TaskUpdate completion does NOT show "uncommitted changes" warning.
**Source:** `src/commands/hook.ts` (task-evidence handler, ~line 916). The handler already receives `input` with `session_id` parsed from stdin (same as all PreToolUse handlers — see `hook.ts:265`). Session dir is constructed as `join(getSessionsDir(projectDir), input.session_id)`. No new stdin extraction logic needed — reuse the existing `session_id` variable already available in the consolidated `handlePreToolUse` function.

---

### B8: Advisory Out-of-Scope Staging Warning

**Core:**
- **ID:** advisory-staging-warning
- **Trigger:** Stop-conditions hook evaluates and finds `git status` has dirty files NOT in session's `edits.jsonl`
- **Expected:** Output includes advisory message: "Note: {N} file(s) outside this session's scope have uncommitted changes: {file_list}". Does NOT block exit. File list is comma-separated, truncated to first 5 files with "... and N more" suffix if >5.
- **Verify:** Session owns `foo.ts`. `bar.ts` is dirty from another source. Stop output includes advisory about `bar.ts` but `committed` check passes after committing `foo.ts`.
**Source:** `src/commands/can-exit.ts` (advisory emitted in the return value of `checkGlobalConditions`)

**Placement:** The advisory is emitted by `checkGlobalConditions()` in `can-exit.ts` as an additional `advisories: string[]` field in its return value (alongside `passed` and `reasons`). The stop-conditions hook (`hook.ts`) calls `can-exit` logic and forwards advisories to its stdout JSON as `additionalContext`. This means the advisory appears in both `kata can-exit` CLI output and hook-triggered evaluations — single code path, two consumers.

---

## Non-Goals

- **Per-task-agent sub-tracking** — Session-level tracking is sufficient for v1. Individual task agents within a session share the session's `edits.jsonl`. If Agent tool sub-agents need their own tracking, that's a future enhancement.
- **Hard-blocking commit gating** — No PreToolUse gate on `git add`/`git commit` to enforce session scope. Advisory only.
- **Bash command sandboxing** — We track what Bash changes; we don't prevent it from changing files.
- **Cross-session coordination** — No lock manager, ownership negotiation, or "this file is claimed" protocol. Both sessions own shared files independently.
- **Performance optimization for huge repos** — If `git status` is slow in 50k-file repos, that's a separate optimization. No debounce or caching in v1.
- **Rename/move tracking** — If a file is renamed via `mv`, the old path appears as deleted and new path as added. Both tracked independently; no rename correlation.
- **edits.jsonl pruning/cleanup** — The append-only log grows unboundedly within a session. No rotation, truncation, or cleanup on `kata exit`. Sessions are typically bounded (hours, not days), so size is not a concern for v1. Future enhancement: prune on session close or cap at N entries.
- **Exit-time actions on tracking state** — `kata exit` does NOT read, summarize, or act on `edits.jsonl`. Tracking state is consumed only by stop conditions during the session. On exit, session dir (including edits.jsonl and baseline.json) is left as-is for potential forensic inspection.
- **No-session graceful degradation** — If PostToolUse fires when no kata session is active (user running Claude Code without `kata enter`, or `session_id` from stdin doesn't match any `.kata/sessions/` dir), the hook silently no-ops. It does NOT create orphaned session directories or track to nonexistent sessions. Guard: check `existsSync(sessionDir + '/state.json')` before appending.

## Implementation Phases

Single phase (all-at-once) as decided in interview. The phase breakdown above in frontmatter groups all tasks together.

### Phase 1: Full Implementation

**Tasks (in dependency order):**

1. **Create `src/tracking/edits-log.ts`** — `appendEdit()`, `readEdits()`, `readEditsSet()`, `readBaseline()`, `writeBaseline()`, path normalization helper (`toGitRelative()`)
2. **Add `handlePostToolUse()` to `src/commands/hook.ts`** — dispatch on tool_name, extract file_path for Edit/Write/NotebookEdit, handle Bash via git-snapshot diff
3. **Add Bash pre-snapshot in PreToolUse** — suspicious regex check, write `bash-pre-snapshot.txt`
4. **Wire hookHandlers** — add `'post-tool-use': handlePostToolUse` to the map in hook.ts
5. **Register PostToolUse in settings** — update `.claude/settings.json` and `src/commands/setup.ts`
6. **Add baseline snapshot to `kata enter`** — capture `git status --porcelain` at session init, write `baseline.json`
7. **Rewrite `checkGlobalConditions()`** — accept `sessionDir`, load edits + baseline, filter dirty files
8. **Rewrite `checkFeatureTestsAdded()`** — intersect with session edits
9. **Update task-evidence handler** — scope uncommitted warning to session files
10. **Add advisory warning** — out-of-scope files message in stop output
11. **Write tests** — unit tests for edits-log module, integration tests for scoped stop conditions

**Suggested commit cadence (within the single phase):**
- **Checkpoint 1:** After tasks 1-4 — `src/tracking/edits-log.ts` + `handlePostToolUse()` + hookHandlers wiring. At this point, file tracking works end-to-end for Edit/Write/NotebookEdit. Commit: "feat: add PostToolUse hook and edits log for session file tracking"
- **Checkpoint 2:** After tasks 5-6 — settings registration + baseline snapshot. Commit: "feat: register PostToolUse hook, add baseline snapshot on enter"
- **Checkpoint 3:** After tasks 7-10 — scoped stop conditions + advisory. Commit: "feat: scope committed/feature_tests checks to session files"
- **Checkpoint 4:** After task 11 — all tests. Commit: "test: add tests for session-scoped file tracking"

**Done state:** All stop conditions are session-scoped. PostToolUse hook tracks Edit/Write/NotebookEdit/Bash mutations. Baseline snapshot excludes pre-existing dirt. Advisory warns about out-of-scope files.

## Verification Plan

### Setup
```bash
# Ensure clean test environment
cd /data/projects/kata-wm
bun run typecheck
bun test src/
```

### VP-1: PostToolUse hook registered
```bash
# Check settings.json has PostToolUse section with correct structure
jq '.hooks.PostToolUse' .claude/settings.json
# Expected: non-null array containing at least one entry with:
#   "hooks": [{ "type": "command", "command": "...kata... hook post-tool-use" }]
# Verify matcher exists:
jq '.hooks.PostToolUse | length' .claude/settings.json
# Expected: >= 1
```

### VP-2: edits-log module unit tests
```bash
bun test src/tracking/edits-log.test.ts
# Expected: All tests pass — appendEdit, readEdits, readEditsSet, dedup, path normalization
```

### VP-3: Baseline snapshot on enter
```bash
bun test src/commands/enter/cli.test.ts --grep "baseline"
# Expected: Tests verify:
#   - baseline.json written to session dir during kata enter
#   - baseline.json contains files that were dirty before session start
#   - baseline.json excludes untracked (??) files
#   - baseline.json is empty array when working tree is clean
```

### VP-4: Scoped committed check
```bash
bun test src/commands/can-exit.test.ts --grep "scoped\|session\|baseline"
# Expected: Tests verify:
#   - committed passes when only non-session files dirty
#   - committed fails when session-owned files dirty
#   - baseline files excluded from committed check
```

### VP-5: Scoped feature_tests_added check
```bash
bun test src/commands/can-exit.test.ts --grep "feature_tests.*scoped\|session.*test"
# Expected: Tests verify intersection with session edits
```

### VP-6: Bash mutation tracking
```bash
bun test src/commands/hook.test.ts --grep "bash.*track\|suspicious\|safe.*command"
# Expected: Tests verify:
#   - sed -i triggers snapshot + tracking
#   - ls/git status skips snapshot
#   - git-diff'd files recorded in edits.jsonl
```

### VP-7: Scoped task-evidence warning
```bash
bun test src/commands/hook.test.ts --grep "task-evidence.*session\|evidence.*scoped"
# Expected: Tests verify:
#   - TaskUpdate completion with no session edits + pre-existing dirty files → no warning
#   - TaskUpdate completion with session-owned uncommitted files → warning shown
```

### VP-8: Advisory warning in stop output
```bash
bun test src/commands/can-exit.test.ts --grep "advisory\|out.*scope"
# Expected: Test verifies advisory message appears for non-session dirty files
```

### VP-9: Full regression
```bash
bun run typecheck && bun test src/
# Expected: Zero failures, zero type errors
```

## Implementation Hints

### Key Imports
```typescript
// Atomic file append (for edits.jsonl)
import { appendFileSync, readFileSync, existsSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { relative, resolve } from 'node:path'

// Existing state infrastructure
import { getCurrentSessionId, findProjectDir, getStateFilePath, getSessionsDir } from '../session/lookup.js'
import { readState } from '../state/reader.js'

// Session dir construction (canonical pattern used across all behaviors):
//   const sessionDir = join(getSessionsDir(projectDir), sessionId)
// Where sessionId comes from hook stdin (input.session_id) and
// projectDir comes from findProjectDir(). Result: .kata/sessions/{sessionId}/
```

### Code Patterns

**Atomic JSONL append (edits-log.ts):**
```typescript
export function appendEdit(sessionDir: string, entry: { file: string; tool: string; ts: string }): void {
  try {
    mkdirSync(sessionDir, { recursive: true }) // Guard: session dir may not exist if PostToolUse fires before kata enter
    const logPath = join(sessionDir, 'edits.jsonl')
    appendFileSync(logPath, JSON.stringify(entry) + '\n', 'utf-8')
  } catch {
    // Silent fallback per Gotcha #7 — tracking failure must never block tool execution
  }
}

export function readEditsSet(sessionDir: string): Set<string> {
  const logPath = join(sessionDir, 'edits.jsonl')
  if (!existsSync(logPath)) return new Set()
  const lines = readFileSync(logPath, 'utf-8').trim().split('\n').filter(Boolean)
  const files = new Set<string>()
  for (const line of lines) {
    try { files.add(JSON.parse(line).file) }
    catch { /* skip corrupt line — truncated write, disk full, etc. */ }
  }
  return files
}
```

**Git-root-relative normalization:**
```typescript
function toGitRelative(absolutePath: string): string {
  const gitRoot = execSync('git rev-parse --show-toplevel', { encoding: 'utf-8' }).trim()
  return relative(gitRoot, resolve(absolutePath))
}
```

**Baseline snapshot (in enter/cli.ts):**
```typescript
function captureBaseline(sessionDir: string): void {
  const status = execSync('git status --porcelain 2>/dev/null || true', { encoding: 'utf-8' }).trim()
  const files = status.split('\n').filter(l => l && !l.startsWith('??')).map(l => l.slice(3))
  writeFileSync(join(sessionDir, 'baseline.json'), JSON.stringify({ files, ts: new Date().toISOString() }))
}
```

**Scoped committed check (can-exit.ts):**
```typescript
// Before (global):
const changedFiles = gitStatus.split('\n').filter(line => {
  if (line.startsWith('??')) return false
  if (line.slice(3).startsWith('.kata/sessions/')) return false
  return true
})

// After (session-scoped):
const sessionEdits = readEditsSet(sessionDir)
const baseline = readBaseline(sessionDir)
const changedFiles = gitStatus.split('\n').filter(line => {
  if (line.startsWith('??')) return false
  const file = line.slice(3)
  if (file.startsWith('.kata/sessions/')) return false
  // Session touched it → session's responsibility (even if in baseline)
  if (sessionEdits.has(file)) return true
  // Not in session edits AND in baseline → pre-existing dirt, ignore
  // Not in session edits AND not in baseline → another session's file, ignore
  return false
})
```

### Gotchas

1. **`appendFileSync` vs `appendFile`** — Use sync for hooks (hooks are fire-and-forget, async complicates exit). `appendFileSync` with `'utf-8'` encoding is atomic for lines under OS page size (~4KB) on Linux.

2. **Git root vs project root** — They're usually the same, but in monorepos or eval fixtures they diverge. Always use `git rev-parse --show-toplevel` for path normalization, NOT `findProjectDir()`.

3. **`edits.jsonl` doesn't exist yet** — `readEditsSet()` must handle missing file gracefully (return empty Set). Same for `baseline.json`.

4. **Bash pre-snapshot file** — Only one `bash-pre-snapshot.txt` per session at a time. This is fine because hooks are serial within a session (Claude Code doesn't fire PreToolUse for a second Bash while the first is still running).

5. **hookHandlers dispatch** — The current `hookHandlers` map routes by hook CLI name (`'mode-gate'`, `'task-deps'`, etc.). PostToolUse needs its own entry: `'post-tool-use': handlePostToolUse`. The settings.json `command` field determines which name is used.

6. **Session dir lookup in hooks** — Hooks receive `session_id` in stdin. Use `getSessionsDir()` + `session_id` to construct the session dir path. Don't rely on `getCurrentSessionId()` (mtime-based scan) in hooks — use the explicit ID from stdin.

7. **Error handling: silent fallback, never throw** — PostToolUse hooks must never exit non-zero or throw unhandled exceptions. If `git rev-parse --show-toplevel` fails (not a git repo), `appendFileSync` fails (permissions, disk full), or session dir doesn't exist yet — wrap in try/catch, log to stderr, and return gracefully. A tracking failure should never block the user's tool execution. Same for stop-condition reads: if `edits.jsonl` or `baseline.json` is corrupt, treat as empty (fall back to global behavior).

8. **Cache `git rev-parse --show-toplevel`** — `toGitRelative()` shells out on every call. Since git root doesn't change mid-process, cache it at module level: `let cachedGitRoot: string | undefined`. This avoids ~5-15ms per PostToolUse invocation.

9. **PreToolUse latency for Bash snapshots** — B3's `git status --porcelain` runs in the PreToolUse hot path before suspicious Bash commands. In large repos this can add 100-300ms of user-visible latency before `sed`, `cp`, etc. Acceptable for v1, but document as a known trade-off. If it becomes a problem, the snapshot can be moved to PostToolUse entirely (diff working tree against HEAD instead of against a pre-snapshot).

10. **Rename entries in `git status --porcelain`** — Renamed files output as `R  old -> new`. The `line.slice(3)` approach yields `old -> new` as one string. Use `parseGitStatusPaths()` helper to split on ` -> ` and return both paths. This applies to baseline capture, committed check, and Bash snapshot diffing.

### Reference Docs
- [Claude Code Hooks](https://docs.anthropic.com/en/docs/claude-code/hooks) — PostToolUse event documentation, stdin/stdout format
- `src/commands/hook.ts:264-329` — existing PreToolUse handler pattern to follow
- `src/state/writer.ts:17-31` — atomic write pattern (tmp + rename) for reference
- `src/commands/can-exit.ts:46-89` — current `checkGlobalConditions` to rewrite
- `planning/research/2026-04-17-post-tool-use-file-tracking.md` — full research findings
