---
description: "Spec writing methodology — build from research + interview findings, behaviors with B-IDs and layers, implementation phases, verification plan."
context: inline
---

# Spec Writing

You are writing a feature spec. By the time you run, codebase research (P0) and user interview (P1) are already complete. Your job is to synthesize those findings into a clear, implementable specification.

## Inputs You Already Have

- **Research findings** from P0 — relevant code paths, existing patterns, similar features
- **Requirements Summary** from P1 interview — every decision made, organized by category
- **Open Risks** from P1 — decisions where uncertainty remains
- **GitHub issue** — the original feature request with context

Read these before writing. Do NOT re-research the codebase from scratch — build on what's already been gathered. Only do targeted lookups if something from the interview needs verification (e.g., confirming a file path or checking a schema).

## Steps

1. Create the spec file at `planning/specs/{issue-N}-{slug}.md`
2. Write the spec (see structure below)
3. Label the issue: `gh issue edit {issue_number} --remove-label "status:todo" --add-label "status:in-progress" --add-label "needs-spec"`

## Spec Structure

A spec file with YAML frontmatter and prose sections.

### Frontmatter

```yaml
---
initiative: {slug}
type: project
issue_type: feature
status: draft
priority: medium
github_issue: {N or null}
created: {YYYY-MM-DD}
updated: {YYYY-MM-DD}
phases:
  - id: p1
    name: "{Phase Name}"
    tasks:
      - "{Concrete task 1}"
      - "{Concrete task 2}"
    test_cases:
      - "{What to test after this phase}"
---
```

### Prose Sections

#### Overview
1-3 sentences: what problem this solves, for whom, and why now.

#### Feature Behaviors
Each behavior gets a B-ID and full layer breakdown:

```
### B{N}: {Name}

**Core:**
- **ID:** {kebab-slug}
- **Trigger:** {what causes this — user action, API call, event}
- **Expected:** {what must happen}
- **Verify:** {concrete test or observation — not "verify it works"}
**Source:** {file:line if modifying existing code}

#### UI Layer
{Component names, states, error messages, loading states}

#### API Layer
{Endpoint, method, request shape, response shape, error codes}

#### Data Layer
{Schema changes, migrations, new fields, indexes}
```

Not every behavior needs all layers — skip layers that don't apply (e.g., no UI Layer for a backend-only behavior). But every behavior MUST have the Core fields filled.

#### Non-Goals
Explicit list of what is NOT being built. Pull these directly from the interview's scope exclusions and open risks.

#### Implementation Phases
2-5 phases in frontmatter with concrete tasks per phase. Each phase:
- Should be completable in 1-4 hours
- Has a clear "done" state
- Includes `test_cases` — what to verify after the phase

#### Verification Plan
Concrete, executable steps a fresh agent can run without any context:
- Every step must be a literal command, URL, or UI action
- Include expected response bodies, status codes, or visible UI state
- "Verify that it works" is NOT a valid step
- Steps should cover all behaviors

#### Implementation Hints
1. **Key Imports** — exact package subpath exports the implementer will need
2. **Code Patterns** — 2-5 copy-pasteable snippets from similar existing features
3. **Gotchas** — subpath export quirks, peer deps, TS config, known footguns
4. **Reference Docs** — URLs with one-line descriptions of what's useful in each

## Quality Rules

- **No placeholder text** — every `{variable}` must be filled. No TBD, TODO, or "to be determined"
- **Real file paths** — reference files that actually exist (or explicitly mark as "new file")
- **Testable verification** — every Verify field describes a concrete, repeatable test
- **Complete coverage** — every decision from the interview must map to at least one behavior
- **Non-goals are mandatory** — if the interview identified scope exclusions, they go here
