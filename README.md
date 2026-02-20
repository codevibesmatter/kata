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

## Comparison to similar tools

The Claude Code ecosystem has several workflow and memory tools. Here's how `wm` fits in.

### Beads (`@beads/bd`)
**[github.com/steveyegge/beads](https://github.com/steveyegge/beads)**

The most influential tool in this space. A git-backed task tracker with a dependency graph — JSONL files in `.beads/`, hash-based IDs to prevent merge conflicts, `bd ready` to surface only unblocked work. Solves "agent amnesia": agents lose all context of prior work between sessions. Anthropic's native `TaskCreate`/`TaskUpdate` system was directly inspired by beads.

**vs `wm`:** Complementary, not competitive. Beads is project-level memory across sessions (days/weeks); `wm` is session-level enforcement within a single session. They stack well — beads tracks what needs doing across the project, `wm` enforces how a single session executes.

---

### beads_viewer (`bv`)
**[github.com/Dicklesworthstone/beads_viewer](https://github.com/Dicklesworthstone/beads_viewer)**

A Go TUI that reads beads data and computes graph analytics: PageRank, betweenness centrality, critical path, kanban view. Live-reloads on `.beads/beads.jsonl`. Has `--robot-*` JSON flags for programmatic agent access. Purely a visualization layer on top of beads.

**vs `wm`:** No overlap. `wm` has no visualization component.

---

### RIPER Workflow
**[github.com/tony/claude-code-riper-5](https://github.com/tony/claude-code-riper-5)**

Five-phase structured development: Research → Innovate → Plan → Execute → Review. Enforces phases through **capability restrictions** — in Research mode Claude has read-only access so it can't prematurely write code. Implemented via slash commands (`/riper:research`, `/riper:execute`) and specialized subagents per phase.

**vs `wm`:** Closest conceptual match. Both enforce named phases in sequence. Key difference: RIPER gates at the *capability* level (what Claude can do in each phase); `wm` gates at the *exit* level (Claude can do anything, but can't stop until phases are done). RIPER enforces a fixed 5-phase flow; `wm` is configurable with any template.

---

### Claude Task Master
**[github.com/eyaltoledano/claude-task-master](https://github.com/eyaltoledano/claude-task-master)**

Parses PRDs into structured tasks using AI (Claude, GPT-4, Gemini, etc.) via MCP. Handles full task lifecycle with subtask expansion and status tracking. Designed for Cursor AI but works with Claude Code.

**vs `wm`:** Task Master is about *creating* a backlog from requirements; `wm` is about *enforcing* that the current session's tasks complete. Different problem. Task Master requires MCP setup; `wm` needs only hooks.

---

### Simone
**[github.com/Helmi/claude-simone](https://github.com/Helmi/claude-simone)**

Convention-based project and task management via structured prompts and activity tracking, optimized for AI-assisted development. Has a legacy directory-based system and a newer MCP server.

**vs `wm`:** Simone is convention-based (Claude *should* follow the structure); `wm` is enforcement-based (Claude *cannot stop* without completing phases). Simone has no stop hook equivalent.

---

### claude-mem
**[github.com/thedotmack/claude-mem](https://github.com/thedotmack/claude-mem)**

Automatic context preservation using SQLite + Chroma vector DB. Hooks capture everything Claude does during a session, compress it with AI, and semantically retrieve relevant context at the start of the next session. Claims ~10x token savings vs. injecting full transcripts.

**vs `wm`:** Pure memory/continuity — no phase enforcement, no stop hooks. Solves agent amnesia with semantic search rather than structured tasks. `wm` does light session continuity via state files but nothing close to claude-mem's semantic retrieval.

---

### qlaude
**[github.com/starsh2001/qlaude](https://github.com/starsh2001/qlaude)**

Queue-based prompt automation with Telegram notifications. Stack multiple prompts; as Claude finishes each one, qlaude auto-fires the next. Detects Claude's idle/working/waiting states via PTY analysis. For unattended batch work.

**vs `wm`:** Different axis. qlaude handles *between-session* orchestration (keep Claude working while you're away); `wm` handles *within-session* structure (enforce phases during a session). qlaude asks "is Claude done?"; `wm` asks "has Claude done the *right* things?".

---

### claude-flow
**[github.com/ruvnet/claude-flow](https://github.com/ruvnet/claude-flow)**

Enterprise multi-agent swarm platform. 60+ specialized agents (coders, testers, architects, security auditors) coordinated via queen-led hierarchy with consensus algorithms. Vector memory for cross-agent knowledge sharing, WebAssembly for sub-1ms routing, 6 LLM providers with failover.

**vs `wm`:** Different category entirely. claude-flow is infrastructure for deploying agent swarms at scale; `wm` is a lightweight discipline layer for a single developer using a single Claude session.

---

### Summary

| Tool | Core problem | Enforcement | Scope |
|------|-------------|-------------|-------|
| [beads](https://github.com/steveyegge/beads) | Agent amnesia / task tracking | None — agent decides | Project (weeks) |
| [beads_viewer](https://github.com/Dicklesworthstone/beads_viewer) | Visualizing task dependencies | N/A | Visualization |
| [RIPER](https://github.com/tony/claude-code-riper-5) | Phase discipline, no premature coding | Capability gating per phase | Session |
| [Task Master](https://github.com/eyaltoledano/claude-task-master) | PRD → structured backlog | None | Project |
| [Simone](https://github.com/Helmi/claude-simone) | AI project understanding | Convention only | Project |
| [claude-mem](https://github.com/thedotmack/claude-mem) | Context continuity | None | Cross-session |
| [qlaude](https://github.com/starsh2001/qlaude) | Unattended batch execution | None | Between sessions |
| [claude-flow](https://github.com/ruvnet/claude-flow) | Multi-agent swarm coordination | None | Enterprise |
| **wm** | **Session phase enforcement** | **Stop hook blocks exit** | **Session** |

`wm`'s unique position: the only tool focused on *enforcing that sessions complete correctly* via the Stop hook, rather than helping plan or remember work. RIPER is the closest cousin, but gates on capability (what Claude can do) rather than exit (whether Claude can stop).

## License

MIT
