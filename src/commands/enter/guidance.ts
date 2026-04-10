// Workflow guidance generation for enter command
import { loadKataConfig } from '../../config/kata-config.js'
import type { PhaseDefinition, SubphasePattern } from '../../validation/index.js'
import type { SpecPhase } from '../../yaml/index.js'
import { resolvePlaceholders } from './placeholder.js'

export interface PhaseTitle {
  id: string
  title: string
}

export interface RequiredTodo {
  content: string
  status: 'pending' | 'in_progress' | 'completed'
  activeForm: string
}

export interface WorkflowGuidance {
  requiredTodos: RequiredTodo[]
  workflow: string[]
  taskSystem: string[]
  commands: {
    listTasks: string
    pendingTasks: string
    completeWithEvidence: string
  }
}

/**
 * Build workflow guidance with required todos and commands
 * Works for ALL modes - spec-based (implementation) and template-based (planning, etc.)
 * Reads phase titles and subphase patterns from templates dynamically instead of hardcoding.
 */
export function buildWorkflowGuidance(
  _workflowId: string,
  mode: string,
  specPhases: SpecPhase[] | null,
  phaseTitles: PhaseTitle[],
  templatePhases?: PhaseDefinition[],
  taskSystemRules?: string[],
  resolvedSubphasePattern?: SubphasePattern[],
): WorkflowGuidance {
  const requiredTodos: RequiredTodo[] = []

  // Compute spec expansion phase early to drive behavior from template structure
  const specExpansionPhase = templatePhases?.find((p) => p.expansion === 'spec')
  const hasSpecExpansion = specExpansionPhase !== undefined

  if (hasSpecExpansion && specPhases?.length) {
    // Spec expansion mode: orchestration tasks + spec tasks with P2.X numbering
    // Reads orchestration phase titles and subphase pattern from template
    const specExpansionPhaseNum = specExpansionPhase
      ? Number.parseInt(specExpansionPhase.id.replace('p', ''), 10)
      : 2 // Default to p2 for backwards compatibility
    const subphasePattern = resolvedSubphasePattern ?? (Array.isArray(specExpansionPhase?.subphase_pattern) ? specExpansionPhase.subphase_pattern : [])

    // Add orchestration phases BEFORE expansion (e.g., P0: Baseline, P1: Claim)
    const beforeExpansion =
      templatePhases?.filter((p) => {
        const phaseNum = Number.parseInt(p.id.replace('p', ''), 10)
        return phaseNum < specExpansionPhaseNum && p.task_config?.title
      }) ?? []

    for (const phase of beforeExpansion) {
      requiredTodos.push({
        content: phase.task_config!.title,
        status: 'pending',
        // Use task_config title for activeForm (more descriptive than just phase name)
        activeForm: phase.task_config!.title,
      })
    }

    // P2.X: Spec phases with subphase pattern from template
    for (let i = 0; i < specPhases.length; i++) {
      const phase = specPhases[i]
      const phaseNum = i + 1
      const phaseLabel = `P${specExpansionPhaseNum}.${phaseNum}`
      const phaseName = phase.name || phase.id.toUpperCase()
      const taskSummary =
        phase.tasks?.length === 1
          ? phase.tasks[0]
          : phase.tasks?.length
            ? `${phase.tasks[0]} + ${phase.tasks.length - 1} more`
            : phaseName

      // Generate todos from subphase pattern
      for (const patternItem of subphasePattern) {
        const todoContent = resolvePlaceholders(patternItem.todo_template, {
          extra: { task_summary: taskSummary, phase_name: phaseName, phase_label: phaseLabel },
        })
        const activeForm = resolvePlaceholders(patternItem.active_form, {
          extra: { task_summary: taskSummary, phase_name: phaseName, phase_label: phaseLabel },
        })

        requiredTodos.push({
          content: `${phaseLabel}: ${todoContent}`,
          status: 'pending',
          activeForm,
        })
      }
    }

    // Add orchestration phases AFTER expansion (e.g., P3: Codex Gate, P4: Gemini Gate, P5: Close)
    const afterExpansion =
      templatePhases?.filter((p) => {
        const phaseNum = Number.parseInt(p.id.replace('p', ''), 10)
        return phaseNum > specExpansionPhaseNum && p.task_config?.title
      }) ?? []

    for (const phase of afterExpansion) {
      requiredTodos.push({
        content: phase.task_config!.title,
        status: 'pending',
        // Use task_config title for activeForm (more descriptive than just phase name)
        activeForm: phase.task_config!.title,
      })
    }
  } else if (specPhases?.length && templatePhases) {
    // Non-implementation mode with spec phases - use subphase pattern if available
    const expansionPhase = templatePhases.find((p) => p.expansion === 'spec')
    const subphasePattern = resolvedSubphasePattern ?? (Array.isArray(expansionPhase?.subphase_pattern) ? expansionPhase.subphase_pattern : [])

    for (const phase of specPhases) {
      const phaseLabel = phase.id.toUpperCase()
      const phaseName = phase.name || phaseLabel
      const taskSummary =
        phase.tasks?.length === 1
          ? phase.tasks[0]
          : phase.tasks?.length
            ? `${phase.tasks[0]} + ${phase.tasks.length - 1} more`
            : phaseName

      // Generate todos from subphase pattern
      for (const patternItem of subphasePattern) {
        const todoContent = resolvePlaceholders(patternItem.todo_template, {
          extra: { task_summary: taskSummary, phase_name: phaseName, phase_label: phaseLabel },
        })
        const activeForm = resolvePlaceholders(patternItem.active_form, {
          extra: { task_summary: taskSummary, phase_name: phaseName, phase_label: phaseLabel },
        })

        requiredTodos.push({
          content: `${phaseLabel}: ${todoContent}`,
          status: 'pending',
          activeForm,
        })
      }
    }
  } else if (phaseTitles.length) {
    // Template-based (planning, research, etc.) - one todo per phase
    for (const phase of phaseTitles) {
      requiredTodos.push({
        content: phase.title,
        status: 'pending',
        activeForm: `Working on ${phase.title}`,
      })
    }
  }

  // Build workflow instructions based on mode
  // Note: Detailed workflow comes from template/spec, not hardcoded here
  // Tasks are managed via Claude Code's native task system (TaskUpdate/TaskList)
  const workflow: string[] = []
  if (mode === 'implementation') {
    const specPath = loadKataConfig().spec_path
    workflow.push(
      'Follow the tasks closely - they define your workflow.',
      `Reference the spec for detailed requirements: ${specPath}/<issue>-*.md`,
      '',
      'Commands:',
      '  kata status                           # Check current mode and phase',
      '  kata can-exit                         # Check if exit conditions met',
    )
  } else if (mode === 'planning') {
    workflow.push(
      'Follow the tasks closely - they define your workflow.',
      'Reference template: packages/workflow-management/templates/planning-feature.md',
      '',
      'Commands:',
      '  kata status                           # Check current mode and phase',
      '  kata can-exit                         # Check if exit conditions met',
    )
  } else {
    workflow.push(
      'Follow the tasks closely - they define your workflow.',
      `Reference template: packages/workflow-management/templates/${mode}.md`,
      '',
      'Commands:',
      '  kata status                           # Check current mode and phase',
      '  kata can-exit                         # Check if exit conditions met',
    )
  }

  const commands = {
    listTasks: 'kata status',
    pendingTasks: 'kata can-exit',
    completeWithEvidence: 'TaskUpdate(taskId="X", status="completed")',
  }

  return { requiredTodos, workflow, taskSystem: taskSystemRules ?? [], commands }
}
