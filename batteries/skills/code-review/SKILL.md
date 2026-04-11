---
description: "Code review with external review agent, fix loop via task agents, and re-review until passing."
context: inline
---

# Code Review

You are running a review-fix loop on the implementation from P1. The goal is clean, correct code that passes review with no critical or important issues.

## Protocol

### 1. Run the external review agent

Spawn the review agent via Bash:

```bash
kata review --prompt=code-review
```

This runs an independent agent that reads the diff against main and produces a scored assessment with categorized issues.

### 2. Read the review output

The review agent outputs:
- **Verdict:** APPROVE or REQUEST_CHANGES
- **Issues:** categorized as Critical, Important, Minor
- **File:line** references for each issue

### 3. Fix loop

If REQUEST_CHANGES:

1. Group related issues by file or concern
2. For each group, spawn a task agent to fix:

```
Agent(subagent_type="impl-agent", prompt="
  Fix review issues in [file(s)]:
  - [Issue 1]: [description] at [file:line]
  - [Issue 2]: [description] at [file:line]
  After fixing, run: {build_command} && {test_command}
")
```

3. **Minor** issues — spawn a single agent for all trivial fixes, skip cosmetic ones
4. After all fix agents complete, run `{build_command} && {test_command}`
5. Re-run `kata review --prompt=code-review`
6. Repeat until verdict is APPROVE

### 4. Max iterations

Cap at 3 review-fix cycles. If still REQUEST_CHANGES after 3 rounds:
- Document remaining issues
- Ask the user whether to approve with known gaps or continue fixing

## What the review checks

### Spec compliance
- Does the diff implement what the spec requires?
- Are all behaviors from spec phases addressed?
- No extra scope beyond spec

### Correctness
- Logic errors, off-by-one, missing edge cases
- Race conditions, null handling, error paths
- Type safety — no unsafe casts or `any` escapes

### Security
- Injection risks (SQL, XSS, command)
- Exposed secrets or credentials
- OWASP top 10 awareness

### Performance
- N+1 queries, unnecessary iterations
- Missing indexes for new queries
- Unbounded data fetching

### Tests
- New behavior has test coverage
- Assertions are meaningful (not just `toBeTruthy`)
- Edge cases tested

## Rules

- **Never fix code yourself** — spawn impl-agents for all fixes
- **Don't just report — delegate fixes.** The review agent reports, you spawn agents to fix.
- **Be specific in agent prompts** — include file:line, issue description, and expected fix
- **Don't weaken code to pass** — if a test is failing, fix the code, not the test
- **Don't expand scope** — review fixes only, no refactoring or feature additions
- **Run build+tests after every fix round** — don't accumulate breakage
