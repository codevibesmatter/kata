---
id: implementation
name: "Feature Implementation"
description: "Execute approved spec — claim branch, implement, test, review, close with PR"
mode: implementation
mode_skill: implementation
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
        skill: implementation
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
