---
id: task
name: Task Mode
description: Combined planning + implementation for small tasks, chores, and quick fixes
mode: task
workflow_prefix: "TK"

phases:
  - id: p0
    name: Setup
    stage: setup
    task_config:
      title: "P0: Setup - verify env, claim issue"
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
    name: Plan
    stage: setup
    skill: interview
    task_config:
      title: "P1: Plan - scope, quick research, approach"
      labels: [phase, setup]
      depends_on: [p0]
      instruction: |
        Understand the task. Quick context search — read relevant files, check for existing patterns.
        Define approach: what to change, where, acceptance criteria.
        If scope is larger than a task, suggest kata enter planning instead.

  - id: p2
    name: Implement
    stage: work
    expansion: agent
    skill: code-impl
    task_config:
      title: "P2: Work - implement and test"
      labels: [phase, work]
      depends_on: [p1]
    agent_protocol:
      max_tasks: 10

  - id: p3
    name: Close
    stage: close
    task_config:
      title: "P3: Close - build, test, commit, push"
      labels: [phase, close]
      depends_on: [p2]
    steps:
      - id: run-tests
        title: "Run test suite"
        instruction: |
          ```bash
          {test_command}
          ```
        gate:
          bash: "{build_command}"
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

global_conditions:
  - changes_committed

workflow_id_format: "TK-{session_last_4}-{MMDD}"
---
