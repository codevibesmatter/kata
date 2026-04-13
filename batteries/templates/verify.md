---
id: verify
name: "Verification Plan Execution"
description: "Standalone VP execution with repair loop — run after implementation or task mode"
mode: verify
workflow_prefix: "VF"

phases:
  - id: p0
    name: Setup
    stage: setup
    skill: vp-execution
    task_config:
      title: "P0: Setup - determine VP source, prepare environment"
      labels: [phase, setup]
    steps:
      - id: read-verification-tools
        title: "Read verification tools config"
        instruction: |
          Check for project verification tools:
          ```bash
          cat .kata/verification-tools.md 2>/dev/null || echo "No verification tools configured"
          ```
      - id: start-dev-server
        title: "Start dev server and confirm health"
        instruction: |
          If `dev_server_command` is configured, start the dev server
          and confirm it responds before running verification steps.

  - id: p1
    name: Execute & Fix
    stage: work
    expansion: agent
    skill: vp-execution
    task_config:
      title: "P1: Work - execute VP steps, fix failures, review fixes"
      labels: [phase, work]
      depends_on: [p0]
    agent_protocol:
      max_tasks: 30

  - id: p2
    name: Evidence
    stage: close
    skill: vp-execution
    task_config:
      title: "P2: Close - write evidence, commit, report"
      labels: [phase, close]
      depends_on: [p1]
    steps:
      - id: write-evidence
        title: "Write VP evidence JSON"
        instruction: |
          Write a **JSON** evidence file (NOT markdown) to:
          `.kata/verification-evidence/vp-{issueNumber}.json`

          Required format:
          ```json
          {
            "issueNumber": 100,
            "phaseId": "p1",
            "timestamp": "2026-04-13T14:00:00.000Z",
            "overallPassed": true,
            "allStepsPassed": true,
            "steps": [
              {
                "id": "vp1",
                "title": "Step title",
                "status": "pass",
                "passed": true,
                "output": "Actual output from running the step"
              }
            ]
          }
          ```

          - File MUST be `.json` — tooling reads it programmatically
          - `overallPassed`/`allStepsPassed`: true only if every step passed
          - Each step needs `id`, `title`, `status` ("pass"/"fail"), `passed` (bool), `output`
          - If no issue number, use the workflow ID in the filename
      - id: challenge-incomplete
        title: "Challenge all incomplete VP items"
        instruction: |
          Before closing, review every VP item that was NOT marked as passed.
          For each incomplete or failed item, challenge it:

          1. **Spawn a review agent** (Agent tool) for each incomplete item to determine
             if it can actually be completed. The review agent should attempt the verification
             itself, not just theorize about it.

          2. **Push back on laziness.** Remind yourself:
             - You have ALL tools: Bash, Read, Write, Edit, Grep, Glob, WebFetch, Agent
             - You can **create test data freely** — write fixtures, seed databases, generate payloads
             - You can **start servers, hit endpoints, run CLI commands** — do actual verification
             - You can **use browser agents** (chrome-devtools-axi) for UI/visual testing — open pages, check rendering, validate interactions
             - You can **spawn sub-agents** for parallel verification work
             - You can **install packages, compile, build** — do whatever setup is needed

          3. **"I can't verify this" is almost never true.** If a step says "check endpoint
             returns 200", curl it. If it says "verify file exists", glob it. If it says
             "run tests", run them. If it says "check the UI", open a browser.

          Only after genuinely attempting each incomplete item (and documenting WHY it
          cannot be completed if truly blocked) may you proceed to commit.
      - id: commit-push
        title: "Commit and push"
        instruction: |
          Commit all implementation work:
          ```bash
          git add {changed_files}
          git commit -m "{commit_message}"
          git push
          ```
      - id: update-issue
        title: "Update GitHub issue"
        instruction: |
          Comment on the GitHub issue with results:
          ```bash
          gh issue comment {issue_number} --body "{comment_body}"
          ```

global_conditions:
  - changes_committed
  - changes_pushed

workflow_id_format: "VF-{session_last_4}-{MMDD}"
---
