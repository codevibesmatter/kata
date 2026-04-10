---
description: "Build + test + retry protocol — Step 1 build check, Step 2 run tests, Step 3 check implementation hints, retry limits (3 attempts)."
context: inline
---

# Test Protocol

Each TEST sub-phase runs deterministic checks only. Do NOT skip steps or reorder.

## Step 1: Build check

Run the project's **build command** (e.g. `npm run build`), not bare
`tsc --noEmit`. Projects with build-time codegen (route types, schema
generation) need the full pipeline. If the build fails, fix and re-run
before proceeding.

## Step 2: Run tests

Run the project's test command. If the spec phase has `test_cases:` in
its YAML, verify each one:

```
For each test_case in the spec phase:
  - Does a test exist that covers this case?
  - If not, write the test BEFORE marking TEST complete.
  - Run the test and confirm it passes.
```

If no test infrastructure exists, check the spec's Verification Strategy
section for setup instructions.

## Step 3: Check for implementation hints

Re-read the spec's Implementation Hints section. Verify:
- Correct imports used (not guessed from node_modules exploration)
- Initialization follows documented patterns
- Known gotchas addressed

## Retry limits

If a build or test fails:
- Fix the issue using the error output (not blind retry)
- Maximum 3 fix attempts per failure before escalating to user
- Never silence errors, skip tests, or weaken assertions to pass
