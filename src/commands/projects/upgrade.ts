import { isManagerInitialized } from '../../manager/paths.js'
import { readIndex, findProject } from '../../manager/registry.js'
import type { ProjectEntry } from '../../manager/registry.js'

interface UpgradeResult {
  name: string
  path: string
  status: 'upgraded' | 'skipped' | 'error'
  details: string
}

/**
 * kata projects upgrade [<project>] [--dry-run]
 *
 * Run batteries --update for registered projects.
 */
export async function upgradeProjects(args: string[]): Promise<void> {
  const dryRun = args.includes('--dry-run')
  const projectQuery = args.find((a) => !a.startsWith('--'))

  if (!isManagerInitialized()) {
    // biome-ignore lint/suspicious/noConsole: CLI output
    console.error('Manager not initialized. Run: kata projects init-manager')
    process.exitCode = 1
    return
  }

  const index = readIndex()

  // Determine which projects to upgrade
  let projects: ProjectEntry[]
  if (projectQuery) {
    const found = findProject(index, projectQuery)
    if (!found) {
      // biome-ignore lint/suspicious/noConsole: CLI output
      console.error(`Project not found: ${projectQuery}`)
      process.exitCode = 1
      return
    }
    projects = [found]
  } else {
    projects = index.projects
  }

  if (projects.length === 0) {
    // biome-ignore lint/suspicious/noConsole: CLI output
    console.error('No projects registered.')
    process.exitCode = 1
    return
  }

  const results: UpgradeResult[] = []

  for (const project of projects) {
    // biome-ignore lint/suspicious/noConsole: CLI output
    console.error(`Upgrading ${project.alias || project.name} (${project.path})`)

    if (dryRun) {
      // biome-ignore lint/suspicious/noConsole: CLI output
      console.error('  [dry-run] Would run: kata update --cwd=' + project.path)
      results.push({
        name: project.alias || project.name,
        path: project.path,
        status: 'skipped',
        details: 'dry-run',
      })
      continue
    }

    try {
      const { update } = await import('../update.js')
      await update([`--cwd=${project.path}`])
      results.push({
        name: project.alias || project.name,
        path: project.path,
        status: 'upgraded',
        details: 'templates updated',
      })
      // biome-ignore lint/suspicious/noConsole: CLI output
      console.error(`  [ok] upgraded`)
    } catch (e) {
      results.push({
        name: project.alias || project.name,
        path: project.path,
        status: 'error',
        details: e instanceof Error ? e.message : String(e),
      })
      // biome-ignore lint/suspicious/noConsole: CLI output
      console.error(`  [error] ${e instanceof Error ? e.message : e}`)
    }
  }

  const upgraded = results.filter((r) => r.status === 'upgraded').length
  const errors = results.filter((r) => r.status === 'error').length

  // biome-ignore lint/suspicious/noConsole: CLI output
  console.error('')
  // biome-ignore lint/suspicious/noConsole: CLI output
  console.error(`Summary: ${projects.length} project(s), ${upgraded} upgraded, ${errors} error(s)`)

  if (errors > 0) {
    process.exitCode = 1
  }
}
