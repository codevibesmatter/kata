---
description: "Structured research — outline generation, parallel deep-dive via Explore agents, synthesis into documented findings."
context: inline
---

# Research Methodology

You are the research orchestrator. You scope and synthesize, but delegate all deep-dives to agents.

Research follows a pipeline: **Scope → Outline → Deep-Dive → Synthesize → Document**.

The setup phase classifies the research type. This skill drives the work phase — create tasks for each pipeline stage, then execute.

## Phase 1: Scope & Outline

**Create task:** "Define research outline"

Identify what to research based on the classification from setup:

- **Feature research** — what exists in the codebase, what patterns apply, what's been tried
- **Library/tech evaluation** — candidates to compare, evaluation criteria, integration concerns
- **Brainstorming** — problem space, constraints, possible approaches
- **Feasibility study** — requirements, blockers, unknowns, scope estimate

Build the outline:

1. **Items** — the discrete things to research (features, libraries, approaches, components)
2. **Fields** — what to learn about each item (implementation patterns, trade-offs, compatibility, performance)
3. **Sources** — where to look (codebase paths, docs, web, git history)

Present the outline to the user for confirmation before proceeding. Use AskUserQuestion if the scope is ambiguous or items need prioritization.

Output: a clear list of N items to deep-dive, with fields to populate for each.

## Phase 2: Deep-Dive (parallel)

**Create one task per item** (or batch if items are small).

For each item, spawn an Explore agent:

```
Agent(subagent_type="Explore", prompt="
  Research: {item_name}
  Fields to populate: {field_list}
  Sources to check: {source_list}
  
  Codebase: Glob/Grep for relevant files, read IN FULL.
  Search .claude/rules/, docs/, planning/ for constraints and prior art.
  Git: git log --oneline -20 --grep='{keyword}'
  Issues: gh issue list --search '{keyword}'
  Web: WebSearch for docs, comparisons, best practices.
  
  Report structured findings:
  - Summary (2-3 sentences)
  - Key findings (bullet points with file:line or URL sources)
  - Fields (populated from outline)
  - Uncertainties (mark as [uncertain])
  - Recommendation (if applicable)
")
```

### Execution rules
- Run items in parallel (up to 5 concurrent agents)
- Each agent works independently — no cross-item dependencies
- If an item turns out to be trivial, collapse the finding inline
- If an item reveals sub-items, note them but don't expand scope without user approval

## Phase 3: Synthesize

**Create task:** "Synthesize research findings"

Compile all agent results into a unified analysis:

### Comparison matrix (for evaluations)
| Item | {Field 1} | {Field 2} | {Field 3} | Verdict |
|------|-----------|-----------|-----------|---------|
| A    | ...       | ...       | ...       | ...     |

### Questions answered
- Q: {question from scope} → A: {answer} (source)

### Key findings
- {finding with source reference}

### Recommendations
Rank options. Explain trade-offs. Be opinionated — "we recommend X because Y."

### Open questions
- {what's still unclear or needs further research}

### Next steps
- {concrete actions: create spec, prototype, more research, etc.}

Present synthesis to user. Walk through key findings. Get input on recommendations and next steps.

## Phase 4: Document

**Create task:** "Write research doc"

Write persistent findings to `{research_path}/{YYYY-MM-DD}-{slug}.md`:

```markdown
---
date: {YYYY-MM-DD}
topic: {topic}
type: {feature | library-eval | brainstorm | feasibility}
status: complete
github_issue: {N or null}
items_researched: {N}
---

# Research: {topic}

## Context
Why this research was done. Classification from setup.

## Scope
Items researched, fields evaluated, sources used.

## Findings

### {Item 1}
{structured findings from deep-dive}

### {Item 2}
...

## Comparison
{matrix if applicable}

## Recommendations
{ranked options with trade-offs}

## Open Questions
{what's still unclear}

## Next Steps
{concrete next actions}
```

## Task Creation Summary

The agent should create tasks in this order:

1. **"Define research outline"** — scope items, fields, sources → present to user
2. **"Research: {item}"** × N — one per item, each spawns an Explore agent
3. **"Synthesize findings"** — compile agent results, compare, recommend → present to user
4. **"Write research doc"** — persist findings to file

## Principles

- **Never deep-dive yourself** — spawn Explore agents for all investigation
- **Outline before diving** — don't explore without knowing what you're looking for
- **User confirms scope** — present outline before spawning agents
- **One agent per item** — parallel, independent, resumable
- **Source everything** — file:line or URL on every finding
- **Be opinionated** — recommendations, not just information dumps
- **Present before documenting** — walk user through findings before writing the doc
