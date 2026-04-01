import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

/**
 * De-canonicalize a Claude Code project directory name back to a filesystem path.
 *
 * Claude Code canonicalization replaces `/` with `-`, e.g.:
 *   /data/projects/kata-wm → -data-projects-kata-wm
 *
 * The reverse is ambiguous for paths with hyphens (e.g., `-data-my-project`
 * could be `/data/my-project` or `/data/my/project`). Uses longest-existing-prefix
 * heuristic to resolve ambiguity.
 */
export function decanonPath(dirName: string): string {
  // Direct replacement: leading - becomes /, rest - become /
  const candidate = '/' + dirName.slice(1).replace(/-/g, '/')
  if (existsSync(candidate)) return candidate

  // Ambiguity handling: try shorter segments for longest existing prefix
  const parts = dirName.slice(1).split('-')
  for (let i = parts.length; i >= 1; i--) {
    const prefix = '/' + parts.slice(0, i).join('/')
    if (existsSync(prefix)) {
      const rest = parts.slice(i).join('-')
      const full = rest ? join(prefix, rest) : prefix
      if (existsSync(full)) return full
    }
  }

  return candidate // Best guess
}

/**
 * Check if a directory is a kata-enabled project.
 * Returns the layout type if enabled, or null if not.
 */
export function isKataEnabled(projectPath: string): { enabled: boolean; layout: '.kata' } {
  if (existsSync(join(projectPath, '.kata', 'kata.yaml'))) {
    return { enabled: true, layout: '.kata' }
  }

  return { enabled: false, layout: '.kata' }
}

/**
 * Scan ~/.claude/projects/ for kata-enabled projects.
 * Returns project entries with paths, names, and layout info.
 */
export function scanClaudeProjects(): Array<{
  path: string
  name: string
  kata_layout: '.kata'
  discovered_from: 'auto'
}> {
  const claudeProjectsDir = join(homedir(), '.claude', 'projects')
  if (!existsSync(claudeProjectsDir)) return []

  const entries: Array<{
    path: string
    name: string
    kata_layout: '.kata'
    discovered_from: 'auto'
  }> = []

  let dirNames: string[]
  try {
    dirNames = readdirSync(claudeProjectsDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
  } catch {
    return []
  }

  for (const dirName of dirNames) {
    // Skip non-canonicalized names (don't start with -)
    if (!dirName.startsWith('-')) continue

    const projectPath = decanonPath(dirName)

    // Skip if the resolved path doesn't exist (stale Claude Code project)
    if (!existsSync(projectPath)) continue

    const kataCheck = isKataEnabled(projectPath)
    if (!kataCheck.enabled) continue

    // Derive project name from the last path segment
    const name = projectPath.split('/').pop() || dirName

    entries.push({
      path: projectPath,
      name,
      kata_layout: kataCheck.layout,
      discovered_from: 'auto',
    })
  }

  return entries
}
