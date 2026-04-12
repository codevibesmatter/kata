---
description: "Set up kata in this project — detects kata source repo, fresh projects, or reconfiguration."
---

# /kata-setup

Set up kata for this project. Follow the scenario that matches the current directory.

## Detect Scenario

Check these conditions in order:

1. **Kata source repo** — `src/index.ts` exists AND `.kata/kata.yaml` does NOT exist
2. **Existing project** — `.kata/kata.yaml` exists
3. **Fresh project** — `.kata/kata.yaml` does NOT exist (and not the kata source repo)

---

## Scenario 1: Kata Source Repo

You are in the kata-wm source repository itself.

1. Check if `kata` is in PATH: `which kata`
2. If NOT found, suggest symlinking:
   ```bash
   ln -s $(pwd)/kata ~/.local/bin/kata
   ```
3. Verify: `kata --version`
4. Tell the user: kata is ready. Open Claude Code in any project and run `/kata-setup` to configure it.

**Done.** No further setup needed for the source repo.

---

## Scenario 2: Fresh Project Setup

This project has no kata configuration yet.

1. Check `kata` is in PATH: `which kata`
   - If NOT found: tell the user to install kata first (clone the repo and run `/kata-setup` there).
2. Run: `kata setup --yes`
3. Check GitHub CLI: `gh auth status`
   - If authenticated, offer to create project labels:
     ```bash
     gh label create "status:todo" --color "0E8A16" --description "Ready to work on" --force
     gh label create "status:in-progress" --color "FBCA04" --description "Currently being worked on" --force
     gh label create "approved" --color "0075CA" --description "Spec approved for implementation" --force
     gh label create "feature" --color "A2EEEF" --description "New feature or enhancement" --force
     gh label create "bug" --color "D73A4A" --description "Something isn't working" --force
     gh label create "chore" --color "BFD4F2" --description "Maintenance and cleanup" --force
     ```
4. Run: `kata doctor`
5. Print summary of what was created and suggest: "You're ready — enter a mode to start working."

---

## Scenario 3: Reconfigure Existing Project

This project already has kata configured.

1. Read `.kata/kata.yaml` and display a summary of the current configuration:
   - Modes defined
   - Test command
   - Strict hooks (on/off)
   - Deliverable paths
2. Ask the user what they want to change (e.g., test command, strict hooks, review settings, paths, add/remove modes).
3. Apply the requested changes to `.kata/kata.yaml`.
4. Run: `kata doctor` to verify the configuration is valid.

---

## Rules

- Do NOT run `kata enter` — this skill runs outside of any mode.
- Do NOT modify `.claude/settings.json` directly — `kata setup` handles hook registration.
- Keep responses conversational — no structured output or JSON.
