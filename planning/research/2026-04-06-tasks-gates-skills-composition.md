---
date: 2026-04-06
topic: Tasks + Gates + Skills composition model for mode templates
status: complete
github_issue: 42
---

# Research: Tasks + Gates + Skills Composition

## Context

Issue #42 proposes adopting skills-based methodology injection in mode templates. Prior research (#41) proved 100% skill activation reliability. The superpowers analysis identified the hybrid thesis: **modes own the DAG, skills own the nodes**. This research explores what that concretely looks like with our current modes.

## Questions Explored

1. What does a mode template look like when tasks + gates handle structure and skills handle methodology?
2. What's the schema for combining `skills`, gates, and task_config in template frontmatter?
3. Which parts of current templates are "enforcement" (gates/tasks) vs "methodology" (skills)?
4. How do cross-mode skills compose without duplication?

## Findings

### The Three-Layer Model

| Layer | Owns | Enforced By | Changes Often? |
|-------|------|-------------|----------------|
| **Tasks** (template frontmatter) | What to do, in what order | Native task system + dependency chains | Per-mode (rarely) |
| **Gates** (template frontmatter) | Quality bars that must pass | Runtime bash execution, exit code checks | Per-project (kata.yaml placeholders) |
| **Skills** (`.claude/skills/`) | How to do each type of work | Agent reads SKILL.md, follows methodology | Per-project, composable |

### Current Template Content Classification

Analyzing all batteries templates (task, implementation, planning, debug, research), each piece of content falls into one of three buckets:

**Stays in template (structure + gates):**
- Phase definitions, ordering, dependencies (`phases:`, `depends_on:`)
- Task config with titles and labels (`task_config:`)
- Gate blocks with bash assertions (`gate:`)
- Container + subphase pattern for spec-driven expansion
- Global conditions / stop hooks

**Becomes a skill (methodology / context injection):**
- Interview workflows (planning P1) → `interview/SKILL.md`
- Planning orchestrator role + anti-patterns → `planning-orchestrator/SKILL.md`
- Implementation TEST protocol (~30 lines) → `test-protocol/SKILL.md`
- Implementation REVIEW protocol (~30 lines) → `review-protocol/SKILL.md`
- Debug hypothesis methodology → `debug-methodology/SKILL.md`
- TDD workflow → `tdd/SKILL.md` (already exists in eval fixtures)
- Quick planning → `quick-planning/SKILL.md` (already exists in eval fixtures)
- Spec writing structure + requirements → `spec-writing/SKILL.md`

**Stays as `instruction:` in steps (phase-specific, not reusable):**
- "Read the spec IN FULL", "Create feature branch", "Commit and push"
- Minimal step-specific guidance that references project state

### Template Size Impact

| Template | Current Lines | After Skills Extraction | Reduction |
|----------|--------------|------------------------|-----------|
| task.md | ~220 | ~70 | 68% |
| implementation.md | ~300 | ~80 | 73% |
| planning.md | ~680 | ~100 | 85% |
| debug.md | ~330 | ~90 | 73% |
| research.md | ~200 | ~60 | 70% |

### Schema Design

New field on steps and subphase patterns:

```typescript
// In phaseStepSchema — add:
skills: z.array(z.string()).optional()

// In subphasePatternSchema — add:
skills: z.array(z.string()).optional()
```

Template YAML usage:

```yaml
steps:
  - id: make-changes
    title: "Make the changes"
    skills: [tdd]                    # agent reads SKILL.md before executing
    gate:
      bash: "{test_command}"
      expect_exit: 0
    instruction: |
      Follow your plan. Make minimal, focused changes.
```

At task creation time (`task-factory.ts`), skill references render into the task instruction:

```markdown
## Skills
- Read .claude/skills/tdd/SKILL.md before starting this task

## Hints
- **Bash:** `git status`

## Instructions
Follow your plan. Make minimal, focused changes.
```

The agent then uses Claude Code's native skill auto-discovery + the explicit hint to load the skill JIT.

### Concrete Template Mockup: Task Mode

```yaml
---
id: task
name: Task Mode
mode: task
workflow_prefix: "TK"

phases:
  - id: p0
    name: Quick Planning
    task_config:
      title: "P0: Plan - scope, approach, verify strategy"
      labels: [phase, phase-0, planning]
    steps:
      - id: understand-task
        title: "Understand and classify the task"
        skills: [quick-planning]
        instruction: |
          Classify the task (chore/feature/fix).
          If larger scope detected, suggest planning or implementation mode.
      - id: context-search
        title: "Quick context search"
        hints:
          - agent:
              subagent_type: "Explore"
              prompt: "Find code patterns and context for the task"
      - id: scope-and-approach
        title: "Define scope and approach"
        instruction: |
          Write a brief plan (3-5 lines): files to change, approach, out of scope.

  - id: p1
    name: Implement
    task_config:
      title: "P1: Implement - make changes, verify as you go"
      depends_on: [p0]
    steps:
      - id: make-changes
        title: "Make the changes"
        skills: [tdd]
      - id: verify-as-you-go
        title: "Verify after each logical change"
        gate:
          bash: "{typecheck_command}"
          expect_exit: 0

  - id: p2
    name: Complete
    task_config:
      title: "P2: Complete - final checks, commit, push"
      depends_on: [p1]
    steps:
      - id: final-verification
        title: "Final verification"
        gate:
          bash: "{test_command}"
          expect_exit: 0
      - id: commit-and-push
        title: "Commit, push, close issue"

global_conditions: [changes_committed]
workflow_id_format: "TK-{session_last_4}-{MMDD}"
---

# Task Mode
For small tasks and chores — combined planning + implementation.
```

### Concrete Template Mockup: Implementation Mode

```yaml
---
id: implementation
name: "Feature Implementation"
mode: implementation

phases:
  - id: p0
    name: Baseline
    task_config:
      title: "P0: Baseline - verify environment, read spec"
    steps:
      - id: read-spec
        title: "Read and understand the spec"
        gate:
          bash: "test -f {spec_path}"
          expect_exit: 0
          on_fail: "Spec not found at {spec_path}."
        hints:
          - read: "{spec_path}"
      - id: verify-environment
        title: "Verify dev environment"

  - id: p1
    name: Claim
    task_config:
      title: "P1: Claim - branch, link issue"
      depends_on: [p0]
    steps:
      - id: create-branch
        title: "Create feature branch"
      - id: claim-github-issue
        title: "Claim GitHub issue"

  - id: p2
    name: Implement
    container: true
    subphase_pattern:
      - id_suffix: impl
        title_template: "IMPL - {task_summary}"
        todo_template: "Implement {task_summary}"
        active_form: "Implementing {phase_name}"
        skills: [tdd, test-protocol]
        gate:
          bash: "{test_command}"
          expect_exit: 0
        hints:
          - read: "{spec_path}"
            section: "## Phase {phase_label}"

  - id: p3
    name: Close
    task_config:
      title: "P3: Close - final checks, PR, close issue"
      depends_on: [p2]
    steps:
      - id: final-checks
        title: "Run final checks"
        skills: [review-protocol]
        gate:
          bash: "{build_command} && {test_command}"
          expect_exit: 0
      - id: commit-and-push
        title: "Commit and push"
      - id: create-pr
        title: "Create pull request"
      - id: close-issue
        title: "Update GitHub issue"

global_conditions: [changes_committed, changes_pushed]
---

# Implementation Mode
Execute the approved spec phase by phase.
```

### Skills Inventory (Batteries)

| Skill | Source | Used By Modes | Content Summary |
|-------|--------|---------------|-----------------|
| `quick-planning` | Exists (eval fixture) | task, debug | Scope analysis, risk identification, verification strategy |
| `tdd` | Exists (eval fixture) | task, implementation | Red-green-refactor methodology |
| `interview` | Extract from planning + batteries/interviews/ | planning | 4 categories of structured interviews via AskUserQuestion |
| `test-protocol` | Extract from implementation template | implementation, task | Build -> test -> check hints, retry limits (max 3) |
| `review-protocol` | Extract from impl + planning templates | implementation, planning | Spawn reviewers, score gates, fix loops |
| `spec-writing` | Extract from planning template | planning | Spec structure, behavior format, VP requirements |
| `debug-methodology` | Extract from debug template | debug | Reproduce -> map -> hypothesize -> trace -> confirm |
| `planning-orchestrator` | Extract from planning template | planning | "Don't do deep work inline" + spawn patterns |

### How Skills Compose with Native Claude Code Features

Claude Code's native skill system provides everything needed:

1. **Auto-discovery**: `.claude/skills/<name>/SKILL.md` — filesystem convention, no registration
2. **JIT loading**: Description always in context (~100 tokens), full content loads only when invoked
3. **Invocation control**: `disable-model-invocation: true` for user-only skills
4. **Dynamic context injection**: `` !`command` `` syntax preprocesses shell output into skill content
5. **Subagent execution**: `context: fork` + `agent: Explore/Plan` for isolated execution
6. **Supporting files**: reference.md, examples/, scripts/ — keep SKILL.md < 500 lines
7. **Argument passing**: `$ARGUMENTS` / `$0` / `$1` for parameterized skills

The template's `skills: [name]` field is a **reliability hint** — it tells the agent explicitly which skill to read for this step. Claude Code also auto-discovers skills by description matching, but explicit declaration ensures 100% activation (matching our eval findings).

### Interview Migration Path

Current: `kata interview <category>` CLI → JSON output → agent drives AskUserQuestion

Proposed: `interview/SKILL.md` as the primary entry point:

```yaml
---
name: interview
description: Run structured interviews to gather requirements, architecture, testing, and design decisions
argument-hint: <category>
---

Run a structured interview for the specified category.

## Available Categories
- **requirements**: Problem statement, happy path, scope, edge cases
- **architecture**: Integration points, error handling, performance
- **testing**: Happy path scenarios, error paths, test types
- **design**: UI reference pages, layout patterns, components

## How to Run

1. Execute: !`kata interview $ARGUMENTS`
2. Parse the JSON output (rounds array)
3. For each round, call AskUserQuestion with the round's question and options
4. Compile answers into a structured summary
```

The skill wraps the existing CLI command via dynamic context injection. No need to rewrite the interview system — just provide a skill entry point.

## Tradeoffs

### Skill-per-methodology vs skill-per-phase

| | Skill-per-methodology | Skill-per-phase |
|--|----------------------|-----------------|
| Example | `tdd`, `review-protocol` | `planning-p1-interview` |
| Reusable across modes? | **Yes** | No |
| Content size | Small, focused | Large, coupled |
| Composable? | **Yes** — mix per step | No |
| Discovery | Clear names | Opaque |

**Verdict:** Skill-per-methodology. Skills are methodologies, not phase scripts.

### Template-declared `skills:` vs pure auto-discovery

| | Template declares | Auto-discovery only |
|--|------------------|---------------------|
| Reliability | **100%** — explicit | ~80% (superpowers data) |
| Template overhead | Must list skill names | Zero changes |
| Flexibility | Update template for new skills | Drop SKILL.md, "just works" |

**Verdict:** Template declares skills per step for reliability. Auto-discovery as fallback for project-specific skills the template doesn't know about.

### Batteries packaging: batteries/skills/ vs .claude/skills/

| | batteries/skills/ (npm package) | .claude/skills/ (project) |
|--|-------------------------------|--------------------------|
| Distribution | `kata batteries --update` syncs | Manual or git |
| Customization | Override by placing same-name in .claude/skills/ | Direct edit |
| Claude Code native | No — needs copy step | **Yes** — auto-discovered |
| Shareable outside kata | No | **Yes** — standard location |

**Verdict:** Ship batteries skills in `batteries/skills/`. `kata setup` and `kata batteries --update` copy them to `.claude/skills/`. Projects own their copies and can customize. This matches the existing batteries/templates pattern.

## Open Questions

1. **Skill validation at entry**: Should `kata enter` validate that all `skills: [name]` referenced in the template exist in `.claude/skills/`? (Mirrors gate placeholder validation)
2. **Skill version tracking**: Should `kata batteries --update` track skill versions like template versions?
3. **Conditional skills**: Some steps should only activate a skill if a condition is met (e.g., TDD only if test infrastructure exists). How to express this?

## Next Steps

- Write spec for the skills migration (extract methodologies from templates into SKILL.md files)
- Add `skills` field to `phaseStepSchema` and `subphasePatternSchema`
- Create batteries/skills/ directory with initial skill set
- Update `kata setup` and `kata batteries --update` to sync skills
- Convert one template (task.md) as proof of concept

## Sources

- [Claude Code Skills Documentation](https://code.claude.com/docs/en/skills)
- [Agent Skills Overview](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview)
- [Superpowers v5 (obra/superpowers)](https://github.com/obra/superpowers)
- [Skill Activation Reliability Investigation](planning/research/2026-04-05-skill-activation-reliability.md)
- [Skills vs Modes Superpowers Analysis](planning/research/2026-04-05-skills-vs-modes-superpowers-analysis.md)
- [Modular Template System Research](planning/research/2026-04-02-modular-template-system.md)
- [Composio: Top Claude Code Skills](https://composio.dev/content/top-claude-skills)
- [Medium: Skills composition at scale](https://medium.com/@arjangiri.jobs/your-claude-code-setup-has-5-skills-heres-what-happens-after-50-faa7884c9957)
- [Addy Osmani: LLM coding workflow 2026](https://addyosmani.com/blog/ai-coding-workflow/)
