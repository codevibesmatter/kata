---
description: "Spec review methodology — check completeness, behaviors have acceptance criteria, non-goals section, phases with tasks."
context: fork
---

# Spec Review

## Review Checklist

- [ ] All behaviors have ID, Trigger, Expected, Verify
- [ ] No placeholder text (TODO, TBD, {unfilled})
- [ ] File paths reference real files
- [ ] Phases are right-sized (1-4 hours each)
- [ ] Non-goals explicitly stated
- [ ] Behaviors are testable (Verify is concrete)
- [ ] API changes include request + response shapes

## What to Check

### Completeness
- Does every behavior have all Core fields filled?
- Are there implicit behaviors not captured?
- Do non-goals cover the obvious "but what about..." questions?

### Clarity
- Can an implementer read each phase and know exactly what to build?
- Are behavior triggers unambiguous?
- Are expected outcomes specific enough to test?

### Feasibility
- Are phases right-sized (not too big or too small)?
- Do phases have a logical dependency order?
- Are there hidden technical risks not mentioned?

### Consistency
- Do behavior IDs follow kebab-case convention?
- Do phases in frontmatter match the prose?
- Are file paths consistent throughout?

## Output Format

```
## Spec Review: {spec title}

### Summary
{1-3 sentence overview of spec quality}

### Issues Found

#### Critical (blocks implementation)
- {section} — {issue description}
  {explanation and suggested fix}

#### Important (should fix before approval)
- {section} — {issue description}

#### Minor (consider)
- {section} — {suggestion}

### Verdict
{APPROVE / REQUEST CHANGES / NEEDS DISCUSSION}

Reason: {1-2 sentences}
```

## Rules

- **Be specific** — reference exact sections and behaviors, never vague criticism
- **Explain why** — not just "this is incomplete" but "this behavior needs X because Y"
- **Prioritize** — distinguish critical gaps from nice-to-haves
- **Be constructive** — suggest the fix, not just the problem
- **No changes** — document findings only, return to orchestrator
