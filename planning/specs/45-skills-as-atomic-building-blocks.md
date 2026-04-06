---
initiative: skills-atomic-building-blocks
type: project
issue_type: feature
status: approved
priority: high
github_issue: 45
created: 2026-04-06
updated: 2026-04-06
phases:
  - id: p1
    name: "Create atomic skill library"
    tasks:
      - "Write 11 SKILL.md files with frontmatter and methodology content"
      - "Move existing sub-prompt files into new skill directories"
      - "Set context: fork on agent skills (code-review, spec-writing)"
    test_cases:
      - id: "skill-files-exist"
        description: "All 11 SKILL.md files exist in batteries/skills/"
        type: unit
      - id: "skill-frontmatter-valid"
        description: "All skills have valid name + description frontmatter"
        type: unit
  - id: p2
    name: "Thin out templates"
    tasks:
      - "Rewrite all 7 mode templates as thin YAML skeletons with skill: refs"
      - "Remove inlined prose instructions from template steps"
      - "Preserve expansion patterns (spec phases, VP steps, interviews)"
      - "Update mode_skill to orchestration for all modes except freeform"
    test_cases:
      - id: "templates-reference-skills"
        description: "All template skill: refs resolve to existing SKILL.md files"
        type: unit
      - id: "templates-parse"
        description: "All templates parse against templateYamlSchema"
        type: unit
      - id: "expansion-preserved"
        description: "Spec-phase expansion still generates correct tasks"
        type: integration
  - id: p3
    name: "Update task factory and schema"
    tasks:
      - "Update task-factory to handle new skill references"
      - "Update schema if needed for context: fork agent skills"
      - "Update skill resolution tests"
    test_cases:
      - id: "task-factory-skills"
        description: "Task factory generates correct skill invocation instructions"
        type: unit
      - id: "schema-validation"
        description: "Schema validates new template structure"
        type: unit
  - id: p4
    name: "Eval scenario and cleanup"
    tasks:
      - "Add eval scenario that runs a mode end-to-end with new skills"
      - "Remove old mode-mirroring skill files"
      - "Update CLAUDE.md documentation"
    test_cases:
      - id: "eval-mode-entry"
        description: "Eval scenario enters mode, gets skill-backed tasks, completes"
        type: integration
      - id: "no-stale-refs"
        description: "No references to deleted skill files remain"
        type: unit
---

# Skills as Atomic Building Blocks

> GitHub Issue: [#45](https://github.com/codevibesmatter/kata/issues/45)

## Overview

Replace 7 mode-mirroring skills that duplicate template content with 11 atomic, cross-cutting skills. Templates become thin YAML skeletons (~30 lines) that wire skills together via `skill:` references. Skills own methodology; templates own structure and gates. This eliminates double-context, makes skills reusable across modes, and enables customization by swapping skills.

## Feature Behaviors

### B1: Atomic Skill Library

**Core:**
- **ID:** atomic-skill-library
- **Trigger:** `kata batteries --update` scaffolds skills to `.claude/skills/`
- **Expected:** 11 skill directories created, each with SKILL.md and optional sub-prompt files
- **Verify:** `ls .claude/skills/` shows all 11 skill directories with SKILL.md files
- **Source:** `batteries/skills/` (source), `.claude/skills/` (scaffolded copy)

#### UI Layer
N/A — CLI/backend only.

#### API Layer
N/A — no API changes.

#### Data Layer
N/A — no data changes. Skill files are static markdown.

#### Skill Inventory

| Skill | Type | `context: fork`? | Purpose |
|-------|------|-------------------|---------|
| `orchestration` | Inline | No | Agent coordination — "you delegate, you don't code" |
| `workflow-setup` | Inline | No | Pre-work ceremony — branch, spec read, env verify |
| `workflow-close` | Inline | No | Post-work ceremony — commit, push, PR, issue update |
| `tdd` | Inline | No | Red/Green/Refactor methodology |
| `interview` | Inline | No | Structured questioning methodology |
| `debug-methodology` | Inline | No | Reproduce, classify, hypothesize, minimal fix |
| `code-review` | Agent | Yes | Fork reviewer subagent, checklist + verdict |
| `spec-writing` | Agent | Yes | Fork spec writer subagent, spec structure + rules |
| `test-protocol` | Inline | No | Build check, test run, hint check, retry limits |
| `code-impl` | Inline | No | Implementation methodology — follow patterns, minimal changes, verify frequently |
| `vp-execution` | Inline | No | Run VP steps literally, compare expected vs actual |

#### Inline Skills

Inline skills load into the main conversation via `Invoke /skillname`. They provide methodology Claude applies to its current work.

Each SKILL.md contains:
- YAML frontmatter: `name`, `description` (under 250 chars)
- Methodology principles and rules (under 100 lines)
- Anti-patterns to avoid
- References to sub-prompt files (if any)

#### Agent Skills

Agent skills use `context: fork` to spawn a subagent. The SKILL.md content becomes the subagent's task prompt.

```yaml
---
name: code-review
description: "Review code changes against spec. Check correctness, security, performance. Return verdict with file:line issues."
context: fork
agent: review-agent
---
```

Sub-prompt files inside agent skill directories provide specialized prompts for different review contexts (implementation review, verification fix review, spec review).

#### Migration: Old → New Skills

| Old Skill | Disposition | New Skill(s) |
|-----------|-------------|-------------|
| `planning` | Delete | Content split into `orchestration` + template step instructions |
| `implementation` | Delete | Content split into `orchestration`, `code-impl`, `test-protocol` |
| `task` | Delete | Content into template step instructions |
| `debugging` | Delete → extract | `debug-methodology` (methodology extracted) |
| `research` | Delete | Content into template step instructions |
| `freeform` | Delete | No replacement needed |
| `verification` | Delete | Content split into `vp-execution` + template instructions |
| `code-review` | Rewrite | Add `context: fork`, keep checklist |
| `tdd` | Keep | Unchanged |
| `interview` | Keep | Unchanged |
| (new) | Create | `orchestration`, `workflow-setup`, `workflow-close`, `spec-writing`, `code-impl`, `test-protocol`, `debug-methodology`, `vp-execution` |

---

### B2: Thin Templates

**Core:**
- **ID:** thin-templates
- **Trigger:** User runs `kata enter <mode>` for any mode
- **Expected:** Template generates tasks with `skill:` references instead of inlined prose instructions
- **Verify:** Task instructions contain `## Skill\nInvoke /<name> before starting this task.` headers, not 50+ lines of methodology
- **Source:** `batteries/templates/*.md`

#### UI Layer
N/A — CLI/backend only.

#### API Layer
N/A — no API changes.

#### Data Layer
N/A — template files are static YAML/markdown.

#### Template Structure

All mode templates follow this pattern:

```yaml
id: <mode>
mode_skill: orchestration    # or null for freeform
phases:
  - id: p0
    steps:
      - id: <step-name>
        skill: <skill-name>       # methodology for this step
        instruction: |             # 1-2 line context (optional)
          Brief context for this specific step.
        gate: <condition>          # deterministic gate (optional)
```

#### Mode-to-Skill Mapping

| Mode | `mode_skill` | Step skills used |
|------|-------------|------------------|
| implementation | orchestration | workflow-setup, code-impl, tdd, test-protocol, code-review, workflow-close |
| planning | orchestration | interview, spec-writing, code-review, workflow-close |
| task | orchestration | code-impl, tdd, test-protocol, workflow-close |
| debug | orchestration | debug-methodology, code-impl, tdd, workflow-close |
| verify | orchestration | vp-execution, debug-methodology, code-review, workflow-close |
| research | orchestration | interview, workflow-close |
| freeform | null | (none — free exploration) |

#### Expansion Patterns Preserved

Dynamic expansion (spec phases, VP steps, interview categories) works unchanged. The `subphase_pattern` stamps out steps with `skill:` references:

```yaml
- id: p2
  name: Implement
  expand_from: spec_phases
  subphase_pattern:
    - id_suffix: impl
      skill: tdd
    - id_suffix: test
      skill: test-protocol
      gate: build_pass
    - id_suffix: review
      skill: code-review
      gate: approved
```

---

### B3: Gates in Templates, Fulfillment in Skills

**Core:**
- **ID:** gates-templates-skills-fulfill
- **Trigger:** Task factory generates a task with both `gate:` and `skill:`
- **Expected:** Task instruction includes gate condition (from template) AND skill invocation (for methodology). Gate is deterministic; skill explains how to satisfy it.
- **Verify:** Generated task for a TEST step includes gate `build_pass` AND `Invoke /test-protocol`
- **Source:** `src/commands/enter/task-factory.ts` (task generation), `batteries/templates/*.md` (gate definitions)

#### UI Layer
N/A.

#### API Layer
N/A.

#### Data Layer
N/A.

#### Gate Ownership

Templates define WHAT must be true (deterministic conditions):
```yaml
gate: build_pass          # build must succeed
gate: approved            # review must approve
gate: spec_read           # spec must be read
```

Skills define HOW to achieve it (methodology):
```markdown
# test-protocol SKILL.md
1. Run build command (npm run build, not bare tsc)
2. Run test suite
3. Check implementation hints from spec
4. Max 3 retry cycles on failure
```

No schema change needed for gates — they already exist in the template schema.

---

### B4: Mode Skill Loading

**Core:**
- **ID:** mode-skill-orchestration
- **Trigger:** User runs `kata enter <mode>` for any mode except freeform
- **Expected:** `orchestration` skill is indicated via `Invoke /orchestration` message
- **Verify:** `kata enter implementation` outputs `MODE SKILL: Invoke /orchestration`
- **Source:** `src/commands/enter.ts:85-96` (outputModeSkillActivation), `batteries/templates/*.md` (mode_skill field)

#### UI Layer
N/A.

#### API Layer
N/A.

#### Data Layer
N/A.

All modes except freeform get `mode_skill: orchestration`. This replaces mode-specific skills (planning, implementation, debugging, etc.) with a single orchestrator role skill.

The `orchestration` skill teaches:
- You coordinate agents — you don't do deep work inline
- Spawn subagents for code work, research, writing
- Preserve context window for tracking and user interaction
- Quality gates are mandatory, never skip

---

## Non-Goals

- Changing the mode/template system itself (phases, stop hooks, task creation pipeline)
- Adding new modes
- Changing the eval harness architecture
- Runtime skill resolution engine (skills remain slash-command invocations)
- Changing how `context: fork` works in Claude Code (use existing mechanism)
- Gate enforcement changes (gates remain as-is in template schema)

## Open Questions

- [x] Should ceremony steps be separate skills or combined? → Combined: `workflow-setup` and `workflow-close`
- [x] Should all modes get orchestration? → Yes, all except freeform
- [x] Big bang or phased? → Big bang on separate branch
- [x] How should agent skills work? → `context: fork` on SKILL.md frontmatter

## Implementation Phases

See YAML frontmatter `phases:` above. Each phase should be 1-4 hours of focused work.

**Phase 1: Create atomic skill library** — Write all 11 SKILL.md files in `batteries/skills/`. Move sub-prompts. This is content work, no code changes.

**Phase 2: Thin out templates** — Rewrite all 7 mode templates as thin YAML. Remove inlined prose. Add `skill:` refs. Update `mode_skill` to `orchestration`. Preserve expansion patterns.

**Phase 3: Update task factory and schema** — Ensure task-factory correctly handles new skill refs. Update resolution tests. Handle `context: fork` if needed.

**Phase 4: Eval scenario and cleanup** — Add eval scenario. Remove old mode-mirroring skills. Update docs.

## Verification Strategy

### Test Infrastructure
Existing test infrastructure: `npm run build && npm test` runs Node built-in test runner from `dist/testing/index.js`. Skill resolution tests already exist in `src/validation/`.

### Build Verification
`npm run build` (tsup ESM build). Must pass before running tests.

## Verification Plan

### VP1: Skill Files Exist
Steps:
1. `ls batteries/skills/*/SKILL.md | wc -l`
   Expected: 11 skill directories with SKILL.md files
2. `grep -l "context: fork" batteries/skills/*/SKILL.md`
   Expected: code-review/SKILL.md and spec-writing/SKILL.md

### VP2: Templates Are Thin
Steps:
1. `wc -l batteries/templates/implementation.md`
   Expected: Under 80 lines (currently ~170, target ~30-50 of YAML skeleton + expansion patterns)
2. `grep "skill:" batteries/templates/implementation.md | head -10`
   Expected: Multiple skill references (tdd, test-protocol, code-review, etc.)
3. `grep "mode_skill:" batteries/templates/*.md`
   Expected: All except freeform.md show `mode_skill: orchestration`

### VP3: Task Generation Works
Steps:
1. `npm run build && npm test`
   Expected: All tests pass including skill resolution tests
2. Set up a test project and run `kata enter implementation --issue=1`
   Expected: Tasks generated with `## Skill\nInvoke /tdd` etc. in instructions

### VP4: Eval Scenario
Steps:
1. `npm run eval -- --scenario=task-mode --verbose`
   Expected: Scenario completes — mode entered, skill-backed tasks created, work done

## Implementation Hints

### Key Files to Change

| File | Change |
|------|--------|
| `batteries/skills/*/SKILL.md` | Replace 7 mode skills + rewrite 3 existing |
| `batteries/templates/*.md` | Thin to ~30 line YAML skeletons |
| `src/commands/enter.ts:85-96` | Update `outputModeSkillActivation` if needed |
| `src/commands/enter/task-factory.ts:164-166,272-275` | Verify skill prepend logic works with new skills |
| `src/validation/schemas.ts` | No changes expected (skill: string already optional) |
| `.claude/skills/` | Updated by `kata batteries --update` from batteries/ |

### Dependencies
No new npm dependencies. This is a content + template restructure only.

### Key Imports
No new imports. Existing code paths in `enter.ts` and `task-factory.ts` handle skill references.

### Code Patterns

Task factory skill prepend (existing, no change needed):
```typescript
if (step.skill) {
  const skillSection = `## Skill\nInvoke /${step.skill} before starting this task.\n`
  finalInstruction = skillSection + '\n' + (finalInstruction ?? '')
}
```

### Gotchas
- `batteries/skills/` is the source; `.claude/skills/` is the project copy scaffolded by `kata batteries --update`. Edit batteries, not .claude.
- Agent skills with `context: fork` are a Claude Code native feature — we just set the frontmatter, Claude Code handles the forking.
- Existing expansion patterns in task-factory must keep working — test with spec-phase expansion specifically.

### Reference Docs
- [Extend Claude with skills](https://code.claude.com/docs/en/skills) — Official skill docs including `context: fork`
- [Skill authoring best practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices) — Size limits, progressive disclosure
- [Research: Skills Structure Evaluation](../research/2026-04-06-skills-structure-deep-research.md) — Our research findings
