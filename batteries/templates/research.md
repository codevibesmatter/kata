---
id: research
name: Research Mode
description: Explore and synthesize findings
mode: research

phases:
  - id: p0
    name: Frame
    stage: setup
    task_config:
      title: "P0: Setup - frame the research question"
      labels: [phase, setup]
    steps:
      - id: env-check
        $ref: env-check
        title: "Verify environment"
      - id: frame
        title: "Frame the research question"
        skill: interview
        instruction: |
          Clarify: what do we need to learn? What decisions depend on this?
          Define scope and success criteria.

  - id: p1
    name: Explore
    stage: work
    task_config:
      title: "P1: Work - explore and analyze"
      depends_on: [p0]
    steps:
      - id: explore
        title: "Explore the problem space"
        skill: spec-writing
        instruction: |
          Read code, docs, and external resources.
          Take structured notes. Look for patterns and trade-offs.
      - id: synthesize
        title: "Synthesize findings"
        skill: spec-writing
        instruction: |
          Write up findings in planning/research/.
          Include: key findings, trade-offs, recommendations.

  - id: p2
    name: Close
    stage: close
    task_config:
      title: "P2: Close - commit research"
      depends_on: [p1]
    steps:
      - id: commit-push
        $ref: commit-push
        title: "Commit and push research"

workflow_id_format: "RS-{session_last_4}-{MMDD}"
---
