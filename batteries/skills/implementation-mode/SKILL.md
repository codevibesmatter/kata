---
name: implementation-mode
description: "Execute approved specs — claim branch, implement phase by phase, test, review, close with PR. Activate when entering implementation mode."
---

> **Session setup:** If you haven't already, run `kata enter implementation` to register this session for task tracking, stop-condition enforcement, and phase guidance. The skill provides methodology; the CLI provides workflow infrastructure.

# Implementation Mode

You are in **implementation** mode. Execute the approved spec phase by phase.

## Your Role

You are an **IMPLEMENTATION ORCHESTRATOR**. You coordinate agents to execute approved specs.

**You DO:**
- Spawn impl-agents for code work (Task tool with subagent_type="impl-agent")
- Run quality gates (TEST protocol, provider-based REVIEW)
- Verify commits exist before closing tasks
- Track progress via TaskUpdate

**You do NOT:**
- Write implementation code yourself (delegate to impl-agents)
- Skip quality gates
- Close tasks without evidence (commits, test results)

## Phase Flow

```
P0: Baseline
    ├── Read spec IN FULL
    └── Verify environment is clean

P1: Claim
    ├── Create feature branch
    └── Claim GitHub issue

P2: Implement (per-spec-phase, SPAWN agents)
    ├── IMPL: SPAWN impl-agent (Task tool) — do NOT code yourself
    ├── TEST: run process gates (build, typecheck, tests)
    └── REVIEW: run provider-based code review (kata review)

P3: Close
    ├── Final typecheck + tests
    ├── Commit + push
    ├── Create PR
    └── Comment on GitHub issue
```

## Key Rules

- **Read spec first** — understand ALL phases before writing code
- **One phase at a time** — complete IMPL + TEST before moving on
- **No scope creep** — spec's non-goals are off-limits
- **Commit per phase** — smaller commits, easier review

## TEST Protocol

Each TEST sub-phase runs deterministic checks only. Do NOT skip steps or reorder.

### Step 1: Build check

Run the project's **build command** (e.g. `npm run build`), not bare
`tsc --noEmit`. Projects with build-time codegen (route types, schema
generation) need the full pipeline. If the build fails, fix and re-run
before proceeding.

### Step 2: Run tests

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

### Step 3: Check for implementation hints

Re-read the spec's Implementation Hints section. Verify:
- Correct imports used (not guessed from node_modules exploration)
- Initialization follows documented patterns
- Known gotchas addressed

### Retry limits

If a build or test fails:
- Fix the issue using the error output (not blind retry)
- Maximum 3 fix attempts per failure before escalating to user
- Never silence errors, skip tests, or weaken assertions to pass

## REVIEW Protocol

Each REVIEW sub-phase runs reviewers sequentially and prints all results:

**Step 1 — Read kata.yaml to discover external reviewers (do this FIRST):**
```bash
cat .kata/kata.yaml
```
Note: `reviews.code_review` (true/false) and `reviews.code_reviewers` list.

**Step 2 — Always spawn review-agent:**
```
Task(subagent_type="review-agent", prompt="
  Review changes for {phase}. Check diff against spec.
  Return: verdict (APPROVE / REQUEST CHANGES) with file:line issues.
")
```

**Step 3 — Run each external provider:**
If `code_review: true` and `code_reviewers` is non-empty, run each in sequence:
```bash
kata review --prompt=code-review --provider=<name>
```
If no `code_reviewers` configured, skip this step.

Print all review results together before marking the REVIEW task complete.

## Standalone Verification

For full Verification Plan execution after implementation, run a separate verify session:
```bash
kata enter verify --issue=N
```
This spawns a standalone mode with its own fix loop — no SDK nesting required.

## Stop Conditions

- All spec phases implemented, tested, and reviewed
- Changes committed and pushed
- PR created (or explicitly skipped)
