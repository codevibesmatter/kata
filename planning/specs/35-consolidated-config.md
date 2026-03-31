---
initiative: feat-consolidated-config
type: project
issue_type: feature
status: approved
priority: high
github_issue: 35
created: 2026-03-31
updated: 2026-04-01
phases:
  - id: p1
    name: "Absorb interviews + subphase-patterns into kata.yaml"
    tasks:
      - "Extend KataConfigSchema with interviews: and subphase_patterns: sections"
      - "Migrate loadInterviewConfig() callers to read from kata.yaml"
      - "Migrate loadSubphasePatterns() callers to read from kata.yaml"
      - "Delete src/config/interviews.ts and src/config/subphase-patterns.ts"
      - "Update src/index.ts re-exports (remove interviews.ts and subphase-patterns.ts)"
      - "Delete batteries/interviews.yaml and batteries/subphase-patterns.yaml"
      - "Update seed batteries/kata.yaml with interviews + patterns sections"
      - "Unit tests for expanded schema validation"
  - id: p2
    name: "Simplify kata setup (skeleton only)"
    tasks:
      - "Rewrite setup.ts to create .kata/ skeleton with seed files"
      - "Add kata_version field to KataConfigSchema, read version from package.json"
      - "Stamp all generated files with kata_version in frontmatter"
      - "Error if .kata/ already exists (suggest kata migrate)"
      - "Remove --batteries flag and batteries scaffolding from setup"
      - "Auto-detect project name, test command, build command"
      - "Register hooks in .claude/settings.json"
      - "Add --dry-run flag to preview changes"
      - "Unit tests for setup command"
  - id: p3
    name: "Add kata update (upstream merge)"
    tasks:
      - "Create src/commands/update.ts"
      - "Read kata_version from project files, compare to package version"
      - "Structural merge: phases/steps/dependencies from upstream"
      - "Preserve behavioral customizations (instructions, rules)"
      - "For kata.yaml: add new modes/fields, preserve project-specific values"
      - "For templates/prompts: smart merge (if local matches old base, replace; if differs, skip with diff shown)"
      - "Add --dry-run flag to preview merge results"
      - "Unit tests for merge logic"
  - id: p4
    name: "Add kata migrate (old layout conversion)"
    tasks:
      - "Create src/commands/migrate.ts"
      - "Absorb interviews.yaml into kata.yaml interviews section"
      - "Absorb subphase-patterns.yaml into kata.yaml subphase_patterns section"
      - "Move planning/spec-templates/ to .kata/spec-templates/"
      - "Stamp kata_version on all files"
      - "Remove old files after successful migration"
      - "Add --dry-run flag to preview migration"
      - "Unit tests for migration paths"
  - id: p5
    name: "Remove batteries system"
    tasks:
      - "Delete src/commands/batteries.ts"
      - "Delete src/commands/scaffold-batteries.ts"
      - "Delete batteries/ directory (content absorbed into seed files)"
      - "Remove 2-tier template lookup from resolveTemplatePath()"
      - "Remove 2-tier merge from config loaders"
      - "Remove batteries-backup/ logic"
      - "Update CLI dispatcher (index.ts) to remove batteries command, add update/migrate"
      - "Update eval fixtures to new layout"
      - "Update CLAUDE.md architecture docs"
---

# Consolidated Config: Setup Overhaul, Upstream Merge, and Batteries Removal

> GitHub Issue: [#35](https://github.com/codevibesmatter/kata-wm/issues/35)
> Supersedes: [#30 — Unified kata.yaml](./30-unified-kata-yaml.md)

## Overview

The config system is scattered across 10+ files (kata.yaml, interviews.yaml, subphase-patterns.yaml, verification-tools.md, plus templates, prompts, agents, spec-templates), with a confusing batteries concept (2-tier lookup, `--update` that clobbers local changes, package-vs-project duality). This spec replaces the entire batteries/setup system with: (1) a simplified `kata setup` that creates a complete skeleton with seed files, (2) a `kata update` command for smart upstream merging via `kata_version` tracking, (3) a `kata migrate` command for existing projects, and (4) removal of the batteries system entirely. The audience is every kata user, and this is needed now because the batteries abstraction is the primary source of confusion and support friction.

## Feature Behaviors

### B1: Absorb interviews and subphase-patterns into kata.yaml

**Core:**
- **ID:** absorb-configs-into-kata-yaml
- **Trigger:** Any kata command that previously loaded interviews.yaml or subphase-patterns.yaml
- **Expected:** Config loaded from `.kata/kata.yaml` sections `interviews:` and `subphase_patterns:` instead of separate files. The 2-tier merge (package batteries to project overlay) is eliminated. Single source of truth.
- **Verify:** `grep -r "loadInterviewConfig\|loadSubphasePatterns\|batteries/interviews\|batteries/subphase-patterns" src/` returns no results after implementation. `npm run build && npm test` passes.
- **Source:** `src/config/interviews.ts`, `src/config/subphase-patterns.ts`, `src/config/kata-config.ts`

#### Data Layer

Extend `KataConfigSchema` in `src/config/kata-config.ts` with two new sections:

```yaml
# Added to kata.yaml
interviews:
  requirements:
    name: "Requirements"
    description: "Clarify the problem and scope"
    rounds:
      - header: "Problem"
        question: "What user problem does this solve?"
        options:
          - {label: "User workflow gap", description: "Missing capability"}
          # ...
  # ... more categories

subphase_patterns:
  impl-test-verify:
    description: "Standard implement-test-verify cycle"
    steps:
      - id_suffix: impl
        title_template: "IMPL - {task_summary}"
        instruction: "..."
      # ...
```

The Zod schemas from `InterviewConfigSchema` and `SubphasePatternConfigSchema` are absorbed into `KataConfigSchema` as optional sections with sensible defaults (empty records if not provided).

#### Files to modify

| File | Change |
|------|--------|
| `src/config/kata-config.ts` | Add `interviews` and `subphase_patterns` sections to `KataConfigSchema` |
| `src/commands/enter.ts` | Replace `loadSubphasePatterns()` call (line ~409) with `loadKataConfig().subphase_patterns` |
| `src/config/interviews.ts` | Delete (2-tier loader no longer needed) |
| `src/config/interviews.test.ts` | Delete |
| `src/config/subphase-patterns.ts` | Delete (2-tier loader no longer needed) |
| `src/config/subphase-patterns.test.ts` | Delete |
| `batteries/interviews.yaml` | Delete (content absorbed into seed `batteries/kata.yaml`) |
| `batteries/subphase-patterns.yaml` | Delete (content absorbed into seed `batteries/kata.yaml`) |
| `batteries/kata.yaml` | Add `interviews:` and `subphase_patterns:` sections |
| `src/index.ts` | Remove re-exports of `./config/interviews.js` and `./config/subphase-patterns.js` (these modules are deleted) |

---

### B2: Simplified kata setup (skeleton only)

**Core:**
- **ID:** setup-skeleton-only
- **Trigger:** User runs `kata setup` in a project directory
- **Expected:** Creates `.kata/` directory with complete seed files: `kata.yaml` (with auto-detected project settings, default modes, interviews, subphase patterns), `templates/` (all mode templates copied from `batteries/templates/`), `prompts/`, `spec-templates/`, and `sessions/`. Registers hooks in `.claude/settings.json`. Copies agent definitions to `.claude/agents/`. Stamps `kata_version` on `kata.yaml`. All files are immediately usable without running onboard.
- **Verify:** Run `kata setup` in a fresh git repo. Confirm `.kata/kata.yaml` exists with `kata_version`, `project:`, `modes:`, `interviews:`, `subphase_patterns:` sections. Confirm `.kata/templates/` contains all mode templates. Confirm `.claude/settings.json` has hook registrations. Confirm `kata enter task` works immediately after setup.
- **Source:** `src/commands/setup.ts`, `src/commands/scaffold-batteries.ts`

#### UI Layer

```
$ kata setup
kata setup complete:
  Project: my-app
  Test command: npm test
  CI: github-actions
  Config: .kata/kata.yaml (v1.5.0)
  Hooks: .claude/settings.json
  Templates: 8 mode templates
  Prompts: 5 review prompts
  Agents: 3 agent definitions

Run: kata enter onboard  (recommended: customizes config for your project)
Run: kata enter <mode>   (skip onboard, start working immediately)
```

Error when `.kata/` already exists:
```
$ kata setup
kata: .kata/ already exists. This project is already set up.
  To update upstream templates: kata update
  To reconfigure: kata enter onboard
```

#### Flags

| Flag | Effect |
|------|--------|
| `--strict` | Register PreToolUse task enforcement hooks |
| `--cwd=PATH` | Run setup in a different directory |
| `--dry-run` | Preview what would be created without writing files |

Removed flags: `--yes` (no longer needed, setup is always non-interactive), `--batteries` (no longer a separate concept).

#### Seed file sources

Setup copies seed files from the following `batteries/` subdirectories in the package:

| Seed source (package) | Destination (project) | Notes |
|---|---|---|
| `batteries/kata.yaml` | `.kata/kata.yaml` | Includes modes, interviews, subphase_patterns sections |
| `batteries/templates/` | `.kata/templates/` | All mode templates (task.md, planning.md, etc.) |
| `batteries/prompts/` | `.kata/prompts/` | Review prompt templates (code-review.md, spec-review.md, etc.) |
| `batteries/spec-templates/` | `.kata/spec-templates/` | Spec document stubs (feature.md, bug.md, epic.md) |
| `batteries/agents/` | `.claude/agents/` | Agent definitions (impl-agent.md, review-agent.md, test-agent.md) |

#### Files to modify

| File | Change |
|------|--------|
| `src/commands/setup.ts` | Rewrite: always scaffold everything (merge setup + batteries into one step), add `--dry-run`, add `kata_version` stamping, error if `.kata/` exists. Copy seed files from batteries/ subdirectories listed above. |
| `src/commands/scaffold-batteries.ts` | Delete (logic absorbed into setup.ts) |
| `src/config/setup-profile.ts` | Keep auto-detection functions (`detectProjectName`, `detectTestCommand`, `detectCI`), remove `SetupProfile` interface (simplified) |

---

### B3: kata_version tracking in generated files

**Core:**
- **ID:** kata-version-tracking
- **Trigger:** `kata setup` creates files, or `kata update` modifies files
- **Expected:** `kata.yaml` contains a top-level `kata_version: "X.Y.Z"` field recording which package version generated it. The version is read from `package.json` at generation time.
- **Verify:** After `kata setup`, `grep kata_version .kata/kata.yaml` shows the current package version. After `kata update`, the version is bumped to the current package version.
- **Source:** `src/config/kata-config.ts` (schema), `src/commands/setup.ts` (writer)

#### Data Layer

Add to `KataConfigSchema`:
```typescript
kata_version: z.string().optional(),
```

The version is informational (not enforced by schema validation) and used by `kata update` to determine the upstream base for merge.

#### Files to modify

| File | Change |
|------|--------|
| `src/config/kata-config.ts` | Add `kata_version: z.string().optional()` to `KataConfigSchema` |
| `src/commands/setup.ts` | Read version from `package.json` and write it to `kata_version` field when generating `kata.yaml` |

---

### B4: kata update (upstream merge)

**Core:**
- **ID:** upstream-merge
- **Trigger:** User runs `kata update`
- **Expected:** Compares project files against upstream (package) seed files. For `kata.yaml`: adds new modes and fields from upstream, preserves project-specific values (project.*, reviews.*, global_rules, per-mode rules). For templates: if local file matches the old upstream base exactly, replaces with new upstream; if local differs, skips and shows a diff summary. Updates `kata_version` in all touched files.
- **Verify:** (1) Add a new mode to `batteries/kata.yaml` in a newer package version. Run `kata update`. The new mode appears in `.kata/kata.yaml` without overwriting existing modes. (2) Modify a template instruction locally. Run `kata update`. The modified template is preserved, and the diff is shown.
- **Source:** New file `src/commands/update.ts`

#### UI Layer

```
$ kata update --dry-run
kata update: comparing project (v1.4.0) against package (v1.5.0)

kata.yaml:
  + modes.debug: new mode added
  + project.smoke_command: new field
  ~ modes.task.stop_conditions: upstream changed (local unchanged, will update)
  = modes.planning: no upstream changes

templates:
  = task.md: local matches upstream, will update
  ! implementation.md: local customized, skipping (run with --diff to see changes)
  + debug.md: new template, will copy

Prompts:
  = code-review.md: unchanged, will update

Run without --dry-run to apply changes.

$ kata update
kata update: updated 4 files, skipped 1 (customized)
  Updated: kata.yaml, task.md, debug.md, code-review.md
  Skipped: implementation.md (customized -- review manually)
```

#### Merge Logic

**Structural merge for kata.yaml:**
1. Read project `kata.yaml` and note its `kata_version`
2. Load the package seed `batteries/kata.yaml` as upstream
3. For each upstream mode not in project: add it
4. For each upstream config field not in project: add with default
5. Never touch: `project.*`, `reviews.*`, `providers.*`, `global_rules`, `task_rules`, per-mode `rules`
6. For existing modes: do not touch structural fields (template, stop_conditions, issue_handling). If the local value differs from current upstream, assume the user customized it and preserve it. If it matches current upstream, leave as-is (already up to date).

**Simple merge for templates/prompts/agents/spec-templates:**
1. Compare local file content against the current upstream seed (package `batteries/` files)
2. If local content matches upstream content exactly: replace with new upstream (no-op in practice, but stamps version)
3. If local differs from upstream: skip, report as customized

**--force flag:** When `--force` is passed, skip all customization checks and overwrite every file with the current upstream version. This is a destructive operation intended for cases where the user wants to fully reset to upstream defaults.

Note: For v1, the merge does not reconstruct the "old base" from a previous package version. It compares local against current upstream only. Files that differ from upstream are assumed customized and preserved. This is a safe default that avoids overwriting user changes.

#### Flags

| Flag | Effect |
|------|--------|
| `--dry-run` | Preview changes without writing |
| `--diff` | Show full diffs for skipped (customized) files |
| `--force` | Overwrite all files regardless of local customization |

#### Files to create/modify

| File | Change |
|------|--------|
| `src/commands/update.ts` | New: implements upstream merge logic |
| `src/index.ts` | Add `update` command to dispatcher |

---

### B5: kata migrate (old layout conversion)

**Core:**
- **ID:** migrate-old-layout
- **Trigger:** User runs `kata migrate` in a project with old-style config (separate `interviews.yaml`, `subphase-patterns.yaml`, or `planning/spec-templates/`). Supports both `.kata/` layout and the original `.claude/workflows/` layout.
- **Expected:** Reads old config files, merges their content into the `interviews:` and `subphase_patterns:` sections of `kata.yaml`. Moves `planning/spec-templates/` to `.kata/spec-templates/`. Stamps `kata_version`. Removes old files after successful migration. Reports what was done. For `.claude/workflows/` layout projects: detects config at `.claude/workflows/interviews.yaml`, `.claude/workflows/subphase-patterns.yaml`, and `.claude/workflows/kata.yaml`; migrates to `.kata/` layout as part of the conversion.
- **Verify:** (1) Create a project with old `.kata/` layout files (`.kata/interviews.yaml`, `.kata/subphase-patterns.yaml`). Run `kata migrate`. Confirm `kata.yaml` contains the merged content. Confirm old files are removed. Confirm `kata enter task` works. (2) Create a project with `.claude/workflows/` layout. Run `kata migrate`. Confirm files are moved to `.kata/` and old `.claude/workflows/` config is removed.
- **Source:** New file `src/commands/migrate.ts`

#### UI Layer

```
$ kata migrate --dry-run
kata migrate: detected old config files
  Will absorb: .kata/interviews.yaml -> kata.yaml interviews section
  Will absorb: .kata/subphase-patterns.yaml -> kata.yaml subphase_patterns section
  Will move: planning/spec-templates/ -> .kata/spec-templates/
  Will stamp: kata_version on kata.yaml
  Will remove: interviews.yaml, subphase-patterns.yaml

Run without --dry-run to apply.

$ kata migrate
kata migrate: migration complete
  Absorbed: interviews.yaml -> kata.yaml
  Absorbed: subphase-patterns.yaml -> kata.yaml
  Moved: planning/spec-templates/ -> .kata/spec-templates/
  Stamped: kata_version 1.5.0
  Removed: 2 old config files
```

Error when no old files found:
```
$ kata migrate
kata migrate: nothing to migrate. Project config is already current.
```

#### Flags

| Flag | Effect |
|------|--------|
| `--dry-run` | Preview migration without writing |

#### Files to create/modify

| File | Change |
|------|--------|
| `src/commands/migrate.ts` | New: reads old files, merges into kata.yaml, moves spec-templates, cleans up |
| `src/index.ts` | Add `migrate` command to dispatcher |

---

### B6: Remove batteries system

**Core:**
- **ID:** remove-batteries
- **Trigger:** Implementation of this spec (code removal)
- **Expected:** The `kata batteries` command is removed. The `batteries/` directory is retained only as a seed source for `kata setup` and `kata update` (no runtime 2-tier lookup). `resolveTemplatePath()` looks only in project `.kata/templates/` (no fallback to `batteries/templates/`). `resolveSpecTemplatePath()` looks only in `.kata/spec-templates/` (no fallback to `batteries/spec-templates/`). Error messages say "Run 'kata setup'" instead of "Run 'kata batteries'".
- **Verify:** `grep -r "kata batteries" src/` returns no results. `grep -r "batteries/templates" src/session/lookup.ts` returns no results. Running `kata batteries` shows "unknown command". Template resolution only checks project directory.
- **Source:** `src/commands/batteries.ts`, `src/commands/scaffold-batteries.ts`, `src/session/lookup.ts`, `src/index.ts`

#### Files to delete

| File | Reason |
|------|--------|
| `src/commands/batteries.ts` | Command removed |
| `src/commands/scaffold-batteries.ts` | Logic absorbed into `src/commands/setup.ts` |

#### Files to modify

| File | Change |
|------|--------|
| `src/session/lookup.ts` | `resolveTemplatePath()`: remove batteries fallback (lines ~332-337), error message says "Run 'kata setup'". `resolveSpecTemplatePath()`: remove batteries fallback (lines ~373-383), check `.kata/spec-templates/` instead of `planning/spec-templates/`. Remove `getProjectInterviewsPath()`, `getProjectSubphasePatternsPath()`, `getProjectVerificationToolsPath()`. |
| `src/index.ts` | Remove `batteries` import and case (lines ~27, ~142-144). Add `update` and `migrate` cases. Remove re-exports of deleted config modules (`./config/interviews.js`, `./config/subphase-patterns.js`). |

---

### B7: Update eval fixtures

**Core:**
- **ID:** update-eval-fixtures
- **Trigger:** Implementation of this spec (fixture updates)
- **Expected:** Eval fixtures use the new layout: `.kata/kata.yaml` with embedded interviews/patterns instead of separate files. The eval harness no longer calls `kata batteries --update` to refresh fixtures.
- **Verify:** `npm run eval -- --scenario=task-mode` passes with updated fixtures. No references to `kata batteries` in eval harness.
- **Source:** `eval-fixtures/tanstack-start/.claude/workflows/kata.yaml`, `eval/harness.ts`

#### Files to modify

| File | Change |
|------|--------|
| `eval-fixtures/tanstack-start/` | Move config from `.claude/workflows/kata.yaml` to `.kata/kata.yaml`. Add `interviews:` and `subphase_patterns:` sections. Remove `.claude/workflows/` directory. |
| `eval/harness.ts` | Replace `kata batteries --update` call with appropriate setup or remove it if fixtures are self-contained |

---

### B8: Update documentation

**Core:**
- **ID:** update-docs
- **Trigger:** Implementation of this spec (doc updates)
- **Expected:** CLAUDE.md reflects the new architecture: no batteries command, simplified setup, update/migrate commands, single kata.yaml with all config sections. Runtime data layout table updated. Commands table updated.
- **Verify:** Read CLAUDE.md and confirm no references to `kata batteries`, `batteries/` directory as runtime lookup, or 2-tier merge. Confirm `kata update` and `kata migrate` are documented.
- **Source:** `CLAUDE.md`

#### Files to modify

| File | Change |
|------|--------|
| `CLAUDE.md` | Update Commands table (remove `kata batteries`, add `kata update`, `kata migrate`). Update Runtime data layout table (remove batteries references). Update Architecture section (no 2-tier lookup, simplified setup). Update Template sources section. |

---

## Non-Goals

- **Changing template frontmatter format** -- phases, steps, task_config, dependencies stay as-is
- **Changing the stop hook mechanism** -- stop_conditions behavior is unchanged
- **Changing the session state schema** -- SessionState is not touched
- **Multi-project manager** -- no `~/.config/kata/manager/` or cross-project coordination
- **Onboard agent rewrite** -- the onboard template improvements (research phase, project-aware customization) are a separate spec; this spec only changes how setup creates the skeleton
- **Removing the `batteries/` directory from the package** -- it remains as the seed source for `kata setup` and `kata update`; what is removed is the runtime 2-tier lookup and the `kata batteries` command
- **Three-way merge for templates** -- `kata update` uses a simple "matches upstream? replace : skip" strategy, not a line-level three-way merge
- **Storing old upstream bases in the project** -- for v1, `kata update` compares local files against current upstream only; files that differ from current upstream are assumed customized and preserved

## Implementation Phases

See YAML frontmatter `phases:` above. Phase ordering:

1. **p1: Absorb interviews + subphase-patterns** (B1) -- extend schema, migrate callers, delete old files. ~2-3 hours.
2. **p2: Simplify kata setup** (B2, B3) -- rewrite to create complete skeleton, remove --batteries, add kata_version. Includes adding `kata_version` field to `KataConfigSchema` and reading the version from `package.json` (B3 schema work). ~3-4 hours.
3. **p3: Add kata update** (B4) -- version tracking, structural merge, dry-run. ~3-4 hours.
4. **p4: Add kata migrate** (B5) -- old layout conversion tool. ~2-3 hours.
5. **p5: Remove batteries system** (B6, B7, B8) -- delete commands, simplify lookup, update fixtures and docs. ~2-3 hours.

Each phase is independently shippable and testable. p1 is a prerequisite for p2-p5. p2 must precede p3 (update needs the new setup output). p4 and p5 can proceed in parallel after p2.

## Test Infrastructure

Existing test infrastructure: Node built-in test runner via `dist/testing/index.js`. Tests live alongside source as `.test.ts` files.

### Build Verification
`npm run build && npm test`

### New test files

| File | Tests |
|------|-------|
| `src/config/kata-config.test.ts` (extend existing) | Schema validation for `interviews` and `subphase_patterns` sections; valid/invalid/missing cases |
| `src/commands/setup.test.ts` (new) | Setup creates complete skeleton, errors on existing `.kata/`, `--dry-run` previews without writing |
| `src/commands/update.test.ts` (new) | Merge logic: new modes added, local customizations preserved, `--dry-run` preview, `--force` overwrites |
| `src/commands/migrate.test.ts` (new) | Migration from old layout absorbs files correctly, `--dry-run` previews, no-op when already current |

## Verification Plan

### VP1: Fresh project setup (end-to-end)

Steps:
1. `mkdir /tmp/test-project && cd /tmp/test-project && git init && npm init -y`
2. `kata setup`
   Expected: `.kata/` directory created with `kata.yaml`, `templates/`, `prompts/`, `sessions/`
3. `cat .kata/kata.yaml | grep kata_version`
   Expected: Shows current package version
4. `cat .kata/kata.yaml | grep -A2 interviews`
   Expected: Shows interviews section with categories
5. `ls .kata/templates/`
   Expected: Lists all mode templates (task.md, planning.md, implementation.md, etc.)
6. `cat .claude/settings.json | grep hook`
   Expected: Shows registered kata hooks
7. `kata enter task --session=test-123`
   Expected: Mode entered successfully

### VP2: Setup refuses on existing project

Steps:
1. In the project from VP1: `kata setup`
   Expected: Error message about `.kata/` already existing, suggesting `kata update`

### VP3: Migrate from old layout

Steps:
1. Create a project with old files: `.kata/interviews.yaml`, `.kata/subphase-patterns.yaml`
2. `kata migrate --dry-run`
   Expected: Shows what would be absorbed
3. `kata migrate`
   Expected: Content merged into `kata.yaml`, old files removed
4. `cat .kata/kata.yaml | grep interviews`
   Expected: Shows interviews section
5. `ls .kata/interviews.yaml 2>&1`
   Expected: File not found

### VP4: Update merges upstream changes

Steps:
1. Set up a project with `kata setup` (seeds at current version)
2. Modify `.kata/templates/task.md` locally (add a comment)
3. `kata update --dry-run`
   Expected: Shows task.md as customized (will skip)
4. `kata update`
   Expected: task.md preserved, other unchanged files updated if upstream changed
5. `kata update --force`
   Expected: All files overwritten with upstream versions, including the customized task.md. Output confirms all files were updated.
6. `diff .kata/templates/task.md` against upstream
   Expected: Files match (local customization was overwritten)

### VP5: No batteries references remain

Steps:
1. `grep -r "kata batteries" src/`
   Expected: No matches
2. `grep -r "loadInterviewConfig\|loadSubphasePatterns" src/`
   Expected: No matches
3. `kata batteries`
   Expected: "Unknown command: batteries"
