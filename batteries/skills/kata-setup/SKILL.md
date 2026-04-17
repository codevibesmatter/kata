---
description: "Universal session setup — env verification, branch creation, issue claiming, plus mode-conditional steps."
context: inline
---

# Mode Setup

Run these steps at the start of any kata mode session before beginning work.

## 1. Discover Mode Context

Run `kata status` to discover the current session:

```bash
kata status
```

Note the following from the output:
- Current mode name
- Issue number (if any)
- Workflow ID

## 2. Environment Verification

Run sanity checks before making any changes:

```bash
git status            # Should be clean
git log --oneline -3  # Confirm you're on the right branch
```

If a build command is configured, run it to confirm the project compiles:

```bash
{build_command}
```

Document: current branch, any pre-existing issues.

## 3. Pull Latest

Pull the latest changes from the remote so work starts from an up-to-date base:

```bash
git pull --ff-only origin main 2>/dev/null || git pull --ff-only 2>/dev/null || true
```

If on a feature branch, pull its tracking branch instead:

```bash
git pull --ff-only
```

If the pull fails (e.g. diverged history), note it and continue — do not force-pull or reset.

## 4. Branch Creation

Create a branch for this work:

```bash
git checkout -b feature/{issue_number}-{slug}
git push -u origin feature/{issue_number}-{slug}
```

If already on a feature branch, confirm it is up to date:

```bash
git fetch origin && git status
```

## 5. GitHub Issue Claiming

If a GitHub issue exists, claim it:

```bash
gh issue edit {issue_number} --remove-label "status:todo" --remove-label "approved" --add-label "status:in-progress"
gh issue comment {issue_number} --body "Starting work on branch: {branch_name}"
```

## 6. Mode-Conditional Steps

### If in implementation mode

Read the approved spec in full:

```bash
ls planning/specs/ | grep "{issue_keyword}"
```

Understand all behaviors, phases, non-goals, and acceptance criteria before writing any code.

Capture the test baseline:

```bash
kata test-baseline save
```

### If in debug mode

No additional setup steps beyond universal. The debug-methodology skill handles the rest.

### If in research mode

Classify the research type: feature research, library eval, brainstorming, or feasibility study.

If the type is obvious from the user message, state it and move on. If unclear, ask the user to clarify.

### If in verify mode

Read verification tools:

```bash
cat .kata/verification-tools.md 2>/dev/null || echo "No verification tools configured"
```

If `dev_server_command` is configured, start it and confirm it responds before proceeding.

### If in planning mode

No additional setup steps. Planning's research and interview phases handle discovery.

### If in task mode

No additional setup steps beyond universal.
