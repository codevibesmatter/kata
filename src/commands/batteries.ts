// kata batteries — scaffold batteries-included content into a project
// Default: skips existing files. Use --update to overwrite with latest versions.
import { scaffoldBatteries } from './scaffold-batteries.js'
import { findProjectDir } from '../session/lookup.js'
import {
  resolveWmBin,
  buildHookEntries,
  readSettings,
  writeSettings,
  mergeHooksIntoSettings,
} from './setup.js'

/**
 * kata batteries [--update] [--cwd=PATH]
 *
 * Scaffolds batteries-included content into a project:
 *   batteries/templates/       → .kata/templates/
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
      projectRoot = findProjectDir()
    } catch {
      // No .claude/ found — use cwd
    }
  }

  const result = scaffoldBatteries(projectRoot, update)
  const newCount =
    result.templates.length +
    result.agents.length +
    result.prompts.length +
    result.providerPlugins.length +
    result.specTemplates.length +
    result.githubTemplates.length +
    result.interviews.length +
    result.verificationTools.length +
    result.kataConfig.length
  const updatedCount = result.updated.length

  // On --update, also refresh hook registrations in .claude/settings.json
  // so new hook events from package upgrades are picked up automatically.
  let hooksRefreshed = false
  if (update) {
    const settings = readSettings(projectRoot)
    if (settings.hooks) {
      // Detect strict mode from existing settings: if task-deps hook is registered, keep strict
      const strict = Object.values(settings.hooks)
        .flat()
        .some((entry) => entry.hooks?.some((h) => /\bhook task-deps\b/.test(h.command ?? '')))
      const wmBin = resolveWmBin()
      const wmHooks = buildHookEntries(strict, wmBin)
      writeSettings(projectRoot, mergeHooksIntoSettings(settings, wmHooks))
      hooksRefreshed = true
    }
  }

  if (newCount === 0 && updatedCount === 0 && !hooksRefreshed && result.skipped.length > 0) {
    process.stdout.write('kata batteries: all files already present (nothing to copy)\n')
    process.stdout.write(`  Re-run with --update to overwrite with latest versions\n`)
    return
  }

  if (update) {
    process.stdout.write(`kata batteries --update: ${newCount} new, ${updatedCount} updated\n`)
  } else {
    process.stdout.write(`kata batteries: scaffolded ${newCount} files\n`)
  }

  if (result.kataConfig.length > 0) {
    process.stdout.write(`\nConfig → .kata/kata.yaml\n`)
  }
  if (result.templates.length > 0) {
    process.stdout.write(`\nMode templates → .kata/templates/\n`)
    for (const f of result.templates) process.stdout.write(`  ${f}\n`)
  }
  if (result.agents.length > 0) {
    process.stdout.write(`\nAgents → .claude/agents/\n`)
    for (const f of result.agents) process.stdout.write(`  ${f}\n`)
  }
  if (result.prompts.length > 0) {
    process.stdout.write(`\nReview prompts → .kata/prompts/\n`)
    for (const f of result.prompts) process.stdout.write(`  ${f}\n`)
  }
  if (result.providerPlugins.length > 0) {
    process.stdout.write(`\nProvider plugins → .kata/providers/\n`)
    for (const f of result.providerPlugins) process.stdout.write(`  ${f}\n`)
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
  if (result.interviews.length > 0) {
    process.stdout.write(`\nInterview configs → .kata/interviews/\n`)
    for (const f of result.interviews) process.stdout.write(`  ${f}\n`)
  }
  if (result.verificationTools.length > 0) {
    process.stdout.write(`\nVerification tools → .kata/verification-tools.md\n`)
    process.stdout.write(`  ⚠️  Fill in project-specific sections (dev server, API base URL, auth, database)\n`)
  }
  if (result.updated.length > 0) {
    process.stdout.write(`\nUpdated (overwritten):\n`)
    for (const f of result.updated) process.stdout.write(`  ${f}\n`)
    if (result.backupDir) {
      const rel = result.backupDir.replace(projectRoot + '/', '')
      process.stdout.write(`\nPre-update backups saved to: ${rel}/\n`)
    }
  }
  if (hooksRefreshed) {
    process.stdout.write(`\nHooks refreshed → .claude/settings.json\n`)
  }
  if (result.skipped.length > 0) {
    process.stdout.write(`\nSkipped (already exist): ${result.skipped.join(', ')}\n`)
  }

  process.stdout.write('\nDone. Run: kata enter <mode> to get started\n')
}

