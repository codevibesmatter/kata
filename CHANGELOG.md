# Changelog

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
