---
initiative: setup-close-skills-migration
type: project
issue_type: feature
status: approved
priority: medium
github_issue: 57
created: 2026-04-14
updated: 2026-04-14
phases:
  - id: p1
    name: "Create setup and close skills, remove ceremony.md"
    tasks:
      - "Create batteries/skills/mode-setup/SKILL.md with universal setup protocol (env-check, branch, claim) plus mode-conditional sections, absorbing ceremony.md content"
      - "Create batteries/skills/mode-close/SKILL.md with universal close protocol (tests, commit, push) plus mode-conditional sections for all 6 modes, absorbing ceremony.md content"
      - "Delete batteries/ceremony.md"
      - "Remove ceremony.md copy from scaffold-batteries.ts"
      - "Remove ceremony.md existence validation from enter.ts"
      - "Add breaking change note to CHANGELOG or commit message: ceremony.md removed, migrate customizations to skill overrides"
    test_cases:
      - id: "setup-skill-exists"
        description: "batteries/skills/mode-setup/SKILL.md exists and contains env-check, branch creation, issue claiming sections, and mode-conditional sections"
        type: "unit"
      - id: "close-skill-exists"
        description: "batteries/skills/mode-close/SKILL.md exists and contains test running, commit/push, and mode-conditional sections for task, impl, debug, research, planning, verify"
        type: "unit"
      - id: "ceremony-deleted"
        description: "batteries/ceremony.md does not exist"
        type: "unit"
      - id: "no-ceremony-copy"
        description: "scaffold-batteries.ts has no reference to ceremony.md"
        type: "unit"
      - id: "no-ceremony-validation"
        description: "enter.ts does not check for ceremony.md existence"
        type: "unit"
  - id: p2
    name: "Migrate templates to skill references"
    tasks:
      - "Update batteries/templates/task.md: replace inline setup steps with skill: mode-setup, replace inline close steps with skill: mode-close"
      - "Update batteries/templates/implementation.md: replace inline setup steps with skill: mode-setup plus mode-specific read-spec and test-baseline steps, replace inline close steps with skill: mode-close"
      - "Update batteries/templates/debug.md: replace inline setup steps with skill: mode-setup, replace inline close steps with skill: mode-close"
      - "Update batteries/templates/research.md: replace inline setup steps with skill: mode-setup (with classify step preserved), replace inline close steps with skill: mode-close"
      - "Update batteries/templates/verify.md: replace inline setup steps with skill: mode-setup (with verify-specific read-verification-tools and start-dev-server), replace inline close steps with skill: mode-close"
      - "Update batteries/templates/planning.md: add skill: mode-setup on setup phase (research is a work phase, not setup), add skill: mode-close on close phase"
    test_cases:
      - id: "task-template-uses-skills"
        description: "batteries/templates/task.md setup phase has skill: mode-setup, close phase has skill: mode-close, no inline instruction blocks for env-check or commit-push"
        type: "unit"
      - id: "impl-template-uses-skills"
        description: "batteries/templates/implementation.md setup phase has skill: mode-setup, close phase has skill: mode-close"
        type: "unit"
      - id: "debug-template-uses-skills"
        description: "batteries/templates/debug.md setup phase has skill: mode-setup, close phase has skill: mode-close"
        type: "unit"
      - id: "research-template-uses-skills"
        description: "batteries/templates/research.md setup phase has skill: mode-setup, close phase has skill: mode-close"
        type: "unit"
      - id: "verify-template-uses-skills"
        description: "batteries/templates/verify.md setup phase has skill: mode-setup, close phase has skill: mode-close"
        type: "unit"
      - id: "templates-parse-valid"
        description: "All 6 templates pass templateYamlSchema validation after migration"
        type: "unit"
  - id: p3
    name: "Remove step library and clean up"
    tasks:
      - "Remove $ref field from phaseStepSchema in src/validation/schemas.ts"
      - "Remove stepDefinitionSchema, stepLibrarySchema, and their type exports from src/validation/schemas.ts"
      - "Remove src/commands/enter/step-library.ts and src/commands/enter/step-library.test.ts"
      - "Remove loadStepLibrary() import and usage from src/commands/enter/task-factory.ts (primary call site) and any other importers (grep for 'step-library' across src/)"
      - "Remove resolveStepRef() usage from task creation pipeline"
      - "Remove the $ref refine check from phaseStepSchema (title required when $ref not set)"
    test_cases:
      - id: "no-ref-in-schema"
        description: "phaseStepSchema does not accept $ref field — parsing a step with $ref fails validation"
        type: "unit"
      - id: "no-step-library-module"
        description: "src/commands/enter/step-library.ts does not exist"
        type: "unit"
      - id: "existing-tests-pass"
        description: "bun test src/ passes with zero failures after all removals"
        type: "integration"
  - id: p4
    name: "Integration tests and verification"
    tasks:
      - "Add test: kata enter task produces tasks where setup task references /mode-setup skill and close task references /mode-close skill"
      - "Add test: kata enter implementation produces tasks where setup task references /mode-setup skill and close task references /mode-close skill"
      - "Add test: ceremony.md is not created by kata setup"
      - "Verify all existing tests pass (bun test src/)"
      - "Manual verification: kata enter task in a test project produces correct task instructions"
    test_cases:
      - id: "e2e-task-setup-skill"
        description: "kata enter task creates setup task with instruction containing 'Invoke /mode-setup'"
        type: "integration"
      - id: "e2e-task-close-skill"
        description: "kata enter task creates close task with instruction containing 'Invoke /mode-close'"
        type: "integration"
      - id: "e2e-impl-setup-skill"
        description: "kata enter implementation creates setup task with instruction containing 'Invoke /mode-setup'"
        type: "integration"
      - id: "e2e-all-tests-pass"
        description: "bun test src/ passes with zero failures"
        type: "integration"
---

# Setup/Close Phase Migration to Skills

## Overview

Setup and close phases across all 6 kata templates contain duplicated inline instructions that reference ceremony.md via static text but never programmatically load it. This creates maintenance burden (changes must be replicated across templates) and makes ceremony.md a dead reference. This spec migrates setup/close to dedicated skills that absorb ceremony.md content directly, making templates pure wiring. Projects customize setup/close behavior by overriding the skills themselves via `.claude/skills/kata-mode-setup/` or `.claude/skills/kata-mode-close/`. ceremony.md is deleted.

## Feature Behaviors

### B1: Setup Skill

**Core:**
- **ID:** setup-skill
- **Trigger:** Agent enters any mode that has a setup-stage phase with `skill: mode-setup` in the template
- **Expected:** The setup skill contains all universal setup instructions directly (absorbed from ceremony.md). It instructs Claude to: (1) run `kata status` to discover the current mode, issue number, and workflow ID, (2) run environment verification (git status, build command from `.kata/kata.yaml`), (3) create or verify branch if applicable, (4) claim GitHub issue if applicable. The skill contains mode-conditional sections — e.g., "If in implementation mode, also read the spec and save test baseline." Mode-specific steps that carry unique logic (e.g., `read-spec` gate in implementation, `classify` in research) remain as separate steps in the template alongside the skill reference. The skill follows the same SKILL.md format conventions as existing skills (e.g., `code-impl/SKILL.md`) — imperative instructions, numbered steps, conditional blocks.
- **Verify:** Create a test project, run `kata enter task`, confirm the setup task instruction contains "Invoke /mode-setup" and that the skill document contains sections for env-check, branch, and issue claiming.
**Source:** new file: `batteries/skills/mode-setup/SKILL.md`

#### Data Layer
No schema changes. The skill is a markdown file discovered by Claude Code's native skill resolution (`~/.claude/skills/kata-mode-setup/SKILL.md` user-scoped, `.claude/skills/kata-mode-setup/SKILL.md` project override). Projects customize setup behavior by overriding this skill.

### B2: Close Skill

**Core:**
- **ID:** close-skill
- **Trigger:** Agent enters any mode that has a close-stage phase with `skill: mode-close` in the template
- **Expected:** The close skill contains all universal close instructions directly (absorbed from ceremony.md). It instructs Claude to: (1) run `kata status` to discover the current mode, (2) run tests/build checks, (3) commit and push changes, (4) execute mode-conditional close actions. The skill reads mode via `kata status` (deterministic, single command). Mode-conditional sections:
  - **task:** Universal steps only (tests, commit, push). No PR, no issue update.
  - **implementation:** Universal steps + create PR with summary + update GitHub issue.
  - **debug:** Universal steps + update GitHub issue with root-cause summary.
  - **research:** Universal steps only (commit, push). No tests required, no PR.
  - **planning:** Universal steps + run `kata validate-spec` + update spec frontmatter status to approved + push.
  - **verify:** Universal steps + write evidence JSON + challenge incomplete items + update GitHub issue.
  The skill follows the same SKILL.md format conventions as existing skills (e.g., `code-impl/SKILL.md`).
- **Verify:** Create a test project, run `kata enter implementation`, confirm the close task instruction contains "Invoke /mode-close" and that the skill document has conditional sections for all 6 modes.
**Source:** new file: `batteries/skills/mode-close/SKILL.md`

#### Data Layer
No schema changes. Same resolution as B1. Projects customize close behavior by overriding this skill.

### B3: Ceremony.md Removed

**Core:**
- **ID:** ceremony-removed
- **Trigger:** Migration complete — ceremony.md content absorbed into setup/close skills
- **Expected:** `batteries/ceremony.md` is deleted. All ceremony content (env verification, branch creation, issue claiming, tests, commit/push, PR creation, issue updates) is absorbed into the setup and close SKILL.md files. `scaffold-batteries.ts` no longer copies ceremony.md to `.kata/ceremony.md`. `enter.ts` no longer validates ceremony.md existence. The `kata update` command no longer overwrites `.kata/ceremony.md`. Projects that previously customized `.kata/ceremony.md` must migrate their customizations to skill overrides (`.claude/skills/kata-mode-setup/SKILL.md` or `.claude/skills/kata-mode-close/SKILL.md`).
- **Verify:** Confirm `batteries/ceremony.md` does not exist. Confirm `scaffold-batteries.ts` has no reference to `ceremony.md`. Confirm `enter.ts` does not validate ceremony.md existence. Run `kata setup --yes` in a test project and confirm no `.kata/ceremony.md` is created.
**Source:** `batteries/ceremony.md` (delete), `src/commands/scaffold-batteries.ts` (remove copy logic at lines 199-216 — this covers both `kata setup` and `kata update` since update.ts delegates to scaffoldBatteries()), `src/commands/enter.ts` (remove validation at lines 420-430)

### B4: Templates Use Skill References

**Core:**
- **ID:** templates-use-skills
- **Trigger:** `kata enter <mode>` parses template YAML frontmatter
- **Expected:** All templates with setup/close phases use `skill: mode-setup` or `skill: mode-close` at the phase level instead of inline `instruction` fields on steps. Steps that were purely ceremony references (env-check, github-claim, commit-push, run-tests, update-issue) are removed from the steps array. Mode-specific steps that carry unique logic remain as explicit steps alongside the skill (e.g., `read-spec` with its gate in implementation setup, `classify` in research setup, `write-evidence` and `challenge-incomplete` in verify close). The task.md template's setup phase becomes `skill: mode-setup` with no steps; its close phase becomes `skill: mode-close` with the build gate preserved as a phase-level or step-level gate.
- **Verify:** Parse each template with `parseTemplateYaml()`, confirm no step has an `instruction` field containing "ceremony.md" or duplicated env-check/commit-push prose. Confirm setup phases have `skill: mode-setup` and close phases have `skill: mode-close`.

**Affected templates:**
- `batteries/templates/task.md` — setup: remove 2 inline steps, add `skill: mode-setup`. Close: remove 2 inline steps, add `skill: mode-close`, keep gate.
- `batteries/templates/implementation.md` — setup: remove 4 inline steps, add `skill: mode-setup`, keep `read-spec` step with gate. Close: remove 4 inline steps, add `skill: mode-close`, keep gate.
- `batteries/templates/debug.md` — setup: remove 2 inline steps, add `skill: mode-setup`. Close: remove 3 inline steps, add `skill: mode-close`, keep gate.
- `batteries/templates/research.md` — setup: remove 1 inline step (env-check), add `skill: mode-setup`, keep `classify` step. Close: remove 1 inline step, add `skill: mode-close`.
- `batteries/templates/verify.md` — setup: keep `read-verification-tools` and `start-dev-server` steps, add `skill: mode-setup`. Close: remove `commit-push` and `update-issue` steps, add `skill: mode-close`, keep `write-evidence` and `challenge-incomplete` steps.
- `batteries/templates/planning.md` — setup: add `skill: mode-setup` (planning's research is a work phase, not setup — planning still needs env-check via setup skill). Close: add `skill: mode-close` for validate-spec + commit + push.
- `batteries/templates/freeform.md` — no changes (no phases).

### B5: Step Library Removal

**Core:**
- **ID:** step-library-removal
- **Trigger:** Code compilation and test execution after migration
- **Expected:** The `$ref` step resolution system is fully removed: (1) `src/commands/enter/step-library.ts` deleted, (2) `$ref` field removed from `phaseStepSchema` in `src/validation/schemas.ts`, (3) `stepDefinitionSchema` and `stepLibrarySchema` removed from schemas, (4) the `.refine()` on `phaseStepSchema` that allows missing `title` when `$ref` is set is simplified to always require `title`, (5) all imports of `loadStepLibrary` and `resolveStepRef` removed from the codebase. No template currently uses `$ref` (they use inline instructions), so this is a clean removal with no migration needed for template content.
- **Verify:** Confirm `src/commands/enter/step-library.ts` does not exist. Confirm `phaseStepSchema` rejects objects with a `$ref` field. Run `bun test src/` and confirm all tests pass.
**Source:** `src/commands/enter/step-library.ts` (delete), `src/validation/schemas.ts` (lines 105-118, 200-217)

### B6: User-Scoped Skill Installation Updated

**Core:**
- **ID:** user-skills-updated
- **Trigger:** `kata setup --yes` or `kata update` runs `installUserSkills()`
- **Expected:** `installUserSkills()` in `src/commands/scaffold-batteries.ts` already iterates `batteries/skills/` dynamically via `readdirSync()` (line 346). No code changes needed — simply creating the `batteries/skills/mode-setup/` and `batteries/skills/mode-close/` directories in P1 is sufficient. After running `kata setup` or `kata update`, `~/.claude/skills/kata-mode-setup/SKILL.md` and `~/.claude/skills/kata-mode-close/SKILL.md` will exist alongside the existing skills (kata-code-impl, kata-code-review, etc.).
- **Verify:** Run `installUserSkills()` with a temp homeDir, confirm `kata-mode-setup` and `kata-mode-close` skill directories are created.
**Source:** `src/commands/scaffold-batteries.ts` (installUserSkills function)

## Non-Goals

- Mode-specific close skills (e.g., separate `close-impl`, `close-verify`, `close-planning` skills) — the single close skill handles mode-conditional behavior via sections, not separate skill files
- Keeping ceremony.md as a separate file — ceremony content is absorbed into skills, not restructured
- Ceremony.md as structured config (YAML format) — not needed since ceremony is absorbed into skills
- Changes to freeform.md template — freeform has no phases
- Changes to how placeholders are resolved — setup/close skills self-discover config via `kata status` and reading kata.yaml directly
- Gate enforcement changes — gates remain in template YAML, not in skills. Skills contain advisory instructions; hooks enforce gates.
- Global condition changes — `global_conditions` stay in template YAML, enforced by stop hooks
- Cleaning up orphaned `.kata/ceremony.md` in existing projects — the file becomes inert after migration; `kata update` will not recreate it, but existing copies are left in place. Users can delete them manually.

## Implementation Phases

See frontmatter `phases` for task breakdown. Summary:

**P1 (Create setup and close skills, remove ceremony.md):** Write the two new SKILL.md files (absorbing ceremony.md content), delete ceremony.md, remove ceremony references from scaffold-batteries.ts and enter.ts.

**P2 (Migrate templates):** Update all 6 template files to reference the new skills instead of inline instructions. This is the template authoring phase — changes are in YAML frontmatter only.

**P3 (Remove step library and clean up):** Delete step-library.ts, remove $ref from schemas, update installUserSkills to include new skills. This is the code cleanup phase.

**P4 (Integration tests and verification):** Add tests confirming the end-to-end flow works, verify all existing tests pass.

## Verification Plan

### VP1: Setup skill file exists and has correct content

```bash
test -f batteries/skills/mode-setup/SKILL.md && echo "PASS: setup skill exists"
grep -q "kata status" batteries/skills/mode-setup/SKILL.md && echo "PASS: uses kata status for mode discovery"
grep -q "git status" batteries/skills/mode-setup/SKILL.md && echo "PASS: has env-check"
grep -q "branch" batteries/skills/mode-setup/SKILL.md && echo "PASS: has branch section"
grep -q "GitHub" batteries/skills/mode-setup/SKILL.md && echo "PASS: has issue claiming section"
grep -q "implementation" batteries/skills/mode-setup/SKILL.md && echo "PASS: has mode-conditional sections"
```

Expected: All 6 checks print PASS.

### VP2: Close skill file exists and has correct content

```bash
test -f batteries/skills/mode-close/SKILL.md && echo "PASS: close skill exists"
grep -q "kata status" batteries/skills/mode-close/SKILL.md && echo "PASS: uses kata status for mode discovery"
grep -q "commit" batteries/skills/mode-close/SKILL.md && echo "PASS: has commit section"
grep -q "implementation" batteries/skills/mode-close/SKILL.md && echo "PASS: has impl-conditional section"
grep -q "verify" batteries/skills/mode-close/SKILL.md && echo "PASS: has verify-conditional section"
grep -q "planning" batteries/skills/mode-close/SKILL.md && echo "PASS: has planning-conditional section"
grep -q "debug" batteries/skills/mode-close/SKILL.md && echo "PASS: has debug-conditional section"
```

Expected: All 7 checks print PASS.

### VP3: Ceremony.md deleted and references removed

```bash
test ! -f batteries/ceremony.md && echo "PASS: ceremony.md deleted from batteries"
! grep -rq "ceremony" src/commands/scaffold-batteries.ts && echo "PASS: no ceremony ref in scaffold-batteries"
! grep -rq "ceremony" src/commands/enter.ts && echo "PASS: no ceremony ref in enter.ts"
```

Expected: All 3 checks print PASS.

### VP4: Templates have no inline ceremony references or duplicated setup/close prose

```bash
for t in task implementation debug research verify; do
  if grep -iq "ceremony\|Follow.*ceremony\|Read.*ceremony" batteries/templates/$t.md 2>/dev/null; then
    echo "FAIL: $t.md still has ceremony references"
  else
    echo "PASS: $t.md has no ceremony references"
  fi
done
```

Expected: All 5 print PASS.

### VP5: Templates have skill: mode-setup on setup-stage phases and skill: mode-close on close-stage phases

```bash
for t in task implementation debug research verify planning; do
  echo "--- $t ---"
  # Use bun to parse YAML frontmatter and check skill assignments per stage
  bun -e "
    const fs = require('fs');
    const yaml = require('js-yaml');
    const content = fs.readFileSync('batteries/templates/$t.md', 'utf8');
    const fm = content.split('---')[1];
    const parsed = yaml.load(fm);
    const phases = parsed.phases || [];
    const setup = phases.find(p => p.stage === 'setup');
    const close = phases.find(p => p.stage === 'close');
    console.log(setup?.skill === 'mode-setup' ? 'PASS: setup skill' : 'FAIL: setup skill = ' + setup?.skill);
    console.log(close?.skill === 'mode-close' ? 'PASS: close skill' : 'FAIL: close skill = ' + close?.skill);
  "
done
```

Expected: All 6 templates (including planning) show PASS for both setup and close skills. Freeform is excluded (no phases).

### VP6: Step library removed

```bash
test ! -f src/commands/enter/step-library.ts && echo "PASS: step-library.ts deleted" || echo "FAIL: step-library.ts still exists"
test ! -f src/commands/enter/step-library.test.ts && echo "PASS: step-library.test.ts deleted" || echo "FAIL: step-library.test.ts still exists"
grep -q '\\$ref' src/validation/schemas.ts && echo "FAIL: schemas still has \$ref" || echo "PASS: \$ref removed from schemas"
grep -q 'stepLibrarySchema' src/validation/schemas.ts && echo "FAIL: stepLibrarySchema still exists" || echo "PASS: stepLibrarySchema removed"
```

Expected: All 4 checks print PASS.

### VP7: All tests pass

```bash
bun test src/
```

Expected: All tests pass with zero failures.

### VP8: User skill installation includes setup and close

```bash
# After running kata update or installUserSkills():
test -d ~/.claude/skills/kata-mode-setup && echo "PASS: kata-mode-setup installed" || echo "FAIL: kata-mode-setup not installed"
test -d ~/.claude/skills/kata-mode-close && echo "PASS: kata-mode-close installed" || echo "FAIL: kata-mode-close not installed"
```

Expected: Both checks print PASS.

## Implementation Hints

1. **Key files to modify:**
   - `batteries/skills/mode-setup/SKILL.md` (new — absorbs ceremony.md setup content)
   - `batteries/skills/mode-close/SKILL.md` (new — absorbs ceremony.md close content)
   - `batteries/ceremony.md` (delete)
   - `batteries/templates/*.md` (6 files, update YAML frontmatter)
   - `src/commands/scaffold-batteries.ts` (remove ceremony.md copy, verify installUserSkills coverage)
   - `src/commands/enter.ts` (remove ceremony.md existence validation)
   - `src/validation/schemas.ts` (remove $ref, stepLibrary)
   - `src/commands/enter/step-library.ts` (delete)

2. **Code patterns — existing skill reference in template:**
   ```yaml
   # From planning.md — how phases reference skills today:
   - id: p0
     name: Research
     stage: setup
     expansion: agent
     skill: research
     task_config:
       title: "P0: Setup - research codebase and problem space"
       labels: [phase, setup]
   ```

3. **Code patterns — phase with skill + steps (hybrid):**
   ```yaml
   # From verify.md — skill at phase level, steps for specific actions:
   - id: p0
     name: Setup
     stage: setup
     skill: vp-execution
     task_config:
       title: "P0: Setup - determine VP source, prepare environment"
       labels: [phase, setup]
     steps:
       - id: read-verification-tools
         title: "Read verification tools config"
         instruction: |
           Check for project verification tools:
           cat .kata/verification-tools.md 2>/dev/null
   ```

4. **Code patterns — task-factory skill injection (src/commands/enter/task-factory.ts:162-165):**
   ```typescript
   if (phaseSkill) {
     const skillSection = `## Skill\nInvoke /${phaseSkill} before starting this task.\n`
     instruction = skillSection + '\n' + (instruction ?? '')
   }
   ```
   This means when a phase has `skill: mode-setup`, the generated task instruction automatically gets "Invoke /mode-setup" prepended. No manual instruction text needed in the template.

5. **Gotchas:**
   - The `$ref` refine on `phaseStepSchema` (line 115-118 of schemas.ts) must be updated when removing `$ref` — change from `s['$ref'] || (s.title && s.title.length > 0)` to just requiring `title` via the schema directly.
   - `loadStepLibrary()` may be called in `template.ts` or `task-factory.ts` — search for all imports before deleting.
   - The skill names `mode-setup` and `mode-close` are chosen to avoid collision with the existing `kata-setup` skill (which configures kata in a project). `mode-setup` installs to `~/.claude/skills/kata-mode-setup/`, cleanly separate from `~/.claude/skills/kata-kata-setup/`.
   - Gates in close phases (e.g., `gate: { bash: "{build_command}", expect_exit: 0 }`) must remain in the template YAML — they are enforced by hooks, not by skills. The skill contains advisory "run tests" instructions; the gate provides enforcement.
   - `ceremony.md` validation at `kata enter` time (src/commands/enter.ts:420-430) must be removed since ceremony.md no longer exists.
   - `scaffold-batteries.ts` ceremony.md copy logic must be removed (no more `.kata/ceremony.md` in projects).
   - Projects that customized `.kata/ceremony.md` must migrate to skill overrides. Document this as a breaking change in release notes.

6. **Reference docs:**
   - `batteries/skills/code-impl/SKILL.md` — example of a well-structured skill document
   - `src/commands/enter/task-factory.ts:buildPhaseTasks()` — how phase-level skills become task instructions
   - `src/validation/schemas.ts` — all schema definitions that need cleanup
   - `src/commands/enter/template.ts:validateWorkPhaseSkills()` — validates work phases have skills (setup/close phases are exempt)
