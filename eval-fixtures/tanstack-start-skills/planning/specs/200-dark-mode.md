---
initiative: dark-mode
type: project
issue_type: feature
status: needs-review
priority: medium
github_issue: 200
created: 2026-03-01
updated: 2026-03-01
---

# Dark Mode Toggle

> GitHub Issue: #200

## Overview

Add a dark mode toggle to the app. Users can switch between light and dark themes, with the preference persisted in localStorage.

## Feature Behaviors

### B1: Theme Toggle Button

**Core:**
- **ID:** theme-toggle
- **Trigger:** User clicks the dark mode toggle button in the nav
- **Expected:** App switches between light and dark theme immediately
- **Verify:** Toggle button visible in nav; clicking changes body class/data attribute

### B2: Preference Persistence

**Core:**
- **ID:** theme-persistence
- **Trigger:** User sets a theme preference and reloads the page
- **Expected:** Theme preference is restored from localStorage on load
- **Verify:** Set dark mode, reload — dark mode still active

## Non-Goals

- No server-side theme storage
- No per-route theme overrides
- No system preference detection (prefers-color-scheme)

## Verification Plan

### VP1: Toggle switches theme

**Steps:**
1. Start dev server: `npm run dev`
2. Open http://localhost:3000
3. Click the dark mode toggle
4. Confirm page switches to dark theme

**Expected:** Body has dark theme class/attribute applied

### VP2: Preference persists on reload

**Steps:**
1. Enable dark mode via toggle
2. Reload the page
3. Confirm dark mode is still active

**Expected:** Dark mode preference restored from localStorage

## Implementation Phases

See YAML frontmatter `phases:` above.
