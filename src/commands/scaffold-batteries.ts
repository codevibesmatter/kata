// scaffold-batteries.ts — copy batteries-included content to a project
// Called by `kata setup --yes` after base setup completes.
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { dirname } from 'node:path'
import { homedir } from 'node:os'
import { getPackageRoot, getProjectTemplatesDir, getProjectPromptsDir, getProjectProvidersDir, getProjectVerificationToolsPath, getProjectSkillsDir } from '../session/lookup.js'
import { getKataConfigPath } from '../config/kata-config.js'

export interface BatteriesResult {
  prompts: string[]
  providerPlugins: string[]
  specTemplates: string[]
  githubTemplates: string[]
  interviews: string[]
  verificationTools: string[]
  kataConfig: string[]
  skipped: string[]
  updated: string[]
  backupDir?: string
}

/**
 * Copy all files from srcDir into destDir (one level deep).
 * When update is true, overwrites existing files and reports them as updated.
 * If backupDir is provided, backs up existing files there before overwriting.
 * Otherwise skips existing files.
 */
function copyDirectory(
  srcDir: string,
  destDir: string,
  copied: string[],
  skipped: string[],
  updated: string[],
  update = false,
  backupDir?: string,
): void {
  if (!existsSync(srcDir)) return
  mkdirSync(destDir, { recursive: true })

  for (const file of readdirSync(srcDir)) {
    const src = join(srcDir, file)
    const dest = join(destDir, file)
    if (existsSync(dest)) {
      if (update) {
        if (backupDir) {
          mkdirSync(backupDir, { recursive: true })
          copyFileSync(dest, join(backupDir, file))
        }
        copyFileSync(src, dest)
        updated.push(file)
      } else {
        skipped.push(file)
      }
    } else {
      copyFileSync(src, dest)
      copied.push(file)
    }
  }
}

/**
 * Back up a single file to backupDir before overwriting, if backupDir is set.
 */
function backupFile(filePath: string, backupDir: string, filename: string): void {
  mkdirSync(backupDir, { recursive: true })
  copyFileSync(filePath, join(backupDir, filename))
}

/**
 * Scaffold batteries-included content into a project.
 *
 * Copies from the kata package's batteries/ directory:
 *   batteries/templates/              → .kata/templates/
 *   batteries/spec-templates/         → planning/spec-templates/
 *   batteries/github/ISSUE_TEMPLATE/  → .github/ISSUE_TEMPLATE/
 *   batteries/github/labels.json      → .github/wm-labels.json  (read by setup mode)
 *
 * Never overwrites existing files — safe to re-run.
 *
 * @param projectRoot - Absolute path to the project root
 * @param update - When true, overwrite existing files instead of skipping them
 */
export function scaffoldBatteries(projectRoot: string, update = false): BatteriesResult {
  const batteryRoot = join(getPackageRoot(), 'batteries')

  // Compute a timestamped backup dir under .kata/ (only used on --update)
  let backupRoot: string | undefined
  if (update) {
    const timestamp = new Date().toISOString().replace(/:/g, '-').slice(0, 19)
    backupRoot = join(projectRoot, '.kata', 'batteries-backup', timestamp)
  }

  const result: BatteriesResult = {
    prompts: [],
    providerPlugins: [],
    specTemplates: [],
    githubTemplates: [],
    interviews: [],
    verificationTools: [],
    kataConfig: [],
    skipped: [],
    updated: [],
    backupDir: backupRoot,
  }

  // kata.yaml → project config dir
  const kataYamlSrc = join(batteryRoot, 'kata.yaml')
  const kataYamlDest = getKataConfigPath(projectRoot)
  if (existsSync(kataYamlSrc)) {
    if (existsSync(kataYamlDest)) {
      if (update) {
        if (backupRoot) backupFile(kataYamlDest, backupRoot, 'kata.yaml')
        copyFileSync(kataYamlSrc, kataYamlDest)
        result.kataConfig.push('kata.yaml')
        result.updated.push('kata.yaml')
      } else {
        result.skipped.push('kata.yaml')
      }
    } else {
      mkdirSync(dirname(kataYamlDest), { recursive: true })
      copyFileSync(kataYamlSrc, kataYamlDest)
      result.kataConfig.push('kata.yaml')
    }
  }

  // User-customizable directories: NEVER overwrite existing files, only add new ones.
  // These are meant to be edited by the project — `kata update` must not clobber them.

  // Review prompts → .kata/prompts/ (user-customizable)
  copyDirectory(
    join(batteryRoot, 'prompts'),
    getProjectPromptsDir(projectRoot),
    result.prompts,
    result.skipped,
    result.updated,
    false, // never overwrite — user may have customized
  )

  // Provider plugins → .kata/providers/ (user-customizable)
  copyDirectory(
    join(batteryRoot, 'providers'),
    getProjectProvidersDir(projectRoot),
    result.providerPlugins,
    result.skipped,
    result.updated,
    false, // never overwrite
  )

  // Spec templates → planning/spec-templates/ (user-customizable)
  copyDirectory(
    join(batteryRoot, 'spec-templates'),
    join(projectRoot, 'planning', 'spec-templates'),
    result.specTemplates,
    result.skipped,
    result.updated,
    false, // never overwrite
  )

  // GitHub issue templates → .github/ISSUE_TEMPLATE/ (user-customizable)
  copyDirectory(
    join(batteryRoot, 'github', 'ISSUE_TEMPLATE'),
    join(projectRoot, '.github', 'ISSUE_TEMPLATE'),
    result.githubTemplates,
    result.skipped,
    result.updated,
    false, // never overwrite
  )

  // labels.json → .github/wm-labels.json (kata-managed, safe to update)
  const labelsSrc = join(batteryRoot, 'github', 'labels.json')
  const labelsDest = join(projectRoot, '.github', 'wm-labels.json')
  if (existsSync(labelsSrc)) {
    if (existsSync(labelsDest)) {
      if (update) {
        if (backupRoot) backupFile(labelsDest, backupRoot, 'wm-labels.json')
        copyFileSync(labelsSrc, labelsDest)
        result.updated.push('wm-labels.json')
      } else {
        result.skipped.push('wm-labels.json')
      }
    } else {
      mkdirSync(join(projectRoot, '.github'), { recursive: true })
      copyFileSync(labelsSrc, labelsDest)
      result.githubTemplates.push('wm-labels.json')
    }
  }

  // Interview configs → .kata/interviews/ (user-customizable)
  copyDirectory(
    join(batteryRoot, 'interviews'),
    join(projectRoot, '.kata', 'interviews'),
    result.interviews,
    result.skipped,
    result.updated,
    false, // never overwrite
  )

  // verification-tools.md → .kata/verification-tools.md
  const vtSrc = join(batteryRoot, 'verification-tools.md')
  const vtDest = getProjectVerificationToolsPath(projectRoot)
  if (existsSync(vtSrc)) {
    if (existsSync(vtDest)) {
      if (update) {
        if (backupRoot) backupFile(vtDest, backupRoot, 'verification-tools.md')
        copyFileSync(vtSrc, vtDest)
        result.updated.push('verification-tools.md')
      } else {
        result.skipped.push('verification-tools.md')
      }
    } else {
      mkdirSync(join(vtDest, '..'), { recursive: true })
      copyFileSync(vtSrc, vtDest)
      result.verificationTools.push('verification-tools.md')
    }
  }

  return result
}

export interface CleanLegacyResult {
  removedTemplates: string[]
  removedSkills: string[]
  backupDir?: string
}

/**
 * Remove legacy project-level copies of batteries templates and skills.
 *
 * Prior kata versions copied templates to .kata/templates/ and skills to .claude/skills/.
 * The dual-resolution system now reads these from the package at runtime, so project-level
 * copies are no longer needed.
 *
 * Backs up files to .kata/batteries-backup/{timestamp}/ before removal so users can
 * restore customizations as project overrides.
 *
 * Only removes files that match batteries names — custom/user-authored files are preserved.
 * Does NOT remove .kata/steps.yaml (may contain user-authored content).
 */
export function cleanLegacyFiles(projectRoot: string): CleanLegacyResult {
  const batteryRoot = join(getPackageRoot(), 'batteries')
  const result: CleanLegacyResult = { removedTemplates: [], removedSkills: [] }

  // Compute backup dir (only created if files are actually removed)
  const timestamp = new Date().toISOString().replace(/:/g, '-').slice(0, 19)
  const backupRoot = join(projectRoot, '.kata', 'batteries-backup', timestamp)

  // 1. Remove .kata/templates/{name} for each batteries template
  const batteriesTemplatesDir = join(batteryRoot, 'templates')
  const projectTemplatesDir = getProjectTemplatesDir(projectRoot)
  if (existsSync(batteriesTemplatesDir) && existsSync(projectTemplatesDir)) {
    for (const file of readdirSync(batteriesTemplatesDir)) {
      const projectFile = join(projectTemplatesDir, file)
      if (existsSync(projectFile)) {
        backupFile(projectFile, join(backupRoot, 'templates'), file)
        rmSync(projectFile)
        result.removedTemplates.push(file)
      }
    }
    // If templates dir is now empty, remove it
    try {
      const remaining = readdirSync(projectTemplatesDir)
      if (remaining.length === 0) {
        rmSync(projectTemplatesDir, { recursive: true })
      }
    } catch {}
  }

  // 2. Remove .claude/skills/{name}/ for batteries-matching skills
  const batteriesSkillsDir = join(batteryRoot, 'skills')
  const projectSkillsDir = getProjectSkillsDir(projectRoot)
  if (existsSync(batteriesSkillsDir) && existsSync(projectSkillsDir)) {
    for (const entry of readdirSync(batteriesSkillsDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const bareName = entry.name
      const bareDir = join(projectSkillsDir, bareName)
      if (existsSync(bareDir)) {
        // Backup all files in the skill directory
        const skillBackupDir = join(backupRoot, 'skills', bareName)
        for (const file of readdirSync(bareDir)) {
          const filePath = join(bareDir, file)
          try { backupFile(filePath, skillBackupDir, file) } catch {}
        }
        rmSync(bareDir, { recursive: true })
        result.removedSkills.push(bareName)
      }
    }
  }

  // Only set backupDir if something was actually backed up
  if (result.removedTemplates.length > 0 || result.removedSkills.length > 0) {
    result.backupDir = backupRoot
  }

  return result
}

export interface UserSkillsResult {
  installed: string[]  // skill names newly installed
  updated: string[]    // skill names overwritten
  skipped: string[]    // skill names already existed (not overwritten when update=false)
}

/**
 * Install user-scoped skills to ~/.claude/skills/{name}/.
 *
 * Copies each directory from batteries/skills/{name}/ to ~/.claude/skills/{name}/.
 * Battery skill directories are already prefixed with kata- (e.g. kata-code-impl).
 *
 * @param options.update - When true, overwrite existing skills. Default false (skip existing).
 * @param options.homeDir - Override home directory (for test isolation). Default os.homedir().
 */
export function installUserSkills(options: {
  update?: boolean
  homeDir?: string
} = {}): UserSkillsResult {
  const { update = false, homeDir = homedir() } = options
  const batteryRoot = join(getPackageRoot(), 'batteries')
  const skillsSrc = join(batteryRoot, 'skills')
  const userSkillsDir = join(homeDir, '.claude', 'skills')

  const result: UserSkillsResult = { installed: [], updated: [], skipped: [] }

  if (!existsSync(skillsSrc)) return result

  for (const entry of readdirSync(skillsSrc, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const skillName = entry.name
    const destName = skillName
    const srcDir = join(skillsSrc, skillName)
    const destDir = join(userSkillsDir, destName)

    if (existsSync(destDir)) {
      if (update) {
        // Overwrite all files in the skill directory
        for (const file of readdirSync(srcDir)) {
          copyFileSync(join(srcDir, file), join(destDir, file))
        }
        result.updated.push(skillName)
      } else {
        result.skipped.push(skillName)
      }
    } else {
      mkdirSync(destDir, { recursive: true })
      for (const file of readdirSync(srcDir)) {
        copyFileSync(join(srcDir, file), join(destDir, file))
      }
      result.installed.push(skillName)
    }
  }

  return result
}

