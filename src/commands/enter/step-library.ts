import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import jsYaml from 'js-yaml'
import { stepLibrarySchema, type StepDefinition, type StepLibrary } from '../../validation/schemas.js'
import { findProjectDir } from '../../session/lookup.js'

/**
 * Load step library from .kata/steps.yaml
 * Returns empty map if file doesn't exist (not all projects use $ref)
 */
export function loadStepLibrary(projectRoot?: string): StepLibrary {
  const root = projectRoot ?? findProjectDir()
  const stepsPath = join(root, '.kata', 'steps.yaml')

  if (!existsSync(stepsPath)) {
    return {}
  }

  const raw = readFileSync(stepsPath, 'utf-8')
  const parsed = jsYaml.load(raw, { schema: jsYaml.CORE_SCHEMA })

  if (!parsed || typeof parsed !== 'object') {
    return {}
  }

  const result = stepLibrarySchema.safeParse(parsed)
  if (!result.success) {
    const issues = result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ')
    throw new Error(`Invalid steps.yaml: ${issues}`)
  }

  return result.data
}

/**
 * Resolve a $ref step reference against the step library.
 * Merges step definition fields with any local overrides (vars substitution).
 *
 * @param refId - The $ref value (step ID in steps.yaml)
 * @param localStep - The step from the template (may have vars, title override)
 * @param library - The loaded step library
 * @returns Merged step definition with vars resolved
 */
export function resolveStepRef(
  refId: string,
  localStep: { id: string; title?: string; vars?: Record<string, string>; instruction?: string; skill?: string },
  library: StepLibrary,
): { title: string; instruction?: string; skill?: string; gate?: StepDefinition['gate']; hints?: StepDefinition['hints'] } {
  const def = library[refId]
  if (!def) {
    throw new Error(`Step "${localStep.id}" references $ref "${refId}" which does not exist in .kata/steps.yaml`)
  }

  // Start with definition, local step overrides
  let title = localStep.title || def.title
  let instruction = localStep.instruction || def.instruction
  const skill = localStep.skill || def.skill
  const gate = def.gate
  const hints = def.hints

  // Apply vars substitution
  if (localStep.vars) {
    for (const [key, value] of Object.entries(localStep.vars)) {
      const placeholder = `{${key}}`
      const escapedPlaceholder = placeholder.replace(/[{}]/g, '\\$&')
      if (title) title = title.replace(new RegExp(escapedPlaceholder, 'g'), value)
      if (instruction) instruction = instruction.replace(new RegExp(escapedPlaceholder, 'g'), value)
    }
  }

  // Check for unresolved placeholders — only when using the definition's instruction
  // (local instruction overrides are agent-facing prose with their own placeholders)
  if (!localStep.instruction) {
    const unresolvedPattern = /\{[a-z_]+\}/g
    const allText = `${title || ''} ${instruction || ''}`
    const unresolved = allText.match(unresolvedPattern)
    if (unresolved) {
      // Filter out known config placeholders that resolvePlaceholders() handles later
      const configPlaceholders = new Set([
        'test_command', 'build_command', 'typecheck_command', 'smoke_command',
        'dev_server_command', 'dev_server_health',
        // Runtime placeholders resolved elsewhere
        'issue', 'issue_number', 'issue_keyword', 'branch_name',
        'changed_files', 'commit_message', 'pr_title', 'pr_summary',
        'comment_body', 'slug',
      ])
      const truly = unresolved.filter(m => !configPlaceholders.has(m.slice(1, -1)))
      if (truly.length > 0) {
        throw new Error(`Step "${localStep.id}" has unresolved vars: ${truly.join(', ')}. Provide them in the step's vars field.`)
      }
    }
  }

  return { title, instruction, skill, gate, hints }
}
