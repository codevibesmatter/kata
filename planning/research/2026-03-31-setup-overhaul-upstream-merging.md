---
date: 2026-03-31
topic: Setup overhaul — agent-driven onboard, consolidated config, upstream merging
status: complete
github_issue: null
---

# Research: Setup Overhaul

## Goal

Replace the current batteries/setup system with:
1. **Bare-minimum CLI** (`kata setup`) that creates the skeleton
2. **Agent-driven onboard cycle** that researches the project, interviews the user, and produces truly customized config and templates
3. **Validation command** at the end to verify everything
4. **Consolidated config** under `.kata/` with one `kata.yaml`
5. **Upstream merge** that works with project-customized files

## Problems with current system

1. **Generic output** — every project gets identical files regardless of framework, language, or architecture
2. **Batteries concept is confusing** — dual system (package vs project), 2-tier lookup, `--update` clobbers
3. **Config scattered across 10+ file categories** — kata.yaml, interviews.yaml, subphase-patterns.yaml, verification-tools.md, templates, prompts, agents, spec-templates, github templates, providers
4. **Onboard mode is shallow** — asks questions but doesn't research the codebase, doesn't customize templates

## Design

### Two-step setup

#### Step 1: `kata setup` (CLI, mechanical)

Creates the skeleton with seed files. No agent needed.

```bash
kata setup
```

Produces:
```
.kata/
  kata.yaml              # full config with auto-detected project settings + default modes
  templates/             # seed templates copied from package (identical to upstream)
    planning.md, task.md, debug.md, research.md, implementation.md, verify.md, freeform.md, onboard.md
  prompts/               # seed prompts copied from package
    code-review.md, spec-review.md, ...
  spec-templates/        # seed spec scaffolds copied from package
    feature.md, bug.md, epic.md
  sessions/              # runtime dir
.claude/
  agents/                # seed agent definitions copied from package
    impl-agent.md, review-agent.md, test-agent.md
  settings.json          # hook registrations
```

`kata.yaml` has auto-detected project settings + full default modes/interviews/patterns:
```yaml
kata_version: "1.5.0"     # tracks which package version seeded this
project:
  name: "my-app"           # from package.json
  test_command: "pnpm test" # detected
  build_command: null       # detected or null
  ci: "github-actions"     # detected or null

# Full default modes, interviews, subphase_patterns included
# (same content as current batteries/kata.yaml + interviews.yaml + subphase-patterns.yaml)
modes: { ... }
interviews: { ... }
subphase_patterns: { ... }
```

All templates have `kata_version` in frontmatter. Files are usable immediately — the onboard agent customizes them further but isn't required.

#### Step 2: `kata enter onboard` (agent-driven)

This is where the real setup happens. The onboard agent runs a **research → plan → apply** cycle:

**Phase 0: Research the project**

The agent explores the codebase autonomously:
- Reads `package.json` — dependencies, scripts, framework detection
- Scans directory structure — `src/`, `app/`, `pages/`, `lib/`, `tests/`, monorepo structure
- Reads existing config — `tsconfig.json`, `.eslintrc`, `vitest.config.ts`, etc.
- Identifies the tech stack — Next.js? Express? CLI tool? Library? Monorepo?
- Checks for existing patterns — test conventions, import aliases, API structure
- Detects dev server setup — port, health endpoint, auth patterns

Output: a project profile that informs all subsequent decisions.

**Phase 1: Interview the user**

Based on research findings, asks targeted questions:
- Confirms detected settings (test command, build command, etc.)
- Asks about review preferences (code review? which providers?)
- Asks about workflow strictness (strict hooks?)
- Asks domain-specific questions informed by the codebase:
  - Next.js project → "Do you use App Router or Pages Router?"
  - API project → "What's your API base URL for verification?"
  - Monorepo → "Which packages should kata manage?"
- Asks about team workflow (PR-based? trunk-based? solo?)

**Phase 2: Customize existing files**

The agent patches the seed files (already created by `kata setup`) with project-specific content. It does NOT generate from scratch — it modifies what's there:

**`kata.yaml`** — patches the seed config with:
- Project settings (confirmed/overridden during interview)
- Mode definitions with project-appropriate stop conditions
- Interview categories tailored to the domain (no UI design questions for a CLI tool)
- Subphase patterns appropriate for the workflow
- Global rules derived from the codebase (e.g., "This project uses pnpm — always use pnpm, not npm")
- Per-mode rules (e.g., for a Next.js project: "Run `pnpm build` after changes — route types are generated at build time")

**Templates** — patches step instructions in existing seed templates:
- Step instructions reference actual project files and patterns
  - Instead of generic "run tests": `Run pnpm vitest run --reporter=verbose`
  - Instead of generic "check existing patterns": `Check src/lib/api.ts for the API client pattern used in this project`
- Context-search steps know where to look in THIS project
- Implementation steps reference the project's architecture
- Debug steps know the project's logging/observability setup

**Prompts** — review prompts with project context:
- Code review prompt knows the project's conventions
- Spec review prompt knows the project's architecture patterns

**Spec templates** — tailored to the project:
- Feature spec template includes the project's layer structure (UI/API/Data or just API, etc.)
- Bug template references the project's test infrastructure

**Agents** — agent definitions with project awareness:
- impl-agent instructions reference the project's build/test commands
- review-agent knows the project's quality standards

**Phase 3: GitHub setup**

Same as current onboard: gh CLI check, auth, labels, issue templates.

**Phase 4: Validate**

```bash
kata doctor
```

Verifies:
- kata.yaml is valid (schema validation)
- All referenced templates exist
- All referenced prompts exist
- Hooks are registered correctly
- Test command works
- Build command works (if set)

### What the agent produces (concrete example)

For a **Next.js + tRPC + Drizzle** project, the agent would produce:

**kata.yaml** (abbreviated):
```yaml
project:
  name: "my-saas-app"
  test_command: "pnpm vitest run"
  build_command: "pnpm build"
  typecheck_command: "pnpm tsc --noEmit"
  dev_server_command: "pnpm dev"
  dev_server_health: "http://localhost:3000/api/health"
  api_base: "http://localhost:3000/api/trpc"
  diff_base: "main"

reviews:
  code_review: true
  code_reviewers: ["gemini"]

global_rules:
  - "This project uses pnpm — always use pnpm, never npm or yarn"
  - "Run pnpm build after changes — Next.js route types are generated at build time"
  - "Database schema is in src/db/schema.ts — always check for existing tables before creating new ones"
  - "API routes use tRPC — routers are in src/server/routers/"

interviews:
  requirements:
    name: "Requirements"
    rounds:
      - header: "Problem"
        question: "What user problem does this solve?"
        options:
          - {label: "User workflow gap", description: "Missing capability"}
          - {label: "Performance issue", description: "Slow or unreliable"}
          - {label: "New capability", description: "Something users can't do today"}
      # ... more rounds
  architecture:
    name: "Architecture"
    rounds:
      - header: "Layers"
        question: "Which layers does this feature touch?"
        options:
          - {label: "Frontend only", description: "React components, no API changes"}
          - {label: "Full stack", description: "UI + tRPC router + Drizzle schema"}
          - {label: "Backend only", description: "tRPC router + Drizzle, no UI"}
          - {label: "Schema migration", description: "Drizzle schema change with migration"}
      # ... project-specific rounds
  testing:
    name: "Testing"
    rounds:
      - header: "Test types"
        question: "What tests should we write?"
        options:
          - {label: "Unit tests", description: "Vitest — isolated component/function tests"}
          - {label: "API tests", description: "tRPC router tests with test client"}
          - {label: "E2E tests", description: "Playwright browser tests"}
  # No "design" category — agent detected this project doesn't have custom UI components

modes:
  task:
    rules:
      - "After code changes, always run: pnpm build && pnpm vitest run"
    # ... rest inherited from template defaults

subphase_patterns:
  impl-test-verify:
    steps:
      - id_suffix: impl
        title_template: "IMPL - {task_summary}"
        instruction: |
          SPAWN impl-agent with project context:
          - tRPC routers: src/server/routers/
          - Drizzle schema: src/db/schema.ts
          - React components: src/components/
          ...
      # ... rest of pattern
```

**`.kata/templates/task.md`** (abbreviated, showing customized parts):
```yaml
steps:
  - id: context-search
    title: "Quick context search"
    instruction: |
      SPAWN a fast Explore agent:
      Task(subagent_type="Explore", prompt="
        Find code patterns for: {task description}
        Key locations in this project:
        - tRPC routers: src/server/routers/
        - Drizzle schema: src/db/schema.ts
        - React components: src/components/
        - API client: src/lib/trpc.ts
        Check for existing patterns to follow.
      ", model="haiku")
```

Compare this to today's generic "Search with Glob and Grep for relevant files."

### For a CLI tool project, the same agent would produce completely different output:

No dev server config, no UI design interviews, implementation steps reference CLI argument parsing patterns, debug template knows about stdio/exit codes instead of HTTP endpoints, etc.

### Upstream merge with customized files

Since the agent produces customized files, upstream merge needs to be smart about it.

**Version tracking:** Every generated file gets `kata_version: "X.Y.Z"` in its frontmatter/metadata. This records which version of kata's seed templates were used as the starting point.

**`kata update` flow:**

```bash
kata update --preview    # show what changed upstream
kata update              # apply changes
```

1. For each file with `kata_version`:
   - Get the package's seed version at that old version (the "base")
   - Get the package's current seed version (the "upstream")
   - Get the project's current file (the "local")

2. **Structural merge for templates (YAML frontmatter):**
   - New phases added upstream → added to local (at the position upstream specified)
   - Phase dependencies changed upstream → updated if local hasn't changed them
   - Step instructions changed upstream → merged only if local still has the original text
   - Step instructions customized locally → preserved (upstream change shown as info)

3. **Structural merge for kata.yaml:**
   - New modes added upstream → added to local
   - New config fields added upstream → added with defaults
   - Existing mode defaults changed upstream → shown as diff, user decides
   - Project-specific fields (project.*, reviews.*, global_rules) → never touched

4. **Simple files (prompts, agents, spec-templates):**
   - If local matches old base exactly → replace with new upstream
   - If local differs → skip, show diff for manual review

**Key principle:** The agent's customizations (project-specific instructions, tailored interview questions) are treated as local changes. Upstream structural improvements (new phases, better dependency chains, new modes) merge in without overwriting the customization.

### How the merge knows what's "structural" vs "customized"

Template frontmatter has two kinds of content:

**Structural** (upstream-owned): phase ids, phase order, dependencies, step ids, step titles, container flags, subphase pattern references, labels

**Behavioral** (project-customized): step instructions, mode rules, interview questions, global rules

The merge engine treats structural changes as safe to apply and behavioral changes as local customizations to preserve.

For instructions specifically, the merge can detect:
- Instruction unchanged from upstream seed → safe to update
- Instruction has project-specific additions → preserve local, show upstream diff as info
- Instruction completely rewritten → preserve local

### Directory layout (final)

```
.kata/
  kata.yaml                    # unified config (project + modes + interviews + patterns)
  templates/                   # mode templates (project-owned, agent-customized)
    planning.md
    task.md
    debug.md
    research.md
    implementation.md
    verify.md
    freeform.md
    onboard.md
  prompts/                     # review prompts (agent-customized)
    code-review.md
    spec-review.md
    ...
  spec-templates/              # spec scaffolds (agent-customized)
    feature.md
    bug.md
    epic.md
  sessions/                    # runtime state

.claude/                       # Claude conventions
  agents/                      # agent definitions (agent-customized)
    impl-agent.md
    review-agent.md
    test-agent.md
  settings.json                # hooks

.github/                       # GitHub conventions
  ISSUE_TEMPLATE/              # issue templates
```

### Setup flow summary

```
kata setup                     # bare skeleton: .kata/ dir, hooks, minimal kata.yaml
  ↓
kata enter onboard             # agent-driven cycle:
  ↓
  P0: Research project         # explore codebase, detect stack, read configs
  P1: Interview user           # targeted questions based on research
  P2: Generate config          # write customized kata.yaml, templates, prompts, agents
  P3: GitHub setup             # gh CLI, auth, labels
  P4: Validate                 # kata doctor
  ↓
Project fully configured with customized, project-aware files
  ↓
(later)
kata update                    # merge upstream improvements preserving customizations
```

### Code changes required

**Remove:**
- `src/commands/batteries.ts`
- `src/commands/scaffold-batteries.ts`
- `batteries/` directory (seeds move into onboard agent's knowledge)
- 2-tier template lookup (project files only)
- 2-tier merge for interviews/subphase-patterns (single source: kata.yaml)

**Simplify:**
- `src/commands/setup.ts` — just creates skeleton, no scaffolding
- `src/config/kata-config.ts` — expanded schema (interviews, subphase_patterns), single file load

**Rewrite:**
- `.kata/templates/onboard.md` — much richer: research phase, project-aware interview, customized file generation

**Add:**
- `src/commands/update.ts` — version-tracked smart merge
- `src/commands/doctor.ts` enhancements — validate generated files
- Per-mode `rules: string[]` in KataModeConfigSchema
- `kata_version` tracking in generated files

### Migration for existing projects

```bash
kata migrate
```

1. Absorbs `interviews.yaml` → `kata.yaml` interviews section
2. Absorbs `subphase-patterns.yaml` → `kata.yaml` subphase_patterns section
3. Absorbs `verification-tools.md` → `kata.yaml` project fields
4. Moves `planning/spec-templates/` → `.kata/spec-templates/`
5. Stamps `kata_version` on all files
6. Removes old files
7. Optionally: runs onboard agent to re-customize templates with project awareness

## Open questions

1. **Onboard agent scope** — how deep should the research phase go? Just `package.json` + directory structure, or also read actual source files to understand patterns? Recommendation: read key files (main entry point, API router, schema) to produce meaningful rules and instructions.

2. **Seed templates as base** — the onboard agent does NOT generate templates from scratch. `kata setup` copies seed templates (from package) into `.kata/templates/` as-is. The onboard agent then patches the behavioral parts (step instructions, rules) with project-specific content while leaving structural parts (phases, dependencies, step ids/titles) untouched. This means templates always have a known-good structure from upstream, the agent only customizes instructions, and `kata update` can cleanly merge upstream structural improvements while preserving the agent's customizations. The `kata_version` stamp records which seed version the file started from.

3. **Re-running onboard** — if a project's stack changes (add a database, switch frameworks), can you re-run onboard? Recommendation: yes, `kata enter onboard` should detect existing config and offer to update/regenerate specific sections.

4. **kata.yaml size** — with interviews + subphase patterns + modes, kata.yaml gets long. Is that OK? Recommendation: yes — one long file is better than many scattered files. YAML sections with comments make it navigable.

5. **Validation depth** — should `kata doctor` actually run the test command and build command, or just check they're set? Recommendation: run them, to verify they work.

6. **Merge granularity** — for template instruction merging, what's the unit? Whole instruction block? Individual lines? Recommendation: whole instruction block per step. If the instruction was customized, preserve it entirely.

## Next steps

1. **Spec Phase 1:** New kata.yaml schema (absorb interviews, subphase patterns, add per-mode rules)
2. **Spec Phase 2:** Simplified `kata setup` (skeleton only)
3. **Spec Phase 3:** Rewritten onboard template with research → interview → generate → validate cycle
4. **Spec Phase 4:** `kata update` with version-tracked structural merge
5. **Spec Phase 5:** Migration tool for existing projects
