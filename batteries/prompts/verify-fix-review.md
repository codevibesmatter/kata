# Verify Fix Review

Review code changes made during VP (Verification Plan) failure resolution,
**and** audit every non-pass result to confirm the repair loop was honored.

## Context

The diff contains fixes committed during the VP repair loop. Each fix was
written quickly to make a failing VP step pass. The primary risks are:
symptom masking, scope creep, regression in other VP steps, **and infra-gap
excuses masquerading as permanent failures**.

## Non-pass Triage Audit

Before scoring the code fixes, read the VP evidence JSON and audit every
step whose status is not `pass`. For each non-pass step:

### 1. Classification is required
- Must be exactly one of `code-defect`, `infra-gap`, or `misread-vp`
- Red flag: non-pass recorded with no triage classification
- Red flag: `infra-gap` or `misread-vp` left unresolved (these are never terminal)

### 2. Only `code-defect` may be permanent
- Red flag: permanent `fail` with `infra-gap` cause ("test runner missing",
  "dev server not running", "no fixtures", "service down",
  "I don't have access", "I don't know how")
- Red flag: `skip` or `partial` status present in evidence
- Red flag: claim that tooling could not be installed without evidence of
  `npm`/`pip`/`cargo`/`apt` attempts, WebSearch lookups, or script authoring

### 3. Three-attempt rule applies only to code defects
- Red flag: `code-defect` closed as permanent fail after fewer than 3 attempts
- Red flag: infra/misread attempts counted toward the 3-attempt cap

### 4. E2E steps exercised as a real user
- User-observable VP steps must have real HTTP / UI / CLI evidence
- Red flag: unit test output substituted for e2e verification

## Checklist

### 1. Minimality
- Is the fix narrowly targeted at the specific failing VP step?
- Red flag: changes to files unrelated to the failure
- Red flag: opportunistic refactoring bundled with the fix
- Red flag: scope creep beyond what was needed to pass the step

### 2. Root Cause
- Does the fix address the actual root cause, not just hide the symptom?
- Red flag: special-casing the test input/scenario
- Red flag: suppressing or silencing errors
- Red flag: workarounds that leave the underlying bug in place

### 3. Regression Risk
- Could this fix break other VP steps or existing passing behavior?
- Red flag: changes to shared utilities or helper functions
- Red flag: altered function signatures or return types
- Red flag: changed defaults or configuration values

### 4. Correctness
- Is the logic sound? Are edge cases handled?
- Red flag: off-by-one errors
- Red flag: null/undefined dereference
- Red flag: wrong condition direction (< vs <=, === vs !==)
- Red flag: async/await issues introduced under time pressure

### 5. Side Effects
- Any unintended state changes?
- Any performance impact (unbounded loops, missing limits)?
- Any security concerns introduced (input not validated, secret exposed)?

## Output Format

```
REVIEW_SCORE: {number}/100

## Issues Found

### 🔴 Critical (must fix before evidence)
1. {file:line} — {issue description}

### 🟡 Suggestion (should consider)
1. {file:line} — {suggestion}

### 🟢 Good
1. {what's done well}
```

Score guide:
- 90-100: Fix is clean, targeted, no regression risk; all non-pass results properly triaged and resolved
- 75-89: Minor concerns only, safe to proceed
- 60-74: Issues that should be addressed before committing evidence
- <60: Fix introduces new problems, OR any non-pass is attributed to infra-gap/skip/partial without resolution — needs rework

**Auto-fail (score <40):** presence of any `skip`/`partial` status, any
permanent `fail` caused by infra/tooling rather than confirmed code defect,
or any `code-defect` fail recorded with fewer than 3 fix attempts.
