// Task creation utilities for enter command (replaces bead-factory.ts)
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { resolveTemplatePath } from '../../session/lookup.js'
import type { AgentProtocol, Hint, SubphasePattern } from '../../validation/index.js'
import type { SpecPhase } from '../../yaml/index.js'
import { resolvePlaceholders } from './placeholder.js'
import { loadStepLibrary, resolveStepRef } from './step-library.js'
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

const VP_FALLBACK_TEXT =
  'No verification plan found in spec. Run process gates only: kata check-phase {phase_label} --issue={issue}'

/**
 * Extract the ## Verification Plan section from spec markdown.
 * Returns the full section content (heading + body) or null if not found.
 */
export function extractVerificationPlan(specContent: string): string | null {
  const vpHeading = /^## Verification Plan\s*$/im
  const match = vpHeading.exec(specContent)
  if (!match || match.index === undefined) return null

  const start = match.index + match[0].length
  const rest = specContent.slice(start)
  const nextHeading = /^## /m.exec(rest)
  const end = nextHeading ? start + nextHeading.index : specContent.length

  return specContent.slice(match.index, end).trim()
}

/**
 * Parsed VP step from a ## Verification Plan section.
 */
export interface VpStep {
  /** Step ID, e.g. "VP1", "VP2" */
  id: string
  /** Step title after "### VPn: " */
  title: string
  /** Full markdown content of the VP step (including the ### heading) */
  instruction: string
}

/**
 * Parse individual VP steps from a Verification Plan section.
 * Splits content on ### VPn: headings into separate VpStep objects.
 *
 * @param vpContent - Full VP section content (from extractVerificationPlan)
 * @returns Array of VpStep objects, empty if no ### VPn: headings found
 */
export function parseVpSteps(vpContent: string): VpStep[] {
  const steps: VpStep[] = []
  const pattern = /^### (VP\d+):\s*(.+)$/gm
  const positions: Array<{ id: string; title: string; start: number }> = []

  let match: RegExpExecArray | null
  while ((match = pattern.exec(vpContent)) !== null) {
    positions.push({ id: match[1], title: match[2].trim(), start: match.index })
  }

  for (let i = 0; i < positions.length; i++) {
    const start = positions[i].start
    const end = i + 1 < positions.length ? positions[i + 1].start : vpContent.length
    steps.push({
      id: positions[i].id,
      title: positions[i].title,
      instruction: vpContent.slice(start, end).trim(),
    })
  }
  return steps
}

/**
 * Build tasks from spec phases using subphase pattern (pure function, no I/O)
 * Spec phases become P2.1, P2.2, etc. (nested under spec expansion phase)
 * Pattern defines what tasks to create per phase (e.g., impl → codex → gemini)
 *
 * @param specContent - Raw markdown content of the spec file. When provided,
 *   the ## Verification Plan section is extracted and injected into any
 *   {verification_plan} placeholders in subphase pattern instructions.
 */
export function buildSpecTasks(
  specPhases: SpecPhase[],
  issueNum: number,
  subphasePattern: SubphasePattern[],
  specExpansionPhaseNum: number = 2,
  specContent?: string,
  reviewers?: string,
  phaseSkill?: string,
): Task[] {
  const tasks: Task[] = []

  for (let i = 0; i < specPhases.length; i++) {
    const phase = specPhases[i]
    const phaseNum = i + 1
    const phaseName = phase.name || phase.id.toUpperCase()
    const phaseLabel = `P${specExpansionPhaseNum}.${phaseNum}`

    // biome-ignore lint/suspicious/noConsole: intentional CLI output
    console.error(`  ${phaseLabel}: ${phaseName}`)

    if (phase.tasks?.length) {
      const taskSummary =
        phase.tasks.length === 1
          ? phase.tasks[0]
          : `${phase.tasks[0]} + ${phase.tasks.length - 1} more`

      let prevTaskId: string | null = null

      for (const patternItem of subphasePattern) {
        const titleContent = resolvePlaceholders(patternItem.title_template, {
          extra: { task_summary: taskSummary, phase_name: phaseName, phase_label: phaseLabel, reviewers: reviewers ?? 'Invoke /code-review' },
        })
        const fullTitle = `GH#${issueNum}: ${phaseLabel}: ${titleContent}`
        const taskId = `p${specExpansionPhaseNum}.${phaseNum}:${patternItem.id_suffix}`

        const dependsOn: string[] = []

        if (patternItem.depends_on_previous && prevTaskId) {
          dependsOn.push(prevTaskId)
        }

        if (phaseNum > 1 && subphasePattern.length > 0 && dependsOn.length === 0) {
          const lastPatternItem = subphasePattern[subphasePattern.length - 1]
          const prevPhaseLastTaskId = `p${specExpansionPhaseNum}.${phaseNum - 1}:${lastPatternItem.id_suffix}`
          dependsOn.push(prevPhaseLastTaskId)
        }

        // Build instruction from pattern: explicit instruction template + agent config
        let instruction: string | undefined
        if (patternItem.instruction) {
          const vpContent = specContent ? extractVerificationPlan(specContent) : null
          instruction = resolvePlaceholders(patternItem.instruction, {
            extra: { task_summary: taskSummary, phase_name: phaseName, phase_label: phaseLabel, reviewers: reviewers ?? 'Invoke /code-review' },
          })
            .replace(/{issue}/g, String(issueNum))
            .replace(/{verification_plan}/g, vpContent ?? VP_FALLBACK_TEXT)
        }
        if (patternItem.agent) {
          const agentLine = `\nRun this command:\n\`\`\`bash\nkata review --prompt=${patternItem.agent.prompt}` +
            (patternItem.agent.provider ? ` --provider=${patternItem.agent.provider}` : '') +
            (patternItem.agent.model ? ` --model=${patternItem.agent.model}` : '') +
            `\n\`\`\``
          instruction = (instruction ?? '') + agentLine
        }
        if (phaseSkill) {
          const skillSection = `## Skill\nInvoke /${phaseSkill} before starting this task.\n`
          instruction = skillSection + '\n' + (instruction ?? '')
        }
        if (patternItem.hints?.length) {
          const hintsBlock = renderHints(patternItem.hints)
          instruction = (instruction ?? '') + '\n\n' + hintsBlock
        }

        tasks.push({
          id: taskId,
          title: fullTitle,
          done: false,
          depends_on: dependsOn,
          completedAt: null,
          reason: null,
          instruction,
        })

        prevTaskId = taskId
      }
    }
  }

  return tasks
}

/**
 * Build agent expansion protocol instruction block for agent-expanded phases.
 */
/**
 * Build agent expansion protocol instruction.
 * Uses {this_task_id} and {blocked_task_ids} placeholders — resolved at native task write time.
 */
function buildAgentExpansionInstruction(
  protocol: { max_tasks: number; require_labels?: string[] },
): string {
  const lines = [
    `Create child tasks with TaskCreate. Max ${protocol.max_tasks} tasks.`,
    'Chain tasks with addBlockedBy so they run in order.',
    'Do NOT complete task #{this_task_id} until all child tasks are done.',
    'Last child task must use addBlocks: [{blocked_task_ids}] to gate the next phase.',
  ]

  if (protocol.require_labels?.length) {
    lines.push(`Required labels: [${protocol.require_labels.join(', ')}]`)
  }

  return lines.join('\n')
}

/**
 * Build phase tasks from a template path (resolves template, returns Task[])
 *
 * Task creation logic:
 * Each phase produces exactly ONE task. Steps within a phase are combined into
 * the task instruction — they are sequential guidance, not separate tasks.
 *
 * Phase types:
 * - Phase with skill → skill invocation as instruction
 * - Phase with instruction → instruction as-is
 * - Phase with agent expansion → skill + expansion protocol
 * - Phase with steps → steps resolved and combined into instruction body
 *
 * phaseLastTaskId tracks the last task of each phase for cross-phase dependency wiring.
 */
export function buildPhaseTasks(
  templatePath: string,
  workflowId: string,
  issueNum?: number,
  reviewers?: string,
): Task[] {
  const fullTemplatePath = resolveTemplatePath(templatePath)

  const template = parseTemplateYaml(fullTemplatePath)
  if (!template?.phases?.length) {
    return []
  }

  const stepLibrary = loadStepLibrary()

  const tasks: Task[] = []

  // Tracks the last task ID per phase — used to chain cross-phase dependencies
  const phaseLastTaskId = new Map<string, string>()

  for (const phase of template.phases) {
    if (!phase.task_config?.title) continue

    // Resolve phase-level dependencies (declared in task_config.depends_on)
    const phaseDependsOn: string[] = []
    if (phase.task_config?.depends_on?.length) {
      for (const depPhaseId of phase.task_config.depends_on) {
        const lastId = phaseLastTaskId.get(depPhaseId)
        if (lastId) phaseDependsOn.push(lastId)
      }
    }

    const fullTitle = issueNum
      ? `GH#${issueNum}: ${phase.task_config.title}`
      : phase.task_config.title

    const taskId = phase.id

    // Build instruction from phase config
    let instruction: string | undefined

    // Skill invocation (phase-level)
    if (phase.skill) {
      instruction = `Invoke /${phase.skill}`
    }

    // Agent expansion protocol
    if (phase.expansion === 'agent' && phase.agent_protocol) {
      const expansion = buildAgentExpansionInstruction(phase.agent_protocol)
      instruction = instruction ? `${instruction}\n${expansion}` : expansion
    }

    // Phase-level instruction (from task_config)
    if (phase.task_config.instruction) {
      const phaseInstruction = reviewers
        ? phase.task_config.instruction.replace(/{reviewers}/g, reviewers)
        : phase.task_config.instruction
      instruction = instruction ? `${instruction}\n\n${phaseInstruction}` : phaseInstruction
    }

    // Steps — resolve and combine into instruction body
    if (phase.steps?.length) {
      const stepLines: string[] = []
      for (const step of phase.steps) {
        let resolvedStep = step
        if (step['$ref']) {
          const resolved = resolveStepRef(step['$ref'], step, stepLibrary)
          resolvedStep = { ...step, ...resolved }
        }
        const stepTitle = resolvedStep.title ?? resolvedStep.id
        const resolvedTitle = reviewers ? stepTitle.replace(/{reviewers}/g, reviewers) : stepTitle

        let stepBlock = `### ${resolvedTitle}`
        if (resolvedStep.skill) {
          stepBlock += `\nInvoke /${resolvedStep.skill}`
        }
        if (resolvedStep.instruction) {
          const resolvedInstruction = reviewers
            ? resolvedStep.instruction.replace(/{reviewers}/g, reviewers)
            : resolvedStep.instruction
          stepBlock += `\n${resolvedInstruction.trim()}`
        }
        if (resolvedStep.hints?.length) {
          stepBlock += `\n${renderHints(resolvedStep.hints)}`
        }
        stepLines.push(stepBlock)
      }
      const stepsBody = stepLines.join('\n\n')
      instruction = instruction ? `${instruction}\n\n${stepsBody}` : stepsBody
    }

    tasks.push({
      id: taskId,
      title: fullTitle,
      done: false,
      depends_on: phaseDependsOn,
      completedAt: null,
      reason: null,
      instruction,
    })

    phaseLastTaskId.set(phase.id, taskId)
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
 * Build a single NativeTask from a workflow Task, resolving placeholders and deriving fields.
 */
function buildNativeTask(
  task: Task,
  nativeId: string,
  blockedBy: string[],
  blocks: string[],
  workflowId: string,
  issueNum: number | null,
): NativeTask {
  const activeForm = deriveActiveForm(task.title)

  // Resolve agent expansion placeholders now that native IDs are known
  let resolvedInstruction = task.instruction
  if (resolvedInstruction?.includes('{this_task_id}')) {
    const blockedIds = blocks.map(id => `"${id}"`).join(', ')
    resolvedInstruction = resolvedInstruction
      .replace(/{this_task_id}/g, nativeId)
      .replace(/{blocked_task_ids}/g, blockedIds)
  }

  // Append first meaningful line of instruction to subject so TaskList shows guidance
  let subject = task.title
  if (resolvedInstruction) {
    const firstLine = resolvedInstruction
      .split('\n')
      .map(l => l.trim())
      .find(l => l.length > 0 && !l.startsWith('#') && !l.startsWith('```'))
    if (firstLine) {
      const snippet = firstLine.length > 80 ? `${firstLine.slice(0, 77)}...` : firstLine
      subject = `${task.title} — ${snippet}`
    }
  }

  return {
    id: nativeId,
    subject,
    description: resolvedInstruction?.trim() || `Workflow task from ${workflowId}. Original ID: ${task.id}`,
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
}

/**
 * Convert workflow tasks to native Claude Code task format.
 * When dryRun is false (default), writes JSON files to ~/.claude/tasks/{session-id}/.
 * When dryRun is true, builds and returns the resolved tasks without writing to disk.
 * In both cases, prints a dry-run preview table to stderr when dryRun is true.
 */
export function writeNativeTaskFiles(
  sessionId: string,
  tasks: Task[],
  workflowId: string,
  issueNum: number | null,
  dryRun = false,
): { tasksDir: string; nativeTasks: NativeTask[] } {
  const tasksDir = getNativeTasksDir(sessionId)

  if (!dryRun) {
    clearNativeTaskFiles(sessionId)
    mkdirSync(tasksDir, { recursive: true })
  }

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

  const nativeTasks: NativeTask[] = []

  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i]
    const nativeId = String(i + 1)
    const blockedBy = task.depends_on
      .map((dep) => idMap.get(dep))
      .filter((id): id is string => id !== undefined)
    const blocks = blocksMap.get(nativeId) || []

    const nativeTask = buildNativeTask(task, nativeId, blockedBy, blocks, workflowId, issueNum)
    nativeTasks.push(nativeTask)

    if (!dryRun) {
      const filePath = join(tasksDir, `${nativeId}.json`)
      writeFileSync(filePath, `${JSON.stringify(nativeTask, null, 2)}\n`)
    }
  }

  // Dry-run: print resolved task preview to stderr
  if (dryRun) {
    // biome-ignore lint/suspicious/noConsole: intentional CLI output
    console.error('')
    for (const nt of nativeTasks) {
      const deps = nt.blockedBy.length > 0 ? ` [blocked by #${nt.blockedBy.join(', #')}]` : ''
      // biome-ignore lint/suspicious/noConsole: intentional CLI output
      console.error(`  #${nt.id} ${nt.subject}${deps}`)
      if (nt.description) {
        for (const line of nt.description.split('\n')) {
          // biome-ignore lint/suspicious/noConsole: intentional CLI output
          console.error(`      ${line}`)
        }
      }
    }
    // biome-ignore lint/suspicious/noConsole: intentional CLI output
    console.error('')
  }

  return { tasksDir, nativeTasks }
}

/**
 * Render hints array into a markdown block for task instructions.
 */
function renderHints(hints: Hint[]): string {
  const lines = ['## Hints', '']
  for (const hint of hints) {
    if ('read' in hint) {
      lines.push(`- **Read:** ${hint.read}${hint.section ? ` (section: ${hint.section})` : ''}`)
    } else if ('bash' in hint) {
      lines.push(`- **Bash:** \`${hint.bash}\``)
    } else if ('search' in hint) {
      lines.push(`- **Search:** \`${hint.search}\`${hint.glob ? ` in ${hint.glob}` : ''}`)
    } else if ('agent' in hint) {
      lines.push(`- **Agent:** ${hint.agent.subagent_type} — ${hint.agent.prompt}`)
    } else if ('skill' in hint) {
      lines.push(`- **Skill:** /${hint.skill}${hint.args ? ` ${hint.args}` : ''}`)
    } else if ('ask' in hint) {
      lines.push(`- **Ask:** ${hint.ask.question}`)
    }
  }
  return lines.join('\n')
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

/**
 * Check if all non-completed tasks are in_progress (being worked by agents)
 * Used by can-exit to provide "wait for agents" guidance instead of "do next task"
 */
export function areAllOpenTasksInProgress(sessionId: string): { allInProgress: boolean; inProgressCount: number } {
  const tasks = readNativeTaskFiles(sessionId)
  const nonCompleted = tasks.filter((t) => t.status !== 'completed')
  if (nonCompleted.length === 0) return { allInProgress: false, inProgressCount: 0 }
  const inProgressCount = nonCompleted.filter((t) => t.status === 'in_progress').length
  return {
    allInProgress: inProgressCount === nonCompleted.length,
    inProgressCount,
  }
}
