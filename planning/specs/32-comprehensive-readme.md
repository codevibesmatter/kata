---
initiative: comprehensive-readme
type: project
issue_type: documentation
status: draft
priority: high
github_issue: 32
created: 2026-03-05
updated: 2026-03-05
phases:
  - id: p1
    name: "Structure & Navigation"
    tasks:
      - "Draft TOC and section skeleton"
      - "Write value prop, install, and quick-start sections"
      - "Write built-in modes reference table with stop conditions"
    test_cases:
      - id: "toc-complete"
        description: "Every section in the spec appears in the TOC"
        type: "smoke"
  - id: p2
    name: "Core Reference Sections"
    tasks:
      - "Write full command reference (core 8 deep, rest grouped)"
      - "Write hooks reference with mermaid hook-chain diagram"
      - "Write kata.yaml config section (annotated YAML + table)"
    test_cases:
      - id: "commands-covered"
        description: "All 8 core commands documented with flags and examples"
        type: "smoke"
  - id: p3
    name: "Conceptual / How-It-Works Sections"
    tasks:
      - "Write mode lifecycle walkthrough with mermaid diagram"
      - "Write context injection (prime) explanation"
      - "Write planning→implementation pipeline with mermaid diagram"
      - "Write stop conditions dedicated section"
    test_cases:
      - id: "diagrams-render"
        description: "All mermaid blocks render correctly in GitHub preview"
        type: "smoke"
  - id: p4
    name: "Advanced & Ecosystem Sections"
    tasks:
      - "Write custom modes + full template frontmatter schema"
      - "Write batteries system section (scaffold + upgrade framing)"
      - "Write architecture section (brief eval mention)"
      - "Update comparison table"
    test_cases:
      - id: "schema-complete"
        description: "Every frontmatter field documented with type and description"
        type: "smoke"
---

# Comprehensive README Update

> GitHub Issue: [#32](https://github.com/codevibesmatter/kata/issues/32)

## Overview

The current README (213 lines) introduces kata at a high level but leaves major features undocumented: the prime/context-injection system, the planning→implementation pipeline, stop conditions, the batteries scaffolder, template frontmatter schema, the hook chain, and most CLI flags. A developer landing on the repo cannot understand how to use kata beyond the basics without reading source code.

This spec drives a full README rewrite targeting **new users evaluating kata**. Every feature gets documented with examples. Mermaid diagrams explain the three key workflows. The result should make kata self-explanatory from the README alone.

---

## Target Audience

**New users evaluating kata** — developers who have heard of kata and are deciding whether to adopt it. They need:
1. A clear value proposition in the first screen
2. A working quick-start path in under 5 minutes
3. Enough depth to understand every feature before committing

---

## README Structure (TOC)

```
1. What kata does             — elevator pitch + key insight
2. Install
3. Quick start                — setup → enter → work → exit in one flow
4. Built-in modes             — table with description + stop conditions per mode
5. How it works
   5a. Mode lifecycle          — mermaid diagram: enter→tasks→work→stop hook→exit
   5b. Context injection       — how prime/SessionStart injects template into Claude
   5c. Planning→Implementation — mermaid: spec created → issue linked → impl enters spec
   5d. Hook chain              — mermaid: SessionStart → UserPromptSubmit → PreToolUse → Stop
6. Stop conditions            — dedicated section: each condition explained
7. Command reference
   7a. Core commands (full)    — enter, exit, status, can-exit, link, doctor, batteries, setup
   7b. Other commands (table)  — all remaining commands in a brief reference table
8. Hooks reference            — what each hook does, when it fires, inputs/outputs
9. Configuration (kata.yaml)  — annotated YAML + field reference table
10. Custom modes              — template system, full frontmatter schema
11. Batteries system          — initial scaffold + upgrade mechanism
12. Architecture              — source layout, data layout, brief eval mention
13. Comparison to similar tools
14. License
```

---

## Feature Behaviors

### B1: Value Proposition & Quick Start

**Core:**
- **ID:** value-prop-quickstart
- **Trigger:** User lands on GitHub repo page
- **Expected:** First screen communicates the core insight (stop hook = sessions must complete) and the three-sentence pitch; Quick Start walks install → `kata enter onboard` → first mode → can-exit → exit as a single narrative flow
- **Verify:** A developer unfamiliar with kata can get from zero to first working session by following the Quick Start alone

#### Content requirements
- Lead with the key insight: kata wraps Claude Code with structured sessions that **cannot stop until phases are done**
- Three concrete benefits: phase tasks auto-created, stop hook blocks early exit, session state survives context compaction
- Quick start: install → tell Claude "set up kata" → Claude runs `kata setup` → `kata enter planning` → phases appear as tasks → `kata can-exit` → `kata exit`
- Mention `kata enter onboard` as the guided setup alternative (`kata setup` is the raw command; `onboard` mode is the agent-guided walkthrough)
- No version assumptions; use `npm install --save-dev @codevibesmatter/kata`

---

### B1b: Built-in Modes Table (Section 4)

**Core:**
- **ID:** builtin-modes-table
- **Trigger:** Section 4 of README
- **Expected:** Table listing all 8 built-in modes with description, issue_handling, and stop_conditions
- **Verify:** All 8 modes present; stop conditions match kata.yaml exactly

#### All 8 built-in modes (accurate data from kata.yaml):

| Mode | Name | Description | Issue required? | Stop conditions |
|------|------|-------------|-----------------|-----------------|
| `research` | Research | Explore and synthesize findings | No | tasks_complete, committed, pushed |
| `planning` | Planning | Research, spec, review, approved | **Yes** | tasks_complete, committed, pushed |
| `implementation` | Implementation | Execute approved specs | **Yes** | tasks_complete, committed, pushed, tests_pass, feature_tests_added |
| `task` | Task | Combined planning + implementation for small tasks | No | tasks_complete, committed |
| `freeform` | Freeform | Quick questions and discussion (no phases) | No | *(none — can always exit)* |
| `verify` | Verify | Execute Verification Plan steps | No | tasks_complete, committed, pushed |
| `debug` | Debug | Systematic hypothesis-driven debugging | No | tasks_complete, committed, pushed |
| `onboard` | Onboard | Configure kata for a new project | No | *(none — can always exit)* |

- Also document mode aliases (e.g., `task` has aliases `chore`, `small`; `debug` has `investigate`)
- Note: `--issue=N` is **required** for planning and implementation; optional for others

---

### B2: Mode Lifecycle Diagram

**Core:**
- **ID:** mode-lifecycle-diagram
- **Trigger:** Section 5a "How it works: Mode lifecycle"
- **Expected:** A Mermaid flowchart showing: `kata enter <mode>` → template loaded → native tasks created with dependency chain → Claude works through tasks → Stop hook fires → incomplete tasks block exit → all tasks done → `kata can-exit` passes → `kata exit`
- **Verify:** Diagram renders on GitHub; every node in the diagram is explained in accompanying prose

#### Content requirements
- Prose explains: what a "mode" is, what a "phase" is, how `--issue=N` links a GitHub issue
- Show example `kata status` output so users know what to expect mid-session
- Show example `kata can-exit` blocked vs. allowed output

---

### B3: Context Injection (prime) Explanation

**Core:**
- **ID:** context-injection
- **Trigger:** Section 5b "How it works: Context injection"
- **Expected:** Clear explanation that `SessionStart` hook runs `kata hook session-start` → calls `kata prime` → injects the mode template, session ledger, global rules, and task rules into Claude's context at the start of every conversation
- **Verify:** Reader understands *why* Claude knows what mode it's in and what tasks to do without being explicitly told each session

#### Content requirements
- Explain that `prime` outputs different content depending on state:
  - No active mode: shows mode selection guide (all available modes + how to pick one)
  - Active mode: shows full template instructions + session state ledger + rules
- Note: this is why Claude can resume mid-workflow after context compaction
- Brief example of what the injected context looks like (mode name, current phase, pending tasks)

---

### B4: Planning → Implementation Pipeline

**Core:**
- **ID:** planning-impl-pipeline
- **Trigger:** Section 5c "How it works: Planning → Implementation pipeline"
- **Expected:** Mermaid diagram + prose showing how planning mode produces a spec file that drives implementation mode; how linking `--issue=N` connects them
- **Verify:** Reader understands that planning and implementation are intentionally separate modes with a handoff artifact (spec file)

#### Content requirements
- Mermaid sequence or flowchart: planning mode → spec created at `planning/specs/{N}-{slug}.md` → spec reviewed → spec approved → `kata enter implementation --issue=N` → implementation reads spec → phases from spec drive tasks
- Explain the `spec_path` config key
- Explain that implementation mode's stop conditions include `tests_pass` and `feature_tests_added` (stricter than planning)
- Note: this is optional — task mode handles small work without a separate planning phase

---

### B5: Hook Chain Diagram

**Core:**
- **ID:** hook-chain-diagram
- **Trigger:** Section 5d "How it works: Hook chain" AND Section 8 "Hooks reference"
- **Expected:** Mermaid diagram showing all hook events in order; table with each hook's command, trigger, and what it does
- **Verify:** Reader understands the full hook lifecycle from session start to stop

#### Content requirements
- Mermaid: `SessionStart` → (session open, any prompt) → `UserPromptSubmit` → (tool use) → `PreToolUse [mode-gate]` → `PreToolUse [task-deps]` → `PreToolUse [task-evidence]` → (Claude tries to stop) → `Stop [stop-conditions]`
- For each hook: event name, kata command, trigger condition, what it outputs (allow/block/inject context)
- Clarify registration tiers:
  - **Always registered**: `session-start`, `user-prompt`, `stop-conditions`, `mode-gate`
  - **Strict-mode only** (`kata setup --strict`): `task-deps`, `task-evidence`
- Note: `mode-gate` is always registered because it also injects `--session=ID` into kata bash commands for session resolution (not just a gating feature)
- Explain the `--strict` flag in `kata setup` adds `task-deps` and `task-evidence`

---

### B6: Stop Conditions Reference

**Core:**
- **ID:** stop-conditions-reference
- **Trigger:** Section 6 "Stop conditions"
- **Expected:** Each stop condition explained with: what it checks, when it's used (which modes), and how to satisfy it
- **Verify:** Reader knows exactly what they need to do to pass each condition

#### Stop conditions to document:
| Condition | Checks | Modes that use it |
|-----------|--------|-------------------|
| `tasks_complete` | All native tasks have `status: completed` | research, planning, implementation, task, verify, debug |
| `committed` | No uncommitted changes in git working tree | research, planning, implementation, task, verify, debug |
| `pushed` | No unpushed commits (ahead of remote) | research, planning, implementation, verify, debug (NOT task) |
| `tests_pass` | `project.test_command` exits 0 | implementation only |
| `feature_tests_added` | New test files added in this diff | implementation only |

Note: `freeform` and `onboard` have empty stop conditions (`[]`) — they can always exit.

- Show `kata can-exit` example output when blocked (with reason) and when passing
- Explain the `--json` flag for machine-readable output

---

### B7: Command Reference — Core 8

**Core:**
- **ID:** command-reference-core
- **Trigger:** Section 7a
- **Expected:** Each of the 8 core commands gets: purpose sentence, synopsis with all flags, annotated example showing realistic output
- **Verify:** Every flag listed in the inventory appears in the docs

#### Commands to document fully:

1. **`kata enter <mode> [--issue=N] [--template=PATH] [--tmp]`**
   - What it does, what modes are valid, what `--issue` does, what `--tmp` does (one-off session)
   - Example: `kata enter planning --issue=42`
   - Show the task creation output

2. **`kata exit [--session=ID]`**
   - When to use vs. `can-exit`
   - What happens to session state on exit

3. **`kata status [--json]`**
   - Show realistic text output + JSON output side-by-side
   - All fields in JSON output

4. **`kata can-exit [--json]`**
   - Show blocked output (with reasons) and passing output
   - Explain `nextStepMessage` and `escapeHatch` in JSON

5. **`kata link [<issue>] [--show] [--clear]`**
   - Link, view, or clear the GitHub issue associated with current session

6. **`kata doctor [--fix] [--json]`**
   - All checks it performs (list)
   - What `--fix` auto-repairs
   - When to run it

7. **`kata batteries [--update]`**
   - What files it scaffolds (table: source → destination → contents)
   - `--update`: overwrites with latest package versions (use after `npm update`)

8. **`kata setup [--strict] [--batteries] [--yes]`**
   - What it creates (hooks in settings.json, directories, config)
   - When to use `--strict` (adds mode-gate, task-deps, task-evidence hooks)
   - When to use `--batteries` (also runs batteries scaffold)

---

### B8: Command Reference — Other Commands

**Core:**
- **ID:** command-reference-other
- **Trigger:** Section 7b
- **Expected:** All remaining commands in a single reference table: command | flags | description

#### Commands for grouped table:
`kata prime`, `kata suggest`, `kata hook <name>`, `kata modes`, `kata init [--force]`, `kata teardown`, `kata config`, `kata validate-spec`, `kata validate-template`, `kata init-mode`, `kata register-mode`, `kata init-template`, `kata check-phase`, `kata review`, `kata prompt`, `kata postmortem`, `kata projects [list|add|remove|init|sync]`, `kata providers`

Note: `kata init --force` is a flag on `kata init`, not a separate command.

---

### B9: kata.yaml Configuration

**Core:**
- **ID:** config-reference
- **Trigger:** Section 9
- **Expected:** Full annotated YAML showing every field with inline comments, followed by a reference table
- **Verify:** Every field from the schema inventory appears in both the annotated YAML and the table

#### Annotated YAML structure:
```yaml
project:
  name: my-project           # Display name
  build_command: npm run build
  test_command: npm test
  typecheck_command: npm run typecheck
  smoke_command: null        # Optional smoke test
  diff_base: origin/main     # Branch to diff against for feature_tests_added
  test_file_pattern: "**/*.test.ts"
  ci: null
  dev_server_command: null
  dev_server_health: null

spec_path: planning/specs
research_path: planning/research
session_retention_days: 7
non_code_paths: ['.claude', '.kata', 'planning']

reviews:
  spec_review: false
  code_review: false
  spec_reviewer: null
  code_reviewer: null

providers:
  default: claude
  available: [claude]

global_rules: []   # Injected into all mode templates
task_rules: []     # Injected when mode has phases

modes:             # Project-level mode overrides (merged with built-ins)
  my-custom-mode:
    template: my-mode.md
    stop_conditions: [tasks_complete, committed]
    issue_handling: none          # "required" | "none"
    issue_label: feature          # Label used when creating GH issues
    name: "My Custom Mode"
    description: "..."
    workflow_prefix: "MC"         # 2-letter prefix for workflow IDs (e.g. MC-0423)
    intent_keywords:              # Phrases that trigger mode suggestion
      - "my custom task"
    aliases:                      # Alternate mode names accepted by kata enter
      - "custom"
```

---

### B10: Custom Modes & Template Schema

**Core:**
- **ID:** custom-modes-template
- **Trigger:** Section 10
- **Expected:** Explain how to create a custom mode; document every field in the template YAML frontmatter schema
- **Verify:** A reader can create a working custom mode from scratch using only this section

#### Content:
- How to create: `kata init-mode <name>` → creates template file + registers in kata.yaml
- Or: write template manually → `kata register-mode <path>`
- Full frontmatter schema:

```yaml
---
id: <string>                # Mode identifier (matches kata.yaml key)
name: <string>              # Human-readable mode name
description: <string>       # Brief description
mode: <string>              # Alias for id (used for display)
phases:
  - id: <string>            # Phase ID (e.g. p0, p1)
    name: <string>          # Phase name (e.g. "Research")
    task_config:
      title: <string>       # Title for the native task created via TaskCreate
      labels: [string]      # Optional task labels
    steps:                  # Ordered sub-steps Claude follows within this phase
      - id: <string>        # Step identifier
        title: <string>     # Step title shown in TaskCreate
        instruction: |      # Freeform markdown instructions for Claude
          ...
    depends_on: [<phase-id>]  # Phases that must complete before this one

# Optional: global rules injected via prime
rules:
  - <string>
---
```

- Document that the `steps` array is what creates the sub-tasks inside each phase
- `task_config.title` becomes the TaskCreate title visible in the task list
- Reference batteries templates (`batteries/templates/planning.md`, `batteries/templates/implementation.md`) as real-world examples of the full schema in use

---

### B11: Batteries System

**Core:**
- **ID:** batteries-system
- **Trigger:** Section 11
- **Expected:** Explains what batteries scaffolds (table), initial setup use case, and upgrade use case
- **Verify:** Reader understands when to run `kata batteries` vs `kata batteries --update`

#### Content:
- **Initial scaffold**: Run once at project setup (or via `kata setup --batteries`). Creates starter templates, agent definitions, spec-templates, interviews.yaml, etc.
- **Files scaffolded** (table: source → destination → what it is)
- **Upgrade**: After `npm update @codevibesmatter/kata`, run `kata batteries --update` to overwrite project templates with the latest package versions. Existing project customizations are overwritten — commit first.
- Note: batteries-seeded templates are the project's to own; kata doesn't reference package templates at runtime

---

### B12: Architecture

**Core:**
- **ID:** architecture-section
- **Trigger:** Section 12
- **Expected:** Source layout table, runtime data layout table (`.kata/` only), brief eval harness mention
- **Verify:** A contributor can orient themselves to the codebase from this section alone

#### Content:
- Source layout table from CLAUDE.md (already accurate)
- Runtime `.kata/` layout (directories and what they contain)
- Hook registration in `.claude/settings.json` (Claude-owned)
- Brief eval mention: "An agentic eval harness in `eval/` drives Claude agents through kata scenarios with real tool execution, used for regression testing. See `eval/README.md` for details." (or similar)

---

## Non-Goals

- No programmatic API documentation
- No testing utilities documentation
- No `.claude/` legacy layout documentation (beyond a brief backwards-compat note)
- No detailed eval harness usage docs (brief mention only)
- No installation from source / contributing guide

## Open Questions

- [ ] Should `kata teardown` be in the core 8 or the grouped table? (Leaning: grouped table — it's a rarely-used admin command)
- [ ] Does the Architecture section need a diagram, or is the source layout table sufficient?

## Implementation Phases

See YAML frontmatter `phases:` above.

## Verification Plan

### VP1: TOC completeness
Steps:
1. Render README in GitHub (or `gh browse`)
   Expected: All 14 TOC sections render as anchor links; every section exists in the document

### VP2: Mermaid diagrams
Steps:
1. View README on GitHub
   Expected: All three mermaid blocks (mode lifecycle, planning→impl, hook chain) render as diagrams, not raw code blocks

### VP3: Quick start walkthrough
Steps:
1. Follow the Quick Start section in a fresh project
   Expected: Commands produce the output shown in the README; no steps fail or produce unexpected output

### VP4: Command flag coverage
Steps:
1. Run `kata --help` and compare each flag against the README
   Expected: Every flag documented in the README matches actual CLI output; no undocumented flags for core 8 commands

### VP5: Template schema accuracy
Steps:
1. Compare documented frontmatter fields against `src/yaml/` and `batteries/templates/`
   Expected: Every field in the spec appears in actual code; no phantom fields documented
