---
id: skill-eval
name: Skill Eval
description: Eval-only mode for testing baseline (no skills)
mode: skill-eval
phases:
  - id: p0
    name: Quick Planning
    task_config:
      title: "P0: Quick Planning"
      labels: [planning]
    steps:
      - id: plan
        title: Plan the implementation
        instruction: |
          Scope this task using good planning practices:
          1. Understand the request
          2. Scope the work
          3. Identify risks
          4. Define verification
          5. Outline steps
  - id: p1
    name: Implement with TDD
    task_config:
      title: "P1: Implement with TDD"
      labels: [implementation]
      depends_on: [p0]
    steps:
      - id: implement
        title: Implement using TDD
        instruction: |
          Apply TDD to implement the planned changes:
          1. Write a failing test first
          2. Implement the minimum code to pass
          3. Refactor while keeping tests green
          4. Commit your changes
global_conditions:
  - changes_committed
---

# Skill Eval Mode (Control)

You are in **skill-eval** mode. Follow the phases below.

## Phase Flow

```
P0: Quick Planning — scope the task
P1: Implement with TDD — write tests first, then implement
```

## Important

- Complete each phase before moving to the next
