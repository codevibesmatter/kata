---
date: 2026-04-14
topic: Setup/Close Phases Migration to Skills with Dynamic Project Loading
type: feature
status: complete
github_issue: null
items_researched: 5
---

# Research: Setup/Close Phases Migration to Skills

## Context

Setup and close phases currently contain inline instructions in each template, with some referencing `ceremony.md` sections via static text like `"Follow ceremony.md § Environment Verification"`. This creates several problems:

1. **ceremony.md is a dead reference** — copied to `.kata/ceremony.md` by setup, validated for existence at enter time, but never read programmatically. The agent may or may not look it up.
2. **Duplicated instructions** — setup/close steps are copy-pasted across 6 templates with slight variations.
3. **No dynamic project loading** — when a project customizes ceremony.md (custom commit patterns, CI checks), there's no guarantee the agent follows it.
4. **Step library is deprecated** — the `$ref` mechanism for referencing shared step definitions is no longer viable.

Goal: migrate setup/close to skills that load project-level specifics dynamically.

## Scope

| Item | Fields | Sources |
|------|--------|---------|
| ceremony.md loading | creation, referencing, injection, project data | scaffold-batteries.ts, enter.ts, templates |
| Setup phase patterns | steps, universality, gates, project data needs | All 6 templates |
| Close phase patterns | steps, universality, gates, global_conditions | All 6 templates |
| Skill resolution | resolution order, installation, config access | lookup.ts, scaffold-batteries.ts |
| Placeholder resolution | all placeholders, timing, skill access | placeholder.ts, task-factory.ts |

## Findings

### 1. ceremony.md Loading Mechanism

**Current lifecycle:**

| Phase | Location | Action |
|-------|----------|--------|
| Creation | `scaffold-batteries.ts:199-216` | Copy from batteries/ to .kata/ |
| Update | `update.ts:37` | Overwrite with backup |
| Validation | `enter.ts:421-430` | Check existence only (fail if missing) |
| Reference | `task.md` only | Static text: "Follow ceremony.md § X" |
| Injection | None | NOT read or injected programmatically |

**Key finding:** ceremony.md is a 110-line markdown file with sections for env verification, spec reading, GitHub claiming, branch creation, committing/pushing, PR creation, issue updates, test running, and dev server. It contains no templating — placeholders like `{test_command}` are written as comments ("Use the project's test_command from kata.yaml"), not resolved.

Only `task.md` references ceremony.md (4 references in setup+close). All other templates inline their instructions directly.

### 2. Setup Phase Patterns

**Universal steps (appear in 4+ templates):**

| Step | Templates | What it does |
|------|-----------|--------------|
| `env-check` | task, impl, research, debug | git status, build command, document branch |
| `github-claim` | task, impl, debug | Issue label update + status comment |

**Mode-specific steps:**

| Template | Unique Setup | Purpose |
|----------|-------------|---------|
| Implementation | `read-spec` + `test-baseline save` + `create-branch` | Spec gate, regression detection, branch |
| Planning | Agent-expanded research + interview | Driven by skills, not steps |
| Research | `classify` (research type) | Direction before diving |
| Verify | `read-verification-tools` + `start-dev-server` | Infrastructure readiness |
| Debug | Standard env + claim only | Minimal |

**Gates in setup:** Only implementation has an explicit gate (`test -f {spec_path}`).

**Project data needed by setup:** `build_command`, `spec_path`, `issue_number`, `branch_name`, `dev_server_command`.

### 3. Close Phase Patterns

**Universal steps (all templates):**

| Step | Templates | What it does |
|------|-----------|--------------|
| `commit-push` | All 6 | git add/commit/push |

**Common steps (4+ templates):**

| Step | Templates | What it does |
|------|-----------|--------------|
| `run-tests` / `final-checks` | task, impl, debug, (verify via VP) | Build/test gate before commit |
| `update-issue` | impl, debug, verify | gh issue comment with results |

**Mode-specific close steps:**

| Template | Unique Close Steps | Purpose |
|----------|-------------------|---------|
| Implementation | `create-pr` | gh pr create with summary |
| Planning | `kata validate-spec` + frontmatter update | Spec approval workflow |
| Verify | `write-evidence` + `challenge-incomplete` | JSON evidence + review loop |
| Research | Minimal (commit only) | No gates |

**Gates in close:** task (`{build_command}`), implementation (`{build_command}`), debug (`{test_command}`).

**Global conditions:**

| Template | Conditions |
|----------|-----------|
| task | `changes_committed` |
| All others | `changes_committed`, `changes_pushed` |

### 4. Skill Resolution Mechanics

**Resolution order:** Project (`.claude/skills/`) > User (`~/.claude/skills/kata-{name}/`) > Batteries (`batteries/skills/`).

**Installation:** `kata setup` copies batteries skills to `~/.claude/skills/kata-{name}/`. `kata update` refreshes them. Project-level overrides are never touched.

**Config access:** Skills do NOT call `resolvePlaceholders()`. They receive already-resolved task instructions. A skill CAN instruct Claude to read `.kata/kata.yaml` or `.kata/ceremony.md` directly — this is just text telling Claude what to do.

**Key insight:** Skills are markdown documents, not code. They can't programmatically load config. But they can instruct Claude to read files, which Claude does reliably when told explicitly.

### 5. Placeholder Resolution

**Resolution timing:** Enter-time only (during task creation in `buildPhaseTasks()`).

**Three-tier priority:** Session state > kata.yaml config > extra vars.

**Available placeholders from config:** `test_command`, `test_command_changed`, `build_command`, `typecheck_command`, `smoke_command`, `spec_path_dir`, `research_path`, `project_name`, `diff_base`.

**Skills and placeholders:** Placeholders are resolved before skills see them. Skills get the final instruction text with actual values. If a skill needs dynamic config, it must instruct Claude to read the config file itself.

## Design Options

### Option A: Pure Skills

Create `setup` and `close` skills. Each SKILL.md contains the universal protocol and instructs Claude to read `.kata/kata.yaml` and `.kata/ceremony.md` for project specifics.

Templates become:
```yaml
- id: p0
  stage: setup
  skill: setup
  task_config:
    title: "P0: Setup"
```

The skill handles all logic — env check, branch, claim, etc. Project customization via ceremony.md is loaded because the skill explicitly says "Read .kata/ceremony.md".

**Pros:**
- Simplest migration — just create 2 skills
- ceremony.md becomes actually used (skill says "read it")
- Templates get much simpler
- Project override works via `.claude/skills/setup/SKILL.md`

**Cons:**
- Skill is one big document — harder to customize individual steps
- All-or-nothing: can't skip env-check but keep github-claim
- "Read ceremony.md" is still advisory (Claude usually follows explicit read instructions though)

### Option B: Step $refs (DEPRECATED — not viable)

Step library is deprecated. Skipped.

### Option C: Hybrid — Skills with Dynamic Ceremony Loading

Create `setup` and `close` skills. The skill's SKILL.md contains universal logic. Templates keep step-level structure but reference the skill. The skill reads ceremony.md dynamically for project-specific overrides.

Template structure preserved:
```yaml
- id: p0
  stage: setup
  skill: setup
  steps:
    - id: env-check
      title: "Verify environment"
    - id: github-claim
      title: "Claim GitHub issue"
```

The skill knows the universal protocol for each step ID. ceremony.md sections map to step IDs. If ceremony.md has a `## Environment Verification` section with custom commands, the skill uses those instead of defaults.

**Pros:**
- ceremony.md becomes a dynamic override mechanism
- Step structure preserved in templates (visible, auditable)
- Skill handles execution logic, ceremony provides project customization
- Incremental migration — templates can mix skill-driven and inline steps

**Cons:**
- More complex than Option A — skill must parse ceremony sections
- ceremony.md section names must match step expectations
- Dual source of truth (skill + ceremony) could confuse

### Option D: Ceremony as Config

Move ceremony content into kata.yaml as structured config:
```yaml
ceremony:
  env_check:
    commands: ["git status", "{build_command}"]
  commit:
    commands: ["git add .", "git commit", "git push"]
```

Skills read config programmatically at runtime via placeholder resolution.

**Pros:**
- Machine-readable, validatable
- Placeholder resolution works naturally
- Can be schema-validated at enter time

**Cons:**
- Loses markdown readability
- Major config schema change
- Ceremony becomes YAML, not human-editable prose
- Massive migration effort

## Recommendation

**Option A (Pure Skills)** — with one structural addition.

Rationale:
- Simplest path. Two new skills replace all inline setup/close instructions across 6 templates.
- ceremony.md becomes dynamically loaded because the skill explicitly instructs "Read `.kata/ceremony.md` and follow relevant sections."
- Project customization works naturally: edit ceremony.md for project-specific workflows, or override the entire skill via `.claude/skills/setup/SKILL.md`.
- Step-level granularity is preserved within the skill document itself (the skill has sections for env-check, branch, claim, etc.) — just not in the template YAML.

**The structural addition:** Mode-specific close behaviors (PR creation, evidence writing, spec validation) should be handled via **conditional sections** in the close skill that check the current mode. The skill reads session state to determine mode, then executes the appropriate close variant.

Alternatively, modes with unique close needs (verify, planning) keep their own close skills that override the generic one.

### Migration Path

1. Create `batteries/skills/setup/SKILL.md` with universal setup protocol
2. Create `batteries/skills/close/SKILL.md` with universal close protocol + mode-conditional sections
3. Update all 6 templates: replace inline setup/close steps with `skill: setup` / `skill: close`
4. Update ceremony.md to have clear section markers that the skill references
5. Test that `kata enter <mode>` produces correct task instructions
6. Verify project-level ceremony overrides work

### Open Questions

1. **Should mode-specific close be separate skills?** E.g., `close-impl`, `close-verify`, `close-planning` — or one skill with conditionals?
2. **How does the skill know which ceremony sections apply?** By step ID convention? By explicit mapping in the skill?
3. **Should ceremony.md be restructured?** Current sections are prose-oriented. Skills might need more structured sections.
4. **What about gates?** Gates are currently in template YAML (enforced by hooks). If setup/close moves to skills, gates stay in templates or move to skill hints?

## Next Steps

1. Create spec for the migration (planning mode, issue)
2. Prototype the setup skill and test with task mode (simplest template)
3. Decide on mode-specific close strategy
4. Migrate remaining templates
