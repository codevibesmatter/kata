---
id: verify
name: Verify Mode
description: Execute verification plan steps
mode: verify

phases:
  - id: p0
    name: Load VP
    stage: setup
    task_config:
      title: "P0: Setup - load verification plan"
      labels: [phase, setup]
    steps:
      - id: env-check
        $ref: env-check
        title: "Verify environment"
      - id: load-vp
        title: "Load verification plan from spec"
        skill: vp-execution
        instruction: |
          Read the spec and find the ## Verification Plan section.
          Understand each VP step and what it tests.

  - id: p1
    name: Execute VP
    stage: work
    expansion: agent
    agent_protocol:
      max_tasks: 20
      require_labels: [vp-step]
    task_config:
      title: "P1: Work - execute verification plan"
      depends_on: [p0]
    steps:
      - id: expand-vp
        title: "Create tasks for each VP step"
        skill: vp-execution
        instruction: |
          Read the verification plan from the spec.
          Use TaskCreate to create one task per VP step.
          Each task must have labels: [vp-step].
          Invoke /vp-execution before executing each VP step.

  - id: p2
    name: Fix Loop
    stage: work
    expansion: agent
    agent_protocol:
      max_tasks: 10
      require_labels: [fix]
    task_config:
      title: "P2: Work - fix failing VP steps"
      depends_on: [p1]
    steps:
      - id: fix-failures
        title: "Fix and re-verify failing steps"
        skill: code-impl
        instruction: |
          For each failed VP step, create a fix task.
          Invoke /code-impl for fixes. Re-run the VP step after fixing.

  - id: p3
    name: Close
    stage: close
    task_config:
      title: "P3: Close - commit evidence"
      depends_on: [p2]
    steps:
      - id: commit-push
        $ref: commit-push
        title: "Commit and push evidence"

workflow_id_format: "VF-{session_last_4}-{MMDD}"
---
