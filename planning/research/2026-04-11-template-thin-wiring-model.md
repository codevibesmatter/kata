# Template Thin Wiring Model

> Date: 2026-04-11
> Context: Discovered during Baseplane dev1 template migration (#46)

## Problem

Migrating Baseplane's custom templates to the new 3-stage model revealed that cramming instructions into YAML `instruction:` fields is ugly and defeats the purpose. Template instructions were just markdown prose shoved into YAML strings — agent spawn patterns, interview questions, escalation criteria, CLI commands, output formats.

## Insight: Three Layers

Every step in a template is exactly one of:

| Layer | What it does | Where it lives |
|-------|-------------|---------------|
| **Skill** | Methodology — how to do the work | `.claude/skills/{name}/SKILL.md` |
| **Gate** | Pass/fail enforcement | `gate: { bash: "...", expect_exit: 0 }` |
| **$ref** | Ceremony — project-specific commands | `.kata/steps.yaml` |

If something doesn't fit one of these three, it's noise.

## Content Placement

| Content | Belongs in | NOT in |
|---------|-----------|--------|
| "How to debug" | skill (debug-methodology) | template instruction |
| "Run turbo test --filter=..." | gate (`{test_command}`) | template instruction |
| "pnpm bgh claim {N}" | steps.yaml ($ref) | template instruction |
| Agent spawn patterns | skill decides | template instruction |
| AskUserQuestion patterns | skill decides | template instruction |
| Output formats | skill | template instruction |
| Escalation criteria | skill | template instruction |
| Project commands | kata.yaml config | template instruction |
| Orchestration role | kata.yaml mode `rules:` | template markdown body |

## Expansion Model

Setup discovers scope. Work expands based on what setup found.

| Mode | Expansion | Rationale |
|------|-----------|-----------|
| freeform | none | no phases |
| research | none | linear flow, known steps |
| implementation | `expansion: spec` | spec defines work phases |
| task | `expansion: agent` | agent researches in setup, decides work tasks |
| debug | `expansion: agent` | agent reproduces in setup, decides investigation path |
| auto-debug | `expansion: agent` | fetch bugs in setup, create per-bug fix tasks |
| verify | `expansion: agent` | read VP in setup, create per-step tasks |
| vibegrid-smoke | `expansion: agent` | read behavior docs, create per-behavior tests |
| housekeeping | `expansion: agent` | detect changes, create per-domain audit tasks |
| planning | mixed | interview phase is agent-expanded (decides rounds), spec-writing/review static |

## Template Shape

Every template looks like this:

```yaml
phases:
  - id: p0
    stage: setup
    steps:
      - $ref: env-check
      - $ref: {mode-specific-setup}  # fetch-bugs, read-spec, etc.

  - id: p1
    stage: work
    expansion: agent  # or spec, or omit for static
    skill: {methodology}
    agent_protocol:  # only for expansion: agent
      max_tasks: 20

  - id: p2
    stage: close
    steps:
      - $ref: commit-push
      - $ref: update-issue
```

No instructions. No markdown body. Pure wiring.

## Project-Specific Skills

Projects add their own skills on top of the 8 batteries skills. These contain the methodology that's unique to the project:

- **auto-debug**: batch triage, classification table, escalation criteria, cluster detection
- **housekeeping**: doc-code drift audit, layer alignment rules, auto-fix criteria  
- **vibegrid-smoke**: TEVS behavior doc testing, coverage matrix format

## Project-Specific Steps (steps.yaml)

Projects override or extend the batteries steps.yaml with project commands:

- `github-claim` → `pnpm bgh claim {issue_number}` (overrides default `gh issue edit`)
- `update-issue` → `pnpm bgh finalize {issue_number}`
- `fetch-bugs` → `gh issue list --label "type:bug" --state open --json ...`
- `load-housekeeping-ts` / `save-housekeeping-ts`

## What Goes Away

- All `instruction:` fields in templates (moved to skills or steps.yaml)
- All agent spawn patterns in templates (skill decides)
- All `AskUserQuestion` patterns in templates (skill decides)
- Template markdown bodies (orchestration role → kata.yaml `rules:`)
- "Then: Mark this task completed" boilerplate
