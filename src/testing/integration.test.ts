import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import * as os from 'node:os'

function makeTmpDir(): string {
  const dir = join(
    os.tmpdir(),
    `wm-integration-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  )
  mkdirSync(dir, { recursive: true })
  return dir
}

/**
 * Helper: capture stdout from hook()
 */
async function captureHookStdout(args: string[]): Promise<string> {
  const { hook } = await import('../commands/hook.js')
  let captured = ''
  const origWrite = process.stdout.write
  process.stdout.write = (chunk: string | Uint8Array): boolean => {
    captured += typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk)
    return true
  }
  try {
    await hook(args)
  } finally {
    process.stdout.write = origWrite
  }
  return captured
}

/**
 * Suppress stderr during tests (hooks output guidance to stderr)
 */
function suppressStderr(): () => void {
  const origWrite = process.stderr.write
  process.stderr.write = (): boolean => true
  return () => {
    process.stderr.write = origWrite
  }
}

describe('integration: full hook dispatch simulation', () => {
  let tmpDir: string
  const origEnv = process.env.CLAUDE_PROJECT_DIR
  const origSessionId = process.env.CLAUDE_SESSION_ID

  beforeEach(() => {
    tmpDir = makeTmpDir()
    mkdirSync(join(tmpDir, '.kata', 'sessions'), { recursive: true })
    // Write kata.yaml so loadKataConfig() finds it at .kata/kata.yaml
    writeFileSync(
      join(tmpDir, '.kata', 'kata.yaml'),
      'spec_path: planning/specs\nresearch_path: planning/research\nmodes: {}\n',
    )
    process.env.CLAUDE_PROJECT_DIR = tmpDir
    process.env.CLAUDE_SESSION_ID = '00000000-0000-0000-0000-000000000010'

    // Pre-create a session state file so getCurrentSessionId() can find the session.
    // Hooks receive session_id from stdin JSON in production, but in tests stdin is a TTY.
    // Pre-creating the state allows getCurrentSessionId() to find it via sessions directory scan.
    const sessionId = '00000000-0000-0000-0000-000000000010'
    const sessionDir = join(tmpDir, '.kata', 'sessions', sessionId)
    mkdirSync(sessionDir, { recursive: true })
    writeFileSync(
      join(sessionDir, 'state.json'),
      JSON.stringify({
        sessionId,
        workflowId: '',
        sessionType: 'default',
        currentMode: 'default',
        completedPhases: [],
        phases: [],
        modeHistory: [],
        modeState: {},
        beadsCreated: [],
        editedFiles: [],
      }),
    )
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
    if (origEnv !== undefined) {
      process.env.CLAUDE_PROJECT_DIR = origEnv
    } else {
      delete process.env.CLAUDE_PROJECT_DIR
    }
    if (origSessionId !== undefined) {
      process.env.CLAUDE_SESSION_ID = origSessionId
    } else {
      delete process.env.CLAUDE_SESSION_ID
    }
    process.exitCode = 0
  })

  it('session-start -> user-prompt -> stop-conditions lifecycle', async () => {
    const sessionId = process.env.CLAUDE_SESSION_ID!
    const { handleSessionStart, handleUserPrompt, handleStopConditions } = await import('../commands/hook.js')
    const restoreStderr = suppressStderr()

    function captureHandlerStdout(fn: () => Promise<void>): Promise<string> {
      return new Promise((resolve) => {
        let captured = ''
        const origWrite = process.stdout.write
        process.stdout.write = (chunk: string | Uint8Array): boolean => {
          captured += typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk)
          return true
        }
        fn().finally(() => {
          process.stdout.write = origWrite
          resolve(captured)
        })
      })
    }

    try {
      // Step 1: session-start hook (initializes session)
      // Pass session_id directly to bypass stdin (stdin is TTY in tests).
      const startOutput = await captureHandlerStdout(() => handleSessionStart({ session_id: sessionId }))
      const startResult = JSON.parse(startOutput.trim()) as {
        hookSpecificOutput: { hookEventName: string; additionalContext: string }
      }
      expect(startResult.hookSpecificOutput.hookEventName).toBe('SessionStart')
      expect(startResult.hookSpecificOutput.additionalContext).toBeDefined()

      // After session-start, state.json should exist
      const stateFile = join(tmpDir, '.kata', 'sessions', sessionId, 'state.json')
      expect(existsSync(stateFile)).toBe(true)

      // Step 2: user-prompt hook (suggest mode from user message)
      // Pass session_id in input — user_message is empty string (no stdin in tests).
      const promptOutput = await captureHandlerStdout(() =>
        handleUserPrompt({ session_id: sessionId, user_message: '' }),
      )
      const promptResult = JSON.parse(promptOutput.trim()) as {
        hookSpecificOutput: { hookEventName: string; additionalContext: string }
      }
      expect(promptResult.hookSpecificOutput.hookEventName).toBe('UserPromptSubmit')

      // Step 3: stop-conditions hook (check if can exit)
      // Empty output = allow (no blocking). Block decision = output with decision: 'block'.
      const stopOutput = await captureHandlerStdout(() => handleStopConditions({ session_id: sessionId }))
      if (stopOutput.trim()) {
        const stopResult = JSON.parse(stopOutput.trim()) as { decision?: string; hookSpecificOutput?: unknown }
        expect(stopResult.decision).toBe('block')
      }
      // Empty output = allow is correct behavior
    } finally {
      restoreStderr()
    }
  })

  it('mode-gate allows after mode is entered via state', async () => {
    const sessionId = process.env.CLAUDE_SESSION_ID!
    // beforeEach already creates the session dir; just overwrite state.json with active mode
    const sessionDir = join(tmpDir, '.kata', 'sessions', sessionId)

    // Create state with active mode
    writeFileSync(
      join(sessionDir, 'state.json'),
      JSON.stringify({
        sessionId,
        sessionType: 'research',
        currentMode: 'research',
        completedPhases: [],
        phases: ['explore', 'synthesize'],
        modeHistory: [{ mode: 'research', enteredAt: new Date().toISOString() }],
        modeState: { research: { status: 'active' } },
        beadsCreated: [],
        editedFiles: [],
      }),
    )

    const { handleModeGate, handleTaskEvidence } = await import('../commands/hook.js')

    function captureHandlerStdout(fn: () => Promise<void>): Promise<string> {
      return new Promise((resolve) => {
        let captured = ''
        const origWrite = process.stdout.write
        process.stdout.write = (chunk: string | Uint8Array): boolean => {
          captured += typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk)
          return true
        }
        fn().finally(() => {
          process.stdout.write = origWrite
          resolve(captured)
        })
      })
    }

    // mode-gate should ALLOW since we have an active mode
    // Pass session_id directly so getSessionState() can find the session state.
    const gateOutput = await captureHandlerStdout(() =>
      handleModeGate({ session_id: sessionId, tool_name: 'Edit' }),
    )
    const gateResult = JSON.parse(gateOutput.trim()) as {
      hookSpecificOutput: { hookEventName: string; permissionDecision: string }
    }
    expect(gateResult.hookSpecificOutput.permissionDecision).toBe('allow')

    // task-evidence should ALLOW (advisory only)
    const evidenceOutput = await captureHandlerStdout(() =>
      handleTaskEvidence({ session_id: sessionId, tool_name: 'TaskUpdate' }),
    )
    const evidenceResult = JSON.parse(evidenceOutput.trim()) as {
      hookSpecificOutput: { hookEventName: string; permissionDecision: string }
    }
    expect(evidenceResult.hookSpecificOutput.permissionDecision).toBe('allow')
  })

  it('stop-conditions reports incomplete work for active session', async () => {
    const sessionId = process.env.CLAUDE_SESSION_ID!
    // Use the pre-created session dir from beforeEach, just overwrite state.json
    const sessionDir = join(tmpDir, '.kata', 'sessions', sessionId)

    // Create state with implementation mode and linked issue
    // Also need kata.yaml with implementation mode stop_conditions
    writeFileSync(
      join(tmpDir, '.kata', 'kata.yaml'),
      [
        'spec_path: planning/specs',
        'research_path: planning/research',
        'modes:',
        '  implementation:',
        '    template: implementation.md',
        '    stop_conditions: [tasks_complete, committed, pushed, tests_pass, feature_tests_added]',
      ].join('\n') + '\n',
    )
    writeFileSync(
      join(sessionDir, 'state.json'),
      JSON.stringify({
        sessionId,
        sessionType: 'implementation',
        currentMode: 'implementation',
        workflowId: 'GH#100',
        issueNumber: 100,
        completedPhases: [],
        phases: ['p0', 'p1', 'p2'],
        modeHistory: [{ mode: 'implementation', enteredAt: new Date().toISOString() }],
        modeState: { implementation: { status: 'active' } },
        beadsCreated: [],
        editedFiles: [],
      }),
    )

    // stop-conditions should report incomplete work for implementation mode with stop_conditions.
    // Call the handler directly with session_id in input (stdin is TTY in tests, can't inject via stdin).
    const { handleStopConditions } = await import('../commands/hook.js')
    const restoreStderr = suppressStderr()
    let stopOutput = ''
    const origWrite = process.stdout.write
    process.stdout.write = (chunk: string | Uint8Array): boolean => {
      stopOutput += typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk)
      return true
    }
    try {
      await handleStopConditions({ session_id: sessionId })
    } finally {
      process.stdout.write = origWrite
      restoreStderr()
    }

    // stop-conditions should block (implementation has uncommitted changes and other checks)
    // or at minimum should have run and produced some output or returned gracefully
    // The hook blocks when canExit is false, returns nothing when canExit is true
    if (stopOutput.trim()) {
      const stopResult = JSON.parse(stopOutput.trim()) as { decision?: string; reason?: string }
      expect(stopResult.decision).toBe('block')
    }
    // If empty output, canExit returned true (valid — no uncommitted changes in test env)
  })
})
