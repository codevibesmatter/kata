---
initiative: feat-modular-templates
type: project
issue_type: feature
status: approved
priority: high
github_issue: 37
created: 2026-04-02
updated: 2026-04-02
supersedes: 35
phases:
  - id: p1
    name: "Schema + placeholder system"
    tasks:
      - "Extend phaseStepSchema with gate field (bash variant only)"
      - "Extend phaseStepSchema with hints array (read, bash, search, agent, skill, ask types)"
      - "Create placeholder resolution engine with two-source chain (session state + kata.yaml config)"
      - "Update templateYamlSchema to accept new gate/hint fields"
      - "Write unit tests for gate schema validation (bash gate type)"
      - "Write unit tests for hint schema validation (all six hint types)"
      - "Write unit tests for placeholder resolution chain (session > config)"
    test_cases:
      - id: gate-schema-valid
        description: "Gate with bash/expect parses without error"
        type: unit
      - id: gate-schema-exit
        description: "Gate with bash/expect_exit parses without error"
        type: unit
      - id: hint-schema-all-types
        description: "Hints array with all six types parses without error"
        type: unit
      - id: placeholder-session-state
        description: "{issue} resolves from session state"
        type: unit
      - id: placeholder-kata-config
        description: "{test_command} resolves from kata.yaml project config"
        type: unit
      - id: placeholder-chain-priority
        description: "Session state wins over kata.yaml config"
        type: unit
  - id: p2
    name: "Consolidated PreToolUse hook + gate evaluation"
    tasks:
      - "Consolidate mode-gate, task-deps, task-evidence, and gate-check into single handlePreToolUse handler"
      - "Implement bash gate evaluator (run command, check expect/expect_exit)"
      - "Add gate evaluation to TaskUpdate completion path (after dep check, before evidence check)"
      - "Update buildHookEntries() to register single PreToolUse hook instead of multiple"
      - "Add gate failure response format (permissionDecision: deny + retry hint)"
      - "Write unit tests for bash gate evaluator"
      - "Write integration test: gate blocks task completion when failing"
      - "Write unit tests for consolidated handler dispatch (mode-gate, deps, gates, evidence)"
    test_cases:
      - id: gate-bash-pass
        description: "Bash gate with matching expect returns allow"
        type: unit
      - id: gate-bash-fail
        description: "Bash gate with non-matching output returns deny with retry hint"
        type: unit
      - id: gate-bash-exit
        description: "Bash gate with expect_exit checks exit code"
        type: unit
      - id: consolidated-mode-gate
        description: "Single PreToolUse handler blocks writes when no mode active"
        type: unit
      - id: consolidated-dispatch
        description: "Single handler runs deps → gates → evidence in order for TaskUpdate"
        type: integration
  - id: p3
    name: "Inline subphases"
    tasks:
      - "Change subphase_pattern field to inline-only (remove string reference support)"
      - "Delete src/config/subphase-patterns.ts"
      - "Delete batteries/subphase-patterns.yaml"
      - "Remove loadSubphasePatterns() import and call from enter.ts"
      - "Update enter.ts to read subphase_pattern directly as array from template"
      - "Remove getProjectSubphasePatternsPath() from session/lookup.ts"
      - "Update phaseSchema to only accept array for subphase_pattern"
      - "Embed impl-test-review pattern inline in implementation.md frontmatter"
      - "Write unit tests for inline subphase parsing"
    test_cases:
      - id: inline-subphase-parse
        description: "Template with inline subphase_pattern array parses correctly"
        type: unit
      - id: string-ref-rejected
        description: "Template with string subphase_pattern reference is rejected by schema"
        type: unit
      - id: task-creation-inline
        description: "buildSpecTasks creates correct tasks from inline subphases"
        type: unit
  - id: p4
    name: "Interview skill"
    tasks:
      - "Define interview config format (YAML in .kata/interviews/ or batteries)"
      - "Create skill definition file for /interview command"
      - "Implement interview runner that executes AskUserQuestion calls"
      - "Return structured output from interview skill"
      - "Delete src/config/interviews.ts"
      - "Delete batteries/interviews.yaml"
      - "Write unit tests for interview config parsing"
      - "Write integration test: /interview requirements returns structured data"
    test_cases:
      - id: interview-config-parse
        description: "Interview YAML config with rounds and options parses correctly"
        type: unit
      - id: interview-structured-output
        description: "Interview skill returns structured answers object"
        type: unit
      - id: interview-missing-category
        description: "Interview skill with unknown category returns clear error"
        type: unit
  - id: p5
    name: "Template rewrite"
    tasks:
      - "Rewrite implementation.md with gates, hints, and inline subphases"
      - "Rewrite planning.md replacing interview prose with skill hints"
      - "Rewrite task.md with gates for preconditions"
      - "Rewrite research.md with typed hints"
      - "Rewrite freeform.md with minimal gates"
      - "Rewrite verify.md with formal verification gates"
      - "Rewrite debug.md with typed search/read hints"
      - "Rewrite stop-hook-test.md (test fixture, minimal changes)"
      - "Validate all rewritten templates parse against new schema"
    test_cases:
      - id: all-templates-parse
        description: "All 8 batteries templates parse against new templateYamlSchema"
        type: unit
      - id: impl-has-gates
        description: "implementation.md has gate on baseline and review steps"
        type: unit
      - id: planning-has-skill-hints
        description: "planning.md interview steps reference /interview skill in hints"
        type: unit
  - id: p6
    name: "Setup/update/migrate + batteries removal"
    tasks:
      - "Update kata setup to register consolidated PreToolUse hook in settings.json"
      - "Add kata_version field to KataConfigSchema (read from package.json)"
      - "Create src/commands/update.ts for upstream template merge"
      - "Remove batteries 2-tier lookup from resolveTemplatePath()"
      - "Remove batteries-backup logic"
      - "Create src/commands/migrate.ts with old-format detection and conversion"
      - "Detect old-format templates (no gate/hints fields in frontmatter)"
      - "Convert old phaseStepSchema instructions to hints + gates where possible"
      - "Convert string subphase_pattern references to inline arrays"
      - "Preserve custom instructions as-is (no lossy conversion)"
      - "Add --dry-run flag to preview migration"
      - "Update CLI dispatcher to add update/migrate commands"
      - "Update eval fixtures to new layout"
      - "Write unit tests for update, migrate, and setup commands"
    test_cases:
      - id: setup-registers-pretooluse
        description: "kata setup --yes produces settings.json with single consolidated PreToolUse hook"
        type: unit
      - id: update-preserves-custom
        description: "kata update keeps user-modified instructions, updates structure"
        type: unit
      - id: migrate-old-format
        description: "kata migrate converts old template format to new format"
        type: unit
      - id: detect-old-format
        description: "Old template without gates/hints detected as needing migration"
        type: unit
      - id: convert-preserves-instruction
        description: "Migration preserves original instruction text"
        type: unit
      - id: dry-run-no-write
        description: "kata migrate --dry-run shows changes without writing files"
        type: unit
---

# Modular Template System: Gates, Hints, and Formal Action Schema

> GitHub Issue: [#37](https://github.com/codevibesmatter/kata-wm/issues/37)
> Supersedes: [#35 -- Consolidated Config](./35-consolidated-config.md)
> Research: [2026-04-02-modular-template-system.md](../research/2026-04-02-modular-template-system.md)

## Overview

The template system encodes 125+ actions as unstructured prose in markdown instructions. Bash commands, tool calls, agent spawns, conditionals, and gates are all embedded in freeform text that agents must parse and interpret. Subphase patterns live in a separate YAML file with exactly one consumer. Interviews live in another separate file with zero programmatic callers. This spec replaces the template action model with a formal schema: **gates** (bash-only, enforced by a consolidated PreToolUse hook), **hints** (typed agent guidance), and **instructions** (prose for judgment calls). Subphase patterns move inline into template frontmatter. Interviews become a callable `/interview` skill. A new placeholder system resolves variables from session state and project config. All existing PreToolUse hooks (mode-gate, task-deps, task-evidence) are consolidated into a single handler alongside the new gate evaluation.

**Audience:** All kata users and template authors.

**Why now:** The #35 consolidated config spec proposed absorbing interviews and subphase patterns into kata.yaml, but review revealed the "shared registry" argument is hollow -- `loadInterviewConfig()` has zero callers, and `loadSubphasePatterns()` has exactly one. The real problem is unstructured actions in templates, not config file count.

## Non-Goals

- **Changing session state schema** -- `SessionStateSchema` in `src/state/schema.ts` is untouched except for adding a `stepOutputs` field for placeholder capture.
- **Changing native task format** -- `NativeTask` in `src/commands/enter/task-factory.ts` keeps its current shape. Gates and hints affect task *creation*, not task *storage*.
- **Multi-project manager** -- Out of scope. Single-project workflows only.
- **Three-way merge for templates** -- `kata update` uses file-level comparison (current matches old base = replace; current differs = skip with diff shown). No three-way merge.
- **Full execution engine** -- Gates are *checks* (pass/fail), not an orchestrator. The agent still drives all creative work. Gates block forward progress when preconditions fail; they do not sequence actions.
- **Agent or skill gate types** -- Only bash gates are implemented. Bash can shell out to any command (including `kata <skill>` or custom review scripts), so agent/skill gate types are deferred. LLM-as-judge quality gates can be added in a follow-up.
- **Step output capture** -- Cross-step placeholders (`{steps.<id>.output}`) are deferred. Placeholders resolve from session state and kata.yaml config only.
- **Changing stop hook mechanism** -- `stop_conditions` in `modes.yaml` stays as-is. Gates are per-step preconditions, not exit conditions.
- **Real-time gate evaluation during agent work** -- Gates fire at step boundaries (when the agent attempts to complete a task via TaskUpdate), not continuously during work.

## Feature Behaviors

### B1: Gate schema and enforcement

**Core:**
- **ID:** gate-schema-enforcement
- **Trigger:** Template step has a `gate` field; agent attempts to complete the step's native task via `TaskUpdate(status: "completed")`
- **Expected:** The `gate-check` PreToolUse hook evaluates the gate condition. If the gate passes, the TaskUpdate proceeds. If the gate fails, the hook returns `{ permissionDecision: "deny", permissionDecisionReason: "<retry hint>" }` and the agent receives the retry hint to fix the issue.
- **Verify:** Create a template with `gate: { bash: "echo FAIL", expect: "PASS" }`. Enter the mode. Attempt to complete the step. Confirm the hook blocks with a retry hint containing "PASS".
- **Source:** `src/validation/schemas.ts`, `src/commands/hook.ts`, `src/commands/setup.ts`

#### Gate Type

One gate type: **bash** -- runs a shell command, checks output or exit code:

```yaml
gate:
  bash: "grep 'status:' {spec_path}"
  expect: "approved"          # stdout must contain this string
  on_fail: "Spec not approved. Run kata enter planning --issue={issue}"
```

```yaml
gate:
  bash: "{test_command}"
  expect_exit: 0              # exit code must equal this
  on_fail: "Tests failing on clean tree. Fix before proceeding."
```

Bash gates are sufficient for all use cases -- template authors can shell out to any command, including `kata <skill>` or custom scripts. Agent-driven quality gates (e.g., LLM review with a score threshold) are deferred to a follow-up if needed.

#### Zod Schema

Extend `src/validation/schemas.ts`:

```typescript
export const gateSchema = z.object({
  bash: z.string().min(1),
  expect: z.string().optional(),
  expect_exit: z.number().optional(),
  on_fail: z.string().optional(),
}).strict()
```

Single object schema with `.strict()` to reject unknown keys.

#### Gate Evaluation Engine

Gate evaluation is integrated into the consolidated `handlePreToolUse` handler (see B1 Hook Consolidation below). When a `TaskUpdate(status: "completed")` is intercepted:

1. Map native task ID back to workflow task ID via `metadata.originalId`.
2. Look up the step definition in the template (by matching `phase.id:step.id` to `originalId`).
3. If the step has no `gate` field, skip gate evaluation.
4. Resolve placeholders in the gate definition (see B3).
5. Evaluate the gate: `execSync(command)`, compare stdout to `expect` or exit code to `expect_exit`.
6. If gate passes: proceed to next check (evidence).
7. If gate fails: resolve gate-local placeholders in `on_fail`, then return `{ permissionDecision: "deny", permissionDecisionReason: resolvedOnFail }`.

**Gate-local placeholders** are injected by the gate evaluator after evaluation, in addition to the standard placeholder sources from B3:
- `{exit_code}` -- the actual exit code of the command
- `{output}` -- the stdout of the command

#### Hook Consolidation (PreToolUse)

Currently, `mode-gate`, `task-deps`, and `task-evidence` are registered as separate PreToolUse hooks, each spawning a separate process, parsing stdin, and loading session state independently. This spec consolidates all PreToolUse logic — including gate evaluation — into a **single `handlePreToolUse` handler**.

`buildHookEntries()` in `src/commands/setup.ts` registers **one** PreToolUse entry:

```typescript
PreToolUse: [
  {
    hooks: [{
      type: 'command',
      command: `${bin} hook pre-tool-use`,
      timeout: 30,
    }],
  },
],
```

The consolidated handler dispatches internally:

```typescript
async function handlePreToolUse(input) {
  // 1. Always: inject --session=ID into kata bash commands
  // 2. Always: block writes when no mode active (mode-gate)
  // 3. If TaskUpdate(status: "completed"):
  //    a. Check task dependencies (hard block)
  //    b. Evaluate gate if step has one (hard block)
  //    c. Check git evidence (advisory warning)
}
```

This replaces the separate `mode-gate`, `task-deps`, `task-evidence` handlers and the proposed `gate-check` handler. One process spawn, one stdin parse, one state load per tool use.

The old handler functions (`handleModeGate`, `handleTaskDeps`, `handleTaskEvidence`) are refactored into internal helper functions called by `handlePreToolUse`. The `--strict` flag no longer controls whether task-deps/task-evidence hooks are registered (they're always part of the consolidated handler); instead, strict mode can be checked internally to decide whether to run the dep/evidence checks.

#### Files Modified

| File | Change |
|------|--------|
| `src/validation/schemas.ts` | Add `gateSchema`. Add `gate` field to `phaseStepSchema`. Add `gate` field to `subphasePatternSchema`. |
| `src/commands/hook.ts` | Replace `mode-gate`, `task-deps`, `task-evidence` handlers with consolidated `handlePreToolUse`. Add gate evaluation logic. |
| `src/commands/setup.ts` | Replace multiple PreToolUse entries with single `pre-tool-use` hook. |

#### Backward Compatibility

The existing `agentStepConfigSchema.gate` boolean field is **removed**. The new `gate` field on `phaseStepSchema` replaces it with a structured object. Templates using the old `agent.gate: true` pattern must be migrated (see B6).

---

### B2: Hint schema

**Core:**
- **ID:** hint-schema
- **Trigger:** Template step has a `hints` array; agent begins working on the step's native task.
- **Expected:** Hints are included in the native task description when tasks are created by `buildPhaseTasks()` / `buildSpecTasks()`. The agent interprets typed hints as guidance. Runtime does not enforce hints -- they are advisory.
- **Verify:** Create a template with `hints: [{ read: "README.md" }, { bash: "npm test" }]`. Enter the mode. Run TaskList. Confirm task descriptions include the typed hints.
- **Source:** `src/validation/schemas.ts`, `src/commands/enter/task-factory.ts`

#### Hint Types

Six hint types, each a distinct object shape:

```yaml
hints:
  # Read a file or file section
  - read: "{spec_path}"
    section: "## Verification Plan"   # optional: specific section

  # Run a bash command (informational, not enforced)
  - bash: "git status"

  # Search the codebase
  - search: "function handleAuth"
    glob: "src/**/*.ts"               # optional: file pattern

  # Spawn a sub-agent
  - agent:
      subagent_type: "Explore"
      prompt: "Find code patterns related to {feature_topic}"

  # Run a kata skill
  - skill: "interview"
    args: "requirements"

  # Ask the user a question
  - ask:
      question: "What testing approach do you prefer?"
      options:
        - { label: "Unit tests", description: "Isolated function tests" }
        - { label: "Integration tests", description: "End-to-end with real services" }
```

#### Zod Schema

```typescript
export const readHintSchema = z.object({
  read: z.string().min(1),
  section: z.string().optional(),
})

export const bashHintSchema = z.object({
  bash: z.string().min(1),
})

export const searchHintSchema = z.object({
  search: z.string().min(1),
  glob: z.string().optional(),
})

export const agentHintSchema = z.object({
  agent: z.object({
    subagent_type: z.string().min(1),
    prompt: z.string().min(1),
  }),
})

export const skillHintSchema = z.object({
  skill: z.string().min(1),
  args: z.string().optional(),
})

export const askHintSchema = z.object({
  ask: z.object({
    question: z.string().min(1),
    header: z.string().optional(),
    options: z.array(z.object({
      label: z.string().min(1),
      description: z.string().optional(),
    })).optional(),
    multiSelect: z.boolean().optional(),
  }),
})

export const hintSchema = z.union([
  readHintSchema,
  bashHintSchema,
  searchHintSchema,
  agentHintSchema,
  skillHintSchema,
  askHintSchema,
])
```

#### Hint Rendering in Tasks

`buildPhaseTasks()` in `src/commands/enter/task-factory.ts` renders hints into the native task `description` field as a structured block appended after the `instruction` text:

```
## Hints

- **Read:** planning/specs/37-modular-template-system.md (section: ## Verification Plan)
- **Bash:** `git status`
- **Search:** `function handleAuth` in src/**/*.ts
- **Skill:** /interview requirements
```

This keeps hints human-readable in TaskList output while preserving type information that the agent can act on.

#### Files Modified

| File | Change |
|------|--------|
| `src/validation/schemas.ts` | Add all hint type schemas and `hintSchema` union. Add `hints` field to `phaseStepSchema`. Add `hints` field to `subphasePatternSchema`. |
| `src/commands/enter/task-factory.ts` | Render hints into native task descriptions. |

---

### B3: Placeholder resolution

**Core:**
- **ID:** placeholder-resolution
- **Trigger:** Any gate, hint, or instruction field contains a `{variable}` placeholder during task creation or gate evaluation.
- **Expected:** Placeholders resolve to concrete values from a two-source chain: (1) session state, (2) kata.yaml project config. Unresolved placeholders remain as literal `{variable}` text with a warning logged to stderr.
- **Verify:** Create a template with `gate: { bash: "{test_command}" }`. Set `project.test_command: "npm test"` in kata.yaml. Enter the mode. Confirm the gate runs `npm test`.
- **Source:** `src/commands/enter/guidance.ts` (existing `applyPlaceholders`), `src/commands/hook.ts`

#### Variable Sources

**Source 1: Session state** (higher priority)

| Placeholder | Resolves from |
|-------------|---------------|
| `{issue}` | `sessionState.issueNumber` |
| `{workflow_id}` | `sessionState.workflowId` |
| `{mode}` | `sessionState.currentMode` |
| `{spec_path}` | `sessionState.specPath` |
| `{phase}` | `sessionState.currentPhase` |

**Source 2: kata.yaml project config** (lower priority)

| Placeholder | Resolves from |
|-------------|---------------|
| `{test_command}` | `config.project.test_command` |
| `{build_command}` | `config.project.build_command` |
| `{typecheck_command}` | `config.project.typecheck_command` |
| `{smoke_command}` | `config.project.smoke_command` |
| `{spec_path_dir}` | `config.spec_path` |
| `{research_path}` | `config.research_path` |
| `{project_name}` | `config.project.name` |
| `{diff_base}` | `config.project.diff_base` |

#### Resolution Engine

New function in `src/commands/enter/placeholder.ts`:

```typescript
export function resolvePlaceholders(
  template: string,
  context: PlaceholderContext,
): string
```

Where `PlaceholderContext` contains:
- `session: SessionState` -- current session
- `config: KataConfig` -- loaded kata.yaml
- `extra: Record<string, string>` -- ad-hoc variables (e.g., `taskSummary`, `phaseName`, `phaseLabel`, `reviewers`)

Resolution order: for each `{key}` placeholder, check session state fields, then kata.yaml config fields, then extra vars. First match wins. Unresolved placeholders stay as-is; a warning is logged to stderr.

#### Migration from `applyPlaceholders()`

The existing `applyPlaceholders()` in `src/commands/enter/guidance.ts` handles only `{task_summary}`, `{phase_name}`, `{phase_label}`, `{reviewers}`. The new `resolvePlaceholders()` subsumes it. All callers of `applyPlaceholders()` migrate to the new function. The old function is deleted.

#### Files Modified

| File | Change |
|------|--------|
| `src/commands/enter/placeholder.ts` | **New file.** `resolvePlaceholders()` and `PlaceholderContext` type. |
| `src/commands/enter/guidance.ts` | Delete `applyPlaceholders()` function. Migrate 4 internal call sites (lines ~102, 107, 153, 158) to use `resolvePlaceholders()` from `placeholder.ts`. |
| `src/commands/enter/task-factory.ts` | Replace `applyPlaceholders()` calls with `resolvePlaceholders()`. Resolve placeholders in gate and hint fields during task creation. |
| `src/commands/enter/index.ts` | Update re-exports: remove `applyPlaceholders`, add `resolvePlaceholders` and `PlaceholderContext`. |
| `src/commands/hook.ts` | Use `resolvePlaceholders()` before evaluating gates in consolidated PreToolUse handler. |

---

### B4: Inline subphase patterns

**Core:**
- **ID:** inline-subphases
- **Trigger:** `kata enter implementation --issue=N` with a spec that has phases.
- **Expected:** The implementation template's `subphase_pattern` field is an inline array of `SubphasePattern` objects directly in the template frontmatter. No string reference. No `loadSubphasePatterns()` call. No `batteries/subphase-patterns.yaml` file.
- **Verify:** Delete `batteries/subphase-patterns.yaml`. Delete `src/config/subphase-patterns.ts`. Run `npm run build && npm test`. Enter implementation mode with a spec. Confirm tasks are created correctly.
- **Source:** `src/config/subphase-patterns.ts`, `src/commands/enter.ts`, `batteries/subphase-patterns.yaml`, `batteries/templates/implementation.md`

#### Schema Change

In `src/validation/schemas.ts`, change `phaseSchema.subphase_pattern`:

```typescript
// Before:
subphase_pattern: z.union([z.string(), z.array(subphasePatternSchema)]).optional(),

// After:
subphase_pattern: z.array(subphasePatternSchema).optional(),
```

String references are no longer accepted. Templates that use a string reference fail schema validation with a clear error message.

#### Enter Command Change

In `src/commands/enter.ts`, remove the entire subphase resolution block (lines ~406-422 in current code):

```typescript
// DELETE: This entire block
if (typeof containerPhase.subphase_pattern === 'string') {
  const patternConfig = await loadSubphasePatterns()
  const patternName = containerPhase.subphase_pattern
  // ...
}
```

Replace with direct array read:

```typescript
if (hasContainerPhase && containerPhase?.subphase_pattern) {
  resolvedSubphasePattern = containerPhase.subphase_pattern  // always array now
}
```

#### Template Embedding

The `impl-test-review` pattern from `batteries/subphase-patterns.yaml` moves inline into `batteries/templates/implementation.md` frontmatter:

```yaml
  - id: p2
    name: Implementation
    container: true
    subphase_pattern:
      - id_suffix: impl
        title_template: "IMPL - {task_summary}"
        todo_template: "Implement {task_summary}"
        active_form: "Implementing {phase_name}"
        labels: [impl]
        hints:
          - read: "{spec_path}"
            section: "## Phase {phase_label}"
        instruction: |
          Implement the behavior described in the spec phase.

      - id_suffix: test
        title_template: "TEST - {phase_name}"
        todo_template: "Test {phase_name} implementation"
        active_form: "Testing {phase_name}"
        labels: [test]
        depends_on_previous: true
        gate:
          bash: "{test_command}"
          expect_exit: 0
          on_fail: "Tests failing. Fix test failures before proceeding."

      - id_suffix: review
        title_template: "REVIEW - {reviewers}"
        todo_template: "Review {phase_name} changes"
        active_form: "Reviewing {phase_name}"
        labels: [review]
        depends_on_previous: true
```

Other patterns (`impl-test`, `impl-test-verify`, `impl-verify`) are no longer shipped as named patterns. Projects that use them embed the equivalent inline in their own templates. `kata migrate` handles this conversion (see B6).

#### Files Deleted

| File | Reason |
|------|--------|
| `src/config/subphase-patterns.ts` | No callers after inlining. |
| `src/config/subphase-patterns.test.ts` | Tests for deleted module. |
| `batteries/subphase-patterns.yaml` | Content moved inline to templates. |

#### Files Modified

| File | Change |
|------|--------|
| `src/validation/schemas.ts` | Remove `z.string()` from `subphase_pattern` union. Add `gate` and `hints` fields to `subphasePatternSchema`. |
| `src/commands/enter.ts` | Remove `import { loadSubphasePatterns }`. Remove string pattern resolution block. Simplify to direct array read. |
| `src/session/lookup.ts` | Remove `getProjectSubphasePatternsPath()` export. |
| `batteries/templates/implementation.md` | Embed `impl-test-review` pattern inline in frontmatter. |

---

### B5: Interview skill

**Core:**
- **ID:** interview-skill
- **Trigger:** Agent encounters a hint `{ skill: "interview", args: "requirements" }` in a template step, or user invokes `/interview requirements` directly.
- **Expected:** The skill reads the interview definition for the specified category, runs structured `AskUserQuestion` calls for each round, collects answers, and returns a structured data object with all responses. The planning template's 200+ lines of hardcoded AskUserQuestion prose are replaced by skill hints.
- **Verify:** Run `/interview requirements`. Confirm it presents AskUserQuestion prompts and returns structured output with answers for each round.
- **Source:** `src/config/interviews.ts`, `batteries/interviews.yaml`, `batteries/templates/planning.md`

#### Interview Config Format

Interview definitions live in `.kata/interviews/` as individual YAML files (one per category):

```yaml
# .kata/interviews/requirements.yaml
name: "Requirements"
description: "Clarify the problem and scope"
rounds:
  - header: "Problem & Scope"
    question: "What are you planning?"
    options:
      - { label: "New feature", description: "Something that doesn't exist yet" }
      - { label: "Enhancement", description: "Expanding existing functionality" }
      - { label: "Refactor", description: "Code structure change, no behavior change" }
      - { label: "Epic", description: "Large initiative spanning multiple features" }
    multiSelect: false

  - header: "Happy Path"
    question: "Describe the primary user workflow (happy path)"
    freeform: true

  - header: "Scope Boundaries"
    question: "What is explicitly OUT of scope?"
    freeform: true
```

Batteries seed files ship in `batteries/interviews/` and are copied to `.kata/interviews/` by `kata setup`. Categories: `requirements`, `architecture`, `testing`, `design`.

#### Skill Interface

The `/interview` skill is implemented as a Claude Code slash command (defined in `.claude/agents/` or as a skill in project config) that delegates to `kata interview <category>` under the hood. The kata CLI provides the command; the slash command wraps it for agent ergonomics. Implementation details:

1. Parse category from args: `/interview requirements` -> category = "requirements"
2. Load interview config from `.kata/interviews/{category}.yaml`
3. For each round in the config:
   - If `freeform: true`: emit an `AskUserQuestion` with a text input
   - If `options` array: emit an `AskUserQuestion` with option selection
4. Collect all answers into a structured object
5. Return the object as skill output

```typescript
interface InterviewResult {
  category: string
  answers: Array<{
    header: string
    question: string
    answer: string | string[]  // string for freeform, string[] for multiSelect
  }>
  completedAt: string
}
```

#### Template Integration

Planning template interview steps change from prose to skill hints:

```yaml
# Before (current planning.md):
steps:
  - id: requirements
    title: "Interview: Requirements"
    instruction: |
      Gather requirements from the user. Run two AskUserQuestion rounds:
      # ... 50+ lines of prose ...

# After (new planning.md):
steps:
  - id: requirements
    title: "Interview: Requirements"
    hints:
      - skill: "interview"
        args: "requirements"
    instruction: |
      Run the requirements interview skill and document the answers.
      Use the structured output to inform spec writing.
```

#### Files Deleted

| File | Reason |
|------|--------|
| `src/config/interviews.ts` | Replaced by skill runner. |
| `src/config/interviews.test.ts` | Tests for deleted module. |
| `batteries/interviews.yaml` | Content split into per-category files in `batteries/interviews/`. |

#### Files Created

| File | Purpose |
|------|---------|
| `batteries/interviews/requirements.yaml` | Requirements interview config |
| `batteries/interviews/architecture.yaml` | Architecture interview config |
| `batteries/interviews/testing.yaml` | Testing interview config |
| `batteries/interviews/design.yaml` | Design interview config |
| `src/commands/interview.ts` | Interview skill implementation |

#### Files Modified

| File | Change |
|------|--------|
| `src/index.ts` | Register `/interview` as a command / skill entry point. |
| `batteries/templates/planning.md` | Replace interview prose with skill hints. |

---

### B6: Template migration (clean break)

**Core:**
- **ID:** template-migration
- **Trigger:** `kata migrate` run in a project with old-format templates, OR `kata enter` with an old-format template.
- **Expected:** `kata migrate` detects old-format templates (no `gate` or `hints` fields in any step, or string `subphase_pattern` references) and converts them to the new format. `kata enter` with an old-format template produces a clear error with migration instructions. All 8 batteries templates are rewritten to the new format.
- **Verify:** Take a current `implementation.md` (old format). Run `kata migrate`. Confirm the output has inline subphases with gates and hints. Run `kata enter` with the new template. Confirm it works.
- **Source:** `src/commands/migrate.ts`, `batteries/templates/*.md`

#### Old Format Detection

A template is "old format" if:
1. Any step has an `agent` field with `gate: true` (old boolean gate), OR
2. Any phase has `subphase_pattern` as a string (name reference), OR
3. No step in the entire template has a `gate` object or `hints` array (pure prose template)

Detection function in `src/commands/migrate.ts`:

```typescript
function isOldFormat(template: TemplateYaml): boolean
```

#### Conversion Rules

| Old pattern | New pattern |
|-------------|-------------|
| `agent: { gate: true, threshold: 75, prompt: "X" }` | Gate removed (no bash equivalent). Agent review steps become ungated or use a bash script wrapper. |
| `subphase_pattern: "impl-test-review"` | `subphase_pattern: [{ id_suffix: "impl", ... }, ...]` (inline array from known patterns) |
| Step with only `instruction` (no hints) | Keep `instruction` as-is, no auto-generated hints |
| `agent: { provider: "P", prompt: "X" }` (no gate) | Move to `hints: [{ agent: { subagent_type: "P", prompt: "X" } }]` |

The migration is conservative: instructions are preserved verbatim. Only structural fields (`gate`, `hints`, `subphase_pattern`) are converted. The user must review and refine the converted templates.

#### Error on Old Format

When `kata enter` loads a template and detects old format, it prints:

```
Error: Template uses old format (pre-v{version}).
Run 'kata migrate' to convert templates to the new gate/hint format.
See: https://github.com/codevibesmatter/kata-wm/issues/37
```

And exits with code 1. This is a hard error, not a warning.

#### Migration of Known Patterns

`kata migrate` ships with knowledge of the 4 named subphase patterns from `batteries/subphase-patterns.yaml`:

- `impl-test-review` -- the default for implementation mode
- `impl-test-verify` -- implementation with verification
- `impl-test` -- implementation without review
- `impl-verify` -- legacy pattern

When migrating a template with `subphase_pattern: "impl-test-review"`, the command embeds the known pattern inline. For unknown pattern names, it errors with "Unknown pattern '{name}'. Embed the pattern inline manually."

#### Files Created

| File | Purpose |
|------|---------|
| `src/commands/migrate.ts` | Migration command: detect old format, convert, write. |

#### Files Modified

| File | Change |
|------|--------|
| `src/index.ts` | Register `migrate` command in CLI dispatcher. |
| `src/commands/enter.ts` | Add old-format detection check before proceeding. |
| `src/commands/enter/template.ts` | Add `isOldFormatTemplate()` export. |

Note: B6 and B7 are implemented together in Phase 6.

---

### B7: Keep from #35 -- setup/update/migrate/batteries-removal

**Core:**
- **ID:** keep-from-35
- **Trigger:** Running `kata setup`, `kata update`, or `kata migrate`.
- **Expected:** These commands work as specified in #35, with adaptations for the new template format. Setup registers the gate-check hook. Update handles new-format templates. Migrate converts both old layout and old template format.
- **Verify:** Run `kata setup --yes`. Confirm settings.json has gate-check hook. Confirm kata.yaml has `kata_version`. Run `kata update` after upgrading the package. Confirm templates are updated.
- **Source:** [#35 spec](./35-consolidated-config.md) B2 (setup), B3 (kata_version), B4 (update), B5 (migrate), B6 (remove batteries)

#### `kata setup` changes (extends #35 B2)

In addition to #35's setup behavior:
- Register consolidated `pre-tool-use` PreToolUse hook in `.claude/settings.json` (replaces separate mode-gate, task-deps, task-evidence hooks)
- Copy `batteries/interviews/*.yaml` to `.kata/interviews/`
- Seed new-format templates to `.kata/templates/`
- Stamp `kata_version` in kata.yaml (read from package.json)

#### `kata_version` (from #35 B3)

Add to `KataConfigSchema`:

```typescript
kata_version: z.string().optional(),
```

Written by `kata setup` and `kata update`. Read by `kata update` to determine if upstream changes are available.

#### `kata update` (from #35 B4)

File-level comparison for templates:
1. Read current `.kata/templates/{name}.md`
2. Read the version that was shipped with the *installed* kata_version (stored in package)
3. Read the version shipped with the *current* package version
4. If current file matches old shipped version: replace with new shipped version (user didn't customize)
5. If current file differs from old shipped version: skip, show diff, print "customized -- update manually"

Same logic for `.kata/interviews/*.yaml` and `kata.yaml` structural fields (modes, etc.).

#### `kata migrate` (extends #35 B5)

In addition to #35's layout migration:
- Detect old-format templates and convert them (see B6)
- Convert string subphase_pattern references to inline arrays
- Delete `batteries/subphase-patterns.yaml` and `batteries/interviews.yaml` if they exist in `.kata/`
- `--dry-run` shows what would change without writing

#### Batteries removal (from #35 B6)

- Delete `src/commands/batteries.ts`
- Delete `src/commands/scaffold-batteries.ts`
- Remove `batteries` command from CLI dispatcher
- Remove 2-tier template lookup from `resolveTemplatePath()` and `resolveSpecTemplatePath()` (project paths only)
- Remove 2-tier merge from config loaders
- Remove `batteries-backup/` logic

Note: The `batteries/` directory in the package is retained as a seed source for `kata setup` and `kata update`. This includes `batteries/templates/`, `batteries/interviews/`, `batteries/agents/`, `batteries/prompts/`, `batteries/providers/`, `batteries/spec-templates/`, and `batteries/github/`. What is removed is the *runtime* 2-tier lookup against these directories.

#### Files Modified

| File | Change |
|------|--------|
| `src/commands/setup.ts` | Consolidate PreToolUse hooks into single entry, copy interviews, stamp kata_version. |
| `src/commands/update.ts` | **New file.** Upstream merge with file-level comparison. |
| `src/commands/migrate.ts` | Extended with old-format template conversion. |
| `src/config/kata-config.ts` | Add `kata_version` to schema. |
| `src/index.ts` | Remove batteries command, add update/migrate. |
| `src/session/lookup.ts` | Remove 2-tier lookup from both `resolveTemplatePath()` and `resolveSpecTemplatePath()`. Project paths only (`.kata/templates/`, `.kata/spec-templates/`). |

---

### B8: Template rewrite

**Core:**
- **ID:** template-rewrite
- **Trigger:** `kata setup --yes` or `kata batteries --update` seeds new-format templates.
- **Expected:** All 8 batteries templates are rewritten to use gates, hints, and inline subphases. Templates are self-contained -- no external pattern or interview file references.
- **Verify:** Run schema validation on all 8 rewritten templates. Confirm each parses without error against `templateYamlSchema`.
- **Source:** `batteries/templates/*.md`

#### Template Conversion Summary

| Template | Key Changes |
|----------|-------------|
| `implementation.md` | Inline `impl-test-review` subphase pattern with bash gate on test step (exit code check). Baseline gate on spec status check. Review step ungated (prose-driven). Claim step unchanged (prose). |
| `planning.md` | Replace 200+ lines of AskUserQuestion prose with `{ skill: "interview", args: "<category>" }` hints. Add gate on spec validation step. Research step gets search hints. |
| `task.md` | Add bash gate on test step (`{test_command}` with `expect_exit: 0`). Add read hint on spec/issue step. |
| `research.md` | Add search hints on codebase exploration steps. Add read hints on documentation review. No gates (research is exploratory). |
| `freeform.md` | Minimal changes. No gates (freeform has no preconditions). Add bash hints for common operations. |
| `verify.md` | Add formal gates for VP step execution. Bash gate on test command. |
| `debug.md` | Add search/read hints for investigation steps. Bash gate on reproduction step. |
| `stop-hook-test.md` | Test fixture. Minimal changes to maintain test compatibility. |

#### Example: planning.md P1 Interview (before vs after)

**Before** (current, ~250 lines of interview prose in P1):
```yaml
  - id: requirements
    title: "Interview: Requirements"
    instruction: |
      Gather requirements from the user. Run two AskUserQuestion rounds:

      **Round 1: Problem, happy path, scope**
      AskUserQuestion(questions=[
        { question: "What are you planning?", header: "Feature", options: [...] }
      ])
      # ... 50 more lines ...
```

**After** (new format, ~15 lines):
```yaml
  - id: requirements
    title: "Interview: Requirements"
    hints:
      - skill: "interview"
        args: "requirements"
    instruction: |
      Run the requirements interview. Document answers in planning notes.
      Focus on: problem statement, happy path, scope boundaries, edge cases.
```

#### Example: implementation.md P0 Baseline (before vs after)

**Before** (current):
```yaml
  - id: read-spec
    title: "Read and understand the spec"
    instruction: |
      Find and read the approved spec:
      ```bash
      ls planning/specs/ | grep "{issue-number or keyword}"
      ```
      # ... 20 more lines of prose ...
```

**After** (new format):
```yaml
  - id: read-spec
    title: "Read and understand the spec"
    gate:
      bash: "grep -q 'status: approved' {spec_path}"
      expect_exit: 0
      on_fail: "Spec not approved. Run kata enter planning --issue={issue} first."
    hints:
      - read: "{spec_path}"
    instruction: |
      Read the spec in full. Understand all behaviors, phases, and non-goals.
```

#### Files Modified

| File | Change |
|------|--------|
| `batteries/templates/implementation.md` | Full rewrite with gates, hints, inline subphases. |
| `batteries/templates/planning.md` | Full rewrite with skill hints replacing interview prose. |
| `batteries/templates/task.md` | Add gates and hints. |
| `batteries/templates/research.md` | Add typed hints. |
| `batteries/templates/freeform.md` | Add minimal hints. |
| `batteries/templates/verify.md` | Add verification gates. |
| `batteries/templates/debug.md` | Add search/read hints. |
| `batteries/templates/stop-hook-test.md` | Minimal compatibility changes. |

---

## Implementation Phases

### Phase 1: Schema + placeholder system (p1)

**Goal:** Extend the Zod schemas with gate and hint types. Build the placeholder resolution engine. All later phases depend on this foundation.

**Tasks:**
1. Add `gateSchema` (bash-only) to `src/validation/schemas.ts`
2. Add `readHintSchema`, `bashHintSchema`, `searchHintSchema`, `agentHintSchema`, `skillHintSchema`, `askHintSchema`, `hintSchema` to `src/validation/schemas.ts`
3. Add `gate: gateSchema.optional()` and `hints: z.array(hintSchema).optional()` to `phaseStepSchema`
4. Add `gate` and `hints` fields to `subphasePatternSchema`
5. Remove `gate: z.boolean().optional()` from `agentStepConfigSchema`
6. Create `src/commands/enter/placeholder.ts` with `resolvePlaceholders()` and `PlaceholderContext`
7. Replace all `applyPlaceholders()` calls in `task-factory.ts` with `resolvePlaceholders()`
8. Delete `applyPlaceholders()` from `guidance.ts`
9. Write unit tests for all schema types and placeholder resolution

**Test cases:** See p1 in frontmatter.

### Phase 2: Consolidated PreToolUse hook + gate evaluation (p2)

**Goal:** Consolidate all PreToolUse logic into a single handler. Add bash gate evaluation to the TaskUpdate completion path.

**Depends on:** p1 (gate schema must exist)

**Tasks:**
1. Refactor `handleModeGate`, `handleTaskDeps`, `handleTaskEvidence` into internal helpers
2. Create `handlePreToolUse` that dispatches: session injection -> mode-gate -> (if TaskUpdate: deps -> gates -> evidence)
3. Implement `evaluateBashGate(gate, context)`: runs command, checks expect/expect_exit
4. Update `buildHookEntries()` to register single `pre-tool-use` hook (replacing separate mode-gate, task-deps, task-evidence entries)
5. Resolve placeholders in gate fields before evaluation using `resolvePlaceholders()`
6. Return `{ permissionDecision: "deny", permissionDecisionReason: onFail }` on gate failure
7. Write unit tests for bash gate evaluator and consolidated handler dispatch

**Test cases:** See p2 in frontmatter.

### Phase 3: Inline subphases (p3)

**Goal:** Eliminate the external subphase pattern registry. Templates embed patterns directly.

**Depends on:** p1 (schema changes to subphase_pattern field)

**Tasks:**
1. Change `phaseSchema.subphase_pattern` from `z.union([z.string(), z.array(...)])` to `z.array(subphasePatternSchema).optional()`
2. Delete `src/config/subphase-patterns.ts`
3. Remove `import { loadSubphasePatterns }` from `src/commands/enter.ts`
4. Remove the string pattern resolution block in `enter.ts` (lines ~406-422)
5. Simplify to: `resolvedSubphasePattern = containerPhase.subphase_pattern ?? []`
6. Remove `getProjectSubphasePatternsPath()` from `src/session/lookup.ts`
7. Delete `batteries/subphase-patterns.yaml`
8. Update `src/index.ts` to remove subphase-patterns re-export if present
9. Write unit tests for inline subphase parsing and task creation

**Test cases:** See p3 in frontmatter.

### Phase 4: Interview skill (p4)

**Goal:** Replace the interview config system with a callable `/interview` skill.

**Depends on:** p1 (hint schema for skill hints in templates)

**Tasks:**
1. Create `batteries/interviews/requirements.yaml` with rounds from current planning.md
2. Create `batteries/interviews/architecture.yaml`
3. Create `batteries/interviews/testing.yaml`
4. Create `batteries/interviews/design.yaml`
5. Create `src/commands/interview.ts` -- skill runner that loads config and runs AskUserQuestion
6. Register `/interview` in `src/index.ts` command dispatcher
7. Delete `src/config/interviews.ts`
8. Delete `batteries/interviews.yaml`
9. Write unit tests for config parsing and structured output

**Test cases:** See p4 in frontmatter.

### Phase 5: Template rewrite (p5)

**Goal:** Convert all 8 batteries templates to the new gate/hint format.

**Depends on:** p1 (schema), p3 (inline subphases), p4 (interview skill)

**Tasks:**
1. Rewrite `batteries/templates/implementation.md` with inline subphases, gates on test/review steps, hints on read-spec step
2. Rewrite `batteries/templates/planning.md` replacing all interview prose with skill hints
3. Rewrite `batteries/templates/task.md` with bash gate on tests
4. Rewrite `batteries/templates/research.md` with search/read hints
5. Rewrite `batteries/templates/freeform.md` with minimal hints
6. Rewrite `batteries/templates/verify.md` with verification gates
7. Rewrite `batteries/templates/debug.md` with search/read hints
8. Update `batteries/templates/stop-hook-test.md` for schema compatibility
9. Validate all 8 templates parse against `templateYamlSchema`

**Test cases:** See p5 in frontmatter.

### Phase 6: Setup/update/migrate + batteries removal (p6)

**Goal:** Integrate new template format into project lifecycle commands. Remove the batteries system. Provide migration for old-format projects.

**Depends on:** p2 (consolidated PreToolUse hook for setup), p3 (inline subphases -- migration must know target format), p5 (new-format templates for seeding)

**Tasks:**
1. Update `buildHookEntries()` to register single consolidated PreToolUse hook
2. Add `kata_version` to `KataConfigSchema`
3. Update `kata setup` to copy `batteries/interviews/` to `.kata/interviews/`
4. Update `kata setup` to stamp `kata_version` in kata.yaml
5. Create `src/commands/update.ts` with file-level comparison merge
6. Create `src/commands/migrate.ts` with old-format detection and conversion
7. Implement `isOldFormat(template)` detection function
8. Implement `convertOldGate()`: `agent.gate: true` -> `gate: { bash: ... }` (or remove if no bash equivalent)
9. Implement `convertSubphaseRef()`: string pattern name -> inline array (for known patterns)
10. Implement `convertAgentHint()`: `agent: { provider, prompt }` (no gate) -> hint
11. Add `--dry-run` flag to `kata migrate` to preview migration without writing
12. Delete `src/commands/batteries.ts` and `src/commands/scaffold-batteries.ts`
13. Remove `batteries` command from CLI dispatcher in `src/index.ts`
14. Remove 2-tier template lookup from `resolveTemplatePath()` and `resolveSpecTemplatePath()`
15. Update eval fixtures to use new template format
16. Wire `update` and `migrate` commands in CLI dispatcher
17. Write unit tests for update, migrate, and setup changes

**Test cases:** See p6 in frontmatter.

## Verification Plan

### VP1: Gate enforcement

**Setup:**
1. Create a test template with a bash gate that will fail:
   ```yaml
   steps:
     - id: gated-step
       title: "Gated step"
       gate:
         bash: "echo FAIL"
         expect: "PASS"
         on_fail: "Gate check failed: expected PASS"
   ```
2. Run `kata setup --yes` in a test project (ensures gate-check hook is registered)
3. Run `kata enter` with the test template

**Verify:**
1. Run `TaskList` -- confirm the gated task exists
2. Attempt `TaskUpdate(id: X, status: "completed")` for the gated task
3. Confirm the hook blocks with `permissionDecision: "deny"` and reason contains "expected PASS"
4. Fix the gate condition (mock the command to return PASS)
5. Retry `TaskUpdate` -- confirm it succeeds

**Expected:** Gate blocks completion when condition fails, allows when condition passes.

### VP2: Hint parsing

**Setup:**
1. Create a template with all 6 hint types in one step:
   ```yaml
   hints:
     - read: "README.md"
     - bash: "git status"
     - search: "handleAuth"
       glob: "src/**/*.ts"
     - agent: { subagent_type: "Explore", prompt: "Find patterns" }
     - skill: "interview"
       args: "requirements"
     - ask: { question: "Ready?", options: [{ label: "Yes" }] }
   ```
2. Parse the template with `parseTemplateYaml()`

**Verify:**
1. Confirm `template.phases[0].steps[0].hints` has length 6
2. Confirm each hint has the correct type discriminator key
3. Confirm `buildPhaseTasks()` creates a task whose description includes all 6 hints
4. Run `npm run build && npm test` -- no schema validation errors

**Expected:** All hint types parse correctly and render into task descriptions.

### VP3: Placeholder resolution

**Setup:**
1. Create kata.yaml with `project.test_command: "npm test"` and `project.build_command: "npm run build"`
2. Create a session state with `issueNumber: 42`, `specPath: "planning/specs/42-feature.md"`
3. Create a template with:
   ```yaml
   gate:
     bash: "{test_command}"
     expect_exit: 0
   instruction: "Working on issue {issue}, spec at {spec_path}"
   ```

**Verify:**
1. Call `resolvePlaceholders()` with the gate bash field
2. Confirm result is `"npm test"` (from kata.yaml)
3. Call `resolvePlaceholders()` with the instruction
4. Confirm result contains `"issue 42"` (from session state) and `"planning/specs/42-feature.md"` (from session state)

**Expected:** Placeholders resolve from the correct source in priority order (session state > kata.yaml config).

### VP4: Inline subphases

**Setup:**
1. Create an implementation template with inline `subphase_pattern` array (3 steps: impl, test, review)
2. Create a spec with 2 phases, each with tasks
3. Run `kata enter implementation --issue=99`

**Verify:**
1. Confirm `buildSpecTasks()` creates 6 tasks (2 phases x 3 subphases)
2. Confirm task IDs follow pattern: `p2.1:impl`, `p2.1:test`, `p2.1:review`, `p2.2:impl`, etc.
3. Confirm dependency chains: `p2.1:test` depends on `p2.1:impl`, `p2.1:review` depends on `p2.1:test`
4. Confirm `loadSubphasePatterns` is not called anywhere
5. Run `npm run build && npm test` -- all tests pass

**Expected:** Inline subphases produce identical task structure to the old named-pattern system.

### VP5: Interview skill

**Setup:**
1. Create `.kata/interviews/requirements.yaml` with 3 rounds
2. Run `/interview requirements`

**Verify:**
1. Confirm the skill presents AskUserQuestion for each round
2. Answer all rounds
3. Confirm the return value is an `InterviewResult` object with:
   - `category: "requirements"`
   - `answers` array with 3 entries
   - Each entry has `header`, `question`, and `answer` fields
4. Confirm `/interview nonexistent` returns a clear error listing available categories

**Expected:** Interview skill collects structured answers via AskUserQuestion.

### VP6: Template migration

**Setup:**
1. Take the current (old-format) `implementation.md` template:
   - Has `subphase_pattern: "impl-test-review"` (string reference)
   - Has steps with only `instruction` fields (no gates or hints)
2. Run `kata migrate --dry-run`

**Verify:**
1. Confirm dry-run output shows the template as needing migration
2. Confirm it shows the conversion plan: string pattern -> inline array
3. Run `kata migrate` (without --dry-run)
4. Read the converted template
5. Confirm `subphase_pattern` is now an inline array with impl/test/review steps
6. Confirm original instructions are preserved verbatim
7. Confirm the converted template passes schema validation
8. Run `kata enter implementation --issue=99` with the converted template -- confirm tasks are created

**Expected:** Migration converts old format to new format without losing content.

## Dependencies

| Dependency | Version | Role in this spec |
|------------|---------|-------------------|
| `zod` | existing | Schema definitions for gates, hints, placeholders |
| `js-yaml` | existing | YAML parsing for interview configs and template frontmatter |
| Node.js `child_process` | built-in | `execSync` for bash gate evaluation |

No new external dependencies required.

## Rollout Plan

1. **p1 schema first, then p2 + p3 in parallel** -- p1's schema types (gate, hint Zod definitions) and placeholder engine must land first. Then p2 (consolidated PreToolUse hook + gate evaluation) and p3 (inline subphases) can proceed in parallel.
2. **p4 after p1** -- Interview skill needs hint schema from p1 but nothing else.
3. **p5 after p1 + p3 + p4** -- Templates need all three: schema types, inline subphases, interview skill.
4. **p6 after p2 + p3 + p5** -- Setup needs the consolidated hook (p2), inline subphases (p3 for migration), and new-format templates (p5). Migration is included in this phase.

## Open Questions

1. **Gate timeout** -- The consolidated PreToolUse hook timeout in settings.json is set to 30s. Bash gates that run test suites may need longer. Individual gates can add an optional `timeout` field to override per-gate, or the consolidated hook timeout can be increased. Implementation detail for P2.
2. **Hint validation in stop hook** -- Should the stop hook warn if "required" hints weren't attempted? Deferred to a follow-up. This spec treats all hints as advisory.
3. ~~**Step output capture mechanism**~~ -- Deferred entirely. Step output capture (`stepOutputs`, `{steps.*}` placeholders) removed from this spec to reduce complexity. The two-source placeholder chain (session state + kata.yaml config) covers all current use cases. Step output capture can be added in a follow-up if needed.
