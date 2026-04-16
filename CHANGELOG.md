# Changelog

## 0.5.1 (2026-04-16)

### Fixes

- **stop hook**: `hasActiveBackgroundAgents` now ignores unmatched `Agent` tool_uses older than 2 minutes. Previously, stale IDs from earlier in the session would poison the Stop hook for the rest of the session, allowing premature exit despite pending tasks, uncommitted changes, or unpushed commits. (#60)

## 0.4.0 (2026-04-12)

### Breaking Changes

- **setup**: `kata batteries` removed — `kata setup --yes` now scaffolds everything (config, hooks, templates, skills, spec templates) in one command. `--batteries` flag is accepted but deprecated.
- **templates**: Template frontmatter schema redesigned — phases now use `stage` (setup/work/close), `expansion` (static/agent/spec), `skill` references, `$ref` step library, and `gate` definitions. Old-format templates can be migrated with `kata migrate`.
- **hooks**: `mode-gate`, `task-deps`, `task-evidence` consolidated into a single `pre-tool-use` hook for performance. Hooks are re-registered on `kata setup`.

### Features

- **skills**: 10 batteries skills ship with the package — `code-impl`, `code-review`, `research`, `interview`, `spec-writing`, `spec-review`, `debug-methodology`, `auto-debug`, `test-protocol`, `vp-execution`. Copied to `.claude/skills/` during setup.
- **step library**: Reusable step definitions in `batteries/steps.yaml` with `$ref` and `vars` substitution — templates reference shared steps like `env-check`, `commit-push`, `create-pr` instead of duplicating instructions.
- **rules**: Per-mode `rules:` arrays in `kata.yaml` injected into context via `kata prime`. Each mode gets its own orchestration instructions (e.g., research branches by research type, implementation coordinates agents).
- **stop conditions**: `doc_created` (checks `deliverable_path` for new files) and `spec_valid` (validates spec frontmatter structure) added.
- **gates**: Template steps can define `gate:` blocks with `bash` commands and `expect_exit` — checked by the `pre-tool-use` hook before a phase task can be completed.
- **expansion**: Phases can declare `expansion: agent` (Claude discovers and creates sub-tasks at runtime) or `expansion: spec` (sub-tasks generated from spec phases). Replaces the old impl/test/review fan-out pattern.
- **update**: `kata update` replaces `kata batteries --update` — overwrites project templates and skills with latest package versions.
- **migrate**: `kata migrate` converts old-format templates to the new gate/hint/stage format. Supports `--dry-run`.
- **smart stop hook**: Detects active background agents via transcript scanning to prevent premature session exit.
- **dry-run**: `kata enter --dry-run` shows resolved task subjects and descriptions before creating anything.

### Fixes

- **stop**: Exclude `.kata/sessions/` from the `committed` check to prevent recursive commit loops.
- **tasks**: Drop workflow ID prefix from task titles when no issue is linked (cleaner task list).
- **tasks**: Wire cross-phase blocking for agent-expanded child tasks.
- **tasks**: Invoke skill once at phase level, not on every child task.
- **impl**: Single task per spec phase with gate check, matching the agent expansion pattern.
- **enter**: Surface YAML parse errors instead of silent failures.
- **validate-spec**: Use js-yaml parser instead of regex for reliable frontmatter extraction.

### Docs

- **README**: Updated to reflect unified setup, skills system, new template schema, and current command surface.

## 0.3.0 (2026-03-22)

Intermediate release — added skills infrastructure and research tooling. Superseded by 0.4.0.

## 0.2.0 (2026-03-16)

### Features

- **agent-run**: General-purpose agent execution command (`kata agent-run`) with prompt templates, context assembly, and provider routing
- **providers**: Project-level provider plugins via YAML config (`.kata/providers/*.yaml`)
- **providers**: Capabilities metadata, tool control, and `--yolo` mode for all providers
- **templates**: Apply planning template learnings from real usage (parallel reviewer spawning, fix loops)
- **review**: Add `theory-primitives-review` prompt template

### Fixes

- **providers**: Route `check-phase` micro-review through the provider system instead of hardcoded CLI flags — fixes broken reviewer invocation for claude/gemini (was using codex-only `--inline` flag for all)
- **providers**: Add shared `withRetry()` with exponential backoff for rate-limited API calls (gemini, codex, cli-provider plugins)
- **stop-hook**: Add agent-waiting guidance to prevent premature stop loop when background agents are active

### Refactors

- **prompts**: Move review prompts from package to project-level storage (`.kata/prompts/`)

### Docs

- Comprehensive README rewrite: value prop, quick start, modes table, hook chain, architecture
- Research docs: Codex CLI hooks/tasks feasibility, stop hook behavior, fail-open permission bypass

## 0.1.0 (2026-02-20)

Initial release.
