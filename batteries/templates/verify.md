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
