// kata update — file-level comparison for template updates
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import jsYaml from 'js-yaml'
import { getPackageRoot, findProjectDir, getProjectTemplatesDir } from '../session/lookup.js'
import { getKataConfigPath, loadKataConfig } from '../config/kata-config.js'

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

  const templatesDir = getProjectTemplatesDir(projectRoot)
  const batteriesTemplatesDir = join(getPackageRoot(), 'batteries', 'templates')

  // Read current package version
  const pkgJson = JSON.parse(readFileSync(join(getPackageRoot(), 'package.json'), 'utf-8')) as { version?: string }
  const currentVersion = pkgJson.version ?? '0.0.0'

  // Read installed version from kata.yaml
  const config = loadKataConfig(projectRoot)
  const installedVersion = config.kata_version

  if (installedVersion !== currentVersion) {
    process.stdout.write(`Updating from v${installedVersion ?? 'unknown'} to v${currentVersion}\n`)
  }

  let updated = 0
  let skipped = 0

  // Check each template
  if (existsSync(batteriesTemplatesDir)) {
    for (const file of readdirSync(batteriesTemplatesDir)) {
      if (!file.endsWith('.md')) continue

      const projectFile = join(templatesDir, file)
      const newBatteries = readFileSync(join(batteriesTemplatesDir, file), 'utf-8')

      if (!existsSync(projectFile)) {
        // New template — copy it
        writeFileSync(projectFile, newBatteries)
        process.stdout.write(`  + ${file} (new)\n`)
        updated++
        continue
      }

      const current = readFileSync(projectFile, 'utf-8')

      if (current === newBatteries) {
        // Already matches — skip
        continue
      }

      // User customized — skip with notice
      process.stdout.write(`  ~ ${file} (customized — update manually)\n`)
      skipped++
    }
  }

  // Update kata_version in kata.yaml
  const kataYamlPath = getKataConfigPath(projectRoot)
  if (existsSync(kataYamlPath)) {
    const raw = readFileSync(kataYamlPath, 'utf-8')
    const yaml = jsYaml.load(raw) as Record<string, unknown>
    yaml.kata_version = currentVersion
    writeFileSync(kataYamlPath, jsYaml.dump(yaml, { lineWidth: 120, noRefs: true }))
  }

  if (updated === 0 && skipped === 0) {
    process.stdout.write('All templates up to date\n')
  } else {
    process.stdout.write(`\nUpdate complete: ${updated} updated, ${skipped} skipped\n`)
  }
}
