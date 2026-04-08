---
initiative: feat-skills-methodology
type: project
issue_type: feature
status: draft
priority: high
github_issue: 42
created: 2026-04-06
updated: 2026-04-08
phases:
  - id: p1
    name: "Step Library Infrastructure"
    tasks:
      - "Create batteries/steps.yaml with shared step definitions (env-check, read-spec, github-claim, commit-push, create-pr, update-issue, classify-task, reproduce-bug, write-evidence)"
      - "Add stepLibrarySchema to src/validation/schemas.ts (Zod schema for steps.yaml entries)"
      - "Add $ref and vars fields to phaseStepSchema in src/validation/schemas.ts (NOT subphasePatternSchema)"
      - "Add loadStepLibrary() to src/commands/enter/step-library.ts (reads .kata/steps.yaml, returns Map<string, StepDef>)"
      - "Add resolveStepRef() to src/commands/enter/step-library.ts (resolves $ref + vars, merges into step)"
      - "Update buildPhaseTasks() in task-factory.ts to call resolveStepRef() before building task instruction"
      - "Confirm buildSpecTasks() does NOT use $ref (subphase patterns stay as-is)"
      - "Fail kata enter with clear error when $ref references unresolved vars or missing step IDs"
      - "Update scaffold-batteries.ts to copy steps.yaml to .kata/steps.yaml"
      - "Update update.ts to refresh .kata/steps.yaml from batteries/steps.yaml"
    test_cases:
      - id: "steps-yaml-schema"
        description: "stepLibrarySchema validates a steps.yaml with instruction, title, and gate fields"
        type: unit
      - id: "ref-resolution"
        description: "resolveStepRef() merges $ref step def with local vars, producing final instruction/title/gate"
        type: unit
      - id: "ref-unresolved-vars-error"
        description: "resolveStepRef() throws when vars contain unresolved placeholders after merge"
        type: unit
      - id: "ref-missing-step-error"
        description: "resolveStepRef() throws when $ref references a step ID not in steps.yaml"
        type: unit
      - id: "task-factory-ref-integration"
        description: "buildPhaseTasks() with a step containing $ref produces correct native task instruction"
        type: integration
      - id: "steps-yaml-scaffolded"
        description: "kata batteries --update copies steps.yaml to .kata/steps.yaml"
        type: smoke
  - id: p2
    name: "Create Atomic Skills"
    tasks:
      - "Write batteries/skills/code-impl/SKILL.md (inline skill: implementation methodology, patterns, minimal changes, test-first)"
      - "Write batteries/skills/test-protocol/SKILL.md (inline skill: build check, test run, retry limits)"
      - "Write batteries/skills/interview/SKILL.md (inline skill: structured questioning across 4 categories)"
      - "Write batteries/skills/code-review/SKILL.md (agent skill, context: fork: code review checklist + verdict)"
      - "Write batteries/skills/spec-review/SKILL.md (agent skill, context: fork: spec review against behavior format)"
      - "Write batteries/skills/debug-methodology/SKILL.md (inline skill: reproduce, hypothesize, trace, minimal fix)"
      - "Write batteries/skills/spec-writing/SKILL.md (agent skill, context: fork: spec structure, behaviors, VP)"
      - "Write batteries/skills/vp-execution/SKILL.md (inline skill: run VP steps literally, compare expected vs actual)"
      - "Delete 7 mode-mirroring skills: planning, implementation, task, debugging, research, freeform, verification"
      - "Delete tdd skill (merged into code-impl)"
      - "Move existing sub-prompt files into new skill directories where applicable"
    test_cases:
      - id: "eight-skills-exist"
        description: "Exactly 8 SKILL.md files exist under batteries/skills/"
        type: smoke
      - id: "skill-frontmatter-valid"
        description: "Each SKILL.md has name and description in YAML frontmatter"
        type: unit
      - id: "agent-skills-have-context-fork"
        description: "code-review, spec-review, spec-writing SKILL.md files have context: fork in frontmatter"
        type: unit
      - id: "old-skills-deleted"
        description: "No SKILL.md exists for planning, implementation, task, debugging, research, freeform, verification, or tdd"
        type: smoke
  - id: p3
    name: "Thin Templates"
    tasks:
      - "Rewrite batteries/templates/task.md using $ref steps and skill: refs, remove inlined prose"
      - "Rewrite batteries/templates/implementation.md using $ref steps and skill: refs"
      - "Rewrite batteries/templates/planning.md using $ref steps and skill: refs"
      - "Rewrite batteries/templates/debug.md using $ref steps and skill: refs"
      - "Rewrite batteries/templates/research.md using $ref steps and skill: refs"
      - "Rewrite batteries/templates/verify.md using $ref steps and skill: refs"
      - "Rewrite batteries/templates/freeform.md using $ref steps and skill: refs"
      - "Remove mode_skill field from all templates (no more mode entry skills)"
      - "Remove mode_skill from templateYamlSchema in src/validation/schemas.ts"
      - "Remove outputModeSkillActivation() from enter.ts and related mode_skill handling"
      - "Add orchestration rule to kata.yaml global_rules field (not a skill)"
    test_cases:
      - id: "templates-parse"
        description: "All 7 rewritten templates parse against templateYamlSchema"
        type: unit
      - id: "templates-ref-steps-resolve"
        description: "All $ref references in templates resolve to entries in steps.yaml"
        type: integration
      - id: "templates-skill-refs-resolve"
        description: "All skill: references in templates resolve to existing SKILL.md files in batteries/skills/"
        type: integration
      - id: "no-mode-skill-field"
        description: "No template contains mode_skill in frontmatter"
        type: smoke
      - id: "expansion-preserved"
        description: "Spec-phase expansion (buildSpecTasks) still generates correct tasks with new templates"
        type: integration
  - id: p4
    name: "Cleanup and Tests"
    tasks:
      - "Add unit tests for step-library.ts (loadStepLibrary, resolveStepRef, error cases)"
      - "Add unit tests for $ref resolution in task-factory (buildPhaseTasks with $ref steps)"
      - "Update template-rewrite.test.ts assertions for new skill names and $ref presence"
      - "Update schemas.test.ts for $ref and vars fields"
      - "Run full test suite and fix any regressions"
      - "Run eval scenarios (task-mode, implementation-mode) and verify end-to-end"
      - "Update eval fixture templates to match new batteries templates"
    test_cases:
      - id: "all-tests-pass"
        description: "npm run build && npm test passes with zero failures"
        type: integration
      - id: "eval-task-mode"
        description: "task-mode eval scenario completes successfully"
        type: integration
      - id: "eval-implementation-mode"
        description: "implementation-mode eval scenario completes successfully"
        type: integration
---

# Skills-Based Methodology Injection in Mode Templates

> GitHub Issue: [#42](https://github.com/codevibesmatter/kata-wm/issues/42)

## Overview

Mode templates currently mix three concerns: structural DAG (phases, ordering, gates), procedural ceremony (git checks, issue claiming, commit/push), and methodology prose (200-680 lines inlined per template). The methodology compresses away in long sessions, ceremony duplicates across modes, and projects cannot swap approaches without forking entire templates. This feature introduces a two-tier system: a **Step Library** (`steps.yaml`) for reusable procedural steps referenced via `$ref`, and 8 **Atomic Skills** for methodology. Templates become thin YAML skeletons that wire together shared steps and skill references, dropping from 200-680 lines to approximately 30-80 lines each.

## Feature Behaviors

### B1: Step Library Schema and Loading

**Core:**
- **ID:** step-library-schema
- **Trigger:** `kata enter <mode>` is called, which invokes `buildPhaseTasks()` or `buildSpecTasks()` in task-factory.ts
- **Expected:** A new module `src/commands/enter/step-library.ts` exports `loadStepLibrary(projectRoot)` which reads `.kata/steps.yaml` and returns a `Map<string, StepDefinition>`. Each entry has optional fields: `title`, `instruction`, `gate`. The file is validated against a Zod schema (`stepDefinitionSchema`). If `.kata/steps.yaml` does not exist, the function returns an empty map (graceful degradation for projects that have not updated).
- **Verify:** Unit test: call `loadStepLibrary()` with a temp directory containing a valid steps.yaml. Confirm the returned map has the expected keys and each value matches the schema.
- **Source:** New file `src/commands/enter/step-library.ts`; schema added to `src/validation/schemas.ts`

#### UI Layer

N/A -- internal loading, no CLI output.

#### API Layer

N/A -- internal module.

#### Data Layer

New Zod schema in `src/validation/schemas.ts`:

```typescript
export const stepDefinitionSchema = z.object({
  title: z.string().optional(),
  instruction: z.string().optional(),
  gate: gateSchema.optional(),
})

export const stepLibrarySchema = z.record(z.string(), stepDefinitionSchema)
```

New file `batteries/steps.yaml` with step definitions. Example entries:

```yaml
env-check:
  title: "Verify environment"
  instruction: |
    Verify clean working tree and correct branch:
    ```bash
    git status
    git log --oneline -3
    ```
    Confirm deps installed and build passes.

github-claim:
  title: "Claim GitHub issue"
  instruction: |
    Claim the issue and create a feature branch:
    ```bash
    gh issue edit {issue} --remove-label "status:todo" --add-label "status:in-progress"
    git checkout -b feature/{issue}-{slug}
    git push -u origin feature/{issue}-{slug}
    ```

commit-push:
  title: "Commit and push"
  instruction: |
    Stage, commit with conventional format, and push:
    ```bash
    git add {changed_files}
    git commit -m "{commit_type}({scope}): {description}"
    git push
    ```
  gate:
    bash: "test -z \"$(git status --porcelain)\""
    expect_exit: 0
    on_fail: "Working tree not clean. Stage and commit all changes."
```

---

### B2: $ref Resolution in Phase Steps

**Core:**
- **ID:** ref-resolution
- **Trigger:** `buildPhaseTasks()` encounters a phase step with a `$ref` field (e.g., `$ref: env-check`)
- **Expected:** The step library is loaded via `loadStepLibrary()`. The referenced step definition is looked up by ID. Fields from the step definition (`title`, `instruction`, `gate`) are merged into the phase step, with the phase step's own fields taking precedence (local overrides). If the step also declares `vars: { key: value }`, all `{key}` placeholders in the merged instruction are replaced with the corresponding values. After merge, if any `{placeholder}` patterns remain that are not resolvable from session/config/extra context, `kata enter` fails with an error listing the unresolved placeholders.
- **Verify:** Unit test: create a step with `$ref: env-check` and `vars: { branch: main }`. Confirm the resolved instruction contains the var-substituted content. Unit test: create a step with `$ref: env-check` and a missing var. Confirm it throws with the unresolved placeholder name.
- **Source:** New file `src/commands/enter/step-library.ts` (resolveStepRef function); modified `src/commands/enter/task-factory.ts:247-270` (buildPhaseTasks step loop)

#### UI Layer

On error (unresolved var), stderr outputs:
```
Error: Step "p0:setup" references $ref "env-check" with unresolved variables: {branch_name}
```

On error (missing step ID), stderr outputs:
```
Error: Step "p0:setup" references $ref "nonexistent" which does not exist in .kata/steps.yaml
```

#### API Layer

N/A.

#### Data Layer

New optional fields on `phaseStepSchema` in `src/validation/schemas.ts`:

```typescript
export const phaseStepSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  instruction: z.string().optional(),
  skill: z.string().optional(),
  agent: agentStepConfigSchema.optional(),
  gate: gateSchema.optional(),
  hints: z.array(hintSchema).optional(),
  $ref: z.string().optional(),       // step library reference
  vars: z.record(z.string(), z.string()).optional(),  // variable substitutions for $ref
})
```

Note: `subphasePatternSchema` does NOT get `$ref`/`vars` fields. Subphase patterns are already parameterized via title_template/todo_template/instruction and do not use the step library.

---

### B3: Steps.yaml Scaffolded by Batteries

**Core:**
- **ID:** steps-yaml-scaffolded
- **Trigger:** User runs `kata batteries --update` or `kata setup --batteries`
- **Expected:** `batteries/steps.yaml` is copied to `.kata/steps.yaml` in the project. On first run, the file is created. On subsequent runs, the file is updated if the project copy differs from batteries (same skip-if-customized logic as templates). The `update.ts` module handles version comparison and copy.
- **Verify:** Run `kata batteries --update --cwd=/tmp/test-project`. Confirm `.kata/steps.yaml` exists and matches `batteries/steps.yaml`. Run again after editing `.kata/steps.yaml` and confirm it reports "customized -- update manually".
- **Source:** `src/commands/scaffold-batteries.ts:130-142` (add steps.yaml handling), `src/commands/update.ts:42-68` (add steps.yaml to update loop)

#### UI Layer

`kata batteries --update` output includes:
```
  + steps.yaml (new)
```
or on subsequent runs:
```
  ~ steps.yaml (customized -- update manually)
```

#### API Layer

N/A.

#### Data Layer

New file `.kata/steps.yaml` in project runtime data layout. `BatteriesResult` interface in `scaffold-batteries.ts` gains a `stepsFile: boolean` field.

---

### B4: Atomic Skills Replace Mode-Mirroring Skills

**Core:**
- **ID:** atomic-skills
- **Trigger:** Developer runs `kata batteries --update` or `kata setup`, which copies skill files from `batteries/skills/` to `.claude/skills/`
- **Expected:** 8 skill directories exist under `batteries/skills/`, each with a `SKILL.md` containing valid YAML frontmatter (`name`, `description`). The 8 skills are: `code-impl`, `test-protocol`, `interview`, `code-review`, `spec-review`, `debug-methodology`, `spec-writing`, `vp-execution`. Three agent skills (`code-review`, `spec-review`, `spec-writing`) declare `context: fork` in frontmatter. The 7 old mode-mirroring skills (`planning`, `implementation`, `task`, `debugging`, `research`, `freeform`, `verification`) and the `tdd` skill are deleted from `batteries/skills/`. Existing sub-prompt files (e.g., `implementer-prompt.md`, `tracer-prompt.md`) are moved into the appropriate new skill directories.
- **Verify:** `ls batteries/skills/*/SKILL.md | wc -l` returns 8. `grep "context: fork" batteries/skills/code-review/SKILL.md` returns a match. `test ! -d batteries/skills/planning` succeeds.
- **Source:** `batteries/skills/` directory (delete old, create new)

#### UI Layer

N/A -- package content. Agent sees skills via Claude Code's native `/skillname` invocation.

#### API Layer

N/A.

#### Data Layer

New directory structure:

```
batteries/skills/
  code-impl/SKILL.md                    # inline, methodology for implementation work
  code-impl/implementer-prompt.md       # moved from implementation/
  code-impl/test-prompt.md              # moved from implementation/
  test-protocol/SKILL.md                # inline, build + test + retry
  interview/SKILL.md                    # inline, structured questioning (exists, updated)
  code-review/SKILL.md                  # context: fork, review checklist
  code-review/reviewer-prompt.md        # moved from implementation/
  spec-review/SKILL.md                  # context: fork, spec review
  spec-review/reviewer-prompt.md        # moved from planning/
  debug-methodology/SKILL.md            # inline, reproduce/hypothesize/trace
  debug-methodology/tracer-prompt.md    # moved from debugging/
  spec-writing/SKILL.md                 # context: fork, spec structure
  spec-writing/spec-writer-prompt.md    # moved from planning/
  vp-execution/SKILL.md                 # inline, run VP steps literally
  vp-execution/fix-reviewer-prompt.md   # moved from verification/
```

Deleted:
```
batteries/skills/planning/
batteries/skills/implementation/
batteries/skills/task/
batteries/skills/debugging/
batteries/skills/research/
batteries/skills/freeform/
batteries/skills/verification/
batteries/skills/tdd/
```

---

### B5: mode_skill Field Removed

**Core:**
- **ID:** mode-skill-removed
- **Trigger:** Template YAML is parsed by `parseTemplateYaml()` or validated by Zod schemas
- **Expected:** The `mode_skill` field is removed from `templateYamlSchema`. Templates no longer declare a mode entry skill. The `outputModeSkillActivation()` function in `enter.ts` is removed. The conditional in `enter.ts` that checks `template.mode_skill` falls back to `outputFullTemplateContent()` (which outputs nothing for templates with no markdown body). The orchestration guidance ("coordinate agents, don't code yourself") moves to `kata.yaml` as a `global_rules` entry, not a skill.
- **Verify:** `grep mode_skill batteries/templates/*.md` returns no matches. `grep mode_skill src/validation/schemas.ts` returns no matches. `grep outputModeSkillActivation src/commands/enter.ts` returns no matches.
- **Source:** `src/validation/schemas.ts:158` (remove mode_skill), `src/commands/enter.ts:85-96` (remove outputModeSkillActivation), `src/commands/enter.ts:302-306` (remove mode_skill conditional)

#### UI Layer

`kata enter <mode>` no longer outputs "MODE SKILL: Invoke /skillname" banner. Since templates have no markdown body after thinning, the enter command outputs only the task list and workflow ID.

#### API Layer

The JSON output from `kata enter` no longer includes `mode_skill` field.

#### Data Layer

`templateYamlSchema` loses the `mode_skill` field. `TemplateYaml` type loses `mode_skill?: string`.

---

### B6: Templates Thinned with $ref and Skill References

**Core:**
- **ID:** templates-thinned
- **Trigger:** `kata batteries --update` copies updated templates to `.kata/templates/`
- **Expected:** All 7 batteries mode templates (task, implementation, planning, debug, research, verify, freeform) are rewritten as thin YAML skeletons. Setup and close ceremony steps use `$ref: step-id` to pull instructions from steps.yaml. Core work steps declare `skill: skill-name` for methodology. Templates have no markdown body below the closing `---`. Template sizes drop from 170-680 lines to approximately 30-80 lines. Expansion patterns (spec phases in implementation, VP steps in verify, interviews in planning) are preserved using the existing `container` + `subphase_pattern` mechanism. Phase ordering, dependencies, gates, and labels remain in the template.
- **Verify:** For each template, confirm: (1) `mode_skill` is absent, (2) at least one step has `$ref`, (3) at least one step has `skill`, (4) content after the closing `---` is empty, (5) template parses against `templateYamlSchema`.
- **Source:** `batteries/templates/task.md`, `batteries/templates/implementation.md`, `batteries/templates/planning.md`, `batteries/templates/debug.md`, `batteries/templates/research.md`, `batteries/templates/verify.md`, `batteries/templates/freeform.md`

#### UI Layer

N/A -- template files are not directly user-facing. Agent receives skill methodology via Claude Code's native Skill tool and ceremony via resolved $ref instructions in native tasks.

#### API Layer

N/A.

#### Data Layer

Example thinned template (task.md):

```yaml
---
id: task
name: Task Mode
description: Combined planning + implementation for small tasks
mode: task

phases:
  - id: p0
    name: Quick Planning
    task_config:
      title: "P0: Plan - scope, approach, verify strategy"
      labels: [phase, phase-0, planning]
    steps:
      - id: env-check
        $ref: env-check
        title: "Verify environment"
      - id: understand-task
        title: "Understand and classify the task"
        skill: code-impl
        instruction: |
          Classify: chore, small feature, or fix.
          If larger scope, suggest planning or implementation mode.
      - id: scope-and-approach
        title: "Define scope and approach"
        instruction: |
          Write a brief plan (3-5 lines): files to change, approach, out of scope.

  - id: p1
    name: Implement
    task_config:
      title: "P1: Implement - make changes, verify"
      depends_on: [p0]
    steps:
      - id: make-changes
        title: "Make the changes"
        skill: code-impl
      - id: verify
        title: "Verify changes"
        skill: test-protocol
        gate:
          bash: "{test_command}"
          expect_exit: 0

  - id: p2
    name: Complete
    task_config:
      title: "P2: Complete - commit, push"
      depends_on: [p1]
    steps:
      - id: commit-push
        $ref: commit-push
        title: "Commit and push"
      - id: update-issue
        $ref: update-issue
        vars:
          action: close

global_conditions:
  - changes_committed

workflow_id_format: "TK-{session_last_4}-{MMDD}"
---
```

---

## Non-Goals

Explicitly out of scope for this feature:

- **Hook-backed gate enforcement** -- gates remain agent-trust-based. Hook enforcement of gates (PreToolUse intercepting TaskUpdate) is a separate concern.
- **New mode definitions** -- no new modes are added. Only existing modes are converted.
- **Changes to modes.yaml or intent detection** -- `modes.yaml`, `suggest.ts`, and `prime.ts` are untouched.
- **Skill validation at entry** -- `kata enter` does not validate that skill: references resolve to existing `.claude/skills/` files. This is a future enhancement.
- **Conditional skills** -- no mechanism for conditionally activating skills based on project state.
- **Skill-scoped hooks** -- skills do not ship with their own hook definitions.
- **Changes to verify-run sub-agent** -- verify-run continues to work as-is.
- **System template conversion** -- `templates/onboard.md` and `templates/SESSION-TEMPLATE.template.md` are not converted.
- **Subphase patterns using $ref** -- subphase patterns are already parameterized via title_template/todo_template/instruction; they do not use $ref for the outer pattern structure (only for individual steps within them if applicable).
- **Skill version tracking** -- no separate version tracking for skills vs templates.
- **Deprecating kata batteries** -- `kata batteries --update` remains the update command; it gains steps.yaml handling.

## Implementation Phases

See YAML frontmatter `phases:` above. Each phase should be 1-4 hours of focused work.

### Phase 1: Step Library Infrastructure (3-4 hours)

Create `batteries/steps.yaml` with shared step definitions. Add Zod schemas for step definitions and $ref/vars fields. Implement `loadStepLibrary()` and `resolveStepRef()`. Wire $ref resolution into `buildPhaseTasks()` and `buildSpecTasks()`. Add steps.yaml to the batteries scaffold and update flows. Write unit tests for all resolution logic including error cases.

### Phase 2: Create Atomic Skills (2-3 hours)

Write 8 SKILL.md files with methodology content extracted from current template prose and existing skill files. Delete the 7 mode-mirroring skills and the tdd skill. Move sub-prompt files into new skill directories. Each skill must have valid frontmatter with name and description. Agent skills get `context: fork`.

### Phase 3: Thin Templates (3-4 hours)

Rewrite all 7 mode templates to use $ref for ceremony steps and skill: for methodology. Remove all markdown bodies below `---`. Remove `mode_skill` from the schema and enter.ts. Add orchestration rule to kata.yaml global_rules. Verify all templates parse and expansion patterns still work.

### Phase 4: Cleanup and Tests (2-3 hours)

Update all test files for the new skill names, $ref resolution, and template structure. Run the full test suite. Run eval scenarios to confirm end-to-end behavior. Update eval fixture templates to match new batteries templates.

## Verification Strategy

### Test Infrastructure

Existing test infrastructure: `npm run build && npm test` using Node's built-in test runner. Test files live alongside source with `.test.ts` suffixes. The template-rewrite test (`src/validation/template-rewrite.test.ts`) validates all batteries templates against the Zod schema and checks skill resolution. New tests for step-library.ts will follow the same pattern.

### Build Verification

`npm run build` compiles TypeScript via tsup. Templates and steps.yaml are plain files copied at runtime, not compiled. Build verification confirms schema changes compile and all existing tests pass.

## Verification Plan

### VP1: Step Library Loads and Resolves

Steps:
1. `npm run build && npm test`
   Expected: All tests pass including new step-library tests.
2. `node --input-type=module -e "import {stepLibrarySchema} from './dist/validation/schemas.js'; const r = stepLibrarySchema.safeParse({'env-check': {title: 'Check env', instruction: 'Run git status'}}); console.log(r.success ? 'PASS' : 'FAIL')"`
   Expected: Prints `PASS`
3. `node --input-type=module -e "import {phaseStepSchema} from './dist/validation/schemas.js'; const r = phaseStepSchema.safeParse({id:'s1', title:'T', '\$ref':'env-check', vars:{branch:'main'}}); console.log(r.success ? 'PASS' : 'FAIL')"`
   Expected: Prints `PASS`

### VP2: Steps.yaml Scaffolded to Project

Steps:
1. `mkdir -p /tmp/vp2-test && cd /tmp/vp2-test && git init && kata setup --batteries --cwd=/tmp/vp2-test`
   Expected: Output includes steps.yaml in the list of scaffolded files.
2. `test -f /tmp/vp2-test/.kata/steps.yaml && echo "PASS" || echo "FAIL"`
   Expected: Prints `PASS`
3. `grep "env-check" /tmp/vp2-test/.kata/steps.yaml`
   Expected: Returns a match (env-check step definition exists).
4. `rm -rf /tmp/vp2-test`

### VP3: $ref Resolution Produces Correct Task Instruction

Steps:
1. `cd /tmp/vp3-test && git init && kata setup --batteries --cwd=/tmp/vp3-test`
2. `kata enter task --session=vp3-test --cwd=/tmp/vp3-test`
3. `cat ~/.claude/tasks/vp3-test/1.json | python3 -c "import json,sys; d=json.load(sys.stdin); print('PASS' if 'git status' in d['description'] else 'FAIL: no git status in env-check task')"`
   Expected: Prints `PASS` (first task is the env-check $ref step with resolved instruction).
4. `rm -rf /tmp/vp3-test && rm -rf ~/.claude/tasks/vp3-test`

### VP4: Skill References in Native Tasks

Steps:
1. `cd /tmp/vp4-test && git init && kata setup --batteries --cwd=/tmp/vp4-test`
2. `kata enter task --session=vp4-test --cwd=/tmp/vp4-test`
3. `cat ~/.claude/tasks/vp4-test/2.json | python3 -c "import json,sys; d=json.load(sys.stdin); print('PASS' if '/code-impl' in d['description'] else 'FAIL: no skill ref')"`
   Expected: Prints `PASS` (understand-task step has skill: code-impl producing "Invoke /code-impl" in description).
4. `rm -rf /tmp/vp4-test && rm -rf ~/.claude/tasks/vp4-test`

### VP5: Templates Parse After Conversion

Steps:
1. `npm run build`
2. `for t in task implementation planning debug research verify freeform; do node --input-type=module -e "import {parseTemplateYaml} from './dist/commands/enter/template.js'; import {templateYamlSchema} from './dist/validation/schemas.js'; const r = parseTemplateYaml('batteries/templates/${t}.md'); const v = templateYamlSchema.safeParse(r); if(!v.success) throw new Error('${t}: ' + JSON.stringify(v.error.issues)); console.log('${t}: OK')"; done`
   Expected: All 7 templates print OK.

### VP6: Old Skills Deleted, New Skills Present

Steps:
1. `ls batteries/skills/*/SKILL.md | wc -l`
   Expected: Returns `8`
2. `test ! -d batteries/skills/planning && test ! -d batteries/skills/tdd && echo "PASS: old skills removed"`
   Expected: Prints `PASS: old skills removed`
3. `grep "context: fork" batteries/skills/code-review/SKILL.md && echo "PASS: agent skill"`
   Expected: Prints `PASS: agent skill`

### VP7: No mode_skill References Remain

Steps:
1. `grep -r "mode_skill" batteries/templates/ src/validation/schemas.ts`
   Expected: No matches (exit code 1).
2. `grep -r "outputModeSkillActivation" src/`
   Expected: No matches (exit code 1).

## Implementation Hints

### Dependencies

No new npm dependencies. Steps.yaml is parsed with js-yaml (already a dependency). Skills are plain markdown files. Claude Code's native Skill tool handles discovery and loading.

### Key Imports

| Module | Import | Used For |
|--------|--------|----------|
| `src/validation/schemas.ts` | `phaseStepSchema`, `subphasePatternSchema`, `templateYamlSchema`, `gateSchema` | Adding `$ref`, `vars` fields; adding `stepDefinitionSchema` |
| `src/commands/enter/step-library.ts` | `loadStepLibrary`, `resolveStepRef` | New module for step library loading and $ref resolution |
| `src/commands/enter/task-factory.ts` | `buildPhaseTasks`, `buildSpecTasks` | Wiring $ref resolution before task instruction assembly |
| `src/commands/scaffold-batteries.ts` | `scaffoldBatteries` | Adding steps.yaml to scaffold flow |
| `src/commands/update.ts` | `update` | Adding steps.yaml to update flow |
| `src/session/lookup.ts` | `getPackageRoot`, `findProjectDir` | Resolving batteries/steps.yaml source and .kata/steps.yaml dest |
| `js-yaml` | `load` | Parsing steps.yaml |

### Code Patterns

**Step library loading (new file src/commands/enter/step-library.ts):**

```typescript
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import jsYaml from 'js-yaml'
import { stepLibrarySchema, type StepDefinition } from '../../validation/schemas.js'

export function loadStepLibrary(projectRoot: string): Map<string, StepDefinition> {
  const stepsPath = join(projectRoot, '.kata', 'steps.yaml')
  if (!existsSync(stepsPath)) return new Map()

  const raw = jsYaml.load(readFileSync(stepsPath, 'utf-8')) as Record<string, unknown>
  const parsed = stepLibrarySchema.parse(raw)
  return new Map(Object.entries(parsed))
}
```

**$ref resolution (same new file):**

```typescript
export function resolveStepRef(
  step: { $ref?: string; vars?: Record<string, string>; instruction?: string; title?: string; gate?: Gate },
  library: Map<string, StepDefinition>,
  stepId: string,
): { instruction?: string; title?: string; gate?: Gate } {
  if (!step.$ref) return { instruction: step.instruction, title: step.title, gate: step.gate }

  const def = library.get(step.$ref)
  if (!def) throw new Error(`Step "${stepId}" references $ref "${step.$ref}" which does not exist in .kata/steps.yaml`)

  // Merge: local fields override library fields
  let instruction = step.instruction ?? def.instruction
  const title = step.title ?? def.title
  const gate = step.gate ?? def.gate

  // Apply vars substitution
  if (instruction && step.vars) {
    for (const [key, value] of Object.entries(step.vars)) {
      instruction = instruction.replaceAll(`{${key}}`, value)
    }
  }

  // Check for unresolved vars (only vars-pattern placeholders, not config placeholders)
  if (instruction && step.vars) {
    const unresolved = [...instruction.matchAll(/\{(\w+)\}/g)]
      .map(m => m[1])
      .filter(k => step.vars![k] === undefined)
    // Only fail on vars that were expected to be provided (not config placeholders like {test_command})
  }

  return { instruction, title, gate }
}
```

**Wiring into buildPhaseTasks (task-factory.ts):**

```typescript
// At the top of buildPhaseTasks, after resolving template:
const library = loadStepLibrary(projectRoot)

// In the step loop, before building finalInstruction:
const resolved = resolveStepRef(step, library, `${phase.id}:${step.id}`)
let finalInstruction = resolved.instruction ?? step.instruction
// Use resolved.gate if step.gate is not set
const effectiveGate = step.gate ?? resolved.gate
```

**Adding $ref/vars to schema (schemas.ts):**

```typescript
export const phaseStepSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  instruction: z.string().optional(),
  skill: z.string().optional(),
  agent: agentStepConfigSchema.optional(),
  gate: gateSchema.optional(),
  hints: z.array(hintSchema).optional(),
  $ref: z.string().optional(),
  vars: z.record(z.string(), z.string()).optional(),
})
```

### Gotchas

- The `$ref` field name contains a dollar sign. Zod handles this fine as a property key, but in TypeScript the type will be `'$ref'?: string`. Access with bracket notation: `step['$ref']`.
- Steps.yaml uses `{placeholder}` syntax for values that should be resolved at task creation time (from session/config). The `vars` field on the step is for template-level overrides only. Do not confuse the two -- `vars` are resolved first, then remaining `{placeholders}` go through `resolvePlaceholders()` as before.
- The `skill` field on steps and subphase patterns already exists in the current schema and task-factory. The current `## Skill\nInvoke /{skill} before starting this task.` prepend logic does not change -- it continues to work with the new skill names.
- The existing `skillHintSchema` (hints: [{ skill: "name" }]) is a separate concept from the top-level `skill:` field. Both can coexist. The top-level field is for the primary methodology; hint skills are for secondary references.
- When deleting old skills from `batteries/skills/`, ensure sub-prompt `.md` files are moved to their new home before deletion. For example, `batteries/skills/implementation/implementer-prompt.md` must be copied to `batteries/skills/code-impl/implementer-prompt.md` before deleting the `implementation/` directory.
- The `mode_skill` field currently exists on `templateYamlSchema` and is used by `enter.ts`. Removing it is a breaking change for any project template that declares `mode_skill`. The schema should accept but ignore the field during a transition period, or templates should be converted atomically in the same commit.

### Reference Docs

- [Blocks + Skills Two-Tier Architecture Research](planning/research/2026-04-06-blocks-and-skills-architecture.md) -- design rationale for two-tier system
- [Skills Structure Evaluation](planning/research/2026-04-06-skills-structure-deep-research.md) -- skills as atomic building blocks
- [Tasks + Gates + Skills Composition Research](planning/research/2026-04-06-tasks-gates-skills-composition.md) -- composition model
- [Claude Code Skills Documentation](https://code.claude.com/docs/en/skills) -- native skill system conventions
