---
date: 2026-03-31
topic: Setup overhaul — tighter config surface, more flexible customization, upstream merging
status: complete
github_issue: null
---

# Research: Setup Overhaul — Tighter Surface, More Flexible Customization

## Context

The current `kata setup --batteries` and `kata batteries --update` system has three problems:
1. **Configuration surface is too wide** — batteries scatter 10+ file categories across the project (templates, agents, prompts, interviews, subphase patterns, verification tools, spec templates, github templates, kata.yaml)
2. **Customization is inflexible** — to change one step instruction in a mode, you must copy and own the entire 33KB template file
3. **Upstream updates don't merge** — `--update` overwrites all files, destroying local changes

**Goal:** Tighter configuration surface (fewer files to manage) with MORE flexible per-project customization AND clean upstream merging.

## Questions Explored

1. What does each batteries file actually do at runtime? Which are structural config vs. behavioral instructions?
2. Can the scattered config files be consolidated into fewer, more powerful files?
3. What customization patterns do projects actually need?
4. How should upstream improvements merge with project customizations?

## Findings

### How Templates Work at Runtime

Templates serve a dual purpose in `enter.ts`:

**1. Structural (YAML frontmatter → task creation):**
- `parseAndValidateTemplatePhases()` extracts `phases[]` with ids, dependencies, steps
- `buildPhaseTasks()` creates native tasks from phases + steps
- Each step's `title` and `instruction` become task subject + description
- `container: true` + `subphase_pattern` expands spec phases into subtasks

**2. Behavioral (full content → Claude context injection):**
- `outputFullTemplateContent()` dumps the ENTIRE template (frontmatter + markdown body) to stderr
- Claude reads this as workflow instructions — the markdown body provides "when to use," "when NOT to use," flow diagrams, etc.
- Step `instruction` fields are both: task descriptions (structured) AND Claude guidance (prose)

**This dual nature is why templates are hard to customize** — they mix machine-parsed structure with human-written prose in a single file.

### Current Batteries Inventory (10 categories)

| # | Category | Files | Runtime role | Customization need |
|---|----------|-------|-------------|-------------------|
| 1 | `kata.yaml` | 1 × 164 lines | Mode definitions + project settings | **Every project** (project settings + mode tweaks) |
| 2 | Mode templates | 7 × 2-33KB `.md` | Task creation + Claude instructions | **Rare** — most projects don't customize |
| 3 | `interviews.yaml` | 1 × 109 lines | Planning interview questions | Moderate — project-specific questions |
| 4 | `subphase-patterns.yaml` | 1 × 220 lines | Container phase expansion | Rare |
| 5 | `verification-tools.md` | 1 × 4.2KB | VP tool config (fill-in-blank) | **Every project** — project-specific |
| 6 | Agents | 3 `.md` files | Claude agent definitions | Moderate — custom agents |
| 7 | Prompts | 5 `.md` files | Review prompt templates | Rare |
| 8 | Spec templates | 3 `.md` files | Spec document scaffolds | Moderate |
| 9 | GitHub templates | 2 dirs + labels | Issue templates + labels | Once at setup |
| 10 | Provider examples | 1 `.yaml.example` | Provider config | Rare |

**Key observation:** Categories 2, 3, and 4 already have 2-tier resolution at runtime:
- Templates: `resolveTemplatePath()` checks project → package (`src/session/lookup.ts:309-344`)
- Interviews: `loadInterviewConfig()` merges package base + project overlay (`src/config/interviews.ts:68-103`)
- Subphase patterns: `loadSubphasePatterns()` merges package base + project overlay (`src/config/subphase-patterns.ts:63-98`)

**But `kata.yaml` — the most important config — does NOT have 2-tier merge.** And despite templates having 2-tier lookup, batteries still copies them all into the project.

### What Projects Actually Customize (Evidence)

Diffing this project's `.kata/templates/` against `batteries/templates/`:
- `task.md`: 4 line diff (stale `wm` → `kata` renames)
- `research.md`: 4 line diff (same)
- `implementation.md`: 9 line diff (same)
- `freeform.md`: 10 line diff (same)
- `debug.md`: 46 line diff (upstream added issue search + observability sections)
- `verify.md`: 49 line diff (upstream added observability section)

**Projects DON'T meaningfully customize templates.** The diffs are either stale renames or upstream improvements the project hasn't picked up. The current system forces ownership of files nobody wants to own.

**What projects DO want to customize:**
1. Project settings (name, test command, build command)
2. Which stop conditions apply to which modes
3. Interview questions specific to their domain
4. Adding project-specific rules/instructions to modes
5. Verification tool setup (dev server, API URLs, auth)
6. Adding custom agents for project-specific tasks

### The Consolidation Opportunity

Today's 10 categories can be collapsed into a tighter surface:

**What if `kata.yaml` was the ONLY config file projects need to touch?**

Currently `kata.yaml` has: `project`, `spec_path`, `research_path`, `session_retention_days`, `reviews`, `providers`, `global_rules`, `task_rules`, `modes`.

It could absorb:
- **Interview customizations** → `modes.planning.interviews` (per-mode interview overrides)
- **Subphase pattern customizations** → `modes.implementation.subphase_pattern` (already partially there — templates reference patterns by name)
- **Mode-specific rules** → `modes.task.rules: ["Always run lint before committing"]`
- **Verification tool config** → `project.dev_server`, `project.api_base`, `project.auth` (structured, not fill-in-the-blank markdown)
- **Stop condition overrides** → already in `modes.*.stop_conditions`

What stays separate:
- **Agent definitions** — `.claude/agents/` is a Claude Code convention, not kata-owned
- **Prompts** — referenced by name in review steps, need to be files
- **Spec templates** — scaffolds for output documents, inherently content
- **GitHub templates** — GitHub convention, one-time setup
- **Mode templates** — the structural/behavioral dual-purpose files (discussed below)

### The Template Problem

Templates are the hardest piece because they serve two roles:

**Role 1: Structural config** (parseable, machine-consumed):
```yaml
phases:
  - id: p0
    name: Quick Planning
    task_config:
      title: "P0: Plan - scope, approach"
    steps:
      - id: understand-task
        title: "Understand and classify"
```

**Role 2: Behavioral instructions** (prose, Claude-consumed):
```yaml
        instruction: |
          Read the user's request carefully.
          **Classify:**
          - [ ] Chore — refactoring, cleanup...
          **If larger scope detected:** Tell the user...
```

**Role 3: Documentation** (markdown body after frontmatter):
```markdown
# Task Mode

**For small tasks and chores** — combined planning + implementation...

## When to Use
- Chores (refactoring, cleanup, config, docs)
...
```

Three options for handling this:

#### A. Keep templates as-is, add override mechanism in kata.yaml

Templates stay as monolithic `.md` files in the package. Projects customize via `kata.yaml`:

```yaml
modes:
  task:
    # Override specific step instructions
    step_overrides:
      p0:context-search:
        instruction: |
          Also check our internal docs API at docs.internal/...
          {upstream}  # placeholder: insert upstream instruction here

    # Add rules injected into all steps
    rules:
      - "Always run pnpm lint before committing"

    # Add a custom phase
    extra_phases:
      - id: p3
        name: "Deploy Preview"
        after: p2
        steps:
          - id: deploy
            title: "Deploy to preview"
            instruction: "Run deploy-preview.sh"

    # Remove a phase
    skip_phases: [p1]  # skip implementation phase (useful for dry-run modes)
```

**Pros:** Single config file for all customization. Templates stay in package.
**Cons:** YAML gets deep and complex. Instruction overrides in YAML are awkward for long prose.

#### B. Template inheritance with instruction files

Templates define structure. Instructions are separate files that can be overridden:

```
batteries/templates/task.md          # structure (phases, steps, titles)
batteries/instructions/task/         # default instructions per step
  p0-understand-task.md
  p0-context-search.md
  p1-make-changes.md
  ...

.kata/instructions/task/             # project overrides (optional)
  p0-context-search.md              # overrides just this one step
```

Template frontmatter references instructions by convention:
```yaml
steps:
  - id: context-search
    title: "Quick context search"
    # instruction loaded from: instructions/{mode}/{phase}-{step}.md
    # project override checked first, then package default
```

**Pros:** Fine-grained override without copying entire template. Clean separation.
**Cons:** Many small files (opposite of "tighter surface"). New convention to learn.

#### C. Composable template layers

Package provides a base template. Projects provide a thin overlay YAML that patches specific fields:

```yaml
# .kata/overlays/task.yaml
extends: task  # base template from package

phases:
  p0:
    steps:
      context-search:
        instruction: |
          {inherit}

          Also check internal docs at docs.internal/api

  p3:  # new phase, inserted after p2
    name: "Deploy Preview"
    after: p2
    steps:
      - id: deploy
        title: "Deploy to preview"
        instruction: "..."

skip_phases: []
extra_rules:
  - "Always run pnpm lint before committing"
```

**Pros:** Explicit overlay file, clear what's customized. Inherits upstream base.
**Cons:** New overlay schema. `{inherit}` placeholder needs implementation.

#### D. kata.yaml absorbs everything (maximum consolidation)

ALL mode customization goes into `kata.yaml`. Templates become internal implementation details — projects never see or think about them.

```yaml
project:
  name: "my-app"
  test_command: "pnpm test"
  build_command: "pnpm build"
  dev_server: "pnpm dev"
  api_base: "http://localhost:3000"

reviews:
  code_review: true
  code_reviewers: ["gemini"]

# Mode configuration — everything in one place
modes:
  task:
    template: task.md  # still references a template, but users don't edit it
    stop_conditions: [tasks_complete, committed, pushed]
    rules:
      - "Always run pnpm lint before committing"
      - "Use conventional commit format"
    step_overrides:
      p0.context-search:
        append: |
          Also check internal docs at https://docs.internal/api
    extra_phases:
      - id: p3
        name: "Deploy Preview"
        after: p2
        steps:
          - id: deploy
            title: "Deploy to preview env"
            instruction: "Run ./scripts/deploy-preview.sh"

  planning:
    interviews:
      # Override specific categories
      architecture:
        rounds:
          - header: "Microservices"
            question: "Which services does this touch?"
            options:
              - {label: "Gateway only", description: "..."}
              - {label: "Multi-service", description: "..."}

  implementation:
    subphase_pattern: impl-test-review  # already configurable
```

**Pros:** TRUE single config surface. Projects manage ONE file. Upstream templates are internal.
**Cons:** kata.yaml can get large for heavily customized projects. Deep nesting. Long instruction text in YAML is ugly.

### Recommendation: Option A (kata.yaml overrides) + selective D (absorb structured config)

The sweet spot is:

1. **`kata.yaml` becomes the override layer** — 2-tier merge with package defaults. Project only specifies what differs.
2. **Templates stay in the package** — projects don't copy them. 2-tier lookup (already works) handles fallback.
3. **Structured config absorbed into kata.yaml** — `interviews`, `subphase_pattern` references, `verification` tool config, per-mode `rules`
4. **Instruction overrides via kata.yaml** — `step_overrides` with `append`, `prepend`, or `replace` semantics
5. **Template ejection optional** — `kata eject task` copies template to `.kata/templates/` for full control, `kata uneject task` removes it

### Proposed kata.yaml schema (expanded)

```yaml
# ─── Project settings (every project fills these) ───
project:
  name: "my-app"
  test_command: "pnpm test"
  build_command: "pnpm build"
  typecheck_command: "pnpm typecheck"
  dev_server_command: "pnpm dev"
  dev_server_health: "http://localhost:3000/health"
  api_base: "http://localhost:3000/api"
  diff_base: "main"

spec_path: planning/specs
research_path: planning/research

# ─── Reviews ───
reviews:
  code_review: true
  code_reviewers: ["gemini"]

# ─── Global rules (injected into every mode) ───
global_rules:
  - "Use conventional commit format: type(scope): description"
  - "Always run typecheck before committing"

# ─── Mode overrides (merged over package defaults) ───
# Only include modes you want to customize. Unmentioned modes inherit fully.
modes:
  task:
    stop_conditions: [tasks_complete, committed, pushed]
    rules:  # mode-specific rules (in addition to global_rules)
      - "Keep changes under 100 lines"
    step_overrides:
      p0.context-search:
        append: |
          Also search our internal API docs at docs.internal/api

  planning:
    interviews:
      # Add domain-specific interview category
      microservices:
        name: "Microservices"
        description: "Which services are affected"
        rounds:
          - header: "Services"
            question: "Which services does this feature touch?"
            options:
              - {label: "Gateway", description: "API gateway only"}
              - {label: "Auth service", description: "Authentication service"}
              - {label: "Multi-service", description: "Spans multiple services"}
```

### What gets removed from batteries copy

| Currently copied | Proposed |
|-----------------|----------|
| Mode templates (7 `.md` files) | **Stop copying** — 2-tier lookup already works |
| `kata.yaml` (full 164-line copy) | **Stop copying** — 2-tier merge, project only stores overrides |
| `interviews.yaml` | **Stop copying** — 2-tier merge already works, overrides go in kata.yaml |
| `subphase-patterns.yaml` | **Stop copying** — 2-tier merge already works |
| `verification-tools.md` | **Absorb into kata.yaml** — `project.dev_server_command` etc. |

| Still copied (eject-and-own) |
|-----|
| Agents (`.claude/agents/*.md`) — Claude convention |
| Prompts (`.kata/prompts/*.md`) — referenced by name |
| Spec templates (`planning/spec-templates/`) — content scaffolds |
| GitHub templates (`.github/`) — one-time setup |

**Result:** batteries goes from ~25 files copied to ~12. Project config surface narrows from 10+ scattered files to just `kata.yaml` + optional eject-and-own content.

### Implementation priority

1. **kata.yaml 2-tier merge** — load package `batteries/kata.yaml` as base, merge project overrides. ~50 lines in `kata-config.ts`. Immediate win: projects get new upstream modes automatically.

2. **Stop copying mode templates** — remove template copying from `scaffoldBatteries()`. Already works via 2-tier lookup.

3. **Per-mode `rules`** — add `rules: string[]` to `KataModeConfigSchema`, inject into session context. Simple addition to guidance output.

4. **`step_overrides`** — add `step_overrides` to mode config, apply during `buildPhaseTasks()`. Supports `append`, `prepend`, `replace` on instruction text.

5. **Absorb verification tools** — move from freeform markdown to structured `project.*` fields in kata.yaml.

6. **Interview overrides in kata.yaml** — move from separate `interviews.yaml` to `modes.planning.interviews`.

7. **Eject/uneject commands** — `kata eject <mode>` for full template control when needed.

## Open Questions

1. **`step_overrides` key format** — `p0.context-search` (dot-separated) vs `p0:context-search` (colon) vs nested YAML? Dot-separated is simplest for flat override map.

2. **`{inherit}` placeholder** — when appending to instructions, should we support inserting upstream content at a specific position? Or just append/prepend? Start with append/prepend, add `{inherit}` if needed.

3. **Per-mode interviews in kata.yaml** — should interview overrides be in `modes.planning.interviews` or top-level `interviews`? Mode-level is more consistent but nests deeper.

4. **Agent 2-tier lookup** — `.claude/agents/` is Claude-owned convention. Should we add package fallback for agents too? Agents are already loaded from `.claude/agents/` by Claude Code itself, not by kata.

5. **Migration** — existing projects have full-copy templates + full kata.yaml. Need `kata migrate` to detect and strip unnecessary copies.

## Next Steps

1. **Spec Phase 1:** kata.yaml 2-tier merge + stop copying templates + per-mode rules
2. **Spec Phase 2:** step_overrides + absorb verification config + interview overrides
3. **Spec Phase 3:** eject/uneject + migration tool
