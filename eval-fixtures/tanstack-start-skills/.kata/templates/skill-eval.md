---
id: skill-eval
name: Skill Eval
description: Eval-only mode for testing skill activation reliability
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
          Read the quick-planning skill file at `.claude/skills/quick-planning/SKILL.md` and follow its methodology.

          Apply the quick-planning methodology to scope this task:
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
          Read the TDD skill file at `.claude/skills/tdd/SKILL.md` and follow its methodology.

          Apply TDD to implement the planned changes:
          1. Write a failing test first
          2. Implement the minimum code to pass
          3. Refactor while keeping tests green
          4. Commit your changes
available_skills:
  - quick-planning
  - tdd
global_conditions:
  - changes_committed
---

# Skill Eval Mode

You are in **skill-eval** mode. Follow the phases below, using the referenced skills at each phase.

## Phase Flow

```
P0: Quick Planning — read and apply the quick-planning skill
P1: Implement with TDD — read and apply the TDD skill
```

## Important

- **Read each skill file** before starting its phase
- Follow the methodology described in the skill file
- Complete each phase before moving to the next
