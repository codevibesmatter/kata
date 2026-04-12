# Setup Skill: Replacing Onboard Mode

**Date:** 2026-04-12
**Type:** Feature research
**Goal:** Design a `/setup` skill that runs directly in Claude Code (no modes) and configures kata from scratch — with a local-first distribution model (no npm).

## Distribution model

kata is for tinkerers. The distribution model should reflect that:

- **Clone the repo** (or add as monorepo package)
- **Symlink `kata`** to PATH (e.g., `ln -s /path/to/kata-wm/kata ~/.local/bin/kata`)
- **Run from source** — the `kata` shell script already falls back to `bun src/index.ts` when no dist exists

No npm publish, no global install, no postinstall scripts. Each project creates its own config. Users can run different versions by pointing symlinks at different clones.

## The setup problem without npm

With npm, postinstall could place a global skill at `~/.claude/skills/setup/`. Without npm, we need another way to make `/setup` available before kata is configured in a project.

### Option A: `kata install` command

New CLI command that installs the global skill:

```bash
kata install
# Creates ~/.claude/skills/setup/SKILL.md
# Prints: "Done. Type /setup in Claude Code to configure a project."
```

User runs this once after cloning kata. The skill is then available globally in every Claude Code session.

**Flow:**
```
git clone https://github.com/codevibesmatter/kata.git
ln -s kata/kata ~/.local/bin/kata
kata install       # ← one-time: places global /setup skill
cd my-project
claude
> /setup           # ← skill runs, configures everything
```

### Option B: Self-bootstrapping setup command

`kata setup --yes` already works. Add a flag or make it also install the global skill:

```bash
kata setup --yes   # configures current project AND installs global skill
```

Or keep them separate:
```bash
kata setup --yes       # configure this project
kata install           # install global /setup skill (one-time)
```

Separate is cleaner — `setup` is per-project, `install` is per-user.

### Option C: The skill lives in the kata repo, referenced by path

Instead of copying to `~/.claude/skills/`, use Claude Code's ability to reference skills by path. If the user's `~/.claude/settings.json` has a `skillPaths` or similar config pointing to the kata repo's skills directory, the skill is always available.

This depends on Claude Code supporting external skill paths — needs verification. If not supported, skip this option.

### Recommendation: Option A (`kata install`)

One command, run once. Clean separation: `install` = per-user global setup, `setup` = per-project config.

## The /setup skill

### What it does

A pure Claude Code skill — no modes, no tasks, no hooks required. Claude reads the SKILL.md and follows the instructions.

**Fresh project (no .kata/):**
1. Run `kata setup --yes`
2. Check `gh auth status` — if authed, offer to create labels
3. Run `kata doctor`
4. Report: ready, suggest entering a mode

**Existing project (.kata/ exists):**
1. Show current config summary (read kata.yaml)
2. Ask what to change (labels, strict, reviewers, paths)
3. Apply changes (patch kata.yaml, run commands)
4. Run `kata doctor`

### Skill content sketch

```markdown
---
name: setup
description: "Configure kata for a project. Use for initial setup or reconfiguration."
---

# /setup

Configure kata for this project. Works on fresh or existing projects.

## If .kata/kata.yaml does NOT exist (fresh project)

1. Run: `kata setup --yes`
2. Check GitHub CLI: `gh auth status 2>&1`
3. If gh is authenticated, ask one question:
   - "Create GitHub labels for issue tracking? (15 workflow labels)"
   - If yes: read .github/wm-labels.json and create each label with `gh label create`
4. Run: `kata doctor`
5. Print setup summary and suggest: `kata enter <mode>` to start working

## If .kata/kata.yaml exists (reconfigure)

1. Read .kata/kata.yaml and show summary: project name, test command, templates, hooks
2. Ask: "What would you like to change?" (multi-select)
   - GitHub labels, strict hooks, external reviewers, custom paths
3. Apply selected changes
4. Run: `kata doctor`
```

### Where it lives

- **Source:** `batteries/skills/setup/SKILL.md` (in the kata repo)
- **Global install:** `~/.claude/skills/setup/SKILL.md` (via `kata install`)
- **Project copy:** `.claude/skills/setup/SKILL.md` (via `kata setup --yes` batteries scaffold)

The global copy makes it available everywhere. The project copy shadows it after setup runs (normal Claude Code skill resolution).

## The `kata install` command

### What it does

```typescript
// src/commands/install.ts
export async function install(args: string[]): Promise<void> {
  const home = os.homedir()
  const globalSkillsDir = join(home, '.claude', 'skills', 'setup')
  mkdirSync(globalSkillsDir, { recursive: true })
  
  const src = join(getPackageRoot(), 'batteries', 'skills', 'setup', 'SKILL.md')
  const dest = join(globalSkillsDir, 'SKILL.md')
  copyFileSync(src, dest)
  
  console.log('Installed /setup skill globally.')
  console.log('Type /setup in Claude Code to configure any project.')
}
```

### Uninstall

```bash
kata uninstall   # removes ~/.claude/skills/setup/
```

Or just `rm -rf ~/.claude/skills/setup/`.

## What gets dropped

| Current | After |
|---------|-------|
| `onboard` mode (7 phases, stop conditions, tasks) | `/setup` skill (one-shot, no tracking) |
| `kata enter onboard` | `/setup` in Claude Code |
| `templates/onboard.md` (115 lines) | `batteries/skills/setup/SKILL.md` (~30 lines) |
| Onboard mode in kata.yaml | Deprecated, then removed |

## Complete first-run flow

```
# One-time (after cloning kata)
git clone https://github.com/codevibesmatter/kata.git ~/tools/kata
ln -s ~/tools/kata/kata ~/.local/bin/kata
kata install

# Per-project (in Claude Code)
> /setup
[kata setup --yes runs, labels created, doctor passes]
Setup complete! Enter a mode to start: kata enter task
```

Three commands to install kata globally. One slash command per project. No npm, no onboard mode, no 7-phase interview.

## Changes required

1. **New skill:** `batteries/skills/setup/SKILL.md`
2. **New command:** `src/commands/install.ts` — copies global skill to `~/.claude/skills/`
3. **Register command:** Add `install` and `uninstall` to CLI dispatcher
4. **Deprecate onboard:** Mark in kata.yaml, remove template after one cycle

## Open questions

1. **Should `kata install` also update an existing global skill?** Yes — always overwrite to stay current with the local kata version.
2. **Should we keep the onboard mode config in kata.yaml for backwards compat?** Mark deprecated, keep for one release, then remove.
3. **Should `/setup` detect if kata binary is reachable?** Yes — if `kata` isn't in PATH, the skill should tell the user to add it.
