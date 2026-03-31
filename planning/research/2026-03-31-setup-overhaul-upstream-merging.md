---
date: 2026-03-31
topic: Setup overhaul — project customization and upstream template merging
status: complete
github_issue: null
---

# Research: Setup Overhaul — Project Customization & Upstream Merging

## Context

The current `kata setup --batteries` and `kata batteries --update` system has two fundamental problems:
1. **Setup produces generic config** — every project gets identical `kata.yaml` and template files with no project-specific customization
2. **Update clobbers customizations** — `--update` overwrites all files (with backup), destroying local template modifications

This research explores design options for a system where setup is project-aware and upstream improvements merge cleanly with local customizations.

## Questions Explored

1. How does the current setup/batteries flow work, and where do customizations get lost?
2. How do other CLI tools handle upstream config + local overrides?
3. What merge strategies exist for YAML/markdown templates with frontmatter?
4. Should templates use inheritance/layering vs. full copies with diff tracking?

## Findings

### Codebase

**Current flow** (`src/commands/setup.ts`, `src/commands/scaffold-batteries.ts`):

- `kata setup --yes` → `applySetup()`: auto-detects project name/test command via `getDefaultProfile()`, writes `kata.yaml`, seeds `onboard.md`, registers hooks in `.claude/settings.json`
- `kata setup --batteries` → also calls `scaffoldBatteries()`: flat-copies from `batteries/` into project directories
- `scaffoldBatteries()` copies ~10 categories: templates, agents, prompts, providers, spec-templates, github templates, interviews.yaml, subphase-patterns.yaml, verification-tools.md, kata.yaml
- Default behavior: **skip existing files**. With `--update`: **overwrite all, backup old copies** to timestamped `batteries-backup/` dir
- `kata.yaml` (`batteries/kata.yaml`): copied verbatim with `project.name: ""`, commented-out build/test commands, full modes section duplicating all defaults
- Templates are monolithic markdown files (5-33KB) with YAML frontmatter defining phases, steps, instructions — **no separation between upstream structure and project customizations**
- `buildKataConfig()` in `setup.ts` does merge existing `kata.yaml` values over profile defaults, but this only helps on re-running setup, not on batteries update

**Key pain points** (file:line references):
- `scaffold-batteries.ts:31-62` — `copyDirectory()` is binary: skip or overwrite, no merge
- `scaffold-batteries.ts:117-135` — `kata.yaml` copy has same skip/overwrite binary
- `setup.ts:261-314` — `buildKataConfig()` tries to preserve existing config on re-setup, but `batteries --update` bypasses this entirely
- `kata-config.ts:71-103` — `KataConfigSchema` has no concept of "inherited from package defaults" vs "explicitly set by project"

### External Patterns

**ESLint Flat Config** (composition model):
- Shared configs are JS arrays; user spreads them into their config and adds overrides after
- Merge is explicit: later entries override earlier ones
- Recent `extends` keyword makes this even simpler
- Takeaway: **explicit composition with override-by-position is intuitive**

**Kustomize** (base + overlay model):
- Base resources are read-only; overlays contain patches
- Strategic merge: existing fields untouched unless patch addresses them, new fields added, explicit fields overwrite
- Directory structure: `base/` + `overlays/staging/`, `overlays/production/`
- Takeaway: **clean separation of upstream (base) and local (overlay), upstream updates never conflict**

**Create React App** (eject vs. override):
- Eject: full config copied into project, no more upstream updates — **this is what kata currently does**
- CRACO/react-app-rewired: intercept build pipeline, apply transforms to config without owning it
- Takeaway: **ejection is simple but creates a dead-end for upstream improvements**

**Yeoman** (generator update):
- `update-yeoman-generator`: applies upstream changes as git-style merge, requires manual conflict resolution
- Standard Yeoman: re-running generator shows conflict prompts per file
- Takeaway: **three-way merge works but is complex and creates user-facing conflicts**

**Codex CLI** (config layering):
- Loads config from multiple `.codex/` folders in directory hierarchy
- Higher-precedence locations override lower-precedence ones
- Takeaway: **simple layering with deep merge, project only needs to specify overrides**

**Docker Compose** (multi-file merge):
- Multiple compose files merged in order, later overrides earlier, non-conflicting combined
- Takeaway: **ordered file merge is well-understood and predictable**

## Recommendations

### Option A: Base + Overlay (Kustomize-inspired) — RECOMMENDED

Split templates into upstream base (read-only, package-managed) + project overlay (user-owned patches).

**How it works:**
- Package `batteries/templates/task.md` is the canonical base — never copied to project
- Project creates `.kata/overlays/task.yaml` with targeted patches:
  ```yaml
  # .kata/overlays/task.yaml
  phases:
    p0:
      steps:
        context-search:
          instruction: |
            # Custom: also check our internal docs API
            ... (replaces just this step's instruction)
    p3:  # Add a new phase
      name: "Deploy Preview"
      steps:
        - id: deploy
          title: "Deploy to preview env"
          instruction: "..."
  remove_phases: [p2]  # Remove upstream phase p2 entirely
  ```
- At runtime, `kata enter task` loads base template + overlay, merges them
- `kata batteries --update` only updates base reference (package version bump), overlays untouched
- `kata.yaml` modes section becomes **optional overrides only** — defaults come from package

**Pros:**
- Clean separation: upstream base is never modified by user, overlay is never modified by upstream
- Updates are always safe — no conflicts, no merge needed
- Overlays are small — only what changed, easy to review
- Familiar pattern (Kustomize, Docker Compose)

**Cons:**
- Need to build a merge engine for template frontmatter (phases/steps)
- Need to define patch semantics (add/remove/replace phases and steps)
- Two-file model is less immediately obvious than editing a single template
- Migration from current full-copy model requires work

### Option B: Three-Way Merge with Version Tracking

Track which package version each template was seeded from; compute diffs on update.

**How it works:**
- Templates have `source_version: 1.2.3` in frontmatter
- `kata batteries --update` stores old base alongside, computes three-way diff (old base → new base → local file)
- Clean merges applied automatically; conflicts reported for manual resolution

**Pros:**
- Users edit templates directly in familiar `.kata/templates/task.md`
- Upstream improvements merge in automatically when no conflict
- Single-file mental model

**Cons:**
- Complex three-way merge for structured YAML frontmatter + markdown body
- Need to store base copies for diffing (`.kata/.base-templates/`)
- Conflicts are hard for users to resolve in mixed YAML/markdown files
- Fragile when upstream makes large structural changes (phase reordering, renames)

### Option C: Config Layering (Codex-inspired)

Multiple YAML files merged in precedence order.

**How it works:**
- Package provides `batteries/kata.yaml` with all default mode definitions
- Project `.kata/kata.yaml` only contains overrides (project settings, mode tweaks)
- Deep merge at load time: project values win, missing keys inherit from package

**Pros:**
- Simplest to implement
- `kata.yaml` becomes much smaller — only what's project-specific
- Familiar pattern, easy to reason about

**Cons:**
- Only works for YAML config (modes, settings), doesn't help with template `.md` content
- Deep merge semantics can surprise (arrays: replace or append?)
- Need to document which fields are "inherited" vs "overridden"

### Option D: Hybrid (A + C) — BEST OVERALL

Combine Option C for `kata.yaml` with Option A for templates.

**Config layering (kata.yaml):**
- Package provides default modes, project only overrides what it needs
- `kata.yaml` shrinks from 164 lines to ~20 (just project settings + any mode tweaks)
- Adding a new upstream mode = automatic, no project action needed

**Template overlay (templates):**
- Base templates live in package, loaded at runtime
- Project overlays in `.kata/overlays/` patch specific phases/steps
- `kata batteries --update` becomes near-trivial (just update package version)

**Setup customization:**
- `kata setup --batteries` runs an interview (or uses `--yes` with auto-detection) to populate project-specific fields in `kata.yaml`
- Template overlays are optional — most projects start with no overlays
- `kata customize <mode>` command to generate an overlay skeleton for a specific mode

**Migration:**
- `kata migrate` command detects full-copy templates, diffs against current package base, generates overlays for the differences
- Projects with no customizations: just delete `.kata/templates/`, modes from `kata.yaml`

| Criterion | A (Overlay) | B (3-way) | C (Layering) | D (Hybrid) |
|-----------|:-----------:|:---------:|:------------:|:----------:|
| Setup customization | Medium | Low | High | High |
| Upstream merge safety | High | Medium | High | High |
| Implementation complexity | Medium | High | Low | Medium |
| User mental model | Medium | High | High | Medium-High |
| Template customization | High | High | Low | High |
| Migration effort | Medium | Low | Low | Medium |

## Open Questions

1. **Overlay syntax for template phases** — Should overlays be YAML-only (patching frontmatter) or support markdown body patches too? Recommendation: YAML-only for phases/steps, with an `instruction_file` field that points to a local `.md` file for custom instructions.
2. **Remove vs. disable** — Should overlays support removing upstream phases, or only disabling them (skip but keep in schema)? Recommendation: support both via `remove_phases: [id]` and `phases.p2.skip: true`.
3. **Inherently project-specific templates** — `onboard.md` is unique per project. These should be marked as `local_only: true` in the mode definition and always live in `.kata/templates/`, not the overlay system.
4. **Array merge semantics in kata.yaml** — For fields like `stop_conditions`, `intent_keywords`: should project values replace or append? Recommendation: replace by default, with `+stop_conditions` syntax to append.
5. **Migration path** — Need a `kata migrate` command. Priority: high, since existing projects have full-copy templates.

## Next Steps

1. **Write a spec** for the hybrid approach (Option D) — planning mode with issue
2. **Prototype the config layering** first (Option C part) — lowest risk, highest immediate value
3. **Design overlay schema** — define YAML structure for template patches
4. **Build migration tool** — `kata migrate` to convert existing projects
