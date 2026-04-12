---
id: task
name: Task Mode
description: Combined planning + implementation for small tasks, chores, and quick fixes
mode: task
workflow_prefix: "TK"

phases:
  - id: p0
    name: Orient
    stage: setup
    skill: interview
    task_config:
      title: "P0: Setup - scope task, verify env, claim issue"
      labels: [phase, setup]
    steps:
      - id: env-check
        $ref: env-check
      - id: github-claim
        $ref: github-claim

  - id: p1
    name: Implement
    stage: work
    expansion: agent
    skill: code-impl
    task_config:
      title: "P1: Work - implement and test"
      labels: [phase, work]
      depends_on: [p0]
    agent_protocol:
      max_tasks: 10

  - id: p2
    name: Close
    stage: close
    task_config:
      title: "P2: Close - build, test, commit, push"
      labels: [phase, close]
      depends_on: [p1]
    steps:
      - id: run-tests
        $ref: run-tests
        gate:
          bash: "{build_command}"
          expect_exit: 0
      - id: commit-push
        $ref: commit-push

global_conditions:
  - changes_committed

workflow_id_format: "TK-{session_last_4}-{MMDD}"
---
