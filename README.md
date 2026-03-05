# @codevibesmatter/kata

Structured workflow CLI for [Claude Code](https://claude.ai/claude-code). Wraps sessions with modes, phase task enforcement, and a stop hook that blocks exit until phases are done.

## Table of Contents

1. [What kata does](#what-kata-does)
2. [Install](#install)
3. [Quick start](#quick-start)
4. [Built-in modes](#built-in-modes)
5. [How it works](#how-it-works)
   - [Mode lifecycle](#mode-lifecycle)
   - [Context injection](#context-injection)
   - [Planning → Implementation pipeline](#planning--implementation-pipeline)
   - [Hook chain](#hook-chain)
6. [Stop conditions](#stop-conditions)
7. [Command reference](#command-reference)
   - [Core commands](#core-commands)
   - [Other commands](#other-commands)
8. [Hooks reference](#hooks-reference)
9. [Configuration (kata.yaml)](#configuration-katayaml)
10. [Custom modes](#custom-modes)
11. [Batteries system](#batteries-system)
12. [Architecture](#architecture)
13. [Comparison to similar tools](#comparison-to-similar-tools)
14. [License](#license)

---

## What kata does

Claude sessions are unstructured by default. The agent can answer, stop, and close the session at any time — even mid-task, mid-phase, or before committing work.

**kata enforces that sessions complete.** When you enter a mode, kata creates native phase tasks with dependency chains. A stop hook intercepts every attempt to end the session and blocks exit until all phase tasks are done, work is committed, and any additional stop conditions are met.

Three concrete benefits:

- **Phase tasks auto-created** — `kata enter planning` creates the research → spec → review → approved task chain. Claude sees these via `TaskList` and follows them in order.
- **Stop hook blocks early exit** — Claude cannot end the session until all tasks are complete. No skipping the verify phase. No stopping before committing.
- **Session state survives context compaction** — mode, phase, and workflow ID are persisted to disk. Long sessions don't lose their place when the context window rolls over.

---

## Install

```bash
npm install --save-dev @codevibesmatter/kata
```

Or globally:

```bash
npm install -g @codevibesmatter/kata
```

---

## Quick start

**1. Install kata**

```bash
npm install --save-dev @codevibesmatter/kata
```

**2. Set up kata in your project**

Tell Claude:

> Set up kata for this project

Claude runs `kata setup`, registers the stop hook and session hooks in `.claude/settings.json`, and configures `.kata/kata.yaml` for your project. Alternatively, run `kata enter onboard` yourself — this starts the agent-guided onboarding walkthrough.

**3. Enter a mode**

For planning work linked to a GitHub issue:

```bash
kata enter planning --issue=42
```

For a small self-contained task (no issue required):

```bash
kata enter task
```

Phase tasks appear immediately in Claude's task list with dependency chains already set up.

**4. Work through the phases**

Claude follows the task dependency chain. Each phase must complete before the next unlocks. The stop hook silently blocks any attempt to end the session early.

**5. Check exit readiness and exit**

```bash
kata can-exit
# All stop conditions met — ready to exit

kata exit
```

If `kata can-exit` reports unmet conditions (pending tasks, uncommitted changes, tests failing), address them and check again.

---

## Built-in modes

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

**Mode aliases:**

- `task` → also: `chore`, `small`
- `debug` → also: `investigate`
- `freeform` → also: `question`, `ask`, `help`, `qa`

`--issue=N` is required for `planning` and `implementation`. It is optional for all other modes.

---

## How it works

### Mode lifecycle

_(content coming in subsequent phases)_

### Context injection

_(content coming in subsequent phases)_

### Planning → Implementation pipeline

_(content coming in subsequent phases)_

### Hook chain

_(content coming in subsequent phases)_

---

## Stop conditions

_(content coming in subsequent phases)_

---

## Command reference

### Core commands

#### `kata enter`

Starts a mode session. Creates native phase tasks with dependency chains so Claude sees exactly what to do and in what order.

```
kata enter <mode> [--issue=N] [--template=PATH] [--dry-run]
```

| Flag | Description |
|------|-------------|
| `--issue=N` | Link to GitHub issue N. Required for `planning` and `implementation`. |
| `--template=PATH` | Use a custom template file for this session instead of the mode default. |
| `--dry-run` | Preview what tasks would be created without writing anything. |

Example — entering planning mode linked to issue #42:

```
$ kata enter planning --issue=42
Building phase tasks for workflow: GH#42
  Created step task: p0:read-spec
  Created step task: p0:verify-environment
  Created step task: p1:research-problem
  Created step task: p1:document-findings
  Created step task: p2:write-spec
  Created step task: p2:spec-review
  Created step task: p2:spec-approved
  Created step task: p3:implementation-plan
  Created step task: p3:review-plan
  Created step task: p4:commit-and-push
  Created step task: p4:verify-done
  Created step task: p4:close-issue
Native tasks written: ~/.claude/tasks/a1b2c3d4-e5f6-7890-abcd-ef1234567890/ (12 tasks)
```

---

#### `kata exit`

Exits the current mode and marks the session closed. Run this after `kata can-exit` reports all stop conditions met.

```
kata exit [--session=ID]
```

Session state is persisted to disk after exit and can be inspected afterward. Use `--session=ID` when calling from outside the active Claude session (e.g., from a script).

---

#### `kata status`

Shows the current session's mode, phase, workflow ID, and metadata.

```
kata status [--json]
```

Text output:

```
Mode: implementation
Phase: p1
Workflow ID: GH#42
Issue: #42
Entered: 2026-03-05T17:02:02Z
```

JSON output (`--json`):

```json
{
  "sessionId": "964b1ba9-b78f-40fa-8e95-7cda6a6a530f",
  "sessionType": "implementation",
  "currentMode": "implementation",
  "currentPhase": "p1",
  "completedPhases": [],
  "workflowId": "GH#32",
  "issueNumber": 32,
  "template": "implementation.md",
  "phases": ["p1","p2","p3","p4"],
  "enteredAt": "2026-03-05T17:02:02.936Z"
}
```

---

#### `kata can-exit`

Checks whether all stop conditions for the current mode are met. Use this before `kata exit`.

```
kata can-exit [--json]
```

Blocked (text):

```
✗ Cannot exit:
  2 task(s) still pending
    - [8] GH#42: P2.2 - Core Reference Sections
    - [9] GH#42: P2.2: TEST
  Changes not committed
```

Passing (text):

```
✓ All stop conditions met — ready to exit
```

JSON output (`--json`):

```json
{
  "canExit": false,
  "reasons": ["2 task(s) still pending", "Changes not committed"],
  "guidance": {
    "nextStepMessage": "Complete all pending tasks and commit your changes before exiting.",
    "escapeHatch": "If you need to exit anyway, use kata exit --force (not recommended)."
  }
}
```

---

#### `kata link`

Associates or removes a GitHub issue from the current session.

```
kata link [<issue>] [--show] [--clear]
```

| Invocation | Description |
|------------|-------------|
| `kata link 42` | Associate issue #42 with the current session |
| `kata link --show` | Print the currently linked issue number |
| `kata link --clear` | Remove the issue association from the session |

---

#### `kata doctor`

Diagnoses the kata installation and session state.

```
kata doctor [--fix] [--json]
```

Checks performed:

| Check | What it verifies |
|-------|-----------------|
| `sessions_dir` | Session state directory exists and is readable |
| `hooks_registered` | All expected hooks are present in `.claude/settings.json` |
| `native_tasks` | Native task directory structure is intact |
| `session_cleanup` | No orphaned or excessively stale session files |
| `version` | Installed kata version matches project expectations |

`--fix` auto-repairs common issues: re-registers missing hooks, creates missing directories, removes stale session files.

Run `kata doctor` when hooks stop firing, after manual edits to `.claude/settings.json`, or to diagnose unexpected session behavior.

---

#### `kata batteries`

Seeds the project with kata config files, mode templates, agent definitions, and spec stubs.

```
kata batteries [--update]
```

Files scaffolded:

| Source | Destination | Contents |
|--------|-------------|----------|
| `batteries/kata.yaml` | `.kata/kata.yaml` | Project config (project name, commands, spec paths, mode overrides) |
| `batteries/templates/*.md` | `.kata/templates/*.md` | Mode templates for all 8 built-in modes |
| `batteries/agents/` | `.claude/agents/` | Agent definitions (review-agent, impl-agent, etc.) |
| `batteries/spec-templates/` | `planning/spec-templates/` | Spec document stubs |
| `batteries/interviews.yaml` | `.kata/interviews.yaml` | Onboard interview questions |
| `batteries/subphase-patterns.yaml` | `.kata/subphase-patterns.yaml` | Phase pattern definitions |

`--update` overwrites existing project files with the latest versions from the installed package. Use this after `npm update @codevibesmatter/kata`. Commit your customizations first — `--update` overwrites them.

---

#### `kata setup`

Registers hooks and initializes the `.kata/` directory structure for a project.

```
kata setup [--strict] [--batteries] [--yes]
```

What it creates:

- Registers `SessionStart`, `UserPromptSubmit`, `Stop`, and `mode-gate` hooks in `.claude/settings.json`
- Creates the `.kata/` directory
- Writes `.kata/kata.yaml` with project defaults

| Flag | Description |
|------|-------------|
| `--strict` | Also registers `PreToolUse` hooks: `task-deps` and `task-evidence`. Enforces task dependency ordering and requires uncommitted git changes as evidence before completing tasks. |
| `--batteries` | Also runs the batteries scaffold after setup. Implies `--yes`. |
| `--yes` | Non-interactive — accept all defaults without prompting. |

For a guided walkthrough, run `kata enter onboard` instead. This starts an agent-guided session that interviews you about your project and configures kata interactively.

### Other commands

| Command | Flags | Description |
|---------|-------|-------------|
| `kata prime` | `[--session=ID] [--hook-json]` | Output context injection block used by the `SessionStart` hook to inject mode template, session state, and rules into Claude's context |
| `kata suggest <message>` | | Detect mode intent from a message and output guidance on which mode to enter |
| `kata hook <name>` | | Dispatch a named hook event; used internally by `.claude/settings.json` hook commands |
| `kata modes` | | List available modes from `kata.yaml` with names, aliases, and stop conditions |
| `kata init` | `[--session=ID] [--force]` | Initialize session state; `--force` resets existing state |
| `kata teardown` | `[--yes] [--all] [--dry-run]` | Remove kata hooks and config from the project |
| `kata config` | `[--show]` | Show resolved `kata.yaml` config with provenance (project vs. defaults) |
| `kata validate-spec` | `--issue=N \| path.md` | Validate a spec file's phase format and required sections |
| `kata validate-template` | `<path> [--json]` | Validate a template file's YAML frontmatter and structure |
| `kata init-mode` | `<name>` | Create a new mode — generates a template file and registers it in `modes.yaml` |
| `kata register-mode` | `<template-path>` | Register an existing template file as a mode in `modes.yaml` |
| `kata init-template` | `<path>` | Create a new blank template file with required frontmatter |
| `kata check-phase` | `<phase-id> [--issue=N] [--force]` | Run per-phase process gates for the specified phase |
| `kata review` | `--prompt=<name> [--provider=P]` | Run an ad-hoc agent review using a named review prompt |
| `kata prompt` | `[--session=ID]` | Output the current mode's rendered prompt |
| `kata postmortem` | | Run session postmortem analysis on the completed session |
| `kata projects` | `[list\|add\|remove\|init\|sync]` | Multi-project management subcommands |
| `kata providers` | `[list\|setup] [--json]` | Check or configure agent providers |

---

## Hooks reference

Hooks are shell commands registered in `.claude/settings.json` that Claude Code fires at specific lifecycle events. Each hook calls `kata hook <name>`, which reads the event JSON from stdin and writes a decision JSON to stdout.

### Hook event table

| Event | Command | When it fires | What it does |
|-------|---------|---------------|--------------|
| `SessionStart` | `kata hook session-start` | Every new Claude conversation | Initializes session registry; injects mode template, session state, and rules into Claude's context via `kata prime` |
| `UserPromptSubmit` | `kata hook user-prompt` | Every user message | Detects mode intent from message text; suggests `kata enter <mode>` if no mode is active |
| `PreToolUse` (mode-gate) | `kata hook mode-gate` | Every tool call | Blocks file writes when no kata mode is active; also injects `--session=ID` into kata bash commands |
| `PreToolUse` (task-deps) | `kata hook task-deps` | `TaskUpdate` calls | Enforces task dependency ordering — blocks completing a task if its dependencies are not yet done (strict mode only) |
| `PreToolUse` (task-evidence) | `kata hook task-evidence` | `TaskUpdate` "completed" calls | Requires uncommitted git changes as evidence before a task can be marked complete (strict mode only) |
| `Stop` | `kata hook stop-conditions` | When Claude tries to end the session | Checks all stop conditions for the current mode; blocks exit and lists unmet conditions if any remain |

### Registration tiers

**Always registered** (by `kata setup`): `session-start`, `user-prompt`, `stop-conditions`, `mode-gate`

**Strict mode only** (`kata setup --strict`): `task-deps`, `task-evidence`

Note: `mode-gate` is always registered — not just in strict mode — because it also resolves `--session=ID` for all `kata` bash commands. This session ID forwarding is required for any hook-invoked subcommand to find the correct session state.

### Hook flow

```
User message
    │
    ▼
UserPromptSubmit ──► kata hook user-prompt
    │                  Detect mode intent → suggest kata enter
    │
    ▼
Claude tool call
    │
    ▼
PreToolUse ──────► kata hook mode-gate
    │                  Block writes if no mode active
    │                  Inject --session=ID into kata commands
    │
    ├──────────────► kata hook task-deps      (strict mode only)
    │                  Enforce dependency ordering
    │
    └──────────────► kata hook task-evidence  (strict mode only)
                       Require git evidence before completing task
    │
    ▼
Claude Stop event
    │
    ▼
Stop ─────────────► kata hook stop-conditions
                       Check tasks_complete, committed, pushed, etc.
                       Block exit if any condition unmet
```

---

## Configuration (kata.yaml)

`kata.yaml` is the single configuration file for a kata-managed project, living at `.kata/kata.yaml`. It controls project commands, path conventions, stop condition behavior, reviews, and project-level mode overrides.

### Annotated example

```yaml
project:
  name: my-project           # Display name shown in kata status
  build_command: npm run build      # Run before typecheck in TEST phase
  test_command: npm test            # Used by tests_pass stop condition
  typecheck_command: npm run typecheck  # Run in TEST phase
  smoke_command: null               # Optional quick smoke test
  diff_base: origin/main            # Branch to diff against for feature_tests_added
  test_file_pattern: "**/*.test.ts" # Glob to identify test files
  ci: null                          # CI system (optional)
  dev_server_command: null          # Dev server command (optional)
  dev_server_health: null           # Health check URL (optional)

spec_path: planning/specs           # Where spec files live (spec N-slug.md)
research_path: planning/research    # Where research outputs are saved
session_retention_days: 7           # How long to keep completed session state

non_code_paths:                     # Paths excluded from code-change checks
  - .claude
  - .kata
  - planning

reviews:
  spec_review: false                # Enable spec review agent in planning mode
  code_review: false                # Enable code review agent in implementation mode
  spec_reviewer: null               # Reviewer provider name
  code_reviewer: null               # Reviewer provider name

providers:
  default: claude                   # Default agent provider
  available: [claude]               # Available providers

global_rules: []                    # Rules injected into all mode templates via prime
task_rules:                         # Rules injected when mode has phases
  - "Tasks are pre-created by kata enter. Do NOT create new tasks with TaskCreate."
  - "Run TaskList FIRST to discover pre-created tasks and their dependency chains."

modes:                              # Project-level mode overrides (merged with built-ins)
  my-custom-mode:
    template: my-mode.md
    stop_conditions: [tasks_complete, committed]
    issue_handling: none            # "required" | "none"
    issue_label: feature
    name: "My Custom Mode"
    description: "..."
    workflow_prefix: "MC"           # 2-letter prefix for workflow IDs
    intent_keywords:
      - "my custom task"
    aliases:
      - "custom"
```

### Field reference

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `project.name` | string | `""` | Display name for the project |
| `project.build_command` | string | null | Build command run before typecheck in the TEST phase |
| `project.test_command` | string | null | Test command used by the `tests_pass` stop condition |
| `project.typecheck_command` | string | null | Typecheck command run in the TEST phase |
| `project.smoke_command` | string | null | Optional quick smoke test command |
| `project.diff_base` | string | `origin/main` | Branch to diff against for the `feature_tests_added` stop condition |
| `project.test_file_pattern` | string | `**/*.test.ts` | Glob pattern used to identify test files |
| `spec_path` | string | `planning/specs` | Directory where spec files are written (`spec N-slug.md`) |
| `research_path` | string | `planning/research` | Directory where research outputs are saved |
| `session_retention_days` | number | `7` | Days to retain completed session state files before cleanup |
| `non_code_paths` | string[] | `[.claude, .kata, planning]` | Paths excluded from code-change checks (e.g., `feature_tests_added`) |
| `reviews.spec_review` | boolean | `false` | Enable the spec review agent in planning mode |
| `reviews.code_review` | boolean | `false` | Enable the code review agent in implementation mode |
| `reviews.spec_reviewer` | string | null | Provider name for spec review |
| `reviews.code_reviewer` | string | null | Provider name for code review |
| `global_rules` | string[] | `[]` | Rules injected into every mode's context via `kata prime` |
| `task_rules` | string[] | see above | Rules injected when the active mode has phases (task tracking) |
| `modes` | object | `{}` | Project-level mode definitions merged over the built-in mode set; project definitions take precedence |

---

## Custom modes

_(content coming in subsequent phases)_

---

## Batteries system

_(content coming in subsequent phases)_

---

## Architecture

_(content coming in subsequent phases)_

---

## Comparison to similar tools

The Claude Code ecosystem has several workflow and memory tools. Here's how `kata` fits in.

### Beads (`@beads/bd`)
**[github.com/steveyegge/beads](https://github.com/steveyegge/beads)**

The most influential tool in this space. A git-backed task tracker with a dependency graph — JSONL files in `.beads/`, hash-based IDs to prevent merge conflicts, `bd ready` to surface only unblocked work. Solves "agent amnesia": agents lose all context of prior work between sessions. Anthropic's native `TaskCreate`/`TaskUpdate` system was directly inspired by beads.

**vs `kata`:** Complementary, not competitive. Beads is project-level memory across sessions (days/weeks); `kata` is session-level enforcement within a single session. They stack well — beads tracks what needs doing across the project, `kata` enforces how a single session executes.

---

### RIPER Workflow
**[github.com/tony/claude-code-riper-5](https://github.com/tony/claude-code-riper-5)**

Five-phase structured development: Research → Innovate → Plan → Execute → Review. Enforces phases through **capability restrictions** — in Research mode Claude has read-only access so it can't prematurely write code.

**vs `kata`:** Closest conceptual match. Both enforce named phases in sequence. Key difference: RIPER gates at the *capability* level (what Claude can do in each phase); `kata` gates at the *exit* level (Claude can do anything, but can't stop until phases are done).

---

### Claude Task Master
**[github.com/eyaltoledano/claude-task-master](https://github.com/eyaltoledano/claude-task-master)**

Parses PRDs into structured tasks using AI via MCP. Handles full task lifecycle with subtask expansion and status tracking.

**vs `kata`:** Task Master is about *creating* a backlog from requirements; `kata` is about *enforcing* that the current session's tasks complete. Different problem.

---

### Summary

| Tool | Core problem | Enforcement | Scope |
|------|-------------|-------------|-------|
| [beads](https://github.com/steveyegge/beads) | Agent amnesia / task tracking | None — agent decides | Project (weeks) |
| [RIPER](https://github.com/tony/claude-code-riper-5) | Phase discipline | Capability gating per phase | Session |
| [Task Master](https://github.com/eyaltoledano/claude-task-master) | PRD → structured backlog | None | Project |
| **kata** | **Session phase enforcement** | **Stop hook blocks exit** | **Session** |

`kata`'s unique position: the only tool focused on *enforcing that sessions complete correctly* via the Stop hook, rather than helping plan or remember work.

---

## License

MIT
