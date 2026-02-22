/**
 * Eval-specific assertions for kata-wm agentic evals.
 *
 * All eval assertions live here. Scenarios import what they need —
 * individual assertions or preset arrays. No inline assertion
 * definitions in scenario files.
 */

import type { EvalCheckpoint, EvalContext } from './harness.js'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pass(): string | null {
  return null
}

function fail(msg: string): string {
  return msg
}

/**
 * Read a top-level key from wm.yaml via grep.
 * Checks .kata/wm.yaml first (new layout), then .claude/workflows/wm.yaml (old layout).
 * Returns the value string or the provided default.
 */
function readWmYamlKey(ctx: EvalContext, key: string, fallback: string): string {
  // Try new layout first, then old layout
  const raw = ctx.run(
    `grep '^${key}:' .kata/wm.yaml 2>/dev/null || grep '^${key}:' .claude/workflows/wm.yaml 2>/dev/null`,
  )?.trim()
  if (!raw) return fallback
  // Extract value after "key: "
  const match = raw.match(new RegExp(`^${key}:\\s*(.+)$`))
  return match?.[1]?.trim() || fallback
}

// ─── Session State Assertions ──────────────────────────────────────────────────

/**
 * Assert that the session is in the given mode.
 */
export function assertCurrentMode(mode: string): EvalCheckpoint {
  return {
    name: `session.currentMode === '${mode}'`,
    assert(ctx: EvalContext) {
      const state = ctx.getSessionState()
      if (!state) return fail('Session state not found')
      if (state.currentMode !== mode) {
        return fail(`Expected currentMode '${mode}', got '${state.currentMode ?? 'undefined'}'`)
      }
      return pass()
    },
  }
}

/**
 * Assert that the session type matches.
 */
export function assertSessionType(sessionType: string): EvalCheckpoint {
  return {
    name: `session.sessionType === '${sessionType}'`,
    assert(ctx: EvalContext) {
      const state = ctx.getSessionState()
      if (!state) return fail('Session state not found')
      if (state.sessionType !== sessionType) {
        return fail(`Expected sessionType '${sessionType}', got '${state.sessionType ?? 'undefined'}'`)
      }
      return pass()
    },
  }
}

/**
 * Assert that the agent stayed in the given mode (no unexpected mode switches).
 */
export function assertStayedInMode(mode: string): EvalCheckpoint {
  return {
    name: `agent stayed in ${mode} mode`,
    assert(ctx: EvalContext) {
      const state = ctx.getSessionState()
      if (!state) return fail('Session state not found')
      const history: Array<{ mode: string }> = state.modeHistory ?? []
      const otherModes = history
        .map((h) => h.mode)
        .filter((m) => m !== mode && m !== 'default')
      if (otherModes.length > 0) {
        return fail(`Agent switched to other modes: ${otherModes.join(', ')}`)
      }
      return pass()
    },
  }
}

/**
 * Assert that a given mode appears in session history.
 */
export function assertModeInHistory(mode: string): EvalCheckpoint {
  return {
    name: `${mode} mode in session history`,
    assert(ctx: EvalContext) {
      const state = ctx.getSessionState()
      if (!state) return fail('Session state not found')
      const hasMode = state.modeHistory?.some((h) => h.mode === mode)
      if (!hasMode) {
        return fail(`${mode} mode not found in history: ${JSON.stringify(state.modeHistory)}`)
      }
      return pass()
    },
  }
}

// ─── Git Assertions ────────────────────────────────────────────────────────────

/**
 * Assert that at least one new commit was made beyond the initial fixture commit.
 */
export function assertNewCommit(): EvalCheckpoint {
  return {
    name: 'git: new commit created',
    assert(ctx: EvalContext) {
      const log = ctx.run('git log --oneline')
      const lines = log.split('\n').filter(Boolean)
      if (lines.length < 2) {
        return fail(`Expected at least 2 commits (fixture + new), found ${lines.length}`)
      }
      return pass()
    },
  }
}

/**
 * Assert that the working tree is clean (all changes committed).
 */
export function assertCleanWorkingTree(): EvalCheckpoint {
  return {
    name: 'git: working tree is clean',
    assert(ctx: EvalContext) {
      const status = ctx.run('git status --porcelain')
      const dirty = status.split('\n').filter((l) => l && !l.startsWith('??'))
      if (dirty.length > 0) {
        return fail(`Uncommitted tracked changes: ${dirty.slice(0, 3).join(', ')}`)
      }
      return pass()
    },
  }
}

/**
 * Assert that the diff vs initial commit contains a pattern.
 */
export function assertDiffContains(pattern: string | RegExp): EvalCheckpoint {
  const label = pattern instanceof RegExp ? pattern.source : pattern
  return {
    name: `git diff contains: ${label}`,
    assert(ctx: EvalContext) {
      // Diff against the initial fixture commit (root commit) so all agent
      // changes are visible regardless of how many commits were made.
      const initialSha = ctx.run('git rev-list --max-parents=0 HEAD')
      const diff = ctx.run(`git diff ${initialSha}..HEAD`)
      const matches = pattern instanceof RegExp ? pattern.test(diff) : diff.includes(pattern)
      if (!matches) {
        return fail(`Expected diff to contain '${label}'`)
      }
      return pass()
    },
  }
}

/**
 * Assert that the diff vs initial commit exceeds a minimum number of lines.
 * Used for implementation scenarios to verify substantive work.
 */
export function assertDiffNonTrivial(minLines: number): EvalCheckpoint {
  return {
    name: `git diff is non-trivial (>= ${minLines} lines)`,
    assert(ctx: EvalContext) {
      const initialSha = ctx.run('git rev-list --max-parents=0 HEAD')
      const diff = ctx.run(`git diff ${initialSha}..HEAD`)
      const lines = diff.split('\n').filter(Boolean).length
      if (lines < minLines) {
        return fail(`Expected diff >= ${minLines} lines, got ${lines}`)
      }
      return pass()
    },
  }
}

/**
 * Assert that all changes have been pushed to the remote.
 */
export function assertChangesPushed(): EvalCheckpoint {
  return {
    name: 'git: changes pushed to remote',
    assert(ctx: EvalContext) {
      const status = ctx.run('git status -sb')
      if (status.includes('ahead')) {
        return fail(`Unpushed commits: ${status.split('\n')[0]}`)
      }
      return pass()
    },
  }
}

// ─── File Assertions ───────────────────────────────────────────────────────────

/**
 * Assert that a file exists relative to the project dir.
 */
export function assertFileExists(relativePath: string): EvalCheckpoint {
  return {
    name: `file exists: ${relativePath}`,
    assert(ctx: EvalContext) {
      if (!ctx.fileExists(relativePath)) {
        return fail(`Expected file to exist: ${relativePath}`)
      }
      return pass()
    },
  }
}

/**
 * Assert that a file contains a string or matches a pattern.
 */
export function assertFileContains(relativePath: string, pattern: string | RegExp): EvalCheckpoint {
  const label = pattern instanceof RegExp ? pattern.source : pattern
  return {
    name: `${relativePath} contains: ${label}`,
    assert(ctx: EvalContext) {
      if (!ctx.fileExists(relativePath)) {
        return fail(`File not found: ${relativePath}`)
      }
      const content = ctx.readFile(relativePath)
      const matches = pattern instanceof RegExp ? pattern.test(content) : content.includes(pattern)
      if (!matches) {
        return fail(`Expected '${relativePath}' to contain '${label}'`)
      }
      return pass()
    },
  }
}

// ─── Artifact Assertions (config-driven) ─────────────────────────────────────

/**
 * Assert that at least one spec file (.md) exists in the configured spec_path.
 * Reads spec_path from wm.yaml, falls back to 'planning/specs'.
 */
export function assertSpecFileCreated(): EvalCheckpoint {
  return {
    name: 'spec file created',
    assert(ctx: EvalContext) {
      const specPath = readWmYamlKey(ctx, 'spec_path', 'planning/specs')
      const files = ctx.listDir(specPath)
      const specFiles = files.filter((f) => f.endsWith('.md'))
      if (specFiles.length === 0) {
        return fail(`No spec files found in ${specPath}/`)
      }
      return pass()
    },
  }
}

/**
 * Assert that at least one spec file has status: approved in its frontmatter.
 */
export function assertSpecApproved(): EvalCheckpoint {
  return {
    name: 'spec frontmatter: status: approved',
    assert(ctx: EvalContext) {
      const specPath = readWmYamlKey(ctx, 'spec_path', 'planning/specs')
      const files = ctx.listDir(specPath)
      const specFiles = files.filter((f) => f.endsWith('.md'))
      if (specFiles.length === 0) return fail('No spec files to check')

      for (const file of specFiles) {
        const content = ctx.readFile(`${specPath}/${file}`)
        if (content.includes('status: approved')) return pass()
      }
      return fail('No spec file with status: approved found')
    },
  }
}

/**
 * Assert that at least one spec file contains behavior sections (### B1:, ### B2:, etc.).
 */
export function assertSpecHasBehaviors(): EvalCheckpoint {
  return {
    name: 'spec contains behavior sections',
    assert(ctx: EvalContext) {
      const specPath = readWmYamlKey(ctx, 'spec_path', 'planning/specs')
      const files = ctx.listDir(specPath)
      const specFiles = files.filter((f) => f.endsWith('.md'))
      if (specFiles.length === 0) return fail('No spec files to check')

      for (const file of specFiles) {
        const content = ctx.readFile(`${specPath}/${file}`)
        if (/###\s+B\d+:/m.test(content)) return pass()
      }
      return fail('No behavior sections (### B1:) found in spec')
    },
  }
}

/**
 * Assert that at least one research doc (.md) exists in the configured research_path.
 * Reads research_path from wm.yaml, falls back to 'planning/research'.
 */
export function assertResearchDocCreated(): EvalCheckpoint {
  return {
    name: 'research document created',
    assert(ctx: EvalContext) {
      const researchPath = readWmYamlKey(ctx, 'research_path', 'planning/research')
      const docs = ctx.run(
        `find ${researchPath} -name "*.md" -type f 2>/dev/null | head -5`,
      )
      if (!docs || docs.trim().length === 0) {
        return fail(`No research doc found in ${researchPath}/`)
      }
      return pass()
    },
  }
}

/**
 * Assert that no .md files exist at a given path (e.g., no specs created during research).
 */
export function assertNoArtifacts(dirPath: string): EvalCheckpoint {
  return {
    name: `no artifacts in ${dirPath}`,
    assert(ctx: EvalContext) {
      const files = ctx.run(
        `find ${dirPath} -name "*.md" -type f 2>/dev/null | head -5`,
      )
      if (files && files.trim().length > 0) {
        return fail(`Unexpected artifacts in ${dirPath}: ${files.trim()}`)
      }
      return pass()
    },
  }
}

// ─── Onboard Assertions ──────────────────────────────────────────────────────

/**
 * Assert that .claude/settings.json exists and has hooks configured.
 */
export function assertSettingsExist(): EvalCheckpoint {
  return {
    name: '.claude/settings.json exists with hooks',
    assert(ctx: EvalContext) {
      if (!ctx.fileExists('.claude/settings.json')) {
        return fail('.claude/settings.json not found')
      }
      const content = ctx.readFile('.claude/settings.json')
      try {
        const settings = JSON.parse(content)
        if (!settings.hooks) {
          return fail('settings.json has no hooks key')
        }
        if (!settings.hooks.SessionStart) {
          return fail('settings.json missing SessionStart hook')
        }
        return pass()
      } catch {
        return fail('settings.json is not valid JSON')
      }
    },
  }
}

/**
 * Assert that wm.yaml exists with a project: key.
 * Checks .kata/wm.yaml (new layout) then .claude/workflows/wm.yaml (old layout).
 */
export function assertWmYamlExists(): EvalCheckpoint {
  return {
    name: 'wm.yaml exists',
    assert(ctx: EvalContext) {
      const newPath = '.kata/wm.yaml'
      const oldPath = '.claude/workflows/wm.yaml'
      const wmPath = ctx.fileExists(newPath) ? newPath : ctx.fileExists(oldPath) ? oldPath : null
      if (!wmPath) {
        return fail('wm.yaml not found (checked .kata/wm.yaml and .claude/workflows/wm.yaml)')
      }
      const content = ctx.readFile(wmPath)
      if (!content.includes('project:')) {
        return fail('wm.yaml missing project: key')
      }
      return pass()
    },
  }
}

/**
 * Assert that mode templates have been seeded.
 * Checks .kata/templates/ (new layout) then .claude/workflows/templates/ (old layout).
 */
export function assertTemplatesExist(): EvalCheckpoint {
  return {
    name: 'mode templates seeded',
    assert(ctx: EvalContext) {
      const newDir = '.kata/templates'
      const oldDir = '.claude/workflows/templates'
      const templates = ctx.listDir(newDir)
      if (templates.length > 0) {
        if (!templates.includes('onboard.md')) {
          return fail('onboard.md template missing from .kata/templates/')
        }
        return pass()
      }
      const oldTemplates = ctx.listDir(oldDir)
      if (oldTemplates.length === 0) {
        return fail('No templates found (checked .kata/templates/ and .claude/workflows/templates/)')
      }
      if (!oldTemplates.includes('onboard.md')) {
        return fail('onboard.md template missing from .claude/workflows/templates/')
      }
      return pass()
    },
  }
}

/**
 * Assert that the project is a git repository.
 */
export function assertGitInitialized(): EvalCheckpoint {
  return {
    name: 'git repository initialized',
    assert(ctx: EvalContext) {
      const result = ctx.run('git rev-parse --git-dir 2>/dev/null')
      if (!result) {
        return fail('Not a git repository')
      }
      return pass()
    },
  }
}

// ─── Delta Assertions (for live projects with baselineRef) ────────────────────

/**
 * Assert that at least one new commit was made since the baseline ref.
 * For live project scenarios where there's no "initial scaffold" commit.
 */
export function assertNewCommitSinceBaseline(): EvalCheckpoint {
  return {
    name: 'git: new commit since baseline',
    assert(ctx: EvalContext) {
      if (!ctx.baselineRef) {
        return fail('No baselineRef set — this assertion requires a live project scenario')
      }
      const count = ctx.run(`git rev-list --count ${ctx.baselineRef}..HEAD`)
      if (!count || parseInt(count, 10) < 1) {
        return fail(`Expected at least 1 new commit since ${ctx.baselineRef.slice(0, 8)}, found 0`)
      }
      return pass()
    },
  }
}

/**
 * Assert that the diff since baseline contains a pattern.
 * Like assertDiffContains but uses baselineRef instead of root commit.
 */
export function assertDeltaDiffContains(pattern: string | RegExp): EvalCheckpoint {
  const label = pattern instanceof RegExp ? pattern.source : pattern
  return {
    name: `delta diff contains: ${label}`,
    assert(ctx: EvalContext) {
      if (!ctx.baselineRef) {
        return fail('No baselineRef set — this assertion requires a live project scenario')
      }
      const diff = ctx.run(`git diff ${ctx.baselineRef}..HEAD`)
      const matches = pattern instanceof RegExp ? pattern.test(diff) : diff.includes(pattern)
      if (!matches) {
        return fail(`Expected delta diff (since ${ctx.baselineRef.slice(0, 8)}) to contain '${label}'`)
      }
      return pass()
    },
  }
}

/**
 * Assert that a session state file exists with a mode set.
 * Works with both .kata/ and .claude/ layouts.
 */
export function assertSessionInitialized(): EvalCheckpoint {
  return {
    name: 'session state initialized with mode',
    assert(ctx: EvalContext) {
      const state = ctx.getSessionState()
      if (!state) {
        return fail('No session state found')
      }
      if (!state.currentMode) {
        return fail('Session state exists but currentMode is not set')
      }
      return pass()
    },
  }
}

// ─── kata can-exit Assertion ───────────────────────────────────────────────────

/**
 * Assert that kata can-exit returns 0 (all tasks complete, conditions met).
 */
export function assertCanExit(): EvalCheckpoint {
  return {
    name: 'kata can-exit: exits 0',
    assert(ctx: EvalContext) {
      const output = ctx.run('kata can-exit 2>&1; echo "EXIT:$?"')
      if (!output.includes('EXIT:0')) {
        return fail(`kata can-exit did not exit 0. Output: ${output.slice(0, 200)}`)
      }
      return pass()
    },
  }
}

// ─── Presets ──────────────────────────────────────────────────────────────────

/**
 * Standard workflow presets: correct mode, committed, clean tree, can-exit.
 */
export function workflowPresets(mode: string): EvalCheckpoint[] {
  return [
    assertCurrentMode(mode),
    assertNewCommit(),
    assertCleanWorkingTree(),
    assertCanExit(),
  ]
}

/**
 * Workflow presets that also require changes pushed to remote.
 */
export function workflowPresetsWithPush(mode: string): EvalCheckpoint[] {
  return [
    ...workflowPresets(mode),
    assertChangesPushed(),
  ]
}

/**
 * Planning mode presets: workflow + spec created/approved/has behaviors.
 */
export function planningPresets(mode: string = 'planning'): EvalCheckpoint[] {
  return [
    ...workflowPresetsWithPush(mode),
    assertSpecFileCreated(),
    assertSpecApproved(),
    assertSpecHasBehaviors(),
    assertModeInHistory(mode),
  ]
}

/**
 * Live project workflow presets: session initialized, mode correct,
 * new commit since baseline, clean tree, can-exit.
 * For scenarios running against real projects (not fixtures).
 */
export function liveWorkflowPresets(mode: string): EvalCheckpoint[] {
  return [
    assertSessionInitialized(),
    assertCurrentMode(mode),
    assertNewCommitSinceBaseline(),
    assertCleanWorkingTree(),
    assertCanExit(),
  ]
}

/**
 * Onboard presets: git init, settings, wm.yaml, templates.
 */
export const onboardPresets: EvalCheckpoint[] = [
  assertGitInitialized(),
  assertSettingsExist(),
  assertWmYamlExists(),
  assertTemplatesExist(),
]
