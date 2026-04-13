---
id: implementation
name: Feature Implementation
description: Execute approved spec — claim branch, implement, test, review, close with PR
mode: implementation

phases:
  - id: p0
    name: Setup
    stage: setup
    task_config:
      title: "P0: Setup - read spec, verify env, create branch, claim issue"
      labels: [phase, setup]
    steps:
      - id: read-spec
        title: "Read and understand the spec"
        instruction: |
          Find and read the approved spec:
          ```bash
          ls planning/specs/ | grep "{issue_keyword}"
          ```

          Read the spec IN FULL. Understand:
          - All behaviors (B1, B2, ...) and their acceptance criteria
          - All implementation phases and their tasks
          - Non-goals (what NOT to do)
        gate:
          bash: "test -f {spec_path}"
          expect_exit: 0
      - id: env-check
        title: "Verify environment"
        instruction: |
          Run sanity checks before making any changes:
          ```bash
          git status  # Should be clean
          git log --oneline -3  # Confirm you're on the right branch
          ```

          If the build command is configured:
          ```bash
          {build_command}
          ```

          Document: current branch, any pre-existing issues.
      - id: create-branch
        title: "Create feature branch"
        instruction: |
          Create a branch for this work:
          ```bash
          git checkout -b feature/{issue_number}-{slug}
          git push -u origin feature/{issue_number}-{slug}
          ```

          Or if already on a feature branch, confirm it's up to date:
          ```bash
          git fetch origin
          git status
          ```
      - id: github-claim
        title: "Claim GitHub issue"
        instruction: |
          If GitHub issue exists, claim it:
          ```bash
          gh issue edit {issue_number} --remove-label "status:todo" --remove-label "approved" --add-label "status:in-progress"
          gh issue comment {issue_number} --body "Starting work on branch: {branch_name}"
          ```

  - id: p1
    name: Implement
    stage: work
    expansion: spec
    skill: code-impl
    subphase_pattern:
      - id_suffix: impl
        title_template: "IMPL - {task_summary}"
        todo_template: "Implement {task_summary}"
        active_form: "Implementing {phase_name}"
        labels: [impl]
        gate:
          bash: "{test_command_changed}"
          expect_exit: 0

  - id: p2
    name: Review
    stage: work
    expansion: agent
    skill: code-review
    task_config:
      title: "P2: Work - review implementation, fix issues"
      labels: [phase, work, review]
      depends_on: [p1]
    agent_protocol:
      max_tasks: 10

  - id: p3
    name: Close
    stage: close
    task_config:
      title: "P3: Close - final checks, commit, PR, close issue"
      labels: [phase, close]
      depends_on: [p2]
    steps:
      - id: final-checks
        title: "Run final checks"
        skill: test-protocol
        gate:
          bash: "{build_command}"
          expect_exit: 0
      - id: commit-push
        title: "Commit and push all changes"
        instruction: |
          Commit all implementation work:
          ```bash
          git add {changed_files}
          git commit -m "{commit_message}"
          git push
          ```
      - id: create-pr
        title: "Create pull request"
        instruction: |
          Create a PR:
          ```bash
          gh pr create \
            --title "{pr_title}" \
            --body "## Summary
          {pr_summary}

          Closes #{issue_number}" \
            --base main
          ```
      - id: update-issue
        title: "Update GitHub issue"
        instruction: |
          Comment on the GitHub issue with results:
          ```bash
          gh issue comment {issue_number} --body "{comment_body}"
          ```

global_conditions:
  - changes_committed
  - changes_pushed
---
