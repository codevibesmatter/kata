---
description: "Build + test + retry protocol — build check, run tests, write missing tests via test-agent, retry limits (3 attempts)."
context: inline
---

# Test Protocol

Each TEST phase runs deterministic checks. Do NOT skip steps or reorder.

## Step 1: Build check

Run the project's **build command** (e.g. `npm run build`), not bare
`tsc --noEmit`. Projects with build-time codegen (route types, schema
generation) need the full pipeline. If the build fails, spawn an impl-agent to fix:

```
Agent(subagent_type="impl-agent", prompt="
  Build failure. Fix the build error:
  {error output}
  After fixing, run: {build_command}
")
```

## Step 2: Run tests

Run the project's test command. If the spec phase has `test_cases:` in
its YAML, verify each one:

```
For each test_case in the spec phase:
  - Does a test exist that covers this case?
  - If not, spawn a test-agent to write it BEFORE marking TEST complete.
  - Run the test and confirm it passes.
```

For missing tests, spawn a test-agent:

```
Agent(subagent_type="test-agent", prompt="
  Write tests for: {behavior description}
  Test cases to cover: {list from spec}
  Follow existing test patterns in: {test directory}
  After writing, run: {test_command}
")
```

If tests fail, spawn an impl-agent to fix the implementation (not the tests):

```
Agent(subagent_type="impl-agent", prompt="
  Test failure: {test name}
  Error: {error output}
  Fix the implementation code, not the test.
  After fixing, run: {build_command} && {test_command}
")
```

## Step 3: Check for implementation hints

Re-read the spec's Implementation Hints section. Verify:
- Correct imports used (not guessed from node_modules exploration)
- Initialization follows documented patterns
- Known gotchas addressed

If hints reveal issues, spawn an impl-agent to fix.

## Retry limits

If a build or test fails:
- Spawn an agent to fix the issue using the error output (not blind retry)
- Maximum 3 fix attempts per failure before escalating to user
- Never silence errors, skip tests, or weaken assertions to pass
