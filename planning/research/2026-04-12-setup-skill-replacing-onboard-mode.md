# Setup Skill: Replacing Onboard Mode

**Date:** 2026-04-12
**Type:** Feature research
**Goal:** Replace onboard mode with a `/kata-setup` skill. Zero ceremony — clone, open CC, `/kata-setup`.

## The flow

```
git clone https://github.com/codevibesmatter/kata.git
cd kata
# open Claude Code
> /kata-setup
```

That's it. The `/kata-setup` skill lives in the kata repo at `.claude/skills/kata-setup/SKILL.md`. When you open Claude Code in the kata repo, it's already available. The skill handles everything: symlinking the binary, configuring the current or target project, scaffolding batteries.

## What the skill does

The skill is instructions for Claude. No modes, no tasks, no hooks needed.

### First use (in the kata repo itself)

1. Symlink `kata` to PATH (e.g., `ln -s $(pwd)/kata ~/.local/bin/kata`)
2. Done — kata is installed

### Per-project setup (in any project)

1. Run `kata setup --yes` — creates `.kata/`, registers hooks, scaffolds batteries
2. If `gh` is authed, offer to create GitHub labels
3. Run `kata doctor`
4. Print: ready, enter a mode to start

### Reconfigure (project already has .kata/)

1. Show current config from kata.yaml
2. Ask what to change
3. Apply, verify with doctor

## How it spreads to other projects

After kata is in PATH, the user can either:
- **Run `/kata-setup` in any project** — if the skill isn't available there yet, they just ask Claude to run `kata setup --yes` directly. The skill gets scaffolded as part of batteries.
- **Or** — after batteries scaffold, `.claude/skills/kata-setup/SKILL.md` exists in the project too, making `/kata-setup` available natively going forward.

The bootstrapping chain: kata repo has the skill → skill puts kata in PATH → `kata setup --yes` in other projects scaffolds the skill there too.

## Skill content (sketch)

```markdown
---
name: kata-setup
description: "Configure kata for a project — initial setup or reconfigure."
---

# /kata-setup

## If running in the kata repo (no .kata/kata.yaml, has src/index.ts)

You're in the kata source repo. Help the user get kata on their PATH:

1. Check if `kata` is already in PATH: `which kata`
2. If not, suggest: `ln -s $(pwd)/kata ~/.local/bin/kata`
3. Verify: `kata --version`
4. Tell user: "kata is ready. Open Claude Code in any project and run /kata-setup."

## If .kata/kata.yaml does NOT exist (fresh project)

1. Check `kata` is in PATH — if not, ask user to add it
2. Run: `kata setup --yes`
3. Check `gh auth status` — if authed, ask about creating labels
4. Run: `kata doctor`
5. Suggest: `kata enter <mode>` to start

## If .kata/kata.yaml exists (reconfigure)

1. Read kata.yaml, show summary
2. Ask what to change (labels, strict hooks, reviewers, paths)
3. Apply changes
4. Run: `kata doctor`
```

## What gets dropped

- **Onboard mode** — 7 phases, 115-line template, stop conditions, tasks
- **`kata enter onboard`** — no longer needed
- **`kata install` command** — not needed, skill lives in repo
- **npm postinstall** — not needed, no npm

## What stays

- **`kata setup --yes`** — the programmatic core, called by the skill
- **`kata doctor`** — verification, called by the skill
- **batteries scaffold** — templates, skills, prompts all still get copied per-project

## Changes required

1. **New skill:** `batteries/skills/kata-setup/SKILL.md` (also lives at `.claude/skills/kata-setup/SKILL.md` in the kata repo)
2. **Deprecate onboard mode:** Mark deprecated in `batteries/kata.yaml`
3. **Remove onboard template:** `templates/onboard.md` after one cycle

No new TypeScript code. No new CLI commands. Just a skill file.
