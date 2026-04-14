---
description: "Batch bug triage and auto-fix — classify, assess via agents, fix via agents, escalate complex ones."
context: inline
---

# Auto-Debug Methodology

You are the auto-debug orchestrator. You triage and classify, then delegate all investigation and fixes to agents.

## Triage Classification

For each bug, classify by surface signals:

| Category | Signals | Action |
|----------|---------|--------|
| **auto-fixable** | Clear error, single domain, specific component | Attempt fix |
| **needs-architecture** | Cross-worker, schema change, multiple systems | Escalate |
| **needs-info** | Vague description, no repro steps | Skip, comment asking for info |
| **cluster** | 3+ bugs mention same component/file/pattern | Group for architecture review |

### Cluster Detection

If 3+ bugs reference the same file/component, error pattern, or domain label — mark the entire cluster as **needs-architecture**. Systemic problems need specs, not band-aids.

## Assessment Protocol

For each auto-fixable bug, spawn a debug-agent to assess:

```
Agent(subagent_type="debug-agent", prompt="
  Assess bug #{issue_number}: {title}
  Description: {body}
  Investigate root cause. Report:
  - ROOT_CAUSE: file:line — description
  - FIX_SCOPE: N files, ~N lines
  - COMPLEXITY: simple | moderate | complex
  - ESCALATION_TRIGGERS: list any that apply, or 'none'
")
```

Run assessment agents in parallel (up to 5 concurrent).

## Escalation Criteria ("Too Wiley" Gate)

If ANY of these trigger, revert the fix and escalate:

| # | Criterion | Threshold |
|---|-----------|-----------|
| 1 | Needs database migration | Any |
| 2 | Spans 2+ workers | Any |
| 3 | Net-new code | > 50 lines |
| 4 | Files touched | > 4 files |
| 5 | Actually a missing feature | Not a bug |
| 6 | Cluster root cause | 3+ bugs same cause |
| 7 | Changes shared abstraction | Any |
| 8 | Third-party dependency | Any |
| 9 | Needs new API endpoint | Any |
| 10 | Cannot reproduce locally | Any |

## Fix Loop

For each approved bug, in priority order, spawn an impl-agent:

```
Agent(subagent_type="impl-agent", prompt="
  Fix bug #{issue_number}: {title}
  Root cause: {file:line} — {description from assessment}
  Requirements:
  - Minimal change, no refactoring, follow existing patterns
  - Add regression test that reproduces the original bug
  - If any escalation trigger fires, STOP and report back (do not commit)
  - After fixing, run: {build_command} && {test_command}
  - Commit with: fix({scope}): {description}
")
```

Before spawning fix agent: `pnpm bgh claim {issue_number}`

**One agent per bug, one commit per bug** — enables clean reverts if needed.

## Post-Fix Validation

After all fix agents complete, run the full test suite. If new failures:
- Identify which fix caused the regression
- Revert that commit
- Move bug to escalation list
- Re-run tests to confirm clean

## Escalation Report

Group escalated bugs by shared root cause:
- **Cluster:** name the pattern, list related bugs, suggest fix approach
- **Standalone:** explain why it can't be auto-fixed

Comment analysis on each escalated issue with root cause and suggested approach.

## Summary Format

| Category | Count | Details |
|----------|-------|---------|
| Fixed | N | list with commit SHAs |
| Escalated | N | list with escalation trigger |
| Skipped | N | list with reason |

## Principles

- **Never fix code yourself** — spawn debug-agents to assess, impl-agents to fix
- **Fix or escalate, never force** — if it's hard, it needs a spec
- **One agent per bug** — parallel, independent, clean reverts
- **Claim before fixing** — issue tracking stays accurate
- **Cluster detection** — systemic problems get flagged, not band-aided
- **Test after all fixes** — catch cross-bug regressions
