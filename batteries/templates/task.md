---
id: task
name: Task Mode
description: Combined planning + implementation for small tasks
mode: task
mode_skill: task-mode
workflow_prefix: "TK"

phases:
  - id: p0
    name: Orient
    stage: setup
    task_config:
      title: "P0: Setup - understand the task"
      labels: [phase, setup]
    steps:
      - id: understand-task
        title: "Understand and classify the task"
        skill: quick-planning
        hints:
          - bash: "gh issue list --search \"{task_description}\" --limit 3"
        instruction: |
          Clarify the task scope. If linked to an issue, read it.
          Confirm: what to change, where, acceptance criteria.

  - id: p1
    name: Implement
    stage: work
    task_config:
      title: "P1: Work - implement and test"
      depends_on: [p0]
    steps:
      - id: implement
        title: "Implement the change"
        skill: code-impl
      - id: test
        title: "Build and test"
        skill: test-protocol
        gate:
          bash: "{build_command}"
          expect_exit: 0

  - id: p2
    name: Close
    stage: close
    task_config:
      title: "P2: Close - commit and push"
      depends_on: [p1]
    steps:
      - id: commit-push
        $ref: commit-push
        title: "Commit and push"

workflow_id_format: "TK-{session_last_4}-{MMDD}"
---
