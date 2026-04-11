import { existsSync, readFileSync } from 'node:fs'
import { resolve, basename } from 'node:path'
import { findProjectDir } from '../session/lookup.js'
import { validatePhases } from '../validation/index.js'

interface TemplateValidationResult {
  valid: boolean
  templatePath: string
  templateName: string
  phases: number
  hasExpansion: boolean
  errors: string[]
  warnings: string[]
  phaseDetails: Array<{
    id: string
    name: string
    hasTaskConfig: boolean
    hasSteps: boolean
    dependencies: string[]
  }>
}

/**
 * Parse YAML frontmatter from template file
 */
function parseTemplateFrontmatter(content: string): Record<string, unknown> | null {
  const match = content.match(/^---\n([\s\S]*?)\n---/)
  if (!match) return null

  // Simple YAML parsing for common fields
  const yaml = match[1]
  const result: Record<string, unknown> = {}

  // Parse top-level string fields
  const stringFields = ['id', 'name', 'description', 'mode', 'promptFile', 'workflow_prefix']
  for (const field of stringFields) {
    const fieldMatch = yaml.match(new RegExp(`^${field}:\\s*(.+)$`, 'm'))
    if (fieldMatch) {
      result[field] = fieldMatch[1].trim().replace(/^["']|["']$/g, '')
    }
  }

  // Parse phases array
  const phasesMatch = yaml.match(/phases:\s*\n([\s\S]*?)(?:\n[a-z_]+:|\n---|\n$|$)/i)
  if (phasesMatch) {
    result.phases = parsePhasesSection(phasesMatch[1])
  }

  return result
}

/**
 * Parse phases section from YAML
 */
function parsePhasesSection(phasesSection: string): unknown[] {
  const phases: Record<string, unknown>[] = []

  // Split on phase boundaries
  const rawBlocks = phasesSection.split(/\n {2}- id:/)
  const phaseBlocks = phasesSection.trimStart().startsWith('- id:')
    ? rawBlocks.map((b, i) => (i === 0 ? b.replace(/^ {2}- id:/, '') : b))
    : rawBlocks.slice(1)

  for (const block of phaseBlocks) {
    const lines = `id:${block}`.split('\n')
    const phase: Record<string, unknown> = {}

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue

      if (trimmed.startsWith('id:')) {
        phase.id = trimmed.slice(3).trim()
      } else if (trimmed.startsWith('name:')) {
        phase.name = trimmed
          .slice(5)
          .trim()
          .replace(/^["']|["']$/g, '')
      } else if (trimmed.startsWith('expansion:')) {
        phase.expansion = trimmed.slice(10).trim()
      }
    }

    if (phase.id) {
      phases.push(phase)
    }
  }

  return phases
}

/**
 * Validate a template file
 */
function validateTemplate(templatePath: string): TemplateValidationResult {
  const result: TemplateValidationResult = {
    valid: true,
    templatePath,
    templateName: basename(templatePath, '.md'),
    phases: 0,
    hasExpansion: false,
    errors: [],
    warnings: [],
    phaseDetails: [],
  }

  // Check file exists
  if (!existsSync(templatePath)) {
    result.valid = false
    result.errors.push(`Template file not found: ${templatePath}`)
    return result
  }

  const content = readFileSync(templatePath, 'utf-8')

  // Parse frontmatter
  const frontmatter = parseTemplateFrontmatter(content)
  if (!frontmatter) {
    result.valid = false
    result.errors.push('No YAML frontmatter found (must start with --- and end with ---)')
    return result
  }

  // Check for required fields
  if (!frontmatter.id) {
    result.warnings.push('Missing "id" field in frontmatter')
  }
  if (!frontmatter.name) {
    result.warnings.push('Missing "name" field in frontmatter')
  }
  if (!frontmatter.mode) {
    result.warnings.push('Missing "mode" field in frontmatter')
  }

  // Check for phases
  const phases = frontmatter.phases as unknown[]
  if (!phases || !Array.isArray(phases) || phases.length === 0) {
    result.warnings.push('No phases defined in frontmatter')
    return result
  }

  // Use validation infrastructure
  const validationResult = validatePhases(phases, templatePath)
  if (!validationResult.valid) {
    result.valid = false
    for (const error of validationResult.errors) {
      result.errors.push(error.message)
    }
  }

  // Collect phase details
  result.phases = phases.length
  for (const phase of phases as Record<string, unknown>[]) {
    const phaseId = (phase.id as string) || 'unknown'
    const phaseName = (phase.name as string) || ''
    const taskConfig = phase.task_config as Record<string, unknown> | undefined
    const hasTaskConfig = taskConfig && typeof taskConfig.title === 'string'
    const steps = phase.steps as unknown[] | undefined
    const hasSteps = Array.isArray(steps) && steps.length > 0

    if (phase.expansion) {
      result.hasExpansion = true
    }

    result.phaseDetails.push({
      id: phaseId,
      name: phaseName,
      hasTaskConfig: !!hasTaskConfig,
      hasSteps: !!hasSteps,
      dependencies: (taskConfig?.depends_on as string[]) || [],
    })
  }

  return result
}

function parseArgs(args: string[]): { path?: string; json?: boolean } {
  const result: { path?: string; json?: boolean } = {}

  for (const arg of args) {
    if (arg === '--json') {
      result.json = true
    } else if (!arg.startsWith('--')) {
      result.path = arg
    }
  }

  return result
}

export async function validateTemplateCommand(args: string[]): Promise<void> {
  const parsed = parseArgs(args)

  if (!parsed.path) {
    // biome-ignore lint/suspicious/noConsole: CLI output
    console.error('Usage: kata validate-template <path-to-template.md> [--json]')
    // biome-ignore lint/suspicious/noConsole: CLI output
    console.error('')
    // biome-ignore lint/suspicious/noConsole: CLI output
    console.error('Examples:')
    // biome-ignore lint/suspicious/noConsole: CLI output
    console.error('  kata validate-template packages/workflow-management/templates/task.md')
    // biome-ignore lint/suspicious/noConsole: CLI output
    console.error('  kata validate-template /tmp/my-custom-template.md --json')
    process.exit(1)
  }

  const projectDir = findProjectDir()
  const templatePath = parsed.path.startsWith('/')
    ? parsed.path
    : resolve(projectDir || process.cwd(), parsed.path)

  const result = validateTemplate(templatePath)

  if (parsed.json) {
    // biome-ignore lint/suspicious/noConsole: CLI output
    console.log(JSON.stringify(result, null, 2))
    if (!result.valid) {
      process.exit(1)
    }
    return
  }

  // Human-readable output
  // biome-ignore lint/suspicious/noConsole: CLI output
  console.log('')
  // biome-ignore lint/suspicious/noConsole: CLI output
  console.log(`Template: ${result.templatePath}`)
  // biome-ignore lint/suspicious/noConsole: CLI output
  console.log(`Name: ${result.templateName}`)
  // biome-ignore lint/suspicious/noConsole: CLI output
  console.log(`Phases: ${result.phases}`)
  // biome-ignore lint/suspicious/noConsole: CLI output
  console.log(`Has expansion phase: ${result.hasExpansion ? 'yes' : 'no'}`)
  // biome-ignore lint/suspicious/noConsole: CLI output
  console.log('')

  if (result.phaseDetails.length > 0) {
    // biome-ignore lint/suspicious/noConsole: CLI output
    console.log('PHASES:')
    for (const phase of result.phaseDetails) {
      const deps =
        phase.dependencies.length > 0 ? ` (depends on: ${phase.dependencies.join(', ')})` : ''
      const indicator = phase.hasSteps ? '✓' : phase.hasTaskConfig ? '○' : '·'
      // biome-ignore lint/suspicious/noConsole: CLI output
      console.log(`  ${indicator} ${phase.id}: ${phase.name}${deps}`)
    }
    // biome-ignore lint/suspicious/noConsole: CLI output
    console.log('')
  }

  if (result.errors.length > 0) {
    // biome-ignore lint/suspicious/noConsole: CLI output
    console.log('ERRORS:')
    for (const err of result.errors) {
      // biome-ignore lint/suspicious/noConsole: CLI output
      console.log(`  ❌ ${err}`)
    }
    // biome-ignore lint/suspicious/noConsole: CLI output
    console.log('')
  }

  if (result.warnings.length > 0) {
    // biome-ignore lint/suspicious/noConsole: CLI output
    console.log('WARNINGS:')
    for (const warn of result.warnings) {
      // biome-ignore lint/suspicious/noConsole: CLI output
      console.log(`  ⚠️  ${warn}`)
    }
    // biome-ignore lint/suspicious/noConsole: CLI output
    console.log('')
  }

  if (result.valid) {
    // biome-ignore lint/suspicious/noConsole: CLI output
    console.log('✅ Template is valid for use with kata enter --template=')
  } else {
    // biome-ignore lint/suspicious/noConsole: CLI output
    console.log('❌ Template has errors that must be fixed before use')
    process.exit(1)
  }
}
