/**
 * Tests for the eval harness — pure unit tests focused on invariants.
 *
 * Does NOT spawn Claude Agent SDK queries; only verifies:
 *   - runScenario invariants (mutual exclusivity of prompt/agents)
 *   - buildContext behavior (default latest vs. explicit sessionId)
 */

import { describe, it, expect, afterAll } from 'bun:test'
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { runScenario, buildContext } from './harness.js'
import type { EvalScenario } from './harness.js'

// Track temp dirs to clean up at end
const tmpDirs: string[] = []

afterAll(() => {
  for (const dir of tmpDirs) {
    try {
      rmSync(dir, { recursive: true, force: true })
    } catch {
      // ignore
    }
  }
})

function makeTmpProject(): string {
  const dir = mkdtempSync(join(tmpdir(), 'kata-harness-'))
  tmpDirs.push(dir)
  return dir
}

// Integration test for the full two-agent query() dispatch is deferred
// to the live eval run (VP1 in spec 64). Unit-testing SDK dispatch
// requires invasive stubbing; VP1 validates this end-to-end.

describe('runScenario invariants', () => {
  it('throws when both prompt and agents are set', async () => {
    const scenario: EvalScenario = {
      id: 'invalid-both',
      name: 'invalid: both prompt and agents',
      prompt: 'do a thing',
      agents: [{ prompt: 'agent prompt' }],
      checkpoints: [],
    }
    await expect(runScenario(scenario)).rejects.toThrow(
      'EvalScenario must define exactly one of prompt or agents',
    )
  })

  it('throws when neither prompt nor agents is set', async () => {
    const scenario: EvalScenario = {
      id: 'invalid-neither',
      name: 'invalid: neither prompt nor agents',
      checkpoints: [],
    }
    await expect(runScenario(scenario)).rejects.toThrow(
      'EvalScenario must define exactly one of prompt or agents',
    )
  })

  it('throws when agents is set to an empty array and no prompt', async () => {
    const scenario: EvalScenario = {
      id: 'invalid-empty-agents',
      name: 'invalid: empty agents',
      agents: [],
      checkpoints: [],
    }
    await expect(runScenario(scenario)).rejects.toThrow(
      'EvalScenario must define exactly one of prompt or agents',
    )
  })
})

describe('buildContext.getSessionState', () => {
  it('default scan returns the most recently updated session', () => {
    const projectDir = makeTmpProject()
    const sessionsDir = join(projectDir, '.kata', 'sessions')

    mkdirSync(join(sessionsDir, 'session-a'), { recursive: true })
    mkdirSync(join(sessionsDir, 'session-b'), { recursive: true })

    writeFileSync(
      join(sessionsDir, 'session-a', 'state.json'),
      JSON.stringify({
        sessionId: 'session-a',
        currentMode: 'task',
        updatedAt: '2026-01-01T00:00:00Z',
      }),
    )
    writeFileSync(
      join(sessionsDir, 'session-b', 'state.json'),
      JSON.stringify({
        sessionId: 'session-b',
        currentMode: 'planning',
        updatedAt: '2026-01-02T00:00:00Z',
      }),
    )

    const ctx = buildContext(projectDir)
    const state = ctx.getSessionState()
    expect(state).not.toBeNull()
    expect(state?.sessionId).toBe('session-b')
    expect(state?.currentMode).toBe('planning')
  })

  it('returns the specific session when sessionId is provided', () => {
    const projectDir = makeTmpProject()
    const sessionsDir = join(projectDir, '.kata', 'sessions')

    mkdirSync(join(sessionsDir, 'session-a'), { recursive: true })
    mkdirSync(join(sessionsDir, 'session-b'), { recursive: true })

    writeFileSync(
      join(sessionsDir, 'session-a', 'state.json'),
      JSON.stringify({
        sessionId: 'session-a',
        currentMode: 'task',
        updatedAt: '2026-01-01T00:00:00Z',
      }),
    )
    writeFileSync(
      join(sessionsDir, 'session-b', 'state.json'),
      JSON.stringify({
        sessionId: 'session-b',
        currentMode: 'planning',
        updatedAt: '2026-01-02T00:00:00Z',
      }),
    )

    const ctx = buildContext(projectDir)
    // Explicit sessionId returns the earlier (a) even though (b) was updated later
    const stateA = ctx.getSessionState('session-a')
    expect(stateA).not.toBeNull()
    expect(stateA?.sessionId).toBe('session-a')
    expect(stateA?.currentMode).toBe('task')
  })

  it('returns null for unknown sessionId', () => {
    const projectDir = makeTmpProject()
    const sessionsDir = join(projectDir, '.kata', 'sessions')
    mkdirSync(join(sessionsDir, 'session-a'), { recursive: true })
    writeFileSync(
      join(sessionsDir, 'session-a', 'state.json'),
      JSON.stringify({ sessionId: 'session-a', currentMode: 'task', updatedAt: '2026-01-01T00:00:00Z' }),
    )

    const ctx = buildContext(projectDir)
    const state = ctx.getSessionState('does-not-exist')
    expect(state).toBeNull()
  })

  it('startSha is exposed on the context', () => {
    const projectDir = makeTmpProject()
    const ctx = buildContext(projectDir, null, null, null, 'abc123')
    expect(ctx.startSha).toBe('abc123')
  })
})
