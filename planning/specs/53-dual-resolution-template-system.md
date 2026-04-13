---
initiative: dual-resolution-template-system
type: project
issue_type: feature
status: approved
priority: medium
github_issue: 53
created: 2026-04-13
updated: 2026-04-13
depends_on: []
phases:
  - id: p1
    name: "Template dual resolution and ceremony.md"
    tasks:
      - "Add batteries/templates/ fallback to resolveTemplatePath() in src/session/lookup.ts (after project check at line 249, before the throw at line 260)"
      - "Add getBatteriesTemplatesDir() helper to src/session/lookup.ts returning path.join(getPackageRoot(), 'batteries', 'templates')"
      - "Update resolveTemplatePath() error message at line 261 to list both checked paths (project and batteries)"
      - "Create batteries/ceremony.md with shared workflow instructions extracted from batteries/steps.yaml (commit patterns, PR creation, branch naming, env checks, test running)"
      - "Remove $ref step resolution from template processing in src/commands/enter/step-library.ts — inline instructions into template phases that currently use $ref"
      - "Remove batteries/steps.yaml and .kata/steps.yaml from scaffoldBatteries() copy list"
      - "Add ceremony.md reference to batteries CLAUDE.md template or kata setup output so Claude reads it as context"
    test_cases:
      - id: "template-fallback-batteries"
        description: "resolveTemplatePath('implementation.md') returns batteries path when .kata/templates/implementation.md does not exist"
        type: "unit"
      - id: "template-project-override"
        description: "resolveTemplatePath('implementation.md') returns project path when .kata/templates/implementation.md exists, ignoring batteries"
        type: "unit"
      - id: "template-absolute-unchanged"
        description: "resolveTemplatePath('/abs/path.md') still works for absolute paths without hitting batteries"
        type: "unit"
      - id: "ceremony-file-exists"
        description: "batteries/ceremony.md exists and contains shared workflow instructions (commit, PR, branch, env-check, tests)"
        type: "unit"
      - id: "no-step-ref-resolution"
        description: "Template phases no longer use $ref — all instructions are inline or delegated to skills"
        type: "unit"
  - id: p2
    name: "User-scoped skill installation"
    tasks:
      - "Add getUserSkillsDir() to src/session/lookup.ts returning path.join(os.homedir(), '.claude', 'skills')"
      - "Add installUserSkills() function in src/commands/scaffold-batteries.ts that copies batteries/skills/{name}/ to ~/.claude/skills/kata-{name}/ with kata- prefix namespacing"
      - "Call installUserSkills() from setup() in src/commands/setup.ts after scaffoldBatteries() on the --yes path (line 397)"
      - "Call installUserSkills() from update() in src/commands/update.ts after scaffoldBatteries() (line 34)"
      - "Add result tracking for user skill installation (count installed, count updated, count skipped) to BatteriesResult or a new UserSkillsResult type"
      - "Output user skill installation summary in setup (src/commands/setup.ts line 405) and update (src/commands/update.ts line 52) commands"
      - "Add output message during setup listing user-scoped skill install locations and explaining project-level override mechanism"
      - "installUserSkills() must accept an optional homeDir parameter (default os.homedir()) for test isolation — tests pass a temp dir to avoid polluting the real ~/.claude/skills/"
    test_cases:
      - id: "user-skills-installed"
        description: "installUserSkills() copies batteries/skills/code-impl/ to {homeDir}/.claude/skills/kata-code-impl/ with correct file contents (using temp homeDir)"
        type: "integration"
      - id: "user-skills-prefix"
        description: "All installed user skills use kata- prefix (kata-code-impl, kata-code-review, etc.), not bare names"
        type: "unit"
      - id: "user-skills-update"
        description: "installUserSkills() with update=true overwrites existing user skill files"
        type: "unit"
      - id: "user-skills-skip-existing"
        description: "installUserSkills() with update=false skips existing user skill directories"
        type: "unit"
  - id: p3
    name: "Slim scaffold and clean migration"
    tasks:
      - "Remove template copying from scaffoldBatteries() in src/commands/scaffold-batteries.ts (lines 132-141, the copyDirectory call for templates)"
      - "Remove steps.yaml copying from scaffoldBatteries() in src/commands/scaffold-batteries.ts (lines 238-255, the steps.yaml block) and delete batteries/steps.yaml"
      - "Remove project-level skill copying from scaffoldBatteries() in src/commands/scaffold-batteries.ts (lines 143-162, the skills loop)"
      - "Remove templates, skills fields from BatteriesResult interface in src/commands/scaffold-batteries.ts (lines 10, 14) and update all references"
      - "Add cleanLegacyFiles() function in src/commands/scaffold-batteries.ts that removes .kata/templates/*.md, .kata/steps.yaml (legacy), and .claude/skills/{name}/ for each batteries skill name"
      - "Call cleanLegacyFiles() from update() in src/commands/update.ts before scaffoldBatteries() to remove stale project copies"
      - "Update setup output in src/commands/setup.ts to remove template/skill count lines that no longer apply"
      - "Update update output in src/commands/update.ts to report cleaned legacy files"
    test_cases:
      - id: "scaffold-no-templates"
        description: "scaffoldBatteries() does not create .kata/templates/ directory or copy template files"
        type: "unit"
      - id: "scaffold-no-steps"
        description: "scaffoldBatteries() does not create .kata/steps.yaml"
        type: "unit"
      - id: "scaffold-no-skills"
        description: "scaffoldBatteries() does not create .claude/skills/ entries for batteries skills"
        type: "unit"
      - id: "clean-removes-templates"
        description: "cleanLegacyFiles() removes .kata/templates/ directory containing batteries template files"
        type: "integration"
      - id: "clean-removes-steps"
        description: "cleanLegacyFiles() removes .kata/steps.yaml (fully replaced by ceremony.md)"
        type: "integration"
      - id: "clean-removes-skills"
        description: "cleanLegacyFiles() removes .claude/skills/code-impl/ (bare name) but not .claude/skills/kata-code-impl/ (prefixed name) or .claude/skills/my-custom-skill/"
        type: "integration"
      - id: "clean-preserves-custom"
        description: "cleanLegacyFiles() does not remove project-specific template files that are not in batteries (e.g., .kata/templates/my-custom.md)"
        type: "unit"
  - id: p4
    name: "kata config get command"
    tasks:
      - "Add 'get' subcommand handling to config() in src/commands/config.ts (line 14, alongside existing --show)"
      - "Implement getConfigValue(key: string) function in src/commands/config.ts that reads kata.yaml and resolves dot-notation keys (e.g., 'project.test_command', 'spec_path', 'modes.implementation.template')"
      - "Output raw value to stdout (string values unquoted, arrays as newline-separated, objects as JSON) for consumption by skill backtick expressions"
      - "Return exit code 1 and stderr message when key does not exist in config"
      - "Handle nested keys: 'project.name', 'reviews.code_reviewer', 'modes.implementation.stop_conditions'"
    test_cases:
      - id: "config-get-scalar"
        description: "kata config get spec_path outputs 'planning/specs' to stdout"
        type: "unit"
      - id: "config-get-nested"
        description: "kata config get project.test_command outputs the test command string"
        type: "unit"
      - id: "config-get-array"
        description: "kata config get modes.implementation.stop_conditions outputs each condition on a separate line"
        type: "unit"
      - id: "config-get-missing"
        description: "kata config get nonexistent.key exits with code 1 and stderr message"
        type: "unit"
      - id: "config-get-mode-template"
        description: "kata config get modes.implementation.template outputs 'implementation.md'"
        type: "unit"
  - id: p5
    name: "Integration tests and verification"
    tasks:
      - "Add integration test: kata enter implementation with no .kata/templates/ directory succeeds using batteries fallback"
      - "Add integration test: kata enter with project-level template override uses project template instead of batteries"
      - "Add integration test: kata setup --yes creates user-scoped skills at ~/.claude/skills/kata-{name}/ and does not create .kata/templates/ or .kata/steps.yaml"
      - "Add integration test: kata update removes legacy .kata/templates/, .kata/steps.yaml, .claude/skills/{bare-name}/ and installs user-scoped skills"
      - "Add integration test: kata config get project.name returns correct value from kata.yaml"
      - "Update src/commands/config.ts showConfig() to reflect actual resolution order now that batteries fallback is implemented"
      - "Verify all existing tests pass with the new resolution order (bun test src/)"
    test_cases:
      - id: "e2e-enter-batteries-fallback"
        description: "kata enter succeeds for a project with no .kata/templates/ directory, resolving templates from batteries"
        type: "integration"
      - id: "e2e-setup-user-skills"
        description: "kata setup --yes installs skills to ~/.claude/skills/kata-*/ and does not copy templates/steps/skills to project"
        type: "integration"
      - id: "e2e-update-migration"
        description: "kata update on a project with legacy copies removes them and installs user-scoped skills"
        type: "integration"
      - id: "e2e-config-get"
        description: "kata config get project.name returns correct value"
        type: "integration"
      - id: "existing-tests-pass"
        description: "bun test src/ passes with zero failures"
        type: "integration"
---

# Dual Resolution Template System

## Summary

Move kata-wm from a copy-everything-to-project model to a dual-resolution model where templates and steps resolve at runtime: project-level first, then package (batteries) fallback. Skills move to user-scoped `~/.claude/skills/kata-{name}/` directories. A new `kata config get` command lets skills query project configuration.

## Motivation

Today, `kata setup` copies all batteries content (templates, steps, skills) into each project. This creates maintenance burden: every `kata update` must overwrite project files, projects accumulate stale copies, and there is no clean separation between "kata framework files" and "project customizations." Prompts and interviews already use dual resolution successfully; templates and steps should follow the same pattern.

## Current State

### Already dual-resolution (no changes needed)
- **Prompts**: `src/providers/prompt.ts:65-86` -- `loadPrompt()` checks `.kata/prompts/` first, falls back to `batteries/prompts/`
- **Interviews**: `src/commands/interview.ts:50-70` -- `loadInterviewCategory()` checks `.kata/interviews/` first, falls back to `batteries/interviews/`
- **Mode rules**: `src/commands/enter.ts:34-51` -- `getModeRules()` checks project kata.yaml first, falls back to `batteries/kata.yaml`

### Needs dual-resolution (this spec)
- **Templates**: `src/session/lookup.ts:237-265` -- `resolveTemplatePath()` only checks `.kata/templates/`, throws if not found

### Being removed (this spec)
- **Steps**: `src/commands/enter/step-library.ts:11-33` -- `$ref` step resolution replaced by `ceremony.md` (plain markdown context) and inline template instructions

### Needs relocation (this spec)
- **Skills**: `src/commands/scaffold-batteries.ts:143-162` -- copied to `.claude/skills/{name}/` per-project; should be user-scoped at `~/.claude/skills/kata-{name}/`

## Behaviors

### B1: Template dual resolution

- **ID**: B1
- **Trigger**: `resolveTemplatePath('implementation.md')` called during `kata enter implementation`
- **Expected**: Checks `.kata/templates/implementation.md` first. If not found, checks `batteries/templates/implementation.md`. Returns the first path that exists. If neither exists, throws with both checked paths listed.
- **Verify**: Unit test creates a temp dir with no `.kata/templates/` and confirms `resolveTemplatePath()` returns the batteries path. Second test creates `.kata/templates/implementation.md` and confirms it takes priority.

### B2: Replace steps.yaml with ceremony.md

- **ID**: B2
- **Trigger**: `kata setup --yes` runs, or Claude enters a mode that previously used `$ref` steps
- **Expected**: `batteries/steps.yaml` is replaced by `batteries/ceremony.md` — a plain markdown file containing shared workflow instructions (commit patterns, PR creation, branch naming, env checks, test running). This file is referenced from CLAUDE.md so Claude reads it as context. The `$ref` step resolution system (`loadStepLibrary()`, `resolveStepRef()`) is removed. Template phases that previously used `$ref` have their instructions inlined or delegated to skills. `.kata/steps.yaml` is removed during clean migration (B7).
- **Verify**: Unit test confirms template phases contain no `$ref` fields. Integration test confirms `kata enter implementation` works without `.kata/steps.yaml` or `batteries/steps.yaml`.

### B3: User-scoped skill installation

- **ID**: B3
- **Trigger**: `kata setup --yes` or `kata update` runs skill installation
- **Expected**: Each directory in `batteries/skills/` (e.g., `code-impl`, `code-review`) is copied to `~/.claude/skills/kata-{name}/` (e.g., `~/.claude/skills/kata-code-impl/`). The `kata-` prefix namespaces kata skills to avoid collision with other tools. On setup, existing user skills are skipped. On update, existing user skills are overwritten.
- **Verify**: Integration test runs `installUserSkills()` and checks that `~/.claude/skills/kata-code-impl/SKILL.md` exists with correct content.

### B4: Skill override via project scope

- **ID**: B4
- **Trigger**: Claude Code loads skills from both user and project `.claude/skills/` directories
- **Expected**: A project can override a user-scoped kata skill by placing a file at `.claude/skills/kata-{name}/SKILL.md` in the project. Claude Code's native skill loading gives project-level skills precedence over user-level skills. No kata code changes needed for this behavior -- it is a Claude Code platform feature. Documentation should explain the override mechanism.
- **Verify**: Unit test confirms that Claude Code skill loading order gives project `.claude/skills/` precedence over `~/.claude/skills/` (verify via skill directory listing function if available, or document as platform assumption).

### B5: Lighter scaffold

- **ID**: B5
- **Trigger**: `kata setup --yes` or `scaffoldBatteries()` called
- **Expected**: `scaffoldBatteries()` no longer copies templates, steps.yaml, or skills to the project. It still copies: kata.yaml, prompts, providers, spec-templates, GitHub issue templates, labels.json, interviews, and verification-tools.md. The project `.kata/templates/` directory is not created by setup (only exists if the user creates it for overrides).
- **Verify**: Unit test calls `scaffoldBatteries()` on a temp dir and confirms no `.kata/templates/`, no `.kata/steps.yaml`, and no `.claude/skills/` entries exist.

### B6: kata config get

- **ID**: B6
- **Trigger**: User or skill runs `kata config get project.test_command`
- **Expected**: Loads the project `.kata/kata.yaml` (not batteries), traverses to the nested key `project.test_command` using dots as path separators (literal dots in key names are not supported), outputs the raw value to stdout. Scalar values print as-is. Arrays print one element per line. Objects print as JSON. Boolean values print as `true`/`false`. Null values print empty string. Requesting a key that points to the entire modes map prints JSON. Missing keys cause exit code 1 with a stderr error message. This enables skills to query config via backtick expressions like `` `kata config get project.test_command` ``.
- **Verify**: Unit test loads a known kata.yaml, calls `getConfigValue('project.test_command')` and confirms output matches.

### B7: Clean migration

- **ID**: B7
- **Trigger**: `kata update` runs on a project that has legacy copied templates, steps, and skills
- **Expected**: Before scaffolding, `cleanLegacyFiles()` backs up then removes matching legacy files: (1) `.kata/templates/{name}.md` for each file that exists in `batteries/templates/` — backed up to `.kata/batteries-backup/{timestamp}/templates/` before deletion, (2) `.claude/skills/{name}/` for each bare-named skill directory that matches a batteries skill name (e.g., `code-impl` but not `kata-code-impl` or `my-custom-skill`). `.kata/steps.yaml` is NOT deleted — it may contain user-authored custom step definitions alongside batteries-originated keys; dual resolution makes the batteries copy redundant without needing deletion. Custom project template files that are not in batteries are preserved. `kata update` output lists each removed file and the backup location. Rationale: batteries files are framework-owned. If a user customized a batteries-named template in-place, the backup preserves their work and they can restore it as a project override.
- **Verify**: Integration test creates a project with legacy copies plus a custom template, runs `cleanLegacyFiles()`, confirms batteries copies are removed and custom template is preserved.

### B8: kata update refresh

- **ID**: B8
- **Trigger**: `kata update` runs
- **Expected**: After cleaning legacy files, `kata update` calls `installUserSkills(update=true)` to refresh user-scoped skills with latest batteries content. It also runs `scaffoldBatteries(update=true)` for the remaining project files (prompts, providers, etc.). The version stamp in kata.yaml is updated. Note: B8 spans P2 (`installUserSkills`) and P3 (`cleanLegacyFiles` + `scaffoldBatteries`), with P3 being the completing phase.
- **Verify**: Integration test runs `update()`, confirms user skills at `~/.claude/skills/kata-{name}/` are refreshed with latest content.

## Non-Goals

- Partial or merge-based template overrides (whole-file override only; a project either uses the batteries template or provides a complete replacement)
- Moving prompts or interviews to a different resolution model (they already have dual resolution)
- Changing LLM provider resolution
- Symlink-based resolution (all resolution is path-based with `existsSync` checks)
- Multi-user skill management (single user home directory assumed)
- Changing the batteries directory structure within the kata package
- Kata uninstall/teardown command (tracked as a follow-up; user-scoped skills at `~/.claude/skills/kata-*/` persist after package uninstall)

## Architecture

### Resolution order (consistent across all resource types)

```
1. Project-level (.kata/templates/, .kata/prompts/, .kata/interviews/)
2. Package-level (batteries/templates/, batteries/prompts/, batteries/interviews/)
```

This matches the existing pattern in `loadPrompt()` (`src/providers/prompt.ts:65-86`) and `loadInterviewCategory()` (`src/commands/interview.ts:50-70`).

### Ceremony replaces steps

```
Before: batteries/steps.yaml → .kata/steps.yaml (copied, $ref resolved at runtime)
After:  batteries/ceremony.md → referenced from CLAUDE.md (read as context by Claude)
```

`ceremony.md` is a plain markdown file with shared workflow instructions (commit patterns, PR creation, branch naming, etc.). Claude reads it as context rather than kata resolving `$ref` references. Projects can override by placing their own `ceremony.md` in `.kata/` or adjusting CLAUDE.md.

Line numbers are approximate references to the current codebase and may shift during implementation; use function names as the primary anchor.

### Skill location change

```
Before: .claude/skills/{name}/SKILL.md        (project-scoped, copied by scaffoldBatteries)
After:  ~/.claude/skills/kata-{name}/SKILL.md  (user-scoped, installed by installUserSkills)
```

The `kata-` prefix prevents collisions with skills from other tools or user-created skills. Claude Code's native skill loading checks project `.claude/skills/` before user `~/.claude/skills/`, so project-level overrides work without any kata code.

### Files changed per phase

**P1** (template fallback + ceremony.md):
- `src/session/lookup.ts` -- add `getBatteriesTemplatesDir()`, modify `resolveTemplatePath()`
- `src/commands/enter/step-library.ts` -- remove `$ref` resolution system
- `batteries/ceremony.md` -- new file with shared workflow instructions
- `batteries/templates/*.md` -- inline instructions that previously used `$ref`

**P2** (user-scoped skills):
- `src/session/lookup.ts` -- add `getUserSkillsDir()`
- `src/commands/scaffold-batteries.ts` -- add `installUserSkills()`
- `src/commands/setup.ts` -- call `installUserSkills()`
- `src/commands/update.ts` -- call `installUserSkills(update=true)`

**P3** (slim scaffold + clean migration):
- `src/commands/scaffold-batteries.ts` -- remove template/step/skill copying, add `cleanLegacyFiles()`
- `src/commands/update.ts` -- call `cleanLegacyFiles()` before scaffold
- `src/commands/setup.ts` -- update output messaging

**P4** (kata config get):
- `src/commands/config.ts` -- add `get` subcommand and `getConfigValue()` function

**P5** (integration tests):
- New test files or additions to existing test files in `src/commands/`
- `src/commands/config.ts` -- update `showConfig()` display

## Risks and Mitigations

**Risk**: Projects relying on modified copies in `.kata/templates/` lose customizations during migration.
**Mitigation**: `cleanLegacyFiles()` only removes files whose names match batteries filenames. Files with custom names are preserved. The `kata update` output lists every file removed so users can see what changed.

**Risk**: User-scoped skills at `~/.claude/skills/kata-{name}/` persist across kata uninstall.
**Mitigation**: `kata teardown` (if it exists) or documentation should mention cleaning `~/.claude/skills/kata-*/` directories.

**Risk**: Step library merge produces unexpected results when batteries and project define the same step ID with different schemas.
**Mitigation**: Both sources are validated through `stepLibrarySchema` before merging. The merge is shallow (project step replaces entire batteries step definition for the same key), not a deep field-by-field merge.
