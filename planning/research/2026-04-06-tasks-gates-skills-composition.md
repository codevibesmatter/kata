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

### The Four-Layer Model

| Layer | Owns | Mechanism | Enforcement Tier |
|-------|------|-----------|-----------------|
| **Tasks** (template frontmatter) | What to do, in what order | Native task system + dependency chains | Hard (hooks block out-of-order work) |
| **Gates** (template frontmatter) | Quality bars that must pass | Bash assertions with exit code checks | Hard (hooks block task completion on failure) |
| **Skills** (`.claude/skills/`) | How to do each type of work | Agent reads SKILL.md, follows methodology | Medium (explicit declaration + auto-discovery) |
| **Hooks** (`.claude/settings.json`) | Enforcement of all the above | Deterministic code, fires every time | Hard (cannot be bypassed by the agent) |

Hooks are not a separate concern from the other three — they're the **enforcement backbone** that makes tasks, gates, and skills real. Without hooks:
- Tasks are just suggestions (agent could skip phases)
- Gates are just hints (agent could ignore test failures)
- Skills are just context (agent could "wing it" without reading)

With hooks:
- `task-deps` (PreToolUse) blocks tool use when task dependencies aren't met
- `task-evidence` (PreToolUse) runs gate bash commands when a task tries to complete, blocks on failure
- `mode-gate` (PreToolUse) prevents writes outside the current mode's scope
- `stop-conditions` (Stop) blocks session exit while tasks are incomplete
- `session-start` (SessionStart) initializes session state and injects mode context
- `user-prompt` (UserPromptSubmit) detects mode intent and suggests entering a mode

#### How Hooks Enforce Gates

Today gates are declared in templates but enforcement is agent-trust-based — the instruction says "tests must pass" and the agent is expected to comply. With hook-backed enforcement:

```
Agent calls TaskUpdate(status="completed") on a step with a gate
  → PreToolUse hook fires (task-evidence)
  → Hook reads the step's gate from template: bash: "{test_command}", expect_exit: 0
  → Hook resolves placeholders from kata.yaml
  → Hook executes the bash command
  → If exit code != 0: hook returns { continue: false, reason: "Gate failed: tests failing" }
  → Agent cannot mark the task complete until the gate passes
```

This turns gates from "please check tests" into "you literally cannot proceed until tests pass."

#### How Hooks Enforce Skill Activation

Skills are activated reliably (100% in evals), but a hook could add hard enforcement:

```
Agent calls Edit/Write on a file during a step with skills: [tdd]
  → PreToolUse hook fires (skill-evidence)
  → Hook checks transcript: was .claude/skills/tdd/SKILL.md read?
  → If not: hook returns { continue: false, reason: "Read TDD skill before writing code" }
```

This is likely overkill given 100% activation reliability, but the option exists. More practical: a stop-condition hook that checks all declared skills were read during the session.

#### Skills Can Declare Their Own Hooks

Claude Code's native skill system supports `hooks:` in SKILL.md frontmatter:

```yaml
---
name: tdd
description: Test-driven development methodology
hooks:
  PreToolUse:
    - matcher: "Edit|Write"
      command: "check-test-first.sh"
---
```

This means skills can self-enforce — a TDD skill could block writes unless a test file was modified first. This is powerful but should be used sparingly to avoid hook conflicts.

### Two-Layer Skill Model: Meta + Step

Skills load at two points — mode entry and per-step:

| Layer | When Loaded | Content | Size |
|-------|------------|---------|------|
| **Mode skill** | `kata enter <mode>` (once) | Role, phase flow overview, key rules, anti-patterns | ~50-100 lines |
| **Step skill** | Agent starts a task with `skills:` | Specific methodology for the work at hand | ~100-300 lines |

**Mode skills** replace the current markdown body below `---` in templates. Today that prose gets injected at session start and compresses away over long sessions. As a skill, it gets loaded via Claude Code's native system and stays discoverable.

**Step skills** inject methodology JIT when the agent actually needs it — not at session start when it's irrelevant, and not compressed away 2 hours later.

The template declares the mode skill at the top level:

```yaml
---
id: implementation
mode: implementation
mode_skill: implementation-mode    # ← loaded at entry
phases: [...]
---
# (no markdown body — it's all in the skill)
```

**One skill per step.** Claude Code's Skill tool invokes one skill at a time. If a step needs both TEST protocol and orchestrator details, combine them into a single skill rather than forcing two sequential invocations.

### Swappable Methodologies

Skills decouple **structure** (what must happen) from **methodology** (how to do it). Projects can swap skills without changing the template:

```yaml
# Default batteries template:
subphase_pattern:
  - id_suffix: impl
    skills: [implementation]     # TDD + TEST protocol
    gate:
      bash: "{test_command}"
      expect_exit: 0
```

A project overrides by placing a different skill at `.claude/skills/implementation/SKILL.md`:

| Project Style | Skill Content | Gate Still Runs? |
|--------------|---------------|------------------|
| Strict TDD | Red-green-refactor, test-first mandatory | Yes — tests must pass |
| Prototype-first | Write code first, add tests after | Yes — tests must pass |
| No tests | Skip test protocol, focus on types + lint | Gate uses `{typecheck_command}` instead |
| AI-review-heavy | Spawn 3 review agents, consensus required | Yes — review score gate |

The **gate enforces the quality bar**. The **skill determines the path to get there**. Same template, different methodologies, same guardrails.

This also enables project-specific skills that batteries templates don't know about. A game studio might have a `performance-budget/SKILL.md` that the agent auto-discovers when touching rendering code — no template change needed.

### Current Template Content Classification

Analyzing all batteries templates (task, implementation, planning, debug, research), each piece of content falls into one of three buckets:

**Stays in template (structure + gates):**
- Phase definitions, ordering, dependencies (`phases:`, `depends_on:`)
- Task config with titles and labels (`task_config:`)
- Gate blocks with bash assertions (`gate:`)
- Container + subphase pattern for spec-driven expansion
- Global conditions / stop hooks

**Becomes a mode skill (loaded at entry):**
- Implementation orchestrator role + phase flow + key rules → `implementation-mode`
- Planning orchestrator role + spawn patterns + anti-patterns → `planning-mode`
- Debug hypothesis-driven overview + observability tools → `debug-mode`
- Task "do less, verify more" + scope guidelines → `task-mode`
- Research parallel exploration + synthesis patterns → `research-mode`

**Becomes a step skill (loaded JIT per task):**
- Implementation TEST protocol + orchestrator details → `implementation`
- Code review spawn + score gate + fix loop → `code-review`
- Interview workflow (4 categories) → `interview`
- Spec structure + behavior format + VP requirements → `spec-writing`
- TDD red-green-refactor → `tdd` (already exists)
- Quick planning scope + risk → `quick-planning` (already exists)
- Debug reproduce → map → hypothesize → trace → `debug-methodology`

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

New fields at template level and on steps/subphase patterns:

```typescript
// In templateYamlSchema — add:
mode_skill: z.string().optional()    // skill loaded at mode entry

// In phaseStepSchema — add:
skill: z.string().optional()         // single skill per step (not array)

// In subphasePatternSchema — add:
skill: z.string().optional()         // single skill per subphase task
```

**Why `skill` (singular) not `skills` (array):** Claude Code's Skill tool invokes one skill at a time. Multiple skills per step would require sequential invocations, splitting methodology across context injections. If a step needs multiple methodologies, combine them into one skill.

Template YAML usage:

```yaml
---
id: implementation
mode: implementation
mode_skill: implementation-mode      # loaded at kata enter
phases:
  - id: p2
    container: true
    subphase_pattern:
      - id_suffix: impl
        skill: implementation        # loaded when agent starts each P2.X task
        gate:
          bash: "{test_command}"
          expect_exit: 0
---
```

At mode entry, `kata enter` outputs the mode skill reference in session-start hook context. At task creation time (`task-factory.ts`), step skill references render into the task instruction:

```markdown
## Skill
Read /implementation before starting this task.

## Hints
- **Read:** {spec_path} (section: ## Phase P2.1)

## Instructions
Implement the behavior described in the spec phase.
```

The agent invokes the skill via `/implementation` (Claude Code native Skill tool) or reads `.claude/skills/implementation/SKILL.md` directly.

### Concrete Template Mockup: Task Mode

```yaml
---
id: task
name: Task Mode
mode: task
mode_skill: task-mode              # "do less, verify more" + scope guidelines
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
        skill: quick-planning
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
        skill: tdd
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
# (no markdown body — mode_skill handles it)
```

### Concrete Template Mockup: Implementation Mode

```yaml
---
id: implementation
name: "Feature Implementation"
mode: implementation
mode_skill: implementation-mode    # orchestrator role, phase flow, key rules

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
        skill: implementation              # TEST protocol + orchestrator details
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
        skill: code-review                 # spawn reviewers, score gate, fix loop
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
# (no markdown body — mode_skill handles it)
```

### Skills Inventory (Batteries)

**Mode skills** (loaded once at `kata enter`):

| Skill | Source | Content |
|-------|--------|---------|
| `task-mode` | Extract from task.md markdown body | "Do less, verify more", scope guidelines, when NOT to use task mode |
| `implementation-mode` | Extract from implementation.md markdown body | Orchestrator role, phase flow diagram, key rules, anti-patterns |
| `planning-mode` | Extract from planning.md markdown body | Orchestrator role, spawn patterns, anti-patterns, interview categories |
| `debug-mode` | Extract from debug.md markdown body | Hypothesis-driven overview, observability tools, bug type table |
| `research-mode` | Extract from research.md markdown body | Parallel exploration patterns, synthesis structure |

**Step skills** (loaded JIT per task):

| Skill | Source | Used By | Content |
|-------|--------|---------|---------|
| `quick-planning` | Exists (eval fixture) | task P0 | Scope, risk, verification strategy |
| `tdd` | Exists (eval fixture) | task P1 | Red-green-refactor |
| `implementation` | Extract from impl template | implementation P2 | TEST protocol + orchestrator details for each spec phase |
| `code-review` | Extract from impl + planning | implementation P3, planning P3 | Spawn reviewers, score gate (75), fix loop (max 3) |
| `interview` | Extract from planning + batteries/interviews/ | planning P1 | 4 categories via AskUserQuestion |
| `spec-writing` | Extract from planning template | planning P2 | Spec structure, behavior format, VP requirements |
| `debug-methodology` | Extract from debug template | debug P0-P1 | Reproduce → map → hypothesize → trace → confirm |

**5 mode skills + 7 step skills = 12 total.** Each step references at most one skill. Projects can swap any step skill by placing a different SKILL.md at the same path.

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

### One skill per step (combining methodologies)

Claude Code's Skill tool invokes one skill at a time. If a step conceptually needs both "TEST protocol" and "orchestrator details," don't declare two skills — combine them into one (`implementation`) that bundles everything the agent needs for that step.

| Approach | Invocations | Context | Practical? |
|----------|-------------|---------|------------|
| `skill: implementation` (combined) | 1 | All methodology in one load | **Yes** |
| `skills: [test-protocol, orchestrator]` | 2 sequential | Split across loads | No — agent reads first, may not read second |

Skills are still methodology-scoped (not phase-scoped) — `implementation` is reusable wherever the agent needs to run tests and orchestrate. But it's a single coherent document, not two separate skills stapled together.

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

### Hook-backed gate enforcement vs agent-trust gates

| | Hook-enforced gates | Agent-trust gates (current) |
|--|--------------------|-----------------------------|
| Reliability | **100%** — deterministic code | ~95% — agent usually complies |
| Complexity | Hook must parse template, resolve placeholders, execute bash | Zero runtime code |
| Latency | Adds bash execution to every TaskUpdate | None |
| Debugging | Hook failures are explicit | Agent might silently skip |
| Scope creep risk | Hook code must stay in sync with template schema | Template is self-contained |

**Verdict:** Hook-enforce gates for critical quality bars (test_command, build_command). Leave lightweight gates (file existence checks, git status) as agent-trust. The `gate:` schema already distinguishes these — gates with `expect_exit: 0` are candidates for hook enforcement.

## Open Questions

1. **Skill validation at entry**: Should `kata enter` validate that all `skills: [name]` referenced in the template exist in `.claude/skills/`? (Mirrors gate placeholder validation)
2. **Skill version tracking**: Should `kata batteries --update` track skill versions like template versions?
3. **Conditional skills**: Some steps should only activate a skill if a condition is met (e.g., TDD only if test infrastructure exists). How to express this?
4. **Hook-gate boundary**: Which gates get hook enforcement vs agent trust? Should this be a per-gate field (`enforce: true`)?
5. **Skill-scoped hooks**: Should batteries skills ship with their own hooks, or should hook registration remain centralized in settings.json?

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
