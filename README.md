# @codevibesmatter/wm

Workflow management CLI for [Claude Code](https://claude.ai/claude-code). Adds structured session modes, phase tracking, and stop-condition enforcement to your AI coding sessions.

## What it does

Without `wm`, Claude sessions are unstructured — the agent can stop at any time, skip phases, or lose context. `wm` wraps your Claude Code project with:

- **Modes** — named workflows (planning, implementation, research, etc.) with predefined phases
- **Native task tracking** — phase tasks created automatically via Claude's task system
- **Stop hooks** — blocks the session from ending until all phase tasks are complete
- **Session continuity** — state survives context compaction, works across long sessions

## Install

```bash
npm install -g @codevibesmatter/wm
```

Or per-project:

```bash
npm install --save-dev @codevibesmatter/wm
```

## Quick setup

Run once in your project root:

```bash
wm setup --yes
```

This auto-detects your project name, registers three hooks in `.claude/settings.json`, and creates a `wm.yaml` config file. Start a new Claude Code session and it picks up automatically.

## Usage

```bash
wm enter planning          # Enter a mode (creates phase tasks)
wm status                  # Show current mode and phase
wm can-exit                # Check if all phase tasks are complete
wm exit                    # Exit current mode
wm prime                   # Output context injection block (for prompts)
wm doctor                  # Diagnose session state
```

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
wm enter planning
wm enter implementation
wm enter implementation --issue=123    # Link to a GitHub issue
```

On entry, `wm` creates native tasks for each phase with dependency chains. Claude sees these in `TaskList` and follows them in order.

### Checking progress

```bash
wm status
# Mode: implementation
# Phase: p1
# Workflow ID: IMPL-0123-0219

wm can-exit
# ✗ Cannot exit:
#   2 task(s) still pending
#     - [2] IMPL-0123-0219: P1: Implement
#     - [3] IMPL-0123-0219: P2: Verify
```

### Stop hook

When Claude tries to stop, the Stop hook calls `wm hook stop-conditions`. If there are incomplete tasks, Claude receives a BLOCK signal with a summary of what's left. The session won't end until the agent completes all phase tasks.

## Configuration

`wm setup` creates `.claude/workflows/wm.yaml`:

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
wm init-template /tmp/my-workflow.md --phases=3
wm enter --template=/tmp/my-workflow.md
```

Register a template as a permanent mode:

```bash
wm init-mode code-review --phases=4
wm enter code-review
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

Add a `.claude/workflows/modes.yaml` to your project to define custom modes alongside or instead of the built-in ones. `wm` merges project modes with the built-in set, with project modes taking precedence.

## How the hooks work

`wm setup` registers three hooks in `.claude/settings.json`:

| Hook | Command | What it does |
|------|---------|--------------|
| `SessionStart` | `wm hook session-start` | Initializes session registry, injects available modes into context |
| `UserPromptSubmit` | `wm hook user-prompt` | Detects mode intent from the user's message, suggests entering a mode |
| `Stop` | `wm hook stop-conditions` | Blocks session end if phase tasks are incomplete |

## Troubleshooting

```bash
wm doctor           # Diagnose hooks, config, session state
wm doctor --fix     # Auto-fix common issues

wm init --force     # Hard-reset session state
wm teardown --yes   # Remove all wm hooks and config
```

## License

MIT
