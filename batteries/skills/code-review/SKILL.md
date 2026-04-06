---
name: code-review
description: "Use when reviewing code changes. Check diff against spec, verify correctness, and report issues with file:line references."
---

# Code Review Methodology

## Review Checklist

1. **Spec compliance** — does the diff implement what the spec requires?
2. **Correctness** — are there logic errors, off-by-one mistakes, or missing edge cases?
3. **Security** — any injection risks, exposed secrets, or OWASP top 10 issues?
4. **Performance** — any N+1 queries, unnecessary iterations, or missing indexes?
5. **Tests** — do tests cover the new behavior? Are assertions meaningful?

## Report Format

For each issue found:
- **File:line** — exact location
- **Severity** — critical / important / minor
- **Issue** — what's wrong
- **Suggestion** — how to fix

## Verdict

- **APPROVE** — no critical or important issues
- **REQUEST CHANGES** — critical or important issues must be addressed
