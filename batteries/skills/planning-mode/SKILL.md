---
name: planning-mode
description: "Feature planning with research, interviews, spec writing, and review. Activate when entering planning mode."
---

# Planning Mode

You are in **planning** mode. Create a feature spec through research, interviews, writing, and review.

## Orchestrator Role

**You coordinate work. You do not do deep work inline.**

Spawn agents for research, spec writing, and review. This preserves your context
window for orchestration — tracking progress, asking the user questions, and
verifying agent outputs.

| Action | Do this | Not this |
|--------|---------|----------|
| Understand codebase | `Task(subagent_type="Explore", ...)` | Read 20 files inline |
| Write spec content | `Task(subagent_type="general-purpose", ...)` | Write 200 lines of spec yourself |
| Review spec | `Task(subagent_type="general-purpose", ...)` | Re-read entire spec to check quality |

**What you DO inline:**
- Ask the user questions (AskUserQuestion)
- Run CLI commands (gh, kata, git)
- Quick verification reads (confirm agent output, check for placeholders)
- Compile context for agent prompts

**Self-check before each action:**
> "Am I about to read source files to understand code?" → Spawn Explore agent instead.
> "Am I about to write spec content?" → Spawn a writer agent instead.

## Phase Flow

```
P0: Research
    ├── Clarify scope + GitHub issue
    └── Codebase research (Explore agent)

P1: Interview
    ├── Requirements (problem, happy path, scope, edge cases)
    ├── Architecture (integration, errors, performance)
    ├── Testing Strategy (happy path, error paths, test types)
    ├── UI Design (skip if backend-only)
    └── Requirements Approval (compile summary, user sign-off)

P2: Spec Writing
    ├── Create spec file from template
    ├── Spawn spec writer agent (with all P0+P1 context)
    ├── Verify spec completeness
    └── Link GitHub issue

P3: Review Gate
    ├── Spec review via configured provider (kata review --prompt=spec-review)
    ├── Fix loop (max 3 passes, score >= 75 to pass)
    └── Escalate to user if gate fails after 3 passes

P4: Finalize
    ├── Mark approved
    ├── Commit + push
    └── Comment on GitHub issue
```

## Interview Categories

The interview phase uses categories from `batteries/interviews.yaml`.
Projects can customize questions by editing `.kata/interviews.yaml`.

| Category | What it covers |
|----------|---------------|
| Requirements | Problem statement, happy path, scope boundaries, edge cases (empty state, scale, concurrency) |
| Architecture | Integration points, error handling, performance requirements |
| Testing | Happy path scenarios, error paths, test types |
| Design | Reference pages, layout patterns, reusable components (skipped for backend-only) |

## Anti-Patterns

### Inline research (wastes context)
```
# BAD — 10,000 tokens of source code polluting your context
Read(file1.ts)    → 500 tokens
Read(file2.ts)    → 500 tokens
...20 files       → 10,000 tokens

# GOOD — 250 tokens, agent reads 20 files internally
Task(subagent_type="Explore", prompt="Find patterns related to X")
TaskOutput(task_id=..., block=true)  → 200 token summary
```

### Writing spec content yourself
```
# BAD — you're writing 200 lines of spec content
Edit(file="planning/specs/123-feature.md", ...)

# GOOD — agent writes, you verify
Task(subagent_type="general-purpose", prompt="
  SPEC FILE: planning/specs/123-feature.md
  RESEARCH: [findings from P0]
  REQUIREMENTS: [approved answers from P1]
  Fill all sections. No TBD placeholders.
")
```

### One-shot review (no fix loop)
```
# BAD — review finds issues, you just "address" them vaguely
kata review --prompt=spec-review → score 58/100
# ... move on anyway

# GOOD — review gate with fix loop (max 3 passes)
kata review --prompt=spec-review → score 58/100 (GAPS_FOUND)
Task(prompt="Fix these issues in spec") → fixed
kata review --prompt=spec-review → score 82/100 (PASS)
# Gate cleared in 2 passes
```

### Configuring the spec reviewer

Projects can override which provider runs spec reviews in `wm.yaml`:

```yaml
reviews:
  spec_reviewer: gemini    # or 'claude', 'codex', etc.
```

The template uses `${providers.spec_reviewer}` which resolves from
`reviews.spec_reviewer` → `providers.default` → `'claude'` (fallback chain).

## Stop Conditions

- Spec file exists with `status: approved`
- Changes committed and pushed
- GitHub issue linked or explicitly skipped
