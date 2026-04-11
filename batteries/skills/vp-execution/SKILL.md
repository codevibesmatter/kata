---
description: "Verification plan execution — run VP steps literally, record evidence, report pass/fail."
context: inline
---

# VP Execution

## Your Role

- Execute VP steps literally as written — commands, expected outcomes, all of it
- Do NOT modify VP steps — they are the source of truth
- Fix implementation code if VP steps fail (never the VP steps themselves)
- Record all results as evidence and commit it

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

## Repair-Reverify Loop

If any VP step fails:

1. **Diagnose** — read the error, identify the root cause in implementation code
2. **Fix** — make the minimal code change to address the root cause
3. **Re-run** — re-execute the failed VP step exactly as originally specified
4. **Max 3 cycles** — if still failing after 3 repair attempts, record as permanently failed

**Critical:** Fix the implementation, never the VP steps. VP steps encode what the feature
is supposed to do — they are correct by definition.

## Evidence Recording

After all steps are executed:
- Write VP evidence with pass/fail results per step
- Include actual output for each step
- Commit evidence file
- Report overall pass/fail verdict
