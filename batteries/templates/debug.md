---
id: debug
name: Debug Mode
description: Systematic hypothesis-driven debugging with reproduction, root cause analysis, and fix
mode: debug
aliases: [investigate]

phases:
  - id: p0
    name: Reproduce & Map
    stage: setup
    skill: debug-methodology
    task_config:
      title: "P0: Setup - reproduce, map system, classify"
      labels: [phase, setup]
    steps:
      - id: env-check
        title: "Verify environment"
        instruction: |
          Run sanity checks before making any changes:
          ```bash
          git status  # Should be clean
          git log --oneline -3  # Confirm you're on the right branch
          ```

          If the build command is configured:
          ```bash
          {build_command}
          ```

          Document: current branch, any pre-existing issues.
      - id: github-claim
        title: "Claim GitHub issue"
        instruction: |
          If GitHub issue exists, claim it:
          ```bash
          gh issue edit {issue_number} --remove-label "status:todo" --remove-label "approved" --add-label "status:in-progress"
          gh issue comment {issue_number} --body "Starting work on branch: {branch_name}"
          ```

  - id: p1
    name: Investigate & Fix
    stage: work
    expansion: agent
    skill: debug-methodology
    task_config:
      title: "P1: Work - hypothesize, trace, fix, guard"
      labels: [phase, work]
      depends_on: [p0]
    agent_protocol:
      max_tasks: 10

  - id: p2
    name: Close
    stage: close
    task_config:
      title: "P2: Close - verify fix, commit, push"
      labels: [phase, close]
      depends_on: [p1]
    steps:
      - id: run-tests
        title: "Run test suite"
        instruction: |
          ```bash
          {test_command}
          ```
        gate:
          bash: "{test_command}"
          expect_exit: 0
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

workflow_id_format: "DB-{session_last_4}-{MMDD}"
---
