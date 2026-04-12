# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run build        # Compile TypeScript → dist/ (required before running tests)
npm run dev          # Watch mode build
npm run typecheck    # Type-check without emitting
npm test             # Run tests (requires a prior build)
```

To run tests after code changes: `npm run build && npm test`.

Test files live alongside source with `.test.ts` suffixes (e.g. `src/commands/can-exit.test.ts`). Node's built-in test runner (`node --test`) executes them from `dist/testing/index.js`.

The `kata` shell script at the repo root is the CLI entry point. It runs `dist/index.js` via Node when built, or falls back to Bun running `src/index.ts` directly for no-build development.

## Architecture

**kata-wm** is a TypeScript CLI published as an npm package (`@codevibesmatter/kata`). It wraps Claude Code projects with structured session modes, phase task enforcement, and stop hooks.

### Source layout (`src/`)

| Directory | Purpose |
|-----------|---------|
| `index.ts` | CLI dispatcher — maps `kata <command>` to handler functions; also re-exports the programmatic API |
| `commands/` | One file per CLI command (`enter.ts`, `exit.ts`, `hook.ts`, `setup.ts`, etc.) |
| `commands/enter/` | Sub-modules for the `enter` command: `task-factory.ts` (native task creation), `guidance.ts`, `template.ts`, `spec.ts` |
| `session/lookup.ts` | Project root discovery, session ID resolution, template path resolution |
| `state/` | Zod schema (`schema.ts`), reader/writer for `SessionState` JSON |
| `config/` | `kata-config.ts` loads `.kata/kata.yaml` |
| `validation/` | Phase/template validation |
| `yaml/` | YAML frontmatter parser for template files |
| `utils/` | Workflow ID generation, session cleanup, timestamps |
| `testing/` | Test utilities exported as `@codevibesmatter/kata/testing` — mock sessions, hook runners, assertions, pre-built scenarios |

### Build outputs

tsup produces ESM-only output with two entry points:
- `dist/index.js` — main CLI and programmatic API
- `dist/testing/index.js` — test utilities (also used by `node --test` as the test runner)

### Runtime data layout

All kata-owned config lives under `.kata/`. Claude-owned files (`.claude/settings.json`, `.claude/skills/`) remain in `.claude/`.

| Path | Contents |
|---|---|
| `.kata/kata.yaml` | Project config (modes with rules, settings) |
| `.kata/sessions/{sessionId}/state.json` | Per-session `SessionState` |
| `.kata/templates/` | Mode templates (stages, skills, gates, $ref) |
| `.kata/steps.yaml` | Shared step definitions for `$ref` in templates |
| `.kata/prompts/` | Review prompt templates (customizable) |
| `.kata/verification-evidence/` | Verify-phase output |
| `~/.claude/tasks/{sessionId}/` | Native task files (Claude-owned) |
| `.claude/settings.json` | Hook registration (Claude-owned) |
| `.claude/skills/` | Methodology skills (code-impl, code-review, etc.) |
| `planning/spec-templates/` | Spec document stubs |

### Hook architecture

Hooks are registered in `.claude/settings.json` and call `kata hook <name>`. Each hook reads Claude Code's stdin JSON, extracts `session_id`, and outputs a JSON decision. The session ID from hook stdin **must** be forwarded as `--session=ID` to any subcommand — there is no automatic session detection at runtime.

| Hook event | Command | Role |
|------------|---------|------|
| `SessionStart` | `kata hook session-start` | Init session registry, inject mode context + rules |
| `UserPromptSubmit` | `kata hook user-prompt` | Detect mode intent, suggest entering a mode |
| `PreToolUse` | `kata hook pre-tool-use` | Consolidated: mode-gate, session ID, gate eval, task-deps, task-evidence |
| `Stop` | `kata hook stop-conditions` | Block exit while conditions are unmet, detect active agents |

### Mode and template system

Mode definitions live in `kata.yaml` under the `modes:` key. Each mode references a template filename with YAML frontmatter defining phases (with stages, skills, gates, `$ref` steps, and expansion types).

**Template sources:**
- `templates/` — system templates only: `SESSION-TEMPLATE.template.md`
- `batteries/templates/` — canonical mode templates (implementation, planning, task, etc.)
- `batteries/skills/` — methodology skills (code-impl, code-review, research, etc.)
- `batteries/steps.yaml` — shared step definitions for `$ref`

After setup, the project owns copies under `.kata/templates/`, `.claude/skills/`, and `.kata/steps.yaml`. The package files are seeds only, not used at runtime. To update project files with newer versions, run `kata update`.

### Key dependencies

- **zod** — schema validation for `SessionState`, `ModeConfig`, and config files
- **js-yaml** — YAML parsing for `modes.yaml`, `wm.yaml`, and template frontmatter

## Data-driven design principles

**No hardcoded mode names in logic.** Mode behavior is driven by fields in `kata.yaml` mode definitions:
- `issue_handling: "required" | "none"` — whether mode entry requires a GitHub issue
- `stop_conditions: string[]` — which exit checks to run (`tasks_complete`, `committed`, `pushed`, `tests_pass`, `feature_tests_added`, `doc_created`, `spec_valid`). Empty array = can always exit.
- `rules: string[]` — per-mode instructions injected into context via `kata prime`
- `deliverable_path: string` — directory checked by `doc_created` stop condition

When adding new per-mode behavior, add a field to `kata.yaml` mode config + `ModeConfigSchema`, never hardcode mode names in TypeScript.

## Eval harness (`eval/`)

Agentic eval suite using `@anthropic-ai/claude-agent-sdk`. The harness drives inner Claude agents through kata scenarios with real tool execution.

### Key design decisions

- **`settingSources: ['project']`** loads `.claude/settings.json` — hooks fire naturally in the SDK, no manual context injection needed. Never use `appendSystemPrompt` for hook context.
- **`permissionMode: 'bypassPermissions'`** — full agent autonomy, no tool approval prompts.
- **AskUserQuestion pause/resume** — a PreToolUse hook intercepts AskUserQuestion, stops the session (`continue: false`), outputs question + session_id. Resume with `--resume=<session_id> --answer="<choice>"`.
- **Fixture freshness** — `EvalScenario.fixture` field selects which `eval-fixtures/` dir to copy. After copying, the harness runs `kata update` so templates and skills always reflect latest package versions. Fixtures carry only `settings.json` and `kata.yaml`, not template `.md` files.
- **`CLAUDE_PROJECT_DIR` stripped** from inner agent env so it doesn't escape to the outer project.

### Assertion library (`eval/assertions.ts`)

All eval assertions live in `eval/assertions.ts`. Scenario files import individual assertions or preset arrays — no inline assertion definitions in workflow scenarios.

**Preset arrays** compose common assertion sets:
- `workflowPresets(mode)` — correct mode, new commit, clean tree, can-exit
- `workflowPresetsWithPush(mode)` — workflow + changes pushed
- `planningPresets(mode)` — workflow+push + spec created/approved/has behaviors

**Config-driven assertions** read `spec_path` and `research_path` from `wm.yaml` with defaults (`planning/specs`, `planning/research`).

**Content-signal assertions** (`assertDiffContains`, `assertDiffNonTrivial`) verify substantive work without coupling to application-specific file paths.

### Scenario design principles

- **Simple prompts** — describe the task in natural language ("add a health endpoint"). No `kata enter` commands, no pre-answered template questions. Let hooks and templates guide the agent.
- **Generic assertions** — test workflow outcomes (mode entered, committed, can-exit), not application specifics (no `login.tsx`, `better-auth`).
- **Harness-mechanic scenarios** (`mode-entry`, `ask-user-pause`) may keep inline assertions since they test isolation/pause behavior, not workflow.

### Running evals

```bash
npm run eval -- --scenario=task-mode --verbose          # Single scenario
npm run eval -- --list                                   # List scenarios
npm run eval -- --judge                                  # Run LLM-as-judge on transcripts
```

### Eval tests

```bash
bun test eval/assertions.test.ts                        # Run assertion unit tests
```

### Eval mode

`eval` is a project-level mode override (`.kata/kata.yaml`), not in the batteries templates. Enter with `kata enter eval` — creates per-scenario tasks with dependency chains.

### Fixtures

| Fixture | Path | Description |
|---------|------|-------------|
| `tanstack-start` | `eval-fixtures/tanstack-start/` | TanStack Start app with kata config (settings.json, wm.yaml, planning/). Default fixture. |
| `tanstack-start-fresh` | `eval-fixtures/tanstack-start-fresh/` | Bare TanStack Start app, no `.claude/` or `planning/`. |

## Project root resolution

`findProjectDir()` walks up from cwd looking for `.kata/`. It **stops at `.git` boundaries** to prevent escaping into a parent project (e.g., eval projects nested under this repo). If cwd has `.git` but no `.kata/`, it's a fresh project — the walk stops there.
