---
date: 2026-04-06
topic: Skill structure restructure — superpowers comparison
status: complete
---

# Research: Skill Structure Restructure

## Questions Explored
- How does superpowers (obra/superpowers) structure skills?
- How does kata-wm currently structure skills/agents?
- What's the right target structure?

## Superpowers Skill Structure

14 standalone skills in `skills/<name>/SKILL.md` with YAML frontmatter (`name`, `description`). Each skill:

- Is independently discoverable via description matching
- Owns its subagent prompts as sibling files (e.g. `implementer-prompt.md`, `spec-reviewer-prompt.md`)
- Contains full methodology: when to use, the process, red flags, common mistakes
- Chains to other skills via `superpowers:<skill-name>` references
- No separate "agents" directory — subagent behavior is part of the skill

Key skills: brainstorming, writing-plans, executing-plans, subagent-driven-development, systematic-debugging, test-driven-development, verification-before-completion, finishing-a-development-branch, dispatching-parallel-agents, requesting-code-review, receiving-code-review, using-git-worktrees, writing-skills, using-superpowers.

## Current kata-wm Structure (Problems)

Skills/agents scattered across three locations with different formats:

1. **`.claude/agents/*.md`** — 5 subagent definitions (debug-agent, impl-agent, review-agent, spec-writer, test-agent). These define spawned agent behavior only.
2. **Template `skill:` references** — phantom skill names (quick-planning, interview, debug-methodology, implementation, spec-writing) that don't resolve to any file.
3. **`.kata/interviews.yaml`** — structured interview config, effectively a skill defined as data.

## Key Insight: Claude Code Native Skill System

Skills in Claude Code live in `.claude/skills/<name>/SKILL.md` (project-level) or `~/.claude/skills/<name>/SKILL.md` (personal). They are:

- Invoked via `/skill-name` slash command or the `Skill` tool
- Auto-discovered based on description matching
- Inline context (share conversation) — unlike agents which are isolated
- Support frontmatter: `name`, `description`, `allowed-tools`, `context: fork`, `paths`, `model`, etc.

Agents (`.claude/agents/`) are a separate system — isolated subagent definitions spawned via Agent tool.

## Target Structure

Collapse agents into skill directories. Skills own the full methodology including subagent prompts:

```
.claude/skills/
  implementation/
    SKILL.md                # Methodology, when to spawn, how to handle results
    implementer-prompt.md   # Subagent prompt (spawned via Agent tool)
    reviewer-prompt.md      # Subagent prompt
  debugging/
    SKILL.md                # Hypothesis-driven debugging process
    tracer-prompt.md        # Subagent prompt for code tracing
  planning/
    SKILL.md                # Interview -> spec -> review flow
    spec-writer-prompt.md   # Subagent prompt
    reviewer-prompt.md      # Subagent prompt
  verification/
    SKILL.md                # VP execution + evidence
    fix-reviewer-prompt.md  # Subagent prompt
  research/
    SKILL.md                # Parallel exploration + synthesis
  quick-planning/
    SKILL.md                # Lightweight scope + approach
```

`.claude/agents/` goes away.

## How It Composes With Modes

No conflict — layers stay clean:

- **Mode** -> owns phase sequence and stop conditions
- **Template** -> defines phases and tasks within each phase
- **Task** -> says "Invoke `/implementation`" to invoke a skill
- **Skill** -> contains the actual methodology + subagent prompts

Mode/template/task = *when* and *what order*. Skills = *how*.

## Mapping: Current Agents -> Target Skills

| Current Agent | Target Skill | Notes |
|---|---|---|
| `.claude/agents/impl-agent.md` | `.claude/skills/implementation/implementer-prompt.md` | Becomes subagent prompt inside implementation skill |
| `.claude/agents/review-agent.md` | `.claude/skills/implementation/reviewer-prompt.md` + `.claude/skills/planning/reviewer-prompt.md` | Split per skill context |
| `.claude/agents/spec-writer.md` | `.claude/skills/planning/spec-writer-prompt.md` | Becomes subagent prompt inside planning skill |
| `.claude/agents/test-agent.md` | `.claude/skills/implementation/test-prompt.md` | Becomes subagent prompt inside implementation skill |
| `.claude/agents/debug-agent.md` | `.claude/skills/debugging/tracer-prompt.md` | Becomes subagent prompt inside debugging skill |

## Mapping: Phantom Skills -> Real Skills

| Phantom Reference | Target Skill |
|---|---|
| `skill: quick-planning` | `.claude/skills/quick-planning/SKILL.md` |
| `skill: interview` | `.claude/skills/planning/SKILL.md` (interview is part of planning methodology) |
| `skill: debug-methodology` | `.claude/skills/debugging/SKILL.md` |
| `skill: implementation` | `.claude/skills/implementation/SKILL.md` |
| `skill: spec-writing` | `.claude/skills/planning/SKILL.md` (spec writing is part of planning methodology) |

## Template Changes

Templates become thinner. Task instructions change from:

```yaml
skill: implementation
```

To:

```yaml
instructions: |
  Invoke /implementation to execute this spec phase.
```

## Next Steps
- Create GitHub issue for the restructure
- Plan the migration (skill content, template updates, agent removal)
