---
name: implementation
description: "Use when implementing a spec phase. Read the spec, write focused code, run tests after every change."
---

# Implementation Methodology

## Before Writing Code
1. **Read the spec phase** — understand exactly what to build
2. **Check implementation hints** — correct imports, patterns, gotchas
3. **Identify files to change** — minimize blast radius

## While Writing Code
1. **Follow existing patterns** — match the codebase style
2. **Make minimal changes** — no unrelated refactoring
3. **Run build after significant edits** — catch errors early
4. **Run tests frequently** — don't accumulate failures

## After Writing Code
1. **Review your diff** — `git diff` to verify changes are correct
2. **Run full test suite** — ensure no regressions
3. **Check spec compliance** — does your code match all acceptance criteria?
