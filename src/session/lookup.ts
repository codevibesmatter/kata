// Session ID lookup utilities
import * as path from 'node:path'
import { existsSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/**
 * Get the workflow-management package root directory
 * Uses import.meta.url to find the package location
 * @returns Absolute path to packages/workflow-management/
 */
export function getPackageRoot(): string {
  const __filename = fileURLToPath(import.meta.url)
  const __dirname = path.dirname(__filename)
  // When bundled by tsup, file is at dist/index.js
  // When running from source (ts-node), file is at src/session/lookup.ts
  // Detect bundled state by checking if we're in 'dist' directory
  if (__dirname.endsWith('/dist') || __dirname.endsWith('\\dist')) {
    return path.resolve(__dirname, '..')
  }
  // From src/session/lookup.ts, go up 2 levels to package root
  return path.resolve(__dirname, '..', '..')
}

/**
 * Find kata project directory by walking up from cwd.
 * Priority:
 * 1. CLAUDE_PROJECT_DIR env var (explicit override, checks for .kata/)
 * 2. Walk up looking for .kata/
 * @returns Absolute path to project root
 * @throws Error if not in a kata project
 */
export function findProjectDir(): string {
  // Honor CLAUDE_PROJECT_DIR env var (set by hooks, npm installs, CI)
  const envDir = process.env.CLAUDE_PROJECT_DIR
  if (envDir && existsSync(path.join(envDir, '.kata'))) {
    return envDir
  }

  let dir = process.cwd()
  const root = path.parse(dir).root

  while (dir !== root) {
    if (existsSync(path.join(dir, '.kata'))) {
      return dir
    }
    const parent = path.dirname(dir)
    // Stop at git repo boundary — if this dir has .git, don't walk above it
    if (existsSync(path.join(dir, '.git'))) {
      break
    }
    dir = parent
  }

  throw new Error(
    'Not in a kata project directory (no .kata/ found)\n' +
      'Run: kata doctor --fix\n' +
      'Or set CLAUDE_PROJECT_DIR environment variable',
  )
}

/**
 * @deprecated Use findProjectDir() instead
 */
export const findClaudeProjectDir = findProjectDir

/**
 * Get the kata config directory for a project.
 * @param projectRoot - Absolute path to project root
 * @returns '.kata' relative prefix
 */
export function getKataDir(_projectRoot: string): string {
  return '.kata'
}

/**
 * Resolve kata-owned paths within a project.
 *   .kata/sessions/              — session state
 *   .kata/templates/             — mode templates
 *   .kata/kata.yaml              — project config
 *   .kata/verification-evidence/ — check-phase output
 */
function resolveKataPath(projectRoot: string, ...segments: string[]): string {
  return path.join(projectRoot, '.kata', ...segments)
}

/**
 * Get path to sessions directory
 */
export function getSessionsDir(projectRoot?: string): string {
  const root = projectRoot ?? findProjectDir()
  return resolveKataPath(root, 'sessions')
}

/**
 * Get path to project templates directory
 */
export function getProjectTemplatesDir(projectRoot?: string): string {
  const root = projectRoot ?? findProjectDir()
  return resolveKataPath(root, 'templates')
}

/**
 * Get path to project modes.yaml
 */
export function getProjectModesPath(projectRoot?: string): string {
  const root = projectRoot ?? findProjectDir()
  return resolveKataPath(root, 'modes.yaml')
}

/**
 * Get path to project wm.yaml
 */
export function getProjectWmConfigPath(projectRoot?: string): string {
  const root = projectRoot ?? findProjectDir()
  return resolveKataPath(root, 'wm.yaml')
}

/**
 * Get path to project verification-tools.md
 */
export function getProjectVerificationToolsPath(projectRoot?: string): string {
  const root = projectRoot ?? findProjectDir()
  return resolveKataPath(root, 'verification-tools.md')
}

/**
 * Get path to project prompts directory
 */
export function getProjectPromptsDir(projectRoot?: string): string {
  const root = projectRoot ?? findProjectDir()
  return resolveKataPath(root, 'prompts')
}

/**
 * Get path to project skills directory (.claude/skills/)
 */
export function getProjectSkillsDir(projectRoot?: string): string {
  const root = projectRoot ?? findProjectDir()
  return path.join(root, '.claude', 'skills')
}

/**
 * Get path to project providers directory
 */
export function getProjectProvidersDir(projectRoot?: string): string {
  const root = projectRoot ?? findProjectDir()
  return resolveKataPath(root, 'providers')
}

/**
 * Get path to verification evidence directory
 */
export function getVerificationDir(projectRoot?: string): string {
  const root = projectRoot ?? findProjectDir()
  return resolveKataPath(root, 'verification-evidence')
}

// UUID v4 pattern (Claude Code session IDs)
const SESSION_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/**
 * Get current Claude Code session ID.
 *
 * Resolution order:
 * 1. --session=ID flag (handled by callers before reaching here)
 * 2. Scan .kata/sessions/ for the most recently modified state.json
 *    (the active session is always the most recently touched one)
 * 3. Throws if no sessions exist
 *
 * @throws Error if no session ID can be determined
 */
export async function getCurrentSessionId(): Promise<string> {
  try {
    const projectDir = findProjectDir()

    const sessionsDir = getSessionsDir(projectDir)
    if (existsSync(sessionsDir)) {
      const entries = readdirSync(sessionsDir, { withFileTypes: true })
      const candidates: Array<{ id: string; mtimeMs: number }> = []
      for (const e of entries) {
        if (!e.isDirectory() || !SESSION_ID_RE.test(e.name)) continue
        const stateFile = path.join(sessionsDir, e.name, 'state.json')
        try {
          const { mtimeMs } = statSync(stateFile)
          candidates.push({ id: e.name, mtimeMs })
        } catch {
          // no state.json in this session dir
        }
      }

      const sorted = candidates.sort((a, b) => b.mtimeMs - a.mtimeMs)
      if (sorted[0]) {
        return sorted[0].id
      }
    }
  } catch {
    // fall through
  }
  throw new Error(
    'Session ID not available. Pass --session=SESSION_ID explicitly.\n' +
      'Hook handlers receive session_id from stdin JSON and must forward it.',
  )
}

/**
 * Get path to session state.json file
 * @param sessionId - Optional session ID (uses getCurrentSessionId if not provided)
 * @returns Absolute path to state.json
 */
export async function getStateFilePath(sessionId?: string): Promise<string> {
  const sid = sessionId || (await getCurrentSessionId())
  const projectDir = findProjectDir()
  return path.join(getSessionsDir(projectDir), sid, 'state.json')
}

// getUserConfigDir and getModesYamlPath removed — user tier eliminated (see issue #30)

/**
 * Get path to package templates directory
 * @returns Absolute path to templates/
 */
export function getTemplatesDir(): string {
  return path.join(getPackageRoot(), 'templates')
}

/**
 * Resolve a template path.
 * Lookup order:
 *
 * 1. Absolute path — use as-is
 * 2. Project: .kata/templates/{name}
 *
 * @param templatePath - Template filename or path
 * @returns Absolute path to template
 * @throws Error if template not found
 */
export function resolveTemplatePath(templatePath: string): string {
  // Absolute path - use as-is
  if (path.isAbsolute(templatePath)) {
    if (existsSync(templatePath)) {
      return templatePath
    }
    throw new Error(`Template not found: ${templatePath}`)
  }

  const checked: string[] = []

  // Project-level template
  try {
    const projectRoot = findProjectDir()
    const projectTemplate = path.join(getProjectTemplatesDir(projectRoot), templatePath)
    checked.push(projectTemplate)
    if (existsSync(projectTemplate)) {
      return projectTemplate
    }
  } catch {
    // No project dir found — skip project tier
  }

  throw new Error(
    `Template not found: ${templatePath}\n` +
      `Checked:\n${checked.map((p) => `  - ${p}`).join('\n')}\n` +
      `Run 'kata setup --batteries' to seed project templates.`,
  )
}

/**
 * Resolve a spec template path.
 * Lookup: project planning/spec-templates/ only.
 *
 * @param name - Spec template filename (e.g. "feature.md")
 * @returns Absolute path to spec template
 * @throws Error if spec template not found
 */
export function resolveSpecTemplatePath(name: string): string {
  const checked: string[] = []

  // Project-level spec template
  try {
    const projectRoot = findProjectDir()
    const projectTemplate = path.join(projectRoot, 'planning', 'spec-templates', name)
    checked.push(projectTemplate)
    if (existsSync(projectTemplate)) {
      return projectTemplate
    }
  } catch {
    // No project dir found
  }

  throw new Error(
    `Spec template not found: ${name}\n` +
      `Checked:\n${checked.map((p) => `  - ${p}`).join('\n')}\n` +
      `Run 'kata setup --batteries' to seed spec templates.`,
  )
}
