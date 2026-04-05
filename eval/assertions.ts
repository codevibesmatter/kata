/**
 * Eval-specific assertions for kata-wm agentic evals.
 *
 * All eval assertions live here. Scenarios import what they need —
 * individual assertions or preset arrays. No inline assertion
 * definitions in scenario files.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { readNativeTaskFiles } from '../src/commands/enter/task-factory.js'
import type { EvalCheckpoint, EvalContext } from './harness.js'
import { judgeTranscript } from './judge.js'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pass(): string | null {
  return null
}

function fail(msg: string): string {
  return msg
}

/**
 * Read a top-level key from .kata/kata.yaml via grep.
 * Returns the value string or the provided default.
 */
function readWmYamlKey(ctx: EvalContext, key: string, fallback: string): string {
  const raw = ctx.run(
    `grep '^${key}:' .kata/kata.yaml 2>/dev/null`,
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
 * Reads spec_path from kata.yaml, falls back to 'planning/specs'.
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
 * Reads research_path from kata.yaml, falls back to 'planning/research'.
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
 * Assert that .kata/kata.yaml exists with a project: key.
 */
export function assertWmYamlExists(): EvalCheckpoint {
  return {
    name: 'wm.yaml exists',
    assert(ctx: EvalContext) {
      if (!ctx.fileExists('.kata/kata.yaml')) {
        return fail('.kata/kata.yaml not found')
      }
      const content = ctx.readFile('.kata/kata.yaml')
      if (!content.includes('project:')) {
        return fail('.kata/kata.yaml missing project: key')
      }
      return pass()
    },
  }
}

/**
 * Assert that mode templates have been seeded in .kata/templates/.
 */
export function assertTemplatesExist(): EvalCheckpoint {
  return {
    name: 'mode templates seeded',
    assert(ctx: EvalContext) {
      const templates = ctx.listDir('.kata/templates')
      if (templates.length === 0) {
        return fail('No templates found in .kata/templates/')
      }
      if (!templates.includes('onboard.md')) {
        return fail('onboard.md template missing from .kata/templates/')
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

// ─── Task Discipline Assertions ──────────────────────────────────────────────

/**
 * Assert that all pre-created native tasks have status: 'completed'.
 * Requires sessionId on the EvalContext.
 */
export function assertAllNativeTasksCompleted(): EvalCheckpoint {
  return {
    name: 'all native tasks completed',
    assert(ctx: EvalContext) {
      if (!ctx.sessionId) {
        return fail('No sessionId on EvalContext — cannot check native tasks')
      }
      const tasks = readNativeTaskFiles(ctx.sessionId)
      if (tasks.length === 0) {
        return fail('No native task files found')
      }
      const pending = tasks.filter((t) => t.status !== 'completed')
      if (pending.length > 0) {
        const summary = pending.map((t) => `[${t.id}] ${t.subject} (${t.status})`).join('; ')
        return fail(`${pending.length} native task(s) not completed: ${summary}`)
      }
      return pass()
    },
  }
}

/**
 * Assert that the transcript contains no TaskCreate tool_use blocks.
 * Agents should use pre-created native tasks, not create their own.
 * Requires transcriptPath on the EvalContext.
 */
export function assertNoTaskCreateCalls(): EvalCheckpoint {
  return {
    name: 'no TaskCreate calls in transcript',
    assert(ctx: EvalContext) {
      if (!ctx.transcriptPath) {
        return fail('No transcriptPath on EvalContext — cannot check transcript')
      }
      let content: string
      try {
        content = readFileSync(ctx.transcriptPath, 'utf-8')
      } catch {
        return fail(`Cannot read transcript: ${ctx.transcriptPath}`)
      }
      // Each line is a JSON event; look for tool_use blocks with name TaskCreate
      const lines = content.split('\n').filter(Boolean)
      for (const line of lines) {
        try {
          const event = JSON.parse(line)
          if (event.type === 'assistant' && event.message?.content) {
            for (const block of event.message.content) {
              if (block.type === 'tool_use' && block.name === 'TaskCreate') {
                return fail('Agent called TaskCreate — should use pre-created native tasks instead')
              }
            }
          }
        } catch {
          // Skip unparseable lines
        }
      }
      return pass()
    },
  }
}

/**
 * Assert that at least N native tasks exist for the session.
 * Sanity check that tasks were actually created by kata enter.
 */
export function assertNativeTaskCount(min: number): EvalCheckpoint {
  return {
    name: `native task count >= ${min}`,
    assert(ctx: EvalContext) {
      if (!ctx.sessionId) {
        return fail('No sessionId on EvalContext — cannot check native tasks')
      }
      const tasks = readNativeTaskFiles(ctx.sessionId)
      if (tasks.length < min) {
        return fail(`Expected >= ${min} native tasks, found ${tasks.length}`)
      }
      return pass()
    },
  }
}

/**
 * Assert that no completed task has an incomplete blocker.
 * Verifies the agent respected the dependency chain.
 */
export function assertTaskDependencyOrderRespected(): EvalCheckpoint {
  return {
    name: 'task dependency order respected',
    assert(ctx: EvalContext) {
      if (!ctx.sessionId) {
        return fail('No sessionId on EvalContext — cannot check native tasks')
      }
      const tasks = readNativeTaskFiles(ctx.sessionId)
      if (tasks.length === 0) {
        return fail('No native task files found')
      }
      const statusById = new Map(tasks.map((t) => [t.id, t.status]))
      for (const task of tasks) {
        if (task.status === 'completed') {
          for (const blockerId of task.blockedBy) {
            const blockerStatus = statusById.get(blockerId)
            if (blockerStatus && blockerStatus !== 'completed') {
              return fail(
                `Task [${task.id}] completed but blocker [${blockerId}] is '${blockerStatus}'`,
              )
            }
          }
        }
      }
      return pass()
    },
  }
}

// ─── Task Generation Assertions ──────────────────────────────────────────────

/**
 * Assert that at least one native task has metadata.originalId matching the given suffix.
 * Verifies that subphase pattern expansion created the expected task IDs.
 * Example: assertNativeTaskHasOriginalId('p2.1:impl') checks for impl task of first spec phase.
 */
export function assertNativeTaskHasOriginalId(suffix: string): EvalCheckpoint {
  return {
    name: `native task exists with originalId: ${suffix}`,
    assert(ctx: EvalContext) {
      if (!ctx.sessionId) {
        return fail('No sessionId on EvalContext — cannot check native tasks')
      }
      const tasks = readNativeTaskFiles(ctx.sessionId)
      if (tasks.length === 0) {
        return fail('No native task files found')
      }
      const match = tasks.find(
        (t) => (t.metadata as Record<string, unknown>)?.originalId === suffix,
      )
      if (!match) {
        const ids = tasks
          .map((t) => (t.metadata as Record<string, unknown>)?.originalId)
          .filter(Boolean)
          .join(', ')
        return fail(
          `No native task with originalId '${suffix}'. Found: ${ids}`,
        )
      }
      return pass()
    },
  }
}

/**
 * Assert that at least one native task's description matches the given pattern.
 * Verifies that instruction/agent metadata from subphase patterns carried through
 * to the native task description field.
 */
export function assertNativeTaskHasInstruction(pattern: string | RegExp): EvalCheckpoint {
  const label = pattern instanceof RegExp ? pattern.source : pattern
  return {
    name: `native task has instruction: ${label}`,
    assert(ctx: EvalContext) {
      if (!ctx.sessionId) {
        return fail('No sessionId on EvalContext — cannot check native tasks')
      }
      const tasks = readNativeTaskFiles(ctx.sessionId)
      if (tasks.length === 0) {
        return fail('No native task files found')
      }
      const matches = pattern instanceof RegExp
        ? tasks.some((t) => pattern.test(t.description))
        : tasks.some((t) => t.description.includes(pattern))
      if (!matches) {
        return fail(
          `No native task description matches '${label}'. ` +
          `Descriptions: ${tasks.map((t) => t.description.slice(0, 60)).join(' | ')}`,
        )
      }
      return pass()
    },
  }
}

/**
 * Implementation task generation presets for a 2-phase spec with impl-test-review pattern.
 * Verifies the 3-step subphase pattern expanded correctly into native tasks.
 */
export function implTaskGenPresets(): EvalCheckpoint[] {
  return [
    assertNativeTaskHasOriginalId('p2.1:impl'),
    assertNativeTaskHasOriginalId('p2.1:test'),
    assertNativeTaskHasOriginalId('p2.1:review'),
    assertNativeTaskHasOriginalId('p2.2:impl'),
    assertNativeTaskHasOriginalId('p2.2:test'),
    assertNativeTaskHasOriginalId('p2.2:review'),
    assertNativeTaskHasInstruction(/check-phase/),
  ]
}

/**
 * Assert that review-agent was actually spawned during the session.
 * Checks transcript for subagent_type="review-agent" Task invocation.
 */
export function assertReviewAgentRan(): EvalCheckpoint {
  return assertTranscriptContains('review-agent', 'review-agent spawned in transcript')
}

/**
 * Preset for impl-test-review scenarios with active review-agent execution.
 * Extends implTaskGenPresets with transcript check for review-agent invocation.
 */
export function implReviewAgentsPresets(): EvalCheckpoint[] {
  return [
    ...implTaskGenPresets(),
    assertReviewAgentRan(),
  ]
}

// ─── Stop Hook Assertions ────────────────────────────────────────────────────

interface StopHookLogEntry {
  ts: string
  decision: 'block' | 'allow'
  reasons: string[]
  note?: string
}

/**
 * Read stop hook log entries for a session.
 * The stop hook writes to {sessionsDir}/{sessionId}/stop-hook.log.jsonl
 */
function readStopHookLog(ctx: EvalContext): StopHookLogEntry[] {
  if (!ctx.sessionId) return []
  const logPath = `.kata/sessions/${ctx.sessionId}/stop-hook.log.jsonl`
  if (ctx.fileExists(logPath)) {
    const content = ctx.readFile(logPath)
    return content
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line) as StopHookLogEntry
        } catch {
          return null
        }
      })
      .filter((e): e is StopHookLogEntry => e !== null)
  }
  return []
}

/**
 * Assert that the stop hook blocked the agent at least N times.
 * Requires sessionId on EvalContext and stop-hook.log.jsonl in the session dir.
 */
export function assertStopHookBlocked(minTimes: number = 1): EvalCheckpoint {
  return {
    name: `stop hook blocked >= ${minTimes} time(s)`,
    assert(ctx: EvalContext) {
      if (!ctx.sessionId) {
        return fail('No sessionId on EvalContext — cannot check stop hook log')
      }
      const entries = readStopHookLog(ctx)
      if (entries.length === 0) {
        return fail('No stop hook log entries found — hook may not have fired')
      }
      const blocks = entries.filter((e) => e.decision === 'block')
      if (blocks.length < minTimes) {
        return fail(
          `Expected stop hook to block >= ${minTimes} time(s), got ${blocks.length}. ` +
          `Total hook firings: ${entries.length}`,
        )
      }
      return pass()
    },
  }
}

/**
 * Assert that the stop hook blocked with a reason matching the given pattern.
 * Useful for verifying specific conditions were enforced (e.g., 'pending', 'Uncommitted').
 */
export function assertStopHookBlockedWithReason(pattern: string | RegExp): EvalCheckpoint {
  const label = pattern instanceof RegExp ? pattern.source : pattern
  return {
    name: `stop hook blocked with reason: ${label}`,
    assert(ctx: EvalContext) {
      if (!ctx.sessionId) {
        return fail('No sessionId on EvalContext — cannot check stop hook log')
      }
      const entries = readStopHookLog(ctx)
      const blocks = entries.filter((e) => e.decision === 'block')
      if (blocks.length === 0) {
        return fail('Stop hook never blocked — cannot check reasons')
      }
      const allReasons = blocks.flatMap((e) => e.reasons)
      const matches = pattern instanceof RegExp
        ? allReasons.some((r) => pattern.test(r))
        : allReasons.some((r) => r.includes(pattern))
      if (!matches) {
        return fail(
          `No stop hook block had reason matching '${label}'. ` +
          `Reasons seen: ${allReasons.slice(0, 5).join('; ')}`,
        )
      }
      return pass()
    },
  }
}

/**
 * Assert that the stop hook eventually allowed exit (last entry is 'allow').
 */
export function assertStopHookEventuallyAllowed(): EvalCheckpoint {
  return {
    name: 'stop hook eventually allowed exit',
    assert(ctx: EvalContext) {
      if (!ctx.sessionId) {
        return fail('No sessionId on EvalContext — cannot check stop hook log')
      }
      const entries = readStopHookLog(ctx)
      if (entries.length === 0) {
        return fail('No stop hook log entries found')
      }
      const last = entries[entries.length - 1]
      if (last.decision !== 'allow') {
        return fail(
          `Last stop hook decision was '${last.decision}', expected 'allow'. ` +
          `Reasons: ${last.reasons.join('; ')}`,
        )
      }
      return pass()
    },
  }
}

// ─── Hook Log Assertions ────────────────────────────────────────────────────

interface HookLogEntry {
  ts: string
  hook: string
  decision: string
  [key: string]: unknown
}

/**
 * Read the unified hook log for a session.
 * Hooks write to {sessionsDir}/{sessionId}/hooks.log.jsonl
 */
function readHookLog(ctx: EvalContext): HookLogEntry[] {
  if (!ctx.sessionId) return []
  const logPath = `.kata/sessions/${ctx.sessionId}/hooks.log.jsonl`
  if (ctx.fileExists(logPath)) {
    const content = ctx.readFile(logPath)
    return content
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line) as HookLogEntry
        } catch {
          return null
        }
      })
      .filter((e): e is HookLogEntry => e !== null)
  }
  return []
}

/**
 * Assert that a specific hook fired at least once.
 * Checks hooks.log.jsonl for entries matching the hook name.
 */
export function assertHookFired(hookName: string): EvalCheckpoint {
  return {
    name: `hook fired: ${hookName}`,
    assert(ctx: EvalContext) {
      const entries = readHookLog(ctx)
      if (entries.length === 0) {
        return fail('No hook log entries found — hooks.log.jsonl missing or empty')
      }
      const matches = entries.filter((e) => e.hook === hookName)
      if (matches.length === 0) {
        const seen = [...new Set(entries.map((e) => e.hook))].join(', ')
        return fail(`Hook '${hookName}' never fired. Hooks seen: ${seen}`)
      }
      return pass()
    },
  }
}

/**
 * Assert that a specific hook made a specific decision at least once.
 */
export function assertHookDecision(hookName: string, decision: string): EvalCheckpoint {
  return {
    name: `hook ${hookName}: decision=${decision}`,
    assert(ctx: EvalContext) {
      const entries = readHookLog(ctx)
      const matches = entries.filter((e) => e.hook === hookName && e.decision === decision)
      if (matches.length === 0) {
        const hookEntries = entries.filter((e) => e.hook === hookName)
        if (hookEntries.length === 0) {
          return fail(`Hook '${hookName}' never fired`)
        }
        const decisions = hookEntries.map((e) => e.decision).join(', ')
        return fail(`Hook '${hookName}' never decided '${decision}'. Decisions seen: ${decisions}`)
      }
      return pass()
    },
  }
}

/**
 * Assert that the mode-gate hook denied at least one tool call.
 * Checks hooks.log.jsonl for mode-gate entries with decision=deny.
 */
export function assertModeGateBlocked(): EvalCheckpoint {
  return {
    name: 'mode-gate: blocked at least one edit without mode',
    assert(ctx: EvalContext) {
      const entries = readHookLog(ctx)
      const denials = entries.filter((e) => e.hook === 'mode-gate' && e.decision === 'deny')
      if (denials.length > 0) return pass()

      // Fallback: check transcript for the denial message (pre-logging compat)
      if (ctx.transcriptPath) {
        try {
          const content = readFileSync(ctx.transcriptPath, 'utf-8')
          if (
            content.includes('Enter a mode first') ||
            content.includes('Write operations are blocked until a mode is active')
          ) {
            return pass()
          }
        } catch {
          // ignore
        }
      }

      return fail(
        'No mode-gate denial found. Agent may have entered a mode before attempting edits.',
      )
    },
  }
}

/**
 * Assert that the transcript contains a string pattern.
 * Useful for verifying hook outputs, system messages, or tool results.
 */
export function assertTranscriptContains(pattern: string, label?: string): EvalCheckpoint {
  return {
    name: label ?? `transcript contains: ${pattern.slice(0, 60)}`,
    assert(ctx: EvalContext) {
      if (!ctx.transcriptPath) {
        return fail('No transcriptPath — cannot check transcript')
      }
      let content: string
      try {
        content = readFileSync(ctx.transcriptPath, 'utf-8')
      } catch {
        return fail(`Cannot read transcript: ${ctx.transcriptPath}`)
      }
      if (!content.includes(pattern)) {
        return fail(`Pattern not found in transcript: "${pattern.slice(0, 80)}"`)
      }
      return pass()
    },
  }
}

// ─── Interview Assertions ─────────────────────────────────────────────────────

/**
 * Known interview category headers from batteries/interviews.yaml.
 * Used to verify that captured questions look like real interview rounds.
 */
const INTERVIEW_HEADERS = new Set([
  // P0: scope clarification
  'Feature', 'Issue', 'Approve',
  // P1: interview categories from batteries/interviews.yaml
  'Problem', 'Happy Path', 'Scope OUT', 'Empty State', 'Scale', 'Concurrency',
  'Integration', 'Errors', 'Performance',
  'Error Paths', 'Test Types',
  'Reference', 'Layout', 'Components',
])

/**
 * Assert that .eval/pending-question.json contains an interview-like AskUserQuestion.
 * Checks:
 * - File exists and is valid JSON
 * - Has a sessionId
 * - Has at least 1 question with header, question text, and 2+ options
 * - At least one header matches a known interview category
 */
export function assertInterviewQuestionCaptured(): EvalCheckpoint {
  return {
    name: 'interview AskUserQuestion captured',
    assert(ctx: EvalContext) {
      if (!ctx.fileExists('.eval/pending-question.json')) {
        return fail('No .eval/pending-question.json — AskUserQuestion was not intercepted')
      }

      let data: Record<string, unknown>
      try {
        data = JSON.parse(ctx.readFile('.eval/pending-question.json'))
      } catch {
        return fail('.eval/pending-question.json is not valid JSON')
      }

      if (!data.sessionId) {
        return fail('pending-question.json has no sessionId')
      }

      const questions = data.questions as Array<Record<string, unknown>> | undefined
      if (!questions || questions.length === 0) {
        return fail('pending-question.json has no questions')
      }

      // Validate structure: each question needs header, question, options (2+)
      for (let i = 0; i < questions.length; i++) {
        const q = questions[i]
        if (!q.header || !q.question) {
          return fail(`Question ${i} missing header or question text`)
        }
        const opts = q.options as Array<unknown> | undefined
        if (!opts || opts.length < 2) {
          return fail(`Question ${i} has < 2 options (got ${opts?.length ?? 0})`)
        }
      }

      // At least one header should match a known interview category
      const headers = questions.map((q) => String(q.header))
      const matched = headers.some((h) => INTERVIEW_HEADERS.has(h))
      if (!matched) {
        return fail(
          `No question header matches interview categories. Headers seen: ${headers.join(', ')}`,
        )
      }

      return pass()
    },
  }
}

// ─── LLM Judge Assertions ───────────────────────────────────────────────────

export interface JudgeAssertionOptions {
  /** Path to the mode template (relative to projectDir or absolute) */
  templatePath: string
  /** Minimum agent score to pass (default: 75) */
  minAgentScore?: number
  /** Minimum system score to pass (default: 75) */
  minSystemScore?: number
}

/**
 * Assert that the LLM-as-judge evaluates the complete transcript as passing.
 * Runs the judge inline as a checkpoint — not optional via --judge flag.
 * Requires transcriptPath on EvalContext (scenario must have transcript enabled).
 */
export function assertJudgePasses(options: JudgeAssertionOptions): EvalCheckpoint {
  const minAgent = options.minAgentScore ?? 75
  const minSystem = options.minSystemScore ?? 75
  return {
    name: `judge passes (agent>=${minAgent}, system>=${minSystem})`,
    async assert(ctx: EvalContext) {
      if (!ctx.transcriptPath) {
        return fail('No transcriptPath — judge requires a transcript')
      }
      const resolvedTemplate = options.templatePath.startsWith('/')
        ? options.templatePath
        : join(ctx.projectDir, options.templatePath)
      try {
        const result = await judgeTranscript({
          transcriptPath: ctx.transcriptPath,
          templatePath: resolvedTemplate,
        })
        const errors: string[] = []
        if (result.agentScore < minAgent) {
          errors.push(`agent score ${result.agentScore}/100 < ${minAgent}`)
        }
        if (result.systemScore < minSystem) {
          errors.push(`system score ${result.systemScore}/100 < ${minSystem}`)
        }
        if (errors.length > 0) {
          return fail(
            `Judge: ${errors.join(', ')}. Verdict: ${result.verdict}`,
          )
        }
        return pass()
      } catch (err) {
        return fail(`Judge failed: ${err instanceof Error ? err.message : String(err)}`)
      }
    },
  }
}

// ─── Verify Evidence Assertions ─────────────────────────────────────────────

/**
 * Assert that verification evidence files exist for a given issue number.
 * Checks .kata/verification-evidence/ for JSON files matching the issue number pattern.
 */
export function assertVerifyEvidenceExists(issueNumber: number): EvalCheckpoint {
  return {
    name: `verify evidence exists for issue #${issueNumber}`,
    assert(ctx: EvalContext) {
      try {
        const files = ctx.listDir('.kata/verification-evidence')
        const matching = files.filter(
          (f) => f.endsWith('.json') && f.includes(`-${issueNumber}.json`),
        )
        if (matching.length > 0) {
          return pass()
        }
      } catch {
        // dir doesn't exist
      }
      return fail(
        `No verification evidence JSON found for issue #${issueNumber} ` +
        `in .kata/verification-evidence/`,
      )
    },
  }
}

/**
 * Assert that the verify subagent was invoked (transcript contains verify-run output).
 * Checks for the verify-run stderr markers that indicate the subagent spawned.
 */
export function assertVerifySubagentRan(): EvalCheckpoint {
  return {
    name: 'verify subagent was invoked',
    assert(ctx: EvalContext) {
      if (!ctx.transcriptPath) {
        return fail('No transcriptPath — cannot check for verify subagent')
      }
      let content: string
      try {
        content = readFileSync(ctx.transcriptPath, 'utf-8')
      } catch {
        return fail(`Cannot read transcript: ${ctx.transcriptPath}`)
      }
      // verify-run outputs these markers to stderr which gets captured in tool results
      if (
        content.includes('verify-run') ||
        content.includes('Spawning fresh verification agent') ||
        content.includes('Verification PASSED') ||
        content.includes('Verification FAILED')
      ) {
        return pass()
      }
      return fail(
        'No verify-run output found in transcript. ' +
        'The verify subagent may not have been invoked.',
      )
    },
  }
}

// ─── Skill Activation Assertions ────────────────────────────────────────────

/**
 * Scan transcript JSONL for skill activation evidence.
 * Detects both:
 * - Read tool_use blocks targeting .claude/skills/{skillName}/SKILL.md
 * - Skill tool_use blocks with skill name matching the skill
 * Returns the line indices where the skill was activated.
 */
function findSkillReadIndices(transcriptContent: string, skillName: string): number[] {
  const lines = transcriptContent.split('\n').filter(Boolean)
  const indices: number[] = []
  for (let i = 0; i < lines.length; i++) {
    try {
      const event = JSON.parse(lines[i])
      if (event.type === 'assistant' && event.message?.content) {
        for (const block of event.message.content) {
          if (block.type === 'tool_use') {
            // Direct Read of SKILL.md file
            if (block.name === 'Read') {
              const filePath = block.input?.file_path ?? ''
              if (filePath.includes(`.claude/skills/${skillName}/SKILL.md`)) {
                indices.push(i)
                break
              }
            }
            // Skill tool invocation (Claude Code native skill system)
            if (block.name === 'Skill') {
              const skill = block.input?.skill ?? ''
              if (skill === skillName) {
                indices.push(i)
                break
              }
            }
          }
        }
      }
    } catch {
      // Skip unparseable lines
    }
  }
  return indices
}

/**
 * Assert that the agent activated a specific skill during the session.
 * Scans transcript for Read calls targeting .claude/skills/{skillName}/SKILL.md
 * or Skill tool invocations matching the skill name.
 */
export function assertSkillRead(skillName: string): EvalCheckpoint {
  return {
    name: `skill read: ${skillName}`,
    assert(ctx: EvalContext) {
      if (!ctx.transcriptPath) {
        return fail('No transcriptPath on EvalContext — cannot check transcript')
      }
      let content: string
      try {
        content = readFileSync(ctx.transcriptPath, 'utf-8')
      } catch {
        return fail(`Cannot read transcript: ${ctx.transcriptPath}`)
      }
      const indices = findSkillReadIndices(content, skillName)
      if (indices.length === 0) {
        return fail(`Skill '${skillName}' was never read — no Read call for .claude/skills/${skillName}/SKILL.md found in transcript`)
      }
      return pass()
    },
  }
}

/**
 * Assert that skills were read in a specific order (first-occurrence ordering).
 * Verifies all skills were read and that first-read positions are strictly increasing.
 */
export function assertSkillReadOrder(skills: string[]): EvalCheckpoint {
  return {
    name: `skill read order: ${skills.join(' -> ')}`,
    assert(ctx: EvalContext) {
      if (!ctx.transcriptPath) {
        return fail('No transcriptPath on EvalContext — cannot check transcript')
      }
      let content: string
      try {
        content = readFileSync(ctx.transcriptPath, 'utf-8')
      } catch {
        return fail(`Cannot read transcript: ${ctx.transcriptPath}`)
      }
      const firstIndices: number[] = []
      for (const skill of skills) {
        const indices = findSkillReadIndices(content, skill)
        if (indices.length === 0) {
          return fail(`Skill '${skill}' was never read — cannot verify ordering`)
        }
        firstIndices.push(indices[0])
      }
      for (let i = 1; i < firstIndices.length; i++) {
        if (firstIndices[i] <= firstIndices[i - 1]) {
          return fail(
            `Skill '${skills[i]}' (first read at line ${firstIndices[i]}) was read before or at same line as '${skills[i - 1]}' (first read at line ${firstIndices[i - 1]}) — expected strictly increasing order`,
          )
        }
      }
      return pass()
    },
  }
}

/**
 * Assert that a specific skill's SKILL.md was NOT read during the session.
 */
export function assertSkillNotRead(skillName: string): EvalCheckpoint {
  return {
    name: `skill NOT read: ${skillName}`,
    assert(ctx: EvalContext) {
      if (!ctx.transcriptPath) {
        return fail('No transcriptPath on EvalContext — cannot check transcript')
      }
      let content: string
      try {
        content = readFileSync(ctx.transcriptPath, 'utf-8')
      } catch {
        return fail(`Cannot read transcript: ${ctx.transcriptPath}`)
      }
      const indices = findSkillReadIndices(content, skillName)
      if (indices.length > 0) {
        return fail(`Skill '${skillName}' was read at line(s) ${indices.join(', ')} — expected it to NOT be read`)
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
 * Stop hook enforcement presets: hook fired, blocked at least once,
 * blocked for pending tasks, and eventually allowed exit.
 */
export function stopHookPresets(): EvalCheckpoint[] {
  return [
    assertStopHookBlocked(1),
    assertStopHookBlockedWithReason(/task.*pending/i),
    assertStopHookEventuallyAllowed(),
  ]
}

/**
 * Task discipline presets: native tasks created, no TaskCreate calls,
 * all tasks completed, dependency order respected.
 */
export function taskDisciplinePresets(): EvalCheckpoint[] {
  return [
    assertNativeTaskCount(3),
    assertNoTaskCreateCalls(),
    assertAllNativeTasksCompleted(),
    assertTaskDependencyOrderRespected(),
  ]
}

/**
 * Live project + task discipline: session init, mode, commit, clean tree,
 * can-exit, plus full task discipline checks.
 */
export function liveTaskDisciplinePresets(mode: string): EvalCheckpoint[] {
  return [
    ...liveWorkflowPresets(mode),
    ...taskDisciplinePresets(),
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

/**
 * Skill activation presets: both skills read, in correct order.
 */
export function skillActivationPresets(): EvalCheckpoint[] {
  return [
    assertSkillRead('quick-planning'),
    assertSkillRead('tdd'),
    assertSkillReadOrder(['quick-planning', 'tdd']),
  ]
}
