---
id: implementation
name: "Feature Implementation"
description: "Execute approved spec — claim branch, implement, test, review, close with PR"
mode: implementation
phases:
  - id: p0
    name: Baseline
    task_config:
      title: "P0: Baseline - verify environment, read spec, confirm approach"
      labels: [orchestration, baseline]
    steps:
      - id: read-spec
        title: "Read and understand the spec"
        gate:
          bash: "test -f {spec_path}"
          expect_exit: 0
          on_fail: "Spec file not found at {spec_path}. Ask user for the spec file location."
        hints:
          - read: "{spec_path}"
        instruction: |
          Read the spec IN FULL. Verify it has `status: approved` before proceeding.
          Understand all behaviors, implementation phases, tasks, and non-goals.
          Then: Mark this task completed via TaskUpdate

      - id: verify-environment
        title: "Verify dev environment is working"
        hints:
          - bash: "git status"
          - bash: "git log --oneline -3"
        instruction: |
          Run sanity checks before making any changes. Confirm clean tree
          and correct branch. Document current branch and any pre-existing issues.
          Then: Mark this task completed via TaskUpdate

  - id: p1
    name: Claim
    task_config:
      title: "P1: Claim - create branch, link GitHub issue"
      labels: [orchestration, claim]
      depends_on: [p0]
    steps:
      - id: create-branch
        title: "Create feature branch"
        instruction: |
          Create a branch for this work:
          ```bash
          git checkout -b feature/{issue-number}-{slug}
          git push -u origin feature/{issue-number}-{slug}
          ```

          Or if already on a feature branch, confirm it's up to date:
          ```bash
          git fetch origin
          git status
          ```

          Then: Mark this task completed via TaskUpdate

      - id: claim-github-issue
        title: "Claim GitHub issue"
        instruction: |
          If GitHub issue exists, claim it:
          ```bash
          gh issue edit {N} --remove-label "status:todo" --remove-label "approved" --add-label "status:in-progress"
          gh issue comment {N} --body "Starting implementation on branch: feature/{issue-number}-{slug}"
          ```

          If no GitHub issue, skip this step.
          Then: Mark this task completed via TaskUpdate

  - id: p2
    name: Implement
    container: true
    subphase_pattern:
      - id_suffix: impl
        title_template: "IMPL - {task_summary}"
        todo_template: "Implement {task_summary}"
        active_form: "Implementing {phase_name}"
        labels: [impl]
        gate:
          bash: "{test_command_changed}"
          expect_exit: 0
          on_fail: "Tests failing. Fix before marking complete."
        hints:
          - read: "{spec_path}"
            section: "## Phase {phase_label}"
        instruction: |
          Implement the behavior described in the spec phase.
          Reference the spec for detailed requirements.
          Tests must pass before this task can be completed.

  - id: p3
    name: Close
    task_config:
      title: "P3: Close - final checks, commit, PR, close issue"
      labels: [orchestration, close]
      depends_on: [p2]
    steps:
      - id: final-checks
        title: "Run final checks"
        hints:
          - bash: "git status"
          - bash: "git diff --staged"
          - bash: "{build_command} && {test_command}"
        instruction: |
          Run final checks before closing. Verify all changes are staged,
          build and tests pass. Fix any remaining issues.
          Then: Mark this task completed via TaskUpdate

      - id: commit-and-push
        title: "Commit and push all changes"
        instruction: |
          Commit all implementation work:
          ```bash
          git add {changed files}
          git commit -m "feat({scope}): {description}

          Implements #{github-issue-number}"
          git push
          ```

          Then: Mark this task completed via TaskUpdate

      - id: create-pr
        title: "Create pull request"
        instruction: |
          Create a PR:
          ```bash
          gh pr create \
            --title "feat: {feature title} (#N)" \
            --body "## Summary
          - {bullet 1}
          - {bullet 2}

          ## Changes
          - {file/component}: {what changed}

          Closes #{N}" \
            --base main
          ```

          Note the PR URL. Move issue to in-review:
          ```bash
          gh issue edit {N} --remove-label "status:in-progress" --add-label "status:in-review"
          ```

          Then: Mark this task completed via TaskUpdate

      - id: close-issue
        title: "Update GitHub issue"
        instruction: |
          If GitHub issue exists:
          ```bash
          gh issue comment {N} --body "Implementation complete. PR: {pr-url}"
          ```

          The issue will auto-close when PR is merged ("Closes #N" in PR body).
          On merge, add status:done:
          ```bash
          gh issue edit {N} --remove-label "status:in-review" --add-label "status:done"
          ```
          Then: Mark this task completed via TaskUpdate

global_conditions:
  - changes_committed
  - changes_pushed
---

# Implementation Mode

You are in **implementation** mode. Execute the approved spec phase by phase.

## Your Role

You are an **IMPLEMENTATION ORCHESTRATOR**. You coordinate agents to execute approved specs.

**You DO:**
- Spawn impl-agents for code work (Task tool with subagent_type="impl-agent")
- Run quality gates (TEST protocol, provider-based REVIEW)
- Verify commits exist before closing tasks
- Track progress via TaskUpdate

**You do NOT:**
- Write implementation code yourself (delegate to impl-agents)
- Skip quality gates
- Close tasks without evidence (commits, test results)

## Phase Flow

```
P0: Baseline
    ├── Read spec IN FULL
    └── Verify environment is clean

P1: Claim
    ├── Create feature branch
    └── Claim GitHub issue

P2: Implement (per-spec-phase, SPAWN agents)
    ├── IMPL: SPAWN impl-agent (Task tool) — do NOT code yourself
    ├── TEST: run process gates (build, typecheck, tests)
    └── REVIEW: run provider-based code review (kata review)

P3: Close
    ├── Final typecheck + tests
    ├── Commit + push
    ├── Create PR
    └── Comment on GitHub issue
```

## Key Rules

- **Read spec first** — understand ALL phases before writing code
- **One phase at a time** — complete IMPL + TEST before moving on
- **No scope creep** — spec's non-goals are off-limits
- **Commit per phase** — smaller commits, easier review

## TEST Protocol

Each TEST sub-phase runs deterministic checks only. Do NOT skip steps or reorder.

### Step 1: Build check

Run the project's **build command** (e.g. `npm run build`), not bare
`tsc --noEmit`. Projects with build-time codegen (route types, schema
generation) need the full pipeline. If the build fails, fix and re-run
before proceeding.

### Step 2: Run tests

Run the project's test command. If the spec phase has `test_cases:` in
its YAML, verify each one:

```
For each test_case in the spec phase:
  - Does a test exist that covers this case?
  - If not, write the test BEFORE marking TEST complete.
  - Run the test and confirm it passes.
```

If no test infrastructure exists, check the spec's Verification Strategy
section for setup instructions.

### Step 3: Check for implementation hints

Re-read the spec's Implementation Hints section. Verify:
- Correct imports used (not guessed from node_modules exploration)
- Initialization follows documented patterns
- Known gotchas addressed

### Retry limits

If a build or test fails:
- Fix the issue using the error output (not blind retry)
- Maximum 3 fix attempts per failure before escalating to user
- Never silence errors, skip tests, or weaken assertions to pass

## REVIEW Protocol

Each REVIEW sub-phase runs reviewers sequentially and prints all results:

**Step 1 — Read kata.yaml to discover external reviewers (do this FIRST):**
```bash
cat .kata/kata.yaml
```
Note: `reviews.code_review` (true/false) and `reviews.code_reviewers` list.

**Step 2 — Always spawn review-agent:**
```
Task(subagent_type="review-agent", prompt="
  Review changes for {phase}. Check diff against spec.
  Return: verdict (APPROVE / REQUEST CHANGES) with file:line issues.
")
```

**Step 3 — Run each external provider:**
If `code_review: true` and `code_reviewers` is non-empty, run each in sequence:
```bash
kata review --prompt=code-review --provider=<name>
```
If no `code_reviewers` configured, skip this step.

Print all review results together before marking the REVIEW task complete.

## Standalone Verification

For full Verification Plan execution after implementation, run a separate verify session:
```bash
kata enter verify --issue=N
```
This spawns a standalone mode with its own fix loop — no SDK nesting required.

## Stop Conditions

- All spec phases implemented, tested, and reviewed
- Changes committed and pushed
- PR created (or explicitly skipped)
