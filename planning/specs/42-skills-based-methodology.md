---
initiative: feat-skills-methodology
type: project
issue_type: feature
status: approved
priority: high
github_issue: 42
created: 2026-04-06
updated: 2026-04-06
approved: 2026-04-06
phases:
  - id: p1
    name: "Schema + Infrastructure"
    tasks:
      - "Add mode_skill field to templateYamlSchema in src/validation/schemas.ts"
      - "Add skill field to phaseStepSchema and subphasePatternSchema in src/validation/schemas.ts"
      - "Add mode_skill to TemplateYaml interface in src/yaml/types.ts"
      - "Add getProjectSkillsDir() to src/session/lookup.ts"
      - "Update scaffoldBatteries() in src/commands/scaffold-batteries.ts to copy batteries/skills/"
      - "Update applySetup() in src/commands/setup.ts to copy batteries/skills/ on fresh setup"
      - "Update task-factory.ts renderHints and buildPhaseTasks/buildSpecTasks to emit skill activation instructions"
      - "Update enter.ts to emit mode_skill activation instruction instead of full template markdown body"
    test_cases:
      - id: "schema-skill-field"
        description: "phaseStepSchema accepts optional skill field"
        type: unit
      - id: "schema-mode-skill-field"
        description: "templateYamlSchema accepts optional mode_skill field"
        type: unit
      - id: "skills-copied-on-setup"
        description: "kata setup --batteries copies skills to .claude/skills/"
        type: integration
  - id: p2
    name: "Create Skills Content"
    tasks:
      - "Create batteries/skills/ directory with 12 skill SKILL.md files"
      - "Extract mode skills from template markdown bodies: task-mode, implementation-mode, planning-mode, debug-mode, research-mode"
      - "Extract step skills from template instructions: implementation, code-review, interview, spec-writing, debug-methodology"
      - "Migrate existing quick-planning and tdd skills from eval fixture to batteries/skills/"
    test_cases:
      - id: "skills-exist"
        description: "All 12 SKILL.md files exist under batteries/skills/"
        type: smoke
      - id: "skill-frontmatter"
        description: "Each SKILL.md has valid name and description in YAML frontmatter"
        type: unit
  - id: p3
    name: "Convert Templates to Pure YAML"
    tasks:
      - "Convert batteries/templates/task.md: add mode_skill, add skill per step, remove markdown body"
      - "Convert batteries/templates/implementation.md: add mode_skill, add skill per subphase, remove markdown body"
      - "Convert batteries/templates/planning.md: add mode_skill, add skill per step, remove markdown body"
      - "Convert batteries/templates/debug.md: add mode_skill, add skill per step, remove markdown body"
      - "Convert batteries/templates/research.md: add mode_skill, add skill per step, remove markdown body"
    test_cases:
      - id: "templates-parse"
        description: "All converted templates pass templateYamlSchema validation"
        type: unit
      - id: "templates-no-markdown"
        description: "Converted templates have no markdown body below frontmatter"
        type: smoke
  - id: p4
    name: "Update Eval Harness"
    tasks:
      - "Remove eval-fixtures/tanstack-start-skills/ fixture"
      - "Remove eval/scenarios/skill-activation.ts and skill-activation-control.ts prototype scenarios"
      - "Remove skill-eval mode from eval fixture configs"
      - "Add skill activation assertions to existing mode eval scenarios (task-mode, implementation-mode)"
      - "Verify skills are copied during fixture setup (kata setup --batteries)"
    test_cases:
      - id: "eval-skill-activation"
        description: "Existing mode eval scenarios verify skill activation"
        type: integration
      - id: "no-prototype-artifacts"
        description: "skill-eval mode, tanstack-start-skills fixture, and prototype scenarios are removed"
        type: smoke
---

# Skills-Based Methodology Injection in Mode Templates

> GitHub Issue: [#42](https://github.com/codevibesmatter/kata-wm/issues/42)

## Overview

Mode templates currently mix structural concerns (phases, ordering, gates) with methodology prose (200-680 lines of markdown per template). This methodology is injected at session start and compresses away in long Claude Code sessions, reducing agent compliance. Projects cannot swap methodologies without forking entire templates.

This feature extracts all methodology content from templates into Claude Code native skills (`.claude/skills/<name>/SKILL.md`). Templates become pure YAML declaring `mode_skill:` (loaded at mode entry) and per-step `skill:` (loaded JIT). Skills are installed by `kata setup` and customizable by projects. Gates still enforce quality bars independently of methodology.

## Feature Behaviors

### B1: Skill Schema Fields

**Core:**
- **ID:** skill-schema-fields
- **Trigger:** A template YAML file is parsed by `parseTemplateYaml()` or validated by Zod schemas
- **Expected:** The `templateYamlSchema` accepts an optional `mode_skill: string` field. The `phaseStepSchema` and `subphasePatternSchema` accept an optional `skill: string` field. Existing templates without these fields continue to parse without errors.
- **Verify:** `npm run build && npm test` passes. A template with `mode_skill: implementation-mode` and a step with `skill: tdd` parses successfully. A template without either field also parses successfully.
- **Source:** `src/validation/schemas.ts` (phaseStepSchema, subphasePatternSchema, templateYamlSchema), `src/yaml/types.ts` (TemplateYaml interface)

#### UI Layer

N/A -- schema-only change, no CLI output differences.

#### API Layer

N/A -- internal schema validation, no external API.

#### Data Layer

New optional fields on existing Zod schemas:

```typescript
// templateYamlSchema — add:
mode_skill: z.string().optional()

// phaseStepSchema — add:
skill: z.string().optional()

// subphasePatternSchema — add:
skill: z.string().optional()
```

**Note:** `TemplateYaml` is defined in TWO places: a manual interface in `src/yaml/types.ts` AND as `z.infer<typeof templateYamlSchema>` in `src/validation/schemas.ts`. BOTH must be updated. The manual interface in `types.ts` gains `mode_skill?: string`. The Zod schema gains `mode_skill: z.string().optional()`. The `PhaseStep` and `SubphasePattern` types auto-derive from Zod via `z.infer<>`, so no manual type changes are needed for those.

---

### B2: Skills Directory in Batteries

**Core:**
- **ID:** batteries-skills-directory
- **Trigger:** Developer adds skill files to `batteries/skills/<name>/SKILL.md` in the kata package
- **Expected:** 12 skill directories exist under `batteries/skills/`, each containing a `SKILL.md` with valid YAML frontmatter (`name:` and `description:` fields). Five are mode skills (task-mode, implementation-mode, planning-mode, debug-mode, research-mode). Seven are step skills (quick-planning, tdd, implementation, code-review, interview, spec-writing, debug-methodology).
- **Verify:** `ls batteries/skills/*/SKILL.md | wc -l` returns 12. Each file has `---` delimited frontmatter with `name:` and `description:`.

#### UI Layer

N/A -- package content only, not user-facing.

#### API Layer

N/A.

#### Data Layer

New directory structure in the npm package:

```
batteries/skills/
  task-mode/SKILL.md
  implementation-mode/SKILL.md
  planning-mode/SKILL.md
  debug-mode/SKILL.md
  research-mode/SKILL.md
  quick-planning/SKILL.md
  tdd/SKILL.md
  implementation/SKILL.md
  code-review/SKILL.md
  interview/SKILL.md
  spec-writing/SKILL.md
  debug-methodology/SKILL.md
```

---

### B3: Skills Copied on Setup and Batteries Update

**Core:**
- **ID:** skills-copied-on-setup
- **Trigger:** User runs `kata setup --batteries` or `kata batteries --update`
- **Expected:** All skill directories from `batteries/skills/` are copied to `.claude/skills/` in the project. Existing skills are not overwritten on initial setup (matching template copy behavior). On `--update`, existing skills are overwritten with backups created. Skills follow the Claude Code native convention (`.claude/skills/<name>/SKILL.md`), so they are auto-discovered by Claude Code.
- **Verify:** Run `kata setup --batteries --cwd=/tmp/test-project` in a fresh directory, then `ls .claude/skills/*/SKILL.md | wc -l` returns 12. Run again with `kata batteries --update` and verify files are refreshed.
- **Source:** `src/commands/scaffold-batteries.ts:86` (scaffoldBatteries), `src/commands/setup.ts:337` (applySetup)

#### UI Layer

Setup output includes a new "Skills" section:

```
kata setup --batteries complete:
  ...
Batteries scaffolded:
  Skills (12):
    .claude/skills/task-mode/SKILL.md
    .claude/skills/implementation-mode/SKILL.md
    ...
```

#### API Layer

N/A.

#### Data Layer

`BatteriesResult` interface gains a `skills: string[]` field tracking copied skill names.

New helper in `src/session/lookup.ts`:

```typescript
export function getProjectSkillsDir(projectRoot?: string): string {
  const root = projectRoot || findProjectDir()
  return path.join(root, '.claude', 'skills')
}
```

---

### B4: Mode Skill Activation at Entry

**Core:**
- **ID:** mode-skill-activation-at-entry
- **Trigger:** User runs `kata enter <mode>` for a mode whose template declares `mode_skill:`
- **Expected:** Instead of outputting the full template markdown body to stderr (the current `outputFullTemplateContent` call), the enter command outputs a skill activation instruction: "Activate the /<mode_skill> skill to understand your role and workflow for this mode." The full markdown body is no longer emitted for templates that declare `mode_skill`. Templates without `mode_skill` continue to emit the full markdown body (backward compatibility).
- **Verify:** Run `kata enter task --session=test 2>&1 | grep "Activate"` and confirm it mentions `/task-mode`. Confirm the old 200+ line markdown body is NOT present in stderr.
- **Source:** `src/commands/enter.ts:719` (outputFullTemplateContent call)

#### UI Layer

Stderr output changes from a full template markdown dump to a concise skill activation instruction:

```
===============================================================================
  MODE SKILL: Activate /task-mode to understand your role and workflow.
===============================================================================
```

#### API Layer

The JSON output on stdout gains a `mode_skill` field when present:

```json
{
  "success": true,
  "mode": "task",
  "mode_skill": "task-mode",
  ...
}
```

#### Data Layer

N/A -- no state schema changes.

---

### B5: Step Skill in Task Instructions

**Core:**
- **ID:** step-skill-in-task-instructions
- **Trigger:** `buildPhaseTasks()` or `buildSpecTasks()` processes a step or subphase pattern that declares `skill: <name>`
- **Expected:** The generated native task description includes a "Skill" section instructing the agent to activate the named skill before starting the task. The section reads: `## Skill\nActivate /<name> before starting this task.` This section appears before the Hints section in the task description.
- **Verify:** Run `kata enter task --session=test --dry-run`, then read `~/.claude/tasks/test/1.json` and confirm the description contains `Activate /quick-planning`.
- **Source:** `src/commands/enter/task-factory.ts:239` (buildPhaseTasks step loop), `src/commands/enter/task-factory.ts:148` (buildSpecTasks pattern loop)

#### UI Layer

Native task description in `~/.claude/tasks/{sessionId}/{id}.json` includes:

```markdown
## Skill
Activate /quick-planning before starting this task.

## Hints
- **Read:** ...
```

#### API Layer

N/A -- native task files are the delivery mechanism.

#### Data Layer

N/A -- no schema changes. The `Task.instruction` string field carries the skill reference as markdown content.

---

### B6: Templates Converted to Pure YAML

**Core:**
- **ID:** templates-pure-yaml
- **Trigger:** `kata batteries --update` copies converted templates to `.kata/templates/`
- **Expected:** All five batteries templates (task.md, implementation.md, planning.md, debug.md, research.md) are converted to pure YAML frontmatter with no markdown body below the closing `---`. Each declares `mode_skill:` at the top level. Steps and subphase patterns that previously contained inline methodology prose now declare `skill:` instead, with only phase-specific `instruction:` text remaining for non-reusable guidance (e.g., "Create feature branch", "Commit and push"). Template sizes reduce by 68-85%.
- **Verify:** For each template in `batteries/templates/{task,implementation,planning,debug,research}.md`, confirm: (1) `grep "^mode_skill:" <file>` returns a value, (2) the file content after the closing `---` is empty or whitespace only, (3) `node -e "require('./dist/index.js')"` does not throw (templates still parse).
- **Source:** `batteries/templates/task.md`, `batteries/templates/implementation.md`, `batteries/templates/planning.md`, `batteries/templates/debug.md`, `batteries/templates/research.md`

#### UI Layer

N/A -- template files are not directly user-facing. Agent sees skill content via Claude Code's native Skill tool instead of compressed session-start context.

#### API Layer

N/A.

#### Data Layer

Template YAML gains `mode_skill:` field and per-step/subphase `skill:` fields. Example (task.md):

```yaml
---
id: task
name: Task Mode
mode: task
mode_skill: task-mode
phases:
  - id: p0
    name: Quick Planning
    task_config:
      title: "P0: Plan - scope, approach, verify strategy"
    steps:
      - id: understand-task
        title: "Understand and classify the task"
        skill: quick-planning
      - id: scope-and-approach
        title: "Define scope and approach"
        instruction: |
          Write a brief plan (3-5 lines): files to change, approach, out of scope.
  ...
---
```

---

### B7: Eval Prototype Cleanup

**Core:**
- **ID:** eval-prototype-cleanup
- **Trigger:** Implementation of this feature replaces the skill-eval prototype from issue #39
- **Expected:** The following prototype artifacts are removed: (1) `eval-fixtures/tanstack-start-skills/` directory, (2) `eval/scenarios/skill-activation.ts`, (3) `eval/scenarios/skill-activation-control.ts`, (4) any `skill-eval` mode references in eval fixture configs. The `skillActivationPresets()` and `assertSkillRead()` assertion functions in `eval/assertions.ts` are retained and reused by updated eval scenarios.
- **Verify:** `test ! -d eval-fixtures/tanstack-start-skills` succeeds. `grep -r "skill-eval" eval/ eval-fixtures/` returns no matches. `grep "skillActivationPresets" eval/assertions.ts` still returns a match.
- **Source:** `eval/scenarios/skill-activation.ts`, `eval/scenarios/skill-activation-control.ts`, `eval-fixtures/tanstack-start-skills/`

#### UI Layer

N/A.

#### API Layer

N/A.

#### Data Layer

Files removed. No schema changes.

---

## Non-Goals

Explicitly out of scope for this feature:

- **Hook-backed gate enforcement** -- gates remain agent-trust-based. Hook enforcement of gates is a separate concern (tracked independently).
- **New mode definitions** -- no new modes are added. Only existing modes (task, implementation, planning, debug, research) are converted.
- **Changes to modes.yaml / intent detection** -- the `modes.yaml` schema, `suggest.ts`, and `prime.ts` are untouched. No `skill` field in mode config.
- **Skill validation at entry** -- `kata enter` does not validate that referenced skills exist in `.claude/skills/`. This is a future enhancement.
- **Skill version tracking** -- `kata batteries --update` does not track skill versions separately from template versions.
- **Conditional skills** -- no mechanism for conditionally activating skills based on project state (e.g., "only use TDD if test infrastructure exists").
- **Skill-scoped hooks** -- skills do not ship with their own hook definitions. Hook registration remains centralized in `.claude/settings.json`.
- **Changes to the verify-run sub-agent** -- verify-run continues to work as-is.
- **Freeform mode conversion** -- freeform.md has no methodology to extract and is not converted.
- **Non-batteries template conversion** -- system templates in `templates/` (onboard.md, SESSION-TEMPLATE.template.md) and other batteries templates (stop-hook-test.md, verify.md) are not converted.

## Implementation Phases

See YAML frontmatter `phases:` above. Each phase should be 1-4 hours of focused work.

### Phase 1: Schema + Infrastructure (2-3 hours)

Add the `skill` and `mode_skill` fields to Zod schemas, update task-factory to render skill activation instructions in native task descriptions, update scaffold-batteries to copy skills, and modify `kata enter` to emit mode_skill activation instead of full template body.

### Phase 2: Create Skills Content (2-3 hours)

Extract methodology content from each template's markdown body and step instructions into 12 SKILL.md files under `batteries/skills/`. Migrate existing `quick-planning` and `tdd` skills from the eval fixture.

### Phase 3: Convert Templates (2-3 hours)

Rewrite each batteries template to declare `mode_skill:` and per-step `skill:` references, removing the markdown body. Verify all templates still parse and produce valid native tasks.

### Phase 4: Update Eval (1-2 hours)

Remove skill-eval prototype artifacts. Add skill activation checks to existing eval scenarios that exercise real modes.

## Verification Strategy

### Test Infrastructure

Existing test infrastructure: `npm run build && npm test` using Node's built-in test runner. Test files live alongside source with `.test.ts` suffixes. No new test framework needed.

### Build Verification

`npm run build` compiles TypeScript via tsup. Templates are not compiled -- they are copied at runtime. Skills are plain markdown files. Build verification confirms schema changes compile and existing tests pass.

## Verification Plan

### VP1: Schema Accepts Skill Fields

Steps:
1. `npm run build && npm test`
   Expected: All existing tests pass. No regressions from adding optional fields.
2. `node --input-type=module -e "import {templateYamlSchema} from './dist/validation/schemas.js'; console.log(templateYamlSchema.parse({mode_skill:'test'}).mode_skill)"`
   Expected: Prints `test`
3. `node --input-type=module -e "import {phaseStepSchema} from './dist/validation/schemas.js'; console.log(phaseStepSchema.parse({id:'s1',title:'T',skill:'tdd'}).skill)"`
   Expected: Prints `tdd`

### VP2: Skills Installed by Setup

Steps:
1. `mkdir -p /tmp/vp2-test && cd /tmp/vp2-test && git init && kata setup --batteries --cwd=/tmp/vp2-test`
   Expected: Output includes "Skills (12):" section listing all 12 skill paths.
2. `ls /tmp/vp2-test/.claude/skills/*/SKILL.md | wc -l`
   Expected: Returns `12`
3. `head -5 /tmp/vp2-test/.claude/skills/tdd/SKILL.md`
   Expected: Shows YAML frontmatter with `name: tdd` and `description:` fields.
4. `rm -rf /tmp/vp2-test`

### VP3: Mode Skill Referenced at Entry

Steps:
1. `mkdir -p /tmp/vp3-test && cd /tmp/vp3-test && git init && kata setup --batteries --cwd=/tmp/vp3-test`
2. `kata enter task --session=vp3-test --cwd=/tmp/vp3-test 2>&1 | grep -i "skill"`
   Expected: Output contains a reference to activating `/task-mode` skill. Does NOT contain 200+ lines of markdown methodology.
3. `rm -rf /tmp/vp3-test`

### VP4: Step Skill in Native Task Description

Steps:
1. `cd /tmp/vp4-test && git init && kata setup --batteries --cwd=/tmp/vp4-test`
2. `kata enter task --session=vp4-test --cwd=/tmp/vp4-test`
3. `cat ~/.claude/tasks/vp4-test/1.json | grep -A2 "Skill"`
   Expected: Task description contains `Activate /quick-planning before starting this task.`
4. `rm -rf /tmp/vp4-test && rm -rf ~/.claude/tasks/vp4-test`

### VP5: Templates Parse After Conversion

Steps:
1. `npm run build`
2. `for t in task implementation planning debug research; do node --input-type=module -e "import {parseTemplateYaml} from './dist/commands/enter/template.js'; const r = parseTemplateYaml('batteries/templates/${t}.md'); if(!r||!r.mode_skill) throw new Error('${t}: missing mode_skill'); console.log('${t}: OK, mode_skill=' + r.mode_skill)"; done`
   Expected: All five templates print OK with their mode_skill value.

### VP6: Prototype Artifacts Removed

Steps:
1. `test ! -d eval-fixtures/tanstack-start-skills && echo "PASS: fixture removed"`
   Expected: Prints "PASS: fixture removed"
2. `test ! -f eval/scenarios/skill-activation.ts && echo "PASS: scenario removed"`
   Expected: Prints "PASS: scenario removed"
3. `grep -r "skill-eval" eval/ eval-fixtures/ && echo "FAIL" || echo "PASS: no skill-eval refs"`
   Expected: Prints "PASS: no skill-eval refs"

## Implementation Hints

### Dependencies

No new npm dependencies. Skills are plain markdown files. Claude Code's native Skill tool handles discovery and loading.

### Key Imports

| Module | Import | Used For |
|--------|--------|----------|
| `src/validation/schemas.ts` | `phaseStepSchema`, `subphasePatternSchema`, `templateYamlSchema` | Adding `skill` / `mode_skill` fields |
| `src/yaml/types.ts` | `TemplateYaml` | Adding `mode_skill` to TypeScript interface |
| `src/commands/enter/task-factory.ts` | `buildPhaseTasks`, `buildSpecTasks` | Rendering skill activation in task descriptions |
| `src/commands/scaffold-batteries.ts` | `scaffoldBatteries`, `copyDirectory` | Copying `batteries/skills/` to `.claude/skills/` |
| `src/session/lookup.ts` | `getPackageRoot` | Resolving `batteries/skills/` source path |

### Code Patterns

**Adding skill to task instruction (task-factory.ts):**

In `buildPhaseTasks`, after resolving the step instruction and before appending hints, check for `step.skill` and prepend a skill activation section:

```typescript
if (step.skill) {
  const skillSection = `## Skill\nActivate /${step.skill} before starting this task.\n`
  finalInstruction = skillSection + '\n' + (finalInstruction ?? '')
}
```

Same pattern applies in `buildSpecTasks` for `patternItem.skill`.

**Adding skills to scaffoldBatteries (scaffold-batteries.ts):**

Skills use a two-level directory structure (`<name>/SKILL.md`), unlike templates (flat files). The `copyDirectory` helper copies one level deep, so a new `copySkillsDirectory` helper is needed that iterates skill name directories:

```typescript
const skillsSrc = join(batteryRoot, 'skills')
const skillsDest = getProjectSkillsDir(projectRoot)
if (existsSync(skillsSrc)) {
  for (const skillName of readdirSync(skillsSrc)) {
    copyDirectory(
      join(skillsSrc, skillName),
      join(skillsDest, skillName),
      result.skills, result.skipped, result.updated,
      update, backupRoot ? join(backupRoot, 'skills', skillName) : undefined,
    )
  }
}
```

**Mode skill output in enter.ts:**

Replace the `outputFullTemplateContent` call with a conditional:

```typescript
const template = parseTemplateYaml(resolveTemplatePath(modeConfig.template))
if (template?.mode_skill) {
  console.error(`\n  MODE SKILL: Activate /${template.mode_skill} to understand your role and workflow.\n`)
} else {
  outputFullTemplateContent(modeConfig.template, canonical, workflowId, issueNum, effectivePhases[0])
}
```

### Gotchas

- The `skillHintSchema` already exists in `src/validation/schemas.ts` as a hint type (`hints: [{ skill: "name", args: "..." }]`). The new top-level `skill` field on `phaseStepSchema` is a separate concept — it declares the skill to activate for the entire step. If a step has both `skill: "tdd"` AND `hints: [{ skill: "tdd" }]`, this is redundant but not an error. The top-level `skill` field supersedes skill hints — existing `skillHintSchema` hints in templates should be migrated to the top-level `skill` field during template conversion (Phase 3).
- Template files that currently have markdown bodies below `---` will lose that content. The content must be fully captured in skill files before removing from templates.
- The `available_skills` field in the skill-eval prototype template is not adopted. Skill references are per-step (`skill:`) and per-template (`mode_skill:`), not a flat list.
- Skills live under `.claude/skills/` (Claude Code's native convention), not under `.kata/`. This means `.gitignore` patterns for `.claude/` may need updating in projects that ignore that directory.

### Reference Docs

- [Claude Code Skills Documentation](https://code.claude.com/docs/en/skills) -- native skill system conventions
- [Skill Activation Reliability Research](planning/research/2026-04-05-skill-activation-reliability.md) -- 100% activation reliability findings
- [Tasks + Gates + Skills Composition Research](planning/research/2026-04-06-tasks-gates-skills-composition.md) -- full design rationale
