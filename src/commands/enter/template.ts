// Template parsing utilities for enter command
import { resolveTemplatePath } from '../../session/lookup.js'
import {
  validatePhases,
  formatValidationErrors,
  type PhaseDefinition,
} from '../../validation/index.js'
import { parseYamlFrontmatter, type TemplateYaml } from '../../yaml/index.js'
import type { PhaseTitle } from './guidance.js'

/**
 * Parse YAML frontmatter from template file
 * Uses js-yaml via yaml module
 */
export function parseTemplateYaml(templatePath: string): TemplateYaml | null {
  return parseYamlFrontmatter<TemplateYaml>(templatePath)
}

/**
 * Get phase titles from template for TaskUpdate context
 */
export function getPhaseTitlesFromTemplate(templatePath: string): PhaseTitle[] {
  const fullTemplatePath = resolveTemplatePath(templatePath)

  const template = parseTemplateYaml(fullTemplatePath)
  if (!template?.phases?.length) return []

  return template.phases
    .filter((p) => p.task_config?.title)
    .map((p) => ({
      id: p.id,
      title: p.task_config!.title,
    }))
}

/**
 * Parse and validate template phases
 * Returns validated phases or null if parsing/validation fails
 */
export function parseAndValidateTemplatePhases(templatePath: string): PhaseDefinition[] | null {
  const fullTemplatePath = resolveTemplatePath(templatePath)

  const template = parseTemplateYaml(fullTemplatePath)
  if (!template?.phases?.length) return null

  // Validate phases (silently skip if invalid — templates may not have all fields)
  const validationResult = validatePhases(template.phases, fullTemplatePath)
  if (!validationResult.valid) {
    // Return parsed phases even when validation fails — old templates may lack fields like stage
  }

  // Validate stage ordering (setup -> work -> close)
  const mapped = template.phases.map((p) => ({
    id: p.id,
    name: p.name || '',
    stage: p.stage,
    task_config: p.task_config,
    steps: p.steps,
    expansion: p.expansion,
    skill: p.skill,
    agent_protocol: p.agent_protocol,
    subphase_pattern: p.subphase_pattern,
  }))

  const stageError = validateStageOrdering(mapped as PhaseDefinition[])
  if (stageError) {
    // biome-ignore lint/suspicious/noConsole: intentional CLI output
    console.error(stageError)
    return null
  }

  // Validate work phases have a skill (phase-level or on at least one step)
  const skillError = validateWorkPhaseSkills(mapped as PhaseDefinition[])
  if (skillError) {
    // biome-ignore lint/suspicious/noConsole: intentional CLI output
    console.error(skillError)
    return null
  }

  return mapped as PhaseDefinition[]
}

/**
 * Validate that phases follow the stage ordering: setup -> work -> close.
 * Returns an error string if ordering is violated, null if valid.
 */
function validateStageOrdering(phases: PhaseDefinition[]): string | null {
  if (phases.length === 0) return null // Empty phases skip validation
  const stageOrder = { setup: 0, work: 1, close: 2 } as const
  let maxSeen = -1
  for (const phase of phases) {
    const order = stageOrder[phase.stage]
    if (order < maxSeen) {
      return `Phase "${phase.id}" has stage "${phase.stage}" but follows a later stage. Stages must be in order: setup → work → close.`
    }
    maxSeen = Math.max(maxSeen, order)
  }
  return null
}

/**
 * Validate that every work-stage phase has a skill — either at the phase level
 * or on at least one step. This is the "work = methodology" invariant.
 * Returns an error string if validation fails, null if valid.
 */
function validateWorkPhaseSkills(phases: PhaseDefinition[]): string | null {
  for (const phase of phases) {
    if (phase.stage !== 'work') continue
    if (phase.skill) continue // Phase-level skill
    if (phase.steps?.some(s => s.skill)) continue // Step-level skill
    return `Work phase "${phase.id}" has no skill. Every work phase must have a skill either at the phase level or on at least one step.`
  }
  return null
}

/**
 * Get reviewer_prompt from template frontmatter (default: 'code-review')
 */
export function getTemplateReviewerPrompt(templatePath: string): string {
  const fullTemplatePath = resolveTemplatePath(templatePath)
  const template = parseTemplateYaml(fullTemplatePath)
  return template?.reviewer_prompt ?? 'code-review'
}
