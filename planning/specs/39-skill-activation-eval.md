---
initiative: skill-activation-eval
type: project
issue_type: feature
status: approved
priority: medium
github_issue: 39
created: 2026-04-05
updated: 2026-04-05
phases:
  - id: p1
    name: "Fixture and skills infrastructure"
    tasks:
      - "Create eval-fixtures/tanstack-start-skills/ by copying tanstack-start"
      - "Add .claude/skills/quick-planning/SKILL.md with description and methodology"
      - "Add .claude/skills/tdd/SKILL.md with description and methodology"
      - "Add .kata/templates/skill-eval.md with 2-phase template and available_skills frontmatter"
      - "Add .kata/kata.yaml with skill-eval mode override pointing to the template"
    test_cases:
      - id: "fixture-structure"
        description: "Verify fixture has both SKILL.md files, template, and kata.yaml"
        type: "smoke"
  - id: p2
    name: "Transcript assertions for skill reads"
    tasks:
      - "Implement assertSkillRead(skillName) in eval/assertions.ts"
      - "Implement assertSkillReadOrder(skills[]) in eval/assertions.ts"
      - "Implement assertSkillNotRead(skillName) in eval/assertions.ts"
      - "Add skillActivationPresets() preset array"
      - "Add unit tests for new assertions in eval/assertions.test.ts"
    test_cases:
      - id: "skill-read-assertion"
        description: "assertSkillRead finds Read tool_use targeting .claude/skills/<name>/SKILL.md"
        type: "unit"
      - id: "skill-order-assertion"
        description: "assertSkillReadOrder enforces first-occurrence ordering"
        type: "unit"
      - id: "skill-not-read-assertion"
        description: "assertSkillNotRead passes when skill file was never read"
        type: "unit"
  - id: p3
    name: "Eval scenarios"
    tasks:
      - "Create eval/scenarios/skill-activation.ts (deterministic checkpoint scenario)"
      - "Create eval/scenarios/skill-quality.ts (LLM judge scenario)"
      - "Register both scenarios in eval/run.ts"
    test_cases:
      - id: "scenario-registered"
        description: "Both scenarios appear in --list output"
        type: "smoke"
  - id: p4
    name: "Integration test"
    tasks:
      - "Run skill-activation scenario end-to-end against the fixture"
      - "Verify all deterministic checkpoints pass"
      - "Run skill-quality scenario with --judge and confirm judge review is produced"
    test_cases:
      - id: "e2e-skill-activation"
        description: "skill-activation scenario passes all checkpoints"
        type: "integration"
      - id: "e2e-skill-quality"
        description: "skill-quality scenario produces judge artifact"
        type: "integration"
---

# Eval: Skill Activation Reliability Prototype

> GitHub Issue: [#39](https://github.com/codevibesmatter/kata-wm/issues/39)

## Overview

Claude agents using skills-based workflows frequently claim to use a skill without actually reading it (a known problem documented in superpowers v4/v5). This feature adds eval scenarios that measure whether an agent reliably reads the correct SKILL.md files at the right phase when a mode template declares available skills. The audience is kata-wm maintainers validating the hybrid modes+skills architecture before shipping skills support to users. This is the first step toward benchmarking skill activation reliability with deterministic evidence, not just prompt-based persuasion.

## Feature Behaviors

### B1: Fixture provides skill files and a skill-eval mode

**Core:**
- **ID:** fixture-skill-eval-mode
- **Trigger:** Harness copies `eval-fixtures/tanstack-start-skills/` to an eval project directory, runs `kata batteries --update`, then executes `fixtureSetup` commands
- **Expected:** The eval project contains `.claude/skills/quick-planning/SKILL.md`, `.claude/skills/tdd/SKILL.md`, `.kata/templates/skill-eval.md`, and `.kata/kata.yaml` with a `skill-eval` mode definition (appended by fixtureSetup after batteries). The `batteries --update` step does not overwrite skill files or the custom template.
- **Verify:** After harness setup (including fixtureSetup), confirm all files exist and `.kata/kata.yaml` contains `skill-eval` mode with `template: skill-eval` and `intent_keywords`.
- **Source:** New files in `eval-fixtures/tanstack-start-skills/`

#### UI Layer

N/A -- eval fixture, no user-facing UI.

#### API Layer

N/A -- no API changes.

#### Data Layer

New fixture files:

| Path | Contents |
|------|----------|
| `eval-fixtures/tanstack-start-skills/.claude/settings.json` | Copy from tanstack-start (identical hook config) |
| `eval-fixtures/tanstack-start-skills/.claude/skills/quick-planning/SKILL.md` | YAML frontmatter: `name: quick-planning`, `description: "Use when scoping a task before implementation. Helps structure problem analysis, identify risks, and define a verification strategy."` Body: methodology steps for quick planning. |
| `eval-fixtures/tanstack-start-skills/.claude/skills/tdd/SKILL.md` | YAML frontmatter: `name: tdd`, `description: "Use when writing or modifying source code. Always write tests first, then implement to make them pass."` Body: red-green-refactor methodology. |
| `eval-fixtures/tanstack-start-skills/.kata/templates/skill-eval.md` | 2-phase template with `available_skills: [quick-planning, tdd]` in frontmatter |

**Note on `.kata/kata.yaml`:** The fixture does NOT ship `.kata/kata.yaml` because `kata batteries --update` unconditionally overwrites it (see `src/commands/scaffold-batteries.ts:112-129`). Instead, the scenario uses `fixtureSetup` to append the `skill-eval` mode to `kata.yaml` **after** batteries runs:

```typescript
fixtureSetup: [
  `cat >> .kata/kata.yaml << 'EOF'
  skill-eval:
    name: "Skill Eval"
    description: "Eval-only mode for testing skill activation reliability"
    template: "skill-eval"
    stop_conditions: [tasks_complete, committed]
    issue_handling: "none"
    intent_keywords: [skill, health, endpoint, plan and implement]
    workflow_prefix: "SE"
EOF`,
]
```

The `intent_keywords` ensure the user-prompt hook can detect and suggest `skill-eval` mode from natural language prompts like "Add a /health endpoint."

---

### B2: Skill-eval template defines two phases referencing skills

**Core:**
- **ID:** skill-eval-template
- **Trigger:** Agent enters `skill-eval` mode via `kata enter skill-eval`
- **Expected:** The template creates two phases: P0 "Quick Planning" (instructs agent to read the `quick-planning` skill) and P1 "Implement with TDD" (instructs agent to read the `tdd` skill). The frontmatter `available_skills: [quick-planning, tdd]` lists which skills are available. Each phase's instruction text tells the agent to read the corresponding `.claude/skills/<name>/SKILL.md` before starting work.
- **Verify:** Parse the template frontmatter and confirm `available_skills` contains both skill names. Confirm P0 instruction references `quick-planning` and P1 instruction references `tdd`.
- **Source:** New file `eval-fixtures/tanstack-start-skills/.kata/templates/skill-eval.md`

#### UI Layer

N/A -- template content, rendered by kata enter as task guidance.

#### API Layer

N/A -- `available_skills` is informational frontmatter; no runtime code reads it yet. This prototype validates the concept before adding runtime support.

#### Data Layer

Template frontmatter schema addition (informational only, not validated by kata at runtime in this prototype):

```yaml
available_skills:
  - quick-planning
  - tdd
```

---

### B3: assertSkillRead detects Read calls targeting a SKILL.md

**Core:**
- **ID:** assert-skill-read
- **Trigger:** Checkpoint runs after agent completes a scenario with transcript recording enabled
- **Expected:** Parses the JSONL transcript line by line. For each `assistant` message, inspects `tool_use` blocks with `name: "Read"`. If `input.file_path` ends with `.claude/skills/{skillName}/SKILL.md`, the skill is considered read. Returns pass if at least one Read targets the specified skill, fail otherwise.
- **Verify:** Unit test: construct a mock transcript JSONL with a Read tool_use for `.claude/skills/tdd/SKILL.md`. Call `assertSkillRead('tdd').assert(ctx)` and confirm it returns null (pass). Call `assertSkillRead('nonexistent').assert(ctx)` and confirm it returns a failure string.
- **Source:** `eval/assertions.ts` (new function, appended to the Transcript section)

#### UI Layer

N/A -- assertion library, no UI.

#### API Layer

```typescript
export function assertSkillRead(skillName: string): EvalCheckpoint
```

Returns an `EvalCheckpoint` with:
- `name`: `"skill read: {skillName}"`
- `assert(ctx)`: Scans `ctx.transcriptPath` JSONL for Read tool_use blocks whose `file_path` contains `.claude/skills/{skillName}/SKILL.md`. Returns `null` on match, error string on miss.

#### Data Layer

N/A -- reads existing transcript JSONL, no schema changes.

---

### B4: assertSkillReadOrder enforces ordering of skill reads

**Core:**
- **ID:** assert-skill-read-order
- **Trigger:** Checkpoint runs after agent completes a scenario with transcript recording enabled
- **Expected:** Parses the JSONL transcript sequentially, recording the line index of the first Read for each skill in the provided array. Asserts that all skills were read and that first-read positions are strictly increasing (i.e., the first skill was read before the second, etc.). Returns pass if ordering holds, fail if a skill was not read or was read out of order.
- **Verify:** Unit test: construct a transcript where `quick-planning` is read at line 5 and `tdd` at line 20. `assertSkillReadOrder(['quick-planning', 'tdd']).assert(ctx)` returns null. Reverse the order in the assertion call and confirm it fails. Also test a transcript missing one skill and confirm it fails.
- **Source:** `eval/assertions.ts` (new function)

#### UI Layer

N/A.

#### API Layer

```typescript
export function assertSkillReadOrder(skills: string[]): EvalCheckpoint
```

Returns an `EvalCheckpoint` with:
- `name`: `"skill read order: {skills.join(' -> ')}"`
- `assert(ctx)`: Scans transcript, builds map of `skillName -> firstReadLineIndex`. Checks all skills present and indices are strictly ascending. Returns `null` on success, descriptive error on failure.

#### Data Layer

N/A.

---

### B5: assertSkillNotRead verifies a skill was NOT read

**Core:**
- **ID:** assert-skill-not-read
- **Trigger:** Checkpoint runs after agent completes a scenario with transcript recording enabled
- **Expected:** Parses the JSONL transcript and confirms no Read tool_use targets `.claude/skills/{skillName}/SKILL.md`. Returns pass if the skill was never read, fail if it was.
- **Verify:** Unit test: construct a transcript with only a `quick-planning` Read. `assertSkillNotRead('tdd').assert(ctx)` returns null. `assertSkillNotRead('quick-planning').assert(ctx)` returns a failure string.
- **Source:** `eval/assertions.ts` (new function)

#### UI Layer

N/A.

#### API Layer

```typescript
export function assertSkillNotRead(skillName: string): EvalCheckpoint
```

Returns an `EvalCheckpoint` with:
- `name`: `"skill NOT read: {skillName}"`
- `assert(ctx)`: Scans transcript for Read of `.claude/skills/{skillName}/SKILL.md`. Returns `null` if absent, error string if found.

#### Data Layer

N/A.

---

### B6: skillActivationPresets composes common skill assertions

**Core:**
- **ID:** skill-activation-presets
- **Trigger:** Scenario imports and spreads the preset array into its checkpoints
- **Expected:** Returns an array of `EvalCheckpoint` containing: `assertSkillRead('quick-planning')`, `assertSkillRead('tdd')`, `assertSkillReadOrder(['quick-planning', 'tdd'])`. This is the reusable preset for any scenario that expects both skills read in planning-then-implementation order.
- **Verify:** Import the preset and confirm it has length 3, with the expected checkpoint names.
- **Source:** `eval/assertions.ts` (new preset function, added to the Presets section)

#### UI Layer

N/A.

#### API Layer

```typescript
export function skillActivationPresets(): EvalCheckpoint[]
```

#### Data Layer

N/A.

---

### B7: skill-activation eval scenario (deterministic)

**Core:**
- **ID:** skill-activation-scenario
- **Trigger:** `npm run eval -- --scenario=skill-activation`
- **Expected:** Runs the agent in the `tanstack-start-skills` fixture with a prompt asking it to plan and implement a small feature. The agent enters `skill-eval` mode (via hook detection or explicit entry). Deterministic checkpoints verify: (1) session is in `skill-eval` mode, (2) `quick-planning` SKILL.md was read, (3) `tdd` SKILL.md was read, (4) skills were read in order (planning before TDD), (5) a new commit exists, (6) working tree is clean.
- **Verify:** Run the scenario. All 6+ checkpoints pass. The transcript JSONL shows Read calls for both SKILL.md files in the correct order.
- **Source:** New file `eval/scenarios/skill-activation.ts`

#### UI Layer

N/A -- eval scenario, CLI output only.

#### API Layer

```typescript
// eval/scenarios/skill-activation.ts
export const skillActivationScenario: EvalScenario = {
  id: 'skill-activation',
  name: 'Skill activation: plan then TDD implement',
  fixture: 'tanstack-start-skills',
  fixtureSetup: [/* append skill-eval mode to kata.yaml — see B1 */],
  prompt: 'Add a /health endpoint that returns { status: "ok" }. Plan first, then implement using TDD.',
  timeoutMs: 12 * 60 * 1000,
  checkpoints: [
    assertCurrentMode('skill-eval'),
    ...skillActivationPresets(),
    assertNewCommit(),
    assertCleanWorkingTree(),
  ],
}
```

Note: `templatePath` is omitted since it is only consumed by the LLM judge (see B8).

#### Data Layer

N/A.

---

### B8: skill-quality eval scenario (LLM judge)

**Core:**
- **ID:** skill-quality-scenario
- **Trigger:** `npm run eval -- --scenario=skill-quality --judge`
- **Expected:** Runs the same fixture and prompt as skill-activation but replaces deterministic skill-order assertions with an LLM judge checkpoint. The judge reviews the transcript and scores whether the agent (a) actually followed quick-planning methodology during P0, and (b) actually followed TDD methodology during P1 (wrote tests before implementation). Deterministic checkpoints still verify mode entry and commit. The judge checkpoint uses `assertJudgePasses` with `minAgentScore: 60` (lower threshold for prototype).
- **Verify:** Run the scenario with `--judge`. A judge review markdown artifact is saved. The agent score and system score are printed. The scenario result includes `judgeResult`.
- **Source:** New file `eval/scenarios/skill-quality.ts`

#### UI Layer

N/A -- eval scenario, CLI output only.

#### API Layer

```typescript
// eval/scenarios/skill-quality.ts
export const skillQualityScenario: EvalScenario = {
  id: 'skill-quality',
  name: 'Skill quality: judge methodology adherence',
  fixture: 'tanstack-start-skills',
  templatePath: '.kata/templates/skill-eval.md',
  prompt: 'Add a /health endpoint that returns { status: "ok" }. Plan first, then implement using TDD.',
  timeoutMs: 15 * 60 * 1000,
  checkpoints: [
    assertCurrentMode('skill-eval'),
    assertSkillRead('quick-planning'),
    assertSkillRead('tdd'),
    assertNewCommit(),
    assertCleanWorkingTree(),
    assertJudgePasses({
      templatePath: '.kata/templates/skill-eval.md',
      minAgentScore: 60,
      minSystemScore: 60,
    }),
  ],
}
```

#### Data Layer

N/A.

---

## Non-Goals

- **Runtime skill activation in kata CLI** -- this prototype only measures whether skills get read in eval. No changes to `kata enter`, hooks, or session state for skill tracking. That is a follow-up feature.
- **`available_skills` validation at `kata enter` time** -- the frontmatter field is informational only. No Zod schema changes to template parsing.
- **Skill content quality** -- the SKILL.md files in the fixture are minimal stubs sufficient to trigger agent reads. They are not production-quality skill documentation.
- **Cross-mode skill sharing** -- skills are fixture-local. No shared skill registry or packaging.
- **Modifying batteries templates** -- no changes to shipped task.md, planning.md, etc. The skill-eval mode exists only in the eval fixture.
- **Hook-based skill enforcement** -- no PreToolUse hook that gates on skill reads. Detection is transcript-based post-hoc.

## Open Questions

- [x] Where do SKILL.md files live? `.claude/skills/<name>/SKILL.md` (matches Claude Code native convention).
- [x] How to detect skill activation? Parse transcript for Read tool_use blocks targeting skill paths (deterministic, no guessing).
- [x] Should skill-eval be a batteries mode? No -- fixture-local only for this prototype.

## Implementation Phases

See YAML frontmatter `phases:` above. Each phase should be 1-4 hours of focused work.

## Verification Strategy

### Test Infrastructure

Assertion unit tests use bun:test in `eval/assertions.test.ts` (existing file). Integration tests use the eval harness via `npm run eval -- --scenario=skill-activation`.

### Build Verification

`npm run build && npm test` for assertion unit tests. `npm run eval -- --scenario=skill-activation --verbose` for integration.

## Verification Plan

### VP1: Fixture structure

Steps:
1. `ls eval-fixtures/tanstack-start-skills/.claude/skills/quick-planning/SKILL.md`
   Expected: File exists
2. `ls eval-fixtures/tanstack-start-skills/.claude/skills/tdd/SKILL.md`
   Expected: File exists
3. `cat eval-fixtures/tanstack-start-skills/.kata/kata.yaml | grep skill-eval`
   Expected: Output contains `skill-eval`
4. `head -5 eval-fixtures/tanstack-start-skills/.kata/templates/skill-eval.md`
   Expected: YAML frontmatter with `available_skills`

### VP2: Assertion unit tests

Steps:
1. `bun test eval/assertions.test.ts`
   Expected: All tests pass, including new skill-read assertion tests

### VP3: Deterministic scenario

Steps:
1. `npm run eval -- --scenario=skill-activation --verbose`
   Expected: All checkpoints pass. Output shows Read calls for both SKILL.md files. Exit code 0.

### VP4: Judge scenario

Steps:
1. `npm run eval -- --scenario=skill-quality --judge --verbose`
   Expected: Judge review artifact saved. Agent and system scores printed. Exit code 0.

## Implementation Hints

### Dependencies

No new npm dependencies needed. All work uses existing eval infrastructure.

### Key Imports

| Module | Import | Used For |
|--------|--------|----------|
| `../harness.js` | `{ EvalScenario, EvalContext, EvalCheckpoint }` | Scenario and assertion types |
| `../assertions.js` | `{ assertCurrentMode, assertNewCommit, ... }` | Composing checkpoints |
| `node:fs` | `{ readFileSync }` | Reading transcript JSONL in assertions |

### Code Patterns

Transcript parsing pattern (from existing `assertNoTaskCreateCalls`):

```typescript
const content = readFileSync(ctx.transcriptPath!, 'utf-8')
const lines = content.split('\n').filter(Boolean)
for (const line of lines) {
  try {
    const event = JSON.parse(line)
    if (event.type === 'assistant' && event.message?.content) {
      for (const block of event.message.content) {
        if (block.type === 'tool_use' && block.name === 'Read') {
          const filePath = block.input?.file_path ?? ''
          if (filePath.includes(`.claude/skills/${skillName}/SKILL.md`)) {
            // found it
          }
        }
      }
    }
  } catch { /* skip */ }
}
```

### Gotchas

- The `file_path` in Read tool_use may be absolute (e.g., `/home/user/project/.claude/skills/tdd/SKILL.md`). Use `.includes()` not `.endsWith()` for matching.
- The harness runs `kata batteries --update` on fixture copy. `batteries --update` unconditionally overwrites `.kata/kata.yaml` but preserves custom templates. The `skill-eval` mode must be appended via `fixtureSetup` AFTER batteries runs. The custom template `skill-eval.md` survives because batteries only overwrites templates matching shipped battery names.
- Transcript JSONL lines may fail to parse if truncated. Always wrap `JSON.parse` in try/catch per the existing pattern.
- **Duplicate reads are fine**: If agent reads a SKILL.md multiple times, `assertSkillRead` passes (one match is enough). `assertSkillReadOrder` uses first-occurrence only, so duplicates are harmless.
- **Read calls vs results**: Assertions check tool **calls** (agent intent), not tool **results** (confirmed success). Acceptable for prototype since the fixture guarantees files exist.
- **Glob discovery is invisible**: If the agent uses Glob to discover skills before Reading them, that's fine — assertions only check Read calls (activation), not Glob calls (discovery).

### Reference Docs

- [Research: Skills-Based Workflows vs Mode/Task Systems](/data/projects/kata-wm/planning/research/2026-04-05-skills-vs-modes-superpowers-analysis.md) -- background on hybrid skills+modes architecture
- [Eval harness source](/data/projects/kata-wm/eval/harness.ts) -- `EvalScenario` interface and fixture setup flow
- [Eval assertions source](/data/projects/kata-wm/eval/assertions.ts) -- existing assertion patterns and presets
