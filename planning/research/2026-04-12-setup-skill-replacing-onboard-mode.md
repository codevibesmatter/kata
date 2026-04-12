# Setup Skill: Replacing Onboard Mode

**Date:** 2026-04-12
**Type:** Feature research
**Goal:** Design a `/setup` skill that runs directly in Claude Code (no modes) and configures kata from scratch.

## Problem

Current onboard is a full mode with 7 phases, stop conditions, and tasks. It requires kata hooks to already be registered before it can even start. The user wants: type `/setup`, everything works.

## What setup actually needs to do

1. Run `kata setup --yes` (creates `.kata/`, registers hooks, scaffolds batteries)
2. Create GitHub labels (optional)
3. Done.

That's it. `kata setup --yes` already auto-detects project name, test command, CI system, and writes sensible defaults. The 7-phase interview is unnecessary ceremony — most users pick "Quick" anyway.

## Design: Pure Claude Code Skill

### Where it lives

The skill needs to be available BEFORE kata is configured (before `.claude/skills/` exists). Two options:

**Option A: Global skill at `~/.claude/skills/setup/SKILL.md`**

Installed by `npm i -g @codevibesmatter/kata` postinstall script:
```bash
mkdir -p ~/.claude/skills/setup
cp batteries/skills/setup/SKILL.md ~/.claude/skills/setup/SKILL.md
```

Available in every project, every session. No prerequisites.

**Option B: npm postinstall just tells the user**

```
kata installed! In your project, type /setup in Claude Code to get started.
```

And the skill gets created by `kata setup --yes` as part of normal batteries scaffolding. Chicken-and-egg: user must run `kata setup --yes` once to get the skill that runs `kata setup --yes`.

**Recommendation: Option A.** Global install puts the skill in `~/.claude/skills/setup/`. It's always available. After setup runs, the project gets its own copy in `.claude/skills/setup/` which shadows the global one.

### The skill content

The skill is simple — it's just instructions for Claude:

```markdown
---
name: setup
description: "Configure kata for a project. Run when setting up a new project or reconfiguring."
---

# Setup

Configure kata for this project.

## Steps

1. Run `kata setup --yes` to create config and register hooks
2. Check if gh CLI is installed and authenticated (`gh auth status`)
3. If gh is available, ask: create GitHub labels? If yes:
   ```bash
   cat .github/wm-labels.json | node -e "
     const labels = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
     labels.forEach(l => process.stdout.write(
       \`gh label create \"\${l.name}\" --color \"\${l.color}\" --description \"\${l.description}\" --force\n\`
     ));
   " | bash
   ```
4. Run `kata doctor` to verify
5. Tell user they're ready — suggest `kata enter <mode>` to start working
```

No modes. No tasks. No phases. Just a skill with instructions.

### What gets dropped vs kept

| Current onboard phase | In /setup skill? | Why |
|----------------------|-------------------|-----|
| P0: Bootstrap (Node.js, tasks) | No — `kata setup --yes` handles it | Redundant check |
| P1: Quick vs Custom | No — always quick | Custom was rarely used |
| P2: Project Discovery | No — auto-detection is good enough | `kata setup --yes` auto-detects |
| P3: Custom Config | No — use `/setup` again to reconfigure later | On-demand, not upfront |
| P4: GitHub labels | Yes — single question | Only interactive part |
| P5: Write Config | Yes — `kata setup --yes` | Core of the skill |
| P6: Verify | Yes — `kata doctor` | Quick sanity check |

### Reconfiguration

If the user wants to change settings later (strict hooks, reviewers, paths), they just run `/setup` again. The skill detects existing config and offers to modify it:

```
If .kata/kata.yaml already exists:
  1. Show current config summary
  2. Ask what to change (labels, strict, reviewers, paths)
  3. Apply changes
  4. Run kata doctor
```

## Installation flow

### npm postinstall (`package.json`)

```json
{
  "scripts": {
    "postinstall": "node scripts/install-global-skill.js"
  }
}
```

The script:
1. Creates `~/.claude/skills/setup/` if it doesn't exist
2. Copies `SKILL.md` there
3. Prints: "kata installed. Type /setup in Claude Code to configure a project."

### First-run experience

```
$ npm i -g @codevibesmatter/kata
kata installed. Type /setup in Claude Code to configure a project.

$ cd my-project
$ claude
> /setup
[skill runs kata setup --yes, asks about labels, runs doctor]
Setup complete. Start working: kata enter task
```

Three steps: install, open Claude Code, `/setup`. No `kata enter onboard`, no 7-phase interview.

## Changes required

1. **New skill:** `batteries/skills/setup/SKILL.md` — the skill content
2. **Postinstall script:** `scripts/install-global-skill.js` — copies skill to `~/.claude/skills/`
3. **Deprecate onboard mode:** Mark deprecated in `batteries/kata.yaml`
4. **Remove onboard template:** After one release cycle

## Open questions

1. **Should postinstall overwrite an existing global skill?** Probably yes on upgrade, with version check.
2. **Should the skill handle the case where `kata` isn't in PATH?** It should — use `npx kata setup --yes` as fallback.
3. **Should we keep a `kata setup` CLI entry point?** Yes, for scripting and CI. The skill is the UX layer; the CLI is the programmatic layer.

## Next step

Implement — create the skill, add the postinstall script, deprecate onboard.
