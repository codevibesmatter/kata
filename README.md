# @codevibesmatter/kata

Structured workflow CLI for [Claude Code](https://claude.ai/claude-code). Adds session modes, phase tracking, and stop-condition enforcement to your AI coding sessions.

## What it does

Without `kata`, Claude sessions are unstructured — the agent can stop at any time, skip phases, or lose context. `kata` wraps your Claude Code project with:

- **Modes** — named workflows (planning, implementation, research, etc.) with predefined phases
- **Native task tracking** — phase tasks created automatically via Claude's task system
- **Stop hooks** — blocks the session from ending until all phase tasks are complete
- **Session continuity** — state survives context compaction, works across long sessions

## Install

```bash
npm install --save-dev @codevibesmatter/kata
```

Or globally:

```bash
npm install -g @codevibesmatter/kata
```

## Getting started

After installing, prompt Claude:

> run `npx kata setup` — do not use `--yes`, this starts an interactive setup interview

Claude will run the setup command, which registers hooks and enters the guided setup interview mode. Claude will walk you through configuring the project and ask questions along the way.

## Usage

```bash
kata enter planning          # Enter a mode (creates phase tasks)
kata status                  # Show current mode and phase
kata can-exit                # Check if all phase tasks are complete
kata exit                    # Exit current mode
kata prime                   # Output context injection block (for prompts)
kata doctor                  # Diagnose session state
```

Add to `package.json` scripts for shorthand access:

```json
"scripts": {
  "kata": "kata"
}
```

Then use `pnpm kata <cmd>` or `npm run kata <cmd>`.

### Built-in modes

| Mode | Description |
|------|-------------|
| `planning` | Research → spec → review → finalize |
| `implementation` | Claim → implement → verify → close |
| `research` | Explore → synthesize findings |
| `task` | Combined planning + implementation for small tasks |
| `freeform` | Quick questions, no phase structure |
| `setup` | Guided project configuration interview |

### Entering a mode

```bash
kata enter planning
kata enter implementation
kata enter implementation --issue=123    # Link to a GitHub issue
```

On entry, `kata` creates native tasks for each phase with dependency chains. Claude sees these in `TaskList` and follows them in order.

### Checking progress

```bash
kata status
# Mode: implementation
# Phase: p1
# Workflow ID: IMPL-0123-0219

kata can-exit
# ✗ Cannot exit:
#   2 task(s) still pending
#     - [2] IMPL-0123-0219: P1: Implement
#     - [3] IMPL-0123-0219: P2: Verify
```

### Stop hook

When Claude tries to stop, the Stop hook calls `kata hook stop-conditions`. If there are incomplete tasks, Claude receives a BLOCK signal with a summary of what's left. The session won't end until the agent completes all phase tasks.

## Configuration

`kata setup` creates `.claude/workflows/wm.yaml`:

```yaml
project:
  name: my-project
  test_command: npm test

spec_path: planning/specs
research_path: planning/research
session_retention_days: 7

reviews:
  spec_review: false
  code_review: false
  code_reviewer: null
```

## Custom modes

Create a one-off session from a template:

```bash
kata enter --template=/tmp/my-workflow.md
```

Templates are Markdown files with YAML frontmatter defining phases:

```markdown
---
id: code-review
name: "Code Review"
phases:
  - id: p0
    name: Read
    task_config:
      title: "P0: Read the diff"
  - id: p1
    name: Findings
    task_config:
      title: "P1: Document findings"
      depends_on: [p0]
---

# Code Review Mode

...instructions for Claude...
```

## Project-level mode overrides

Add a `.claude/workflows/modes.yaml` to define custom modes alongside or instead of the built-in ones. `kata` merges project modes with the built-in set, with project modes taking precedence.

## How the hooks work

`kata setup` registers three hooks in `.claude/settings.json`:

| Hook | Command | What it does |
|------|---------|--------------|
| `SessionStart` | `kata hook session-start` | Initializes session registry, injects available modes into context |
| `UserPromptSubmit` | `kata hook user-prompt` | Detects mode intent from the user's message, suggests entering a mode |
| `Stop` | `kata hook stop-conditions` | Blocks session end if phase tasks are incomplete |

## Troubleshooting

```bash
kata doctor           # Diagnose hooks, config, session state
kata doctor --fix     # Auto-fix common issues

kata init --force     # Hard-reset session state
kata teardown --yes   # Remove all kata hooks and config
```

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

## License

MIT
