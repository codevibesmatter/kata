// kata update — overwrite project templates, skills, and config with latest package versions
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import jsYaml from 'js-yaml'
import { getPackageRoot, findProjectDir } from '../session/lookup.js'
import { getKataConfigPath, loadKataConfig } from '../config/kata-config.js'
import { scaffoldBatteries, installUserSkills, cleanLegacyFiles } from './scaffold-batteries.js'

export async function update(args: string[]): Promise<void> {
  let projectRoot: string
  try {
    // Support --cwd=PATH for kata projects upgrade
    const cwdArg = args.find(a => a.startsWith('--cwd='))
    projectRoot = cwdArg ? cwdArg.slice('--cwd='.length) : findProjectDir()
  } catch {
    process.stderr.write('Error: Not in a kata project. Run kata setup first.\n')
    process.exitCode = 1
    return
  }

  // Read current package version
  const pkgJson = JSON.parse(readFileSync(join(getPackageRoot(), 'package.json'), 'utf-8')) as { version?: string }
  const currentVersion = pkgJson.version ?? '0.0.0'

  // Read installed version from kata.yaml
  const config = loadKataConfig(projectRoot)
  const installedVersion = config.kata_version

  if (installedVersion !== currentVersion) {
    process.stdout.write(`Updating from v${installedVersion ?? 'unknown'} to v${currentVersion}\n`)
  }

  // Clean legacy project-level template/skill copies before scaffolding
  const cleaned = cleanLegacyFiles(projectRoot)

  // Use scaffoldBatteries with update=true to overwrite all files
  const result = scaffoldBatteries(projectRoot, true)

  // Install/update user-scoped skills
  const userSkillsResult = installUserSkills({ update: true })

  // Update kata_version in kata.yaml
  const kataYamlPath = getKataConfigPath(projectRoot)
  if (existsSync(kataYamlPath)) {
    const raw = readFileSync(kataYamlPath, 'utf-8')
    const yaml = jsYaml.load(raw) as Record<string, unknown>
    yaml.kata_version = currentVersion
    writeFileSync(kataYamlPath, jsYaml.dump(yaml, { lineWidth: 120, noRefs: true }))
  }

  // Report cleaned legacy files
  const totalCleaned = cleaned.removedTemplates.length + cleaned.removedSkills.length
  if (totalCleaned > 0) {
    process.stdout.write(`Cleaned ${totalCleaned} legacy files:\n`)
    for (const f of cleaned.removedTemplates) {
      process.stdout.write(`  - .kata/templates/${f}\n`)
    }
    for (const s of cleaned.removedSkills) {
      process.stdout.write(`  - .claude/skills/${s}/\n`)
    }
  }

  // Report results
  const totalUpdated = result.updated.length
  const totalNew = result.specTemplates.length +
    result.prompts.length + result.interviews.length + result.verificationTools.length +
    result.kataConfig.length + result.githubTemplates.length

  if (totalUpdated > 0) {
    process.stdout.write(`Updated ${totalUpdated} files:\n`)
    for (const f of result.updated) {
      process.stdout.write(`  ↻ ${f}\n`)
    }
  }
  if (totalNew > 0) {
    process.stdout.write(`Added ${totalNew} new files:\n`)
    for (const f of [...result.specTemplates,
      ...result.prompts, ...result.interviews, ...result.verificationTools,
      ...result.kataConfig, ...result.githubTemplates]) {
      process.stdout.write(`  + ${f}\n`)
    }
  }
  if (result.backupDir) {
    process.stdout.write(`\nBackups saved to: ${result.backupDir}\n`)
  }
  if (totalUpdated === 0 && totalNew === 0) {
    process.stdout.write('All files up to date\n')
  }

  // Report user-scoped skill results
  const userSkillTotal = userSkillsResult.installed.length + userSkillsResult.updated.length
  if (userSkillTotal > 0) {
    process.stdout.write(`\nUser skills (~/.claude/skills/):\n`)
    for (const s of userSkillsResult.installed) {
      process.stdout.write(`  + kata-${s}\n`)
    }
    for (const s of userSkillsResult.updated) {
      process.stdout.write(`  ↻ kata-${s}\n`)
    }
  }

  process.stdout.write(`\nkata v${currentVersion} — version stamped in kata.yaml\n`)
}
