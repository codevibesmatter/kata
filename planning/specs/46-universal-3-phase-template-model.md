---
initiative: feat-universal-phases
type: project
issue_type: feature
status: approved
priority: high
github_issue: 46
created: 2026-04-10
updated: 2026-04-10
approved: 2026-04-10
phases:
  - id: p1
    name: "Stage and Expansion Schema"
    tasks:
      - "Add stage field (setup|work|close) to phaseSchema in src/validation/schemas.ts"
      - "Add expansion field (static|spec|agent) to phaseSchema with .refine() restricting to work stage only"
      - "Add agent_protocol schema (max_tasks, require_labels, skill) to phaseSchema"
      - "Add stage ordering validation to parseAndValidateTemplatePhases()"
      - "Replace container boolean with expansion: spec in enter.ts and task-factory.ts"
      - "Update stop condition schema to z.union([z.string(), z.object({condition, stage?})]) in kata-config.ts"
      - "Add stage-scoped stop condition evaluation in can-exit.ts"
      - "Add per-phase allows_task_create field for agent-expanded phases"
      - "Update task_rules injection to exclude TaskCreate warning for agent-expanded phases"
    test_cases:
      - id: "stage-field-validates"
        description: "phaseSchema requires stage: setup|work|close"
        type: unit
      - id: "expansion-field-validates"
        description: "phaseSchema accepts expansion: static|spec|agent on work phases only"
        type: unit
      - id: "expansion-rejected-on-setup"
        description: "phaseSchema rejects expansion on setup/close phases"
        type: unit
      - id: "agent-protocol-validates"
        description: "agent_protocol schema validates max_tasks, require_labels, skill"
        type: unit
      - id: "stage-ordering"
        description: "Validation rejects phases with close before work or work before setup"
        type: unit
      - id: "empty-phases-skip-validation"
        description: "Templates with phases: [] skip stage ordering validation"
        type: unit
      - id: "container-to-expansion-migration"
        description: "All code paths that checked container: true now check expansion: spec"
        type: integration
      - id: "stop-condition-string-form"
        description: "String stop conditions work as before (backwards compat)"
        type: unit
      - id: "stop-condition-object-form"
        description: "Object form {condition, stage} validates and scopes correctly"
        type: unit
  - id: p2
    name: "Step Library and Unified Setup"
    tasks:
      - "Absorb step library from #45: stepDefinitionSchema, $ref, vars on phaseStepSchema"
      - "Implement loadStepLibrary() and resolveStepRef() in step-library.ts"
      - "Wire $ref resolution into buildPhaseTasks()"
      - "Create batteries/steps.yaml with shared step definitions"
      - "Add steps.yaml to setup.ts scaffolding"
      - "Merge update.ts into setup.ts, remove batteries command"
    test_cases:
      - id: "ref-resolution"
        description: "resolveStepRef() merges $ref step def with local vars"
        type: unit
      - id: "ref-missing-error"
        description: "resolveStepRef() throws on missing step ID"
        type: unit
      - id: "ref-unresolved-vars-error"
        description: "resolveStepRef() throws on unresolved placeholders"
        type: unit
      - id: "steps-yaml-scaffolded"
        description: "kata setup copies steps.yaml to .kata/steps.yaml"
        type: smoke
      - id: "unified-setup"
        description: "kata setup handles init and update, no separate batteries"
        type: integration
  - id: p3
    name: "Atomic Skills"
    tasks:
      - "Write batteries/skills/code-impl/SKILL.md (inline: implementation methodology)"
      - "Write batteries/skills/test-protocol/SKILL.md (inline: build + test + retry)"
      - "Write batteries/skills/interview/SKILL.md (inline: structured questioning)"
      - "Write batteries/skills/code-review/SKILL.md (agent, context: fork)"
      - "Write batteries/skills/spec-review/SKILL.md (agent, context: fork)"
      - "Write batteries/skills/debug-methodology/SKILL.md (inline: reproduce/hypothesize/trace)"
      - "Write batteries/skills/spec-writing/SKILL.md (agent, context: fork)"
      - "Write batteries/skills/vp-execution/SKILL.md (inline: run VP steps literally)"
      - "Delete 7 mode-mirroring skills + tdd skill"
      - "Move sub-prompt .md files into new skill directories"
    test_cases:
      - id: "eight-skills-exist"
        description: "Exactly 8 SKILL.md files under batteries/skills/"
        type: smoke
      - id: "agent-skills-context-fork"
        description: "code-review, spec-review, spec-writing have context: fork"
        type: unit
      - id: "old-skills-deleted"
        description: "No SKILL.md for planning, implementation, task, debugging, research, freeform, verification, tdd"
        type: smoke
  - id: p4
    name: "Template Rewrite"
    tasks:
      - "Rewrite batteries/templates/task.md with stage tags, $ref steps, skill refs"
      - "Rewrite batteries/templates/implementation.md with stage tags, expansion: spec"
      - "Rewrite batteries/templates/planning.md with stage tags"
      - "Rewrite batteries/templates/debug.md with stage tags"
      - "Rewrite batteries/templates/research.md with stage tags"
      - "Rewrite batteries/templates/verify.md with stage tags, expansion: agent"
      - "Rewrite batteries/templates/freeform.md (no phases or minimal)"
      - "Remove mode_skill from templateYamlSchema and enter.ts"
      - "Remove outputModeSkillActivation() from enter.ts"
      - "Add orchestration rule to kata.yaml global_rules"
    test_cases:
      - id: "templates-parse"
        description: "All 7 templates parse against templateYamlSchema with stage field"
        type: unit
      - id: "templates-ref-resolve"
        description: "All $ref in templates resolve to steps.yaml entries"
        type: integration
      - id: "templates-skill-resolve"
        description: "All skill: refs resolve to batteries/skills/ directories"
        type: integration
      - id: "no-mode-skill"
        description: "No template has mode_skill in frontmatter"
        type: smoke
      - id: "stage-coverage"
        description: "Every phase in every template has a valid stage tag"
        type: unit
  - id: p5
    name: "Cleanup and Tests"
    tasks:
      - "Add unit tests for step-library.ts"
      - "Add unit tests for stage validation in schemas"
      - "Add unit tests for expansion field validation"
      - "Update template-rewrite.test.ts for new template structure"
      - "Update schemas.test.ts for $ref, vars, stage, expansion fields"
      - "Run full test suite, fix regressions"
      - "Update eval fixture templates to match new batteries templates"
    test_cases:
      - id: "all-tests-pass"
        description: "npm run build && npm test passes with zero failures"
        type: integration
---

# Universal 3-Phase Template Model (setup/work/close)

> GitHub Issue: [#46](https://github.com/codevibesmatter/kata/issues/46)
> Supersedes: [#45](https://github.com/codevibesmatter/kata/issues/45)

## Overview

Mode templates currently have ad-hoc phase structures — task has 3 phases, implementation has 4, planning has 5, research has 6. Despite different names, every mode follows the same pattern: orient and prepare, do the work, wrap up. This feature formalizes that pattern by introducing 3 universal stages (`setup`, `work`, `close`) as a grouping tag on phases, with codified expansion strategies for the work stage. Combined with #45's step library and atomic skills (absorbed in full), this produces a consistent, composable template authoring model.

## Feature Behaviors

### B1: Stage Field on Phases

**Core:**
- **ID:** stage-field
- **Trigger:** Template YAML is parsed and validated by `parseAndValidateTemplatePhases()`
- **Expected:** Every phase in a template must declare `stage: "setup" | "work" | "close"`. The field is required on `phaseSchema`. Phases are grouped by stage but retain their own IDs and names (e.g., `p0: "Reproduce & Map"` with `stage: setup`, `p1: "Investigate"` with `stage: work`). Stages must appear in order: all setup phases before work phases, all work phases before close phases. Validation fails if phases are out of stage order. Not every stage is required — a template may have only `work` + `close`, or only `work`. Templates with `phases: []` (e.g., freeform) skip stage ordering validation entirely. **Work phases must have at least one step with a `skill:` field** — this is the "work = methodology" invariant. Skills live exclusively on steps (not on phases, subphase_patterns, or agent_protocol). The `skill:` field on steps produces `Invoke /skill-name` in the task instruction regardless of whether the task was created from a template step, spec expansion, or agent TaskCreate. Setup and close phases may have steps with skills too (not enforced, not prohibited), but work phases MUST.
- **Verify:** Unit test: parse a template with stages in correct order — passes. Parse one with `close` before `work` — fails with ordering error. Parse one with `phases: []` — passes (no validation needed). Parse a work phase with no skill on any step — fails validation.
- **Source:** `src/validation/schemas.ts` (phaseSchema), `src/commands/enter/template.ts` (validation)

#### UI Layer

N/A — stage is a schema field for scoping and validation. Stage-grouped `kata status` output is a future enhancement (see Non-Goals).

#### API Layer

N/A — internal schema.

#### Data Layer

New field on `phaseSchema`:

```typescript
export const phaseSchema = z.object({
  id: z.string().regex(/^p\d+(\.\d+|-[a-z][a-z0-9-]*)?$/),
  name: z.string().min(1),
  stage: z.enum(['setup', 'work', 'close']),
  // ... existing fields
})
```

---

### B2: Stage-Scoped Stop Conditions

**Core:**
- **ID:** stage-scoped-stops
- **Trigger:** `kata can-exit` evaluates stop conditions for the current mode
- **Expected:** Stop conditions can optionally scope to a stage. When a stop condition specifies a stage, it is only evaluated when all phases in that stage are complete. For example, `tests_pass` scoped to `work` is only checked after all work-stage phases are done. Unscoped conditions (the default) are checked globally as today. The `modes` section in `kata.yaml` gains an optional object form for stop conditions: `{ condition: "tests_pass", stage: "work" }` alongside the existing string form for backwards compatibility. The `condition` field in object form validates against the same `STOP_CONDITION_TYPES` enum from `src/state/schema.ts`. The schema uses `z.union([z.enum(STOP_CONDITION_TYPES), z.object({ condition: z.enum(STOP_CONDITION_TYPES), stage: z.enum(['setup', 'work', 'close']).optional() })])`. **Migration:** existing `kata.yaml` files with string arrays continue to work — the union type accepts both forms. `kata setup` does NOT auto-convert existing string stop conditions to object form. The `batteries/kata.yaml` template ships with the new object form for modes that benefit from scoping (implementation: `tests_pass` scoped to work), but string form for simple conditions.
- **Verify:** Unit test: configure `tests_pass` scoped to `work`. With work phases incomplete, `can-exit` skips the check. With work phases complete, it evaluates. Unit test: string-form stop conditions continue to work unchanged.
- **Source:** `src/commands/can-exit.ts` (condition evaluation), `src/config/kata-config.ts` (stop condition schema), `src/state/schema.ts` (STOP_CONDITION_TYPES)

#### UI Layer

`kata can-exit` output indicates which stage a condition belongs to:

```
✗ tests_pass (work stage) — tests must pass before completing work
✓ committed (close stage)
```

#### API Layer

N/A.

#### Data Layer

Extended stop condition format in `kata.yaml`:

```yaml
stop_conditions:
  - tasks_complete           # string form (global, backwards compat)
  - condition: tests_pass    # object form (stage-scoped)
    stage: work
  - condition: committed
    stage: close
  - condition: pushed
    stage: close
```

---

### B3: Expansion Field on Work Phases

**Core:**
- **ID:** expansion-field
- **Trigger:** Template phase with `stage: work` is parsed
- **Expected:** Work-stage phases may declare `expansion: "static" | "spec" | "agent"`. Static means steps are defined inline (default if omitted). Spec means the phase is a container that expands from spec phases via `subphase_pattern` (same as today's `container: true`). Agent means the agent creates child tasks at runtime using TaskCreate. The `expansion` field replaces the `container: true` boolean — `container: true` becomes `expansion: spec`. Setup and close phases cannot have expansion (always static). Validation fails if a non-work phase declares expansion.
- **Verify:** Unit test: phase with `stage: work, expansion: spec, subphase_pattern: [...]` validates. Phase with `stage: setup, expansion: agent` fails validation.
- **Source:** `src/validation/schemas.ts` (phaseSchema), `src/commands/enter.ts` (expansion handling)

#### UI Layer

N/A — template structure, not user-facing.

#### API Layer

N/A.

#### Data Layer

New fields on `phaseSchema`:

```typescript
export const phaseSchema = z.object({
  // ... existing fields
  stage: z.enum(['setup', 'work', 'close']),
  expansion: z.enum(['static', 'spec', 'agent']).optional(),
  agent_protocol: agentProtocolSchema.optional(),
}).refine(
  (p) => !p.expansion || p.stage === 'work',
  { message: 'expansion is only allowed on work-stage phases' }
)
```

---

### B3a: Container Field Removal

**Core:**
- **ID:** container-removal
- **Trigger:** Any code path that previously checked `container: true` on a phase
- **Expected:** The `container` boolean field is removed from `phaseSchema`. All code in `enter.ts` and `task-factory.ts` that checks `p.container === true` is updated to check `p.expansion === 'spec'` (or `p.expansion === 'agent'` where applicable). Specifically: `enter.ts` lines ~423-424 (finding container phase), lines ~484-530 (spec detection), lines ~598-648 (task building and cross-phase wiring). The `container` field is removed from the Zod schema — templates declaring `container: true` will fail validation with a clear error pointing to `expansion: spec` as the replacement. Since this is pre-1.0, no backwards compatibility shim is needed.
- **Verify:** `grep -r "container" src/validation/schemas.ts src/commands/enter.ts src/commands/enter/task-factory.ts` returns no matches for the boolean field. Unit test: template with `container: true` fails validation. Template with `expansion: spec` passes.
- **Source:** `src/validation/schemas.ts` (remove container from phaseSchema), `src/commands/enter.ts` (~lines 423, 484-530, 598-648), `src/commands/enter/task-factory.ts`

#### UI Layer

If a project has a template with `container: true`, `kata enter` fails with:
```
Error: Unknown field "container" in phase "p2". Use "expansion: spec" instead.
```

#### API Layer

N/A.

#### Data Layer

`container` removed from `phaseSchema`. `expansion: "spec"` is the replacement.

---

### B4: Agent Protocol for Agent-Driven Expansion

**Core:**
- **ID:** agent-protocol
- **Trigger:** Agent enters a work phase with `expansion: agent`
- **Expected:** The phase may declare an `agent_protocol` section with constraints: `max_tasks` (default 10), `require_labels` (labels agent-created tasks must have), `skill` (default skill for created tasks). The task instruction for an agent-expanded phase tells the agent: "You own this phase. Use TaskCreate to create child tasks. Mark them done as you complete them. The phase completes when all child tasks are done." **TaskCreate allowance mechanism:** phases with `expansion: agent` get an `allows_task_create: true` field set automatically by the task factory. The `task_rules` injection in `enter.ts` / `guidance.ts` checks whether any phase in the template has `expansion: agent` — if so, the "Do NOT create new tasks with TaskCreate" rule is replaced with "TaskCreate is allowed ONLY for phases marked as agent-expanded. For all other phases, tasks are pre-created." This is a conditional rule, not a per-phase override, since task_rules are global.
- **Verify:** Enter verify mode. Confirm the work phase instruction includes agent expansion protocol. Confirm task_rules output mentions TaskCreate is allowed for agent-expanded phases.
- **Source:** `src/validation/schemas.ts` (agentProtocolSchema), `src/commands/enter/task-factory.ts` (instruction assembly), `src/config/kata-config.ts` + `src/commands/prime.ts` (task_rules conditional — current task_rules logic lives here)

#### UI Layer

Native task instruction for an agent-expanded phase includes:

```
## Agent Expansion Protocol
You own this phase. Create child tasks using TaskCreate for each unit of work.
Constraints: max 10 tasks, labels: [vp-step].
Each task you create must invoke /vp-execution before starting work.
```

#### API Layer

N/A.

#### Data Layer

```typescript
export const agentProtocolSchema = z.object({
  max_tasks: z.number().int().positive().default(10),
  require_labels: z.array(z.string()).optional(),
})
```

Note: `skill` is NOT on the agent_protocol. Skills live on steps — the agent expansion instruction tells the agent which skill to invoke on each created task, but the skill reference comes from the step that triggers expansion (e.g., the `expand-vp` step has `skill: vp-execution`).

---

### B5: Step Library (absorbed from #45)

**Core:**
- **ID:** step-library
- **Trigger:** `kata enter <mode>` invokes `buildPhaseTasks()`
- **Expected:** Identical to #45 B1 and B2. `loadStepLibrary()` reads `.kata/steps.yaml`, returns `Map<string, StepDefinition>`. `resolveStepRef()` resolves `$ref` + `vars`. Unresolved vars and missing step IDs produce clear errors. `buildPhaseTasks()` calls `resolveStepRef()` before assembling task instructions. `buildSpecTasks()` does NOT use `$ref`.
- **Verify:** See #45 spec B1/B2 verification steps (identical).
- **Source:** New `src/commands/enter/step-library.ts`, modified `src/validation/schemas.ts`, modified `src/commands/enter/task-factory.ts`

#### UI Layer

Error output on bad $ref (same as #45):
```
Error: Step "p0:setup" references $ref "nonexistent" which does not exist in .kata/steps.yaml
```

#### API Layer

N/A.

#### Data Layer

Same as #45 B1/B2: `stepDefinitionSchema`, `stepLibrarySchema`, `$ref`/`vars` on `phaseStepSchema`. `batteries/steps.yaml` with shared step definitions (env-check, github-claim, commit-push, update-issue, read-spec, etc.).

---

### B6: Atomic Skills (absorbed from #45)

**Core:**
- **ID:** atomic-skills
- **Trigger:** `kata setup` copies skills to `.claude/skills/`
- **Expected:** Identical to #45 B4. 8 atomic skills replace 7 mode-mirroring skills + tdd. Skills: `code-impl`, `test-protocol`, `interview`, `code-review`, `spec-review`, `debug-methodology`, `spec-writing`, `vp-execution`. Three agent skills have `context: fork`. Sub-prompt files moved to new directories.
- **Verify:** See #45 spec B4 verification steps (identical).
- **Source:** `batteries/skills/` (delete old, create new)

#### UI Layer

N/A.

#### API Layer

N/A.

#### Data Layer

Same as #45 B4: 8 skill directories, each with SKILL.md + optional sub-prompts.

---

### B7: mode_skill Removed (absorbed from #45)

**Core:**
- **ID:** mode-skill-removed
- **Trigger:** Template parsing and mode entry
- **Expected:** Identical to #45 B5. `mode_skill` removed from schema. `outputModeSkillActivation()` removed from enter.ts. Orchestration guidance moves to `kata.yaml` global_rules.
- **Verify:** `grep mode_skill` across batteries/ and src/ returns no matches.
- **Source:** `src/validation/schemas.ts`, `src/commands/enter.ts`

#### UI Layer

`kata enter` no longer outputs skill activation banner.

#### API Layer

N/A.

#### Data Layer

`mode_skill` removed from `templateYamlSchema`.

---

### B8: Templates Rewritten with Stages

**Core:**
- **ID:** templates-staged
- **Trigger:** `kata setup` scaffolds updated templates
- **Expected:** All 7 mode templates are rewritten. Every phase has `stage: setup|work|close`. Setup phases use `$ref` for shared ceremony (env-check, read-spec, claim-issue). Work phases use `skill:` for methodology and `expansion:` where applicable. Close phases use `$ref` for commit-push, update-issue. Templates have no markdown body. Implementation uses `expansion: spec`. Verify uses `expansion: agent` with `agent_protocol`. Debug and research use `expansion: static` (steps inline). Freeform stays phase-less.
- **Verify:** For each template with phases (excludes freeform): (1) every phase has `stage`, (2) stages are in order, (3) at least one `$ref` step, (4) at least one `skill:` step, (5) no markdown body, (6) parses against schema. For freeform: (1) `phases: []`, (2) no markdown body, (3) parses against schema.
- **Source:** `batteries/templates/*.md`

#### UI Layer

N/A — agent receives methodology via skills, ceremony via resolved $ref instructions.

#### API Layer

N/A.

#### Data Layer

Example rewritten template (debug.md):

```yaml
---
id: debug
name: Debug Mode
description: Systematic hypothesis-driven debugging
mode: debug

phases:
  - id: p0
    name: Reproduce & Map
    stage: setup
    task_config:
      title: "P0: Setup - reproduce and map the bug"
      labels: [phase, setup]
    steps:
      - id: env-check
        $ref: env-check
        title: "Verify environment"
      - id: reproduce
        title: "Reproduce the bug"
        skill: debug-methodology
        instruction: |
          Get clear reproduction steps. Confirm the bug exists.
          Document: trigger, actual behavior, expected behavior.

  - id: p1
    name: Investigate
    stage: work
    task_config:
      title: "P1: Work - investigate and fix"
      depends_on: [p0]
    steps:
      - id: hypothesize
        title: "Form and test hypotheses"
        skill: debug-methodology
      - id: fix
        title: "Implement minimal fix"
        skill: code-impl
      - id: verify-fix
        title: "Verify fix"
        skill: test-protocol
        gate:
          bash: "{test_command}"
          expect_exit: 0

  - id: p2
    name: Close
    stage: close
    task_config:
      title: "P2: Close - commit and push"
      depends_on: [p1]
    steps:
      - id: commit-push
        $ref: commit-push
        title: "Commit and push"

workflow_id_format: "DB-{session_last_4}-{MMDD}"
---
```

Example agent-expanded template (verify.md work phase):

```yaml
  - id: p1
    name: Execute VP
    stage: work
    expansion: agent
    agent_protocol:
      max_tasks: 20
      require_labels: [vp-step]
    task_config:
      title: "P1: Work - execute verification plan"
      depends_on: [p0]
    steps:
      - id: expand-vp
        title: "Create tasks for each VP step"
        skill: vp-execution
        instruction: |
          Read the verification plan from the spec.
          Use TaskCreate to create one task per VP step.
          Each task must have labels: [vp-step].
          Invoke /vp-execution before executing each VP step.

  - id: p2
    name: Fix Loop
    stage: work
    expansion: agent
    agent_protocol:
      max_tasks: 10
      require_labels: [fix]
    task_config:
      title: "P2: Work - fix failing VP steps"
      depends_on: [p1]
    steps:
      - id: fix-failures
        title: "Fix and re-verify failing steps"
        skill: code-impl
        instruction: |
          For each failed VP step, create a fix task.
          Invoke /code-impl for fixes. Re-run the VP step after fixing.
```

---

### B9: Unified Setup (absorbed from #45)

**Core:**
- **ID:** unified-setup
- **Trigger:** `kata setup` in a fresh or existing project
- **Expected:** Identical to #45 B3a. `kata setup` is the single command for init and update. Copies templates, skills, steps.yaml. Skip-if-customized logic. `kata batteries --update` removed. `update.ts` merged into `setup.ts`.
- **Verify:** `kata setup` in fresh project creates all files. In existing project, updates non-customized files.
- **Source:** `src/commands/setup.ts`

#### UI Layer

Same as today but includes steps.yaml in output.

#### API Layer

N/A.

#### Data Layer

N/A.

---

## Non-Goals

- **Hook-backed gate enforcement** — gates remain agent-trust-based
- **New mode definitions** — only converting existing modes
- **Conditional skills** — no runtime skill activation based on project state
- **Phase-level presets/mixins** — sharing is at step level via $ref only
- **Skill version tracking** — no separate versioning
- **System template conversion** — onboard.md and SESSION-TEMPLATE.template.md unchanged
- **Real-time stage tracking in SessionState** — stage is derived from phase completion, not stored separately
- **Changes to verify-run sub-agent** — continues as-is
- **Subphase patterns using $ref** — subphase patterns stay parameterized via title_template/todo_template
- **Skill validation at entry** — `kata enter` does not validate that `skill:` refs resolve to existing `.claude/skills/` files. A future enhancement could validate at build time.
- **kata status stage grouping** — grouping phases by stage in `kata status` output is a nice-to-have, not in scope for this feature

## Implementation Phases

See YAML frontmatter `phases:` above. Each phase should be 1-4 hours of focused work.

### Phase 1: Stage and Expansion Schema (3-4 hours)

Add `stage`, `expansion`, and `agent_protocol` fields to phaseSchema. Implement stage ordering validation with `.refine()`. Replace `container: true` with `expansion: spec` across enter.ts and task-factory.ts. Update stop condition schema to union type with backwards-compatible string form. Add stage-scoped evaluation to can-exit.ts. Add conditional task_rules for agent-expanded phases. Write unit tests for all schema changes.

### Phase 2: Step Library and Unified Setup (2-3 hours)

Absorb #45's step library: stepDefinitionSchema, $ref/vars, loadStepLibrary(), resolveStepRef(), task-factory wiring. Create batteries/steps.yaml. Add steps.yaml to setup.ts scaffolding. Merge update.ts into setup.ts, remove batteries command. Write unit tests for resolution logic and error cases.

### Phase 3: Atomic Skills (2-3 hours)

Write 8 SKILL.md files. Delete old mode-mirroring skills + tdd. Move sub-prompt files. Same as #45 Phase 2.

### Phase 4: Template Rewrite (3-4 hours)

Rewrite all 7 templates with stage tags, $ref steps, skill refs, and expansion fields. Remove mode_skill from schema and enter.ts. Add orchestration rule to kata.yaml. Verify all templates parse and expansion patterns work.

### Phase 5: Cleanup and Tests (2-3 hours)

Update all test files. Run full suite. Update eval fixtures.

## Verification Strategy

### Test Infrastructure

Existing: `npm run build && npm test` with Node built-in test runner. Tests alongside source with `.test.ts` suffixes. Template validation tests in `src/validation/template-rewrite.test.ts`.

### Build Verification

`npm run build` compiles via tsup. Templates and steps.yaml are plain files. Build confirms schema changes compile.

## Verification Plan

### VP1: Stage Field Validates

Steps:
1. `npm run build && npm test`
   Expected: All tests pass including new stage validation tests.
2. `node --input-type=module -e "import {phaseSchema} from './dist/validation/schemas.js'; console.log(phaseSchema.safeParse({id:'p0', name:'Setup', stage:'setup'}).success ? 'PASS' : 'FAIL')"`
   Expected: Prints `PASS`
3. `node --input-type=module -e "import {phaseSchema} from './dist/validation/schemas.js'; console.log(phaseSchema.safeParse({id:'p0', name:'Setup', stage:'invalid'}).success ? 'FAIL: should reject' : 'PASS: rejected invalid')"`
   Expected: Prints `PASS: rejected invalid`

### VP2: Stage Ordering Enforced

Steps:
1. Create a template with phases in wrong stage order (close before work)
2. `kata enter task --cwd=/tmp/vp2-test`
   Expected: Fails with stage ordering error

### VP3: Step Library and $ref

Steps:
1. `mkdir -p /tmp/vp3-test && cd /tmp/vp3-test && git init && kata setup --cwd=/tmp/vp3-test`
2. `test -f /tmp/vp3-test/.kata/steps.yaml && echo "PASS" || echo "FAIL"`
   Expected: Prints `PASS`
3. `grep "env-check" /tmp/vp3-test/.kata/steps.yaml`
   Expected: Returns a match
4. `rm -rf /tmp/vp3-test`

### VP4: Expansion Field on Templates

Steps:
1. `npm run build`
2. `node --input-type=module -e "import {readFileSync} from 'fs'; import jsYaml from 'js-yaml'; for (const t of ['implementation','verify']) { const raw = readFileSync('batteries/templates/'+t+'.md','utf-8'); const fm = raw.split('---')[1]; const y = jsYaml.load(fm); const work = y.phases.filter(p => p.stage === 'work'); console.log(t+':', work.map(p => p.expansion).join(',')); }"`
   Expected: `implementation: spec` and `verify: agent,agent`

### VP5: All Templates Parse with Stages

Steps:
1. `npm run build`
2. `node --input-type=module -e "import {readFileSync} from 'fs'; import {templateYamlSchema} from './dist/validation/schemas.js'; import jsYaml from 'js-yaml'; for (const t of ['task','implementation','planning','debug','research','verify','freeform']) { const raw = readFileSync('batteries/templates/'+t+'.md','utf-8'); const fm = raw.split('---')[1]; const y = jsYaml.load(fm); const v = templateYamlSchema.safeParse(y); if(!v.success) throw new Error(t+': '+JSON.stringify(v.error.issues)); console.log(t+': OK'); }"`
   Expected: All 7 templates print OK.

### VP6: No mode_skill Remains

Steps:
1. `grep -r "mode_skill" batteries/templates/ src/validation/schemas.ts`
   Expected: No matches (exit code 1).

### VP7: Stage-Scoped Stop Conditions

Steps:
1. `mkdir -p /tmp/vp7-test && cd /tmp/vp7-test && git init && kata setup --cwd=/tmp/vp7-test`
2. Edit `/tmp/vp7-test/.kata/kata.yaml` to set implementation mode stop_conditions to: `[{condition: "tests_pass", stage: "work"}, "tasks_complete", "committed"]`
3. `kata enter implementation --issue=1 --cwd=/tmp/vp7-test --session=vp7`
4. Complete only the setup-stage tasks (leave work-stage tasks pending)
5. `kata can-exit --session=vp7 --cwd=/tmp/vp7-test`
   Expected: Output does NOT mention `tests_pass` (skipped because work stage not complete). Does mention `tasks_complete` as failing.
6. `rm -rf /tmp/vp7-test`

## Implementation Hints

### Dependencies

No new npm dependencies. js-yaml already present. Zod already present.

### Key Imports

| Module | Import | Used For |
|--------|--------|----------|
| `src/validation/schemas.ts` | `phaseSchema`, `phaseStepSchema`, `templateYamlSchema`, `gateSchema` | Adding stage, expansion, agent_protocol, $ref, vars |
| `src/commands/enter/step-library.ts` | `loadStepLibrary`, `resolveStepRef` | New module (same as #45) |
| `src/commands/enter/task-factory.ts` | `buildPhaseTasks`, `buildSpecTasks` | Wire $ref resolution, expansion: agent instructions |
| `src/commands/can-exit.ts` | `validateCanExit` | Stage-scoped stop condition evaluation |
| `src/commands/setup.ts` | `setup` | Unified init+update with steps.yaml |
| `src/session/lookup.ts` | `getPackageRoot`, `findProjectDir` | Resolving file paths |

### Code Patterns

**Stage ordering validation (template.ts):**

```typescript
function validateStageOrdering(phases: PhaseDefinition[]): void {
  const stageOrder = { setup: 0, work: 1, close: 2 }
  let maxSeen = -1
  for (const phase of phases) {
    const order = stageOrder[phase.stage]
    if (order < maxSeen) {
      throw new Error(`Phase "${phase.id}" has stage "${phase.stage}" but follows a later stage. Stages must be in order: setup → work → close.`)
    }
    maxSeen = Math.max(maxSeen, order)
  }
}
```

**Stage-scoped stop condition evaluation (can-exit.ts):**

```typescript
// Parse stop condition — string or object form
type StopCondition = string | { condition: string; stage?: string }

function shouldEvaluateCondition(
  cond: StopCondition,
  completedPhases: string[],
  allPhases: PhaseDefinition[],
): boolean {
  const stage = typeof cond === 'string' ? undefined : cond.stage
  if (!stage) return true // unscoped — always evaluate

  const stagePhases = allPhases.filter(p => p.stage === stage)
  return stagePhases.every(p => completedPhases.includes(p.id))
}
```

**Agent expansion instruction (task-factory.ts):**

```typescript
function buildAgentExpansionInstruction(protocol: AgentProtocol): string {
  const lines = [
    '## Agent Expansion Protocol',
    'You own this phase. Create child tasks using TaskCreate for each unit of work.',
    `Constraints: max ${protocol.max_tasks} tasks.`,
  ]
  if (protocol.require_labels?.length) {
    lines.push(`Required labels: [${protocol.require_labels.join(', ')}]`)
  }
  if (protocol.skill) {
    lines.push(`Default skill: /${protocol.skill}`)
  }
  return lines.join('\n')
}
```

**Step library loading and $ref resolution — same as #45 spec implementation hints.**

### Gotchas

- **container removal is a clean break** — pre-1.0, no backwards compat. `container: true` is removed from the schema. Templates must use `expansion: "spec"`. Code in enter.ts (~11 references) must all be updated.
- **Stage ordering validation location** — runs in `parseAndValidateTemplatePhases()` at `kata enter` time, not during template parsing. `parseTemplateYaml()` stays a pure parser.
- **expansion .refine()** — the `expansion` field uses a Zod `.refine()` to reject it on setup/close phases. This means the refined schema type is different from the base — may need `.superRefine()` to preserve type inference.
- **task_rules conditional** — when any template phase has `expansion: agent`, the global task_rules swap "Do NOT use TaskCreate" for "TaskCreate is allowed for agent-expanded phases only." This is a string replacement in guidance.ts, not a per-phase mechanism.
- **Stop condition backwards compat** — `z.union([z.enum(TYPES), z.object({...})])` means existing kata.yaml string arrays work as-is. No migration step needed.
- **`$ref` dollar sign** — access with bracket notation: `step['$ref']`. Zod handles it fine as a property key.
- **{placeholder} vs vars** — Steps.yaml `{placeholder}` is for config values resolved by `resolvePlaceholders()`. `vars` on template steps are for template-level overrides resolved first by `resolveStepRef()`. Don't confuse the two.
- **Freeform B8 exemption** — freeform has `phases: []` and no steps. The "every template has at least one skill: step" verification in B8 must exclude freeform.

### Reference Docs

- [#45 Spec: Skills-Based Methodology](planning/specs/45-skills-based-methodology.md) — absorbed in full, this spec supersedes
- [Blocks + Skills Two-Tier Architecture Research](planning/research/2026-04-06-blocks-and-skills-architecture.md)
- [Skills Structure Evaluation](planning/research/2026-04-06-skills-structure-deep-research.md)
- [Tasks + Gates + Skills Composition Research](planning/research/2026-04-06-tasks-gates-skills-composition.md)
