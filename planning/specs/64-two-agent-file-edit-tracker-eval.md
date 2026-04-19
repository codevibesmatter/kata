---
initiative: two-agent-file-edit-tracker-eval
type: project
issue_type: feature
status: approved
priority: medium
github_issue: 64
created: 2026-04-17
updated: 2026-04-17
phases:
  - id: p1
    name: "Harness — agents[] support + session-ID-aware state lookup"
    tasks:
      - "Add AgentSpec type and optional agents?: AgentSpec[] to EvalScenario (discriminated with prompt?: string). fixtureSetup already exists on EvalScenario (eval/harness.ts:83) and is reused unchanged."
      - "Enforce runtime invariant in runScenario: throw if both prompt and agents are set or if neither is set"
      - "Guard existing scenario.prompt callers in runScenario with `if (scenario.prompt)` to satisfy the now-optional field"
      - "Capture scenarioStartSha = `git rev-parse HEAD` after fixtureSetup completes and before any agent is spawned; attach it to the EvalContext so checkpoint closures can read ctx.startSha"
      - "Implement Promise.allSettled branch in runScenario to spawn one query() per AgentSpec and capture per-agent outcomes"
      - "Add optional sessionId parameter to getSessionState; default remains latest-by-updatedAt"
      - "Write per-agent transcripts as agent-<idx>.jsonl under the scenario transcript dir to avoid append collisions"
    test_cases:
      - id: tc1
        description: "EvalScenario with agents[] spawns two concurrent query() calls and writes two distinct transcripts"
        type: "integration"
      - id: tc2
        description: "getSessionState(projectDir, sessionId) returns the requested session; getSessionState(projectDir) returns latest-by-updatedAt"
        type: "unit"
  - id: p2
    name: "Assertions — two-commits + scoped-commit assertions"
    tasks:
      - "Add assertTwoCommitsSinceStart() to eval/assertions.ts — uses `git rev-list --count --no-merges <startSha>..HEAD` and asserts count == 2"
      - "Add assertCommitsScopedToEachSession() (no session argument) — scans .kata/sessions/ for sessions started within the scenario window, resolves each session's commit by file-set intersection, and asserts subset containment against each session's edits.jsonl plus a framework-file allowlist"
      - "Unit-test both assertions following the existing mock EvalContext pattern in eval/assertions.test.ts, backed by a real temp git repo (fs.mkdtempSync + git init + controlled commits) that simulates two sessions with disjoint edits.jsonl sets"
    test_cases:
      - id: tc1
        description: "assertCommitsScopedToEachSession passes when each session's matched commit files ⊆ edits.jsonl ∪ allowlist and fails with a readable diagnostic when a foreign file is present"
        type: "unit"
      - id: tc2
        description: "assertTwoCommitsSinceStart passes when exactly two non-merge commits exist after scenario-start SHA and fails on 0/1/3+"
        type: "unit"
      - id: tc3
        description: "assertCommitsScopedToEachSession fails with a diagnostic listing candidate commits when a session's edits.jsonl intersects zero or multiple commits"
        type: "unit"
      - id: tc4
        description: "assertCommitsScopedToEachSession treats ALLOWLIST entries as globs (e.g., *.tsbuildinfo matches src/api.tsbuildinfo) rather than literal strings"
        type: "unit"
      - id: tc5
        description: "assertTwoCommitsSinceStart ignores merge commits (two feature commits + one merge => still passes)"
        type: "unit"
      - id: tc6
        description: "assertCommitsScopedToEachSession drops stale session dirs whose enteredAt is older than ctx.startSha timestamp"
        type: "unit"
      - id: tc7
        description: "assertCommitsScopedToEachSession fails with a readable diagnostic naming the foreign path when a commit contains a file not in its session's edits.jsonl"
        type: "unit"
  - id: p3
    name: "Scenario wiring"
    tasks:
      - "Create eval/scenarios/two-agent-tracker.ts with two simple natural-language prompts touching disjoint files"
      - "Add scenario-level fixtureSetup that runs `bun install` before either agent starts so neither agent triggers a lockfile-modifying install"
      - "Register scenario in the scenario index so --list and --scenario discover it"
      - "Compose checkpoints from workflowPresets('task') (adapted per agent) plus assertTwoCommitsSinceStart() and assertCommitsScopedToEachSession()"
    test_cases:
      - id: tc1
        description: "npm run eval -- --scenario=two-agent-tracker completes both agents and all checkpoints pass"
        type: "smoke"
---

# Two-Agent File-Edit Tracker Eval

> GitHub Issue: [#64](https://github.com/codevibesmatter/kata-wm/issues/64)

## Overview

The file-edit tracker (commit `b5d2c95`) scopes the `committed` stop-condition per-session so that one kata session does not see another session's in-flight dirty files as "uncommitted changes." Unit tests cover the primitives, but no eval exercises the multi-agent path end-to-end. This spec adds an eval scenario that drives **two real concurrent Claude agents** through `task` mode on disjoint files and asserts each commit contains only its own session's edits — the real proof that the tracker works under concurrency. The spec also extends the eval harness with a small `agents[]` affordance and a session-ID-aware state lookup so future concurrent scenarios can reuse the plumbing.

## Feature Behaviors

### B1: Harness supports agents[] for concurrent scenarios

**Core:**
- **ID:** harness-agents-array
- **Trigger:** A scenario definition has a non-empty `agents` array (as opposed to the existing top-level `prompt`)
- **Expected:** The harness spawns one SDK `query()` call per entry in `agents` via `Promise.allSettled`. All agents share the same `cwd` (the scenario project dir) and the same `.claude/settings.json` (so kata hooks fire for each), but each agent acquires its own kata session via its independent `kata enter task` invocation. The harness waits for all agents to settle (resolved or rejected) before evaluating checkpoints. Single-agent scenarios using the existing top-level `prompt` field are unchanged. `prompt` and `agents` are mutually exclusive; `runScenario` enforces a runtime invariant — it throws `Error("EvalScenario must define exactly one of prompt or agents")` before fixture setup if both are set or neither is set.
- **Verify:** Run the two-agent-tracker scenario with `--verbose`; logs show two concurrent `query()` invocations starting within the same second and two session directories appearing under `.kata/sessions/`. A unit test confirms the Promise.allSettled path is taken when `agents` is populated. If either agent rejects, the harness reports the rejection in the per-agent transcript summary and marks the scenario failed, but still runs checkpoint assertions against whatever session data exists so diagnostics survive a single-agent crash. A second unit test confirms the mutual-exclusivity invariant throws when both `prompt` and `agents` are set and when neither is set.
- **Source:** `eval/harness.ts:52-84` (EvalScenario), `eval/harness.ts:331` (query call), `eval/harness.ts:159-226` (fixture copy/isolation)

#### UI Layer
N/A — harness-level change.

#### API Layer
`EvalScenario` interface (in `eval/harness.ts`) gains:
```ts
interface AgentSpec {
  prompt: string;
  maxTurns?: number;
  sessionIdHint?: string; // optional label used only for transcript filenames
}
interface EvalScenario {
  // ...existing fields...
  prompt?: string;       // single-agent mode (existing scenarios)
  agents?: AgentSpec[];  // multi-agent mode — harness runs all agents concurrently via Promise.allSettled
  // runtime invariant: exactly one of `prompt` or `agents` must be set; runScenario throws otherwise
}
```

#### Data Layer
Transcript writer produces `eval-transcripts/<scenario-id>-<ts>/agent-<idx>.jsonl` per agent instead of a single transcript file. No changes to `.kata/sessions/` layout.

---

### B2: Session state lookup accepts explicit session ID

**Core:**
- **ID:** session-state-by-id
- **Trigger:** An assertion or harness helper needs the `SessionState` for a *specific* session rather than the most-recently-updated one
- **Expected:** `getSessionState(projectDir, sessionId?)` accepts an optional `sessionId` parameter. When provided, it reads `.kata/sessions/<sessionId>/state.json` directly. When omitted, it preserves existing behavior (latest-by-updatedAt scan of `.kata/sessions/`). All existing callers keep working without modification because the new parameter is optional.
- **Verify:** Unit test in `eval/harness.test.ts` asserts both code paths: default returns latest, explicit ID returns that specific session's state even when it is not the latest.
- **Source:** `eval/harness.ts:528-555` (existing `getSessionState`)

#### UI Layer
N/A.

#### API Layer
```ts
function getSessionState(projectDir: string, sessionId?: string): SessionState | null;
```
Callers in new assertions pass the explicit ID obtained by scanning `.kata/sessions/` timestamps after both agents complete. Existing callers pass no second argument — no behavior change.

#### Data Layer
Reads `.kata/sessions/<sessionId>/state.json` (same file already produced by the state writer).

---

### B3: Two-agent file-edit tracker scenario + assertions

**Core:**
- **ID:** two-agent-tracker-scenario
- **Trigger:** `npm run eval -- --scenario=two-agent-tracker` (or inclusion in a full run)
- **Expected:** A scenario at `eval/scenarios/two-agent-tracker.ts` defines two agents with disjoint-file prompts (e.g., "Add a utility function to src/utils/foo.ts that returns 42" and "Add a utility function to src/utils/bar.ts that returns 'hello'"), fixture `tanstack-start`, with scenario-level `fixtureSetup: ['bun install']` to pre-populate dependencies so neither agent triggers a lockfile-modifying install at runtime. Both agents enter `task` mode via the planning/user-prompt hook nudges, edit their respective files, commit, and exit. Checkpoints include task-mode workflow basics for each agent plus two new assertions: `assertTwoCommitsSinceStart()` confirms exactly two non-merge commits exist relative to the scenario-start SHA (using `git rev-list --count --no-merges <startSha>..HEAD`; >2 commits from `--amend`-induced SHA churn or auto-formatter commits fails loudly — this is intentional, each agent should produce exactly one commit), and `assertCommitsScopedToEachSession()` (no caller-supplied session ID) resolves each session's commit internally and confirms the commit's changed file-set is a subset of that session's `edits.jsonl` ∪ a small framework-file allowlist. Intentionally removing the session-scoping in `src/commands/can-exit.ts` causes `assertCommitsScopedToEachSession` to fail with a diagnostic listing the foreign file(s).
- **Matching algorithm:** For each session S with edits set E_S, find the set of commits C_S where `git show --name-only <commit>` ∩ E_S is non-empty. Assert |C_S| == 1. Call that commit the session's commit. Then assert `files(commit) ⊆ E_S ∪ ALLOWLIST` where `ALLOWLIST = ['bun.lockb', 'bun.lock', 'package-lock.json', '*.tsbuildinfo']`. ALLOWLIST entries are matched as **globs** via minimatch-style pattern matching (so `*.tsbuildinfo` matches `src/api.tsbuildinfo`), not strict string equality. If |C_S| ≠ 1 for any session, the assertion fails with a diagnostic listing the candidate commits.
- **Verify:** Scenario passes locally with all checkpoints green. Fault injection (temporarily removing the session filter in `checkGlobalConditions`) causes at least one agent's can-exit to be blocked, and/or `assertCommitsScopedToEachSession` fails with a readable diagnostic.
- **Source:** `eval/scenarios/two-agent-tracker.ts` (new), `eval/assertions.ts` (new assertions), `src/commands/can-exit.ts:47-116` (code under test), `src/tracking/edits-log.ts` (edits.jsonl format)

#### UI Layer
N/A.

#### API Layer
Two new exports from `eval/assertions.ts`:
```ts
assertTwoCommitsSinceStart(): EvalCheckpoint;
assertCommitsScopedToEachSession(): EvalCheckpoint;
```
Neither is added to a preset — they are specific to this scenario and are spread inline in the scenario's `checkpoints`. `assertCommitsScopedToEachSession` takes no arguments: it discovers sessions at checkpoint-evaluation time by scanning `ctx.projectDir/.kata/sessions/` for state.json files whose `enteredAt` is ≥ the scenario-start timestamp (dropping any stale sessions from prior runs of the same `--project` dir), and matches each session to its commit via the algorithm above.

#### Data Layer
Reads `.kata/sessions/<sessionId>/edits.jsonl` (written by `PostToolUse` hook via `appendEdit` in `src/tracking/edits-log.ts`). Reads git history via `git log <start-sha>..HEAD --format=%H` and `git show --name-only <sha>` to compare against the edits set.

---

## Non-Goals

Explicitly out of scope for this feature:
- Modifying the file-edit tracker implementation in any way — the tracker landed in commit `b5d2c95` and is complete; if this eval surfaces a bug, file a separate issue rather than patching in this spec
- Testing `baseline.json` capture/honoring behavior — already covered by unit tests in `src/tracking/edits-log.test.ts` and `src/commands/can-exit.test.ts`
- Testing Bash-derived edit tracking (`sed`, `cp`, shell redirection) — covered by tracker unit tests
- Testing overlap on shared files between two sessions — merge/conflict concerns are orthogonal to the tracker scoping mechanism under test here
- Testing cross-mode interaction (e.g., one agent in `task`, another in `debug`) — single-mode with two agents is sufficient to prove the scoping mechanism
- Adding per-session `hooks.log.jsonl` parsing in assertions — append-only writes from two processes may interleave; acceptable for v1 since no assertion depends on per-session hook lines
- Changing the LLM-as-judge pipeline — existing `--judge[=provider]` flag applies if the user opts in; no special handling needed

## Resolved Questions

- [x] **Per-agent `fixtureSetup` commands?** No. v1 uses scenario-level `fixtureSetup` only. If a future scenario needs per-agent setup, add `AgentSpec.fixtureSetup?: string[]` in a follow-up.
- [x] **Lockfile / dependency collision between agents?** Pre-install dependencies in scenario-level `fixtureSetup` (`bun install`) before either agent runs, so neither agent triggers a lockfile-modifying install at runtime. The framework-file allowlist in `assertCommitsScopedToEachSession` (`bun.lockb`, `bun.lock`, `package-lock.json`, `*.tsbuildinfo`) provides a safety net if a stray install still occurs.

## Implementation Phases

See YAML frontmatter `phases:` above. Each phase is 1-3 hours of focused work.

### Phase 1: Harness — agents[] support + session-ID-aware state lookup

Tasks:
- Add `AgentSpec` type `{ prompt: string; maxTurns?: number; sessionIdHint?: string }` to `eval/harness.ts`.
- Extend `EvalScenario` with optional `prompt?: string` and optional `agents?: AgentSpec[]`. Document in the interface docstring that they are mutually exclusive; populate exactly one.
- At the top of `runScenario`, enforce the invariant: if both `scenario.prompt` and `scenario.agents` are set, or if neither is set, throw `Error("EvalScenario must define exactly one of prompt or agents")` before any fixture setup.
- Guard existing callers that read `scenario.prompt` with `if (scenario.prompt)` since the field is now optional at the type level.
- In `runScenario`, branch on `scenario.agents`:
  - If present and non-empty: build `AgentSpec[]` into concurrent `query()` calls via `Promise.allSettled`. Each agent gets its own transcript file `agent-<idx>.jsonl` inside the scenario transcript dir. After `allSettled` resolves, record per-agent outcome (fulfilled/rejected with reason) into the scenario transcript summary. Proceed to checkpoint evaluation even if one agent rejected, so assertions can run against whatever session data exists.
  - Else: existing single-agent code path is unchanged.
- Add optional `sessionId?: string` parameter to `getSessionState(projectDir, sessionId?)`. When provided, read `.kata/sessions/<sessionId>/state.json` directly. When absent, use existing latest-by-updatedAt logic.
- Ensure multi-agent transcript writing does not interleave between the two streams. Per-agent files solve this cleanly.

Verification:
- `bun run typecheck` passes.
- A unit test (or harness integration test) instantiates an `EvalScenario` with two trivial agents and confirms two transcript files appear and both agents' `query()` calls execute concurrently.
- Existing scenarios (using top-level `prompt`) continue to pass unchanged.

### Phase 2: Assertions — two-commits + scoped-commit assertions

Tasks:
- Add `assertTwoCommitsSinceStart(): EvalCheckpoint` to `eval/assertions.ts`. Implementation:
  - Read `ctx.startSha` — captured in Phase 1 by the harness immediately after `fixtureSetup` completes and before any agent spawns. Existing assertions like `assertDiffContains` use the root commit instead; the scenario-start SHA is new and must be added to the checkpoint context in Phase 1.
  - `git rev-list --count --no-merges <ctx.startSha>..HEAD` → parse integer; fail if not exactly 2. Merge commits are excluded. Contract: agents in this scenario must produce exactly one commit each; `--amend`-induced SHA churn or auto-formatter commits that push the count above 2 fail loudly by design.
- Add `assertCommitsScopedToEachSession(): EvalCheckpoint` (no arguments):
  - Scan `ctx.projectDir/.kata/sessions/` for session directories; read each `state.json`.
  - Filter to sessions whose `enteredAt` is ≥ the scenario-start timestamp (drop stale sessions from prior runs of the same `--project` dir).
  - For each surviving session S, read its `edits.jsonl` via `readEditsSet` from `src/tracking/edits-log.ts` → set E_S.
  - Resolve S's commit: enumerate candidate SHAs from `git rev-list --no-merges <startSha>..HEAD`; for each SHA, `git show --name-only <sha>` gives its file-set F. Collect C_S = { sha : F ∩ E_S ≠ ∅ }. Assert |C_S| == 1; if 0 or ≥ 2, fail with a diagnostic listing the candidate SHAs and their file-sets.
  - For the matched commit, assert `files(commit) ⊆ E_S ∪ ALLOWLIST` where `ALLOWLIST = ['bun.lockb', 'bun.lock', 'package-lock.json', '*.tsbuildinfo']`. On failure, print the foreign path(s) and the session ID.
  - Assert every filtered session has exactly one matched commit (so the set of matched commits across sessions equals the set of commits from `assertTwoCommitsSinceStart`).
- Add unit tests to `eval/assertions.test.ts` following the existing mock `EvalContext` pattern in that file. Back the git-facing tests with a real temporary git repo (`fs.mkdtempSync` + `git init` + controlled commits via `git commit --allow-empty` and small file writes) rather than process-level mocks — this mirrors the existing pattern and avoids reinventing fixture infrastructure:
  - Subset case (two sessions, two commits, disjoint files) → passes.
  - Foreign file in one commit → fails with readable diagnostic naming the foreign path.
  - Session's edits.jsonl intersects zero commits → fails with a candidate-list diagnostic.
  - Session's edits.jsonl intersects multiple commits → fails with a candidate-list diagnostic.
  - Exactly two non-merge commits since start → `assertTwoCommitsSinceStart` passes.
  - Three commits → `assertTwoCommitsSinceStart` fails.
  - Two commits plus a merge commit → `assertTwoCommitsSinceStart` still passes (merges excluded).

Verification:
- `bun test eval/assertions.test.ts` — all existing tests plus the four new cases pass.
- `bun run typecheck` passes.

### Phase 3: Scenario wiring

Tasks:
- Create `eval/scenarios/two-agent-tracker.ts`:
  ```ts
  import type { EvalScenario } from '../harness';
  import {
    assertTwoCommitsSinceStart,
    assertCommitsScopedToEachSession,
  } from '../assertions';

  export const twoAgentTracker: EvalScenario = {
    id: 'two-agent-tracker',
    name: 'Two-agent file-edit tracker',
    fixture: 'tanstack-start',
    // Pre-install deps so neither agent triggers a lockfile-modifying install at runtime.
    fixtureSetup: ['bun install'],
    agents: [
      { prompt: "Add a utility function to src/utils/foo.ts that returns 42." },
      { prompt: "Add a utility function to src/utils/bar.ts that returns 'hello'." },
    ],
    checkpoints: [
      assertTwoCommitsSinceStart(),
      assertCommitsScopedToEachSession(),
    ],
  };
  ```
  Both new assertions discover sessions and commits at checkpoint-evaluation time — no per-agent session ID needs to be threaded through the scenario definition.
- Register the scenario in the scenario index (same file that currently exports the scenario map used by `--list`).
- Run `npm run eval -- --scenario=two-agent-tracker --verbose` once and confirm all checkpoints pass.

Verification:
- Scenario runs end-to-end; both transcripts written; all checkpoints pass.
- `--list` shows `two-agent-tracker` in the scenario list.
- Fault-injection run (temporarily removing session filter in `src/commands/can-exit.ts` `checkGlobalConditions`) causes `assertCommitsScopedToEachSession` to fail — proving the eval actually measures the tracker behavior.

## Verification Strategy

### Test Infrastructure
- Unit tests: Bun's test runner discovers `.test.ts` files alongside source. Existing files extend: `eval/assertions.test.ts` (mock-based assertion tests) and `eval/harness.test.ts` (or new file for `getSessionState` coverage).
- End-to-end: `npm run eval -- --scenario=two-agent-tracker` runs the scenario against a fresh `tanstack-start` fixture copy under `eval-projects/two-agent-tracker-<ts>/`.

### Build Verification
Use `bun run typecheck` to confirm types compile. No build step is required for this project (see CLAUDE.md: "The `kata` shell script at the repo root is the CLI entry point. It runs `bun src/index.ts` directly").

## Verification Plan

Concrete, executable steps to verify the feature works against the REAL running system.

### VP1: Scenario runs and passes

Steps:
1. `cd /data/projects/kata-wm && npm run eval -- --scenario=two-agent-tracker --verbose`
   Expected: exit code 0; stdout shows both agents starting concurrently; stdout includes `PASSED` for each checkpoint; a directory `eval-transcripts/two-agent-tracker-<ts>/` contains `agent-0.jsonl` and `agent-1.jsonl`.
2. `ls eval-projects/two-agent-tracker-*/\.kata/sessions/ | wc -l`
   Expected: 2 (one session dir per agent).
3. `cd eval-projects/two-agent-tracker-<ts> && git rev-list --count --no-merges <scenarioStartSha>..HEAD`
   Expected: prints exactly `2`. `git log --oneline <scenarioStartSha>..HEAD` shows one commit touching `src/utils/foo.ts` only and one touching `src/utils/bar.ts` only (modulo files in the `ALLOWLIST`).

### VP2: Tracker scoping is actually what's being proven (fault injection)

Steps:
1. Temporarily edit `src/commands/can-exit.ts` `checkGlobalConditions` (lines 47-116) so that the `committed` check uses the full working tree status instead of filtering to session edits — simulating pre-tracker behavior. Save.
2. `cd /data/projects/kata-wm && bun run eval -- --scenario=two-agent-tracker`
   Expected: the run fails — either at least one agent's `kata can-exit` is blocked by the other agent's in-flight dirty files (scenario times out or exits with a can-exit failure), or `assertCommitsScopedToEachSession` fails with a diagnostic showing which foreign path leaked into the commit.
3. Revert the edit to `src/commands/can-exit.ts`.
4. `cd /data/projects/kata-wm && bun run eval -- --scenario=two-agent-tracker`
   Expected: exit code 0; all checkpoints pass again.

### VP3: getSessionState by ID

Steps:
1. `cd /data/projects/kata-wm && bun test eval/harness.test.ts -t "getSessionState accepts sessionId"`
   Expected: test passes; output confirms both default (latest-by-updatedAt) and explicit-id paths return the correct `SessionState` object.
2. `cd /data/projects/kata-wm && bun run typecheck`
   Expected: exit code 0.

## Implementation Hints

### AgentSpec shape

Start minimal:
```ts
interface AgentSpec {
  prompt: string;
  maxTurns?: number;
  sessionIdHint?: string; // for transcript filename disambiguation only
}
```
The kata session ID is produced by each agent's own `kata enter task` invocation at runtime; callers do not supply it.

### Transcript isolation

Per-agent transcripts as `eval-transcripts/<scenario-id>-<ts>/agent-<idx>.jsonl` avoid append collisions that would occur if both agents streamed to the same file. The scenario transcript dir continues to hold any aggregate summary.

### Session and commit discovery for assertions

`assertCommitsScopedToEachSession` does not accept a session ID. At checkpoint time it scans `ctx.projectDir/.kata/sessions/`, reads each `state.json`, and filters to sessions whose `enteredAt` ≥ the scenario-start timestamp (captured by the harness at fixture-setup time). This drops any stale sessions left behind by a prior run against the same `--project` dir.

For each surviving session S with edits set E_S, resolve its commit via the intersection algorithm: walk `git rev-list --no-merges <startSha>..HEAD`, compute F = `git show --name-only <sha>` for each, and collect candidate SHAs where F ∩ E_S ≠ ∅. Assert exactly one candidate; otherwise fail with a diagnostic listing all candidates and their file-sets. Finally assert `F ⊆ E_S ∪ ALLOWLIST` where `ALLOWLIST = ['bun.lockb', 'bun.lock', 'package-lock.json', '*.tsbuildinfo']`.

This approach removes the need to thread per-agent session IDs through the scenario definition or to correlate agent transcripts with session directories.

### Unit-test git fixtures

Follow the existing mock `EvalContext` pattern in `eval/assertions.test.ts`. For the new assertions, the git-facing cases should drive a real temporary git repo rather than stub out `child_process` — create a dir with `fs.mkdtempSync`, run `git init`, make a starter commit, then stage controlled file writes and commit them to produce a deterministic history. Synthesize `.kata/sessions/<id>/edits.jsonl` files inside that temp dir. This mirrors the style already used in the file and avoids inventing a new mocking layer.

### Git index.lock contention between concurrent agents

Both agents eventually run `git add` + `git commit` in the same working tree. Git's own per-repo `.git/index.lock` serializes concurrent commits at the filesystem level: the second writer sees `fatal: Unable to create '.../.git/index.lock': File exists` and exits non-zero. In practice, agent completion times differ by seconds (different prompts, different tool-use sequences), so collisions are rare. Do **not** add retry logic in the harness for v1. If flakiness appears in CI, the first mitigation is to have each agent's task-mode commit ceremony retry once after a short jitter on `index.lock` detection (tracked as a follow-up, not this spec).

### Shared hooks.log.jsonl

Both agents' hooks will append to the same `.kata/hooks.log.jsonl`. Writes from two Node processes may interleave within a single line in pathological cases. This is acceptable for v1 because **no assertion in this spec parses per-session lines from `hooks.log.jsonl`** — everything needed is in per-session `.kata/sessions/<id>/edits.jsonl`, which is session-scoped by path and therefore collision-free. Note this limitation in a code comment next to the harness multi-agent branch.

### Prompts must be simple

Per project memory and spec 8 ("Simple natural-language prompts"): prompts describe the task in plain English. Do not include `kata enter task` or answer AskUserQuestion prompts. Let the `user-prompt` and `SessionStart` hooks nudge each agent into task mode. If the task-mode skill asks the agent a question, the existing pause/resume mechanism (`--resume=<session_id> --answer=...`) handles it — but for prompts this small, no pause is expected.

### Do not change the tracker

The tracker implementation (`src/tracking/edits-log.ts`, `handlePostToolUse` in `src/commands/hook.ts:1001-1057`, `checkGlobalConditions` in `src/commands/can-exit.ts:47-116`, `checkFeatureTestsAdded` in `src/commands/can-exit.ts:181-221`, `captureBaseline` in `src/commands/enter.ts`) is out of scope. If the eval surfaces a real bug, file a separate issue.

### Reference Docs

- `eval/harness.ts` — scenario runner, fixture copy, query integration
- `eval/assertions.ts` — preset arrays, `assertNewCommit`, `assertDiffContains`, `assertChangesPushed`
- `src/tracking/edits-log.ts` — `appendEdit`, `readEditsSet`, `parseGitStatusPaths`, `toGitRelative`
- `src/commands/can-exit.ts:47-116` — the scoping logic under test
- `planning/specs/8-eval-harness-redesign.md` — the eval design principles this spec builds on

---

<!-- Spec for issue #64: Two-agent file-edit tracker eval -->
