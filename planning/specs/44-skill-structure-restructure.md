---
initiative: skill-structure-restructure
type: project
issue_type: feature
status: approved
priority: high
github_issue: 44
created: 2026-04-06
updated: 2026-04-06
phases:
  - id: p1
    name: "Create merged skill directories with prompt templates"
    tasks:
      - "Merge debug-mode + debug-methodology into batteries/skills/debugging/SKILL.md"
      - "Move .claude/agents/debug-agent.md content into batteries/skills/debugging/tracer-prompt.md (strip agent frontmatter)"
      - "Merge implementation-mode + implementation into batteries/skills/implementation/SKILL.md"
      - "Move .claude/agents/impl-agent.md into batteries/skills/implementation/implementer-prompt.md"
      - "Move .claude/agents/test-agent.md into batteries/skills/implementation/test-prompt.md"
      - "Move .claude/agents/review-agent.md into batteries/skills/implementation/reviewer-prompt.md"
      - "Merge planning-mode + spec-writing into batteries/skills/planning/SKILL.md (keep interview as standalone)"
      - "Move .claude/agents/spec-writer.md into batteries/skills/planning/spec-writer-prompt.md"
      - "Create batteries/skills/planning/reviewer-prompt.md from review-agent.md (planning context)"
      - "Merge task-mode + quick-planning into batteries/skills/task/SKILL.md"
      - "Merge research-mode into batteries/skills/research/SKILL.md"
      - "Merge verify-mode into batteries/skills/verification/SKILL.md"
      - "Create batteries/skills/verification/fix-reviewer-prompt.md from review-agent.md (verify context)"
      - "Merge freeform-mode into batteries/skills/freeform/SKILL.md"
      - "Keep batteries/skills/interview/SKILL.md as-is (standalone, referenced at step level)"
      - "Keep batteries/skills/code-review/SKILL.md as-is (standalone, no merge needed)"
      - "Keep batteries/skills/tdd/SKILL.md as-is (standalone, no merge needed)"
      - "Remove old skill directories that were merged (debug-mode, debug-methodology, implementation-mode, planning-mode, spec-writing, task-mode, quick-planning, research-mode, verify-mode, freeform-mode)"
  - id: p2
    name: "Update templates, scaffolding code, and documentation"
    tasks:
      - "Update template mode_skill: references (old→new mapping below)"
      - "Update template skill: references (old→new mapping below)"
      - "Update template prose referencing review-agent subagent_type to use prompt templates"
      - "Change task-factory.ts 'Activate /' to 'Invoke /' at lines 165 and 273"
      - "Change enter.ts mode skill message to 'Invoke /' at line 91"
      - "Update hardcoded 'review-agent' default reviewer in enter.ts:593 and task-factory.ts:130,152"
      - "Remove agents scaffolding from scaffold-batteries.ts (copy loop + BatteriesResult interface)"
      - "Remove agents scaffolding from setup.ts (copy loop + output block)"
      - "Remove batteries/agents/ directory"
      - "Remove .claude/agents/ from project"
      - "Remove .claude/agents/ from eval-fixtures/tanstack-start/"
      - "Update onboard.md template references to .claude/agents/"
      - "Update CLAUDE.md runtime data layout table (remove .claude/agents/ row)"
      - "Update README.md references to batteries/agents/ and .claude/agents/"
  - id: p3
    name: "Tests and validation"
    tasks:
      - "Update schema tests for any changed field names"
      - "Add skill resolution test: for every skill/mode_skill reference in batteries/templates/*.md, verify batteries/skills/{name}/SKILL.md exists"
      - "Run full build + test suite"
---

# Skill Structure Restructure

> GitHub Issue: [#44](https://github.com/codevibesmatter/kata/issues/44)

## Overview

Restructure kata-wm's skill/agent system into a unified skill-based architecture. Agent definitions move from `.claude/agents/` into skill directories as plain prompt templates. Mode skills merge with methodology skills into one skill per concern. This matches Claude Code's native `.claude/skills/` system and the superpowers pattern where each skill owns its full methodology including subagent dispatch.

## Feature Behaviors

### B1: Unified skill directories

**Core:**
- **ID:** unified-skill-dirs
- **Trigger:** `kata setup --batteries` or `kata batteries --update` scaffolds skills
- **Expected:** Skills are scaffolded from `batteries/skills/` to `.claude/skills/` only. No `.claude/agents/` scaffolding occurs. Each skill directory contains a `SKILL.md` and optional sibling prompt template files (e.g. `implementer-prompt.md`).
- **Verify:** Run `kata setup --batteries` on a fresh project. Confirm `.claude/skills/` exists with merged skill dirs. Confirm `.claude/agents/` is NOT created.

### B2: Merged mode + methodology skills

**Core:**
- **ID:** merged-skills
- **Trigger:** Agent enters a mode and activates skills
- **Expected:** Each mode has one primary skill combining orchestration + methodology. Standalone skills remain for cross-cutting concerns. Mapping:
  - `debug-mode` + `debug-methodology` → `debugging/`
  - `implementation-mode` + `implementation` → `implementation/`
  - `planning-mode` + `spec-writing` → `planning/` (interview stays standalone)
  - `task-mode` + `quick-planning` → `task/`
  - `research-mode` → `research/`
  - `verify-mode` → `verification/`
  - `freeform-mode` → `freeform/`
  - `interview` → `interview/` (unchanged, standalone — referenced at step level in planning template)
  - `code-review` → `code-review/` (unchanged, standalone)
  - `tdd` → `tdd/` (unchanged, standalone)
- **Verify:** Check each `batteries/skills/<name>/SKILL.md` contains both orchestration and methodology content. No orphaned old directories remain.

### B3: Agent content as prompt templates

**Core:**
- **ID:** agent-prompt-templates
- **Trigger:** A skill instructs the orchestrator to spawn a subagent
- **Expected:** Agent content from `.claude/agents/*.md` (project-level, the authoritative source for all 5 agents) becomes plain prompt template files (no YAML frontmatter with `tools:` etc.) inside the relevant skill directory. The SKILL.md references the sibling file and instructs when/how to use it with the Agent tool. Mapping:
  - `.claude/agents/debug-agent.md` → `batteries/skills/debugging/tracer-prompt.md`
  - `.claude/agents/impl-agent.md` → `batteries/skills/implementation/implementer-prompt.md`
  - `.claude/agents/review-agent.md` → split into `implementation/reviewer-prompt.md`, `planning/reviewer-prompt.md`, `verification/fix-reviewer-prompt.md` (context-specific versions)
  - `.claude/agents/spec-writer.md` → `batteries/skills/planning/spec-writer-prompt.md`
  - `.claude/agents/test-agent.md` → `batteries/skills/implementation/test-prompt.md`
- **Verify:** Each prompt template file contains agent instructions without YAML frontmatter. Each parent SKILL.md references its prompt templates.

### B4: Template skill references updated

**Core:**
- **ID:** template-refs-updated
- **Trigger:** Template YAML is parsed during `kata enter`
- **Expected:** All `skill:` and `mode_skill:` fields in templates reference the new merged skill names. Old names (debug-mode, debug-methodology, implementation-mode, quick-planning, etc.) are replaced with new names (debugging, implementation, planning, task, etc.).
- **Verify:** Grep all `batteries/templates/*.md` for skill references. Every referenced skill name has a matching directory in `batteries/skills/`.

### B5: Invoke wording in task instructions

**Core:**
- **ID:** invoke-wording
- **Trigger:** Task factory generates task instructions from template steps/subphase patterns
- **Expected:** Task instructions use "Invoke /" instead of "Activate /". Both `task-factory.ts` (step skills and subphase pattern skills) and `enter.ts` (mode skill activation) use the updated wording.
- **Verify:** Run `kata enter task` and inspect generated task instructions. Confirm they contain "Invoke /" not "Activate /".

### B6: Skill resolution tests

**Core:**
- **ID:** skill-resolution-tests
- **Trigger:** `npm test` runs the test suite
- **Expected:** Tests parse all `batteries/templates/*.md` files, extract `skill:` and `mode_skill:` field values, and verify that `batteries/skills/{name}/SKILL.md` exists for each referenced skill.
- **Verify:** Run `npm run build && npm test`. All skill resolution tests pass. Introducing a typo in a template skill reference causes test failure.

## Non-Goals

- Changing the mode/phase/task lifecycle system
- Modifying `modes.yaml` or `kata.yaml` config structure
- Changing how the Claude Code Skill tool discovers/invokes skills (that's Claude Code's domain)
- Adding new skills or methodologies (content stays the same, just reorganized)
- Changing skill YAML frontmatter format (we use Claude Code's native format)

## Implementation Notes

### Merge strategy for mode + methodology skills

The mode skill content (orchestration guidance, phase flow, role description) becomes the top section of the merged SKILL.md. The methodology content (step-by-step how-to, checklists) becomes a lower section. The `name` and `description` in frontmatter come from the mode skill since that's the entry point.

### Review agent split

`review-agent.md` currently has generic review instructions. When splitting into context-specific prompt templates, tailor each version:
- `implementation/reviewer-prompt.md` — focus on code quality, spec compliance, test coverage
- `planning/reviewer-prompt.md` — focus on spec completeness, behavior definitions, phase sizing
- `verification/fix-reviewer-prompt.md` — focus on fix minimality, root cause, regression risk (content from existing verify-fix-review prompt)

### Scaffolding changes

`scaffold-batteries.ts` currently has two copy loops: one for `batteries/agents/` → `.claude/agents/`, one for `batteries/skills/` → `.claude/skills/`. Remove the agents loop entirely. The skills loop already handles the two-level structure (`skills/<name>/SKILL.md`).

`setup.ts` has similar dual scaffolding. Remove the agents portion.

### Template field name mapping

The `skill:` and `mode_skill:` field names in templates and schemas stay the same — only the values change. No schema changes needed.

**mode_skill: old → new:**
- `debug-mode` → `debugging`
- `implementation-mode` → `implementation`
- `planning-mode` → `planning`
- `task-mode` → `task`
- `research-mode` → `research`
- `verify-mode` → `verification`
- `freeform-mode` → `freeform`

**skill: old → new (step-level):**
- `quick-planning` → `task` (absorbed into task skill)
- `debug-methodology` → `debugging` (absorbed into debugging skill)
- `implementation` → `implementation` (unchanged, absorbed into merged skill)
- `spec-writing` → `planning` (absorbed into planning skill)
- `interview` → `interview` (unchanged, stays standalone)

### Hardcoded reviewer references

`enter.ts:593` and `task-factory.ts:130,152` use `'review-agent'` as a default reviewer name in generated instructions. Since `.claude/agents/review-agent.md` is being removed, update these to reference the appropriate skill's reviewer prompt template instead (e.g., instruct to "Invoke /code-review" or use the skill's embedded reviewer prompt).
