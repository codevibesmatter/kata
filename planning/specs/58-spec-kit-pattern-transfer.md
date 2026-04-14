---
initiative: spec-kit-pattern-transfer
type: project
issue_type: feature
status: approved
priority: medium
github_issue: 58
created: 2026-04-14
updated: 2026-04-14
phases:
  - id: p1
    name: "knowledge.md scaffolding + setup interview"
    tasks:
      - "Create batteries/interviews/knowledge.yaml with adaptive question set"
      - "Create batteries/knowledge-template.md with fixed schema (Principles + Change-Cadence table + variable layer sections)"
      - "Create src/commands/knowledge-signals.ts exporting detectKnowledgeSignals(projectRoot) with unit tests (fixture-based)"
      - "Extend batteries/skills/kata-setup/SKILL.md fresh-project scenario to run knowledge interview + write .kata/knowledge.md"
      - "Extend existing-project reconfigure scenario to offer knowledge interview"
      - "Update scaffold-batteries.ts to copy knowledge-template.md on setup when .kata/knowledge.md absent"
    test_cases:
      - id: "knowledge-fresh"
        description: "Fresh project setup generates .kata/knowledge.md with Principles + Rules sections"
        type: "integration"
      - id: "knowledge-adaptive"
        description: "Setup inspects project signals (docs/ presence, package count) and asks layer questions conditionally"
        type: "unit"
      - id: "knowledge-reconfig"
        description: "Existing project with .kata/kata.yaml gets offered knowledge interview on re-setup"
        type: "integration"
  - id: p2
    name: "Spec template self-checklist + skills load knowledge.md"
    tasks:
      - "Add Self-Checklist section to batteries/spec-templates/feature.md between Test Infrastructure and Implementation Hints"
      - "Update batteries/skills/kata-spec-writing/SKILL.md to load .kata/knowledge.md as first step and cite principles when writing"
      - "Update batteries/skills/kata-spec-review/SKILL.md to load .kata/knowledge.md as first step"
    test_cases:
      - id: "template-checklist"
        description: "Generated spec from template includes Self-Checklist section with 6+ items"
        type: "unit"
      - id: "skill-loads-knowledge"
        description: "Spec-writing skill resolves and loads .kata/knowledge.md before generating spec content"
        type: "integration"
  - id: p3
    name: "kata-clarify skill + planning template phase insertion"
    tasks:
      - "Create batteries/skills/kata-clarify/SKILL.md with ambiguity-scan + patch-in-place methodology"
      - "Update batteries/templates/planning.md: rename p3/p4 to p4/p5, insert new p3 clarify phase with skill: clarify, depends_on p2"
      - "Add clarify stop condition for planning mode (clarify_complete) if needed"
      - "Verify installUserSkills picks up kata-clarify on update"
    test_cases:
      - id: "clarify-skill-installed"
        description: "kata update copies batteries/skills/kata-clarify/ to ~/.claude/skills/kata-clarify/"
        type: "integration"
      - id: "planning-six-phases"
        description: "kata enter planning creates 6 tasks (p0-p5) including clarify at p3"
        type: "integration"
      - id: "clarify-patches-spec"
        description: "Running clarify skill on a spec with missing Verify fields patches those fields after asking user"
        type: "smoke"
  - id: p4
    name: "Coverage-matrix gate + self-checklist validation in spec-review"
    tasks:
      - "Update batteries/skills/kata-spec-review/reviewer-prompt.md with coverage-matrix audit section"
      - "Update .kata/prompts/spec-review.md (and batteries template) to require coverage matrix output table"
      - "Update reviewer prompt to validate each Self-Checklist item against spec content (not box-ticks)"
      - "Update scoring: missing B-ID→phase or B-ID→VP coverage = Critical gap, blocks approval regardless of score"
      - "Update SKILL.md to document new gate semantics"
    test_cases:
      - id: "coverage-matrix-output"
        description: "Spec-review output contains explicit coverage matrix table: B-ID | Phases | VP steps"
        type: "smoke"
      - id: "gate-fails-missing-vp"
        description: "Spec with B-ID that has no VP step fails review with Critical coverage gap"
        type: "integration"
      - id: "gate-fails-missing-phase"
        description: "Spec with B-ID not referenced by any phase task fails review"
        type: "integration"
      - id: "checklist-validation"
        description: "Reviewer validates each self-checklist item by reading spec content, marks unmet items as Critical"
        type: "integration"
---

# Spec-kit Pattern Transfer: knowledge.md, clarify, coverage gate, self-checklist

> GitHub Issue: [codevibesmatter/kata#58](https://github.com/codevibesmatter/kata/issues/58)

## Overview

Selectively transfer four patterns from [github/spec-kit](https://github.com/github/spec-kit) and baseplane's layered docs system into kata: a project knowledge-TOC file (`.kata/knowledge.md`), a post-draft clarify phase, a cross-artifact coverage-matrix gate in spec-review, and a reviewer-validated self-checklist in the spec template. This raises the spec bar without taking on spec-kit's bloat (multi-agent abstraction, numbered `specs/NNN-*/` directories, 4-level template override).

## Feature Behaviors

### B1: Fresh project setup generates a minimal knowledge.md

**Core:**
- **ID:** knowledge-minimal-default
- **Trigger:** User runs `kata setup --yes` (or `/kata-setup`) in a project without `.kata/kata.yaml`. `--yes` skips the interview and seeds `.kata/knowledge.md` with defaults (empty `# Principles` placeholder comment + `## Change Cadence` table with only the `Rules` row); interactive `/kata-setup` runs the knowledge interview and fills the sections from answers.
- **Expected:** `.kata/knowledge.md` is created with a fixed schema: `# Principles` section (populated from interview, or a placeholder comment under `--yes`), `## Change Cadence` table with at minimum a `Rules` row pointing to `.claude/rules/`, plus any additional layer sections the user declared
- **Verify:** Integration test — run setup in a fixture with no `.kata/`, assert `.kata/knowledge.md` exists and contains required headers
- **Source:** `batteries/skills/kata-setup/SKILL.md:35-63` (fresh project scenario), `src/commands/scaffold-batteries.ts:189-197`

#### UI Layer
N/A (CLI/skill interaction)

#### API Layer
N/A (no network surface). Skill orchestration: kata-setup invokes `/kata-interview knowledge`, interview output is read from the interview result file, knowledge.md is rendered from template + interview answers.

#### Data Layer
New file: `.kata/knowledge.md` (markdown, tracked in git). New file: `batteries/interviews/knowledge.yaml` (shipped via scaffold-batteries). New file: `batteries/knowledge-template.md` (template with placeholders).

---

### B2: Knowledge interview adapts to project signals

**Core:**
- **ID:** knowledge-adaptive-interview
- **Trigger:** kata-setup runs the knowledge interview as part of fresh or reconfigure scenario
- **Expected:** Interview inspects project state using concrete predicates (defaults, overridable in knowledge.yaml): **has_docs_dir** = `docs/` directory exists at project root; **is_monorepo** = `package.json` has `workspaces` field OR `packages/` dir exists OR `pnpm-workspace.yaml` exists; **is_large** = non-ignored source files count ≥ 100 (via `git ls-files '*.ts' '*.js' '*.py' '*.go' '*.rs'`). Asks principles + rules always (2 questions). If `has_docs_dir`: adds theory-layer question. If `is_monorepo` OR `is_large`: adds modules-layer question. If `has_docs_dir` AND has ≥3 files under `docs/` matching primitive patterns: adds primitives question.
- **Verify:** Unit tests on the signal-detection function with fixture project states; integration test confirms small project gets ≤3 interview questions
- **Source:** new `batteries/interviews/knowledge.yaml` (declares the question set with `trigger` fields referencing predicate names); new `src/commands/knowledge-signals.ts` exporting a deterministic `detectKnowledgeSignals(projectRoot): { has_docs_dir, is_monorepo, is_large, has_primitive_docs }` function. Skill prose in `kata-setup/SKILL.md` calls this helper and filters interview questions by matching `trigger` to the returned signals. TypeScript helper is unit-testable with fixture directory snapshots.

#### UI Layer
AskUserQuestion-driven, same pattern as existing interviews (batteries/interviews/requirements.yaml)

#### API Layer
N/A

#### Data Layer
Interview output consumed in-process; final artifact is `.kata/knowledge.md`

---

### B3: Spec-writing skill loads and cites knowledge.md

**Core:**
- **ID:** spec-writing-loads-knowledge
- **Trigger:** User invokes `/kata-spec-writing` in planning mode
- **Expected:** Skill reads `.kata/knowledge.md` as its first step before drafting any spec content. Spec output includes a `Referenced Knowledge:` subsection in Overview listing which principles/layers the feature touches. If `.kata/knowledge.md` is absent, skill warns but continues (backwards compatibility for legacy projects).
- **Verify:** Integration test — invoke spec-writing with a fixture containing a knowledge.md with unique principle string, assert generated spec references that principle
- **Source:** `batteries/skills/kata-spec-writing/SKILL.md` (add step 0)

#### UI Layer
N/A

#### API Layer
N/A

#### Data Layer
Reads existing `.kata/knowledge.md`; no writes

---

### B4: Spec template includes Self-Checklist section

**Core:**
- **ID:** spec-template-self-checklist
- **Trigger:** User creates a new spec from `batteries/spec-templates/feature.md`
- **Expected:** Generated spec includes `## Self-Checklist` section between Test Infrastructure and Implementation Hints. Checklist items cover: all B-IDs have Trigger/Expected/Verify populated; every B-ID maps to at least one phase task; every B-ID has a VP step; phases are 1–4 hours each; non-goals are explicit; referenced knowledge layers are cited.
- **Verify:** Unit test — load template, confirm `## Self-Checklist` section exists with ≥6 items and `- [ ]` syntax
- **Source:** `batteries/spec-templates/feature.md:122` (insertion point)

#### UI Layer
N/A

#### API Layer
N/A

#### Data Layer
Template file edit only

---

### B5: New p3 clarify phase in planning template

**Core:**
- **ID:** planning-clarify-phase
- **Trigger:** User runs `kata enter planning --issue=N`
- **Expected:** Six tasks pre-created instead of five: p0 research → p1 interview → p2 spec-writing → **p3 clarify** → p4 spec-review → p5 finalize. p3 task instruction reads "Invoke /kata-clarify". p3 is blocked by p2 and blocks p4.
- **Verify:** Integration test — `kata enter planning --issue=X` in fixture, `kata status` shows 6 phases including p3 clarify; task dependency chain is correct
- **Source:** `batteries/templates/planning.md:7-68`

#### UI Layer
N/A (task-list visible via `kata status`)

#### API Layer
N/A

#### Data Layer
Template YAML frontmatter edit; phase renumbering (existing p3→p4, p4→p5)

---

### B6: kata-clarify skill performs ambiguity scan and patches spec in place

**Core:**
- **ID:** clarify-scan-and-patch
- **Trigger:** User invokes `/kata-clarify` during planning p3
- **Expected:** Skill (1) loads `.kata/knowledge.md`, (2) resolves the draft spec by globbing `planning/specs/{N}-*.md` where `{N}` is the GH issue number from the active workflow; if zero matches, exits with "spec not found, run /kata-spec-writing first"; if multiple matches, picks the most recently modified and warns, (3) scans for ambiguities — missing Verify fields, behaviors without VP steps, vague API shapes (e.g., "returns data"), underspecified Triggers, TODO markers, (4) issues targeted AskUserQuestion batches for the specific gaps, (5) patches the spec in place with answers, (6) outputs a summary of patches made. If no ambiguities found, exits with "no clarification needed".
- **Verify:** Smoke test — hand-crafted spec with known gap (e.g., B2 has no Verify field); run clarify skill; confirm skill asks about B2.Verify and patches it
- **Source:** new `batteries/skills/kata-clarify/SKILL.md`

#### UI Layer
AskUserQuestion-driven, same pattern as interview

#### API Layer
N/A

#### Data Layer
Reads and writes `planning/specs/{N}-{slug}.md` (patches in place). Reads `.kata/knowledge.md`.

---

### B7: Spec-review emits coverage matrix and hard-fails on gaps

**Core:**
- **ID:** review-coverage-matrix
- **Trigger:** Spec-review skill runs on a draft spec during planning p4
- **Expected:** Reviewer output contains an explicit coverage matrix table with columns `B-ID | Phase Tasks | VP Steps`. For each B-ID in the spec, reviewer identifies which phase tasks implement it and which VP step verifies it. If any B-ID has zero phase tasks OR zero VP steps, reviewer marks a Critical gap and fails approval (Status = FAIL) regardless of the 0–100 score. Deferral via spec edits (remove B-ID) is the only way to pass.
- **Verify:** Integration test — fixture spec with B3 lacking a VP step; run review; confirm Status=FAIL and matrix table shows B3 row with empty VP cell
- **Source:** `batteries/skills/kata-spec-review/reviewer-prompt.md:14-60`, `.kata/prompts/spec-review.md:5-26`

#### UI Layer
N/A (reviewer output is markdown text)

#### API Layer
N/A

#### Data Layer
No writes; produces review markdown consumed by the review loop

---

### B8: Spec-review validates each self-checklist item against spec content

**Core:**
- **ID:** review-checklist-validation
- **Trigger:** Spec-review runs on a spec with `## Self-Checklist` section
- **Expected:** For each checklist item, reviewer reads the spec content and determines whether the claim holds (e.g., "All B-IDs have Verify" — reviewer grep/scans for missing Verify fields). Reviewer ignores `- [ ]` vs `- [x]` state in the file. Any unmet item becomes a Critical gap and blocks approval.
- **Verify:** Integration test — fixture spec with checklist item "every B-ID has a VP step" but a B-ID missing a VP step; confirm reviewer marks Critical regardless of whether the author ticked the box
- **Source:** `batteries/skills/kata-spec-review/reviewer-prompt.md`

#### UI Layer
N/A

#### API Layer
N/A

#### Data Layer
No writes

---

## Non-Goals

Explicitly out of scope:
- Rules-to-layer mapping (`_rule-mapping.json`) — deferred to follow-up issue
- Separate `/plan` artifact (kata keeps implementation phases in the spec)
- Nested `specs/NNN-feature/` directories with 5+ files
- Multi-agent assistant abstraction (Claude-native)
- Per-user-story checkpoint validation (phase gates already provide this)
- Auto-generating knowledge.md from code analysis (interview-driven only)
- Migrating existing specs to include self-checklist retroactively
- Project-root `knowledge.md` (confined to `.kata/`)

## Open Questions

None — all requirements resolved during P1 interview. (Clarify-on-missing-spec behavior is captured in B6 Expected; adaptive-signal thresholds are captured in B2 Expected.)

## Implementation Phases

See YAML frontmatter `phases:` above. Each phase is 2–4 hours of focused work.

Phase ordering rationale:
- **p1 first** (scaffolding) — knowledge.md must exist before skills can load it, so the template + interview land first
- **p2** (template + skill loads) — extends existing artifacts with knowledge references; low risk, unlocks downstream work
- **p3** (new skill + template phase) — kata-clarify is new surface; gets its own phase to test in isolation before gating
- **p4 last** (review gate) — tightening the review bar last means we can validate our own specs pass before shipping

## Verification Strategy

### Test Infrastructure
- **Bun test runner** exists (`bun test src/`); no new infra needed
- **Eval harness** (`npm run eval`) — add new scenarios for knowledge.md presence and clarify flow; reuse `tanstack-start-fresh` fixture for B1 and `tanstack-start` for B5-B8

### Build Verification
- Run `bun run typecheck` after source changes
- Run `bun test src/` for unit + integration
- Run `npm run eval -- --scenario=knowledge-setup --verbose` for B1-B2 end-to-end
- Run `npm run eval -- --scenario=spec-writing-knowledge --verbose` for B3 (spec-writing cites knowledge.md)
- Run `npm run eval -- --scenario=clarify-patch --verbose` for B6 end-to-end
- Run `npm run eval -- --scenario=review-coverage-gate --verbose` for B7-B8

## Self-Checklist

- [ ] Every B-ID has concrete Trigger, Expected, Verify fields (no TBDs)
- [ ] Every B-ID maps to ≥1 phase task in frontmatter
- [ ] Every B-ID has ≥1 VP step below
- [ ] All phases are 1–4 hours of focused work
- [ ] Non-goals are explicit and comprehensive
- [ ] Referenced knowledge layers (kata's own principles) are cited where applicable
- [ ] No open questions block implementation start

## Verification Plan

Executable steps a fresh agent runs against a built kata.

### VP1: Fresh project gets minimal knowledge.md
Steps:
1. `cd $(mktemp -d) && git init . && npm init -y` — Expected: empty project initialized
2. `kata setup --yes` — Expected: exits 0, creates `.kata/kata.yaml`, `.kata/knowledge.md`
3. `cat .kata/knowledge.md` — Expected: contains `# Principles` heading and `## Change Cadence` table with at least a Rules row

### VP2: Spec-writing skill loads knowledge.md
Steps:
1. In a fixture with `.kata/knowledge.md` containing the string `SENTINEL-PRINCIPLE-XYZ`, run `kata enter planning --issue=1 && /kata-spec-writing` — Expected: spec draft generated
2. `awk '/^## Overview/,/^## /' planning/specs/1-*.md | grep -q '^### Referenced Knowledge'` — Expected: exit 0 (spec Overview contains the `Referenced Knowledge:` subsection header declared in B3)
3. `awk '/^### Referenced Knowledge/,/^## |^### /' planning/specs/1-*.md | grep -q 'SENTINEL-PRINCIPLE-XYZ'` — Expected: exit 0 (the principle appears inside that subsection, proving the skill read knowledge.md and cited it in the structured slot, not merely referenced the filename)

### VP3: Adaptive knowledge interview produces different knowledge.md sections per project shape
Steps:
1. Create bare fixture: `mkdir -p /tmp/bare && cd /tmp/bare && git init . && npm init -y` (no `docs/`, no workspaces, zero source files)
2. Run `/kata-setup` in `/tmp/bare`, accepting defaults — Expected: `.kata/knowledge.md` exists
3. `grep -cE '^## (Theory|Modules|Primitives)' /tmp/bare/.kata/knowledge.md` — Expected: `0` (no layer sections triggered)
4. Create rich fixture: `mkdir -p /tmp/rich/docs && cd /tmp/rich && git init . && touch docs/primitive-a.md docs/primitive-b.md docs/primitive-c.md && cat > package.json <<'EOF'
{"name":"rich","workspaces":["packages/*"]}
EOF`
5. Run `/kata-setup` in `/tmp/rich`, accepting defaults — Expected: `.kata/knowledge.md` exists
6. `grep -cE '^## (Theory|Modules|Primitives)' /tmp/rich/.kata/knowledge.md` — Expected: `3` (all layer sections triggered: has_docs_dir → Theory, is_monorepo → Modules, has_primitive_docs → Primitives)

### VP4: Spec template generates Self-Checklist section
Steps:
1. `cat batteries/spec-templates/feature.md | grep -c '^## Self-Checklist'` — Expected: `1`
2. `awk '/^## Self-Checklist/,/^## /' batteries/spec-templates/feature.md | grep -c '^- \[ \]'` — Expected: ≥6
3. Generate a new spec from the template (copy + fill placeholders) and confirm the Self-Checklist section carries over intact
   Expected: section preserved with all items

### VP5: Planning mode creates 6 tasks with clarify at p3
Steps:
1. `kata enter planning --issue=58` in a fixture — Expected: output lists 6 tasks including a p3 task with description referencing clarify
2. `kata status` — Expected: 6 phases listed (p0–p5)

### VP6: kata-clarify patches spec in place
Steps:
1. Create `planning/specs/99-test.md` with behavior B1 missing Verify field
2. `/kata-clarify` (in planning mode with issue 99, p3 active) — Expected: skill asks a targeted question about B1.Verify
3. Provide answer — Expected: spec file now contains Verify field for B1

### VP7: Spec-review hard-fails on missing VP coverage
Steps:
1. Create spec with B1, B2 in frontmatter phases, VP1 only covers B1 (B2 has no VP step)
2. Run `/kata-spec-review` on the spec — Expected: review output contains coverage matrix table; B2 row has empty VP cell; Status = FAIL; Critical gap listed

### VP8: Spec-review validates self-checklist against content
Steps:
1. Create spec with `## Self-Checklist` including item "Every B-ID has Verify" — all boxes ticked `- [x]` — but B3 has empty Verify field
2. Run `/kata-spec-review` — Expected: reviewer flags Critical gap for B3.Verify regardless of ticked box; Status = FAIL

## Implementation Hints

### Dependencies
No new npm dependencies. Reuses existing: `zod`, `js-yaml`, `@anthropic-ai/claude-agent-sdk`.

### Key Imports
| Module | Import | Used For |
|--------|--------|----------|
| `src/commands/interview.ts` | `loadInterviewCategory` | Loading knowledge.yaml in kata-setup |
| `src/commands/scaffold-batteries.ts` | `copyDirectory`, `scaffoldBatteries` | Seeding knowledge-template.md on fresh setup |
| `src/session/lookup.ts` | `findProjectDir`, skill path resolvers | Locating .kata/knowledge.md from skill context |

### Code Patterns

**Loading knowledge.md in a skill (Bash + Read within SKILL.md instructions):**
```markdown
## Step 0: Load project knowledge
Read `.kata/knowledge.md` (if it exists). Note the Principles section and which layers are declared.
When writing the spec, cite principles that constrain the feature, and list referenced layers in the Overview.
```

**Adaptive interview branching (knowledge.yaml — schema mirrors `batteries/interviews/requirements.yaml` with an added optional `trigger` field per category):**
```yaml
# batteries/interviews/knowledge.yaml
categories:
  - id: principles
    # no trigger = always asked
    question: "What are your project's non-negotiable principles?"
    prompt_template: "List 3-5 principles..."
  - id: theory
    trigger: has_docs_dir
    question: "Do you maintain a theory/domain layer?"
    prompt_template: "..."
  - id: modules
    trigger: is_monorepo|is_large   # OR semantics
    question: "Do you organize by modules/packages?"
    prompt_template: "..."
  - id: primitives
    trigger: has_primitive_docs
    question: "Do you maintain a reusable-primitive layer?"
    prompt_template: "..."
```
Trigger values match keys returned by `detectKnowledgeSignals()`. Pipe `|` = OR.

**Knowledge.md template rendering:** `batteries/knowledge-template.md` uses `{{placeholder}}` mustache-style tokens (consistent with `src/yaml/` existing string-template usage). Render step: TypeScript reads template, replaces `{{principles}}`, `{{theory_section}}`, etc. with interview answers (empty string when section not triggered). No new templating dependency — plain `replaceAll`.

**Coverage matrix output (reviewer-prompt.md addition):**
```markdown
#### Coverage Matrix
Emit a table:
| B-ID | Phase Tasks | VP Steps |
|------|-------------|----------|
| b1   | p1.task-2, p2.task-1 | VP1.step-3 |
| b2   | (none)      | VP2.step-1 |   <- Critical gap
```

### Gotchas
- **Skill resolution order:** project `.claude/skills/kata-clarify/` overrides user `~/.claude/skills/kata-clarify/`. When debugging, check both paths.
- **Phase renumbering in planning.md:** existing sessions mid-flight may have stale task IDs referring to p3=review. Not a blocker — new sessions use new template; old sessions are disposable.
- **Coverage matrix false positives:** a B-ID that describes a declarative property (e.g., "principle documented") may not map to a VP step cleanly. For this spec, every B-ID has a concrete VP step — demonstrates the bar the feature sets.
- **Checklist-in-file vs reviewer-validated:** reviewer must explicitly ignore `- [x]` vs `- [ ]` in the file and re-derive truth from content. Prompt must state this plainly.
- **Interview output → knowledge.md rendering:** interview returns JSON; rendering to markdown requires a simple template string — not a new schema system.

### Reference Docs
- [github/spec-kit](https://github.com/github/spec-kit) — source of clarify/analyze/checklist patterns
- Baseplane layered docs: `/data/projects/baseplane-dev1/docs/index.md` — source of change-cadence table pattern
- Existing spec [#26 executable verification plans](planning/specs/26-executable-verification-plans.md) — VP format reference
- Existing spec [#16 interview system](planning/specs/16-interview-system.md) — interview infrastructure being reused
