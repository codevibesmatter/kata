# Upstream Main Changes Review

**Date:** 2026-04-11  
**Branch:** `feature/42-skills-based-methodology` vs `origin/main`  
**Merge base:** `13988a0`

## Context

This branch has 30 commits implementing the skills-based methodology (#42, #44, #46) — thin wiring templates with `$ref`/`stage`/`expansion`/`skill`, step-library, rules-based context injection, and doc_created stop conditions.

Main has 5 commits since divergence, applied directly while this branch was in flight.

## Upstream Commits (oldest → newest)

### 1. `83c6604` — test_command_changed placeholder

**What:** New `{test_command_changed}` placeholder for scoped mid-phase test runs (e.g., `vitest --changed`). Falls back to `{test_command}` when unset.

**Files:** `src/commands/enter/placeholder.ts` (+3 lines), `placeholder.test.ts` (+14 lines), `batteries/kata.yaml` (comment), `batteries/templates/implementation.md` (gate change)

**Conflict risk:** LOW — placeholder.ts has a clean 1-line addition. Template conflicts are irrelevant since this branch rewrote all templates.

**Verdict: CHERRY-PICK the placeholder.ts change.** The impl template on this branch should already use `{test_command_changed}` in subphase gates — verify and add if missing.

---

### 2. `007be7e` — research doc: planning spec frontmatter failures

**What:** Documents root cause of validate-spec regex bug (commit 3 fixes it).

**Files:** `planning/research/2026-04-08-planning-spec-frontmatter-failures.md` (new)

**Conflict risk:** NONE — new file, no overlap.

**Verdict: SKIP.** The fix (commit 3) is what matters, not the research doc. This branch already removed old research docs from this era. Can optionally keep if we want the paper trail.

---

### 3. `59f52b3` — validate-spec js-yaml fix

**What:** Replaced fragile regex-based YAML parser in `validate-spec.ts` with proper `js-yaml` via `parseYamlFrontmatterWithError`. The old regex only matched quoted strings (`- "task"`), silently counting 0 tasks for unquoted strings (`- task`). Also added explicit `kata validate-spec` step to planning template.

**Files:** `src/commands/validate-spec.ts` (rewrite of parser), `batteries/templates/planning.md` (P4 step)

**Conflict risk:** MEDIUM — validate-spec.ts changes are self-contained. Planning template conflicts irrelevant (this branch rewrote it).

**Verdict: CHERRY-PICK the validate-spec.ts fix.** Real bug with real consequences — specs could pass validation with 0 tasks counted. The planning template change can be manually ported to this branch's thin-wiring planning template (add gate with `kata validate-spec`).

---

### 4. `cf95c25` — research doc: stop hook async agent compat

**What:** Documents the tension between kata's synchronous stop-hook/keepalive and Claude Code's async agent model. Identifies need for transcript-based detection.

**Files:** `planning/research/2026-04-10-stop-hook-async-agent-compat.md` (new)

**Conflict risk:** NONE — new file.

**Verdict: SKIP.** Same as commit 2 — the fix (commit 5) is what matters.

---

### 5. `0bde694` — smart stop hook (transcript scanning)

**What:** Instead of blocking exit with sleep-30 keepalive loops when background agents run, the stop hook now scans the session transcript JSONL for unmatched Agent `tool_use` calls (no matching `tool_result` = agent still active). When active agents detected, exit is allowed — trusting Claude's built-in agent completion notifications.

**Core addition:** `hasActiveBackgroundAgents(transcriptPath)` in `hook.ts` — parses transcript, tracks Agent tool_use IDs in a Set, removes on matching tool_result, returns true if any remain.

**Files:**
- `src/commands/hook.ts` — new function + integration in `handleStopConditions()` (+60 lines)
- `src/commands/hook.test.ts` — 8 tests for transcript scanning
- `src/commands/can-exit.ts` — simplified in-progress message (2 lines vs 7)
- `src/messages/stop-guidance.ts` — removed sleep-30 keepalive guidance

**Conflict risk:** 
- `hook.ts`: LOW — this branch only changed 1 line in hook.ts, the new function is additive
- `hook.test.ts`: NONE — new tests
- `can-exit.ts`: HIGH — this branch added ~70 lines (doc_created, stage-scoped conditions, phasesByStage). The in-progress message change is a small subset that needs manual merge.
- `stop-guidance.ts`: LOW — small deletion

**Verdict: CHERRY-PICK.** This is the most valuable upstream change — eliminates the sleep-30 antipattern entirely. The hook.ts function is cleanly additive. The can-exit.ts conflict is manageable since it's just the `allInProgress` message block that needs updating (our version still has the old sleep-30 text).

---

## Summary Matrix

| Commit | Feature | Cherry-pick? | Conflict risk | Value |
|--------|---------|-------------|---------------|-------|
| `83c6604` | test_command_changed | **YES** | Low | Medium |
| `007be7e` | Research: frontmatter | No | None | Low |
| `59f52b3` | validate-spec js-yaml | **YES** | Medium | High |
| `cf95c25` | Research: stop hook | No | None | Low |
| `0bde694` | Smart stop hook | **YES** | Med-High | High |

## Recommended Approach

**Cherry-pick 3 commits** in order: `83c6604`, `59f52b3`, `0bde694`.

Expected conflicts:
1. **`batteries/templates/*.md`** — resolve by keeping this branch's thin-wiring versions. Manually port any gate/step improvements (test_command_changed in impl subphase, validate-spec in planning P4).
2. **`src/commands/can-exit.ts`** — resolve by keeping this branch's additions (doc_created, stage-scoped) and applying upstream's simplified in-progress message.
3. **`batteries/kata.yaml`** — resolve by keeping this branch's version, add `test_command_changed` comment.

Alternatively, **rebase onto main** and resolve all conflicts at once — cleaner history but more conflict resolution in one pass.

## Not on Main (this branch only)

For context, this branch has features main doesn't:
- `$ref` step library system (`step-library.ts`, `batteries/steps.yaml`)
- Stage-scoped stop conditions (`stage: setup` / `stage: work`)
- `expansion: spec` / `expansion: agent` on phases
- `skill` field on phases for phase-level skill invocation
- `doc_created` stop condition with `deliverable_path`
- Rules-based context injection (`kata.yaml` orchestration rules)
- Research mode branching by research type
- 7 rewritten templates (thin-wiring format)
