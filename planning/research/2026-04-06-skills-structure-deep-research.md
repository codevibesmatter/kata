---
date: 2026-04-06
topic: Skills structure evaluation and refactor plan
status: complete
github_issue: null
---

# Research: Skills Structure Evaluation

## Context

We need to evaluate our `.claude/skills/` structure to make skills as useful as possible and ensure they don't conflict with tasks (which explain "the what"). Looked at our codebase + top public skills collections for patterns.

## Questions Explored

1. Where should the line be between skills (how) and tasks/templates (what)?
2. What's the optimal SKILL.md structure?
3. What do top community skills collections look like?
4. Do our skills overlap/conflict with templates?
5. Should skills be mode-specific or cross-cutting?

## Findings

### Codebase

**Current state: 12 skills in `.claude/skills/`**

| Skill | Lines | Type | Problem |
|-------|-------|------|---------|
| `task` | 57 | Mode skill | Phase flow duplicates template |
| `implementation` | 193 | Mode skill | Phase flow + orchestration + TEST/REVIEW protocols duplicate template |
| `planning` | 193 | Mode skill | Phase flow + orchestration + interview refs duplicate template |
| `debugging` | 97 | Mode skill | Phase flow duplicates template |
| `research` | 29 | Mode skill | Phase flow duplicates template |
| `freeform` | 89 | Mode skill | Exit pattern duplicates template |
| `verification` | 126 | Mode skill | Phase flow + VP protocol duplicate template |
| `code-review` | 27 | Cross-cutting | Clean - pure methodology |
| `tdd` | 16 | Cross-cutting | Clean - pure methodology |
| `interview` | 40 | Cross-cutting | Clean - pure methodology |

**Key issue: 7 of 12 skills duplicate their template's content.** Templates define phases/steps/instructions AND skills re-explain the same flow. Claude gets double context for the same information.

**Sub-prompt files** (e.g. `implementer-prompt.md`, `tracer-prompt.md`) are good - they follow Anthropic's progressive disclosure pattern. These are agent delegation templates, not duplicate content.

**Template `mode_skill` field** links each mode to its skill. Template `skill:` field on steps references cross-cutting skills. This architecture supports the refactor.

### External

**Anthropic official guidance** (code.claude.com/docs, platform.claude.com/docs):
- Skills are **Reference content** (knowledge/methodology) OR **Task content** (specific actions)
- SKILL.md should be under **500 lines**, ideally much less
- Only add context **Claude doesn't already have** - "Claude is already very smart"
- Description under **250 chars**, front-load the use case
- Progressive disclosure: SKILL.md is overview, details in sub-files
- Use `disable-model-invocation: true` for side-effect workflows
- Use `user-invocable: false` for background knowledge

**Community collections** (travisvn/awesome-claude-skills, VoltAgent/awesome-agent-skills, hesreallyhim/awesome-claude-code):
- Skills organized by **activity/domain** (pdf-processing, api-conventions, git-commit-helper), NOT by workflow mode
- Nobody has "planning-mode-skill" or "implementation-mode-skill"
- Top skills do ONE thing well and compose into workflows
- Hook-based activation (hesreallyhim) for smart context-aware selection
- 1000+ community skills, all cross-cutting

**Four-Pattern Framework** (mindstudio.ai):
1. **Context Is Milk** - load context just-in-time, don't dump everything at start
2. **One Business Brain** - centralize domain knowledge, don't scatter rules
3. **Skill Collaboration** - skills as composable components with contracts
4. **Self-Learning** - structured feedback loops for recurring patterns

**Best practices consensus:**
- Narrow, purposeful skills over broad ones
- "A well-written system prompt may outperform poorly-designed modular skills"
- Trigger reliability is probabilistic - explicit invocation > auto-discovery for critical workflows
- Test with all models you plan to use

## Recommendations

### Initial analysis: Hybrid lean-then-extract (superseded)

The initial research suggested stripping mode skills to methodology-only, then extracting cross-cutting skills later. Brainstorming revealed a more fundamental redesign.

### Final recommendation: Skills as atomic building blocks

**Key insight:** Other communities use skills AS modes because they lack workflow infrastructure. We have kata (templates, tasks, gates, stop hooks). So our skills should NOT duplicate the template — they should BE the reusable guts that templates wire together.

#### Architecture

```
Template = thin YAML skeleton (phases, ordering, expansion patterns)
Skills   = atomic methodology modules (instructions + gates)
```

Two layers of skill injection:

1. **`mode_skill`** — loaded on mode entry for top-level role (e.g. `orchestration` for "you coordinate agents, you don't code yourself")
2. **`skill:` on steps** — loaded per-step for specific methodology (e.g. `tdd`, `code-review`, `test-protocol`)

One skill per context. Layered, not composed.

#### Template shape (all modes follow this pattern)

```yaml
id: implementation
mode_skill: orchestration       # top-level role

phases:
  - id: p0
    steps:
      - id: setup
        skill: impl-setup       # skill owns instructions + gate

  - id: p1
    steps:
      - id: claim
        skill: branch-claim

  - id: p2
    name: Implement
    expand_from: spec_phases    # dynamic expansion from spec
    subphase_pattern:
      - id: impl
        skill: tdd
      - id: test
        skill: test-protocol
        gate: build_pass
      - id: review
        skill: code-review
        gate: approved

  - id: p3
    steps:
      - id: close
        skill: pr-close
```

Templates become ~30 lines of wiring. Zero prose.

#### Skills own their gates

Skills define completion criteria, not just instructions:

```yaml
# skills/impl-setup/SKILL.md
---
name: impl-setup
description: "Pre-implementation: read spec, verify clean env, confirm deps build"
gate:
  - spec_read: true
  - env_clean: true
  - build_passes: true
---

1. Read the spec IN FULL
2. Verify working tree clean (git status)
3. Verify deps installed (npm ci)
4. Confirm build passes (npm run build)
```

#### Dynamic expansion + skills

Spec-based expansion (implementation), VP-step expansion (verification), and interview-category expansion (planning) all work the same way: the `subphase_pattern` stamps out steps, each with its own `skill:` reference.

```yaml
# verify.md
phases:
  - id: p1
    expand_from: vp_steps
    subphase_pattern:
      - id: execute
        skill: vp-step-execution

  - id: p2
    steps:
      - id: fix-loop
        skill: debug-methodology    # cross-cutting reuse!
      - id: fix-review
        skill: review-protocol
```

#### Skill library

**Top-level (mode entry via `mode_skill`):**
- `orchestration` — "Coordinate agents. Don't do deep work inline." (implementation, planning, verification)

**Ceremony/workflow steps:**
- `impl-setup` — read spec, clean env, verify deps/build
- `branch-claim` — create branch, claim issue
- `pr-close` — commit, push, PR, issue comment
- `research-scoping` — define questions, boundaries, success criteria
- `verify-setup` — determine VP source, start dev server
- `evidence-recording` — write VP evidence JSON, commit

**Core methodology:**
- `tdd` — Red/Green/Refactor cycle
- `code-review` — checklist + report format + verdict
- `test-protocol` — build, test, hints, retry limits
- `review-protocol` — review-agent + external providers, fix loop
- `interview` — structured questioning
- `spec-writing` — spec structure, behavior format, VP rules
- `debug-methodology` — reproduce, classify, hypothesize, minimal fix, regression guard
- `vp-step-execution` — run command exactly, compare expected vs actual

**Agent delegation prompts (sub-files inside skills):**
- `orchestration/implementer-prompt.md`
- `orchestration/test-prompt.md`
- `code-review/reviewer-prompt.md`
- `spec-writing/spec-writer-prompt.md`
- `debug-methodology/tracer-prompt.md`

**Not all modes need `mode_skill`:**
- task, debug, freeform, research → `mode_skill: null` (no orchestrator, just step skills)
- implementation, planning, verification → `mode_skill: orchestration`

#### What this buys

- **Templates are thin** — ~30 lines of wiring, zero prose
- **Skills are reusable** — `debug-methodology` used in debug mode AND verify fix-loop
- **Gates co-located** — skill says what to do AND when it's done
- **Customization by swapping** — don't use GitHub? Swap `branch-claim` for `branch-create`
- **Easier maintenance** — update `test-protocol` once, all modes benefit
- **Standardized** — one TEST protocol, one REVIEW protocol, not copy-pasted per template

## Open Questions

1. **Gate schema**: How do skill-defined gates integrate with the existing gate system? Need to design the `gate:` frontmatter field and how task-factory reads it.
2. **Expansion + skills**: Does task-factory already resolve `skill:` on subphase_pattern steps? Likely needs work.
3. **Skill loading mechanism**: When a step has `skill: tdd`, does the task instruction just say "Invoke /tdd" or does it inline the skill content? The former is cleaner but adds a tool call; the latter is more direct.
4. **mode_skill for non-orchestrator modes**: Should task/debug/freeform have a lightweight mode_skill or truly null?

## Next Steps

1. Create planning spec for the skills-as-building-blocks refactor
2. Design the gate schema (skill frontmatter `gate:` field)
3. Prototype one template conversion (implementation.md) to validate the approach

## Sources

- [Extend Claude with skills - Claude Code Docs](https://code.claude.com/docs/en/skills)
- [Skill authoring best practices - Claude API Docs](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices)
- [Four-Pattern Framework for Claude Code Skills](https://www.mindstudio.ai/blog/four-pattern-framework-claude-code-skills)
- [travisvn/awesome-claude-skills](https://github.com/travisvn/awesome-claude-skills)
- [VoltAgent/awesome-agent-skills](https://github.com/VoltAgent/awesome-agent-skills)
- [hesreallyhim/awesome-claude-code](https://github.com/hesreallyhim/awesome-claude-code)
- [Essential Claude Code Skills and Commands - Batsov](https://batsov.com/articles/2026/03/11/essential-claude-code-skills-and-commands/)
- [The Ultimate Guide to Claude Code Skills - Corporate Waters](https://corpwaters.substack.com/p/the-ultimate-guide-to-claude-code)
