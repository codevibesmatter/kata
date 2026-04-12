---
id: verify
name: "Verification Plan Execution"
description: "Standalone VP execution with repair loop — run after implementation or task mode"
mode: verify
workflow_prefix: "VF"
reviewer_prompt: verify-fix-review

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
        $ref: read-verification-tools
      - id: start-dev-server
        $ref: start-dev-server

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
        $ref: commit-push
      - id: update-issue
        $ref: update-issue

global_conditions:
  - changes_committed
  - changes_pushed

workflow_id_format: "VF-{session_last_4}-{MMDD}"
---
