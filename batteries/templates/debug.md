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
        $ref: env-check
      - id: github-claim
        $ref: github-claim

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
        $ref: run-tests
        gate:
          bash: "{test_command}"
          expect_exit: 0
      - id: commit-push
        $ref: commit-push
      - id: update-issue
        $ref: update-issue

global_conditions:
  - changes_committed
  - changes_pushed

workflow_id_format: "DB-{session_last_4}-{MMDD}"
---
