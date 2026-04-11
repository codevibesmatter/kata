---
id: debug
name: Debug Mode
description: Systematic hypothesis-driven debugging
mode: debug

phases:
  - id: p0
    name: Reproduce & Map
    stage: setup
    task_config:
      title: "P0: Setup - reproduce and map the bug"
      labels: [phase, setup]
    steps:
      - id: env-check
        $ref: env-check
        title: "Verify environment"
      - id: reproduce
        title: "Reproduce the bug"
        skill: debug-methodology
        instruction: |
          Get clear reproduction steps. Confirm the bug exists.
          Document: trigger, actual behavior, expected behavior.

  - id: p1
    name: Investigate
    stage: work
    task_config:
      title: "P1: Work - investigate and fix"
      depends_on: [p0]
    steps:
      - id: hypothesize
        title: "Form and test hypotheses"
        skill: debug-methodology
      - id: fix
        title: "Implement minimal fix"
        skill: code-impl
      - id: verify-fix
        title: "Verify fix"
        skill: test-protocol
        gate:
          bash: "{test_command}"
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

workflow_id_format: "DB-{session_last_4}-{MMDD}"
---
