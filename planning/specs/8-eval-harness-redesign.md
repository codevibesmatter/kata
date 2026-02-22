---
initiative: eval-harness-redesign
type: project
issue_type: feature
status: approved
priority: high
github_issue: 8
created: 2026-02-22
updated: 2026-02-22
phases:
  - id: p1
    name: "Assertion library refactor"
    tasks:
      - "Extract all inline assertions from scenario files into eval/assertions.ts"
      - "Make path assertions config-driven (read wm.yaml)"
      - "Create assertion preset arrays (workflowPresets, onboardPresets)"
      - "Add assertDiffNonTrivial for implementation scenarios"
  - id: p2
    name: "Scenario prompt and assertion cleanup"
    tasks:
      - "Rewrite all scenario prompts to simple natural language"
      - "Replace feature-specific assertions with presets + content-signal assertions"
      - "Add expectedMode field to EvalScenario"
  - id: p3
    name: "Fixture freshness"
    tasks:
      - "Harness runs kata batteries --update on fixture copy before agent starts"
      - "Remove stale template copies from all eval-fixtures"
      - "Add error handling for batteries failure"
---

# Eval Harness Redesign: Decouple from Fixture Specifics

> GitHub Issue: [#8](https://github.com/codevibesmatter/kata-wm/issues/8)

## Overview

The current eval harness is tightly coupled to fixture internals — prompts micromanage mode entry commands, pre-answer template questions, and assertions check for application-specific file paths (e.g., `src/routes/api/auth/$.ts`). This makes scenarios brittle, duplicative, and unable to test what actually matters: whether kata's templates and workflow system guide agents to correct outcomes. The redesign decouples eval from fixture specifics so templates do the guiding, not prompts.

## Feature Behaviors

### B1: Consolidated assertion library with presets

**Core:**
- **ID:** consolidated-assertions
- **Trigger:** Any scenario checkpoint evaluates after agent finishes
- **Expected:** All assertion functions live in `eval/assertions.ts`. No inline assertion definitions in scenario files. Assertions are exported as individual functions AND as preset arrays: `workflowPresets(mode)` returns `[assertCurrentMode(mode), assertNewCommit(), assertCleanWorkingTree(), assertCanExit()]`. `onboardPresets` returns `[assertSettingsExist(), assertWmYamlExists(), assertTemplatesExist()]`. Scenarios spread presets into their checkpoints: `checkpoints: [...workflowPresets('task'), assertDiffContains('/health')]`.
- **Verify:** `grep -r 'function assert' eval/scenarios/` returns zero matches. Every scenario imports from `eval/assertions.ts`.
- **Source:** eval/assertions.ts:1

#### UI Layer
N/A

#### API Layer
N/A

#### Data Layer
N/A

---

### B2: Simple natural-language prompts

**Core:**
- **ID:** simple-prompts
- **Trigger:** Scenario prompt is sent to agent
- **Expected:** Prompts describe the task naturally ("add authentication to this app", "add a health endpoint") without specifying mode entry commands, answering template questions, or referencing template internals. The templates and hooks guide the agent to the right mode.
- **Verify:** No scenario prompt contains `kata enter`, step-by-step template phase instructions, or pre-answered AskUserQuestion responses.

**Known tradeoff — AskUserQuestion in planning mode:** Planning templates call AskUserQuestion during P0 to clarify scope. With simplified prompts that no longer pre-answer these questions, the agent will trigger the pause/resume flow. This is acceptable — it tests the real user experience. For CI automation, the harness already supports `--resume` + `--answer` to continue paused sessions.

#### UI Layer
N/A

#### API Layer
N/A

#### Data Layer
N/A

---

### B3: Config-driven path assertions

**Core:**
- **ID:** config-driven-paths
- **Trigger:** Assertions check for spec files, research docs, or other artifacts
- **Expected:** Assertions read `wm.yaml` to discover configured paths (`spec_path`, `research_path`) rather than hardcoding `planning/specs/` or `planning/research/`. Falls back to defaults if config missing. `assertCanExit()` is already config-driven (shells out to `kata can-exit` which reads modes.yaml/wm.yaml internally) — no changes needed there.
- **Verify:** `assertSpecFileCreated()` reads `spec_path` from wm.yaml; `assertResearchDocCreated()` reads `research_path` from wm.yaml.

#### UI Layer
N/A

#### API Layer
N/A

#### Data Layer
N/A

---

### B4: Fixture freshness via batteries

**Core:**
- **ID:** fixture-freshness
- **Trigger:** Harness copies a fixture to create a fresh project (applies to ALL fixtures: web-app, tanstack-start)
- **Expected:** After copying the fixture, the harness runs `kata batteries --update` so templates always reflect the latest versions from the package. If `kata batteries` fails, the harness throws a hard error — stale templates are worse than a broken eval run.
- **Verify:** Removing all template `.md` files from `eval-fixtures/web-app/.claude/workflows/templates/` does not break scenarios — batteries re-seeds them. Same for tanstack-start.

#### UI Layer
N/A

#### API Layer
N/A

#### Data Layer
N/A

---

### B5: Content-signal assertions replace feature-specific assertions

**Core:**
- **ID:** content-signal-assertions
- **Trigger:** Scenarios need to verify the agent did substantive work, not just entered a mode
- **Expected:** Instead of checking for application-specific files (`login.tsx`, `better-auth`), scenarios use lightweight content-signal assertions: `assertDiffContains(pattern)` for task/implementation scenarios (verifies the diff contains evidence of work), `assertDiffNonTrivial(minLines)` for implementation scenarios (verifies the diff is substantial — not just a one-line change). These are mode-generic: they verify the agent produced real output without specifying what that output is.
- **Verify:** No assertion references `better-auth`, `auth/$.ts`, `login.tsx`, `dashboard.tsx`, or other application-specific paths. Implementation scenarios use `assertDiffNonTrivial(50)` instead.

#### UI Layer
N/A

#### API Layer
N/A

#### Data Layer
N/A

---

## Non-Goals

Explicitly out of scope for this feature:
- Changing the Agent SDK integration or harness core loop (query, canUseTool, transcript capture)
- Changing the LLM-as-judge system (judge.ts, prompts/transcript-review.md)
- Adding new scenarios (this is about restructuring existing ones)
- Removing the pause/resume AskUserQuestion flow
- Changing how fixtures are organized on disk (just how they're prepared)
- Backward compatibility with old eval transcript/review artifacts (old artifacts are disposable)

## Open Questions

- [x] Should we keep application-specific assertions at all? **No** for file-path assertions. **Yes** for content-signal assertions (`assertDiffContains`, `assertDiffNonTrivial`) that verify work happened without coupling to specific files.
- [x] Should continuation scenarios (planning-auth → impl-auth) survive? **Yes** — but with simpler prompts and generic assertions. They test multi-mode workflow chains.
- [x] Should we add a `category` field to EvalScenario? **No** — preset arrays (`workflowPresets`, `onboardPresets`) exported from assertions.ts are simpler, more explicit, and avoid merge-timing ambiguity. With only 8 scenarios, the indirection isn't worth it.

## Implementation Phases

See YAML frontmatter `phases:` above.

### Phase 1: Assertion library refactor

Tasks:
- Extract ALL inline assertion functions from scenario files into `eval/assertions.ts`:
  - From `planning-mode.ts` / `planning-auth.ts`: `assertSpecFileCreated`, `assertSpecApproved`, `assertSpecHasBehaviors`, `assertPlanningPhasesComplete`, `assertSpecReferencesBetterAuth` → generalize to config-driven versions
  - From `research-mode.ts`: `assertResearchMode`, `assertStayedInResearch`, `assertFindingsDoc`, `assertNoSpecs`, `assertChangesCommitted` → generalize to `assertStayedInMode(mode)`, `assertResearchDocCreated()`, `assertNoArtifacts(path)`
  - From `onboard.ts`: `assertSettingsExist`, `assertWmYamlExists`, `assertTemplatesExist`, `assertGitInitialized` → move as-is
  - From `impl-auth.ts` / `planning-auth.ts`: `assertChangesPushed` → move to shared (already in spec)
- Make `assertSpecFileCreated`, `assertResearchDocCreated` config-driven (read `spec_path`/`research_path` from wm.yaml, fall back to defaults)
- Add `assertDiffNonTrivial(minLines: number)` — checks that `git diff` against initial commit exceeds N lines
- Add `assertStayedInMode(mode)` — checks modeHistory has no unexpected mode switches
- Create preset arrays:
  - `workflowPresets(mode: string)` → `[assertCurrentMode(mode), assertNewCommit(), assertCleanWorkingTree(), assertCanExit()]`
  - `workflowPresetsWithPush(mode: string)` → `[...workflowPresets(mode), assertChangesPushed()]`
  - `onboardPresets` → `[assertGitInitialized(), assertSettingsExist(), assertWmYamlExists(), assertTemplatesExist()]`
  - `planningPresets(mode: string)` → `[...workflowPresetsWithPush(mode), assertSpecFileCreated(), assertSpecApproved(), assertSpecHasBehaviors()]`

test_cases:
- id: tc1
  description: "No inline assertion definitions in scenario files"
  command: "grep -rn 'function assert\\|const assert.*: EvalCheckpoint' eval/scenarios/ | wc -l"
  expected_exit: 0
- id: tc2
  description: "Types compile"
  command: "npm run typecheck"
  expected_exit: 0

Verification:
- Zero assertion functions defined inside scenario files
- All assertions in eval/assertions.ts
- Types compile (`npm run typecheck`)

### Phase 2: Scenario prompt and assertion cleanup

Tasks:
- Add `expectedMode` field to `EvalScenario` interface (optional, used by workflowPresets)
- Rewrite scenario prompts — one scenario at a time:
  - `task-mode`: "Add a /health endpoint that returns {status: 'ok'} to the web app."
  - `planning-mode`: "Plan a user authentication feature for this web app."
  - `research-mode`: "Research how this project could add database persistence."
  - `planning-auth`: "Plan user authentication for this TanStack Start app, building on the research in planning/research/."
  - `impl-auth`: "Implement the authentication feature described in the approved spec at planning/specs/."
  - `onboard`: "Help me get started with this project." (already simple — no change)
  - `mode-entry`: Keep as-is (smoke test with specific intent)
  - `ask-user-pause`: Keep as-is (tests harness mechanics, not workflow)
- Replace all feature-specific checkpoints with presets + content-signal assertions:
  - `task-mode`: `[...workflowPresets('task'), assertDiffContains('/health')]`
  - `planning-mode`: `[...planningPresets('planning')]`
  - `research-mode`: `[...workflowPresets('research'), assertStayedInMode('research'), assertResearchDocCreated(), assertNoArtifacts('planning/specs')]`
  - `planning-auth`: `[...planningPresets('planning')]`
  - `impl-auth`: `[...workflowPresetsWithPush('implementation'), assertDiffNonTrivial(50)]`
  - `onboard`: `[...onboardPresets]`

test_cases:
- id: tc1
  description: "No scenario prompt contains 'kata enter'"
  command: "grep -r 'kata enter' eval/scenarios/"
  expected_exit: 1
- id: tc2
  description: "Types compile"
  command: "npm run typecheck"
  expected_exit: 0

Verification:
- Prompts are 1-3 sentences of natural language
- No scenario references template internals or pre-answers AskUserQuestion
- Types compile (`npm run typecheck`)

### Phase 3: Fixture freshness

Tasks:
- In `runScenario` (harness.ts), after copying fixture and before git init, run `kata batteries --update` in the project dir. If it fails (exit code !== 0), throw with clear error message.
- Remove template `.md` files from `eval-fixtures/web-app/.claude/workflows/templates/` (keep the directory, keep settings.json and wm.yaml)
- Remove template `.md` files from `eval-fixtures/tanstack-start/.claude/workflows/templates/` if present
- Add fixture validation: after batteries + git init, verify `.claude/workflows/templates/` contains at least one `.md` file

test_cases:
- id: tc1
  description: "Fixture setup produces fresh templates via batteries"
  command: "npm run eval -- --scenario=task-mode --verbose"
  expected_exit: 0

Verification:
- Eval runs successfully with batteries-refreshed templates
- Types compile (`npm run typecheck`)
- At least task-mode and onboard scenarios pass end-to-end

---

<!-- Spec for issue #8: Redesign eval harness -->
