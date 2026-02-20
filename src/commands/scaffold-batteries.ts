// scaffold-batteries.ts — copy batteries-included content to a project
// Called by `wm setup --batteries` after base setup completes.
import { copyFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { getPackageRoot } from '../session/lookup.js'

export interface BatteriesResult {
  templates: string[]
  agents: string[]
  specTemplates: string[]
  skipped: string[]
}

/**
 * Copy all files from srcDir into destDir.
 * Skips files that already exist in destDir (never overwrites).
 * Returns lists of copied and skipped filenames.
 */
function copyDirectory(
  srcDir: string,
  destDir: string,
  copied: string[],
  skipped: string[],
): void {
  if (!existsSync(srcDir)) return
  mkdirSync(destDir, { recursive: true })

  for (const file of readdirSync(srcDir)) {
    const src = join(srcDir, file)
    const dest = join(destDir, file)
    if (existsSync(dest)) {
      skipped.push(file)
    } else {
      copyFileSync(src, dest)
      copied.push(file)
    }
  }
}

/**
 * Scaffold batteries-included content into a project.
 *
 * Copies from the wm package's batteries/ directory into the project:
 *   batteries/templates/  → .claude/workflows/templates/
 *   batteries/agents/     → .claude/agents/
 *   batteries/spec-templates/ → planning/spec-templates/
 *
 * Never overwrites existing files — safe to re-run.
 *
 * @param projectRoot - Absolute path to the project root
 * @returns Lists of what was copied and what was skipped
 */
export function scaffoldBatteries(projectRoot: string): BatteriesResult {
  const batteryRoot = join(getPackageRoot(), 'batteries')
  const result: BatteriesResult = { templates: [], agents: [], specTemplates: [], skipped: [] }

  // Mode templates → .claude/workflows/templates/
  copyDirectory(
    join(batteryRoot, 'templates'),
    join(projectRoot, '.claude', 'workflows', 'templates'),
    result.templates,
    result.skipped,
  )

  // Agent definitions → .claude/agents/
  copyDirectory(
    join(batteryRoot, 'agents'),
    join(projectRoot, '.claude', 'agents'),
    result.agents,
    result.skipped,
  )

  // Spec templates → planning/spec-templates/
  copyDirectory(
    join(batteryRoot, 'spec-templates'),
    join(projectRoot, 'planning', 'spec-templates'),
    result.specTemplates,
    result.skipped,
  )

  return result
}
