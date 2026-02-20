// Task creation utilities for enter command (replaces bead-factory.ts)
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { resolveTemplatePath } from '../../session/lookup.js'
import type { SubphasePattern } from '../../validation/index.js'
import type { SpecPhase } from '../../yaml/index.js'
import { applyPlaceholders } from './guidance.js'
import { parseTemplateYaml } from './template.js'

export interface Task {
  id: string
  title: string
  done: boolean
  depends_on: string[]
  completedAt: string | null
  reason: string | null
  instruction?: string
}

export interface TasksFile {
  workflow: string
  issue: number | null
  createdAt: string
  tasks: Task[]
}

/**
 * Build tasks from spec phases using subphase pattern (pure function, no I/O)
 * Spec phases become P2.1, P2.2, etc. (nested under container phase)
 * Pattern defines what tasks to create per phase (e.g., impl → codex → gemini)
 */
export function buildSpecTasks(
  specPhases: SpecPhase[],
  issueNum: number,
  subphasePattern: SubphasePattern[],
  containerPhaseNum: number = 2,
): Task[] {
  const tasks: Task[] = []

  // biome-ignore lint/suspicious/noConsole: intentional CLI output
  console.error(`Building tasks from spec phases for GH#${issueNum}`)

  for (let i = 0; i < specPhases.length; i++) {
    const phase = specPhases[i]
    const phaseNum = i + 1
    const phaseName = phase.name || phase.id.toUpperCase()
    const phaseLabel = `P${containerPhaseNum}.${phaseNum}`

    // biome-ignore lint/suspicious/noConsole: intentional CLI output
    console.error(`  ${phaseLabel}: ${phaseName}`)

    if (phase.tasks?.length) {
      const taskSummary =
        phase.tasks.length === 1
          ? phase.tasks[0]
          : `${phase.tasks[0]} + ${phase.tasks.length - 1} more`

      let prevTaskId: string | null = null

      for (const patternItem of subphasePattern) {
        const titleContent = applyPlaceholders(patternItem.title_template, {
          taskSummary,
          phaseName,
          phaseLabel,
        })
        const fullTitle = `GH#${issueNum}: ${phaseLabel}: ${titleContent}`
        const taskId = `p${containerPhaseNum}.${phaseNum}:${patternItem.id_suffix}`

        const dependsOn: string[] = []

        if (patternItem.depends_on_previous && prevTaskId) {
          dependsOn.push(prevTaskId)
        }

        if (phaseNum > 1 && subphasePattern.length > 0 && dependsOn.length === 0) {
          const lastPatternItem = subphasePattern[subphasePattern.length - 1]
          const prevPhaseLastTaskId = `p${containerPhaseNum}.${phaseNum - 1}:${lastPatternItem.id_suffix}`
          dependsOn.push(prevPhaseLastTaskId)
        }

        tasks.push({
          id: taskId,
          title: fullTitle,
          done: false,
          depends_on: dependsOn,
          completedAt: null,
          reason: null,
        })

        // biome-ignore lint/suspicious/noConsole: intentional CLI output
        console.error(`    Created: ${taskId}`)
        // biome-ignore lint/suspicious/noConsole: intentional CLI output
        console.error(`      Title: ${fullTitle}`)

        if (dependsOn.length > 0) {
          // biome-ignore lint/suspicious/noConsole: intentional CLI output
          console.error(`    Dependency: ${taskId} depends on ${dependsOn.join(', ')}`)
        }

        prevTaskId = taskId
      }
    }
  }

  return tasks
}

/**
 * Build phase tasks from a template path (resolves template, returns Task[])
 *
 * Task creation logic:
 * 1. Phase with steps → creates ONE task per step (detailed trackable units with instructions)
 * 2. Phase with task_config only (no steps) → creates ONE phase-level task
 * 3. Container phases (no task_config, no steps) → skipped here, handled by buildSpecTasks
 *
 * Step tasks: first step inherits phase deps, subsequent steps depend on previous step.
 * phaseLastTaskId tracks the last task of each phase for cross-phase dependency wiring.
 */
export function buildPhaseTasks(
  templatePath: string,
  workflowId: string,
  issueNum?: number,
): Task[] {
  const fullTemplatePath = resolveTemplatePath(templatePath)

  const template = parseTemplateYaml(fullTemplatePath)
  if (!template?.phases?.length) {
    return []
  }

  const tasks: Task[] = []

  // biome-ignore lint/suspicious/noConsole: intentional CLI output
  console.error(`Building phase tasks for workflow: ${workflowId}`)

  // Tracks the last task ID per phase — used to chain cross-phase dependencies
  const phaseLastTaskId = new Map<string, string>()

  for (const phase of template.phases) {
    // Resolve phase-level dependencies (declared in task_config.depends_on)
    const phaseDependsOn: string[] = []
    if (phase.task_config?.depends_on?.length) {
      for (const depPhaseId of phase.task_config.depends_on) {
        const lastId = phaseLastTaskId.get(depPhaseId)
        if (lastId) phaseDependsOn.push(lastId)
      }
    }

    if (phase.steps?.length) {
      // Expand steps into individual tasks — each step gets its own native task
      let prevStepTaskId: string | null = null

      for (let i = 0; i < phase.steps.length; i++) {
        const step = phase.steps[i]
        const taskId = `${phase.id}:${step.id}`
        const title = issueNum
          ? `GH#${issueNum}: ${phase.id.toUpperCase()}: ${step.title}`
          : `${workflowId}: ${phase.name}: ${step.title}`

        const dependsOn: string[] = []
        if (i === 0) {
          // First step inherits phase-level dependencies
          dependsOn.push(...phaseDependsOn)
        } else if (prevStepTaskId) {
          // Each subsequent step depends on the previous step
          dependsOn.push(prevStepTaskId)
        }

        tasks.push({
          id: taskId,
          title,
          done: false,
          depends_on: dependsOn,
          completedAt: null,
          reason: null,
          instruction: step.instruction,
        })

        // biome-ignore lint/suspicious/noConsole: intentional CLI output
        console.error(`  Created step task: ${taskId}`)
        if (dependsOn.length > 0) {
          // biome-ignore lint/suspicious/noConsole: intentional CLI output
          console.error(`    Depends on: ${dependsOn.join(', ')}`)
        }

        prevStepTaskId = taskId
      }

      // Last step of this phase is the dependency anchor for subsequent phases
      if (prevStepTaskId) phaseLastTaskId.set(phase.id, prevStepTaskId)
    } else if (phase.task_config?.title) {
      // No steps: create a single phase-level task (summary task)
      const fullTitle = issueNum
        ? `GH#${issueNum}: ${phase.task_config.title}`
        : `${workflowId}: ${phase.task_config.title}`

      const taskId = phase.id

      tasks.push({
        id: taskId,
        title: fullTitle,
        done: false,
        depends_on: phaseDependsOn,
        completedAt: null,
        reason: null,
      })

      phaseLastTaskId.set(phase.id, taskId)

      // biome-ignore lint/suspicious/noConsole: intentional CLI output
      console.error(`  Created phase task: ${phase.id} → ${taskId}`)
      if (phaseDependsOn.length > 0) {
        // biome-ignore lint/suspicious/noConsole: intentional CLI output
        console.error(`    Depends on: ${phaseDependsOn.join(', ')}`)
      }
    }
    // Container phases (no task_config, no steps) are skipped — handled by buildSpecTasks
  }

  return tasks
}

/**
 * Native task format (stored at ~/.claude/tasks/{session-id}/{id}.json)
 */
export interface NativeTask {
  id: string
  subject: string
  description: string
  activeForm: string
  status: 'pending' | 'in_progress' | 'completed'
  blocks: string[]
  blockedBy: string[]
  metadata: Record<string, unknown>
}

/**
 * Get the native tasks directory for a session
 */
export function getNativeTasksDir(sessionId: string): string {
  return join(homedir(), '.claude', 'tasks', sessionId)
}

/**
 * Remove all native task files for a session.
 * Called before writing new tasks (ensures clean state) and on mode transitions.
 */
export function clearNativeTaskFiles(sessionId: string): void {
  const tasksDir = getNativeTasksDir(sessionId)
  if (existsSync(tasksDir)) {
    rmSync(tasksDir, { recursive: true })
  }
}

/**
 * Convert workflow tasks to native Claude Code task format and write to ~/.claude/tasks/{session-id}/
 * Native tasks use incrementing integer IDs (1.json, 2.json, etc.)
 * Always clears existing tasks before writing (ensures no stale tasks from previous mode/issue).
 */
export function writeNativeTaskFiles(
  sessionId: string,
  tasks: Task[],
  workflowId: string,
  issueNum: number | null,
): string {
  const tasksDir = getNativeTasksDir(sessionId)

  // Always start fresh - clears stale tasks from previous mode/issue
  clearNativeTaskFiles(sessionId)
  mkdirSync(tasksDir, { recursive: true })

  // Map our task IDs to native integer IDs
  const idMap = new Map<string, string>()
  for (let i = 0; i < tasks.length; i++) {
    idMap.set(tasks[i].id, String(i + 1))
  }

  // Build blockedBy → blocks reverse mapping
  const blocksMap = new Map<string, string[]>()
  for (const task of tasks) {
    for (const dep of task.depends_on) {
      const depNativeId = idMap.get(dep)
      const taskNativeId = idMap.get(task.id)
      if (depNativeId && taskNativeId) {
        const existing = blocksMap.get(depNativeId) || []
        existing.push(taskNativeId)
        blocksMap.set(depNativeId, existing)
      }
    }
  }

  // Write each task as a JSON file
  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i]
    const nativeId = String(i + 1)

    // Convert depends_on IDs to native IDs
    const blockedBy = task.depends_on
      .map((dep) => idMap.get(dep))
      .filter((id): id is string => id !== undefined)

    const blocks = blocksMap.get(nativeId) || []

    // Derive activeForm from title (present continuous)
    const activeForm = deriveActiveForm(task.title)

    const nativeTask: NativeTask = {
      id: nativeId,
      subject: task.title,
      description: task.instruction?.trim() || `Workflow task from ${workflowId}. Original ID: ${task.id}`,
      activeForm,
      status: task.done ? 'completed' : 'pending',
      blocks,
      blockedBy,
      metadata: {
        workflowId,
        issueNumber: issueNum,
        originalId: task.id,
      },
    }

    const filePath = join(tasksDir, `${nativeId}.json`)
    writeFileSync(filePath, `${JSON.stringify(nativeTask, null, 2)}\n`)
  }

  // biome-ignore lint/suspicious/noConsole: intentional CLI output
  console.error(`Native tasks written: ${tasksDir} (${tasks.length} tasks)`)

  return tasksDir
}

/**
 * Derive a present-continuous activeForm from a task title
 * e.g. "GH#123: P2.1: Implement schema" → "Implementing schema"
 */
function deriveActiveForm(title: string): string {
  // Strip prefix patterns like "GH#123: P2.1: " or "GH#123: P2.1:impl: "
  const stripped = title.replace(/^(GH#\d+:\s*)?(P?\d+\.?\d*:?\s*)?/i, '').trim()

  // Handle known task type patterns
  if (/^CODEX\b/i.test(stripped)) {
    const rest = stripped.replace(/^CODEX\s*-?\s*/i, '').trim()
    return `Running Codex review: ${rest}`
  }
  if (/^at\s+verify\b/i.test(stripped)) {
    const rest = stripped.replace(/^at\s+verify\s+work\s*-?\s*/i, '').trim()
    return `Running verification: ${rest}`
  }

  // Generic: convert first verb to -ing form
  const words = stripped.split(/\s+/)
  if (words.length > 0) {
    const verb = words[0].toLowerCase()
    if (verb.endsWith('e') && !verb.endsWith('ee')) {
      words[0] = `${verb.slice(0, -1)}ing`
    } else if (verb.match(/[^aeiou][aeiou][^aeiou]$/) && !verb.endsWith('w')) {
      words[0] = `${verb}${verb[verb.length - 1]}ing`
    } else {
      words[0] = `${verb}ing`
    }
    // Capitalize first letter
    words[0] = words[0].charAt(0).toUpperCase() + words[0].slice(1)
  }

  return words.join(' ')
}

/**
 * Read all native task files from a session directory
 * Returns empty array if directory doesn't exist or has no valid tasks
 */
export function readNativeTaskFiles(sessionId: string): NativeTask[] {
  const tasksDir = getNativeTasksDir(sessionId)
  if (!existsSync(tasksDir)) {
    return []
  }

  const tasks: NativeTask[] = []

  try {
    const entries = readdirSync(tasksDir)

    for (const entry of entries) {
      if (entry.endsWith('.json')) {
        try {
          const filePath = join(tasksDir, entry)
          const content = readFileSync(filePath, 'utf-8')
          const task = JSON.parse(content) as NativeTask
          tasks.push(task)
        } catch {
          // Skip invalid files
        }
      }
    }
  } catch {
    return []
  }

  // Sort by ID (numeric)
  tasks.sort((a, b) => Number.parseInt(a.id, 10) - Number.parseInt(b.id, 10))

  return tasks
}

/**
 * Count pending native tasks for a session
 * Used by can-exit to check stop conditions
 */
export function countPendingNativeTasks(sessionId: string): number {
  const tasks = readNativeTaskFiles(sessionId)
  return tasks.filter((t) => t.status !== 'completed').length
}

/**
 * Get titles of pending native tasks for a session
 * Used by can-exit for stop condition details
 */
export function getPendingNativeTaskTitles(sessionId: string): string[] {
  const tasks = readNativeTaskFiles(sessionId)
  return tasks.filter((t) => t.status !== 'completed').map((t) => `[${t.id}] ${t.subject}`)
}

/**
 * Get the first pending native task for a session
 * Used by can-exit for next step guidance
 */
export function getFirstPendingNativeTask(
  sessionId: string,
): { id: string; title: string } | undefined {
  const tasks = readNativeTaskFiles(sessionId)
  const pending = tasks.find((t) => t.status !== 'completed')
  if (!pending) return undefined
  return { id: pending.id, title: pending.subject }
}
