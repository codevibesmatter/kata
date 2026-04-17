// kata can-exit - Check if exit conditions are met (native task-based)
import { execSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { getCurrentSessionId, findProjectDir, getStateFilePath, getVerificationDir, getSessionsDir } from '../session/lookup.js'
import { readState } from '../state/reader.js'
import {
  type StopGuidance,
  getEscapeHatchMessage,
  getNextStepMessage,
} from '../messages/stop-guidance.js'
import {
  countPendingNativeTasks,
  getFirstPendingNativeTask,
  areAllOpenTasksInProgress,
  getNativeTasksDir,
  getPendingNativeTaskTitles,
  readNativeTaskFiles,
} from './enter/task-factory.js'
import { loadKataConfig } from '../config/kata-config.js'
import { findSpecFile, validateSpec } from './validate-spec.js'
import { readEditsSet, parseGitStatusPaths } from '../tracking/edits-log.js'

/**
 * Parse command line arguments for can-exit command
 */
function parseArgs(args: string[]): {
  json?: boolean
  session?: string
} {
  const result: { json?: boolean; session?: string } = {}

  for (const arg of args) {
    if (arg === '--json') {
      result.json = true
    } else if (arg.startsWith('--session=')) {
      result.session = arg.slice('--session='.length)
    }
  }

  return result
}

/**
 * Check git conditions (committed, pushed) based on which checks are active
 */
function checkGlobalConditions(checks: Set<string>, sessionDir?: string): { passed: boolean; reasons: string[]; advisories: string[] } {
  const reasons: string[] = []
  const advisories: string[] = []

  try {
    if (checks.has('committed')) {
      const gitStatus = execSync('git status --porcelain 2>/dev/null || true', {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      }).trim()

      if (gitStatus) {
        const sessionEdits = sessionDir ? readEditsSet(sessionDir) : null
        const outOfScopeFiles: string[] = []

        const changedFiles = gitStatus.split('\n').filter((line) => {
          if (line.startsWith('??')) return false
          const paths = parseGitStatusPaths(line)
          const file = paths[0] // primary path
          // Exclude kata session logs — the stop hook writes these on every invocation,
          // creating a recursive loop if we count them as uncommitted changes
          if (file.startsWith('.kata/sessions/')) return false

          if (sessionEdits) {
            // Session-scoped: only count files this session touched
            if (sessionEdits.has(file)) return true
            // Track out-of-scope files for advisory
            outOfScopeFiles.push(file)
            return false
          }
          // No session tracking (no edits.jsonl) — fall back to global behavior
          return true
        })

        if (changedFiles.length > 0) {
          reasons.push('Uncommitted changes in tracked files')
        }

        // Advisory for out-of-scope dirty files
        if (outOfScopeFiles.length > 0) {
          const shown = outOfScopeFiles.slice(0, 5)
          const suffix = outOfScopeFiles.length > 5 ? `, ... and ${outOfScopeFiles.length - 5} more` : ''
          advisories.push(`Note: ${outOfScopeFiles.length} file(s) outside this session's scope have uncommitted changes: ${shown.join(', ')}${suffix}`)
        }
      }
    }

    if (checks.has('pushed')) {
      const remoteBranches = execSync('git branch -r --contains HEAD 2>/dev/null || true', {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      }).trim()

      if (!remoteBranches) {
        reasons.push('Unpushed commits')
      }
    }
  } catch {
    // Git errors shouldn't block exit
  }

  return {
    passed: reasons.length === 0,
    reasons,
    advisories,
  }
}

/**
 * Get the latest git commit timestamp that touched code files (excluding non-code paths).
 * Returns null if no code commits exist (all commits are non-code only → evidence is fresh).
 */
function getLatestCodeCommitTimestamp(nonCodePaths: string[]): Date | null {
  try {
    const excludes = nonCodePaths.map(p => `':!${p}'`).join(' ')
    const ts = execSync(`git log -1 --format=%cI -- . ${excludes} 2>/dev/null || true`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim()
    if (!ts) return null
    const d = new Date(ts)
    return isNaN(d.getTime()) ? null : d
  } catch {
    return null
  }
}

/**
 * Check that at least one phase evidence file exists with fresh timestamp and overallPassed.
 * Reads .kata/verification-evidence/phase-*-{issueNumber}.json files.
 */
function checkTestsPass(issueNumber: number, nonCodePaths: string[]): { passed: boolean; reason?: string } {
  try {
    const projectRoot = findProjectDir()
    const evidenceDir = getVerificationDir(projectRoot)
    if (!existsSync(evidenceDir)) {
      return {
        passed: false,
        reason: `check-phase has not been run. Run: kata check-phase <phaseId> --issue=${issueNumber}`,
      }
    }

    const phaseFiles = readdirSync(evidenceDir)
      .filter((f) => f.startsWith('phase-') && f.endsWith(`-${issueNumber}.json`))
      .map((f) => join(evidenceDir, f))

    if (phaseFiles.length === 0) {
      return {
        passed: false,
        reason: `check-phase has not been run. Run: kata check-phase <phaseId> --issue=${issueNumber}`,
      }
    }

    const latestCodeCommit = getLatestCodeCommitTimestamp(nonCodePaths)

    for (const file of phaseFiles) {
      try {
        const content = JSON.parse(readFileSync(file, 'utf-8'))
        const phaseId = content.phaseId ?? file

        if (content.overallPassed !== true) {
          return {
            passed: false,
            reason: `Phase ${phaseId} failed check-phase. Re-run: kata check-phase ${phaseId} --issue=${issueNumber}`,
          }
        }

        if (latestCodeCommit && content.timestamp) {
          const evidenceDate = new Date(content.timestamp as string)
          if (!isNaN(evidenceDate.getTime()) && evidenceDate < latestCodeCommit) {
            return {
              passed: false,
              reason: `Phase ${phaseId} check-phase evidence is stale (predates latest commit). Re-run: kata check-phase ${phaseId} --issue=${issueNumber}`,
            }
          }
        }
      } catch {
        // Unreadable evidence file — treat as not run
        return {
          passed: false,
          reason: `check-phase has not been run. Run: kata check-phase <phaseId> --issue=${issueNumber}`,
        }
      }
    }

    return { passed: true }
  } catch {
    return {
      passed: false,
      reason: `check-phase has not been run. Run: kata check-phase <phaseId> --issue=${issueNumber}`,
    }
  }
}

/**
 * Check that at least one new test function was added in this session vs diff_base.
 * Reads project.diff_base and project.test_file_pattern from wm.yaml.
 */
function checkFeatureTestsAdded(sessionDir?: string): { passed: boolean; newTestCount?: number } {
  try {
    const cfg = loadKataConfig()
    const diffBase = cfg.project?.diff_base ?? 'origin/main'
    const testFilePattern = cfg.project?.test_file_pattern ?? '*.test.ts,*.spec.ts'
    const patterns = testFilePattern.split(',').map((p) => p.trim().replace(/^\*/, ''))

    // Get changed files vs diff_base
    const changedFiles = execSync(
      `git diff --name-only "${diffBase}" 2>/dev/null || true`,
      { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] },
    )
      .trim()
      .split('\n')
      .filter((f) => f && patterns.some((ext) => f.endsWith(ext)))

    // Filter to session-owned files if tracking is available.
    // If filtering produces an empty set (tracking may not cover the full session),
    // fall back to the unfiltered list — better to over-check than miss real tests.
    let filteredFiles = changedFiles
    if (sessionDir) {
      const sessionEdits = readEditsSet(sessionDir)
      if (sessionEdits.size > 0) {
        const scoped = changedFiles.filter(f => sessionEdits.has(f))
        if (scoped.length > 0) {
          filteredFiles = scoped
        }
      }
    }

    if (filteredFiles.length === 0) {
      return { passed: false, newTestCount: 0 }
    }

    // Count new test function declarations added
    const diffOutput = execSync(
      `git diff "${diffBase}" -- ${filteredFiles.map((f) => `"${f}"`).join(' ')} 2>/dev/null || true`,
      { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] },
    )

    const newTestFunctions = (
      diffOutput.match(/^\+\s*(it|test|describe)\s*\(/gm) ?? []
    ).length

    return { passed: newTestFunctions > 0, newTestCount: newTestFunctions }
  } catch {
    // Don't block exit on error — git may not be available
    return { passed: true }
  }
}

/**
 * Check that the spec file for the given issue passes structural validation
 * (frontmatter has phases with tasks). Runs the same logic as `kata validate-spec`.
 */
function checkSpecValid(issueNumber: number): { passed: boolean; reason?: string } {
  const specPath = findSpecFile(issueNumber)
  if (!specPath) {
    return {
      passed: false,
      reason: `No spec file found for issue #${issueNumber}. Expected: planning/specs/${issueNumber}-*.md`,
    }
  }

  const result = validateSpec(specPath)
  if (!result.valid) {
    const errorSummary = result.errors.join('; ')
    return {
      passed: false,
      reason: `Spec validation failed: ${errorSummary}. Fix and re-run: kata validate-spec --issue=${issueNumber}`,
    }
  }

  return { passed: true }
}

/**
 * Check that at least one document was created or modified in a given path.
 * Pluggable: pass a directory path to check. Looks for new/modified files vs diff base.
 *
 * Used by stop conditions like:
 *   - doc_created: planning/research   (research mode)
 *   - doc_created: planning/specs      (planning mode)
 *   - doc_created                      (defaults to research_path from config)
 */
function checkDocCreated(docPath?: string): { passed: boolean; reason?: string } {
  try {
    const cfg = loadKataConfig()
    const targetPath = docPath ?? cfg.research_path ?? 'planning/research'

    // Check for any files in path (new, modified, or untracked)
    const gitFiles = execSync(
      `git ls-files --others --modified -- "${targetPath}" 2>/dev/null || true`,
      { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] },
    ).trim()

    // Also check for committed files in this branch vs diff base
    const diffBase = cfg.project?.diff_base ?? 'origin/main'
    const committedFiles = execSync(
      `git diff --name-only "${diffBase}" -- "${targetPath}" 2>/dev/null || true`,
      { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] },
    ).trim()

    if (!gitFiles && !committedFiles) {
      return {
        passed: false,
        reason: `No document found in ${targetPath}/. Write your deliverable before exiting.`,
      }
    }

    return { passed: true }
  } catch {
    // Don't block exit on error
    return { passed: true }
  }
}

/**
 * Parse a stop condition (handles both string and object forms).
 */
function parseStopCondition(cond: string | { condition: string; stage?: string }): { condition: string; stage?: string } {
  if (typeof cond === 'string') return { condition: cond }
  return cond
}

/**
 * Check if all phases in a given stage are complete (all their tasks are completed).
 */
function isStageComplete(stage: string, sessionId: string, phasesByStage: Map<string, string[]>): boolean {
  const phaseIds = phasesByStage.get(stage)
  if (!phaseIds?.length) return true // No phases in this stage = complete

  const tasks = readNativeTaskFiles(sessionId)
  // Check if all tasks belonging to this stage's phases are completed
  for (const task of tasks) {
    const originalId = (task.metadata?.originalId as string) || ''
    // Task belongs to a phase if its originalId matches the phase ID or starts with it
    const belongsToStage = phaseIds.some(pid => originalId === pid || originalId.startsWith(`${pid}:`) || originalId.startsWith(`${pid}.`))
    if (belongsToStage && task.status !== 'completed') {
      return false
    }
  }
  return true
}

/**
 * Check if exit conditions are met based on the mode's stop_conditions from modes.yaml.
 * Each mode declares which checks to run — no hardcoded mode names.
 * Stop conditions can be strings or objects with optional stage scoping.
 */
function validateCanExit(
  _workflowId: string,
  sessionId: string,
  stopConditions: Array<string | { condition: string; stage?: string }>,
  issueNumber?: number,
  phasesByStage?: Map<string, string[]>,
  deliverablePath?: string,
): {
  canExit: boolean
  reasons: string[]
  advisories: string[]
  hasOpenTasks: boolean
  usingTasks: boolean
} {
  const reasons: string[] = []
  let allAdvisories: string[] = []

  const sessionDir = (() => {
    try {
      const projectDir = findProjectDir()
      return join(getSessionsDir(projectDir), sessionId)
    } catch {
      return undefined
    }
  })()

  // No stop conditions = can always exit
  if (stopConditions.length === 0) {
    return { canExit: true, reasons: [], advisories: [], hasOpenTasks: false, usingTasks: false }
  }

  // Build effective checks set (filter stage-scoped conditions whose stage isn't complete)
  const checks = new Set<string>()
  for (const rawCond of stopConditions) {
    const parsed = parseStopCondition(rawCond)
    if (parsed.stage && phasesByStage) {
      if (!isStageComplete(parsed.stage, sessionId, phasesByStage)) {
        continue // Skip — stage not complete yet
      }
    }
    checks.add(parsed.condition)
  }

  // If we're on the base branch with no diff, work is already merged — skip git checks only.
  // tasks_complete is still checked so pending tasks block exit even with no diff.
  let skipGitChecks = false
  try {
    const cfg = loadKataConfig()
    const diffBase = cfg.project?.diff_base ?? 'origin/main'
    const baseBranch = diffBase.replace(/^origin\//, '')
    const currentBranch = execSync('git rev-parse --abbrev-ref HEAD 2>/dev/null || true', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim()
    const hasDiff = execSync(`git diff --name-only "${diffBase}" 2>/dev/null || true`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim()
    if (currentBranch === baseBranch && !hasDiff) {
      skipGitChecks = true
    }
  } catch {
    // Continue with normal checks if git is unavailable
  }

  // ── tasks_complete ──
  const pendingCount = checks.has('tasks_complete') ? countPendingNativeTasks(sessionId) : 0
  const hasOpenTasks = pendingCount > 0
  const usingTasks = checks.has('tasks_complete') && existsSync(getNativeTasksDir(sessionId))

  if (hasOpenTasks) {
    const pendingTitles = getPendingNativeTaskTitles(sessionId)
    reasons.push(`${pendingCount} task(s) still pending`)
    for (const title of pendingTitles.slice(0, 5)) {
      reasons.push(`  - ${title}`)
    }
    if (pendingTitles.length > 5) {
      reasons.push(`  ... and ${pendingTitles.length - 5} more`)
    }
  }

  // Load config once for staleness checks
  const wmConfig = loadKataConfig()
  const nonCodePaths = wmConfig.non_code_paths

  if (!skipGitChecks) {
    // ── tests_pass ──
    if (checks.has('tests_pass') && issueNumber) {
      const testsCheck = checkTestsPass(issueNumber, nonCodePaths)
      if (!testsCheck.passed && testsCheck.reason) {
        reasons.push(testsCheck.reason)
      }
    }

    // ── feature_tests_added ──
    if (checks.has('feature_tests_added')) {
      const featureTestsCheck = checkFeatureTestsAdded(sessionDir)
      if (!featureTestsCheck.passed) {
        reasons.push(
          'At least one new test function required (it/test/describe). See: arXiv 2402.13521',
        )
      }
    }

    // ── spec_valid ──
    if (checks.has('spec_valid') && issueNumber) {
      const specCheck = checkSpecValid(issueNumber)
      if (!specCheck.passed && specCheck.reason) {
        reasons.push(specCheck.reason)
      }
    }

    // ── doc_created ──
    if (checks.has('doc_created')) {
      const docCheck = checkDocCreated(deliverablePath)
      if (!docCheck.passed && docCheck.reason) {
        reasons.push(docCheck.reason)
      }
    }

    // ── committed + pushed (check after task/verification checks) ──
    if (reasons.length === 0) {
      if (checks.has('committed') || checks.has('pushed')) {
        const globalCheck = checkGlobalConditions(checks, sessionDir)
        reasons.push(...globalCheck.reasons)
        allAdvisories = globalCheck.advisories
      }
    }
  }

  return {
    canExit: reasons.length === 0,
    reasons,
    advisories: allAdvisories,
    hasOpenTasks,
    usingTasks,
  }
}

/**
 * Build stop guidance from validation results
 */
function buildStopGuidance(
  canExitNow: boolean,
  hasOpenTasks: boolean,
  usingTasks: boolean,
  sessionId: string,
  workflowId: string,
  issueNumber: number | undefined,
): StopGuidance | undefined {
  // No guidance needed if can exit
  if (canExitNow) return undefined

  // Get next task for next step guidance (only if open)
  let nextPhase: StopGuidance['nextPhase']
  let nextStepMessage: string | undefined
  if (hasOpenTasks && usingTasks) {
    // Check if all open tasks are in_progress (being worked by background agents)
    const { allInProgress, inProgressCount } = areAllOpenTasksInProgress(sessionId)

    if (allInProgress) {
      // All open tasks are in_progress — agents are working.
      // The stop hook now detects active agents via transcript scanning and allows exit,
      // so this message is only shown when can-exit is called directly (not via stop hook).
      nextStepMessage = `\n**⏳ ${inProgressCount} task(s) in progress — background agents are working.**\nThe stop hook will allow exit while agents are active. You'll be notified when they complete.`
    } else {
      const firstTask = getFirstPendingNativeTask(sessionId)
      if (firstTask) {
        nextPhase = {
          beadId: firstTask.id, // Using beadId field for task id (legacy field name)
          title: firstTask.title,
        }
        // Include pre-formatted message - use TaskUpdate for native tasks
        nextStepMessage = `\n**Next task:** [${firstTask.id}] ${firstTask.title}\n\nComplete with: TaskUpdate(taskId="${firstTask.id}", status="completed")`
      }
    }
  }

  return {
    nextPhase,
    nextStepMessage,
    escapeHatch: getEscapeHatchMessage(),
  }
}

/**
 * kata can-exit [--json] [--session=SESSION_ID]
 * Checks if exit conditions are met (based on native tasks)
 */
export async function canExit(args: string[]): Promise<void> {
  const parsed = parseArgs(args)

  const sessionId = parsed.session || (await getCurrentSessionId())
  const stateFile = await getStateFilePath(sessionId)
  const state = await readState(stateFile)

  const workflowId = state.workflowId || ''
  const sessionType = state.sessionType || state.currentMode || 'default'
  const issueNumber = state.issueNumber ?? undefined

  // Load mode config to get stop_conditions
  const kataConfig = loadKataConfig()
  const modeConfig = kataConfig.modes[sessionType]
  const stopConditions: Array<string | { condition: string; stage?: string }> = [...(modeConfig?.stop_conditions ?? [])]
  const deliverablePath = modeConfig?.deliverable_path

  // Merge template global_conditions (e.g., changes_committed, changes_pushed)
  // Template conditions use "changes_" prefix; normalize to match check names
  let phasesByStage: Map<string, string[]> | undefined
  if (state.template) {
    try {
      const { parseTemplateYaml } = await import('./enter/template.js')
      const { resolveTemplatePath } = await import('../session/lookup.js')
      const fullPath = state.template.startsWith('/') ? state.template : resolveTemplatePath(state.template)
      const templateYaml = parseTemplateYaml(fullPath)
      if (templateYaml?.global_conditions) {
        for (const cond of templateYaml.global_conditions) {
          // Normalize: "changes_committed" → "committed", "changes_pushed" → "pushed"
          const normalized = cond.replace(/^changes_/, '')
          const alreadyPresent = stopConditions.some(c => {
            const parsed = parseStopCondition(c)
            return parsed.condition === normalized
          })
          if (!alreadyPresent) {
            stopConditions.push(normalized)
          }
        }
      }
      // Compute phasesByStage for stage-scoped stop condition evaluation
      if (templateYaml?.phases) {
        phasesByStage = new Map()
        for (const p of templateYaml.phases) {
          if (p.stage) {
            const existing = phasesByStage.get(p.stage) || []
            existing.push(p.id)
            phasesByStage.set(p.stage, existing)
          }
        }
      }
    } catch {
      // Template not found or parse error — don't block exit
    }
  }

  const {
    canExit: canExitNow,
    reasons,
    advisories,
    hasOpenTasks,
    usingTasks,
  } = validateCanExit(workflowId, sessionId, stopConditions, issueNumber, phasesByStage, deliverablePath)

  // Build guidance for stop hook (only if can't exit)
  const guidance = buildStopGuidance(
    canExitNow,
    hasOpenTasks,
    usingTasks,
    sessionId,
    workflowId,
    issueNumber,
  )

  if (parsed.json) {
    // biome-ignore lint/suspicious/noConsole: intentional CLI output
    console.log(
      JSON.stringify(
        {
          canExit: canExitNow,
          reasons,
          advisories,
          guidance,
          workflowId,
          sessionType,
          usingTasks,
          checkedAt: new Date().toISOString(),
        },
        null,
        2,
      ),
    )
  } else {
    if (canExitNow) {
      // biome-ignore lint/suspicious/noConsole: intentional CLI output
      console.log('✓ All tasks complete. Can exit.')
    } else {
      // biome-ignore lint/suspicious/noConsole: intentional CLI output
      console.log('✗ Cannot exit:')
      for (const reason of reasons) {
        // biome-ignore lint/suspicious/noConsole: intentional CLI output
        console.log(`  ${reason}`)
      }
      // Show guidance in human-readable form
      if (guidance?.nextStepMessage) {
        // biome-ignore lint/suspicious/noConsole: intentional CLI output
        console.log(guidance.nextStepMessage)
      } else if (guidance?.nextPhase) {
        // biome-ignore lint/suspicious/noConsole: intentional CLI output
        console.log(
          getNextStepMessage({ id: guidance.nextPhase.beadId, title: guidance.nextPhase.title }),
        )
      }
    }
    for (const advisory of advisories) {
      // biome-ignore lint/suspicious/noConsole: intentional CLI output
      console.log(`  ℹ️  ${advisory}`)
    }
  }

  // Exit code 0 if can exit, 1 if not
  process.exitCode = canExitNow ? 0 : 1
}
