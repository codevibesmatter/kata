# Ceremony Reference

Shared workflow instructions for kata modes. Read this as context before starting work.

## Environment Verification

Run sanity checks before making any changes:

```bash
git status          # Should be clean
git log --oneline -3  # Confirm you're on the right branch
```

If a build command is configured, run it to confirm the project compiles:

```bash
# Use the project's build_command from kata.yaml
```

Document: current branch, any pre-existing issues.

## Reading and Understanding the Spec

Find and read the approved spec:

```bash
ls planning/specs/ | grep "<issue_keyword>"
```

Read the spec IN FULL. Understand:
- All behaviors (B1, B2, ...) and their acceptance criteria
- All implementation phases and their tasks
- Non-goals (what NOT to do)

## GitHub Issue Claiming

If a GitHub issue exists, claim it:

```bash
gh issue edit <issue_number> --remove-label "status:todo" --remove-label "approved" --add-label "status:in-progress"
gh issue comment <issue_number> --body "Starting work on branch: <branch_name>"
```

## Branch Creation

Create a branch for this work:

```bash
git checkout -b feature/<issue_number>-<slug>
git push -u origin feature/<issue_number>-<slug>
```

Or if already on a feature branch, confirm it is up to date:

```bash
git fetch origin
git status
```

## Committing and Pushing

Commit all implementation work:

```bash
git add <changed_files>
git commit -m "<commit_message>"
git push
```

## Creating Pull Requests

Create a PR:

```bash
gh pr create \
  --title "<pr_title>" \
  --body "## Summary
<pr_summary>

Closes #<issue_number>" \
  --base main
```

## Updating GitHub Issues

Comment on the GitHub issue with results:

```bash
gh issue comment <issue_number> --body "<comment_body>"
```

## Running Tests

Run the project test suite:

```bash
# Use the project's test_command from kata.yaml
```

## Reading Verification Tools

Check for project verification tools:

```bash
cat .kata/verification-tools.md 2>/dev/null || echo "No verification tools configured"
```

## Starting Dev Server

If `dev_server_command` is configured, start the dev server and confirm it responds before running verification steps.
