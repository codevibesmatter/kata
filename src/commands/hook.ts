// kata hook <name> - Hook event dispatch
// Core of hooks-as-commands architecture: each hook event has a handler function
// that reads stdin JSON, performs the check, and outputs Claude Code hook JSON.
import { execSync } from 'node:child_process'
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { getStateFilePath, findProjectDir, getSessionsDir, resolveTemplatePath } from '../session/lookup.js'
import { readState, stateExists } from '../state/reader.js'
import { readNativeTaskFiles } from './enter/task-factory.js'
import type { SessionState } from '../state/schema.js'
import { isNativeTasksEnabled } from '../utils/tasks-check.js'
import { resolvePlaceholders, type PlaceholderContext } from './enter/placeholder.js'
import { parseTemplateYaml } from './enter/template.js'
import type { Gate } from '../validation/schemas.js'
import { toGitRelative, appendEdit, parseGitStatusPaths, readEditsSet } from '../tracking/edits-log.js'

/**
 * Claude Code hook output format
 *
 * PreToolUse: use hookSpecificOutput.permissionDecision (top-level decision is deprecated for this event)
 * Stop/PostToolUse/UserPromptSubmit: use top-level decision: "block"
 * Context hooks (SessionStart, UserPromptSubmit): use hookSpecificOutput.additionalContext
 */
type HookOutput =
  | {
      decision: 'block' | 'allow'
      reason?: string
    }
  | {
      hookSpecificOutput: {
        hookEventName: string
        additionalContext?: string
        // PreToolUse-specific fields
        permissionDecision?: 'allow' | 'deny' | 'ask'
        permissionDecisionReason?: string
        updatedInput?: Record<string, unknown>
      }
    }

/**
 * Read stdin as JSON (for hook input)
 */
async function readStdinJson(): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    let data = ''
    const stdin = process.stdin
    stdin.setEncoding('utf-8')

    // Handle case where stdin is not a TTY (piped data)
    if (stdin.isTTY) {
      resolve({})
      return
    }

    stdin.on('data', (chunk) => {
      data += chunk
    })

    stdin.on('end', () => {
      if (!data.trim()) {
        resolve({})
        return
      }
      try {
        resolve(JSON.parse(data) as Record<string, unknown>)
      } catch {
        resolve({})
      }
    })

    // Timeout after 1 second if no data
    setTimeout(() => {
      stdin.removeAllListeners()
      if (!data.trim()) {
        resolve({})
      } else {
        try {
          resolve(JSON.parse(data) as Record<string, unknown>)
        } catch {
          resolve({})
        }
      }
    }, 1000)
  })
}

/**
 * Safely get session state from a session ID extracted from hook stdin JSON.
 * Returns null if sessionId is missing or state doesn't exist.
 */
async function getSessionState(
  sessionId: string | undefined,
): Promise<{ state: SessionState; sessionId: string } | null> {
  if (!sessionId) return null
  try {
    const stateFile = await getStateFilePath(sessionId)
    if (await stateExists(stateFile)) {
      const state = await readState(stateFile)
      return { state, sessionId }
    }
    return null
  } catch {
    return null
  }
}

/**
 * Output JSON to stdout
 */
function outputJson(obj: HookOutput): void {
  process.stdout.write(`${JSON.stringify(obj)}\n`)
}

/**
 * Capture console.log output from a function that writes to console.log
 * Replaces console.log temporarily and returns captured output
 */
async function captureConsoleLog(fn: () => Promise<void>): Promise<string> {
  let captured = ''
  // biome-ignore lint/suspicious/noConsole: intentional capture of console.log output for hook dispatch
  const origLog = console.log
  console.log = (...args: unknown[]) => {
    captured += args.map(String).join(' ')
  }
  try {
    await fn()
  } finally {
    console.log = origLog
  }
  return captured
}

// ── Handler: session-start ──
// Calls init then prime — initializes session state and outputs context
export async function handleSessionStart(input: Record<string, unknown>): Promise<void> {
  const sessionId = input.session_id as string | undefined

  try {
    // Import and run init (silently capture its output)
    // No --force: session_id handles lifecycle naturally.
    // New session or /clear → new session_id → fresh state created.
    // Compact or resume → same session_id → existing state preserved.
    const { init } = await import('./init.js')
    const initArgs: string[] = []
    if (sessionId) initArgs.push(`--session=${sessionId}`)
    await captureConsoleLog(() => init(initArgs))

    // Delegate to prime for the full kata hints context
    const { prime } = await import('./prime.js')
    const primeArgs: string[] = []
    if (sessionId) primeArgs.push(`--session=${sessionId}`)
    const additionalContext = await captureConsoleLog(() => prime(primeArgs))

    if (sessionId) {
      const source = (input.source as string) ?? 'unknown'
      logHook(sessionId, { hook: 'session-start', decision: 'context', source })
    }

    // Prepend tasks-disabled warning when CLAUDE_CODE_ENABLE_TASKS=false
    const tasksWarning = isNativeTasksEnabled()
      ? ''
      : '\n⚠️ WARNING: CLAUDE_CODE_ENABLE_TASKS is disabled. kata workflow tracking (TaskList, TaskUpdate) will not work. To enable: set env.CLAUDE_CODE_ENABLE_TASKS to "true" in ~/.claude/settings.json, then restart Claude Code.\n'

    outputJson({
      hookSpecificOutput: {
        hookEventName: 'SessionStart',
        additionalContext: tasksWarning + additionalContext,
      },
    })
  } catch (err) {
    // Config errors (missing kata.yaml, invalid config) should not crash the hook.
    // Suggest freeform mode so the user can fix the config without being blocked.
    const errorMsg = err instanceof Error ? err.message : String(err)
    outputJson({
      hookSpecificOutput: {
        hookEventName: 'SessionStart',
        additionalContext:
          `⚠️ **kata config error:** ${errorMsg}\n\n` +
          `**To fix:** enter freeform mode to bypass mode-gate and repair the config:\n` +
          '```\nkata enter freeform\n```\n' +
          `Or run \`kata setup\` to reinitialize.`,
      },
    })
  }
}

// ── Handler: user-prompt ──
// Detects mode from user message. When a mode is already active, emits a
// lightweight hint instead of running full keyword-based suggest — the LLM
// understands natural language mode-switch requests on its own.
export async function handleUserPrompt(input: Record<string, unknown>): Promise<void> {
  const message = (input.user_message as string) ?? (input.prompt as string) ?? ''

  // If a mode is already active, just remind the LLM of the current mode
  // and how to switch. No keyword detection needed — the LLM handles intent.
  const sessionId = input.session_id as string | undefined
  const session = await getSessionState(sessionId)
  if (session) {
    const activeMode = session.state.currentMode || session.state.sessionType || 'default'
    if (activeMode !== 'default') {
      try {
        const { loadKataConfig } = await import('../config/kata-config.js')
        const kataConfig = loadKataConfig()
        const availableModes = Object.keys(kataConfig.modes)
          .filter((id) => !kataConfig.modes[id].deprecated)
          .join(', ')
        if (sessionId) logHook(sessionId, { hook: 'user-prompt', decision: 'context', active_mode: activeMode })
        outputJson({
          hookSpecificOutput: {
            hookEventName: 'UserPromptSubmit',
            additionalContext:
              `Currently in **${activeMode}** mode. ` +
              `To switch modes: \`kata enter <mode>\` (available: ${availableModes}).`,
          },
        })
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err)
        outputJson({
          hookSpecificOutput: {
            hookEventName: 'UserPromptSubmit',
            additionalContext:
              `⚠️ **kata config error:** ${errorMsg}\n\n` +
              `Enter freeform mode to bypass and fix: \`kata enter freeform\``,
          },
        })
      }
      return
    }
  }

  // No mode active — run full suggest to nudge the user into one
  const { suggest } = await import('./suggest.js')
  const suggestOutput = await captureConsoleLog(() => suggest(message.split(' ')))

  let additionalContext = ''
  let suggestedMode: string | null = null
  try {
    const result = JSON.parse(suggestOutput) as {
      mode: string | null
      guidance: string
      command: string | null
    }
    if (result.guidance) {
      additionalContext = result.guidance
    }
    suggestedMode = result.mode
  } catch {
    // Could not parse suggest output
  }

  if (sessionId) logHook(sessionId, { hook: 'user-prompt', decision: 'context', suggested_mode: suggestedMode })

  outputJson({
    hookSpecificOutput: {
      hookEventName: 'UserPromptSubmit',
      additionalContext,
    },
  })
}

// ── Handler: mode-gate ──
// Checks mode state for PreToolUse gating, and injects KATA_SESSION_ID
// into kata bash commands so they can resolve the session ID.
export async function handleModeGate(input: Record<string, unknown>): Promise<void> {
  const sessionId = input.session_id as string | undefined
  const toolName = (input.tool_name as string) ?? ''
  const toolInput = (input.tool_input as Record<string, unknown>) ?? {}

  const session = await getSessionState(sessionId)

  if (session) {
    const { state } = session

    // If in default mode (no mode entered), block write operations.
    // These are Claude Code's internal tool_name values for file-mutation operations.
    if (state.currentMode === 'default' || !state.currentMode) {
      const writeTools = ['Edit', 'MultiEdit', 'Write', 'NotebookEdit']
      if (writeTools.includes(toolName)) {
        if (sessionId) logHook(sessionId, { hook: 'mode-gate', decision: 'deny', tool: toolName })
        outputJson({
          hookSpecificOutput: {
            hookEventName: 'PreToolUse',
            permissionDecision: 'deny',
            permissionDecisionReason:
              'Enter a mode first: kata enter <mode>. Write operations are blocked until a mode is active.',
          },
        })
        return
      }
    }
  }

  // Inject --session=<id> into kata bash commands so they can resolve the session.
  // Uses updatedInput to append --session=<id> to the kata subcommand call.
  if (toolName === 'Bash' && sessionId) {
    const command = (toolInput.command as string) ?? ''
    // Match `kata` as a top-level command: at start, or after ;/&&/||/|
    // Supports bare `kata`, `./kata`, or absolute path `/some/path/kata`
    const kataAsCommand = /(?:^|[;&|]\s*)((?:\.\/|(?:\/\S+\/)*)kata(?:-\S*)?)(?=\s+\w)/.exec(command)
    if (kataAsCommand && !command.includes('--session=') && !/kata\s+hook\b/.test(command)) {
      // Inject --session after the matched kata subcommand (e.g. `kata enter` → `kata enter --session=ID`)
      const kataPath = kataAsCommand[1]
      const escapedPath = kataPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const injected = command.replace(
        new RegExp(`(${escapedPath}\\s+\\S+)`),
        `$1 --session=${sessionId}`,
      )
      outputJson({
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'allow',
          updatedInput: {
            ...toolInput,
            command: injected,
          },
        },
      })
      return
    }
  }

  // Default: allow
  if (sessionId) logHook(sessionId, { hook: 'mode-gate', decision: 'allow', tool: toolName })
  outputJson({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'allow',
    },
  })
}

// ── Handler: task-deps ──
// Checks task dependencies before allowing TaskUpdate to mark a task completed.
// Blocks completion if any blockedBy tasks are not yet completed.
export async function handleTaskDeps(input: Record<string, unknown>): Promise<void> {
  // Task fields arrive inside tool_input for PreToolUse hooks
  const toolInput = (input.tool_input as Record<string, unknown>) ?? {}
  const taskId = (toolInput.taskId as string) ?? ''
  const newStatus = (toolInput.status as string) ?? ''

  // Only enforce deps when completing a task
  if (!taskId || newStatus !== 'completed') {
    outputJson({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'allow' } })
    return
  }

  try {
    const session = await getSessionState(input.session_id as string | undefined)
    if (!session) {
      outputJson({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'allow' } })
      return
    }

    const tasks = readNativeTaskFiles(session.sessionId)
    const task = tasks.find((t) => t.id === taskId)

    if (!task || !task.blockedBy?.length) {
      outputJson({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'allow' } })
      return
    }

    // Check if all blockedBy tasks are completed
    const incomplete = task.blockedBy.filter((depId) => {
      const dep = tasks.find((t) => t.id === depId)
      return dep && dep.status !== 'completed'
    })

    if (incomplete.length > 0) {
      const depTasks = incomplete
        .map((depId) => {
          const dep = tasks.find((t) => t.id === depId)
          return dep ? `[${dep.id}] ${dep.subject}` : depId
        })
        .join(', ')
      if (input.session_id) logHook(input.session_id as string, { hook: 'task-deps', decision: 'deny', task: taskId, blocked_by: incomplete })
      outputJson({
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'deny',
          permissionDecisionReason: `Task [${taskId}] is blocked by incomplete task(s): ${depTasks}`,
        },
      })
      return
    }
  } catch {
    // On any error, allow — don't block on infra failures
  }

  if (input.session_id) logHook(input.session_id as string, { hook: 'task-deps', decision: 'allow', task: taskId })
  outputJson({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'allow' } })
}

// ── Handler: task-evidence ──
// Warns (via additionalContext) when completing a task with no committed changes.
// Always ALLOWs — evidence check is advisory, not blocking.
export async function handleTaskEvidence(_input: Record<string, unknown>): Promise<void> {
  let additionalContext = ''

  try {
    // Run git status from the project root so hook runners spawned in a
    // subdirectory (e.g. .claude/hooks/) don't get a spuriously clean status.
    let cwd: string | undefined
    try {
      cwd = findProjectDir()
    } catch {
      // No .claude/ found — fall back to hook runner's cwd
    }
    // Strip trailing newlines only — consistent with other porcelain call sites
    // so that the leading space of " M path" status lines is preserved.
    const gitStatus = execSync('git status --porcelain 2>/dev/null || true', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      ...(cwd ? { cwd } : {}),
    }).replace(/\n+$/, '')

    if (gitStatus) {
      // There are uncommitted changes — remind agent to commit before marking done
      const changedFiles = gitStatus.split('\n').filter((l) => !l.startsWith('??'))
      if (changedFiles.length > 0) {
        additionalContext =
          `⚠️ You have ${changedFiles.length} uncommitted change(s). ` +
          'Commit your work before marking this task completed.'
      }
    }
  } catch {
    // Git unavailable — no advisory needed
  }

  if (_input.session_id) logHook(_input.session_id as string, { hook: 'task-evidence', decision: 'allow', uncommitted: !!additionalContext })
  outputJson({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'allow',
      ...(additionalContext ? { additionalContext } : {}),
    },
  })
}

/**
 * Structured hook log entry. All hooks write to a single
 * {sessionsDir}/{sessionId}/hooks.log.jsonl file.
 */
interface HookLogEntry extends Record<string, unknown> {
  ts: string
  hook: string
  decision: 'allow' | 'block' | 'deny' | 'context'
}

/**
 * Append a structured log entry to the session's hook log.
 * Written to {sessionsDir}/{sessionId}/hooks.log.jsonl
 * so eval assertions can verify which hooks fired and what they decided.
 */
export function logHook(sessionId: string, entry: Omit<HookLogEntry, 'ts'>): void {
  try {
    const projectDir = findProjectDir()
    const sessionsDir = getSessionsDir(projectDir)
    const sessionDir = join(sessionsDir, sessionId)
    mkdirSync(sessionDir, { recursive: true })
    const full = { ...entry, ts: new Date().toISOString() } as HookLogEntry
    appendFileSync(join(sessionDir, 'hooks.log.jsonl'), `${JSON.stringify(full)}\n`)
  } catch {
    // Best-effort logging — never fail the hook
  }
}

/** Backwards-compat: also write stop-hook.log.jsonl for existing assertions */
function logStopHook(
  sessionId: string,
  decision: 'block' | 'allow',
  reasons: string[],
  note?: string,
): void {
  try {
    const projectDir = findProjectDir()
    const sessionsDir = getSessionsDir(projectDir)
    const sessionDir = join(sessionsDir, sessionId)
    mkdirSync(sessionDir, { recursive: true })
    const entry = {
      ts: new Date().toISOString(),
      decision,
      reasons,
      ...(note ? { note } : {}),
    }
    appendFileSync(join(sessionDir, 'stop-hook.log.jsonl'), `${JSON.stringify(entry)}\n`)
  } catch {
    // Best-effort logging — never fail the hook
  }
}

/**
 * Write a `run-end.json` artifact in the session folder when a Stop event
 * results in a successful can-exit decision (i.e. the run is cleanly ending).
 *
 * Overwrites on each successful stop event so the file always reflects the
 * latest clean exit snapshot. Downstream tooling (evals, audits, post-run
 * checks) can detect a successful run end by the presence + freshness of
 * this artifact, without having to grep through hooks.log.jsonl.
 *
 * Skipped for the "background agents active" deferral branch since that is
 * a permissive override, not a true clean exit.
 *
 * Best-effort: any failure (git unavailable, fs error, etc.) is swallowed
 * so the hook itself never fails on artifact write.
 */
function writeRunEndArtifact(
  sessionId: string,
  state: SessionState,
  payload: {
    note: string
    stopConditions: Array<string | { condition: string; stage?: string }>
    advisories?: string[]
  },
): void {
  try {
    const projectDir = findProjectDir()
    const sessionsDir = getSessionsDir(projectDir)
    const sessionDir = join(sessionsDir, sessionId)
    mkdirSync(sessionDir, { recursive: true })

    // Capture branch + HEAD commit (best-effort; missing values left undefined)
    let branch: string | undefined
    let commit: string | undefined
    try {
      branch =
        execSync('git rev-parse --abbrev-ref HEAD 2>/dev/null', {
          encoding: 'utf-8',
          stdio: ['pipe', 'pipe', 'pipe'],
          cwd: projectDir,
        }).trim() || undefined
    } catch {
      /* ignore */
    }
    try {
      commit =
        execSync('git rev-parse HEAD 2>/dev/null', {
          encoding: 'utf-8',
          stdio: ['pipe', 'pipe', 'pipe'],
          cwd: projectDir,
        }).trim() || undefined
    } catch {
      /* ignore */
    }

    // Normalize stop conditions to plain string list (drop optional stage scoping)
    const stopConditions = payload.stopConditions.map((c) =>
      typeof c === 'string' ? c : c.condition,
    )

    const artifact = {
      ts: new Date().toISOString(),
      sessionId,
      workflowId: state.workflowId,
      mode: state.currentMode || state.sessionType,
      issueNumber: state.issueNumber ?? null,
      branch,
      commit,
      completedPhases: state.completedPhases ?? [],
      stopConditions,
      advisories: payload.advisories ?? [],
      note: payload.note,
    }
    writeFileSync(
      join(sessionDir, 'run-end.json'),
      `${JSON.stringify(artifact, null, 2)}\n`,
    )
  } catch {
    // Best-effort — never fail the hook
  }
}

/**
 * Resolve the transcript path for a session.
 * Claude Code stores transcripts at ~/.claude/projects/<encoded-dir>/<session-id>.jsonl
 * where <encoded-dir> is the project path with / replaced by -.
 */
function resolveTranscriptPath(sessionId: string): string | undefined {
  try {
    const projectDir = findProjectDir()
    if (!projectDir) return undefined
    const encoded = projectDir.replace(/\//g, '-')
    const transcriptDir = join(homedir(), '.claude', 'projects', encoded)
    const transcriptPath = join(transcriptDir, `${sessionId}.jsonl`)
    if (existsSync(transcriptPath)) return transcriptPath

    // Fallback: scan the projects dir for any file matching the session ID
    const projectsDir = join(homedir(), '.claude', 'projects')
    if (!existsSync(projectsDir)) return undefined
    for (const dir of readdirSync(projectsDir)) {
      const candidate = join(projectsDir, dir, `${sessionId}.jsonl`)
      if (existsSync(candidate)) return candidate
    }
    return undefined
  } catch {
    return undefined
  }
}

/**
 * Check if there are active background agents by scanning the session transcript.
 * An Agent tool_use without a matching tool_result means the agent is still running.
 *
 * Staleness heuristic: an unmatched Agent tool_use is only considered active if
 * no subsequent user-prompt turn has occurred after it. Once the user sends a new
 * message (a `user` entry with a `text` content block, not just tool_results),
 * any still-unmatched Agent IDs from before that prompt are treated as
 * stale/abandoned (SDK sessions sometimes omit tool_results). See issue #60.
 */
export function hasActiveBackgroundAgents(
  transcriptPath: string | undefined,
): boolean {
  if (!transcriptPath) return false
  try {
    const content = readFileSync(transcriptPath, 'utf-8')
    const lines = content.split('\n').filter((l) => l.trim())

    // Track unmatched Agent tool_use IDs
    const agentToolUseIds = new Set<string>()

    for (const line of lines) {
      try {
        const msg = JSON.parse(line) as Record<string, unknown>

        if (msg.type === 'assistant') {
          const message = (msg.message as Record<string, unknown>) ?? msg
          const contentBlocks = (message.content as Array<Record<string, unknown>>) ?? []
          for (const block of contentBlocks) {
            if (
              block.type === 'tool_use' &&
              block.name === 'Agent' &&
              typeof block.id === 'string'
            ) {
              agentToolUseIds.add(block.id)
            }
          }
        }

        if (msg.type === 'user') {
          const message = (msg.message as Record<string, unknown>) ?? msg
          const contentBlocks = (message.content as Array<Record<string, unknown>>) ?? []

          let hasToolResult = false
          let hasUserText = false
          for (const block of contentBlocks) {
            if (block.type === 'tool_result' && typeof block.tool_use_id === 'string') {
              agentToolUseIds.delete(block.tool_use_id)
              hasToolResult = true
            }
            if (block.type === 'text' && typeof block.text === 'string' && block.text.trim()) {
              hasUserText = true
            }
          }

          // A new user prompt (not just tool_results) means the conversation moved on.
          // Any still-unmatched Agent IDs from before this point are stale.
          if (hasUserText && !hasToolResult) {
            agentToolUseIds.clear()
          }
        }
      } catch {
        // Skip unparseable lines
      }
    }

    return agentToolUseIds.size > 0
  } catch {
    // Transcript unreadable — assume no active agents
    return false
  }
}

// ── Handler: stop-conditions ──
// Calls canExit to check if session can be stopped
export async function handleStopConditions(input: Record<string, unknown>): Promise<void> {
  const session = await getSessionState(input.session_id as string | undefined)

  if (!session) {
    // No session — allow stop (no output = allow)
    return
  }

  const { state, sessionId } = session
  const currentMode = state.currentMode || state.sessionType || 'default'

  // Load mode config to check stop_conditions
  const { loadKataConfig } = await import('../config/kata-config.js')
  const kataConfig = loadKataConfig()
  const modeConfig = kataConfig.modes[currentMode]
  const stopConditions = modeConfig?.stop_conditions ?? []

  // No stop conditions for this mode = allow exit
  if (stopConditions.length === 0) {
    logHook(sessionId, { hook: 'stop-conditions', decision: 'allow', note: 'no stop conditions for mode' })
    logStopHook(sessionId, 'allow', [], 'no stop conditions for mode')
    writeRunEndArtifact(sessionId, state, {
      note: 'no stop conditions for mode',
      stopConditions: [],
    })
    return
  }

  // Run can-exit check, capturing output
  const { canExit } = await import('./can-exit.js')
  const origExitCode = process.exitCode
  const exitOutput = await captureConsoleLog(() => canExit(['--json', `--session=${sessionId}`]))
  process.exitCode = origExitCode

  try {
    const result = JSON.parse(exitOutput) as {
      canExit: boolean
      reasons: string[]
      advisories?: string[]
      guidance?: { nextStepMessage?: string; escapeHatch?: string }
    }
    if (!result.canExit) {
      // If background agents are active, allow exit — trust agent completion notifications.
      // The transcript records every tool_use/tool_result; unmatched Agent calls = active agents.
      // Derive transcript path from session ID + project dir.
      // Claude Code stores transcripts at ~/.claude/projects/<encoded-dir>/<session-id>.jsonl
      const transcriptPath = resolveTranscriptPath(sessionId)
      if (hasActiveBackgroundAgents(transcriptPath)) {
        logHook(sessionId, { hook: 'stop-conditions', decision: 'allow', note: 'background agents active — deferring to agent notifications' })
        logStopHook(sessionId, 'allow', result.reasons, 'background agents active')
        return
      }

      const parts: string[] = ['Session has incomplete work:']
      for (const reason of result.reasons) {
        parts.push(`- ${reason}`)
      }
      if (result.guidance?.nextStepMessage) {
        parts.push(result.guidance.nextStepMessage)
      }
      if (result.guidance?.escapeHatch) {
        parts.push(result.guidance.escapeHatch)
      }
      logHook(sessionId, { hook: 'stop-conditions', decision: 'block', reasons: result.reasons })
      logStopHook(sessionId, 'block', result.reasons)
      // decision: "block" must be at the TOP LEVEL (not inside hookSpecificOutput)
      outputJson({
        decision: 'block',
        reason: parts.join('\n'),
      })
    } else {
      logHook(sessionId, { hook: 'stop-conditions', decision: 'allow', note: 'all conditions met' })
      logStopHook(sessionId, 'allow', [], 'all conditions met')
      writeRunEndArtifact(sessionId, state, {
        note: 'all conditions met',
        stopConditions,
        advisories: result.advisories,
      })
    }
    // canExit === true: output nothing (allows stop)
  } catch {
    logHook(sessionId, { hook: 'stop-conditions', decision: 'allow', note: 'parse error' })
    logStopHook(sessionId, 'allow', [], 'parse error — defaulting to allow')
    // Could not parse exit output — allow stop
  }
}

// ── Gate evaluation ──

/**
 * Run a bash gate command and check its output against expectations.
 * Returns pass/fail, captured output, exit code, and resolved on_fail message.
 */
function evaluateBashGate(
  gate: Gate,
  placeholderContext: PlaceholderContext,
  sessionId?: string,
): { passed: boolean; output: string; exitCode: number; onFail?: string } {
  // 1. Resolve placeholders in gate.bash and gate.on_fail
  const resolvedBash = resolvePlaceholders(gate.bash, placeholderContext)

  // 2. Run the command (pass KATA_SESSION_ID so child kata commands resolve the session)
  let output = ''
  let exitCode = 0
  try {
    let cwd: string | undefined
    try {
      cwd = findProjectDir()
    } catch {
      /* use hook runner cwd */
    }
    const env = sessionId
      ? { ...process.env, KATA_SESSION_ID: sessionId }
      : process.env
    output = execSync(resolvedBash, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 30000,
      env,
      ...(cwd ? { cwd } : {}),
    }).trim()
  } catch (err: unknown) {
    const execErr = err as { status?: number; stdout?: Buffer | string }
    exitCode = execErr.status ?? 1
    output = (execErr.stdout ?? '').toString().trim()
  }

  // 3. Check pass/fail (AND semantics: both must pass if both specified)
  let passed = true
  if (gate.expect !== undefined) {
    passed = passed && output.includes(gate.expect)
  }
  if (gate.expect_exit !== undefined) {
    passed = passed && exitCode === gate.expect_exit
  }

  // 4. Resolve on_fail with gate-local placeholders
  let onFail = gate.on_fail
  if (onFail) {
    onFail = resolvePlaceholders(onFail, placeholderContext)
    onFail = onFail.replace(/\{exit_code\}/g, String(exitCode))
    onFail = onFail.replace(/\{output\}/g, output)
  }

  return { passed, output, exitCode, onFail }
}

/**
 * Find a gate definition for a task by its originalId.
 * Checks step-level gates first, then subphase pattern gates.
 */
function findGateForTask(
  originalId: string,
  templatePath: string,
): Gate | null {
  try {
    const fullPath = resolveTemplatePath(templatePath)
    const template = parseTemplateYaml(fullPath)
    if (!template?.phases) return null

    const [phaseId, stepId] = originalId.split(':')
    if (!phaseId || !stepId) return null

    // Try step-level gate first (e.g., p0:read-spec)
    for (const phase of template.phases) {
      if (phase.id === phaseId && phase.steps) {
        const step = phase.steps.find((s) => s.id === stepId)
        if (step?.gate) return step.gate
      }
    }

    // Try subphase pattern gate (e.g., p2.1:test -> id_suffix "test")
    for (const phase of template.phases) {
      if (
        (phase as Record<string, unknown>).expansion === 'spec' &&
        (phase as Record<string, unknown>).subphase_pattern &&
        Array.isArray((phase as Record<string, unknown>).subphase_pattern)
      ) {
        const patterns = (phase as Record<string, unknown>).subphase_pattern as Array<{
          id_suffix: string
          gate?: Gate
        }>
        const pattern = patterns.find((p) => p.id_suffix === stepId)
        if (pattern?.gate) return pattern.gate
      }
    }
  } catch {
    // Template not found or parse error — no gate
  }

  return null
}

// ── Handler: pre-tool-use (consolidated) ──
// Single PreToolUse handler that combines mode-gate, task-deps, and task-evidence checks.
// For TaskUpdate completions, runs: deps -> gates -> evidence (in sequence, short-circuiting on deny).
export async function handlePreToolUse(input: Record<string, unknown>): Promise<void> {
  const sessionId = input.session_id as string | undefined
  const toolName = (input.tool_name as string) ?? ''
  const toolInput = (input.tool_input as Record<string, unknown>) ?? {}

  // 1. Always: mode-gate checks (session injection + write blocking)
  const session = await getSessionState(sessionId)

  if (session) {
    const { state } = session

    // Block write operations when no mode is active
    if (state.currentMode === 'default' || !state.currentMode) {
      const writeTools = ['Edit', 'MultiEdit', 'Write', 'NotebookEdit']
      if (writeTools.includes(toolName)) {
        if (sessionId) logHook(sessionId, { hook: 'pre-tool-use', decision: 'deny', tool: toolName })
        outputJson({
          hookSpecificOutput: {
            hookEventName: 'PreToolUse',
            permissionDecision: 'deny',
            permissionDecisionReason:
              'Enter a mode first: kata enter <mode>. Write operations are blocked until a mode is active.',
          },
        })
        return
      }
    }
  }

  // 2. Always: inject --session=<id> into kata bash commands
  if (toolName === 'Bash' && sessionId) {
    const command = (toolInput.command as string) ?? ''
    const kataAsCommand = /(?:^|[;&|]\s*)((?:\.\/|(?:\/\S+\/)*)kata(?:-\S*)?)(?=\s+\w)/.exec(command)
    if (kataAsCommand && !command.includes('--session=') && !/kata\s+hook\b/.test(command)) {
      const kataPath = kataAsCommand[1]
      const escapedPath = kataPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const injected = command.replace(
        new RegExp(`(${escapedPath}\\s+\\S+)`),
        `$1 --session=${sessionId}`,
      )
      outputJson({
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'allow',
          updatedInput: {
            ...toolInput,
            command: injected,
          },
        },
      })
      return
    }
  }

  // Bash pre-snapshot: capture git status before suspicious commands
  if (toolName === 'Bash' && sessionId) {
    const command = (toolInput.command as string) ?? ''
    // Safe-list checked first — skip snapshot entirely
    const safeList = /^(git\s|bun\s+test|ls\b|cat\b|echo\b[^>]*$|cd\b|pwd\b|which\b|head\b|tail\b|wc\b|diff\b|grep\b|find\b)/
    if (!safeList.test(command)) {
      // Suspicious regex checked second
      const suspicious = /sed\s.*-i|>\s|>>\s|\btee\b|\bcp\b|\bmv\b|\brm\b|\bchmod\b|\bchown\b|\bpatch\b|\bcurl\b.*-o/
      if (suspicious.test(command)) {
        try {
          const projectDir = findProjectDir()
          const sessionDir = join(getSessionsDir(projectDir), sessionId)
          // Strip trailing newlines only — `.trim()` would eat the leading space
          // of the first porcelain line, corrupting diff parsing in PostToolUse.
          const snapshot = execSync('git status --porcelain 2>/dev/null || true', {
            encoding: 'utf-8',
            stdio: ['pipe', 'pipe', 'pipe'],
            cwd: projectDir,
          }).replace(/\n+$/, '')
          mkdirSync(sessionDir, { recursive: true })
          writeFileSync(join(sessionDir, 'bash-pre-snapshot.txt'), snapshot)
        } catch {
          // Pre-snapshot failure must not block tool execution
        }
      }
    }
  }

  // 3. TaskUpdate(status: "completed") — run deps, gates, evidence in sequence
  if (toolName === 'TaskUpdate') {
    const taskId = (toolInput.taskId as string) ?? ''
    const newStatus = (toolInput.status as string) ?? ''

    if (taskId && newStatus === 'completed') {
      // 3a. Check task dependencies (hard block)
      try {
        if (session) {
          const tasks = readNativeTaskFiles(session.sessionId)
          const task = tasks.find((t) => t.id === taskId)

          if (task?.blockedBy?.length) {
            const incomplete = task.blockedBy.filter((depId) => {
              const dep = tasks.find((t) => t.id === depId)
              return dep && dep.status !== 'completed'
            })

            if (incomplete.length > 0) {
              const depTasks = incomplete
                .map((depId) => {
                  const dep = tasks.find((t) => t.id === depId)
                  return dep ? `[${dep.id}] ${dep.subject}` : depId
                })
                .join(', ')
              if (sessionId) logHook(sessionId, { hook: 'pre-tool-use', decision: 'deny', check: 'task-deps', task: taskId, blocked_by: incomplete })
              outputJson({
                hookSpecificOutput: {
                  hookEventName: 'PreToolUse',
                  permissionDecision: 'deny',
                  permissionDecisionReason: `Task [${taskId}] is blocked by incomplete task(s): ${depTasks}`,
                },
              })
              return
            }
          }

          // 3b. Evaluate gate if step has one (hard block)
          const originalId = (task?.metadata?.originalId as string) ?? ''
          const templatePath = session.state.template

          if (originalId && templatePath) {
            const gate = findGateForTask(originalId, templatePath)
            if (gate) {
              // Build placeholder context
              const placeholderContext: PlaceholderContext = {
                session: session.state,
                extra: {},
              }
              try {
                const { loadKataConfig } = await import('../config/kata-config.js')
                placeholderContext.config = loadKataConfig()
              } catch {
                // No config available
              }

              const result = evaluateBashGate(gate, placeholderContext, session.sessionId)
              if (!result.passed) {
                const reason = result.onFail ?? `Gate failed for task [${taskId}] (exit code: ${result.exitCode})`
                if (sessionId) logHook(sessionId, { hook: 'pre-tool-use', decision: 'deny', check: 'gate', task: taskId, originalId, exitCode: result.exitCode })
                outputJson({
                  hookSpecificOutput: {
                    hookEventName: 'PreToolUse',
                    permissionDecision: 'deny',
                    permissionDecisionReason: reason,
                  },
                })
                return
              }
            }
          }
        }
      } catch {
        // On any error, don't block — fall through to evidence check
      }

      // 3c. Check git evidence (advisory warning, always allow)
      let additionalContext = ''
      try {
        let projectDir: string | undefined
        try {
          projectDir = findProjectDir()
        } catch {
          // No .kata/ found
        }
        // Strip trailing newlines only — `.trim()` would eat the leading space
        // of the first porcelain line (e.g. " M file.ts"), corrupting parseGitStatusPaths.
        const gitStatus = execSync('git status --porcelain 2>/dev/null || true', {
          encoding: 'utf-8',
          stdio: ['pipe', 'pipe', 'pipe'],
          ...(projectDir ? { cwd: projectDir } : {}),
        }).replace(/\n+$/, '')

        if (gitStatus) {
          const evidenceSessionDir = sessionId ? join(getSessionsDir(projectDir ?? process.cwd()), sessionId) : undefined
          const sessionEdits = evidenceSessionDir ? readEditsSet(evidenceSessionDir) : null

          const changedFiles = gitStatus.split('\n').filter((l) => {
            if (l.startsWith('??')) return false
            if (sessionEdits) {
              const paths = parseGitStatusPaths(l)
              return paths.some(p => sessionEdits.has(p))
            }
            return true
          })
          if (changedFiles.length > 0) {
            additionalContext =
              `⚠️ You have ${changedFiles.length} uncommitted change(s). ` +
              'Commit your work before marking this task completed.'
          }
        }
      } catch {
        // Git unavailable
      }

      if (sessionId) logHook(sessionId, { hook: 'pre-tool-use', decision: 'allow', check: 'task-complete', task: taskId, uncommitted: !!additionalContext })
      outputJson({
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'allow',
          ...(additionalContext ? { additionalContext } : {}),
        },
      })
      return
    }
  }

  // Default: allow
  if (sessionId) logHook(sessionId, { hook: 'pre-tool-use', decision: 'allow', tool: toolName })
  outputJson({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'allow',
    },
  })
}

// ── Handler: post-tool-use ──
// Tracks files modified by Edit, Write, NotebookEdit, and Bash tools
export async function handlePostToolUse(input: Record<string, unknown>): Promise<void> {
  const sessionId = input.session_id as string | undefined
  if (!sessionId) return

  try {
    const projectDir = findProjectDir()
    const sessionDir = join(getSessionsDir(projectDir), sessionId)

    // Guard: only track if session exists
    if (!existsSync(join(sessionDir, 'state.json'))) return

    const toolName = (input.tool_name as string) ?? ''
    const toolInput = (input.tool_input as Record<string, unknown>) ?? {}

    if (toolName === 'Edit' || toolName === 'Write' || toolName === 'NotebookEdit') {
      const filePath = toolInput.file_path as string | undefined
      if (filePath) {
        const gitRelative = toGitRelative(filePath)
        appendEdit(sessionDir, { file: gitRelative, tool: toolName, ts: new Date().toISOString() })
      }
    } else if (toolName === 'Bash') {
      // Compare post-execution git status against pre-snapshot
      const snapshotPath = join(sessionDir, 'bash-pre-snapshot.txt')
      if (existsSync(snapshotPath)) {
        try {
          // Strip trailing newlines only — `.trim()` would eat the leading space
          // of the first porcelain line, corrupting parseGitStatusPaths.
          const preSnapshot = readFileSync(snapshotPath, 'utf-8').replace(/\n+$/, '')
          const postSnapshot = execSync('git status --porcelain 2>/dev/null || true', {
            encoding: 'utf-8',
            stdio: ['pipe', 'pipe', 'pipe'],
            cwd: projectDir,
          }).replace(/\n+$/, '')

          // Find new dirty files
          const preFiles = new Set(preSnapshot.split('\n').filter(Boolean).flatMap(parseGitStatusPaths))
          const postLines = postSnapshot.split('\n').filter(Boolean)
          for (const line of postLines) {
            const paths = parseGitStatusPaths(line)
            for (const p of paths) {
              if (!preFiles.has(p)) {
                appendEdit(sessionDir, { file: p, tool: 'Bash', ts: new Date().toISOString() })
              }
            }
          }

          // Clean up snapshot file
          try { unlinkSync(snapshotPath) } catch { /* ignore */ }
        } catch {
          // Diff failure — silently ignore
        }
      }
    }
  } catch {
    // PostToolUse must never fail — silent no-op
  }
}

// ── Hook name -> handler map ──
const hookHandlers: Record<string, (input: Record<string, unknown>) => Promise<void>> = {
  'session-start': handleSessionStart,
  'user-prompt': handleUserPrompt,
  'pre-tool-use': handlePreToolUse,
  'stop-conditions': handleStopConditions,
  'post-tool-use': handlePostToolUse,
  // Backwards-compat aliases for transition period
  'mode-gate': handlePreToolUse,
  'task-deps': handlePreToolUse,
  'task-evidence': handlePreToolUse,
}

/**
 * Parse command line arguments for hook command
 */
function parseHookArgs(args: string[]): { hookName: string; remaining: string[] } {
  const hookName = args[0] ?? ''
  const remaining = args.slice(1)
  return { hookName, remaining }
}

/**
 * kata hook <name>
 * Dispatch hook events. Each hook reads stdin JSON and outputs Claude Code hook JSON.
 *
 * Supported hooks:
 *   session-start    - Initialize session and output context (SessionStart)
 *   user-prompt      - Detect mode from user message (UserPromptSubmit)
 *   pre-tool-use     - Consolidated PreToolUse handler: mode-gate, task-deps, gate evaluation, task-evidence
 *   stop-conditions  - Check if session can be stopped (Stop)
 *
 * Backwards-compat aliases (all route to pre-tool-use):
 *   mode-gate        - Check mode state for tool gating
 *   task-deps        - Check task dependencies
 *   task-evidence    - Check git status for task evidence
 */
export async function hook(args: string[]): Promise<void> {
  const { hookName } = parseHookArgs(args)

  if (!hookName) {
    process.stderr.write('Usage: kata hook <name>\n')
    process.stderr.write(`Available hooks: ${Object.keys(hookHandlers).join(', ')}\n`)
    process.exitCode = 1
    return
  }

  const handler = hookHandlers[hookName]
  if (!handler) {
    process.stderr.write(`Unknown hook: ${hookName}\n`)
    process.stderr.write(`Available hooks: ${Object.keys(hookHandlers).join(', ')}\n`)
    process.exitCode = 1
    return
  }

  // Read stdin JSON input
  const input = await readStdinJson()

  // Execute handler
  await handler(input)
}
