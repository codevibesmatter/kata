---
id: eval
name: "Eval Mode"
description: "Run agentic eval scenarios against kata-wm"
mode: eval
workflow_prefix: "EV"

phases:
  - id: p0
    name: "Run Scenario"
    task_config:
      title: "P0: Run — select scenario, execute, handle pauses"
      labels: [eval, run]
    steps:
      - id: select-and-run
        title: "Select and run eval scenario"
        instruction: |
          List available scenarios:
          ```bash
          npx tsx eval/run.ts --list
          ```

          Run the requested scenario:
          ```bash
          npx tsx eval/run.ts --scenario=<id> --verbose
          ```

          Or against an existing project:
          ```bash
          npx tsx eval/run.ts --scenario=<id> --project=<path> --verbose
          ```

          **If PAUSED (AskUserQuestion):**
          Decide what a real user would answer, then resume:
          ```bash
          npx tsx eval/run.ts --scenario=<id> --project=<path> --resume=<session_id> --answer="<choice>"
          ```

          Repeat resume until the scenario completes or fails.

  - id: p1
    name: "Analyze Results"
    task_config:
      title: "P1: Analyze — check assertions, note observations"
      labels: [eval, analyze]
      depends_on: [p0]
    steps:
      - id: check-results
        title: "Check results and observations"
        instruction: |
          Review the eval output:
          - Which assertions passed/failed?
          - Did the agent follow mode guidance correctly?
          - Were there unexpected behaviors (wrong mode, leaked tasks, skipped phases)?
          - How many turns and what cost?

          If a scenario failed, investigate:
          - Read the transcript in eval-transcripts/
          - Check the project state in eval-projects/
          - Identify root cause: template issue, hook issue, agent behavior?

  - id: p2
    name: "Report"
    task_config:
      title: "P2: Report — summarize findings, action items"
      labels: [eval, report]
      depends_on: [p1]
    steps:
      - id: summarize
        title: "Write eval summary"
        instruction: |
          Summarize:
          - Pass/fail per scenario
          - Token usage and cost
          - What worked well
          - What broke and why
          - Action items (template fixes, hook fixes, harness improvements)

stop_hook: false
---

# Eval Mode

Drive inner Claude agents through kata scenarios and verify the results.

## How It Works

You (the outer agent) act as the human user. You:

1. **Run a scenario** — the harness spawns an inner agent with the prompt
2. **Handle questions** — if the inner agent asks (AskUserQuestion), resume with an answer
3. **Check results** — assertions run automatically
4. **Report** — summarize what happened

## Commands

```bash
npx tsx eval/run.ts --list                          # List scenarios
npx tsx eval/run.ts --scenario=<id> --verbose       # Run fresh
npx tsx eval/run.ts --scenario=<id> --project=<path> --verbose  # Run against existing project
npx tsx eval/run.ts --scenario=<id> --project=<path> --resume=<sid> --answer="<choice>"  # Resume
```

## Key Principle

**You are the user.** Answer questions naturally. Note mistakes. The eval tests the full kata experience.
