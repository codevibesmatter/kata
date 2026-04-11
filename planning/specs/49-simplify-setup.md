---
initiative: simplify-setup
type: project
issue_type: feature
status: draft
priority: medium
github_issue: 49
created: 2026-04-11
updated: 2026-04-11
phases:
  - id: p1
    name: "Merge batteries into setup"
    tasks:
      - "Remove batteries flag from parseArgs in setup.ts, always call scaffoldBatteries after applySetup"
      - "Remove overlapping copies from applySetup() (interviews, steps.yaml, skills) — let scaffoldBatteries own all content copying"
      - "Unify output message (single summary covering base + batteries content)"
      - "Update help text in setup() no-flag path to remove --batteries references"
    test_cases:
      - id: "setup-yes-includes-all"
        description: "kata setup --yes scaffolds mode templates, spec-templates, prompts, github templates"
        type: "integration"
      - id: "setup-yes-idempotent"
        description: "Running kata setup --yes twice does not duplicate or error"
        type: "integration"
  - id: p2
    name: "Fix kata update content-diffing"
    tasks:
      - "Remove early return on version match in update.ts (lines 31-33)"
      - "Always diff template content regardless of version string"
      - "Still stamp kata_version after update completes"
    test_cases:
      - id: "update-same-version-diffs"
        description: "kata update with matching version still checks file content and copies new templates"
        type: "integration"
  - id: p3
    name: "Clean up references"
    tasks:
      - "Remove --no-batteries flag from projects/init.ts, always do full setup"
      - "Fix error messages in session/lookup.ts:263,293 — change 'kata setup --batteries' to 'kata setup --yes'"
      - "Fix stale error message in projects/init.ts:50 referencing 'kata batteries --update'"
      - "Update CLI help text in index.ts showHelp() and setup.ts:416 JSDoc to remove batteries references"
      - "Update setup.test.ts to test unified setup path"
      - "Add deprecated no-op handling for --batteries/-b flag (one version grace period)"
      - "Update eval scenario comments referencing batteries (impl-auth, planning-auth, planning-review-agents, impl-review-agents)"
      - "Update readme.test.ts assertion for batteries string"
    test_cases:
      - id: "projects-init-full-setup"
        description: "kata projects init always scaffolds full content without --batteries flag"
        type: "integration"
      - id: "batteries-flag-noop"
        description: "--batteries flag is accepted silently (deprecated no-op) and does not error"
        type: "unit"
  - id: p4
    name: "Update eval fixtures"
    tasks:
      - "Change eval/harness.ts line 192 from 'kata setup --batteries' to 'kata setup --yes'"
      - "Verify eval scenarios still pass with unified setup"
    test_cases:
      - id: "eval-harness-unified-setup"
        description: "Eval harness uses kata setup --yes and fixture projects get full content"
        type: "smoke"
---

# Simplify Setup: Remove Batteries Distinction

> GitHub Issue: [#49](https://github.com/codevibesmatter/kata-wm/issues/49)

## Overview

`kata setup` currently has two paths: `--yes` (base config only) and `--batteries` (base + mode templates, spec-templates, prompts, GitHub templates). Every real user wants the full content, so the split adds complexity with no benefit. This feature merges the batteries content into the standard `--yes` path, fixes a bug in `kata update` where matching versions skip content diffing, and cleans up all references to the removed flag.

## Feature Behaviors

### B1: Unified Setup Scaffolds All Content

**Core:**
- **ID:** unified-setup
- **Trigger:** User runs `kata setup --yes` (or `kata setup --yes --strict`)
- **Expected:** Setup writes kata.yaml, registers hooks, AND scaffolds all batteries content (mode templates, spec-templates, prompts, GitHub issue templates, providers, verification-tools.md) -- everything that `--batteries` previously added.
- **Verify:** Run `kata setup --yes --cwd=/tmp/test-project`, confirm `.kata/templates/` contains 7 mode templates, `planning/spec-templates/` has 3 spec templates, `.github/ISSUE_TEMPLATE/` has issue templates, `.kata/prompts/` has review prompts.
- **Source:** `src/commands/setup.ts:426` (the `setup()` function)

#### UI Layer

Single unified output message after setup:

```
kata setup complete:
  Project: {name}
  Config: .kata/kata.yaml
  Hooks: .claude/settings.json
  Templates: {N} mode templates
  Spec templates: {N}
  Skills: {N}
```

Replaces the current two-branch output (plain `--yes` vs `--batteries`).

#### API Layer

N/A -- CLI command only.

#### Data Layer

No schema changes. Same files are written, just always instead of conditionally.

---

### B2: Batteries Flag Deprecated as No-Op

**Core:**
- **ID:** batteries-flag-deprecated
- **Trigger:** User runs `kata setup --batteries` or `kata setup -b`
- **Expected:** Flag is silently accepted (no error), setup proceeds identically to `--yes`. A single deprecation notice is written to stderr: `"Note: --batteries is deprecated. kata setup --yes now includes all content."`. The flag still implies `--yes`.
- **Verify:** Run `kata setup --batteries --cwd=/tmp/test`, confirm stderr contains deprecation message, stdout shows normal setup output, all content is scaffolded.
- **Source:** `src/commands/setup.ts:47` (parseArgs function)

#### UI Layer

Stderr deprecation notice (one line). No other behavioral difference.

#### API Layer

N/A

#### Data Layer

N/A

---

### B3: scaffold-batteries Called Internally by Setup

**Core:**
- **ID:** scaffold-batteries-internal
- **Trigger:** `applySetup()` completes in setup.ts
- **Expected:** `scaffoldBatteries(projectRoot)` is called unconditionally after `applySetup()` finishes. The `scaffold-batteries.ts` module is kept as-is (it handles skip-if-exists logic internally), just always invoked.
- **Verify:** After `kata setup --yes`, confirm that `scaffoldBatteries` was called by checking mode templates exist in `.kata/templates/`.
- **Source:** `src/commands/setup.ts:438-468` (the conditional batteries block that becomes unconditional)

#### UI Layer

N/A -- internal wiring change.

#### API Layer

N/A

#### Data Layer

N/A -- `scaffold-batteries.ts` already handles idempotent file copying (skips existing files).

---

### B4: kata update Diffs Content Regardless of Version

**Core:**
- **ID:** update-content-diff
- **Trigger:** User runs `kata update`
- **Expected:** The version-match early return (lines 31-33 of update.ts) is removed. `kata update` always compares each template file's content against the package's batteries version and reports new/changed/customized files. The `kata_version` stamp in kata.yaml is still updated at the end.
- **Verify:** Set kata.yaml `kata_version` to match package.json version. Add a new template to `batteries/templates/`. Run `kata update`. Confirm the new template is copied despite versions matching.
- **Source:** `src/commands/update.ts:31-33` (the early return block)

#### UI Layer

When versions already match, output changes from `"Already up to date (v{X})"` to the normal update report showing per-file status (or `"All templates up to date"` if no changes).

#### API Layer

N/A

#### Data Layer

N/A

---

### B5: projects init Simplified

**Core:**
- **ID:** projects-init-simplified
- **Trigger:** User runs `kata projects init <path>`
- **Expected:** The `--no-batteries` flag is removed. `init.ts` always calls `setup(['--yes', '--cwd=<path>'])` (no `--batteries` needed since `--yes` now includes everything). The JSON output drops the `batteries` field.
- **Verify:** Run `kata projects init /tmp/new-project`. Confirm full content is scaffolded (mode templates present). Confirm `--no-batteries` flag is not accepted (or silently ignored).
- **Source:** `src/commands/projects/init.ts:13-66`

#### UI Layer

Help text changes from `kata projects init <path> [--alias=<name>] [--no-batteries]` to `kata projects init <path> [--alias=<name>]`. JSON output removes `batteries` field.

#### API Layer

N/A

#### Data Layer

N/A

---

### B6: Eval Harness Uses Unified Setup

**Core:**
- **ID:** eval-harness-unified
- **Trigger:** Eval harness sets up a fixture project for a scenario
- **Expected:** Line 192 of `eval/harness.ts` changes from `kata setup --batteries --cwd=...` to `kata setup --yes --cwd=...`. Behavior is identical since `--yes` now includes all content.
- **Verify:** Run a single eval scenario (e.g., `npm run eval -- --scenario=task-mode`). Confirm fixture project has mode templates in `.kata/templates/`.
- **Source:** `eval/harness.ts:192`

#### UI Layer

N/A

#### API Layer

N/A

#### Data Layer

N/A

---

### B7: CLI Help Text Updated

**Core:**
- **ID:** help-text-updated
- **Trigger:** User runs `kata help` or `kata setup` (no flags)
- **Expected:** All references to `--batteries` are removed from help text. The setup section in `kata help` shows only `kata setup --yes` and `kata setup --yes --strict`. The `kata setup` no-flag help shows the simplified usage.
- **Verify:** Run `kata help`, confirm no mention of `--batteries`. Run `kata setup`, confirm help text shows only `--yes` and `--strict` flags.
- **Source:** `src/index.ts:258-289` (showHelp Setup section), `src/commands/setup.ts:492-509` (no-flag help)

#### UI Layer

Updated help text for `kata help`:
```
Setup:
  kata setup --yes                Quick setup (config, hooks, templates, skills)
  kata setup --yes --strict       Setup with PreToolUse gate hooks
  kata enter onboard              Guided setup interview (interactive)
  kata update                     Update templates + stamp kata_version
```

Updated help text for `kata setup` (no flags):
```
Usage:
  kata setup --yes                Quick setup with auto-detected defaults
  kata setup --yes --strict       Setup + strict PreToolUse task enforcement hooks

Flags:
  --yes         Write config, register hooks, scaffold templates and skills
  --strict      Also register PreToolUse hooks for task enforcement
  --cwd=PATH    Run setup in a different directory
```

#### API Layer

N/A

#### Data Layer

N/A

---

## Non-Goals

- Renaming the `batteries/` source directory in the package (it is the seed directory, fine as-is)
- Restructuring the `batteries/` directory layout or changing which files it contains
- Changing what content gets scaffolded (same files, just always included)
- Removing `scaffold-batteries.ts` as a module (it stays as an internal helper, just always called)
- Making `kata update` handle non-template batteries content (prompts, skills, etc.) -- that is a separate enhancement

## Open Questions

- None -- requirements are straightforward.

## Implementation Phases

See YAML frontmatter `phases:` above. Each phase should be 1-4 hours of focused work.

## Verification Strategy

### Test Infrastructure

Existing test infrastructure: `bun:test` for unit/integration tests in `src/commands/setup.test.ts`. Tests use temp directories with `--cwd` override.

### Build Verification

`npm run build && npm test` -- standard build + test cycle.

## Verification Plan

### VP1: Unified Setup Produces Full Content

Steps:
1. `mkdir /tmp/vp1-test && kata setup --yes --cwd=/tmp/vp1-test`
   Expected: Exit 0. Output says "kata setup complete" with template counts.
2. `ls /tmp/vp1-test/.kata/templates/*.md | wc -l`
   Expected: 7 or more mode templates.
3. `ls /tmp/vp1-test/planning/spec-templates/*.md | wc -l`
   Expected: 3 spec templates.
4. `ls /tmp/vp1-test/.github/ISSUE_TEMPLATE/ | wc -l`
   Expected: At least 1 issue template.

### VP2: Deprecated Flag Still Works

Steps:
1. `mkdir /tmp/vp2-test && kata setup --batteries --cwd=/tmp/vp2-test 2>&1`
   Expected: Stderr contains "deprecated". Stdout shows normal setup output. Exit 0.
2. `ls /tmp/vp2-test/.kata/templates/*.md | wc -l`
   Expected: Same count as VP1 (full content scaffolded).

### VP3: Update Diffs Content When Versions Match

Steps:
1. `mkdir /tmp/vp3-test && kata setup --yes --cwd=/tmp/vp3-test`
2. `kata update --cwd=/tmp/vp3-test`
   Expected: Does NOT print "Already up to date". Prints per-file status or "All templates up to date".

## Implementation Hints

### Key Imports

| Module | Import | Used For |
|--------|--------|----------|
| `./scaffold-batteries.js` | `{ scaffoldBatteries }` | Copy batteries content to project |
| `../session/lookup.js` | `{ getPackageRoot, findProjectDir, getProjectTemplatesDir }` | Path resolution |

### Gotchas

- `applySetup()` already copies some content that `scaffoldBatteries()` also copies (interviews, steps.yaml, skills). Both use skip-if-exists logic, so calling both is safe but results in duplicate work. Consider removing the overlapping copies from `applySetup()` in P1 to keep a single code path.
- The `--batteries` flag sets `yes = true` implicitly (line 69 of setup.ts). When removing the flag's behavior, make sure the deprecated path still implies `--yes`.
- `scaffold-batteries.ts` has its own `kata.yaml` copy logic (lines 113-130) which can conflict with `applySetup()`'s kata.yaml generation. Since `applySetup()` runs first and `scaffoldBatteries` skips existing files by default, this is safe -- but verify during implementation.

### Reference Docs

- `src/commands/scaffold-batteries.ts` -- the full scaffolding logic that will be called unconditionally
- `src/commands/update.ts` -- the update command with the version-match bug
- `eval/harness.ts:188-199` -- eval fixture setup that references `--batteries`
