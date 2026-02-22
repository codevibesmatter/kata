// kata init - Initialize session state
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { getCurrentSessionId, getStateFilePath } from '../session/lookup.js'
import { stateExists } from '../state/reader.js'
import { writeState } from '../state/writer.js'
import type { SessionState } from '../state/schema.js'

/**
 * Parse command line arguments for init command
 */
function parseArgs(args: string[]): {
  session?: string
  force?: boolean
} {
  const result: { session?: string; force?: boolean } = {}

  for (const arg of args) {
    if (arg.startsWith('--session=')) {
      result.session = arg.slice('--session='.length)
    } else if (arg === '--force') {
      result.force = true
    }
  }

  return result
}

/**
 * Create default state for new sessions
 */
function createDefaultState(sessionId: string): SessionState {
  return {
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
    todosWritten: false,
  }
}

/**
 * kata init [--session=SESSION_ID] [--force]
 * Initialize session state (called by SessionStart hook)
 * --force: Reset to default state even if state exists
 */
export async function init(args: string[]): Promise<void> {
  const parsed = parseArgs(args)

  const sessionId = parsed.session || (await getCurrentSessionId())
  const stateFile = await getStateFilePath(sessionId)

  // Create directory if needed
  await fs.mkdir(path.dirname(stateFile), { recursive: true })

  // Check if state exists and we're NOT forcing reset
  if (!parsed.force && (await stateExists(stateFile))) {
    // State exists, nothing to do (continuation/resume)
    // biome-ignore lint/suspicious/noConsole: intentional CLI output
    console.log(
      JSON.stringify(
        {
          success: true,
          sessionId,
          stateFile,
          action: 'exists',
        },
        null,
        2,
      ),
    )
    return
  }

  // Create new state (or reset with --force)
  const state = createDefaultState(sessionId)
  await writeState(stateFile, state)

  // biome-ignore lint/suspicious/noConsole: intentional CLI output
  console.log(
    JSON.stringify(
      {
        success: true,
        sessionId,
        stateFile,
        action: parsed.force ? 'reset' : 'created',
      },
      null,
      2,
    ),
  )
}
