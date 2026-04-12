---
initiative: setup-skill
type: project
issue_type: feature
status: approved
priority: medium
github_issue: 51
created: 2026-04-12
updated: 2026-04-12
depends_on: [49]
phases:
  - id: p1
    name: "Create /kata-setup skill"
    tasks:
      - "Write batteries/skills/kata-setup/SKILL.md with 3 scenario branches (kata repo, fresh project, reconfigure)"
      - "Copy skill to .claude/skills/kata-setup/SKILL.md (kata repo's own install)"
    test_cases:
      - id: "skill-file-exists"
        description: "batteries/skills/kata-setup/SKILL.md exists with valid frontmatter (description field)"
        type: "smoke"
      - id: "skill-in-project"
        description: ".claude/skills/kata-setup/SKILL.md exists in the kata-wm repo itself"
        type: "smoke"
  - id: p2
    name: "Remove onboard mode"
    tasks:
      - "Delete templates/onboard.md (502-line system template)"
      - "Remove onboard mode config from batteries/kata.yaml (lines ~189-201)"
      - "Remove onboard.md seeding from src/commands/setup.ts (lines 351-360)"
      - "Remove 'kata enter onboard' from help text in src/index.ts:285 and src/commands/setup.ts:2,383,438"
      - "Remove onboard comment in src/commands/scaffold-batteries.ts:208"
    test_cases:
      - id: "onboard-mode-gone"
        description: "kata enter onboard fails with unknown mode error"
        type: "integration"
      - id: "no-onboard-template"
        description: "templates/onboard.md does not exist in the package"
        type: "smoke"
  - id: p3
    name: "Update references, tests, and eval"
    tasks:
      - "Update README.md to remove onboard references (lines 75, 121, 281, 562, 576) and document /kata-setup"
      - "Update CLAUDE.md onboard references (lines 78, 120, 137, 156)"
      - "Update src/commands/setup.test.ts — remove/update onboard template test (lines 247-253)"
      - "Update src/readme.test.ts — remove onboard from hardcoded modes array (line 75)"
      - "Update eval suite: remove eval/scenarios/onboard.ts, its import in eval/run.ts (lines 27, 55)"
      - "Update eval/assertions.ts — remove onboard.md template check (line 404-405) and onboardPresets (line 1398)"
      - "Update eval/assertions.test.ts — remove onboardPresets tests (lines 443-446)"
      - "Verify npm run build && npm test passes"
    test_cases:
      - id: "no-stale-onboard-refs"
        description: "grep -rn 'onboard' src/ eval/ returns no functional matches (only changelog/comments about removal)"
        type: "smoke"
      - id: "build-passes"
        description: "bun test passes"
        type: "integration"
  - id: p4
    name: "Switch to source-based execution via Bun"
    tasks:
      - "Update kata shell script: remove dist/index.js primary path, always use bun src/index.ts"
      - "Update package.json scripts: replace 'npm run build' with bun-native commands, 'test' → 'bun test', remove 'build'/'dev'/'prepublishOnly'"
      - "Remove tsup.config.ts and tsup from devDependencies"
      - "Remove dist/ from .gitignore if listed, add to .gitignore if not already"
      - "Remove exports/main/files/publishConfig/engines fields from package.json (no longer an npm package)"
      - "Delete .github/workflows/publish.yml"
      - "Update .github/workflows/ci.yml to use bun instead of node build+test"
      - "Update CLAUDE.md build/test commands to reflect bun-based workflow"
      - "Delete dist/ directory if present"
      - "Verify bun test passes from source"
    test_cases:
      - id: "bun-test-passes"
        description: "bun test exits 0 from source (no build step)"
        type: "integration"
      - id: "kata-runs-from-source"
        description: "kata help runs successfully without dist/ existing"
        type: "smoke"
      - id: "no-build-artifacts"
        description: "dist/ directory does not exist, tsup.config.ts does not exist"
        type: "smoke"
---

# Setup Skill Replacing Onboard Mode

> GitHub Issue: [#51](https://github.com/codevibesmatter/kata/issues/51)

## Overview

Replace the heavyweight onboard mode (7 phases, 502-line template, stop conditions, native tasks) with a simple `/kata-setup` Claude Code skill. The skill is a SKILL.md file with instructions for Claude — no modes, no tasks, no hooks needed. The flow becomes: clone → open Claude Code → `/kata-setup`. Also remove the npm build/publish pipeline in favor of source-based execution via Bun — the `kata` script already has a Bun fallback, so this just makes it the primary path. Depends on #49 (simplify setup) being merged first so `kata setup --yes` scaffolds all content.

## Feature Behaviors

### B1: Skill Detects Kata Source Repo

**Core:**
- **ID:** detect-kata-repo
- **Trigger:** User invokes `/kata-setup` in a directory that has `src/index.ts` and no `.kata/kata.yaml` (the kata-wm source repo)
- **Expected:** Skill instructs Claude to check if `kata` is in PATH (`which kata`). If not, suggest symlinking: `ln -s $(pwd)/kata ~/.local/bin/kata`. Verify with `kata --version`. Tell user kata is ready and to open Claude Code in any project and run `/kata-setup`.
- **Verify:** Open Claude Code in a fresh clone of kata-wm. Run `/kata-setup`. Claude should detect it's the source repo and offer to symlink the binary.

#### UI Layer

Claude's natural language response — no structured UI.

#### API Layer

N/A

#### Data Layer

N/A — no files created in this scenario.

---

### B2: Skill Sets Up Fresh Project

**Core:**
- **ID:** fresh-project-setup
- **Trigger:** User invokes `/kata-setup` in a project directory where `.kata/kata.yaml` does NOT exist
- **Expected:** Skill instructs Claude to: (1) check `kata` is in PATH — if not, tell user to install first, (2) run `kata setup --yes`, (3) check `gh auth status` — if authenticated, offer to create GitHub labels via `gh label create` using `.github/wm-labels.json`, (4) run `kata doctor`, (5) print summary: ready, suggest entering a mode.
- **Verify:** Create empty project dir. Run `/kata-setup`. Confirm `.kata/kata.yaml`, `.claude/settings.json`, `.kata/templates/`, `.claude/skills/` all exist after completion.

#### UI Layer

Claude walks through each step with output. Final summary shows what was created.

#### API Layer

N/A

#### Data Layer

Files created by `kata setup --yes`: `.kata/kata.yaml`, `.claude/settings.json`, `.kata/templates/`, `.claude/skills/`, `planning/spec-templates/`, etc.

---

### B3: Skill Reconfigures Existing Project

**Core:**
- **ID:** reconfigure-project
- **Trigger:** User invokes `/kata-setup` in a project where `.kata/kata.yaml` already exists
- **Expected:** Skill instructs Claude to: (1) read and display current kata.yaml config summary, (2) ask user what they want to change (e.g., test command, strict hooks, review settings, paths), (3) apply changes to kata.yaml, (4) run `kata doctor` to verify.
- **Verify:** Run `/kata-setup` in a project with existing `.kata/kata.yaml`. Claude shows current config and asks what to change.

#### UI Layer

Claude displays current config, asks targeted questions, applies changes.

#### API Layer

N/A

#### Data Layer

Modified `.kata/kata.yaml` fields only.

---

### B4: Onboard Mode Removed

**Core:**
- **ID:** onboard-mode-removed
- **Trigger:** User runs `kata enter onboard`
- **Expected:** Command fails with unknown mode error. The onboard template, mode config, and all onboard-specific code paths are deleted.
- **Verify:** Run `kata enter onboard` — should error. Grep source for "onboard" — only test expectations for the error case remain.
- **Source:** `batteries/kata.yaml` (mode config), `templates/onboard.md` (template), `src/commands/setup.ts` (seeding logic)

#### UI Layer

Error message: mode "onboard" not found (standard unknown-mode error).

#### API Layer

N/A

#### Data Layer

Deleted files: `templates/onboard.md`. Removed config: `onboard` key from `batteries/kata.yaml`.

---

### B5: Help Text Updated

**Core:**
- **ID:** help-text-updated
- **Trigger:** User runs `kata help` or `kata setup` (no flags)
- **Expected:** All references to `kata enter onboard` replaced with `/kata-setup` skill reference. Setup section no longer lists onboard as a guided alternative.
- **Verify:** Run `kata help`, confirm no mention of "onboard". Setup section mentions `/kata-setup` for guided setup.
- **Source:** `src/index.ts:285` (help text), `src/commands/setup.ts:2,383,438` (comments and help)

#### UI Layer

Updated help text for `kata help` Setup section:
```
Setup:
  kata setup --yes                Quick setup (config, hooks, templates, skills)
  kata setup --yes --strict       Setup with PreToolUse gate hooks
  /kata-setup                     Guided setup (interactive, in Claude Code)
  kata update                     Update templates + stamp kata_version
```

#### API Layer

N/A

#### Data Layer

N/A

---

### B6: Skill Scaffolded to Projects via Batteries

**Core:**
- **ID:** skill-in-batteries
- **Trigger:** `kata setup --yes` runs in any project (after #49 merges batteries into setup)
- **Expected:** The `/kata-setup` skill is included in `batteries/skills/kata-setup/SKILL.md` and gets copied to `.claude/skills/kata-setup/SKILL.md` during setup, making it available in all kata-configured projects.
- **Verify:** Run `kata setup --yes --cwd=/tmp/test-project`. Check `.claude/skills/kata-setup/SKILL.md` exists.

#### UI Layer

N/A — implicit via existing batteries scaffold mechanism.

#### API Layer

N/A

#### Data Layer

New file in batteries: `batteries/skills/kata-setup/SKILL.md`.

---

### B7: Source-Based Execution via Bun

**Core:**
- **ID:** source-based-execution
- **Trigger:** User runs `kata` (any command) after cloning and symlinking
- **Expected:** The `kata` shell script runs `bun src/index.ts` directly — no build step required. The `dist/` directory, `tsup.config.ts`, and npm publish workflow are removed. Tests run via `bun test` from source.
- **Verify:** Delete `dist/` if present. Run `kata help` — works without build. Run `bun test` — passes from source.
- **Source:** `kata` (shell script), `package.json` (scripts), `tsup.config.ts` (deleted)

#### UI Layer

N/A — transparent to users. Same CLI behavior, just no build step.

#### API Layer

N/A — no longer published as an npm package.

#### Data Layer

Deleted: `dist/`, `tsup.config.ts`, `.github/workflows/publish.yml`. Modified: `package.json` (removed build/publish config), `kata` (simplified script), `.github/workflows/ci.yml` (bun-based).

---

## Non-Goals

- Custom configuration interview (users edit kata.yaml directly for custom settings)
- Self-propagation logic beyond what batteries scaffold already provides
- Soft deprecation period for onboard mode — hard remove
- Changes to `kata setup --yes` behavior (that's #49)
- Changes to `kata doctor` behavior
- Rewriting TypeScript source to remove Node.js compatibility — Bun is compatible with existing code

## Open Questions

- None — requirements are straightforward.

## Implementation Phases

See YAML frontmatter `phases:` above. Each phase should be 1-2 hours of focused work.

## Verification Strategy

### Test Infrastructure

Existing: tests in `src/commands/` with `.test.ts` suffixes. After this change, tests run via `bun test` from source (no build step). The skill itself is a markdown file requiring no unit tests — verification is structural (file exists, frontmatter valid) and behavioral (onboard mode gone).

### Build Verification

`bun test` (no build step — runs from source)

## Verification Plan

### VP1: Skill File Structure

Steps:
1. `cat batteries/skills/kata-setup/SKILL.md | head -5`
   Expected: Valid YAML frontmatter with `description:` field.
2. `cat .claude/skills/kata-setup/SKILL.md | head -5`
   Expected: Same content as batteries version.
3. `grep -c "kata repo\|fresh project\|reconfigure\|kata.yaml" batteries/skills/kata-setup/SKILL.md`
   Expected: At least 3 matches (covers all 3 scenarios).

### VP2: Onboard Mode Removed

Steps:
1. `kata enter onboard 2>&1`
   Expected: Non-zero exit. Error message about unknown mode.
2. `test -f templates/onboard.md && echo EXISTS || echo GONE`
   Expected: GONE
3. `grep -r "onboard" batteries/kata.yaml`
   Expected: No matches.

### VP3: Help Text Clean

Steps:
1. `kata help 2>&1 | grep -i onboard`
   Expected: No matches.
2. `kata help 2>&1 | grep -i kata-setup`
   Expected: At least 1 match showing the skill reference.

### VP4: Batteries Scaffold Includes Skill

Steps:
1. `mkdir -p /tmp/vp4-test && kata setup --yes --cwd=/tmp/vp4-test`
   Expected: Exit 0.
2. `test -f /tmp/vp4-test/.claude/skills/kata-setup/SKILL.md && echo EXISTS || echo MISSING`
   Expected: EXISTS

### VP5: Source-Based Execution Works

Steps:
1. `rm -rf dist/`
   Expected: No dist directory.
2. `kata help`
   Expected: Exit 0. Help text printed (runs from source via bun).
3. `test -f tsup.config.ts && echo EXISTS || echo GONE`
   Expected: GONE
4. `test -f .github/workflows/publish.yml && echo EXISTS || echo GONE`
   Expected: GONE

### VP6: Tests Pass from Source

Steps:
1. `bun test`
   Expected: Exit 0. All tests pass from source (no build step).

## Implementation Hints

### Key Files to Modify

| File | Change |
|------|--------|
| `batteries/skills/kata-setup/SKILL.md` | **New** — the skill definition |
| `.claude/skills/kata-setup/SKILL.md` | **New** — copy for kata-wm repo itself |
| `templates/onboard.md` | **Delete** — 502-line template |
| `batteries/kata.yaml` | Remove `onboard:` mode config (~13 lines) |
| `src/commands/setup.ts` | Remove onboard.md seeding (lines 351-360), update comments/help |
| `src/commands/scaffold-batteries.ts` | Remove onboard comment (line 208) |
| `src/index.ts` | Update help text (line 285) |
| `src/commands/setup.test.ts` | Remove onboard template test (lines 247-253) |
| `src/readme.test.ts` | Remove onboard from modes array (line 75) |
| `eval/scenarios/onboard.ts` | **Delete** — onboard eval scenario |
| `eval/run.ts` | Remove onboard scenario import and registration (lines 27, 55) |
| `eval/assertions.ts` | Remove onboard template check and onboardPresets (lines 404-405, 1398) |
| `eval/assertions.test.ts` | Remove onboardPresets tests (lines 443-446) |
| `README.md` | Replace onboard references with /kata-setup |
| `CLAUDE.md` | Update onboard references (lines 78, 120, 137, 156) + build/test commands |
| `kata` | Simplify: remove dist path, always use `bun src/index.ts` |
| `package.json` | Remove build/publish config, scripts → bun-based, drop tsup |
| `tsup.config.ts` | **Delete** — no longer building |
| `.github/workflows/publish.yml` | **Delete** — no longer publishing to npm |
| `.github/workflows/ci.yml` | Switch from node build+test to bun test |

### Gotchas

- The `UserPromptSubmit` hook in `src/commands/suggest.ts` detects mode intent via `intent_keywords`. Removing onboard from `batteries/kata.yaml` automatically removes its keywords ("onboard", "setup kata", "configure kata", "initialize kata") from detection. However, the hook context injected at session start may still suggest onboard — check `src/commands/hook.ts` for any hardcoded onboard references.
- `scaffold-batteries.ts` copies `batteries/skills/` subdirectories automatically — no code change needed for the new skill to propagate. Just placing the file in `batteries/skills/kata-setup/SKILL.md` is sufficient.
- The `templates/` directory (at repo root) holds **system** templates only — `onboard.md` and `SESSION-TEMPLATE.template.md`. After removing `onboard.md`, only the session template remains. This is fine.
- Some eval scenarios or fixtures may reference onboard mode — search `eval/` directory.

### Reference Docs

- Research doc: `planning/research/2026-04-12-setup-skill-replacing-onboard-mode.md`
- Spec #49 (dependency): `planning/specs/49-simplify-setup.md`
