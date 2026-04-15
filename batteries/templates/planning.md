---
id: planning
name: Planning Mode
description: Feature planning with research, interviews, spec writing, and review
mode: planning

phases:
  - id: p0
    name: Research
    stage: setup
    expansion: agent
    skill: kata-research
    task_config:
      title: "P0: Setup - research codebase and problem space"
      labels: [phase, setup]
      instruction: |
        CHECK FIRST: Did the user provide a research file in their prompt?
        Also list recent files: ls -lt {research_path}/ | head -10
        If a relevant file exists for this issue/topic — read it, mark this task complete, move on.
        If nothing relevant — invoke /research and run the full research pipeline.
    agent_protocol:
      max_tasks: 10

  - id: p1
    name: Interview
    stage: setup
    expansion: agent
    skill: kata-interview
    task_config:
      title: "P1: Setup - gather requirements from user"
      labels: [phase, setup]
      depends_on: [p0]
    agent_protocol:
      max_tasks: 10

  - id: p2
    name: Spec Writing
    stage: work
    skill: kata-spec-writing
    task_config:
      title: "P2: Work - write feature specification"
      labels: [phase, work]
      depends_on: [p1]

  - id: p3
    name: Review
    stage: work
    expansion: agent
    skill: kata-spec-review
    task_config:
      title: "P3: Work - review spec, fix issues"
      labels: [phase, work, review]
      depends_on: [p2]
    agent_protocol:
      max_tasks: 10

  - id: p4
    name: Finalize
    stage: close
    skill: kata-close
    task_config:
      title: "P4: Close - validate, approve, commit, push"
      labels: [phase, close]
      depends_on: [p3]
      instruction: |
        Run in order:
        1. kata validate-spec --issue={issue}
        2. Update spec frontmatter: status: approved, updated: today
        3. git add, git commit, git push

global_conditions:
  - changes_committed
  - changes_pushed
---
