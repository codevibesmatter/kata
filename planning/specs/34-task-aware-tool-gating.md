---
initiative: feat-task-aware-tool-gating
type: project
issue_type: feature
status: approved
priority: high
github_issue: 34
created: 2026-03-18
updated: 2026-03-18
phases:
  - id: p1
    name: "Carry labels to native task metadata"
    tasks:
      - "Thread subphase pattern labels through buildSpecTasks() into Task interface"
      - "Store labels in native task metadata via writeNativeTaskFiles()"
      - "Also carry labels from phase step definitions in buildPhaseTasks()"
      - "Unit tests: labels appear in native task JSON files"
  - id: p2
    name: "Task-type tool gating in mode-gate hook"
    tasks:
      - "Read active in_progress task and its labels in handleModeGate()"
      - "When labels include 'review', deny Write/Edit/NotebookEdit"
      - "Return clear denial message: 'REVIEW tasks are read-only'"
      - "Unit tests: mode-gate denies writes during review, allows during impl"
  - id: p3
    name: "Review evidence gate in task-evidence hook"
    tasks:
      - "Add review_evidence_path to kata.yaml schema (KataConfigSchema)"
      - "In handleTaskEvidence(), for review-labeled tasks, check evidence path exists"
      - "Implement evidence path check using readdirSync (check directory has files)"
      - "Hard deny (not advisory) when review evidence missing"
      - "Unit tests: task-evidence denies review completion without evidence, allows with"
  - id: p4
    name: "Eval scenario for task-type gating"
    tasks:
      - "Create eval scenario that enters implementation mode with a review phase"
      - "Assert Write/Edit blocked during review task"
      - "Assert review task completion blocked without evidence"
---

# Task-Aware Tool Gating

## Problem

Agents skip tasks (especially REVIEW phases) and write code when they should be reviewing. Current enforcement only blocks **completing** a blocked task via `task-deps`, but nothing prevents the agent from doing the wrong type of work for a given task.

### Current State

- `mode-gate` hook: blocks Write/Edit when no mode is active (default mode)
- `task-deps` hook: blocks completing a task when `blockedBy` tasks are incomplete
- `task-evidence` hook: advisory warning about uncommitted changes (always allows)
- Subphase patterns define `labels` (e.g., `[impl]`, `[test]`, `[review]`) but labels are not carried to native task metadata

### Desired State

- REVIEW tasks are fully read-only — Write/Edit/NotebookEdit denied
- REVIEW tasks cannot be completed without review evidence at a configured path
- Labels flow from subphase patterns through to native task metadata for hook consumption

## Behaviors

### B1: Labels carried to native task metadata

When `buildSpecTasks()` creates tasks from subphase patterns, the `labels` array from each pattern step is included in the `Task` interface and stored in native task `metadata.labels`.

**Acceptance criteria:**
- Native task JSON files include `metadata.labels: ["review"]` (or `["impl"]`, `["test"]`, etc.)
- `buildPhaseTasks()` also carries `labels` from phase step definitions if present
- Existing tasks without labels continue to work (empty array default)

### B2: Write/Edit blocked during review tasks

When `handleModeGate()` processes a PreToolUse event for Write/Edit/NotebookEdit:
1. Read all native tasks for the session
2. Find the task with `status: 'in_progress'`
3. If that task's `metadata.labels` includes `'review'`, deny the tool call

**Acceptance criteria:**
- Write/Edit/NotebookEdit denied with message: "REVIEW tasks are read-only. Use review-agent or kata review to produce review output."
- Bash commands that write files are NOT blocked (review agents need Bash for `kata review`)
- If no task is `in_progress` or task has no `review` label, allow normally
- Multiple `in_progress` tasks: deny if ANY has `review` label (parallel task execution is normal — the orchestrator may have spawned agents for other tasks while a review task is also active; the write block protects the orchestrator from writing during review regardless of what agents do)

### B3: Review evidence required for completion

When `handleTaskEvidence()` processes a TaskUpdate to `completed` for a review-labeled task:
1. Read `review_evidence_path` from `kata.yaml`
2. Check if a file exists at that path (glob pattern supported)
3. If no evidence file exists, hard deny the completion

**Acceptance criteria:**
- `review_evidence_path` added to KataConfigSchema (string, optional, no default — field is absent in new projects unless explicitly configured)
- When `review_evidence_path` is set: check for any file under that path using `readdirSync` (e.g., `.kata/reviews/` has at least one file)
- Deny message: "Review evidence not found at {path}. Run review-agent or kata review first."
- Non-review tasks: evidence check remains advisory (current behavior)
- When `review_evidence_path` is not set: skip evidence check entirely (backwards compat — no enforcement without explicit config)

### B4: Eval scenario validates enforcement

An eval scenario tests the full flow:
1. Agent enters implementation mode with a spec that has a review phase
2. During the review task, Write/Edit calls are blocked
3. Review task completion is blocked without evidence
4. After review evidence is produced (by review agent), completion is allowed

**Acceptance criteria:**
- Eval scenario `impl-review-gate` exists in `eval/scenarios/`
- Hook log shows at least one `mode-gate` deny with `tool: "Write"` or `tool: "Edit"` during review task
- Hook log shows at least one `task-evidence` deny for review task completion
- All tasks eventually complete (agent adapts to enforcement)

## Non-Goals

- Generic label-to-permissions mapping system (review-only for now)
- Blocking `TaskUpdate(status='in_progress')` on blocked tasks (separate issue)
- Stronger agent-wait messaging in stop hook (separate issue)
- Restricting test tasks to only test files
- Blocking Bash-based file writes (known enforcement gap — review agents need Bash for `kata review`. A determined agent could write files via Bash during review, but this is an acceptable trade-off vs. breaking review agent functionality)

## Implementation Phases

### Phase 1: Labels to metadata

**Files changed:**
- `src/commands/enter/task-factory.ts` — Add `labels` to `Task` interface, thread through `buildSpecTasks()` and `buildPhaseTasks()`, store in `NativeTask.metadata.labels`
- `src/validation/schemas.ts` — Already has `labels` in both `subphasePatternSchema` and `phaseTaskConfigSchema`. No schema changes needed.

**Key detail:** The `SubphasePattern` type already has `labels: string[]` and `phaseTaskConfigSchema` already has `labels: z.array(z.string()).optional().default([])`. The gap is only in the runtime code: `buildSpecTasks()` doesn't pass `patternItem.labels` into the created `Task`, and `writeNativeTaskFiles()` doesn't include labels in `metadata`.

### Phase 2: Mode-gate extension

**Files changed:**
- `src/commands/hook.ts` — Extend `handleModeGate()` to check active task labels

**Key detail:** `handleModeGate()` already has the session state. It needs to also call `readNativeTaskFiles(sessionId)`, find the `in_progress` task, and check `metadata.labels`. This adds a file read to every PreToolUse event for Write/Edit tools, but only when a mode is active.

**Performance note:** `readNativeTaskFiles()` reads all task JSON files from disk. For a typical session with 10-20 tasks, this is fast (~1ms). The hook already reads session state from disk, so one more read is acceptable. Caching is explicitly deferred — hooks are stateless processes, so caching would require IPC or file-based cache, adding complexity for minimal gain at this scale.

### Phase 3: Task-evidence extension

**Files changed:**
- `src/config/kata-config.ts` — Add `review_evidence_path` to schema
- `batteries/kata.yaml` — Add default `review_evidence_path`
- `src/commands/hook.ts` — Extend `handleTaskEvidence()` to hard-gate review tasks

**Key detail:** `handleTaskEvidence()` currently always returns `permissionDecision: 'allow'`. For review-labeled tasks, it should return `'deny'` when evidence is missing. The hook needs to read kata.yaml to get the evidence path, then check if files exist there.

### Phase 4: Eval scenario

**Files changed:**
- `eval/scenarios/impl-review-gate.ts` — New scenario
- `eval/assertions.ts` — New assertions if needed

## Test Plan

### Unit Tests

1. **task-factory labels**: Verify `buildSpecTasks()` and `buildPhaseTasks()` produce tasks with correct labels in metadata
2. **mode-gate review block**: Mock hook input with Write tool + review task in_progress → deny
3. **mode-gate impl allow**: Mock hook input with Write tool + impl task in_progress → allow
4. **mode-gate no task**: Mock hook input with Write tool + no in_progress task → allow
5. **task-evidence review deny**: Mock hook input with review task completion + no evidence → deny
6. **task-evidence review allow**: Mock hook input with review task completion + evidence exists → allow
7. **task-evidence non-review**: Mock hook input with impl task completion → allow (advisory only)

### Eval Scenario

- `impl-review-gate`: Agent enters implementation, hits review phase, Write blocked, must use review-agent, evidence required for completion

## Verification Plan

### VP1: Labels in metadata
Steps:
1. Enter implementation mode with a spec that uses `impl-test-review` subphase pattern:
   ```bash
   kata enter implementation --issue=N
   ```
2. Read a native task file for a review step:
   ```bash
   cat ~/.claude/tasks/<session-id>/*.json | jq 'select(.metadata.originalId | test("review$"))'
   ```
   Expected: `metadata.labels` contains `["review"]`
3. Read a native task file for an impl step:
   ```bash
   cat ~/.claude/tasks/<session-id>/*.json | jq 'select(.metadata.originalId | test("impl$"))'
   ```
   Expected: `metadata.labels` contains `["impl"]`

### VP2: Write blocked during review
Steps:
1. Set a review task to `in_progress` in the native task file:
   ```bash
   # Edit the review task JSON: set "status": "in_progress"
   ```
2. Trigger mode-gate hook with Write tool input:
   ```bash
   echo '{"session_id":"<sid>","tool_name":"Write","tool_input":{"file_path":"test.ts","content":"x"}}' | kata hook mode-gate
   ```
   Expected: `"permissionDecision":"deny"` with reason mentioning "REVIEW tasks are read-only"
3. Trigger mode-gate hook with Read tool input (should still be allowed):
   ```bash
   echo '{"session_id":"<sid>","tool_name":"Read","tool_input":{"file_path":"test.ts"}}' | kata hook mode-gate
   ```
   Expected: `"permissionDecision":"allow"`

### VP3: Evidence gate
Steps:
1. Configure `review_evidence_path` in kata.yaml:
   ```bash
   # Add to kata.yaml: review_evidence_path: ".kata/reviews/"
   ```
2. Trigger task-evidence hook for review task completion without evidence:
   ```bash
   echo '{"session_id":"<sid>","tool_name":"TaskUpdate","tool_input":{"taskId":"5","status":"completed"}}' | kata hook task-evidence
   ```
   Expected: `"permissionDecision":"deny"` with reason mentioning "Review evidence not found"
3. Create evidence file and retry:
   ```bash
   mkdir -p .kata/reviews && echo "review output" > .kata/reviews/review-1.md
   echo '{"session_id":"<sid>","tool_name":"TaskUpdate","tool_input":{"taskId":"5","status":"completed"}}' | kata hook task-evidence
   ```
   Expected: `"permissionDecision":"allow"`
