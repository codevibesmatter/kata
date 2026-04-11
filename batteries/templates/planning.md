---
id: planning
name: Planning Mode
description: Research, design spec, review, get approval
mode: planning

phases:
  - id: p0
    name: Orient
    stage: setup
    task_config:
      title: "P0: Setup - understand the problem"
      labels: [phase, setup]
    steps:
      - id: env-check
        $ref: env-check
        title: "Verify environment"
      - id: understand
        title: "Understand the problem"
        skill: interview
        instruction: |
          Read the linked issue. Clarify scope and constraints.
          Identify what needs to be planned.

  - id: p1
    name: Research
    stage: work
    task_config:
      title: "P1: Work - research and explore"
      depends_on: [p0]
    steps:
      - id: research
        title: "Research the problem space"
        skill: spec-writing
        instruction: |
          Explore the codebase. Read relevant code.
          Document findings in planning/research/.

  - id: p2
    name: Design
    stage: work
    task_config:
      title: "P2: Work - write the spec"
      depends_on: [p1]
    steps:
      - id: write-spec
        title: "Write the spec"
        skill: spec-writing
        instruction: |
          Write the spec using the template in planning/spec-templates/.
          Include: behaviors with B-IDs, phases with tasks, non-goals.
      - id: review-spec
        title: "Review the spec"
        skill: spec-review

  - id: p3
    name: Close
    stage: close
    task_config:
      title: "P3: Close - commit and push"
      depends_on: [p2]
    steps:
      - id: commit-push
        $ref: commit-push
        title: "Commit and push"
      - id: update-issue
        $ref: update-issue
        title: "Update GitHub issue"

global_conditions:
  - changes_committed
  - changes_pushed
---
