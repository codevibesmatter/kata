import { readdirSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { findProjectDir } from '../session/lookup.js'
import { loadKataConfig } from '../config/kata-config.js'
import { parseYamlFrontmatterWithError } from '../yaml/parser.js'
import type { SpecYaml } from '../yaml/types.js'

interface ValidationResult {
  valid: boolean
  specPath: string
  issueNumber?: number
  phases: number
  totalTasks: number
  errors: string[]
  warnings: string[]
}

/**
 * Find spec file by issue number
 */
export function findSpecFile(issueNum: number): string | null {
  const projectDir = findProjectDir()
  if (!projectDir) return null

  const specsDir = resolve(projectDir, loadKataConfig().spec_path)
  if (!existsSync(specsDir)) return null

  try {
    const files = readdirSync(specsDir)
    const pattern = new RegExp(`^${issueNum}-.*\\.md$`)
    const match = files.find((f) => pattern.test(f))
    return match ? resolve(specsDir, match) : null
  } catch {
    return null
  }
}

/**
 * Parse and validate spec YAML frontmatter using js-yaml parser.
 * Handles all valid YAML string formats (quoted, unquoted, folded, literal).
 */
export function validateSpec(specPath: string): ValidationResult {
  const result: ValidationResult = {
    valid: true,
    specPath,
    phases: 0,
    totalTasks: 0,
    errors: [],
    warnings: [],
  }

  // Check file exists
  if (!existsSync(specPath)) {
    result.valid = false
    result.errors.push(`Spec file not found: ${specPath}`)
    return result
  }

  // Parse YAML frontmatter with js-yaml
  const parseResult = parseYamlFrontmatterWithError<SpecYaml>(specPath)
  if (!parseResult.ok) {
    result.valid = false
    result.errors.push(parseResult.error)
    return result
  }

  const data = parseResult.data

  // Parse github_issue
  if (typeof data.github_issue === 'number') {
    result.issueNumber = data.github_issue
  } else {
    result.warnings.push('No github_issue field in frontmatter')
  }

  // Check for phases
  if (!data.phases || !Array.isArray(data.phases)) {
    result.warnings.push('No phases section found in frontmatter')
    return result
  }

  if (data.phases.length === 0) {
    result.errors.push(
      'phases section exists but contains no phases (each phase needs "  - id: pN")',
    )
    result.valid = false
    return result
  }

  const seenIds = new Set<string>()

  for (let phaseIdx = 0; phaseIdx < data.phases.length; phaseIdx++) {
    const phase = data.phases[phaseIdx]

    // Validate phase id
    const phaseId = phase?.id
    if (!phaseId) {
      result.errors.push(`Phase ${phaseIdx + 1}: Missing id field`)
      result.valid = false
      continue
    }

    if (seenIds.has(phaseId)) {
      result.errors.push(`Phase ${phaseIdx + 1}: Duplicate id "${phaseId}"`)
      result.valid = false
    }
    seenIds.add(phaseId)

    if (!phase.name) {
      result.warnings.push(`Phase ${phaseId}: Missing name field`)
    }

    // Count tasks — js-yaml handles all string formats (quoted, unquoted, folded, etc.)
    const taskCount = Array.isArray(phase.tasks) ? phase.tasks.filter((t) => typeof t === 'string' && t.trim().length > 0).length : 0

    result.phases++
    result.totalTasks += taskCount
  }

  // Enforce: phases must have tasks for implementation mode to work
  if (result.valid && result.totalTasks === 0 && result.phases > 0) {
    result.errors.push(
      'Phases exist but no tasks defined. Each phase needs a tasks array like:\n' +
        '    - id: phase-1\n' +
        '      name: "Phase Name"\n' +
        '      tasks:\n' +
        '        - "First task description"\n' +
        '        - "Second task description"',
    )
    result.valid = false
  }

  return result
}

function parseArgs(args: string[]): { issue?: number; path?: string } {
  const result: { issue?: number; path?: string } = {}

  for (const arg of args) {
    if (arg.startsWith('--issue=')) {
      result.issue = Number.parseInt(arg.slice(8), 10)
    } else if (!arg.startsWith('--') && arg.endsWith('.md')) {
      result.path = arg
    }
  }

  return result
}

export async function validateSpecCommand(args: string[]): Promise<void> {
  const parsed = parseArgs(args)

  let specPath: string | null = null

  if (parsed.path) {
    specPath = resolve(parsed.path)
  } else if (parsed.issue) {
    specPath = findSpecFile(parsed.issue)
    if (!specPath) {
      // biome-ignore lint/suspicious/noConsole: CLI output
      console.error(`No spec file found for issue #${parsed.issue}`)
      // biome-ignore lint/suspicious/noConsole: CLI output
      console.error('Expected: planning/specs/{issue}-*.md')
      process.exit(1)
    }
  } else {
    // biome-ignore lint/suspicious/noConsole: CLI output
    console.error('Usage: kata validate-spec --issue=123')
    // biome-ignore lint/suspicious/noConsole: CLI output
    console.error('   or: kata validate-spec path/to/spec.md')
    process.exit(1)
  }

  const result = validateSpec(specPath)

  // biome-ignore lint/suspicious/noConsole: CLI output
  console.log('')
  // biome-ignore lint/suspicious/noConsole: CLI output
  console.log(`Spec: ${result.specPath}`)
  if (result.issueNumber) {
    // biome-ignore lint/suspicious/noConsole: CLI output
    console.log(`Issue: #${result.issueNumber}`)
  }
  // biome-ignore lint/suspicious/noConsole: CLI output
  console.log(`Phases: ${result.phases}`)
  // biome-ignore lint/suspicious/noConsole: CLI output
  console.log(`Total tasks: ${result.totalTasks}`)
  // biome-ignore lint/suspicious/noConsole: CLI output
  console.log('')

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
    console.log('✅ Spec is valid for implementation mode')
  } else {
    // biome-ignore lint/suspicious/noConsole: CLI output
    console.log('❌ Spec has errors that will prevent implementation mode from working')
    process.exit(1)
  }
}
