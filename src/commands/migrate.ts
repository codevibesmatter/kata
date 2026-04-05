// kata migrate — convert old-format templates to new gate/hint format
import { existsSync, readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import jsYaml from 'js-yaml'
import { findProjectDir, getProjectTemplatesDir } from '../session/lookup.js'
import { parseYamlFrontmatter } from '../yaml/parser.js'

/**
 * Detect if a template is old format:
 * 1. Any step has agent.gate: true (old boolean gate)
 * 2. Any phase has subphase_pattern as a string
 * 3. No step in entire template has gate object or hints array
 */
export function isOldFormat(yaml: Record<string, unknown>): boolean {
  const phases = (yaml.phases as Record<string, unknown>[]) ?? []

  let hasNewFields = false

  for (const phase of phases) {
    // Check string subphase_pattern
    if (typeof phase.subphase_pattern === 'string') return true

    // Check steps
    const steps = (phase.steps ?? []) as Record<string, unknown>[]
    for (const step of steps) {
      const agent = step.agent as Record<string, unknown> | undefined
      // Old boolean gate
      if (agent?.gate === true) return true
      // New fields present
      if (step.gate && typeof step.gate === 'object') hasNewFields = true
      if (Array.isArray(step.hints) && step.hints.length > 0) hasNewFields = true
    }

    // Check subphase patterns for new fields
    if (Array.isArray(phase.subphase_pattern)) {
      for (const pat of phase.subphase_pattern as Record<string, unknown>[]) {
        if (pat.gate && typeof pat.gate === 'object') hasNewFields = true
        if (Array.isArray(pat.hints) && pat.hints.length > 0) hasNewFields = true
      }
    }
  }

  // Pure prose template (has phases with steps but no gates or hints anywhere)
  if (phases.length > 0 && !hasNewFields) {
    // Check if any phase has steps at all
    const hasSteps = phases.some(
      (p) => Array.isArray(p.steps) && (p.steps as unknown[]).length > 0,
    )
    if (hasSteps) return true
  }

  return false
}

// Known subphase patterns for migration
const KNOWN_PATTERNS: Record<string, Record<string, unknown>[]> = {
  'impl-test-review': [
    {
      id_suffix: 'impl',
      title_template: 'IMPL - {task_summary}',
      todo_template: 'Implement {task_summary}',
      active_form: 'Implementing {phase_name}',
      labels: ['impl'],
      instruction: 'Implement the behavior described in the spec phase.',
    },
    {
      id_suffix: 'test',
      title_template: 'TEST - {phase_name}',
      todo_template: 'Test {phase_name} implementation',
      active_form: 'Testing {phase_name}',
      labels: ['test'],
      depends_on_previous: true,
      instruction: 'Run tests and typecheck.',
    },
    {
      id_suffix: 'review',
      title_template: 'REVIEW - {reviewers}',
      todo_template: 'Review {phase_name} changes',
      active_form: 'Reviewing {phase_name}',
      labels: ['review'],
      depends_on_previous: true,
      instruction: 'Run review-agent.',
    },
  ],
  'impl-test': [
    {
      id_suffix: 'impl',
      title_template: 'IMPL - {task_summary}',
      todo_template: 'Implement {task_summary}',
      active_form: 'Implementing {phase_name}',
      labels: ['impl'],
    },
    {
      id_suffix: 'test',
      title_template: 'TEST - {phase_name}',
      todo_template: 'Test {phase_name} implementation',
      active_form: 'Testing {phase_name}',
      labels: ['test'],
      depends_on_previous: true,
    },
  ],
}

/**
 * Convert an old-format template YAML object to new format.
 * Returns the converted object (does not write to disk).
 */
export function convertTemplate(yaml: Record<string, unknown>): Record<string, unknown> {
  const phases = (yaml.phases as Record<string, unknown>[]) ?? []
  const converted = {
    ...yaml,
    phases: phases.map((phase) => {
      const newPhase = { ...phase }

      // Convert string subphase_pattern to inline array
      if (typeof phase.subphase_pattern === 'string') {
        const known = KNOWN_PATTERNS[phase.subphase_pattern]
        if (known) {
          newPhase.subphase_pattern = known
        } else {
          // Unknown pattern -- leave a marker
          newPhase.subphase_pattern = [
            {
              id_suffix: 'unknown',
              title_template: `UNKNOWN PATTERN: ${phase.subphase_pattern}`,
              todo_template: `Migrate manually: ${phase.subphase_pattern}`,
              active_form: 'Migrating',
              labels: [],
            },
          ]
        }
      }

      // Convert steps with agent.gate to hints
      if (Array.isArray(phase.steps)) {
        newPhase.steps = (phase.steps as Record<string, unknown>[]).map(
          (step: Record<string, unknown>) => {
            const newStep = { ...step }
            const agent = step.agent as Record<string, unknown> | undefined
            if (agent) {
              const { gate: _gate, threshold: _threshold, ...agentRest } = agent
              if (Object.keys(agentRest).length > 0) {
                // Convert agent to hint
                if (!newStep.hints) newStep.hints = []
                ;(newStep.hints as unknown[]).push({
                  agent: {
                    subagent_type:
                      (agentRest.provider as string) ?? 'review-agent',
                    prompt: (agentRest.prompt as string) ?? 'Review changes',
                  },
                })
              }
              delete newStep.agent
            }
            return newStep
          },
        )
      }

      return newPhase
    }),
  }

  return converted
}

export async function migrate(args: string[]): Promise<void> {
  const dryRun = args.includes('--dry-run')

  let projectRoot: string
  try {
    projectRoot = findProjectDir()
  } catch {
    process.stderr.write(
      'Error: Not in a kata project. Run kata setup first.\n',
    )
    process.exitCode = 1
    return
  }

  const templatesDir = getProjectTemplatesDir(projectRoot)
  if (!existsSync(templatesDir)) {
    process.stdout.write('No templates directory found. Nothing to migrate.\n')
    return
  }

  let migrated = 0
  let skipped = 0

  for (const file of readdirSync(templatesDir)) {
    if (!file.endsWith('.md')) continue

    const filePath = join(templatesDir, file)

    // Parse frontmatter from file path
    const parsed = parseYamlFrontmatter<Record<string, unknown>>(filePath)
    if (!parsed) {
      skipped++
      continue
    }

    if (!isOldFormat(parsed)) {
      process.stdout.write(`  skip ${file} (already new format)\n`)
      skipped++
      continue
    }

    const converted = convertTemplate(parsed)

    if (dryRun) {
      process.stdout.write(`  ~ ${file} (would migrate)\n`)
      // Show what would change
      const phases = (converted.phases as Record<string, unknown>[]) ?? []
      const origPhases = (parsed.phases as Record<string, unknown>[]) ?? []
      for (const phase of phases) {
        const origPhase = origPhases.find(
          (p: Record<string, unknown>) => p.id === phase.id,
        )
        if (
          Array.isArray(phase.subphase_pattern) &&
          typeof origPhase?.subphase_pattern === 'string'
        ) {
          process.stdout.write(
            `    subphase_pattern: string -> inline array\n`,
          )
        }
      }
      migrated++
      continue
    }

    // Write converted template
    // Rebuild the file: new frontmatter + original body
    const content = readFileSync(filePath, 'utf-8')
    const firstDelim = content.indexOf('---')
    const secondDelim = content.indexOf('---', firstDelim + 3)
    const body = content.slice(secondDelim + 3)
    const newFrontmatter = jsYaml.dump(converted, {
      lineWidth: 120,
      noRefs: true,
    })
    writeFileSync(filePath, `---\n${newFrontmatter}---${body}`)

    process.stdout.write(`  migrated ${file}\n`)
    migrated++
  }

  if (dryRun) {
    process.stdout.write(
      `\nDry run: ${migrated} would be migrated, ${skipped} already up to date\n`,
    )
  } else {
    process.stdout.write(
      `\nMigration complete: ${migrated} migrated, ${skipped} already up to date\n`,
    )
  }
}
