---
name: verify-mode
description: "Execute Verification Plans literally, fix failures with repair loop, record evidence. Activate when entering verify mode."
---

> **Session setup:** If you haven't already, run `kata enter verify` to register this session for task tracking, stop-condition enforcement, and phase guidance. The skill provides methodology; the CLI provides workflow infrastructure.

# Verify Mode

You are in **verify** mode. Execute a Verification Plan and fix any failures.

## Your Role

- Execute VP steps literally as written — commands, expected outcomes, all of it
- Do NOT modify VP steps — they are the source of truth
- Fix implementation code if VP steps fail (never the VP steps themselves)
- Record all results as evidence and commit it

## Input Sources

Verify mode supports three input sources (checked in order):

1. **Issue spec** — `kata enter verify --issue=N` extracts VP from the spec's `## Verification Plan`
2. **Plan file** — reads `### VPn:` steps from a standalone markdown file
3. **Infer** — builds VP from git diff + commit messages (build, tests, code review, intent matching)

## Phase Flow

```
P0: Setup
    ├── Determine VP input source (issue / plan-file / infer)
    ├── Read verification-tools.md
    └── Start dev server, confirm health

P1: Execute (per VP step)
    ├── Expand VP steps as individual tasks
    ├── VP1: {step title}
    ├── VP2: {step title}
    └── ...VPn: {step title}

P2: Fix Loop
    ├── Check for failures from P1
    └── For each failure: diagnose → fix → re-verify (max 3 cycles)

P2-Review: Fix Review  (skip if no fixes were made)
    ├── Check if fix commits exist
    └── REVIEW Protocol: review-agent + external providers

P3: Evidence
    ├── Write VP evidence JSON
    ├── Commit evidence + push
    ├── Update GitHub issue (if issue-based)
    └── Report pass/fail results
```

## TaskCreate Exception

Verify mode is the **only mode** that uses `TaskCreate`. This overrides the standard
`task_rules` which say "Do NOT create new tasks with TaskCreate." In P1, VP steps are
expanded as individual tasks so each can be tracked and marked pass/fail independently.

## VP Step Execution Protocol

For each VP step:

1. **Read** the step instructions carefully — note commands AND expected outcomes
2. **Execute** each command exactly as described — do not "improve" or skip commands
3. **Compare** actual results to expected results — be precise, not approximate
4. **Record** pass/fail with actual output captured

### Rules

- Execute commands EXACTLY as written in the VP
- If a step requires the dev server, ensure it is running before executing
- Record ALL results, even failures — do not stop on first failure, complete all steps
- Never mark a step "passed" without actually running its commands

## Repair-Reverify Loop (P2)

If any VP step fails in P1:

1. **Diagnose** — read the error, identify the root cause in implementation code
2. **Fix** — make the minimal code change to address the root cause
3. **Re-run** — re-execute the failed VP step exactly as originally specified
4. **Max 3 cycles** — if still failing after 3 repair attempts, record as permanently failed

**Critical:** Fix the implementation, never the VP steps. VP steps encode what the feature
is supposed to do — they are correct by definition in this mode.

## REVIEW Protocol (P2-Review)

After fixing VP failures, a focused code review guards against regressions introduced under
pressure. This phase runs **only when fix commits were made** — it is skipped when all VP
steps pass in P1.

**Why this matters:** Emergency fixes during verification are high-risk. The pressure to get
VP steps passing can lead to symptom-masking, scope creep, or fragile workarounds. The review
specifically targets hasty-fix failure modes rather than general code style.

**Protocol:**

1. **Spawn review-agent** — subagent reviews fix diff with hasty-fix criteria:
   - Minimality (no scope creep)
   - Root cause (not symptom masking)
   - Regression risk (no collateral damage to other VP steps)
   - Correctness (logic sound, edge cases handled)
   - Side effects (no unintended state changes)
2. **External providers** — run `kata review --prompt=verify-fix-review --provider=<name>` for
   each configured reviewer

**If REQUEST CHANGES:** fix the issues, commit, and re-run the review.
**If APPROVE:** proceed to P3 Evidence.

## Stop Conditions

- All VP steps executed and recorded
- Fix loop complete (all passing or max cycles reached)
- VP evidence file committed and pushed
- Results reported with pass/fail verdict
