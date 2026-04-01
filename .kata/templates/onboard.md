---
id: onboard
name: "Onboard"
description: "Configure kata for a new project via guided interview"
category: system
phases:
  - id: p0
    name: "Bootstrap"
    description: "Create .claude/ directory and verify prerequisites"
    task_config:
      title: "P0: Bootstrap — verify Node.js, native tasks, and create .claude/"
    tasks:
      - "Verify Node.js >= 18 is installed"
      - "Check CLAUDE_CODE_ENABLE_TASKS is enabled (see ## Native Tasks Check below)"
      - "Create .claude/ directory if it does not exist"
      - "Check if kata is already configured (kata.yaml exists)"
  - id: p1
    name: "Setup Style"
    description: "Ask batteries-included vs custom — first question, determines the rest"
    task_config:
      title: "P1: Setup Style — quick (batteries) or custom interview?"
      depends_on: [p0]
    tasks:
      - "AskUserQuestion: Quick setup (batteries-included, all defaults) or custom interview?"
      - "If quick: confirm project name from package.json, then skip to p4"
      - "If custom: continue through p2 and p3"
  - id: p2
    name: "Project Discovery"
    description: "Auto-detect project settings and ask for confirmation (custom path only)"
    task_config:
      title: "P2: Project Discovery — confirm name, test command, CI"
      depends_on: [p1]
    tasks:
      - "AskUserQuestion: Detect project name from package.json — is '{detected_name}' correct?"
      - "AskUserQuestion: Detected test command '{test_command}' — accept or override?"
      - "AskUserQuestion: Detected CI system '{ci_system}' — accept or override?"
  - id: p3
    name: "Custom Configuration"
    description: "Review settings, mode paths, and strict hooks (custom path only)"
    task_config:
      title: "P3: Custom Configuration — review, paths, strict hooks"
      depends_on: [p2]
    tasks:
      - "AskUserQuestion: Enable spec review before implementation? (default: no)"
      - "AskUserQuestion: Enable code review? If yes, which external reviewer? (codex/gemini/none — see ## External Review Setup below)"
      - "AskUserQuestion: Testing & verification toolchain (see ## Testing & Verification Setup below)"
      - "AskUserQuestion: Spec files path? (default: planning/specs)"
      - "AskUserQuestion: Research files path? (default: planning/research)"
      - "AskUserQuestion: Session retention days? (default: 7)"
      - "AskUserQuestion: Install strict mode hooks (PreToolUse gates)? (default: no)"
      - "AskUserQuestion: Customize planning interview categories? (see ## Interview Customization below)"
  - id: p4
    name: "GitHub Setup"
    description: "Verify gh CLI is installed and authenticated"
    task_config:
      title: "P4: GitHub Setup — gh CLI, auth, labels"
      depends_on: [p1]
    tasks:
      - "Check gh CLI is installed (gh --version), guide install if missing"
      - "Check gh auth status, run gh auth login if not authenticated"
      - "Confirm .github/ISSUE_TEMPLATE/ files are in place (from batteries scaffold)"
      - "If batteries was chosen: create all 15 labels from .github/wm-labels.json via gh label create --force (see ## GitHub Setup Phase for exact commands)"
  - id: p5
    name: "Write Configuration"
    description: "Run the appropriate kata setup command based on collected answers, then patch kata.yaml for any custom values"
    task_config:
      title: "P5: Write Configuration — run setup command, patch kata.yaml"
      depends_on: [p4]
    tasks:
      - "Run the appropriate kata setup command (see ## Write Configuration Command below)"
      - "If custom path: patch kata.yaml with any values that differ from auto-detected defaults"
      - "Confirm hooks registered in .claude/settings.json"
  - id: p6
    name: "Verify Setup"
    description: "Run kata doctor to verify everything is configured correctly"
    task_config:
      title: "P6: Verify Setup — kata doctor"
      depends_on: [p5]
    tasks:
      - "Run kata doctor --json and display results"
      - "Show summary of installed configuration"
      - "Suggest next steps: kata enter <mode>"
---

# Project Configuration Mode

You are the agent running the kata setup interview. Ask questions, collect answers, then run the appropriate commands. Do not describe what you're about to do — just do it.

## Phase Flow

**Quick path (batteries):** p0 → p1 → p4 → p5 → p6. Skip p2 and p3.
**Custom path:** p0 → p1 → p2 → p3 → p4 → p5 → p6.

## Native Tasks Check

In p0, check whether Claude Code native tasks are enabled:

```bash
node -e "
const fs = require('fs'), os = require('os'), path = require('path');
const f = path.join(os.homedir(), '.claude', 'settings.json');
try {
  const s = JSON.parse(fs.readFileSync(f, 'utf-8'));
  console.log(s?.env?.CLAUDE_CODE_ENABLE_TASKS ?? '(not set — defaults to enabled)');
} catch { console.log('(settings.json not found — defaults to enabled)'); }
"
```

**If the value is `"false"`** — kata workflow tracking will not work. Inform the user:

> ⚠️ Native tasks are disabled. kata requires `CLAUDE_CODE_ENABLE_TASKS=true` to track workflow progress with TaskList and TaskUpdate.
>
> To enable:
> 1. Open `~/.claude/settings.json`
> 2. Set `"env": { "CLAUDE_CODE_ENABLE_TASKS": "true" }`
> 3. **Restart Claude Code** — the setting takes effect only after a restart.

Ask the user to restart and re-run `kata enter onboard` before continuing.

**If the value is `"true"` or not set** — native tasks are enabled, continue normally.

## What Gets Created

**Always:**
- `.kata/kata.yaml` — Project configuration
- `.claude/settings.json` — Hook registrations (merged with existing)
- `.kata/sessions/` — Session state directory

**With batteries:**
- `.kata/templates/` — 6 full mode templates with GitHub integration
- `.claude/agents/` — 3 Claude Code sub-agent definitions
- `planning/spec-templates/` — Feature, epic, and bug spec templates
- `.kata/interviews.yaml` — Planning interview categories (customizable)

## Batteries-Included Starter Content

When asked "Install batteries-included starter content?", choosing Yes scaffolds:

**Mode templates** (`.kata/templates/`):
| Template | Description |
|----------|-------------|
| `planning.md` | Research → spec → GitHub issue → review → approve |
| `implementation.md` | Claim branch → implement per spec → PR → close issue |
| `research.md` | Parallel Explore agents → synthesis → research doc |
| `task.md` | Quick plan → implement → commit with issue close |
| `debug.md` | Reproduce → hypotheses → trace → minimal fix |
| `freeform.md` | Free exploration with structured exit patterns |

**Agents** (`.claude/agents/`):
| Agent | Description |
|-------|-------------|
| `impl-agent` | Implements a specific spec phase |
| `test-agent` | Writes tests for spec behaviors |
| `review-agent` | Reviews code and specs for quality |

Agents are invoked via subphase patterns. The orchestrator spawns them with Claude Code's Task tool:
```
Task(subagent_type="impl-agent", prompt="
  SPEC PHASE: P2.1
  TASK: Implement auth middleware from planning/specs/123-feature.md
  Do NOT complete tasks — return results to orchestrator.
")
```

**Spec templates** (`planning/spec-templates/`):
- `feature.md` — Feature spec with behaviors, phases, acceptance criteria
- `epic.md` — Epic/initiative with features, milestones, success metrics
- `bug.md` — Bug report with reproduction steps and fix tracking

## GitHub Setup Phase

The `github-setup` phase walks through:

### 1. Check `gh` CLI

```bash
gh --version 2>/dev/null || echo "NOT_INSTALLED"
```

If not installed, guide the user:
- macOS: `brew install gh`
- Linux: `sudo apt install gh` or https://cli.github.com
- Windows: `winget install GitHub.cli`

### 2. Check Authentication

```bash
gh auth status 2>/dev/null
```

If not authenticated:
```bash
gh auth login
```
Follow the prompts — choose GitHub.com, HTTPS, browser authentication.

### 3. Create Labels (batteries only)

If batteries was chosen, create all 15 labels from `.github/wm-labels.json`. Ask first:

```
AskUserQuestion(questions=[{
  question: "Create GitHub labels for issue tracking? (15 labels: type, priority, status, workflow)",
  header: "Labels",
  options: [
    {label: "Yes — create labels", description: "15 labels covering type, priority, status lifecycle, and workflow state"},
    {label: "No — skip", description: "Create labels manually later"}
  ]
}])
```

If yes, read `.github/wm-labels.json` and create each label:

```bash
cat .github/wm-labels.json | node -e "
  const labels = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
  labels.forEach(l => process.stdout.write(
    \`gh label create \"\${l.name}\" --color \"\${l.color}\" --description \"\${l.description}\" --force\n\`
  ));
" | bash
```

Or create them one at a time if the pipe fails. The `--force` flag updates existing labels — safe to re-run.

### 4. Issue Templates

Confirm `.github/ISSUE_TEMPLATE/` exists with the 3 templates:
```bash
ls .github/ISSUE_TEMPLATE/
# feature.yml  bug.yml  epic.yml
```

If missing (batteries not yet run):
```bash
kata batteries
```

## The Setup Style Question (p1 — first question)

This is the **first question** after bootstrap. Ask it before anything else:

```
AskUserQuestion(questions=[{
  question: "How would you like to set up kata?",
  header: "Setup style",
  options: [
    {
      label: "Quick — batteries-included (recommended)",
      description: "Installs everything with sensible defaults: 6 mode templates, 3 agents, 3 spec templates. Just confirm your project name and go."
    },
    {
      label: "Custom — answer each question",
      description: "Configure spec review, code review, paths, and strict hooks individually. Batteries content optional at the end."
    }
  ],
  multiSelect: false
}])
```

**If Quick:** skip p2 and p3. Just confirm the project name, then proceed to p4 (GitHub Setup). Use all defaults. Set batteries = true.

**If Custom:** continue through p2 (Project Discovery) and p3 (Custom Configuration). At the end of p3, ask the batteries question to decide whether to install starter content.

## Interview Customization

In p3 (custom path only), ask about planning interview categories:

```
AskUserQuestion(questions=[{
  question: "Which interview categories should planning mode use for this project?",
  header: "Categories",
  options: [
    {label: "Requirements", description: "User journey, happy path, scope, edge cases, scale"},
    {label: "Architecture", description: "Integration points, error handling, performance"},
    {label: "Testing", description: "Test scenarios, error paths, test types"}
  ],
  multiSelect: true
}])
```

Then ask about UI design separately:

```
AskUserQuestion(questions=[{
  question: "Does this project have a UI? (enables design interview category)",
  header: "UI Design",
  options: [
    {label: "Yes — include design interviews", description: "Layout, components, visual states"},
    {label: "No — backend only", description: "Skip design category entirely"}
  ],
  multiSelect: false
}])
```

**If all defaults kept:** No action needed — `batteries/interviews.yaml` has all 4 categories.

**If user deselected categories:** Write a custom `.kata/interviews.yaml` containing only the selected categories. Copy the selected category definitions from the batteries file.

## Write Configuration Command

After collecting answers through the interview, run **one** of these commands in p5 based on what the user chose:

| Batteries? | Strict hooks? | Command |
|-----------|--------------|---------|
| Yes | Yes | `kata setup --yes --batteries --strict` |
| Yes | No | `kata setup --yes --batteries` |
| No | Yes | `kata setup --yes --strict` |
| No | No | `kata setup --yes` |

`--batteries` scaffolds mode templates, agents, spec templates, and GitHub issue templates.
`--strict` installs the three `PreToolUse` hooks (mode-gate, task-deps, task-evidence).

**Custom path only:** after running the command above, open `kata.yaml` and patch any values the user overrode during the interview (spec_path, research_path, project.test_command, project.build_command, project.typecheck_command, project.dev_server_command, project.dev_server_health, reviews, session_retention_days). The `kata setup --yes` command auto-detects sensible defaults; only write fields that differ.

Then run `kata doctor` (p6) to verify everything is correct.

## External Review Setup

The built-in `review-agent` always runs during review steps. External providers run **alongside** it in parallel — all reviews print together.

When p3 asks "Enable code review?", first run `kata providers list` to detect which CLIs are installed:

```bash
kata providers list
```

Only offer providers whose CLI is detected. Then ask:

```
AskUserQuestion(questions=[{
  question: "Add external reviewers to run alongside the built-in review-agent?",
  header: "Reviewers",
  options: [
    {label: "Built-in only", description: "review-agent runs alone — no external providers"},
    {label: "Add Gemini", description: "Gemini CLI runs in parallel with review-agent, both results printed together"},
    {label: "Add Codex", description: "Codex CLI runs in parallel with review-agent, both results printed together"},
    {label: "Add both", description: "Gemini + Codex + review-agent all run in parallel — three reviews printed together"}
  ],
  multiSelect: false
}])
```

After selection, run `kata providers setup` to write config to kata.yaml.

### `codex` — OpenAI Codex CLI review
Requires the Codex CLI installed:
```bash
npm install -g @openai/codex
```
Uses `codex exec --sandbox read-only` for code review with full agent capabilities.

### `gemini` — Google Gemini CLI review
Requires the Gemini CLI installed and authenticated:
```bash
npm install -g @google/gemini-cli
gemini auth login
```
Uses `gemini --yolo` for autonomous code review with full agent capabilities.

### `none` — No external review gate
Implementation phases complete without a review step. Recommended for solo projects or when using PR review instead.

## Testing & Verification Setup

When p3 reaches the testing & verification toolchain question, walk through each tool category. Auto-detect values from the project and ask the user to confirm or override.

### 1. Build Command

Auto-detect from `package.json` scripts (look for `build`, `compile`, or `tsc`):

```
AskUserQuestion(questions=[{
  question: "Build command? (detected: '{detected_or_none}')",
  header: "Build",
  options: [
    {label: "Accept detected", description: "Use '{detected_command}'"},
    {label: "None — no build step", description: "Project runs without compilation"},
    {label: "Custom", description: "Specify a different build command"}
  ],
  multiSelect: false
}])
```

Set in `kata.yaml`:
```yaml
project:
  build_command: "npm run build"
```

### 2. Type-check Command

Auto-detect: check for `tsconfig.json` (→ `npx tsc --noEmit`), `pyright`, `mypy`, or `flow`:

```
AskUserQuestion(questions=[{
  question: "Type-check command? (detected: '{detected_or_none}')",
  header: "Typecheck",
  options: [
    {label: "Accept detected", description: "Use '{detected_command}'"},
    {label: "None — no type checking", description: "Skip type-check stop condition"},
    {label: "Custom", description: "Specify a different type-check command"}
  ],
  multiSelect: false
}])
```

Set in `kata.yaml`:
```yaml
project:
  typecheck_command: "npx tsc --noEmit"
```

### 3. Test Command

Already asked in p2 (Project Discovery). If p2 was skipped (quick path), auto-detect from `package.json` scripts.test, vitest/jest/pytest config files.

Set in `kata.yaml`:
```yaml
project:
  test_command: "npm test"
```

### 4. Dev Server (for behavioral verification)

Ask whether the project has a dev server. This is used by the verification agent to start the app and run Verification Plan steps against it.

```
AskUserQuestion(questions=[{
  question: "Does this project have a dev server?",
  header: "Dev server",
  options: [
    {label: "Yes", description: "I'll ask for the start command and health endpoint next"},
    {label: "No — CLI/library only", description: "Skip dev server setup"}
  ],
  multiSelect: false
}])
```

If yes, ask two follow-ups:

```
AskUserQuestion(questions=[
  {
    question: "Dev server start command?",
    header: "Start cmd",
    options: [
      {label: "npm run dev", description: "Standard npm dev script"},
      {label: "pnpm dev", description: "pnpm dev script"},
      {label: "Custom", description: "Specify a different command"}
    ],
    multiSelect: false
  },
  {
    question: "Health/readiness endpoint to poll before running verification?",
    header: "Health URL",
    options: [
      {label: "http://localhost:3000/health", description: "Common default"},
      {label: "http://localhost:3000", description: "Just check the root responds"},
      {label: "Custom", description: "Specify a different URL"}
    ],
    multiSelect: false
  }
])
```

Set in `kata.yaml`:
```yaml
project:
  dev_server_command: "npm run dev"
  dev_server_health: "http://localhost:3000/health"
```

### 5. Verification Tools File (batteries only)

When batteries are installed, `verification-tools.md` is scaffolded with placeholder values. After setup, remind the user:

> **Next step:** Fill in `verification-tools.md` with your project's dev server URL, auth setup, database access, and key endpoints. The verification agent reads this file before executing any Verification Plan.

The file lives at `.kata/verification-tools.md`.

### 6. Test File Pattern (optional)

If the project uses a non-standard test file location, ask:

```
AskUserQuestion(questions=[{
  question: "Test file pattern? (used by feature_tests_added stop condition)",
  header: "Test pattern",
  options: [
    {label: "Default — co-located *.test.ts", description: "Tests next to source files"},
    {label: "tests/ directory", description: "Separate tests/ folder"},
    {label: "Custom", description: "Specify a glob pattern like 'src/**/*.spec.ts'"}
  ],
  multiSelect: false
}])
```

Set in `kata.yaml`:
```yaml
project:
  test_file_pattern: "src/**/*.test.ts"
```

## Hooks Installed

**Default (3 hooks):**
- `SessionStart` — Initialize session and inject context
- `UserPromptSubmit` — Detect mode from user message
- `Stop` — Check exit conditions before stopping

**With `--strict` (3 additional hooks):**
- `PreToolUse` — Block writes without active mode
- `PreToolUse:TaskUpdate` — Check task dependencies
- `PreToolUse:TaskUpdate` — Check task evidence
