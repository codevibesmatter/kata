---
id: research
name: Research Mode
description: Deep exploration with documented findings and agent-parallel search
mode: research

phases:
  - id: p0
    name: Classify
    stage: setup
    skill: kata-mode-setup
    task_config:
      title: "P0: Setup - classify research type and context"
      labels: [phase, setup]
    steps:
      - id: classify
        title: "Classify research type"
        instruction: |
          QUICK CLASSIFICATION ONLY — do NOT explore the codebase or launch agents yet. That is P1's job.

          Read the user's message and classify into one of:
          - Feature research (existing codebase patterns)
          - Library/tech evaluation (compare options)
          - Brainstorming (open-ended exploration)
          - Feasibility study (can we build X?)

          If the type is obvious from the message, state it and move on.
          If unclear, ask the user to clarify before proceeding.

          Output: one line stating the research type, then mark this task complete.

  - id: p1
    name: Research
    stage: work
    expansion: agent
    skill: kata-research
    task_config:
      title: "P1: Work - outline, deep-dive, synthesize, document"
      labels: [phase, work]
      depends_on: [p0]
    agent_protocol:
      max_tasks: 15

  - id: p2
    name: Close
    stage: close
    skill: kata-mode-close
    task_config:
      title: "P2: Close - commit research doc"
      labels: [phase, close]
      depends_on: [p1]

global_conditions:
  - changes_committed
  - changes_pushed

workflow_id_format: "RS-{session_last_4}-{MMDD}"
---
