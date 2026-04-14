---
description: "Spec review with external review agent, fix loop, and re-review until passing score."
context: inline
---

# Spec Review

You are running a review-fix loop on the spec written in P2. The goal is a spec that scores 90+ and passes all checklist items.

## Protocol

### 1. Run the external review agent

Spawn the review agent via Bash:

```bash
kata review --prompt=spec-review
```

This runs an independent agent that reads the spec and produces a scored assessment (0-100) with categorized issues.

### 2. Read the review output

The review agent outputs:
- **SPEC_SCORE:** N/100
- **Status:** PASS or GAPS_FOUND
- **Issues:** categorized as Critical, Important, Minor
- **Strengths:** what's done well

### 3. Fix loop

If GAPS_FOUND or score < 90:

1. Create a child task for each **Critical** issue (these block approval)
2. Create a child task for each **Important** issue (should fix before approval)
3. **Minor** issues — fix inline if trivial, skip if cosmetic
4. Fix each issue directly in the spec file
5. After all fixes, re-run `kata review --prompt=spec-review`
6. Repeat until score >= 90 and status is PASS

### 4. Max iterations

Cap at 3 review-fix cycles. If the spec still doesn't pass after 3 rounds:
- Document remaining issues
- Ask the user whether to approve with known gaps or continue fixing

## What the review checks

### Completeness
- All behaviors have ID, Trigger, Expected, Verify
- No placeholder text (TODO, TBD, unfilled variables)
- Non-goals section present and specific
- Implementation phases cover all behaviors

### Clarity
- Behaviors are unambiguous — a developer could implement from spec alone
- API contracts are concrete (types, endpoints, error codes)
- Phase boundaries are clear

### Feasibility
- Phases are realistic (not too large for a single session)
- Dependencies between phases make sense

### Testability
- Each behavior has a concrete verification method
- Test cases are specified per phase
- Acceptance criteria are deterministic

### Scope
- Non-goals prevent scope creep
- Open questions are resolved (not left as TODOs)

## Rules

- **Don't just report — fix.** The review agent reports, you fix.
- **Be specific in fixes** — reference exact behavior IDs and sections
- **Don't weaken the spec to pass** — if a behavior is incomplete, complete it; don't remove it
- **Preserve intent** — fixes should align with interview decisions from P1
