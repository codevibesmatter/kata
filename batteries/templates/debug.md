---
id: debug
name: Debug Mode
description: Systematic hypothesis-driven debugging
mode: debug
mode_skill: debug-mode
aliases: [investigate]

phases:
  - id: p0
    name: Reproduce & Map
    stage: setup
    task_config:
      title: "P0: Setup - reproduce and map the bug"
      labels: [phase, setup]
    steps:
      - id: reproduce-bug
        title: "Reproduce the bug and find related issue"
        skill: debug-methodology
        hints:
          - bash: "gh issue list --search \"{bug_keywords}\" --state open --limit 5"
          - bash: "git log --oneline --since=\"2 weeks ago\""
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
      - id: form-hypotheses
        title: "Form 3 hypotheses (not just 1)"
        skill: debug-methodology
        instruction: |
          List 3 possible root causes (ranked by likelihood):

          1. **Most likely:** {hypothesis} — because {reason}
          2. **Plausible:** {hypothesis} — because {reason}
          3. **Unlikely but worth checking:** {hypothesis}

          Start investigating hypothesis #1 first.
          Then: Mark this task completed via TaskUpdate

      - id: trace-code-path
        title: "Trace the code path"
        skill: debug-methodology
        hints:
          - search: "error handling"
            glob: "src/**/*.ts"
          - read: "{entry_point}"
        instruction: |
          Spawn a debug-focused agent to trace the execution:

          Task(subagent_type="Explore", prompt="
            Trace the code path for this bug:
            Symptom: {exact error or behavior}
            Hypothesis: {your #1 hypothesis}

            Start from: {entry point — API route, UI event, job trigger}
            Follow the path through all layers.
            Find: where actual behavior diverges from expected.
            Read all relevant files IN FULL.
            Document: file:line of the likely cause.
          ")

          TaskOutput(task_id=..., block=true)

          Review agent findings. Does it confirm hypothesis #1?
          If no, investigate hypothesis #2.
          Then: Mark this task completed via TaskUpdate

      - id: confirm-root-cause
        title: "Confirm root cause"
        instruction: |
          Once the cause is identified:

          **Root cause:** {file:line} — {description}

          **Why it causes the bug:**
          {explanation of the causal chain}

          **Scope check:**
          - Could this affect other code paths? {yes/no, where}
          - Is there a related bug nearby? {yes/no}

          Update GitHub issue with root cause finding:
          ```bash
          gh issue comment {N} --body "Root cause found: {file}:{line}
          {explanation}"
          ```

          Then: Mark this task completed via TaskUpdate

  - id: p2
    name: Fix
    task_config:
      title: "P2: Fix - minimal targeted fix, no scope creep"
      labels: [phase, phase-2, fix]
      depends_on: [p1]
    steps:
      - id: implement-fix
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
