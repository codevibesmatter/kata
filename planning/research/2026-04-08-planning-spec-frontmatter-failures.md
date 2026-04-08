---
date: 2026-04-08
topic: Planning mode spec frontmatter validation failures
status: complete
github_issue: null
---

# Research: Planning Mode Spec Frontmatter Failures

## Context

Dev1-6 projects consistently produce spec files during planning mode with missing or malformed YAML frontmatter. The specs get approved and committed, then fail when entering implementation mode (`kata enter implementation --issue=N`). This research identifies root causes and recommends fixes.

## Questions Explored

1. What does the planning template instruct agents to do when creating spec files?
2. What frontmatter fields does `kata validate-spec` check?
3. Why does the validator not get invoked during planning?
4. Where is the gap between instruction and enforcement?

## Findings

### Codebase

**Finding 1: Regex-based task parser fails on unquoted YAML strings**
- `src/commands/validate-spec.ts:119` — task detection uses `trimmed.startsWith('- "') || trimmed.startsWith("- '")`
- This only matches quoted strings. Unquoted YAML strings (valid YAML) are silently ignored
- Result: `totalTasks === 0` even when phases have tasks, causing validation failure
- The `enter.ts:478` enforcement check also counts 0 tasks and rejects the spec

**Finding 2: Planning template P4 validate step is prose-only**
- `batteries/templates/planning.md:488-515` — the "validate-spec" step lists manual checklist items
- Says "If the project has a spec validator, run it now" — but never explicitly says `kata validate-spec`
- No `bash:` hint, no gate config, no explicit command — agent must infer what to run
- Agents consistently skip this because it reads as a suggestion, not a requirement

**Finding 3: No machine validation gate before spec approval**
- The `approve-spec` step (`planning.md:517-528`) immediately follows validate
- No gate mechanism prevents approval if validate wasn't run or failed
- The only hard enforcement is at `kata enter implementation` (enter.ts:463-507) — too late

**Finding 4: Spec writer prompt includes correct format but doesn't enforce it**
- `planning.md:248-261` shows a phases example with quoted task strings
- But this is buried in a ~100-line agent prompt — agents don't reliably follow formatting details
- No post-write validation step runs `kata validate-spec` on the output

### Feature spec template is correct but irrelevant
- `planning/spec-templates/feature.md` shows the right format with quoted tasks
- But the spec writer agent is told to write content, not copy the template verbatim
- The template serves as a structural guide, not a machine-enforced schema

## Recommendations

### R1: Replace regex task parser with js-yaml (HIGH priority)
**File:** `src/commands/validate-spec.ts`
**Change:** Use `js-yaml` (already a project dependency) to parse the full frontmatter YAML, then validate the resulting object structure. This handles all valid YAML string formats (unquoted, quoted, folded, literal).

### R2: Add explicit `kata validate-spec` command to planning P4 (HIGH priority)
**File:** `batteries/templates/planning.md` — validate-spec step instruction
**Change:** Replace the prose checklist with an explicit command:
```
Run: kata validate-spec planning/specs/{spec-file}.md
If it fails (exit code != 0), fix the issues before proceeding.
Do not approve a spec that fails validation.
```
Add a `hints:` entry with `bash: "kata validate-spec {spec_path}"`.

### R3: Add gate config to validate-spec step (MEDIUM priority)
**Change:** Add gate configuration to the validate-spec step so the framework blocks progression:
```yaml
gate:
  bash: "kata validate-spec {spec_path}"
  expect_exit: 0
  on_fail: "Spec validation failed. Fix frontmatter before approval."
```

### R4: Reinforce quoting in spec writer prompt (LOW priority)
**Change:** Add explicit formatting instruction to the spec writer agent prompt:
```
IMPORTANT: In YAML frontmatter, always quote task strings with double quotes:
  tasks:
    - "Task description here"
NOT:
  tasks:
    - Task description here
```
This is a belt-and-suspenders fix — R1 makes it unnecessary, but reduces friction.

## Open Questions

- Should `kata validate-spec` be automatically invoked by a hook during planning mode? (e.g., a pre-commit hook that validates any spec file being committed)
- Should the spec writer agent run `kata validate-spec` itself before returning?

## Next Steps

1. Fix `validate-spec.ts` to use js-yaml parser (R1)
2. Update planning template with explicit validate command (R2)
3. Consider adding gate config to the validate step (R3)
