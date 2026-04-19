---
description: "Universal session close — tests, commit, push, plus mode-conditional steps (PR, issue update, evidence)."
context: inline
---

# Mode Close

Run these steps at the end of any kata mode session to finalize and deliver work.

## 1. Discover Mode Context

Run `kata status` to confirm the current session:

```bash
kata status
```

Note the following from the output:
- Current mode name
- Issue number (if any)
- Workflow ID

## 2. Run Tests

Run the project test suite using the configured test command:

```bash
{test_command}
```

If a build command is configured, run it too:

```bash
{build_command}
```

Fix any failures before proceeding.

## 3. Commit and Push

Stage and commit all changes:

```bash
git add {changed_files}
git commit -m "{commit_message}"
git push
```

## 4. Mode-Conditional Steps

### If in task mode

Universal steps only (tests, commit, push). No PR creation, no issue update.

### If in implementation mode

Create a pull request:

```bash
gh pr create \
  --title "{pr_title}" \
  --body "## Summary
{pr_summary}

Closes #{issue_number}" \
  --base main
```

Update the GitHub issue:

```bash
gh issue comment {issue_number} --body "{comment_body}"
```

### If in debug mode

Update the GitHub issue with the root-cause summary:

```bash
gh issue comment {issue_number} --body "{comment_body}"
```

### If in research mode

Commit and push only. Tests are not required for research mode — skip step 2.

No PR creation.

Create a GitHub issue to capture the research findings and any follow-up work:

```bash
gh issue create \
  --title "{research_title}" \
  --body "## Summary
{research_summary}

## Findings
{key_findings}

## Follow-up
{followup_items}

Research doc: {research_doc_path}"
```

Use the research document's title and top-level summary for `{research_title}` and `{research_summary}`. Link the created issue number back in the commit message or as a follow-up comment if needed.

Labels are not applied automatically — `gh issue create --label <name>` fails when the label doesn't exist in the target repo. If the project has a `research` (or similar) label and you want to apply it, verify it exists first:

```bash
gh label list --search research --json name --jq '.[].name'
```

Only add `--label <name>` to the create command above if the label is present. Otherwise, add labels after the fact with `gh issue edit <number> --add-label <name>` once the repo has them.

### If in planning mode

Run spec validation:

```bash
kata validate-spec --issue={issue}
```

Update spec frontmatter: set `status: approved` and `updated: {today}`.

Commit and push the updated spec.

### If in verify mode

Write VP evidence JSON to `.kata/verification-evidence/vp-{issueNumber}.json`:

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

Challenge all incomplete VP items — push back on laziness, attempt each verification with available tools.

Update the GitHub issue with results:

```bash
gh issue comment {issue_number} --body "{comment_body}"
```
