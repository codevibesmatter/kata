/**
 * Tests for eval assertion library.
 *
 * Validates that assertion functions and presets work correctly
 * with mock EvalContext objects.
 */

import { describe, it, expect } from 'bun:test'
import type { EvalContext } from './harness.js'
import {
  assertCurrentMode,
  assertStayedInMode,
  assertModeInHistory,
  assertNewCommit,
  assertCleanWorkingTree,
  assertDiffContains,
  assertDiffNonTrivial,
  assertChangesPushed,
  assertNewCommitSinceBaseline,
  assertDeltaDiffContains,
  assertSessionInitialized,
  assertSpecFileCreated,
  assertSpecApproved,
  assertSpecHasBehaviors,
  assertResearchDocCreated,
  assertNoArtifacts,
  assertSettingsExist,
  assertWmYamlExists,
  assertTemplatesExist,
  assertCanExit,
  assertAllNativeTasksCompleted,
  assertNoTaskCreateCalls,
  assertNativeTaskCount,
  assertTaskDependencyOrderRespected,
  assertStopHookBlocked,
  assertStopHookBlockedWithReason,
  assertStopHookEventuallyAllowed,
  workflowPresets,
  workflowPresetsWithPush,
  planningPresets,
  liveWorkflowPresets,
  taskDisciplinePresets,
  liveTaskDisciplinePresets,
  stopHookPresets,
  onboardPresets,
} from './assertions.js'
import type { SessionState } from '../src/state/schema.js'

// ─── Mock Context Builder ────────────────────────────────────────────────────

function mockContext(overrides: {
  state?: Partial<SessionState> | null
  files?: Record<string, string>
  dirs?: Record<string, string[]>
  runResults?: Record<string, string>
  baselineRef?: string | null
  sessionId?: string | null
  transcriptPath?: string | null
}): EvalContext {
  const files = overrides.files ?? {}
  const dirs = overrides.dirs ?? {}
  const runResults = overrides.runResults ?? {}

  return {
    projectDir: '/tmp/test-project',
    baselineRef: overrides.baselineRef ?? null,
    sessionId: overrides.sessionId ?? null,
    transcriptPath: overrides.transcriptPath ?? null,
    getSessionState() {
      if (overrides.state === null) return null
      return (overrides.state ?? {}) as SessionState
    },
    run(cmd: string) {
      // Check for exact matches first, then prefix matches
      if (runResults[cmd] !== undefined) return runResults[cmd]
      for (const [pattern, result] of Object.entries(runResults)) {
        if (cmd.includes(pattern)) return result
      }
      return ''
    },
    fileExists(rel: string) {
      return rel in files
    },
    readFile(rel: string) {
      return files[rel] ?? ''
    },
    listDir(rel: string) {
      return dirs[rel] ?? []
    },
  }
}

// ─── Session State Assertions ────────────────────────────────────────────────

describe('assertCurrentMode', () => {
  it('passes when mode matches', async () => {
    const ctx = mockContext({ state: { currentMode: 'task' } })
    const result = await assertCurrentMode('task').assert(ctx)
    expect(result).toBeNull()
  })

  it('fails when mode differs', async () => {
    const ctx = mockContext({ state: { currentMode: 'planning' } })
    const result = await assertCurrentMode('task').assert(ctx)
    expect(result).toContain("Expected currentMode 'task'")
  })

  it('fails when no session state', async () => {
    const ctx = mockContext({ state: null })
    const result = await assertCurrentMode('task').assert(ctx)
    expect(result).toContain('Session state not found')
  })
})

describe('assertStayedInMode', () => {
  it('passes when only target mode in history', async () => {
    const ctx = mockContext({
      state: { modeHistory: [{ mode: 'research' }] } as Partial<SessionState>,
    })
    const result = await assertStayedInMode('research').assert(ctx)
    expect(result).toBeNull()
  })

  it('fails when other modes in history', async () => {
    const ctx = mockContext({
      state: {
        modeHistory: [{ mode: 'research' }, { mode: 'planning' }],
      } as Partial<SessionState>,
    })
    const result = await assertStayedInMode('research').assert(ctx)
    expect(result).toContain('planning')
  })

  it('ignores default mode', async () => {
    const ctx = mockContext({
      state: {
        modeHistory: [{ mode: 'default' }, { mode: 'research' }],
      } as Partial<SessionState>,
    })
    const result = await assertStayedInMode('research').assert(ctx)
    expect(result).toBeNull()
  })
})

describe('assertModeInHistory', () => {
  it('passes when mode found in history', async () => {
    const ctx = mockContext({
      state: { modeHistory: [{ mode: 'planning' }] } as Partial<SessionState>,
    })
    const result = await assertModeInHistory('planning').assert(ctx)
    expect(result).toBeNull()
  })

  it('fails when mode not in history', async () => {
    const ctx = mockContext({
      state: { modeHistory: [{ mode: 'task' }] } as Partial<SessionState>,
    })
    const result = await assertModeInHistory('planning').assert(ctx)
    expect(result).toContain('planning mode not found')
  })
})

// ─── Git Assertions ──────────────────────────────────────────────────────────

describe('assertNewCommit', () => {
  it('passes with 2+ commits', async () => {
    const ctx = mockContext({
      runResults: { 'git log --oneline': 'abc123 feat: something\ndef456 Initial scaffold' },
    })
    const result = await assertNewCommit().assert(ctx)
    expect(result).toBeNull()
  })

  it('fails with only 1 commit', async () => {
    const ctx = mockContext({
      runResults: { 'git log --oneline': 'def456 Initial scaffold' },
    })
    const result = await assertNewCommit().assert(ctx)
    expect(result).toContain('Expected at least 2 commits')
  })
})

describe('assertDiffNonTrivial', () => {
  it('passes when diff exceeds minimum', async () => {
    const diffLines = Array(60).fill('+added line').join('\n')
    const ctx = mockContext({
      runResults: {
        'git rev-list --max-parents=0 HEAD': 'abc123',
        'git diff abc123..HEAD': diffLines,
      },
    })
    const result = await assertDiffNonTrivial(50).assert(ctx)
    expect(result).toBeNull()
  })

  it('fails when diff is too small', async () => {
    const ctx = mockContext({
      runResults: {
        'git rev-list --max-parents=0 HEAD': 'abc123',
        'git diff abc123..HEAD': '+one line\n+two line',
      },
    })
    const result = await assertDiffNonTrivial(50).assert(ctx)
    expect(result).toContain('Expected diff >= 50 lines')
  })
})

describe('assertChangesPushed', () => {
  it('passes when not ahead', async () => {
    const ctx = mockContext({
      runResults: { 'git status -sb': '## main...origin/main' },
    })
    const result = await assertChangesPushed().assert(ctx)
    expect(result).toBeNull()
  })

  it('fails when ahead', async () => {
    const ctx = mockContext({
      runResults: { 'git status -sb': '## main...origin/main [ahead 2]' },
    })
    const result = await assertChangesPushed().assert(ctx)
    expect(result).toContain('Unpushed commits')
  })
})

// ─── Delta Assertions (live project) ─────────────────────────────────────────

describe('assertNewCommitSinceBaseline', () => {
  it('passes when commits exist since baseline', async () => {
    const ctx = mockContext({
      baselineRef: 'abc123',
      runResults: { 'git rev-list --count abc123..HEAD': '2' },
    })
    const result = await assertNewCommitSinceBaseline().assert(ctx)
    expect(result).toBeNull()
  })

  it('fails when no commits since baseline', async () => {
    const ctx = mockContext({
      baselineRef: 'abc123',
      runResults: { 'git rev-list --count abc123..HEAD': '0' },
    })
    const result = await assertNewCommitSinceBaseline().assert(ctx)
    expect(result).toContain('Expected at least 1 new commit')
  })

  it('fails when no baselineRef', async () => {
    const ctx = mockContext({ baselineRef: null })
    const result = await assertNewCommitSinceBaseline().assert(ctx)
    expect(result).toContain('No baselineRef set')
  })
})

describe('assertDeltaDiffContains', () => {
  it('passes when delta diff contains pattern', async () => {
    const ctx = mockContext({
      baselineRef: 'abc123',
      runResults: { 'git diff abc123..HEAD': '+health check endpoint\n+return 200' },
    })
    const result = await assertDeltaDiffContains('health check').assert(ctx)
    expect(result).toBeNull()
  })

  it('passes with regex pattern', async () => {
    const ctx = mockContext({
      baselineRef: 'abc123',
      runResults: { 'git diff abc123..HEAD': '+export function getHealth() {}' },
    })
    const result = await assertDeltaDiffContains(/function\s+get\w+/).assert(ctx)
    expect(result).toBeNull()
  })

  it('fails when pattern not found', async () => {
    const ctx = mockContext({
      baselineRef: 'abc123',
      runResults: { 'git diff abc123..HEAD': '+unrelated change' },
    })
    const result = await assertDeltaDiffContains('health').assert(ctx)
    expect(result).toContain("Expected delta diff")
  })

  it('fails when no baselineRef', async () => {
    const ctx = mockContext({ baselineRef: null })
    const result = await assertDeltaDiffContains('anything').assert(ctx)
    expect(result).toContain('No baselineRef set')
  })
})

describe('assertSessionInitialized', () => {
  it('passes when session has mode', async () => {
    const ctx = mockContext({ state: { currentMode: 'task' } })
    const result = await assertSessionInitialized().assert(ctx)
    expect(result).toBeNull()
  })

  it('fails when no session state', async () => {
    const ctx = mockContext({ state: null })
    const result = await assertSessionInitialized().assert(ctx)
    expect(result).toContain('No session state found')
  })

  it('fails when mode not set', async () => {
    const ctx = mockContext({ state: {} })
    const result = await assertSessionInitialized().assert(ctx)
    expect(result).toContain('currentMode is not set')
  })
})

// ─── Artifact Assertions ─────────────────────────────────────────────────────

describe('assertSpecFileCreated (config-driven)', () => {
  it('reads spec_path from wm.yaml', async () => {
    const ctx = mockContext({
      files: { '.claude/workflows/wm.yaml': 'spec_path: custom/specs' },
      dirs: { 'custom/specs': ['feature.md'] },
      // grep returns the full matching line; readWmYamlKey extracts the value via regex
      runResults: { "grep '^spec_path:'": 'spec_path: custom/specs' },
    })
    const result = await assertSpecFileCreated().assert(ctx)
    expect(result).toBeNull()
  })

  it('falls back to planning/specs when no wm.yaml', async () => {
    const ctx = mockContext({
      dirs: { 'planning/specs': ['my-spec.md'] },
      runResults: { "grep '^spec_path:'": '' },
    })
    const result = await assertSpecFileCreated().assert(ctx)
    expect(result).toBeNull()
  })

  it('fails when no spec files', async () => {
    const ctx = mockContext({
      dirs: { 'planning/specs': [] },
      runResults: { "grep '^spec_path:'": '' },
    })
    const result = await assertSpecFileCreated().assert(ctx)
    expect(result).toContain('No spec files found')
  })
})

describe('assertNoArtifacts', () => {
  it('passes when directory is empty', async () => {
    const ctx = mockContext({
      runResults: { 'find planning/specs': '' },
    })
    const result = await assertNoArtifacts('planning/specs').assert(ctx)
    expect(result).toBeNull()
  })

  it('fails when artifacts exist', async () => {
    const ctx = mockContext({
      runResults: { 'find planning/specs': 'planning/specs/something.md' },
    })
    const result = await assertNoArtifacts('planning/specs').assert(ctx)
    expect(result).toContain('Unexpected artifacts')
  })
})

// ─── Onboard Assertions ──────────────────────────────────────────────────────

describe('assertSettingsExist', () => {
  it('passes with valid settings', async () => {
    const ctx = mockContext({
      files: {
        '.claude/settings.json': JSON.stringify({
          hooks: { SessionStart: [{ command: 'kata hook session-start' }] },
        }),
      },
    })
    const result = await assertSettingsExist().assert(ctx)
    expect(result).toBeNull()
  })

  it('fails when no hooks key', async () => {
    const ctx = mockContext({
      files: { '.claude/settings.json': '{}' },
    })
    const result = await assertSettingsExist().assert(ctx)
    expect(result).toContain('no hooks key')
  })
})

// ─── Presets ─────────────────────────────────────────────────────────────────

describe('workflowPresets', () => {
  it('returns 4 checkpoints', () => {
    const presets = workflowPresets('task')
    expect(presets).toHaveLength(4)
    expect(presets.map((p) => p.name)).toEqual([
      "session.currentMode === 'task'",
      'git: new commit created',
      'git: working tree is clean',
      'kata can-exit: exits 0',
    ])
  })
})

describe('workflowPresetsWithPush', () => {
  it('returns 5 checkpoints (workflow + pushed)', () => {
    const presets = workflowPresetsWithPush('implementation')
    expect(presets).toHaveLength(5)
    expect(presets[4].name).toBe('git: changes pushed to remote')
  })
})

describe('planningPresets', () => {
  it('returns 9 checkpoints', () => {
    const presets = planningPresets()
    expect(presets).toHaveLength(9)
    const names = presets.map((p) => p.name)
    expect(names).toContain('spec file created')
    expect(names).toContain('spec frontmatter: status: approved')
    expect(names).toContain('spec contains behavior sections')
    expect(names).toContain('planning mode in session history')
  })
})

describe('liveWorkflowPresets', () => {
  it('returns 5 checkpoints', () => {
    const presets = liveWorkflowPresets('task')
    expect(presets).toHaveLength(5)
    expect(presets.map((p) => p.name)).toEqual([
      'session state initialized with mode',
      "session.currentMode === 'task'",
      'git: new commit since baseline',
      'git: working tree is clean',
      'kata can-exit: exits 0',
    ])
  })
})

describe('onboardPresets', () => {
  it('returns 4 checkpoints', () => {
    expect(onboardPresets).toHaveLength(4)
    const names = onboardPresets.map((p) => p.name)
    expect(names).toContain('git repository initialized')
    expect(names).toContain('.claude/settings.json exists with hooks')
    expect(names).toContain('wm.yaml exists')
    expect(names).toContain('mode templates seeded')
  })
})

// ─── Task Discipline Assertions ──────────────────────────────────────────────

describe('assertAllNativeTasksCompleted', () => {
  it('fails when no sessionId', async () => {
    const ctx = mockContext({})
    const result = await assertAllNativeTasksCompleted().assert(ctx)
    expect(result).toContain('No sessionId')
  })
})

describe('assertNoTaskCreateCalls', () => {
  it('fails when no transcriptPath', async () => {
    const ctx = mockContext({})
    const result = await assertNoTaskCreateCalls().assert(ctx)
    expect(result).toContain('No transcriptPath')
  })

  it('fails when transcript cannot be read', async () => {
    const ctx = mockContext({ transcriptPath: '/nonexistent/path.jsonl' })
    const result = await assertNoTaskCreateCalls().assert(ctx)
    expect(result).toContain('Cannot read transcript')
  })
})

describe('assertNativeTaskCount', () => {
  it('fails when no sessionId', async () => {
    const ctx = mockContext({})
    const result = await assertNativeTaskCount(3).assert(ctx)
    expect(result).toContain('No sessionId')
  })
})

describe('assertTaskDependencyOrderRespected', () => {
  it('fails when no sessionId', async () => {
    const ctx = mockContext({})
    const result = await assertTaskDependencyOrderRespected().assert(ctx)
    expect(result).toContain('No sessionId')
  })
})

// ─── Task Discipline Presets ─────────────────────────────────────────────────

describe('taskDisciplinePresets', () => {
  it('returns 4 checkpoints', () => {
    const presets = taskDisciplinePresets()
    expect(presets).toHaveLength(4)
    expect(presets.map((p) => p.name)).toEqual([
      'native task count >= 3',
      'no TaskCreate calls in transcript',
      'all native tasks completed',
      'task dependency order respected',
    ])
  })
})

describe('liveTaskDisciplinePresets', () => {
  it('returns 9 checkpoints (live workflow + task discipline)', () => {
    const presets = liveTaskDisciplinePresets('task')
    expect(presets).toHaveLength(9)
    const names = presets.map((p) => p.name)
    // live workflow (5)
    expect(names).toContain('session state initialized with mode')
    expect(names).toContain("session.currentMode === 'task'")
    expect(names).toContain('git: new commit since baseline')
    expect(names).toContain('git: working tree is clean')
    expect(names).toContain('kata can-exit: exits 0')
    // task discipline (4)
    expect(names).toContain('native task count >= 3')
    expect(names).toContain('no TaskCreate calls in transcript')
    expect(names).toContain('all native tasks completed')
    expect(names).toContain('task dependency order respected')
  })
})

// ─── Stop Hook Assertions ────────────────────────────────────────────────────

describe('assertStopHookBlocked', () => {
  it('fails when no sessionId', async () => {
    const ctx = mockContext({})
    const result = await assertStopHookBlocked().assert(ctx)
    expect(result).toContain('No sessionId')
  })

  it('fails when no log entries found', async () => {
    const ctx = mockContext({ sessionId: 'test-session-123' })
    const result = await assertStopHookBlocked().assert(ctx)
    expect(result).toContain('No stop hook log entries')
  })

  it('passes when log has block entries', async () => {
    const logContent = [
      '{"ts":"2026-01-01T00:00:00Z","decision":"block","reasons":["3 task(s) still pending"]}',
      '{"ts":"2026-01-01T00:01:00Z","decision":"allow","reasons":[],"note":"all conditions met"}',
    ].join('\n')
    const ctx = mockContext({
      sessionId: 'test-session-123',
      files: { '.kata/sessions/test-session-123/stop-hook.log.jsonl': logContent },
    })
    const result = await assertStopHookBlocked(1).assert(ctx)
    expect(result).toBeNull()
  })

  it('fails when not enough blocks', async () => {
    const logContent = '{"ts":"2026-01-01T00:00:00Z","decision":"allow","reasons":[],"note":"all conditions met"}'
    const ctx = mockContext({
      sessionId: 'test-session-123',
      files: { '.kata/sessions/test-session-123/stop-hook.log.jsonl': logContent },
    })
    const result = await assertStopHookBlocked(1).assert(ctx)
    expect(result).toContain('Expected stop hook to block >= 1')
  })
})

describe('assertStopHookBlockedWithReason', () => {
  it('passes when reason matches string pattern', async () => {
    const logContent = '{"ts":"2026-01-01T00:00:00Z","decision":"block","reasons":["3 task(s) still pending"]}'
    const ctx = mockContext({
      sessionId: 'test-session-123',
      files: { '.kata/sessions/test-session-123/stop-hook.log.jsonl': logContent },
    })
    const result = await assertStopHookBlockedWithReason('pending').assert(ctx)
    expect(result).toBeNull()
  })

  it('passes when reason matches regex', async () => {
    const logContent = '{"ts":"2026-01-01T00:00:00Z","decision":"block","reasons":["5 task(s) still pending"]}'
    const ctx = mockContext({
      sessionId: 'test-session-123',
      files: { '.kata/sessions/test-session-123/stop-hook.log.jsonl': logContent },
    })
    const result = await assertStopHookBlockedWithReason(/task.*pending/i).assert(ctx)
    expect(result).toBeNull()
  })

  it('fails when no block has matching reason', async () => {
    const logContent = '{"ts":"2026-01-01T00:00:00Z","decision":"block","reasons":["Uncommitted changes"]}'
    const ctx = mockContext({
      sessionId: 'test-session-123',
      files: { '.kata/sessions/test-session-123/stop-hook.log.jsonl': logContent },
    })
    const result = await assertStopHookBlockedWithReason('pending').assert(ctx)
    expect(result).toContain("No stop hook block had reason matching 'pending'")
  })

  it('fails when hook never blocked', async () => {
    const logContent = '{"ts":"2026-01-01T00:00:00Z","decision":"allow","reasons":[]}'
    const ctx = mockContext({
      sessionId: 'test-session-123',
      files: { '.kata/sessions/test-session-123/stop-hook.log.jsonl': logContent },
    })
    const result = await assertStopHookBlockedWithReason('pending').assert(ctx)
    expect(result).toContain('Stop hook never blocked')
  })
})

describe('assertStopHookEventuallyAllowed', () => {
  it('passes when last entry is allow', async () => {
    const logContent = [
      '{"ts":"2026-01-01T00:00:00Z","decision":"block","reasons":["pending"]}',
      '{"ts":"2026-01-01T00:01:00Z","decision":"allow","reasons":[],"note":"all conditions met"}',
    ].join('\n')
    const ctx = mockContext({
      sessionId: 'test-session-123',
      files: { '.kata/sessions/test-session-123/stop-hook.log.jsonl': logContent },
    })
    const result = await assertStopHookEventuallyAllowed().assert(ctx)
    expect(result).toBeNull()
  })

  it('fails when last entry is block', async () => {
    const logContent = '{"ts":"2026-01-01T00:00:00Z","decision":"block","reasons":["pending"]}'
    const ctx = mockContext({
      sessionId: 'test-session-123',
      files: { '.kata/sessions/test-session-123/stop-hook.log.jsonl': logContent },
    })
    const result = await assertStopHookEventuallyAllowed().assert(ctx)
    expect(result).toContain("Last stop hook decision was 'block'")
  })
})

describe('stopHookPresets', () => {
  it('returns 3 checkpoints', () => {
    const presets = stopHookPresets()
    expect(presets).toHaveLength(3)
    expect(presets.map((p) => p.name)).toEqual([
      'stop hook blocked >= 1 time(s)',
      'stop hook blocked with reason: task.*pending',
      'stop hook eventually allowed exit',
    ])
  })
})
