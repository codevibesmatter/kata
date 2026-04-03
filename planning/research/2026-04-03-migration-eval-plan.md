---
date: 2026-04-03
topic: Migration eval plan for #37 modular template system on baseplane-dev1
status: complete
github_issue: 37
---

# Migration Eval Plan: #37 Modular Template System → baseplane-dev1

## Context

Issue #37 (`feat/37-modular-template-system`) introduces a new template schema (gates+hints), a `kata migrate` command for old→new conversion, a `kata update` command for battery syncing, and a consolidated `pre-tool-use` hook replacing three separate PreToolUse hooks. We need to validate this works cleanly against `baseplane-dev1`, a real production project with heavy customization.

## Target: baseplane-dev1

| Aspect | State |
|--------|-------|
| Templates | 12 total, all modern phase-based format (no old-format features) |
| Custom modes | `housekeeping`, `vibegrid-smoke`, `auto-debug` (not in batteries) |
| Legacy `.kata/` files | `interviews.yaml`, `subphase-patterns.yaml`, `verification-tools.md` |
| Custom hooks | 13 shell scripts beyond kata defaults |
| `kata.yaml` | Environments, providers, reviews, custom test_command |
| settings.json | 8 hook events, statusLine, enabledPlugins |

## Testing Plan

### Phase 1: Pre-flight (non-destructive, read-only)

1. **Schema validation dry-run**
   - Build #37 branch: `cd /data/projects/kata-wm-37 && npm run build`
   - Validate all 12 baseplane templates against new Zod schema:
     ```bash
     for f in /data/projects/baseplane-dev1/.kata/templates/*.md; do
       node -e "
         const { parseTemplateFrontmatter } = require('./dist/index.js');
         const fs = require('fs');
         try { parseTemplateFrontmatter(fs.readFileSync('$f','utf-8')); console.log('OK: $f') }
         catch(e) { console.error('FAIL: $f', e.message) }
       "
     done
     ```
   - **Pass criteria**: All 12 templates parse without errors
   - **Risk**: Custom templates may use fields not in new schema

2. **Migration dry-run**
   - Run: `kata migrate --dry-run --cwd=/data/projects/baseplane-dev1`
   - **Expected**: "No templates need migration" (all already modern format)
   - **Risk**: Detection heuristic might false-positive on custom templates

3. **Hook merge simulation**
   - Read current settings.json, apply `mergeHooksIntoSettings()` logic mentally/in test:
     - Old kata hooks to strip: `mode-gate`, `task-deps`, `task-evidence` (3 entries)
     - New kata hook to add: `pre-tool-use` (1 consolidated entry)
     - Must preserve: `enforce-bgh.sh`, `pre-tool-use-tdd.sh` (custom PreToolUse hooks)
     - Must preserve: `startup-context.sh`, `post-tool-use-tracker.sh`, `session-end-*`, `subagent-stop-review.sh`, `cass index`, `statusLine`, `enabledPlugins`
   - **Pass criteria**: Non-kata hooks survive, kata hooks replaced
   - **Risk**: Regex pattern in `mergeHooksIntoSettings` must not match custom hooks

### Phase 2: Migration on a copy

4. **Create throwaway copy**
   ```bash
   cp -r /data/projects/baseplane-dev1 /tmp/baseplane-migration-test
   cd /tmp/baseplane-migration-test
   git init  # fresh git so we can diff
   git add -A && git commit -m "pre-migration snapshot"
   ```

5. **Run kata migrate**
   ```bash
   /data/projects/kata-wm-37/kata migrate --cwd=/tmp/baseplane-migration-test
   ```
   - Verify: no template changes (all already modern)
   - Verify: no errors on custom modes

6. **Run kata update**
   ```bash
   /data/projects/kata-wm-37/kata update --cwd=/tmp/baseplane-migration-test
   ```
   - **Expected output**:
     - `~ debug.md (customized — update manually)`
     - `~ implementation.md (customized — update manually)`
     - etc. for all customized templates
     - `kata_version` stamped in kata.yaml
   - **Verify**: No files overwritten, version stamp correct

7. **Run kata setup (hook migration)**
   ```bash
   /data/projects/kata-wm-37/kata setup --yes --cwd=/tmp/baseplane-migration-test
   ```
   - Diff settings.json before/after:
     - [ ] 3 old kata PreToolUse hooks → 1 consolidated `pre-tool-use`
     - [ ] `enforce-bgh.sh` preserved
     - [ ] `pre-tool-use-tdd.sh` preserved
     - [ ] All non-PreToolUse hooks preserved (SessionStart, Stop, PostToolUse, etc.)
     - [ ] `statusLine` preserved
     - [ ] `enabledPlugins` preserved

8. **Diff the copy**
   ```bash
   cd /tmp/baseplane-migration-test
   git diff
   ```
   - Only expected changes: settings.json hooks + kata.yaml version stamp

### Phase 3: Functional validation

9. **Mode entry smoke test** (on the copy)
   Test each mode enters cleanly with the new kata binary:
   ```bash
   for mode in task freeform research debug verify; do
     echo "--- Testing $mode ---"
     /data/projects/kata-wm-37/kata enter $mode --cwd=/tmp/baseplane-migration-test 2>&1 | head -5
     /data/projects/kata-wm-37/kata exit --cwd=/tmp/baseplane-migration-test 2>&1
   done
   ```
   - **Pass criteria**: All modes enter, tasks created, no schema errors
   - **Risk**: Custom modes (housekeeping, vibegrid-smoke, auto-debug) may fail if their templates don't validate

10. **Custom mode entry**
    ```bash
    for mode in housekeeping vibegrid-smoke auto-debug; do
      echo "--- Testing custom: $mode ---"
      /data/projects/kata-wm-37/kata enter $mode --cwd=/tmp/baseplane-migration-test 2>&1 | head -5
      /data/projects/kata-wm-37/kata exit --cwd=/tmp/baseplane-migration-test 2>&1
    done
    ```
    - **Pass criteria**: Custom modes enter without errors
    - **Risk**: These templates are the most customized; schema changes could reject them

11. **Hook chain test**
    - Enter task mode, verify hooks fire:
      - SessionStart → session-start hook
      - UserPromptSubmit → user-prompt hook
      - PreToolUse → consolidated pre-tool-use (mode-gate + task-deps + task-evidence)
      - Stop → stop-conditions hook
    - Verify custom hooks still fire alongside kata hooks

### Phase 4: Cleanup validation

12. **Legacy file handling**
    - Verify `interviews.yaml` and `subphase-patterns.yaml` are no longer loaded at runtime
    - Check #37 code doesn't import from `src/config/interviews.ts` or `src/config/subphase-patterns.ts` (both deleted)
    - Safe to delete these files from project after migration

13. **Version compatibility**
    - After migration, verify `kata status` works with new binary
    - Verify `kata can-exit` works
    - Verify `kata batteries --update` still works (backup + overwrite path)

## Risk Matrix

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Custom template schema validation failure | Medium | High | Dry-run schema check first (Phase 1) |
| Hook merge strips custom hooks | Low | High | Regex pattern is specific to kata subcommands |
| `kata update` overwrites custom templates | None | N/A | Code explicitly skips customized files |
| Legacy YAML files cause runtime errors | Low | Medium | #37 deleted the code that reads them |
| Custom modes in kata.yaml rejected | Low | Medium | kata.yaml schema doesn't validate mode templates inline |
| planning.md (73KB) incompatible | Medium | Medium | Phase 1 schema check catches this |

## Execution Order

1. Build #37 branch (`npm run build` in kata-wm-37)
2. Phase 1: all read-only checks pass
3. Phase 2: migration on copy, diff review
4. Phase 3: functional smoke tests
5. Phase 4: cleanup validation
6. If all pass → safe to migrate real baseplane-dev1

## Open Questions

- Should `kata migrate` also clean up `interviews.yaml` / `subphase-patterns.yaml`? Currently it only touches templates.
- Should `kata update` warn about deprecated files in `.kata/`?
- Do other baseplane worktrees (dev2-dev6) need the same migration, or can we migrate one and push?
