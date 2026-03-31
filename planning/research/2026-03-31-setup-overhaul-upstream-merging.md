---
date: 2026-03-31
topic: Setup overhaul — simpler structure, project-owned files, tighter config surface
status: complete
github_issue: null
---

# Research: Setup Overhaul

## Goal

Simpler system where every project owns its files, with a tighter config surface, more flexible customization, and a clean path for upstream improvements.

## Problems with current system

1. **Too many file categories** — batteries scatters 10+ categories across `.kata/`, `.claude/`, `planning/`, `.github/`
2. **Dual system is confusing** — package has `batteries/`, project has copies, 2-tier lookup decides which wins, `--update` clobbers local changes
3. **Customization requires copying entire files** — to change one step instruction you own a 33KB template
4. **Config is fragmented** — interviews.yaml, subphase-patterns.yaml, verification-tools.md, kata.yaml are all separate files with separate merge logic

## Design: Project-owned, consolidated under `.kata/`

### Directory layout

```
.kata/
  kata.yaml                    # unified config: project settings + modes + interviews + patterns
  templates/                   # mode templates (project-owned, editable)
    planning.md
    task.md
    debug.md
    research.md
    implementation.md
    verify.md
    freeform.md
    onboard.md
  prompts/                     # review/eval prompts
    code-review.md
    spec-review.md
    ...
  spec-templates/              # spec document scaffolds
    feature.md
    bug.md
    epic.md
  sessions/                    # runtime session state (internal)

.claude/                       # Claude Code conventions (not kata-owned)
  agents/                      # agent definitions
    impl-agent.md
    review-agent.md
    test-agent.md
  settings.json                # hook registrations

.github/                       # GitHub conventions
  ISSUE_TEMPLATE/              # issue templates (optional)
```

### What changes from today

| Today | Proposed | Why |
|-------|----------|-----|
| `batteries/` in package + copies in project | Project owns files directly, no batteries concept | Simpler, no dual system |
| `kata batteries --update` with backup dirs | `kata update` with smart merge | No clobbering |
| `.kata/interviews.yaml` (separate file) | Absorbed into `kata.yaml` `interviews:` section | Fewer files |
| `.kata/subphase-patterns.yaml` (separate file) | Absorbed into `kata.yaml` `subphase_patterns:` section | Fewer files |
| `.kata/verification-tools.md` (freeform markdown) | Absorbed into `kata.yaml` `project:` structured fields | Fewer files, validated |
| `planning/spec-templates/` | Moved to `.kata/spec-templates/` | Consolidated under `.kata/` |
| `.kata/providers/` (example files) | Absorbed into `kata.yaml` `providers:` section | Fewer files |
| `kata setup --batteries` (separate flag) | `kata setup` does everything | No batteries concept |
| `.kata/batteries-backup/` | Gone | No backup-on-update needed |

### `kata.yaml` — the unified config

Everything that was scattered across 5+ files consolidates into one:

```yaml
# ─── Project settings ───
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
session_retention_days: 7

# ─── Reviews ───
reviews:
  code_review: true
  code_reviewers: ["gemini"]

# ─── Global rules (injected into every mode) ───
global_rules:
  - "Use conventional commit format: type(scope): description"
  - "Always run typecheck before committing"

# ─── Task system rules ───
task_rules:
  - "Tasks are pre-created by kata enter. Do NOT create new tasks with TaskCreate."
  - "Run TaskList FIRST to discover pre-created tasks and their dependency chains."
  - "Use TaskUpdate to mark tasks in_progress/completed. Never use TaskCreate."
  - "Follow the dependency chain — blocked tasks cannot start until dependencies complete."

# ─── Providers ───
providers:
  default: claude
  available: [claude, gemini]
  judge_provider: gemini
  judge_model: null

# ─── Subphase patterns (was subphase-patterns.yaml) ───
subphase_patterns:
  impl-test-verify:
    description: "Implement, test process gates, then verify against real services"
    steps:
      - id_suffix: impl
        title_template: "IMPL - {task_summary}"
        todo_template: "Implement {task_summary}"
        active_form: "Implementing {phase_name}"
        labels: [impl]
        instruction: |
          ⛔ DO NOT implement this phase yourself. SPAWN an impl-agent.
          ...
      - id_suffix: test
        title_template: "TEST - {phase_name}"
        depends_on_previous: true
        instruction: |
          Run the process gate:
          kata check-phase {phase_label} --issue={issue}
      - id_suffix: verify
        title_template: "VERIFY - {phase_name}"
        depends_on_previous: true
        instruction: |
          Spawn a FRESH verification agent...

  impl-test:
    description: "Implement then run process gates"
    steps:
      - id_suffix: impl
        title_template: "IMPL - {task_summary}"
        instruction: "..."
      - id_suffix: test
        title_template: "TEST - {phase_name}"
        depends_on_previous: true
        instruction: "..."

  impl-test-review:
    description: "Implement, test, then code review"
    steps:
      - id_suffix: impl
        title_template: "IMPL - {task_summary}"
        instruction: "..."
      - id_suffix: test
        title_template: "TEST - {phase_name}"
        depends_on_previous: true
        instruction: "..."
      - id_suffix: review
        title_template: "REVIEW - {reviewers}"
        depends_on_previous: true
        instruction: "..."

# ─── Interview categories (was interviews.yaml) ───
interviews:
  requirements:
    name: "Requirements"
    description: "User journey, happy path, scope boundaries, edge cases"
    rounds:
      - header: "Problem"
        question: "What user problem does this solve?"
        options:
          - {label: "User workflow gap", description: "Missing capability"}
          - {label: "Performance issue", description: "Current approach too slow"}
          - {label: "New capability", description: "Something users can't do today"}
      - header: "Happy Path"
        question: "What does the ideal success flow look like?"
        options:
          - {label: "I'll describe it", description: "Free-form description"}
      # ... more rounds

  architecture:
    name: "Architecture"
    description: "Integration points, error handling, performance"
    rounds:
      - header: "Integration"
        question: "What existing systems or APIs does this touch?"
        options:
          - {label: "I'll list them", description: "Free-form list"}
      # ... more rounds

  testing:
    name: "Testing Strategy"
    rounds:
      # ...

  design:
    name: "UI Design"
    rounds:
      # ...

# ─── Mode definitions ───
modes:
  research:
    name: "Research"
    description: "Explore and synthesize findings"
    template: "research.md"
    stop_conditions: [tasks_complete, committed, pushed]
    intent_keywords: ["research", "explore", "learn about"]

  planning:
    name: "Planning"
    description: "Research, spec, review, approved"
    template: "planning.md"
    issue_handling: "required"
    issue_label: "feature"
    stop_conditions: [tasks_complete, spec_valid, committed, pushed]
    intent_keywords: ["plan feature", "spec", "design", "write spec"]

  implementation:
    name: "Implementation"
    description: "Execute approved specs"
    template: "implementation.md"
    issue_handling: "required"
    issue_label: "feature"
    stop_conditions: [tasks_complete, committed, pushed, tests_pass, feature_tests_added]
    intent_keywords: ["implement", "build", "code", "develop"]

  task:
    name: "Task"
    description: "Combined planning + implementation for small tasks"
    template: "task.md"
    issue_handling: "none"
    stop_conditions: [tasks_complete, committed]
    intent_keywords: ["task:", "chore", "small task", "quick change"]
    workflow_prefix: "TK"
    aliases: ["chore", "small"]

  freeform:
    name: "Freeform"
    description: "Quick questions and discussion (no phases)"
    template: "freeform.md"
    stop_conditions: []
    intent_keywords: ["question", "how does", "what is", "explain"]
    workflow_prefix: "FF"
    aliases: ["question", "ask", "help"]

  verify:
    name: "Verify"
    description: "Execute Verification Plan steps"
    template: "verify.md"
    stop_conditions: [tasks_complete, committed, pushed]
    intent_keywords: ["verify", "run verification"]
    workflow_prefix: "VF"

  debug:
    name: "Debug"
    description: "Systematic hypothesis-driven debugging"
    template: "debug.md"
    stop_conditions: [tasks_complete, committed, pushed]
    intent_keywords: ["debug", "investigate", "bug", "broken"]
    workflow_prefix: "DB"
    aliases: ["investigate"]

  onboard:
    name: "Onboard"
    description: "Configure kata for a new project"
    template: "onboard.md"
    stop_conditions: []
    intent_keywords: ["onboard", "setup kata"]
```

This is long but it's **one file** that contains everything. Projects can read it, customize any section, and understand the full config at a glance. Compare to today where the same information is spread across `kata.yaml` + `interviews.yaml` + `subphase-patterns.yaml` + `verification-tools.md` + `providers/ollama.yaml.example`.

### Templates stay as markdown files

Templates keep their current format — YAML frontmatter (phases, steps, instructions) + markdown body (Claude context). They live in `.kata/templates/` and the project owns them.

**Key difference from today:** no batteries copy. `kata setup` creates them directly from the package seed. The project edits them freely.

### `kata setup` — one command, everything scaffolded

```bash
kata setup
```

Creates:
1. `.kata/kata.yaml` — full config with auto-detected project settings
2. `.kata/templates/*.md` — all mode templates
3. `.kata/prompts/*.md` — review prompts
4. `.kata/spec-templates/*.md` — spec scaffolds
5. `.claude/agents/*.md` — agent definitions
6. `.claude/settings.json` — hook registrations
7. `.github/ISSUE_TEMPLATE/` — issue templates (if `--github` flag)

**Auto-detection during setup:**
- Project name from `package.json` or directory name
- Test command from `package.json` scripts
- Build command from `package.json` scripts
- CI system from `.github/workflows/` or similar

**No flags needed.** No `--batteries`, no `--yes`, no `--strict`. Opinionated defaults. The project can adjust `kata.yaml` after.

### `kata update` — upstream improvements

Since projects own files, upstream improvements need a clean merge path.

**Mechanism:** version-tracked smart merge.

Each generated file gets a `kata_version` field (in YAML frontmatter for templates, in kata.yaml metadata):

```yaml
# .kata/templates/task.md frontmatter
---
id: task
name: Task Mode
kata_version: "1.5.0"   # version of kata that generated this file
# ...
---
```

```bash
kata update --preview    # show what upstream changed since your version
kata update              # apply upstream changes, create git commit
kata update --force      # overwrite without merge (escape hatch)
```

**How `kata update` works:**

1. Read `kata_version` from each file
2. Diff the file against the package's version at that old version
3. Diff the package's old version against the current package version (upstream delta)
4. If file is unchanged from old version → replace with new version (clean update)
5. If file has local changes AND upstream changed → three-way merge attempt
6. If conflict → mark with conflict markers, user resolves

**For kata.yaml specifically:**
- Structured YAML merge: new keys added, existing keys preserved
- New modes added automatically
- Changed mode defaults shown as diff for review
- Project overrides never lost

**For templates:**
- Frontmatter (YAML) merged structurally
- Markdown body merged via text diff
- Conflicts marked clearly

### What about per-mode customization?

Since projects own templates directly, customization is straightforward:

**Change a step instruction:** Edit `.kata/templates/task.md`, find the step, change the instruction.

**Add a phase:** Add a new phase entry in the template's YAML frontmatter.

**Add project-specific rules to a mode:** Add `rules:` to the mode in `kata.yaml`:

```yaml
modes:
  task:
    rules:
      - "Always run pnpm lint before committing"
      - "Keep changes under 100 lines"
```

These get injected into session context alongside global_rules.

**Customize interview questions:** Edit the `interviews:` section in `kata.yaml`.

**Change subphase patterns:** Edit the `subphase_patterns:` section in `kata.yaml`.

No overlay system, no step_overrides, no `{inherit}` placeholders. Just edit the file you own.

### Code changes required

**Remove:**
- `src/commands/batteries.ts` — no more batteries command
- `src/commands/scaffold-batteries.ts` — no more scaffolding logic
- `batteries/` directory — seeds move into setup logic
- 2-tier template lookup in `resolveTemplatePath()` — project path only
- 2-tier merge in `interviews.ts` and `subphase-patterns.ts` — single source (kata.yaml)
- `batteries-backup/` logic

**Modify:**
- `src/commands/setup.ts` — scaffolds everything directly, auto-detects project settings
- `src/config/kata-config.ts` — schema expands to include interviews + subphase_patterns sections
- `loadKataConfig()` — loads single file, no merge
- `loadInterviewConfig()` → reads from `kata.yaml` `interviews:` section
- `loadSubphasePatterns()` → reads from `kata.yaml` `subphase_patterns:` section
- Template resolution — just `.kata/templates/{name}`, no fallback

**Add:**
- `src/commands/update.ts` — `kata update` with version-tracked merge
- `kata_version` tracking in generated files
- Per-mode `rules:` field in `KataModeConfigSchema`
- Migration command for existing projects

### Migration from current system

```bash
kata migrate
```

1. Reads existing `.kata/kata.yaml` (or `.claude/workflows/kata.yaml`)
2. Reads `.kata/interviews.yaml` → merges into kata.yaml `interviews:` section
3. Reads `.kata/subphase-patterns.yaml` → merges into kata.yaml `subphase_patterns:` section
4. Reads `.kata/verification-tools.md` → extracts values into `project:` fields
5. Moves `planning/spec-templates/` → `.kata/spec-templates/`
6. Removes old files
7. Stamps `kata_version` on all files
8. Outputs summary of what moved

### File count comparison

| | Today | Proposed |
|--|-------|----------|
| Config files | 5 (kata.yaml, interviews, subphase-patterns, verification-tools, providers) | **1** (kata.yaml) |
| Template files | 7-8 in `.kata/templates/` | **7-8** in `.kata/templates/` (same, but no batteries dual) |
| Prompt files | 5 in `.kata/prompts/` | **5** in `.kata/prompts/` (same) |
| Spec templates | 3 in `planning/spec-templates/` | **3** in `.kata/spec-templates/` (moved) |
| Agent files | 3 in `.claude/agents/` | **3** in `.claude/agents/` (same) |
| GitHub files | 3-4 in `.github/` | **3-4** in `.github/` (same) |
| Backup dirs | 1+ in `.kata/batteries-backup/` | **0** |
| **Total config surface** | **5 config + batteries system** | **1 config file** |

## Open questions

1. **kata.yaml size** — with interviews + subphase_patterns inlined, kata.yaml gets long (~300 lines). Is that OK since it's one file? Or should interviews/patterns stay as separate files under `.kata/` but with no batteries dual?

2. **Template version tracking format** — `kata_version: "1.5.0"` in frontmatter works for templates. For kata.yaml, use a top-level `_kata_version: "1.5.0"` field?

3. **Update conflict resolution** — for templates (mixed YAML + markdown), should conflicts use git-style markers? Or should `kata update` refuse to merge and show a diff instead?

4. **Onboard template** — is inherently project-specific (created during setup interview). Should it be excluded from `kata update`?

5. **Setup interview vs auto-detect** — should `kata setup` ask questions interactively, or just auto-detect and let the user edit kata.yaml after? Recommendation: auto-detect, print what was detected, user edits.

## Next steps

1. **Spec Phase 1:** New kata.yaml schema (absorb interviews + subphase_patterns) + simplified setup
2. **Spec Phase 2:** Remove batteries system, single-source template resolution
3. **Spec Phase 3:** `kata update` with version-tracked merge
4. **Spec Phase 4:** Migration tool for existing projects
