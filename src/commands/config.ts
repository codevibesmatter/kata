// kata config — display resolved configuration
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { findProjectDir, getPackageRoot, getProjectTemplatesDir } from '../session/lookup.js'
import { loadKataConfig, getKataConfigPath } from '../config/kata-config.js'

/**
 * kata config --show
 *
 * Displays the resolved configuration from kata.yaml.
 * Single file, no merge — provenance is always "project".
 */
export async function config(args: string[]): Promise<void> {
  if (args[0] === 'get' && args[1]) {
    getConfigValue(args[1])
  } else if (args.includes('--show') || args.length === 0) {
    showConfig()
  } else {
    process.stdout.write('Usage: kata config [--show | get <key>]\n')
  }
}

function showConfig(): void {
  const cfg = loadKataConfig()
  const projectRoot = findProjectDir()
  const configPath = getKataConfigPath(projectRoot)

  process.stdout.write('kata config (resolved)\n')
  process.stdout.write('═'.repeat(60) + '\n')
  process.stdout.write(`source: ${configPath}\n\n`)

  // Scalar fields
  process.stdout.write(`spec_path: ${cfg.spec_path}\n`)
  process.stdout.write(`research_path: ${cfg.research_path}\n`)
  process.stdout.write(`session_retention_days: ${cfg.session_retention_days}\n`)

  // Reviews section
  if (cfg.reviews) {
    process.stdout.write('\nreviews:\n')
    process.stdout.write(`  code_review: ${cfg.reviews.code_review ?? '(not set)'}\n`)
    process.stdout.write(`  code_reviewer: ${cfg.reviews.code_reviewer ?? 'null'}\n`)
  }

  // Project section
  if (cfg.project) {
    process.stdout.write('\nproject:\n')
    process.stdout.write(`  name: ${cfg.project.name ?? '(not set)'}\n`)
    process.stdout.write(`  test_command: ${cfg.project.test_command ?? '(not set)'}\n`)
    process.stdout.write(`  build_command: ${cfg.project.build_command ?? '(not set)'}\n`)
  }

  // Modes summary
  process.stdout.write('\n')
  const modeNames = Object.keys(cfg.modes).filter(
    (m) => !cfg.modes[m].deprecated,
  )
  process.stdout.write(`modes: ${modeNames.length} active modes\n`)

  // Template resolution summary
  process.stdout.write('\ntemplates (lookup order: project → package):\n')
  const packageTemplateDir = join(getPackageRoot(), 'batteries', 'templates')
  try {
    const projTmplDir = getProjectTemplatesDir(projectRoot)
    process.stdout.write(`  project:  ${projTmplDir} ${existsSync(projTmplDir) ? '(exists)' : '(not found)'}\n`)
  } catch {
    process.stdout.write('  project:  (no project)\n')
  }
  process.stdout.write(`  package:  ${packageTemplateDir} ${existsSync(packageTemplateDir) ? '(exists)' : '(not found)'}\n`)
}

function getConfigValue(key: string): void {
  const cfg = loadKataConfig()

  // Walk the dot-separated path
  const parts = key.split('.')
  let value: unknown = cfg

  for (const part of parts) {
    if (value === null || value === undefined || typeof value !== 'object') {
      process.stderr.write(`Key not found: ${key}\n`)
      process.exitCode = 1
      return
    }
    value = (value as Record<string, unknown>)[part]
  }

  if (value === undefined) {
    process.stderr.write(`Key not found: ${key}\n`)
    process.exitCode = 1
    return
  }

  // Output formatting
  if (value === null) {
    process.stdout.write('\n')
  } else if (typeof value === 'boolean') {
    process.stdout.write(`${value}\n`)
  } else if (typeof value === 'string' || typeof value === 'number') {
    process.stdout.write(`${value}\n`)
  } else if (Array.isArray(value)) {
    for (const item of value) {
      process.stdout.write(`${item}\n`)
    }
  } else if (typeof value === 'object') {
    process.stdout.write(JSON.stringify(value, null, 2) + '\n')
  }
}
