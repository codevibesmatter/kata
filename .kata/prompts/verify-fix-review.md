# Verify Fix Review

Review code changes made during VP (Verification Plan) failure resolution.
These are emergency fixes applied under pressure — focus on hasty-fix risk.

## Context

The diff contains fixes committed during the VP repair loop. Each fix was
written quickly to make a failing VP step pass. The primary risks are:
symptom masking, scope creep, and regression in other VP steps.

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
- 90-100: Fix is clean, targeted, no regression risk
- 75-89: Minor concerns only, safe to proceed
- 60-74: Issues that should be addressed before committing evidence
- <60: Fix introduces new problems, needs rework
