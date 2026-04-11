---
date: 2026-04-06
topic: Blocks + Skills two-tier architecture
status: complete
github_issue: 45
---

# Research: Blocks + Skills Two-Tier Architecture

## Context

Issue #45 spec proposed replacing 7 mode-mirroring skills with 11 atomic skills. During deep analysis of each template, we found the 11-skill decomposition was too surface-level — it forced procedural ceremony and real methodology into the same concept. This research captures the revised architecture that emerged from walking through every template step by step.

## Questions Explored

1. What content in templates is structural vs methodology vs procedure?
2. Where do projects actually diverge and need customization?
3. What's the right granularity for reusable components?
4. How do we make kata usable as a general library without losing the opinionated step-by-step instructions that make it work?

## Key Findings

### Finding 1: Templates have two kinds of non-structural content

Walking through each template step by step revealed two distinct categories:

**Procedural ceremony** — setup and close steps that repeat across modes with variations. Git sanity checks, issue claiming, branching, committing, PR creation, issue updates. These are concrete commands, not abstract principles. They share common pieces (env-check, github-claim) but each mode composes them differently.

**Methodology** — substantive approaches to a type of work. TDD red/green/refactor. Structured interview questioning. Code review checklists. Debug hypothesis methodology. These have principles, anti-patterns, and real depth.

### Finding 2: Mode-mirroring skills are the wrong abstraction

The current skills (planning, implementation, task, debugging, etc.) mirror modes 1:1. They duplicate template content and don't enable reuse or customization. They're neither good building blocks nor good methodology — they're monoliths tied to a single mode.

### Finding 3: Ceremony is composable from building blocks

Setup and close are different for each mode, but share common pieces:

| Block | Used by |
|-------|---------|
| `env-check` | All modes — git status, clean tree, correct branch |
| `read-spec` | implementation, verify — read spec, verify approved |
| `classify-task` | task — determine scope, quick research |
| `reproduce-bug` | debug — capture evidence before reading code |
| `github-claim` | implementation, planning, debug — claim issue, update labels |
| `commit-push` | All modes with stop_conditions — stage, commit, push |
| `create-pr` | implementation — gh pr create with body |
| `update-issue` | implementation, planning, debug, verify — comment, label, close |
| `write-evidence` | verify — VP evidence JSON file |

Composition per mode:

| Mode | Setup blocks | Close blocks |
|------|-------------|-------------|
| implementation | env-check, read-spec, github-claim | commit-push, create-pr, update-issue |
| planning | env-check, github-claim | commit-push, update-issue |
| task | env-check, classify-task | commit-push, update-issue |
| debug | env-check, reproduce-bug, github-claim | commit-push, update-issue |
| verify | env-check, read-spec | commit-push, write-evidence, update-issue |
| research | env-check | commit-push |

A project that doesn't use GitHub removes `github-claim` and `update-issue`. A project that never does PRs removes `create-pr`. New blocks (e.g., `slack-notify`, `jira-claim`, `docker-health`) can ship without affecting existing templates.

### Finding 4: Only 6 skills are real methodology

These are substantive enough to be Claude Code skills (invoked via `/skillname`):

| Skill | Type | Purpose |
|-------|------|---------|
| `tdd` | Inline | Red/green/refactor — used in implementation P2, task P1 |
| `interview` | Inline | Structured questioning — used in planning (its own phase) |
| `code-review` | Agent (`context: fork`) | Review checklist + verdict — used in implementation P2, planning P3 |
| `debug-methodology` | Inline | Reproduce, classify, hypothesize, trace, minimal fix — used in debug P0+P1 |
| `spec-writing` | Agent (`context: fork`) | Spec structure, behaviors, VP, phases — used in planning P2 |
| `vp-execution` | Inline | Run VP steps literally, compare expected vs actual — used in verify P1+P2 |

### Finding 5: Orchestration is a rule, not a skill

"Spawn agents, don't code yourself" is a one-liner rule, not methodology. It belongs in kata.yaml `global_rules` or as a line in the template, not as a standalone skill.

### Finding 6: Templates simplify to 3 phases

Every mode follows the same macro pattern:

1. **Setup** — composed from blocks
2. **Core** — mode-specific structure with methodology skill refs on steps
3. **Close** — composed from blocks

Implementation had 4 phases (P0 Baseline + P1 Claim + P2 Implement + P3 Close). P0 and P1 are both setup ceremony and merge into one phase. Same pattern holds across all modes.

### Finding 7: Blocks are NOT skills

Blocks are kata's own composable concept. They live in `batteries/blocks/`, not `batteries/skills/`. They don't use Claude Code's skill invocation mechanism. Templates compose them into setup/close phases. They contain concrete commands and procedures.

Skills remain Claude Code native — `Invoke /skillname`, `context: fork` for agents. They contain methodology with principles, anti-patterns, and depth.

## Architecture

```
batteries/
  blocks/              # Composable procedural building blocks (kata concept)
    env-check.md
    read-spec.md
    classify-task.md
    reproduce-bug.md
    github-claim.md
    commit-push.md
    create-pr.md
    update-issue.md
    write-evidence.md

  skills/              # Methodology (Claude Code native skills)
    tdd/SKILL.md
    interview/SKILL.md
    code-review/SKILL.md        # context: fork
    debug-methodology/SKILL.md
    spec-writing/SKILL.md       # context: fork
    vp-execution/SKILL.md

  templates/           # Thin skeletons composing blocks + skills
    implementation.md
    planning.md
    task.md
    debug.md
    verify.md
    research.md
    freeform.md
```

## What the spec got wrong

1. **11 skills is too many** — forced procedure into skill shape (workflow-setup, workflow-close, orchestration, code-impl, test-protocol)
2. **Single tier** — treated blocks and methodology as the same concept
3. **Orchestration as a skill** — it's a rule, not methodology
4. **Skills own procedure** — blocks own procedure, skills own methodology

## What the spec got right

1. Templates should be thin skeletons
2. Mode-mirroring skills need to go
3. Skills should be reusable across modes
4. `context: fork` for agent skills (code-review, spec-writing)
5. Templates own structure and gates, something else owns methodology

## Open Questions

- [ ] How do templates reference blocks? New YAML field (`blocks: [env-check, github-claim]`) or inline step references?
- [ ] Do blocks scaffold to a project directory like skills do (`.kata/blocks/`)?
- [ ] Should blocks support conditional sections (like "if issue exists, claim it")?
- [ ] How does the task factory assemble block content into task instructions?
- [ ] Does the interview phase in planning stay as a distinct phase or become a setup block?

## Next Steps

- Revise #45 spec with two-tier architecture
- Design the block composition mechanism (template YAML schema)
- Prototype one template (task mode — simplest) as proof of concept
