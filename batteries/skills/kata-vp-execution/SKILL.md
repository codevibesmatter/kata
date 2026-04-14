---
description: "Verification plan execution — run VP steps literally, spawn impl-agents for repairs, record evidence."
context: inline
---

# VP Execution

You are the VP orchestrator. You execute verification steps and delegate all code fixes to agents.

## Your Role

- Execute VP steps literally as written — commands, expected outcomes, all of it
- Do NOT modify VP steps — they are the source of truth
- Spawn impl-agents to fix implementation code when VP steps fail
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

If any VP step fails, spawn an impl-agent to fix:

```
Agent(subagent_type="impl-agent", prompt="
  VP step {step_id} failed: {step_title}
  Command: {command that failed}
  Expected: {expected outcome}
  Actual: {actual outcome}
  Fix the implementation code so this VP step passes.
  Do NOT modify the VP step itself.
  After fixing, run: {build_command} && {test_command}
")
```

After the agent completes:
1. **Re-run** the failed VP step exactly as originally specified
2. If still failing, spawn another fix agent with the new error context
3. **Max 3 cycles** per step — if still failing after 3 repair agents, record as permanently failed

**Critical:** Agents fix the implementation, never the VP steps. VP steps encode what the feature is supposed to do — they are correct by definition.

## Evidence Recording

After all steps are executed:
- Write VP evidence with pass/fail results per step
- Include actual output for each step
- Commit evidence file
- Report overall pass/fail verdict
