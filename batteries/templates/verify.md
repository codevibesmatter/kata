---
id: verify
name: "Verification Plan Execution"
description: "Standalone VP execution with repair loop — run after implementation or task mode"
mode: verify
workflow_prefix: "VF"

phases:
  - id: p0
    name: Setup
    stage: setup
    skill: kata-setup
    task_config:
      title: "P0: Setup - determine VP source, prepare environment"
      labels: [phase, setup]
    steps:
      - id: read-verification-tools
        title: "Read verification tools config"
        instruction: |
          Check for project verification tools:
          ```bash
          cat .kata/verification-tools.md 2>/dev/null || echo "No verification tools configured"
          ```
      - id: start-dev-server
        title: "Start dev server and confirm health"
        instruction: |
          If `dev_server_command` is configured, start the dev server
          and confirm it responds before running verification steps.

  - id: p1
    name: Execute & Fix
    stage: work
    expansion: agent
    skill: kata-vp-execution
    task_config:
      title: "P1: Work - execute VP steps, fix failures, review fixes"
      labels: [phase, work]
      depends_on: [p0]
    agent_protocol:
      max_tasks: 30

  - id: p2
    name: Evidence
    stage: close
    skill: kata-close
    task_config:
      title: "P2: Close - write evidence, commit, report"
      labels: [phase, close]
      depends_on: [p1]
    steps:
      - id: write-evidence
        title: "Write VP evidence JSON"
        instruction: |
          Write a **JSON** evidence file (NOT markdown) to:
          `.kata/verification-evidence/vp-{issueNumber}.json`

          Required format:
          ```json
          {
            "issueNumber": 100,
            "phaseId": "p1",
            "timestamp": "2026-04-13T14:00:00.000Z",
            "overallPassed": true,
            "allStepsPassed": true,
            "steps": [
              {
                "id": "vp1",
                "title": "Step title",
                "status": "pass",
                "passed": true,
                "output": "Actual output from running the step"
              }
            ]
          }
          ```

          - File MUST be `.json` — tooling reads it programmatically
          - `overallPassed`/`allStepsPassed`: true only if every step passed
          - Each step needs `id`, `title`, `status` ("pass"/"fail"), `passed` (bool), `output`
          - If no issue number, use the workflow ID in the filename
      - id: triage-every-non-pass
        title: "Triage every non-pass result (fail / skip / partial)"
        instruction: |
          Before closing, every VP step that is NOT marked `pass` must be put
          through a triage review. A non-pass is any of:

          - `fail` — step ran but actual result did not match expected
          - `skip` — step was not executed
          - `partial` — some commands ran but verification was incomplete

          This phase cannot close while any non-pass remains un-triaged or while
          any non-pass is attributable to infra or tooling.

          ### Rule 1 — Only wrong code is a valid failure

          The ONLY legitimate cause of a non-pass result is incorrect
          implementation code. Every other cause — missing tooling, unconfigured
          infra, absent fixtures, unavailable services, "I don't have access
          to X", "tests don't run locally" — is NOT a blocker. It is a setup
          task you must complete.

          Explicitly **forbidden** excuses for a permanent non-pass:

          - "The test runner isn't installed" → install it
          - "The endpoint needs a dev server" → start the dev server
          - "No seed data" → create fixtures
          - "No browser available" → use chrome-devtools-axi or write a headless script
          - "Package not available locally" → `npm`/`pip`/`cargo`/system install it
          - "Service dependency is down" → stand it up, proxy it, stub only the network
          - "I don't know how" → WebSearch, read docs, then implement

          ### Rule 2 — Three attempts, and only for code defects

          A VP step may only be marked permanently `fail` after **3 genuine
          attempts** to fix the implementation code when the root cause has
          been confirmed as a code defect. Attempts spent fixing tooling,
          installing packages, standing up services, or building test harnesses
          **do not count** against this limit.

          ### Rule 3 — E2E must run as a real user would

          Every VP step describing user-observable behavior must be exercised
          end-to-end the way a real user would — actual HTTP calls, actual UI
          interaction, actual CLI invocation. Unit-test-only results do not
          satisfy e2e steps. This phase cannot close until the e2e real-user
          path has been executed.

          ### Triage protocol (per non-pass item)

          For every non-pass step:

          1. **Spawn a review agent** (Agent tool) with the step id, captured
             output, and current `git diff`. The review agent must classify the
             blocker as exactly one of:
             - `code-defect` — implementation is wrong
             - `infra-gap` — tooling / services / fixtures missing
             - `misread-vp` — the step was misunderstood or run incorrectly

             The review agent MUST attempt the verification itself — not
             theorize about it.

          2. **If `infra-gap`** (unlimited attempts, never a terminal state):
             close the gap. Install, build, script, seed, proxy, WebSearch docs,
             stand up the service, spawn sub-agents in parallel. Then re-run
             the step. Do NOT return to this triage with an unresolved
             `infra-gap`.

          3. **If `misread-vp`**: re-read the step, run it correctly, replace
             the result. Not counted against the 3-attempt limit.

          4. **If `code-defect`**: spawn an impl-agent to fix the implementation
             code. Re-run the step. On the 3rd consecutive confirmed
             `code-defect` for the same step, you may record permanent `fail`
             with the reviewer's findings attached.

          ### Gate

          You may only proceed to commit when every non-pass has either:

          - been resolved to `pass`, OR
          - exhausted the 3-attempt code-defect limit with reviewer-confirmed
            classification

          No step may close with an `infra-gap`, `misread-vp`, `skip`, or
          `partial` status.

global_conditions:
  - changes_committed
  - changes_pushed

workflow_id_format: "VF-{session_last_4}-{MMDD}"
---
