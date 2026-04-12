# Setup Skill: Replacing Onboard Mode

**Date:** 2026-04-12
**Type:** Feature research
**Goal:** Design a `/setup` skill that replaces the onboard mode, making kata configuration seamless and requiring no initial setup ceremony.

## Problem Statement

The current onboard mode has a chicken-and-egg problem: you need kata installed and hooks registered before you can `kata enter onboard`, but onboard is what installs kata and registers hooks. This creates a two-step flow:

1. User installs kata (`npm i -g @codevibesmatter/kata`)
2. User runs `kata enter onboard` (or `kata setup --yes`)
3. Onboard walks through 7 phases (P0-P6) of interview + config

The ideal experience: user installs kata, opens Claude Code in their project, starts working. Kata detects it's unconfigured and sets itself up transparently.

## Current Architecture

### What onboard does (7 phases)

| Phase | What | Interactive? |
|-------|------|-------------|
| P0: Bootstrap | Verify Node.js, tasks enabled, create .claude/ | No |
| P1: Setup Style | Quick vs custom interview | Yes (AskUserQuestion) |
| P2: Project Discovery | Confirm name, test cmd, CI | Yes (custom only) |
| P3: Custom Config | Reviews, paths, strict hooks, interviews | Yes (custom only) |
| P4: GitHub Setup | gh CLI, auth, labels | Yes |
| P5: Write Config | Run `kata setup --yes`, patch kata.yaml | No |
| P6: Verify | Run `kata doctor` | No |

### What `kata setup --yes` does (the non-interactive core)

1. Auto-detect project profile (name, test cmd, CI)
2. Build merged kata.yaml (existing values win)
3. Create `.kata/`, `.kata/sessions/`
4. Seed `onboard.md` template
5. Register hooks in `.claude/settings.json`
6. Scaffold batteries (templates, skills, spec templates, interviews, github templates)

### Key insight: setup --yes already does 90% of the work

The only things onboard adds over `kata setup --yes`:
- **GitHub label creation** (P4) — `gh label create --force` from wm-labels.json
- **Custom config interview** (P2-P3) — rarely used, most people pick "Quick"
- **Verification** (P6) — `kata doctor`

## Design: Setup as a Skill

### Core idea

Replace the onboard **mode** with a setup **skill** that:
1. Gets triggered automatically by the SessionStart hook when `.kata/` doesn't exist
2. Runs `kata setup --yes` non-interactively
3. Asks one lightweight question (labels? strict hooks?) instead of a 7-phase interview
4. Completes in seconds, not minutes

### Why a skill, not a mode?

| Concern | Mode (current) | Skill (proposed) |
|---------|---------------|-----------------|
| Entry cost | `kata enter onboard` — explicit, breaks flow | Automatic on first session |
| Duration | 7 phases, multiple AskUserQuestions | 1-2 questions max |
| Context cost | Full mode with stop conditions, rules, tasks | Lightweight — runs and exits |
| Replayability | Must re-enter mode | `/setup` anytime |
| Composability | Exclusive — can't be in another mode | Runs before mode entry, or on demand |

### Trigger mechanism

**Option A: SessionStart hook auto-triggers** (recommended)

In `handleSessionStart`, after `init()` and `prime()`:

```
if (!existsSync('.kata/kata.yaml')) {
  // Project not configured — run setup automatically
  run kata setup --yes
  // Inject post-setup context instead of mode-selection help
  additionalContext = setupSummary + modeSelectionHelp
}
```

Pros:
- Zero user action required — just open Claude Code
- Setup happens before the user even types anything
- Session-start hook already runs on every new session

Cons:
- Silent auto-setup may surprise users who don't want kata
- Need to handle the case where kata binary exists but user hasn't opted in

**Option B: UserPromptSubmit hook suggests setup** (safe alternative)

When the user types their first message and no `.kata/` exists:

```
additionalContext = "# Setup Detected\n\nkata is installed but not configured for this project.\n\nRun `kata enter setup` or I can set it up now."
```

Then the `/setup` skill handles the actual work.

Pros:
- User explicitly opts in
- No surprise auto-configuration

Cons:
- Still requires user action
- Adds friction (though less than full onboard)

**Option C: Hybrid — auto-setup + confirmation** (recommended)

SessionStart hook detects unconfigured project:
1. Runs `kata setup --yes` silently (creates `.kata/`, hooks, batteries)
2. Injects a short confirmation message as additionalContext:
   ```
   kata has been configured for this project with default settings.
   Run `/setup` to customize, or start working — `kata enter <mode>`.
   ```

The `/setup` skill is available for customization anytime, but the project works immediately.

### The /setup skill design

```yaml
---
name: setup
description: "Configure or reconfigure kata project settings"
---
```

**Phases:**

1. **Detect** — Read existing kata.yaml, check what's already configured
2. **Ask** — One multi-select question covering the non-default options:
   - GitHub labels (create/skip)
   - Strict hooks (on/off)
   - External reviewers (none/codex/gemini)
   - Custom paths (only if user says yes)
3. **Apply** — Run appropriate `kata setup` flags, patch kata.yaml
4. **Verify** — Run `kata doctor --json`, report results

This is a single-phase skill, not a multi-phase mode. The whole thing runs in one AskUserQuestion round.

### What happens to the onboard template?

**Deprecate it.** Keep it around for one release cycle with a deprecation notice:
```
⚠️ `kata enter onboard` is deprecated. Use `/setup` instead, or just start working — kata auto-configures on first session.
```

### Changes required

#### 1. New skill: `batteries/skills/setup/SKILL.md`

The skill that handles customization when invoked via `/setup`.

#### 2. Modify SessionStart hook (`src/commands/hook.ts`)

Add auto-setup detection in `handleSessionStart`:

```typescript
// After init(), before prime()
const projectRoot = findProjectDirSafe() // returns null instead of throwing
if (projectRoot === null || !existsSync(join(projectRoot, '.kata', 'kata.yaml'))) {
  // Auto-configure with defaults
  const { setup } = await import('./setup.js')
  await setup(['--yes'])
  // Continue to prime() which will now find the config
}
```

Key constraint: the hook must be registered in `.claude/settings.json` BEFORE it can fire. This means **the user still needs to do ONE thing** to get hooks working: either `kata setup --yes` or install kata globally (which could register hooks via a postinstall script).

#### 3. Alternative: npm postinstall hook

When `npm i -g @codevibesmatter/kata` runs, a postinstall script could:
1. Detect if running inside a git repo
2. If so, run `kata setup --yes` automatically
3. If not, do nothing (user will run setup in their project later)

This is fragile and non-standard. Not recommended as primary mechanism.

#### 4. Alternative: CLAUDE.md instruction (zero-infra approach)

The simplest possible approach — no code changes at all:

Include a CLAUDE.md instruction that says:
```
If this project has no .kata/ directory, run `kata setup --yes` before proceeding.
```

This relies on Claude reading CLAUDE.md (which it always does) and acting on it. The problem: CLAUDE.md is per-project, so it doesn't exist in unconfigured projects. This only works if kata ships a global CLAUDE.md snippet via `~/.claude/CLAUDE.md`.

### The bootstrap problem

No matter what we do, there's a fundamental chicken-and-egg:

```
hooks fire → because settings.json has them → because kata setup wrote them → because user ran kata setup
```

**The very first `kata setup --yes` cannot be avoided.** What we CAN do is make it:
1. **One command** instead of a 7-phase interview
2. **Idempotent** — safe to re-run
3. **Instant** — no questions asked
4. **Discoverable** — npm postinstall message, README, etc.

### Recommended approach: Two-tier design

**Tier 1: `kata setup` (CLI, one-time bootstrap)**
- Already exists, already works
- One command: `kata setup --yes`
- Must run once to register hooks — no way around this
- Could be triggered by `npx kata setup` for first-time users

**Tier 2: `/setup` skill (in-session customization)**
- Available after hooks are registered
- Invoked via `/setup` or auto-suggested when config is minimal
- Handles: label creation, strict hooks, external reviewers, custom paths
- Replaces the interview phases (P1-P4) of old onboard mode

**Tier 3: SessionStart auto-healing (optional)**
- If `.kata/kata.yaml` exists but is incomplete (e.g., no modes), auto-fix
- If templates are missing, re-scaffold batteries
- If hooks are deregistered, re-register them
- This is `kata doctor --fix` behavior, moved into the session-start hook

### Migration path

1. **Phase 1:** Create `/setup` skill, keep onboard mode
2. **Phase 2:** SessionStart hook auto-runs `kata doctor --fix` on every start (auto-heals)
3. **Phase 3:** Deprecate onboard mode, update docs to say `kata setup --yes` + `/setup`
4. **Phase 4:** Remove onboard mode and template

## Comparison matrix

| Approach | Bootstrap cost | Customization | Auto-healing | Complexity |
|----------|---------------|---------------|--------------|------------|
| Current onboard mode | High (7 phases) | Full interview | None | Medium |
| /setup skill only | Low (1 cmd + /setup) | On-demand skill | None | Low |
| Auto-setup in SessionStart | Zero (if hooks exist) | On-demand skill | Yes | Medium |
| Two-tier (recommended) | Low (1 cmd) | On-demand skill | Yes | Medium |

## The /setup skill in detail

### Skill content

When invoked, the skill:

1. **Reads current state:**
   ```bash
   kata doctor --json
   ```

2. **Shows current config summary:**
   ```
   Project: my-app
   Templates: 7 (planning, implementation, research, task, debug, freeform, verify)
   Skills: 10
   Hooks: 4 registered
   Reviews: spec=off, code=off
   Strict: off
   Labels: not created
   ```

3. **Asks what to change:**
   ```
   AskUserQuestion(questions=[{
     question: "What would you like to configure?",
     options: [
       {label: "GitHub labels", description: "Create 15 workflow labels"},
       {label: "Strict hooks", description: "Enable PreToolUse task enforcement"},
       {label: "External reviewers", description: "Add Codex/Gemini alongside review-agent"},
       {label: "Custom paths", description: "Change spec/research/test paths"},
       {label: "Interview categories", description: "Customize planning interview categories"},
       {label: "Everything looks good", description: "No changes needed"}
     ],
     multiSelect: true
   }])
   ```

4. **Applies changes** based on selection (runs kata CLI commands, patches kata.yaml)

5. **Verifies** with `kata doctor`

### Skill trigger conditions

The skill should be listed in Claude Code's skill registry with:
```yaml
---
name: setup
description: "Configure or reconfigure kata project settings. Use when the project needs initial setup or when changing kata configuration."
---
```

This makes it available as `/setup` in the Claude Code prompt.

## Recommendations

1. **Create `/setup` skill** — lightweight, on-demand, replaces P1-P4 interview
2. **Keep `kata setup --yes`** as the one-time bootstrap command (can't avoid it)
3. **Add auto-healing to SessionStart** — run `kata doctor --fix` silently on each session start so deregistered hooks, missing templates, etc. get fixed automatically
4. **Deprecate onboard mode** — mark deprecated in kata.yaml, remove after one release cycle
5. **Simplify first-run message** — when user installs kata, tell them: "Run `kata setup --yes` in your project, then start working"

## Open questions

1. **Should `/setup` be a mode or a skill?** Recommendation: skill. It's a one-shot action, not a workflow. No stop conditions, no phases, no tasks.
2. **Should auto-healing run `kata doctor --fix` or a lighter check?** Doctor is comprehensive but slow. A targeted "ensure hooks + templates" check would be faster.
3. **Should the setup skill handle GitHub auth?** Current onboard does (P4). Could be dropped — if `gh` isn't authed, label creation fails gracefully and user can do it later.
4. **What about the `--strict` flag?** Currently asked during onboard. Could default to off and let `/setup` toggle it.

## Next step

Planning — create a spec for the `/setup` skill and the SessionStart auto-healing changes.
