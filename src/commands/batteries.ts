// kata batteries — scaffold batteries-included content into the current project
// Default: skips existing files. Use --update to overwrite with latest versions.
import { join } from 'node:path'
import { scaffoldBatteries } from './scaffold-batteries.js'
import { findClaudeProjectDir } from '../session/lookup.js'

/**
 * kata batteries [--update] [--cwd=PATH]
 *
 * Copies batteries-included starter content into the project:
 *   batteries/templates/       → .claude/workflows/templates/
 *   batteries/agents/          → .claude/agents/
 *   batteries/spec-templates/  → planning/spec-templates/
 *   batteries/github/          → .github/
 *
 * By default skips files that already exist.
 * Use --update to overwrite existing files with the latest package versions.
 */
export async function batteries(args: string[]): Promise<void> {
  let cwd = process.cwd()
  let update = false

  for (const arg of args) {
    if (arg.startsWith('--cwd=')) {
      cwd = arg.slice('--cwd='.length)
    } else if (arg === '--update') {
      update = true
    }
  }

  // Resolve project root — explicit cwd wins, then walk up for .claude/
  let projectRoot = cwd
  if (!args.some((a) => a.startsWith('--cwd='))) {
    try {
      projectRoot = findClaudeProjectDir()
    } catch {
      // No .claude/ found — use cwd
    }
  }

  const result = scaffoldBatteries(projectRoot, update)
  const newCount =
    result.templates.length +
    result.agents.length +
    result.specTemplates.length +
    result.githubTemplates.length
  const updatedCount = result.updated.length

  if (newCount === 0 && updatedCount === 0 && result.skipped.length > 0) {
    process.stdout.write('kata batteries: all files already present (nothing to copy)\n')
    process.stdout.write(`  Re-run with --update to overwrite with latest versions\n`)
    return
  }

  if (update) {
    process.stdout.write(`kata batteries --update: ${newCount} new, ${updatedCount} updated\n`)
  } else {
    process.stdout.write(`kata batteries: scaffolded ${newCount} files\n`)
  }

  if (result.templates.length > 0) {
    process.stdout.write(`\nMode templates → .claude/workflows/templates/\n`)
    for (const f of result.templates) process.stdout.write(`  ${f}\n`)
  }
  if (result.agents.length > 0) {
    process.stdout.write(`\nAgents → .claude/agents/\n`)
    for (const f of result.agents) process.stdout.write(`  ${f}\n`)
  }
  if (result.specTemplates.length > 0) {
    process.stdout.write(`\nSpec templates → planning/spec-templates/\n`)
    for (const f of result.specTemplates) process.stdout.write(`  ${f}\n`)
  }
  if (result.githubTemplates.length > 0) {
    process.stdout.write(`\nGitHub → .github/\n`)
    for (const f of result.githubTemplates) process.stdout.write(`  ${f}\n`)
    process.stdout.write(`\nNext: run 'kata enter onboard' to create labels on GitHub\n`)
  }
  if (result.updated.length > 0) {
    process.stdout.write(`\nUpdated (overwritten):\n`)
    for (const f of result.updated) process.stdout.write(`  ${f}\n`)
  }
  if (result.skipped.length > 0) {
    process.stdout.write(`\nSkipped (already exist): ${result.skipped.join(', ')}\n`)
  }

  process.stdout.write('\nDone. Run: kata enter <mode> to get started\n')
}
