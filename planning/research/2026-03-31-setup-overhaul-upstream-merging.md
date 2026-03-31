---
date: 2026-03-31
topic: Setup overhaul — project customization, upstream merging, and configuration surface
status: complete
github_issue: null
---

# Research: Setup Overhaul — Project Customization & Upstream Merging

## Context

The current `kata setup --batteries` and `kata batteries --update` system has two fundamental problems:
1. **Setup produces generic config** — every project gets identical `kata.yaml` and template files with no project-specific customization
2. **Update clobbers customizations** — `--update` overwrites all files (with backup), destroying local template modifications

A third problem emerged during research:
3. **Configuration surface is too wide** — batteries scatter 10+ file categories across the project, each with different merge/override behaviors

This research explores design options for a system where setup is project-aware, upstream improvements merge cleanly, and the config surface is narrowed.

## Questions Explored

1. How does the current setup/batteries flow work, and where do customizations get lost?
2. What are the distinct categories of batteries content, and what customization patterns does each need?
3. How do other CLI tools handle upstream config + local overrides?
4. How can the configuration surface be narrowed while preserving flexibility?
5. Should templates use inheritance/layering vs. full copies with diff tracking?

## Findings

### Current Batteries Inventory: Three Categories

Batteries content falls into three distinct categories, each with different customization needs:

#### Category 1: Config (YAML — structured, machine-parsed)

| File | Purpose | Current merge | Customization frequency |
|------|---------|--------------|----------------------|
| `kata.yaml` | Project settings + mode definitions | Copy, no merge on update | Every project (project settings) |
| `interviews.yaml` | Planning interview questions | **Already 2-tier merge** | Rare |
| `subphase-patterns.yaml` | Container phase expansion | **Already 2-tier merge** | Rare |
| `verification-tools.md` | VP tool config (fill-in-the-blank) | Copy, skip existing | Every project |

**Key finding:** `interviews.ts` and `subphase-patterns.ts` already implement the ideal pattern — 2-tier merge (package base + project overlay, project wins per-key). But `kata.yaml` doesn't, and it's the most important config file.

#### Category 2: Mode Templates (Markdown with YAML frontmatter — workflow structure)

| File | Size | Purpose | Customization frequency |
|------|------|---------|----------------------|
| `planning.md` | 33KB | Feature planning phases | Rarely customized |
| `implementation.md` | 9KB | Spec execution phases | Rarely customized |
| `task.md` | 5.9KB | Small task phases | Rarely customized |
| `research.md` | 9.9KB | Research phases | Rarely customized |
| `debug.md` | 10KB | Debug phases | Rarely customized |
| `verify.md` | 18KB | Verification phases | Rarely customized |
| `freeform.md` | 2.3KB | No-structure mode | Almost never |
| `onboard.md` | 18KB | Setup interview (project-specific) | **Always** customized |
| `eval.md` | 3.2KB | Eval mode (project-only) | Project-only |

**Key finding:** Diffing this project's `.kata/templates/` against `batteries/templates/` shows the project copies are **nearly identical** — the only differences are stale `wm` → `kata` renames and minor upstream improvements that weren't merged back. Real-world customization is near-zero.

Templates are **already resolved via 2-tier lookup** (`resolveTemplatePath()` in `src/session/lookup.ts:309-344`): project tier → package batteries tier. If the project doesn't have a copy, the package version is used automatically.

This means: **most projects don't need template copies at all.** The batteries step of copying templates is creating unnecessary files that then drift from upstream.

#### Category 3: Doc Templates (Markdown — content scaffolds for output)

| File(s) | Purpose | Customization frequency |
|---------|---------|----------------------|
| `agents/*.md` (3 files) | Agent definitions (impl, review, test) | Moderate (project adds custom agents) |
| `prompts/*.md` (5 files) | Review prompts (code-review, spec-review, etc.) | Rare |
| `spec-templates/*.md` (3 files) | Spec document scaffolds (feature, bug, epic) | Moderate |
| `.github/ISSUE_TEMPLATE/` | GitHub issue templates | Rarely after setup |
| `.github/wm-labels.json` | Label definitions | Rarely after setup |

**Key finding:** These are "eject and own" files — they're scaffolds that projects customize as content, not config. The current copy-and-skip behavior is actually appropriate for this category. They don't need upstream merging because the project's customized versions are the correct ones.

### Existing 2-Tier Merge (Already Working)

Two config files already implement the ideal pattern:

**`src/config/interviews.ts:49-56`:**
```typescript
function mergeInterviewConfig(base, overlay) {
  return {
    interview_categories: {
      ...base.interview_categories,   // package defaults
      ...overlay.interview_categories, // project overrides
    },
  }
}
```

**`src/config/subphase-patterns.ts:41-51`:**
```typescript
function mergeSubphasePatternConfig(base, overlay) {
  return {
    subphase_patterns: {
      ...base.subphase_patterns,   // package defaults
      ...overlay.subphase_patterns, // project overrides
    },
  }
}
```

Both use: package `batteries/` as base, project `.kata/` as overlay, shallow merge per top-level key. This is the right pattern — it just needs to be applied consistently.

### Template Resolution (Already Working)

**`src/session/lookup.ts:309-344`** — `resolveTemplatePath()`:
1. Check `.kata/templates/{name}` (project override)
2. Check `batteries/templates/{name}` (package fallback)

**This already means templates don't need to be copied during setup.** If the project has no `.kata/templates/task.md`, `kata enter task` falls through to the package version automatically.

### External Patterns (Summary)

| Pattern | Used By | Applicability |
|---------|---------|--------------|
| **Config layering** (deep merge, higher precedence wins) | Codex CLI, Docker Compose, ESLint flat config | **Config category** — perfect fit |
| **Base + overlay** (base read-only, overlay patches) | Kustomize | **Mode templates** — overkill given 2-tier lookup already exists |
| **Eject and own** (copy once, project maintains) | CRA, Yeoman | **Doc templates** — already the right approach |
| **Three-way merge** (track base version, diff on update) | Git, Yeoman updater | Complex, fragile — avoid |

### The Real Problem: kata.yaml

The biggest gap is `kata.yaml`. Today every project gets a 164-line copy of the full mode definitions, which means:
- New upstream modes don't appear unless the user manually adds them
- Mode improvements (new stop_conditions, intent_keywords) are lost
- Project `kata.yaml` is 90% upstream defaults and 10% project settings

**What projects actually need in kata.yaml:**
```yaml
project:
  name: "my-app"
  test_command: "npm test"
  build_command: "npm run build"

reviews:
  code_review: true
  code_reviewers: ["gemini"]

# Only mode OVERRIDES — rest inherited from package
modes:
  task:
    stop_conditions: [tasks_complete, committed, pushed]  # add pushed
```

vs what they get today: full duplication of all 8 mode definitions.

## Narrowed Configuration Surface

### Proposal: Categorize and simplify

**Stop copying things that don't need to be copied:**

| Category | Current behavior | Proposed behavior |
|----------|-----------------|-------------------|
| `kata.yaml` | Full copy (164 lines) | **2-tier merge** — project only stores overrides |
| `interviews.yaml` | Full copy → project | **Already 2-tier merge** — stop copying, project creates only if customizing |
| `subphase-patterns.yaml` | Full copy → project | **Already 2-tier merge** — stop copying, project creates only if customizing |
| `verification-tools.md` | Copy → project | **Keep** — project-specific fill-in-the-blank |
| Mode templates (7 files) | Full copy → `.kata/templates/` | **Stop copying** — 2-tier lookup already works, project creates only if customizing |
| `onboard.md` | Copy → `.kata/templates/` | **Keep** — project-specific by nature |
| Agents (3 files) | Copy → `.claude/agents/` | **Keep** — eject-and-own |
| Prompts (5 files) | Copy → `.kata/prompts/` | **Keep** — eject-and-own |
| Spec templates (3 files) | Copy → `planning/spec-templates/` | **Keep** — eject-and-own |
| GitHub templates | Copy → `.github/` | **Keep** — eject-and-own |

**Result:** `kata setup --batteries` goes from copying ~25 files to copying ~14. Mode templates, interviews.yaml, and subphase-patterns.yaml stop being copied entirely. Projects start leaner and get upstream improvements automatically.

### What `kata.yaml` becomes

```yaml
# Project-specific settings (the only required section)
project:
  name: "my-app"
  test_command: "npm test"
  build_command: "npm run build"

spec_path: planning/specs       # defaults work for most projects
research_path: planning/research

# Optional: mode overrides (merged over package defaults)
# modes:
#   task:
#     stop_conditions: [tasks_complete, committed, pushed]
```

**No modes section needed** unless the project wants to override something. All 8 default modes come from the package `batteries/kata.yaml` at load time.

## Recommendations

### Option A: Minimal Changes (Config Layering Only) — RECOMMENDED FIRST STEP

Apply the existing 2-tier merge pattern to `kata.yaml`. No template overlay system needed because template 2-tier lookup already exists.

**Changes:**
1. `loadKataConfig()` loads package `batteries/kata.yaml` as base, project `kata.yaml` as overlay
2. Shallow merge for `modes:` section (per-mode override), deep merge for `project:`, `reviews:`
3. `kata setup --batteries` writes a minimal `kata.yaml` (project settings only, no modes section)
4. `kata setup --batteries` stops copying mode templates, interviews.yaml, subphase-patterns.yaml
5. `kata batteries --update` only updates doc templates (agents, prompts, spec-templates, github)

**Pros:**
- Follows existing pattern (interviews.ts, subphase-patterns.ts already work this way)
- Template 2-tier lookup already works — no changes needed
- Dramatically narrows config surface
- Upstream mode improvements appear automatically
- Simple to implement (maybe 50 lines of merge logic in kata-config.ts)

**Cons:**
- Per-mode merge is shallow (override entire mode, not individual fields within a mode)
- No way to add a phase to an upstream template without full copy
- Projects that DO want to customize a template still eject the whole file

### Option B: Deep Mode Merge + Template Overlay

Extends Option A with field-level mode merging and template phase patching.

**Changes (on top of A):**
1. Deep merge within individual modes (e.g., override just `stop_conditions` without restating the whole mode)
2. `.kata/overlays/task.yaml` patches individual phases/steps in templates
3. `kata customize <mode>` scaffolds an overlay file

**Pros:**
- Fine-grained control without ejecting
- Upstream phase improvements merge cleanly even when project has overlays

**Cons:**
- Significant implementation: template merge engine, overlay schema, merge semantics
- Complexity may not be justified given how rarely templates are customized
- New concept for users to learn

### Option C: Full Eject Control

Add `kata eject <mode>` that copies a template to `.kata/templates/` for full editing, and `kata uneject <mode>` to delete the local copy and fall back to package.

**Changes (on top of A):**
1. `kata eject task` → copies `batteries/templates/task.md` to `.kata/templates/task.md`
2. `kata uneject task` → deletes `.kata/templates/task.md` (falls back to package)
3. `kata diff task` → shows diff between local and upstream

**Pros:**
- Simple mental model: "eject to customize, uneject to get upstream updates"
- No new merge system needed
- Explicit user control

**Cons:**
- Ejected templates still get stale (same problem as today, but opt-in)
- Need `kata diff` to know what upstream changed

### Recommended Path: A → C → B

1. **Phase 1 (Option A):** Config layering for kata.yaml + stop copying mode templates/config that has 2-tier loaders. Biggest bang for lowest effort.
2. **Phase 2 (Option C):** Add explicit eject/uneject/diff commands. Gives users tools to manage template customization.
3. **Phase 3 (Option B):** Only if real demand emerges for fine-grained template patching. Don't build until needed.

## Detailed Design: Option A (Config Layering)

### `loadKataConfig()` changes

```typescript
// Current: load single file, hard error if missing
// Proposed: load package base + project overlay, merge

function loadKataConfig(projectRoot?: string): KataConfig {
  const root = projectRoot ?? findProjectDir()

  // 1. Load package base (batteries/kata.yaml)
  const packagePath = join(getPackageRoot(), 'batteries', 'kata.yaml')
  const base = parseAndValidate(packagePath)

  // 2. Load project overlay (.kata/kata.yaml) — optional
  const projectPath = getKataConfigPath(root)
  if (!existsSync(projectPath)) {
    return base  // Package defaults only — totally fine
  }
  const overlay = parseAndValidate(projectPath)

  // 3. Merge: project wins for scalar fields, per-key for maps
  return mergeKataConfig(base, overlay)
}

function mergeKataConfig(base: KataConfig, overlay: Partial<KataConfig>): KataConfig {
  return {
    ...base,
    ...overlay,
    project: { ...base.project, ...overlay.project },
    reviews: { ...base.reviews, ...overlay.reviews },
    providers: { ...base.providers, ...overlay.providers },
    modes: {
      ...base.modes,
      ...overlay.modes,  // Per-mode override (shallow: override entire mode definition)
    },
    // Arrays: project replaces entirely if present
    global_rules: overlay.global_rules ?? base.global_rules,
    task_rules: overlay.task_rules ?? base.task_rules,
    stop_conditions: overlay.stop_conditions ?? base.stop_conditions,
  }
}
```

### `scaffoldBatteries()` changes

Stop copying:
- `batteries/templates/*.md` → `.kata/templates/` (2-tier lookup handles this)
- `batteries/interviews.yaml` → `.kata/interviews.yaml` (2-tier merge handles this)
- `batteries/subphase-patterns.yaml` → `.kata/subphase-patterns.yaml` (2-tier merge handles this)
- `batteries/kata.yaml` → `.kata/kata.yaml` (2-tier merge handles this)

Keep copying (eject-and-own):
- `batteries/agents/` → `.claude/agents/`
- `batteries/prompts/` → `.kata/prompts/`
- `batteries/spec-templates/` → `planning/spec-templates/`
- `batteries/github/` → `.github/`
- `batteries/verification-tools.md` → `.kata/verification-tools.md`

### `kata setup --batteries` output

New minimal `kata.yaml`:
```yaml
# kata.yaml — project configuration
# Mode definitions inherited from package. Override specific modes below.

project:
  name: "my-app"           # auto-detected
  test_command: "npm test"  # auto-detected
  build_command: null

spec_path: planning/specs
research_path: planning/research

# Uncomment to override specific modes:
# modes:
#   task:
#     stop_conditions: [tasks_complete, committed, pushed]
```

### Migration

For existing projects with full-copy kata.yaml and templates:

```bash
kata migrate  # future command
```

1. Diff `.kata/kata.yaml` modes against `batteries/kata.yaml` modes
2. If identical: remove modes section from project kata.yaml
3. If different: keep only the differing fields
4. For each `.kata/templates/*.md`: diff against `batteries/templates/*.md`
5. If identical: delete project copy (falls through to package)
6. If different: keep (ejected template), warn user

## Open Questions

1. **Shallow vs. deep mode merge** — Option A uses shallow (override entire mode definition). Is this sufficient? If a project only wants to add one stop_condition, they'd need to restate the whole mode. Recommendation: start shallow, add deep merge if pain emerges.

2. **Array merge semantics** — For `stop_conditions`, `intent_keywords`: project replaces entirely. An append syntax (`+stop_conditions: [pushed]`) could be useful but adds complexity. Recommendation: defer.

3. **`verification-tools.md`** — This is a fill-in-the-blank file. Should it become a structured YAML with 2-tier merge instead of freeform markdown? Recommendation: yes, in a future iteration.

4. **`kata.yaml` missing = OK?** — Should projects work with zero config (pure package defaults)? Recommendation: yes, `loadKataConfig()` returns package defaults if no project file exists.

5. **Prompts 2-tier lookup** — Currently prompts are copied to project. Could use same 2-tier lookup pattern. Recommendation: defer — prompts are loaded by the review system which may have its own resolution.

## Next Steps

1. **Phase 1 spec:** Config layering for kata.yaml + narrow batteries scope
2. **Phase 2 spec:** Eject/uneject/diff commands (if needed after Phase 1)
3. **Phase 3:** Template overlay system (only if real demand)
