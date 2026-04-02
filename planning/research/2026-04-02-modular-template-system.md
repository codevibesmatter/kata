---
date: 2026-04-02
topic: Modular template system with formal action schema
status: draft
supersedes: planning/specs/35-consolidated-config.md
---

# Research: Modular Template System

## Context

Issue #35 (consolidated config) proposed absorbing interviews and subphase patterns into kata.yaml. During review, we identified fundamental problems:

1. **Interviews aren't shared** — `loadInterviewConfig()` has zero callers in src/commands/. The planning template references interviews in prose; the agent reads the YAML file directly. No programmatic loading.
2. **Subphase patterns aren't shared** — `loadSubphasePatterns()` is called exactly once, by exactly one template (`implementation.md`), for exactly one pattern (`impl-test-review`).
3. **The "shared registry" argument is hollow** — absorbing into kata.yaml complicates the sync model (structural merge) for no actual sharing benefit.
4. **Templates encode 125+ actions as unstructured prose** — bash commands, tool calls, agent spawns, conditionals, gates, and file operations are all embedded in markdown instructions with no formal structure.

## Design Direction: Hybrid Executable/Hint Template System

### Core Principle

- **Gates** (validation, review thresholds, preconditions) are **executable** — runtime enforces them
- **Creative work** (implementation, research, writing, debugging) stays **agent-driven** with typed hints
- **Subphase patterns** inline into template frontmatter (only one consumer)
- **Interviews** become a callable skill/system, not a config section

### Proposed Schema Shape

```yaml
phases:
  - id: p0
    name: Baseline
    steps:
      - id: read-spec
        # Executable gate — runtime enforces
        gate:
          bash: "grep 'status:' {spec_path}"
          expect: "approved"
          on_fail: "Spec not approved — run kata enter planning --issue={issue}"

        # Typed hints — agent uses for guidance, runtime can validate
        hints:
          - read: "{spec_path}"
          - understand: [behaviors, phases, non-goals]

        # Prose instruction — agent context for judgment calls
        instruction: |
          Read the spec in full. Understand all behaviors and phases.

      - id: verify-env
        gate:
          bash: "{test_command}"
          expect_exit: 0
          on_fail: "Tests failing on clean tree — fix before proceeding"
        hints:
          - bash: "git status"
          - bash: "git log --oneline -3"

  - id: p1
    name: Implement
    # Subphase pattern inlined (no external registry needed)
    subphases:
      - id_suffix: impl
        title_template: "IMPL - {task_summary}"
        hints:
          - read: "{spec_path}"
            section: "B{n}"
          - skill: "interview requirements"
            when: "scope_unclear"
        instruction: |
          Implement the behavior described in the spec phase.

      - id_suffix: test
        gate:
          bash: "{test_command}"
          expect_exit: 0
          max_retries: 3
          on_exhaust: escalate
        hints:
          - bash: "{build_command}"
          - bash: "{typecheck_command}"

      - id_suffix: review
        gate:
          agent: review-agent
          prompt: code-review
          threshold: 75
          max_retries: 3
          on_exhaust: escalate
        hints:
          - diff: "HEAD~1"
```

### Action Types to Formalize

| Category | Executable (gate) | Hint (agent-driven) |
|----------|-------------------|---------------------|
| **Bash** | `gate.bash` with `expect`/`expect_exit` | `hints[].bash` |
| **Tool calls** | — | `hints[].read`, `hints[].write`, `hints[].search` |
| **Skills** | `gate.skill` with threshold | `hints[].skill` |
| **Agent spawns** | `gate.agent` with threshold | `hints[].agent` with subagent_type |
| **Assertions** | `gate.assert` (contains, regex, exit code) | — |
| **Conditionals** | `gate.when` (precondition check) | `hints[].when` (conditional hint) |
| **User interaction** | — | `hints[].ask` (AskUserQuestion pattern) |

### Key Questions to Resolve

1. **Placeholder system** — What variables are available? `{spec_path}`, `{issue}`, `{test_command}`, `{build_command}`, `{reviewers}`. How do they resolve? From kata.yaml project config? From session state? From prior step output?

2. **Gate failure semantics** — Three options: abort (hard stop), retry (with max), escalate (AskUserQuestion). Current templates use all three inconsistently in prose. Need formal `on_fail` enum.

3. **Hint validation** — Should runtime warn if a required hint wasn't attempted? Or are hints purely advisory? Middle ground: hints with `required: true` generate warnings in stop-hook.

4. **Skill system** — Interviews as a skill means defining a skill interface. What does `kata skill interview requirements` look like? Is it a CLI command, an agent, or a template fragment?

5. **Subphase inlining** — If patterns are always inline in the template, how does `kata update` sync them? Template-level file comparison (same as today's proposal) should work since it's all one file.

6. **Backward compatibility** — Current templates are pure markdown with YAML frontmatter. Migration path: support both old (prose-only) and new (hints+gates) formats during transition?

7. **Container phase evolution** — Does the `container: true` concept survive? Or do subphases become a first-class phase feature that any phase can use (not just "container" phases)?

## What #35 Got Right (Keep)

- `kata setup` as single-shot skeleton creation
- `kata update` with file-level upstream sync
- `kata migrate` for old layout conversion
- Removing the batteries 2-tier runtime lookup
- `kata_version` tracking

## What #35 Got Wrong (Drop/Redesign)

- Absorbing interviews into kata.yaml (interviews should be a skill/system)
- Absorbing subphase patterns into kata.yaml (patterns should inline in templates)
- Not addressing the unstructured prose problem in templates
- Keeping the template action model unchanged

## Next Steps

- [ ] Design the hint/gate schema in detail (Zod types)
- [ ] Prototype: convert implementation.md to new format
- [ ] Design interview skill interface
- [ ] Decide on placeholder resolution chain
- [ ] Write superseding spec
