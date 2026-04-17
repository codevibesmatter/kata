import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import * as os from 'node:os'

function makeTmpDir(): string {
  const dir = join(os.tmpdir(), `wm-hook-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  mkdirSync(dir, { recursive: true })
  return dir
}

/**
 * Helper: capture stdout output from a handler call
 */
async function captureStdout(fn: () => Promise<void>): Promise<string> {
  let captured = ''
  const origWrite = process.stdout.write
  process.stdout.write = (chunk: string | Uint8Array): boolean => {
    captured += typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk)
    return true
  }
  try {
    await fn()
  } finally {
    process.stdout.write = origWrite
  }
  return captured
}

/**
 * Helper: capture stderr output from a function call
 */
async function captureStderr(fn: () => Promise<void>): Promise<string> {
  let captured = ''
  const origWrite = process.stderr.write
  process.stderr.write = (chunk: string | Uint8Array): boolean => {
    captured += typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk)
    return true
  }
  try {
    await fn()
  } finally {
    process.stderr.write = origWrite
  }
  return captured
}

/** Write a minimal session state.json */
function writeSessionState(
  tmpDir: string,
  sessionId: string,
  overrides: Record<string, unknown> = {},
): void {
  const sessionDir = join(tmpDir, '.claude', 'sessions', sessionId)
  mkdirSync(sessionDir, { recursive: true })
  writeFileSync(
    join(sessionDir, 'state.json'),
    JSON.stringify({
      sessionId,
      sessionType: 'default',
      currentMode: 'default',
      completedPhases: [],
      phases: [],
      modeHistory: [],
      modeState: {},
      beadsCreated: [],
      editedFiles: [],
      ...overrides,
    }),
  )
}

/** Parse hook log entries from hooks.log.jsonl */
function readHookLog(tmpDir: string, sessionId: string): Array<Record<string, unknown>> {
  const logPath = join(tmpDir, '.claude', 'sessions', sessionId, 'hooks.log.jsonl')
  if (!existsSync(logPath)) return []
  return readFileSync(logPath, 'utf-8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line))
}

describe('hook dispatch', () => {
  let tmpDir: string
  const origEnv = process.env.CLAUDE_PROJECT_DIR

  beforeEach(() => {
    tmpDir = makeTmpDir()
    mkdirSync(join(tmpDir, '.claude', 'sessions'), { recursive: true })
    mkdirSync(join(tmpDir, '.claude', 'workflows'), { recursive: true })
    process.env.CLAUDE_PROJECT_DIR = tmpDir
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
    if (origEnv !== undefined) {
      process.env.CLAUDE_PROJECT_DIR = origEnv
    } else {
      delete process.env.CLAUDE_PROJECT_DIR
    }
    process.exitCode = undefined
  })

  it('unknown hook name sets exit code 1', async () => {
    const { hook } = await import('./hook.js')
    const stderr = await captureStderr(() => hook(['nonexistent-hook']))
    expect(process.exitCode).toBe(1)
    expect(stderr).toContain('Unknown hook')
  })

  it('no hook name sets exit code 1', async () => {
    const { hook } = await import('./hook.js')
    const stderr = await captureStderr(() => hook([]))
    expect(process.exitCode).toBe(1)
    expect(stderr).toContain('Usage: kata hook <name>')
  })
})

describe('handleModeGate', () => {
  let tmpDir: string
  const sessionId = '00000000-0000-0000-0000-000000000001'
  const origEnv = process.env.CLAUDE_PROJECT_DIR

  beforeEach(() => {
    tmpDir = makeTmpDir()
    mkdirSync(join(tmpDir, '.claude', 'sessions'), { recursive: true })
    mkdirSync(join(tmpDir, '.claude', 'workflows'), { recursive: true })
    process.env.CLAUDE_PROJECT_DIR = tmpDir
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
    if (origEnv !== undefined) {
      process.env.CLAUDE_PROJECT_DIR = origEnv
    } else {
      delete process.env.CLAUDE_PROJECT_DIR
    }
  })

  it('denies Write tool when in default mode', async () => {
    writeSessionState(tmpDir, sessionId, { currentMode: 'default' })
    const { handleModeGate } = await import('./hook.js')

    const output = await captureStdout(() =>
      handleModeGate({ session_id: sessionId, tool_name: 'Write', tool_input: {} }),
    )
    const parsed = JSON.parse(output.trim())
    expect(parsed.hookSpecificOutput.permissionDecision).toBe('deny')
    expect(parsed.hookSpecificOutput.permissionDecisionReason).toContain('Enter a mode first')
  })

  it('denies Edit tool when in default mode', async () => {
    writeSessionState(tmpDir, sessionId, { currentMode: 'default' })
    const { handleModeGate } = await import('./hook.js')

    const output = await captureStdout(() =>
      handleModeGate({ session_id: sessionId, tool_name: 'Edit', tool_input: {} }),
    )
    const parsed = JSON.parse(output.trim())
    expect(parsed.hookSpecificOutput.permissionDecision).toBe('deny')
  })

  it('denies MultiEdit tool when in default mode', async () => {
    writeSessionState(tmpDir, sessionId, { currentMode: 'default' })
    const { handleModeGate } = await import('./hook.js')

    const output = await captureStdout(() =>
      handleModeGate({ session_id: sessionId, tool_name: 'MultiEdit', tool_input: {} }),
    )
    const parsed = JSON.parse(output.trim())
    expect(parsed.hookSpecificOutput.permissionDecision).toBe('deny')
  })

  it('allows Write tool when mode is active', async () => {
    writeSessionState(tmpDir, sessionId, { currentMode: 'task', sessionType: 'task' })
    const { handleModeGate } = await import('./hook.js')

    const output = await captureStdout(() =>
      handleModeGate({ session_id: sessionId, tool_name: 'Write', tool_input: {} }),
    )
    const parsed = JSON.parse(output.trim())
    expect(parsed.hookSpecificOutput.permissionDecision).toBe('allow')
  })

  it('allows Read tool even in default mode', async () => {
    writeSessionState(tmpDir, sessionId, { currentMode: 'default' })
    const { handleModeGate } = await import('./hook.js')

    const output = await captureStdout(() =>
      handleModeGate({ session_id: sessionId, tool_name: 'Read', tool_input: {} }),
    )
    const parsed = JSON.parse(output.trim())
    expect(parsed.hookSpecificOutput.permissionDecision).toBe('allow')
  })

  it('allows Glob/Grep in default mode', async () => {
    writeSessionState(tmpDir, sessionId, { currentMode: 'default' })
    const { handleModeGate } = await import('./hook.js')

    const output = await captureStdout(() =>
      handleModeGate({ session_id: sessionId, tool_name: 'Glob', tool_input: {} }),
    )
    const parsed = JSON.parse(output.trim())
    expect(parsed.hookSpecificOutput.permissionDecision).toBe('allow')
  })

  it('allows when no session state exists', async () => {
    const { handleModeGate } = await import('./hook.js')

    const output = await captureStdout(() =>
      handleModeGate({ session_id: 'nonexistent-session', tool_name: 'Write', tool_input: {} }),
    )
    const parsed = JSON.parse(output.trim())
    expect(parsed.hookSpecificOutput.permissionDecision).toBe('allow')
  })

  it('injects --session into kata bash commands', async () => {
    const { handleModeGate } = await import('./hook.js')

    const output = await captureStdout(() =>
      handleModeGate({
        session_id: sessionId,
        tool_name: 'Bash',
        tool_input: { command: 'kata enter task' },
      }),
    )
    const parsed = JSON.parse(output.trim())
    expect(parsed.hookSpecificOutput.permissionDecision).toBe('allow')
    expect(parsed.hookSpecificOutput.updatedInput.command).toContain(`--session=${sessionId}`)
  })

  it('does not inject --session into non-kata bash commands', async () => {
    writeSessionState(tmpDir, sessionId, { currentMode: 'task' })
    const { handleModeGate } = await import('./hook.js')

    const output = await captureStdout(() =>
      handleModeGate({
        session_id: sessionId,
        tool_name: 'Bash',
        tool_input: { command: 'npm run build' },
      }),
    )
    const parsed = JSON.parse(output.trim())
    expect(parsed.hookSpecificOutput.permissionDecision).toBe('allow')
    expect(parsed.hookSpecificOutput.updatedInput).toBeUndefined()
  })

  it('does not inject --session into kata hook commands', async () => {
    const { handleModeGate } = await import('./hook.js')

    const output = await captureStdout(() =>
      handleModeGate({
        session_id: sessionId,
        tool_name: 'Bash',
        tool_input: { command: 'kata hook mode-gate' },
      }),
    )
    const parsed = JSON.parse(output.trim())
    // kata hook commands should not get session injected (avoid recursion)
    expect(parsed.hookSpecificOutput.updatedInput).toBeUndefined()
  })

  it('logs deny decision to hooks.log.jsonl', async () => {
    writeSessionState(tmpDir, sessionId, { currentMode: 'default' })
    const { handleModeGate } = await import('./hook.js')

    await captureStdout(() =>
      handleModeGate({ session_id: sessionId, tool_name: 'Write', tool_input: {} }),
    )

    const log = readHookLog(tmpDir, sessionId)
    const denyEntry = log.find((e) => e.hook === 'mode-gate' && e.decision === 'deny')
    expect(denyEntry).toBeDefined()
    expect(denyEntry!.tool).toBe('Write')
  })

  it('logs allow decision to hooks.log.jsonl', async () => {
    writeSessionState(tmpDir, sessionId, { currentMode: 'task' })
    const { handleModeGate } = await import('./hook.js')

    await captureStdout(() =>
      handleModeGate({ session_id: sessionId, tool_name: 'Read', tool_input: {} }),
    )

    const log = readHookLog(tmpDir, sessionId)
    const allowEntry = log.find((e) => e.hook === 'mode-gate' && e.decision === 'allow')
    expect(allowEntry).toBeDefined()
    expect(allowEntry!.tool).toBe('Read')
  })
})

describe('handleTaskEvidence', () => {
  let tmpDir: string
  const sessionId = '00000000-0000-0000-0000-000000000002'
  const origEnv = process.env.CLAUDE_PROJECT_DIR

  beforeEach(() => {
    tmpDir = makeTmpDir()
    mkdirSync(join(tmpDir, '.claude', 'sessions'), { recursive: true })
    mkdirSync(join(tmpDir, '.claude', 'workflows'), { recursive: true })
    process.env.CLAUDE_PROJECT_DIR = tmpDir
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
    if (origEnv !== undefined) {
      process.env.CLAUDE_PROJECT_DIR = origEnv
    } else {
      delete process.env.CLAUDE_PROJECT_DIR
    }
  })

  it('always allows (advisory only)', async () => {
    const { handleTaskEvidence } = await import('./hook.js')

    const output = await captureStdout(() => handleTaskEvidence({ session_id: sessionId }))
    const parsed = JSON.parse(output.trim())
    expect(parsed.hookSpecificOutput.permissionDecision).toBe('allow')
  })

  it('logs to hooks.log.jsonl', async () => {
    writeSessionState(tmpDir, sessionId)
    const { handleTaskEvidence } = await import('./hook.js')

    await captureStdout(() => handleTaskEvidence({ session_id: sessionId }))

    const log = readHookLog(tmpDir, sessionId)
    const entry = log.find((e) => e.hook === 'task-evidence')
    expect(entry).toBeDefined()
    expect(entry!.decision).toBe('allow')
  })
})

describe('handleTaskDeps', () => {
  let tmpDir: string
  const sessionId = '00000000-0000-0000-0000-000000000003'
  const origEnv = process.env.CLAUDE_PROJECT_DIR

  beforeEach(() => {
    tmpDir = makeTmpDir()
    mkdirSync(join(tmpDir, '.claude', 'sessions'), { recursive: true })
    mkdirSync(join(tmpDir, '.claude', 'workflows'), { recursive: true })
    process.env.CLAUDE_PROJECT_DIR = tmpDir
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
    if (origEnv !== undefined) {
      process.env.CLAUDE_PROJECT_DIR = origEnv
    } else {
      delete process.env.CLAUDE_PROJECT_DIR
    }
  })

  it('allows when status is not completed', async () => {
    const { handleTaskDeps } = await import('./hook.js')

    const output = await captureStdout(() =>
      handleTaskDeps({
        session_id: sessionId,
        tool_input: { taskId: '1', status: 'in_progress' },
      }),
    )
    const parsed = JSON.parse(output.trim())
    expect(parsed.hookSpecificOutput.permissionDecision).toBe('allow')
  })

  it('allows when no session state exists', async () => {
    const { handleTaskDeps } = await import('./hook.js')

    const output = await captureStdout(() =>
      handleTaskDeps({
        session_id: sessionId,
        tool_input: { taskId: '1', status: 'completed' },
      }),
    )
    const parsed = JSON.parse(output.trim())
    expect(parsed.hookSpecificOutput.permissionDecision).toBe('allow')
  })

  it('allows when no taskId provided', async () => {
    const { handleTaskDeps } = await import('./hook.js')

    const output = await captureStdout(() =>
      handleTaskDeps({ session_id: sessionId, tool_input: {} }),
    )
    const parsed = JSON.parse(output.trim())
    expect(parsed.hookSpecificOutput.permissionDecision).toBe('allow')
  })
})

describe('logHook', () => {
  let tmpDir: string
  const sessionId = '00000000-0000-0000-0000-000000000004'
  const origEnv = process.env.CLAUDE_PROJECT_DIR

  beforeEach(() => {
    tmpDir = makeTmpDir()
    mkdirSync(join(tmpDir, '.claude', 'sessions'), { recursive: true })
    mkdirSync(join(tmpDir, '.claude', 'workflows'), { recursive: true })
    process.env.CLAUDE_PROJECT_DIR = tmpDir
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
    if (origEnv !== undefined) {
      process.env.CLAUDE_PROJECT_DIR = origEnv
    } else {
      delete process.env.CLAUDE_PROJECT_DIR
    }
  })

  it('creates hooks.log.jsonl with structured entry', async () => {
    const { logHook } = await import('./hook.js')

    logHook(sessionId, { hook: 'test-hook', decision: 'allow', note: 'test entry' })

    const log = readHookLog(tmpDir, sessionId)
    expect(log).toHaveLength(1)
    expect(log[0].hook).toBe('test-hook')
    expect(log[0].decision).toBe('allow')
    expect(log[0].note).toBe('test entry')
    expect(log[0].ts).toBeDefined()
  })

  it('appends multiple entries', async () => {
    const { logHook } = await import('./hook.js')

    logHook(sessionId, { hook: 'hook-1', decision: 'allow' })
    logHook(sessionId, { hook: 'hook-2', decision: 'deny' })
    logHook(sessionId, { hook: 'hook-3', decision: 'block' })

    const log = readHookLog(tmpDir, sessionId)
    expect(log).toHaveLength(3)
    expect(log.map((e) => e.hook)).toEqual(['hook-1', 'hook-2', 'hook-3'])
  })
})

describe('hasActiveBackgroundAgents', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = makeTmpDir()
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  function writeTranscript(lines: Array<Record<string, unknown>>): string {
    const path = join(tmpDir, 'transcript.jsonl')
    writeFileSync(path, lines.map((l) => JSON.stringify(l)).join('\n'))
    return path
  }

  it('returns false for undefined transcript path', async () => {
    const { hasActiveBackgroundAgents } = await import('./hook.js')
    expect(hasActiveBackgroundAgents(undefined)).toBe(false)
  })

  it('returns false for nonexistent transcript', async () => {
    const { hasActiveBackgroundAgents } = await import('./hook.js')
    expect(hasActiveBackgroundAgents('/nonexistent/path.jsonl')).toBe(false)
  })

  it('returns false when all Agent calls have matching results', async () => {
    const { hasActiveBackgroundAgents } = await import('./hook.js')
    const path = writeTranscript([
      { type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Agent', id: 'agent-1' }] } },
      { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'agent-1' }] } },
      { type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Agent', id: 'agent-2' }] } },
      { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'agent-2' }] } },
    ])
    expect(hasActiveBackgroundAgents(path)).toBe(false)
  })

  it('returns true when Agent call has no matching result', async () => {
    const { hasActiveBackgroundAgents } = await import('./hook.js')
    const path = writeTranscript([
      { type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Agent', id: 'agent-1' }] } },
      { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'agent-1' }] } },
      { type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Agent', id: 'agent-2' }] } },
      // No tool_result for agent-2 — still active
    ])
    expect(hasActiveBackgroundAgents(path)).toBe(true)
  })

  it('returns false when no Agent calls exist (other tools matched)', async () => {
    const { hasActiveBackgroundAgents } = await import('./hook.js')
    const path = writeTranscript([
      { type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Bash', id: 'bash-1' }] } },
      { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'bash-1' }] } },
    ])
    expect(hasActiveBackgroundAgents(path)).toBe(false)
  })

  it('ignores non-Agent unmatched tool calls', async () => {
    const { hasActiveBackgroundAgents } = await import('./hook.js')
    const path = writeTranscript([
      { type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Bash', id: 'bash-1' }] } },
      // No result for bash-1, but it's not an Agent call
    ])
    expect(hasActiveBackgroundAgents(path)).toBe(false)
  })

  it('handles multiple active agents', async () => {
    const { hasActiveBackgroundAgents } = await import('./hook.js')
    const path = writeTranscript([
      { type: 'assistant', message: { content: [
        { type: 'tool_use', name: 'Agent', id: 'agent-1' },
        { type: 'tool_use', name: 'Agent', id: 'agent-2' },
        { type: 'tool_use', name: 'Agent', id: 'agent-3' },
      ] } },
      { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'agent-1' }] } },
      // agent-2 and agent-3 still active
    ])
    expect(hasActiveBackgroundAgents(path)).toBe(true)
  })

  it('returns false for empty transcript', async () => {
    const { hasActiveBackgroundAgents } = await import('./hook.js')
    const path = writeTranscript([])
    expect(hasActiveBackgroundAgents(path)).toBe(false)
  })

  it('returns false when unmatched Agents are followed by a new user prompt', async () => {
    const { hasActiveBackgroundAgents } = await import('./hook.js')
    const path = writeTranscript([
      { type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Agent', id: 'agent-1' }] } },
      // User sends a new message (not a tool_result) — agent-1 is now stale
      { type: 'user', message: { content: [{ type: 'text', text: 'do something else' }] } },
    ])
    expect(hasActiveBackgroundAgents(path)).toBe(false)
  })

  it('returns true for unmatched Agent with no subsequent user prompt', async () => {
    const { hasActiveBackgroundAgents } = await import('./hook.js')
    const path = writeTranscript([
      { type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Agent', id: 'agent-1' }] } },
      // Only tool_results follow, no new user prompt — agent is still active
      { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'other-tool' }] } },
    ])
    expect(hasActiveBackgroundAgents(path)).toBe(true)
  })

  it('reproduces issue #60: stale unmatched Agents cleared by user prompt, recent matched Agent → false', async () => {
    const { hasActiveBackgroundAgents } = await import('./hook.js')
    const path = writeTranscript([
      // Stale agents from earlier conversation
      { type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Agent', id: 'stale-1' }] } },
      { type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Agent', id: 'stale-2' }] } },
      { type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Agent', id: 'stale-3' }] } },
      // User sent a new prompt — clears all stale agent IDs
      { type: 'user', message: { content: [{ type: 'text', text: 'continue' }] } },
      // New agent spawned and completed
      { type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Agent', id: 'recent-1' }] } },
      { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'recent-1' }] } },
    ])
    expect(hasActiveBackgroundAgents(path)).toBe(false)
  })

  it('returns true when current-turn Agent is active alongside stale ones cleared by user prompt', async () => {
    const { hasActiveBackgroundAgents } = await import('./hook.js')
    const path = writeTranscript([
      // Stale agent
      { type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Agent', id: 'stale-1' }] } },
      // User prompt clears stale
      { type: 'user', message: { content: [{ type: 'text', text: 'now do this' }] } },
      // New agent still running
      { type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Agent', id: 'recent-1' }] } },
    ])
    expect(hasActiveBackgroundAgents(path)).toBe(true)
  })

  it('long-running agent stays active without time-based expiry', async () => {
    const { hasActiveBackgroundAgents } = await import('./hook.js')
    // Agent spawned with no user prompt after — should stay active regardless of time
    const path = writeTranscript([
      { type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Agent', id: 'agent-1' }] } },
    ])
    expect(hasActiveBackgroundAgents(path)).toBe(true)
  })
})
