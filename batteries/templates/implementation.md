---
id: implementation
name: Feature Implementation
description: Execute approved spec — claim branch, implement, test, review, close with PR
mode: implementation

phases:
  - id: p0
    name: Baseline
    stage: setup
    task_config:
      title: "P0: Setup - verify environment, read spec"
      labels: [phase, setup]
    steps:
      - id: read-spec
        $ref: read-spec
        title: "Read and understand the spec"
      - id: env-check
        $ref: env-check
        title: "Verify environment"

  - id: p1
    name: Claim
    stage: setup
    task_config:
      title: "P1: Setup - create branch, claim issue"
      labels: [phase, setup]
      depends_on: [p0]
    steps:
      - id: create-branch
        $ref: create-branch
        title: "Create feature branch"
      - id: github-claim
        $ref: github-claim
        title: "Claim GitHub issue"

  - id: p2
    name: Implement
    stage: work
    expansion: spec
    skill: code-impl
    subphase_pattern:
      - id_suffix: impl
        title_template: "IMPL - {task_summary}"
        todo_template: "Implement {task_summary}"
        active_form: "Implementing {phase_name}"
        labels: [impl]
        instruction: "Implement the behavior described in the spec phase."
      - id_suffix: test
        title_template: "TEST - {phase_name}"
        todo_template: "Test {phase_name} implementation"
        active_form: "Testing {phase_name}"
        labels: [test]
        depends_on_previous: true
        instruction: "Run tests and typecheck."
      - id_suffix: review
        title_template: "REVIEW - {reviewers}"
        todo_template: "Review {phase_name} changes"
        active_form: "Reviewing {phase_name}"
        labels: [review]
        depends_on_previous: true
        instruction: "Run review-agent."

  - id: p3
    name: Close
    stage: close
    task_config:
      title: "P3: Close - final checks, commit, PR, close issue"
      labels: [phase, close]
      depends_on: [p2]
    steps:
      - id: final-checks
        title: "Run final checks"
        skill: test-protocol
        gate:
          bash: "{build_command}"
          expect_exit: 0
      - id: commit-push
        $ref: commit-push
        title: "Commit and push all changes"
      - id: create-pr
        $ref: create-pr
        title: "Create pull request"
      - id: update-issue
        $ref: update-issue
        title: "Update GitHub issue"

global_conditions:
  - changes_committed
  - changes_pushed
---
