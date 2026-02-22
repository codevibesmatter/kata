// kata setup - Configure kata in a project (pure config, flag-driven)
// For the guided setup interview, use: kata enter onboard
// Hook registration uses 'kata hook <name>' commands in .claude/settings.json.
import { execSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import jsYaml from 'js-yaml'
import { getDefaultProfile, type SetupProfile } from '../config/setup-profile.js'
import type { WmConfig } from '../config/wm-config.js'
import { getPackageRoot, findProjectDir, getKataDir, getSessionsDir, getProjectTemplatesDir, getProjectWmConfigPath } from '../session/lookup.js'

/**
 * Resolve the absolute path to the kata binary.
 *
 * Prefers `which kata` so hooks point to the bin symlink that npm/pnpm update on
 * upgrade (e.g. /usr/local/bin/kata). Falls back to the package-relative path for
 * workspace / pnpm-link scenarios where `kata` is not yet in PATH.
 */
function resolveWmBin(): string {
  try {
    const which = execSync('which kata 2>/dev/null || command -v kata 2>/dev/null', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim()
    if (which) return which
  } catch {
    // which failed or kata not in PATH — fall back to package-relative path
  }
  return join(getPackageRoot(), 'kata')
}

/**
 * Parse command line arguments for setup command
 */
function parseArgs(args: string[]): {
  yes: boolean
  strict: boolean
  batteries: boolean
  cwd: string
  explicitCwd: boolean
  session: string | undefined
} {
  let yes = false
  let strict = false
  let batteries = false
  let cwd = process.cwd()
  let explicitCwd = false
  let session: string | undefined

  for (const arg of args) {
    if (arg === '--yes' || arg === '-y') {
      yes = true
    } else if (arg === '--strict') {
      strict = true
    } else if (arg === '--batteries' || arg === '-b') {
      batteries = true
      yes = true // --batteries implies --yes (skips interview)
    } else if (arg.startsWith('--cwd=')) {
      cwd = arg.slice('--cwd='.length)
      explicitCwd = true
    } else if (arg.startsWith('--session=')) {
      session = arg.slice('--session='.length)
    }
  }

  return { yes, strict, batteries, cwd, explicitCwd, session }
}

/**
 * Settings.json hook entry structure
 */
interface HookEntry {
  matcher?: string
  hooks: Array<{
    type: string
    command: string
    timeout?: number
  }>
}

/**
 * Settings.json structure
 */
interface SettingsJson {
  hooks?: Record<string, HookEntry[]>
  [key: string]: unknown
}

/**
 * Build wm hook entries for .claude/settings.json.
 * Uses an absolute path to the wm binary so hooks work regardless of PATH
 * (both for globally-installed and locally-installed packages).
 * Default: SessionStart, UserPromptSubmit, Stop, PreToolUse (mode-gate)
 * With --strict: also PreToolUse task-deps + task-evidence hooks
 */
function buildHookEntries(strict: boolean, wmBin: string): Record<string, HookEntry[]> {
  // Quote the binary path so spaces in the path are handled correctly
  const bin = `"${wmBin}"`
  const hooks: Record<string, HookEntry[]> = {
    SessionStart: [
      {
        hooks: [
          {
            type: 'command',
            command: `${bin} hook session-start`,
          },
        ],
      },
    ],
    UserPromptSubmit: [
      {
        hooks: [
          {
            type: 'command',
            command: `${bin} hook user-prompt`,
          },
        ],
      },
    ],
    Stop: [
      {
        hooks: [
          {
            type: 'command',
            command: `${bin} hook stop-conditions`,
            timeout: 30,
          },
        ],
      },
    ],
    // mode-gate is always registered: it injects --session=ID into kata bash
    // commands so session resolution works correctly (not just a strict feature)
    PreToolUse: [
      {
        hooks: [
          {
            type: 'command',
            command: `${bin} hook mode-gate`,
            timeout: 10,
          },
        ],
      },
    ],
  }

  if (strict) {
    hooks.PreToolUse.push(
      {
        matcher: 'TaskUpdate',
        hooks: [
          {
            type: 'command',
            command: `${bin} hook task-deps`,
            timeout: 10,
          },
        ],
      },
      {
        matcher: 'TaskUpdate',
        hooks: [
          {
            type: 'command',
            command: `${bin} hook task-evidence`,
            timeout: 10,
          },
        ],
      },
    )
  }

  return hooks
}

/**
 * Read existing .claude/settings.json or return empty structure
 * Uses cwd-based path since .claude/sessions/ may not exist yet
 */
function readSettings(cwd: string): SettingsJson {
  const settingsPath = join(cwd, '.claude', 'settings.json')
  if (existsSync(settingsPath)) {
    try {
      const raw = readFileSync(settingsPath, 'utf-8')
      return JSON.parse(raw) as SettingsJson
    } catch {
      return {}
    }
  }
  return {}
}

/**
 * Write .claude/settings.json
 */
function writeSettings(cwd: string, settings: SettingsJson): void {
  const claudeDir = join(cwd, '.claude')
  mkdirSync(claudeDir, { recursive: true })
  const settingsPath = join(claudeDir, 'settings.json')
  writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`, 'utf-8')
}

/**
 * Merge wm hook entries into existing settings
 * Preserves non-wm hooks, replaces wm hooks
 */
function mergeHooksIntoSettings(
  settings: SettingsJson,
  wmHooks: Record<string, HookEntry[]>,
): SettingsJson {
  const existingHooks = settings.hooks ?? {}
  const merged: Record<string, HookEntry[]> = {}

  // For each hook event, keep non-wm entries and add wm entries
  const allEvents = new Set([...Object.keys(existingHooks), ...Object.keys(wmHooks)])

  for (const event of allEvents) {
    const existing = existingHooks[event] ?? []
    const wmEntries = wmHooks[event] ?? []

    // Filter out existing wm hook entries by matching known wm subcommand names.
    // Tolerates both bare `wm hook …` and quoted `"/path/wm" hook …` forms while
    // avoiding false positives from unrelated tools like lefthook or husky.
    const wmHookPattern =
      /\bhook (session-start|user-prompt|stop-conditions|mode-gate|task-deps|task-evidence)\b/
    const nonWmEntries = existing.filter((entry) => {
      return !entry.hooks?.some(
        (h) => typeof h.command === 'string' && wmHookPattern.test(h.command),
      )
    })

    // Combine: non-wm first, then wm entries
    merged[event] = [...nonWmEntries, ...wmEntries]
  }

  return {
    ...settings,
    hooks: merged,
  }
}

/**
 * Generate wm.yaml content from a WmConfig object
 */
function generateWmYaml(config: WmConfig): string {
  return jsYaml.dump(config, { lineWidth: 120, noRefs: true })
}

/**
 * Build WmConfig from setup profile, merged with any existing wm.yaml.
 * Existing values win for all fields except wm_version (always updated to current).
 * This prevents re-running setup from silently erasing verify_command,
 * prime_extensions, mode_config, or other custom configuration.
 */
function buildWmConfig(projectRoot: string, profile: SetupProfile): WmConfig {
  // Only carry code_review when explicitly enabled (true).
  // False represents "unset" in the profile (same as wm-config.ts getDefaultConfig),
  // meaning "enabled when a reviewer is configured". Writing false would silently
  // disable verification for existing configs that rely on the implicit default.
  const profileReviews: WmConfig['reviews'] = {
    spec_review: profile.reviews.spec_review,
    code_reviewer: profile.reviews.code_reviewer,
    ...(profile.reviews.code_review ? { code_review: true } : {}),
  }

  const fromProfile: WmConfig = {
    project: {
      name: profile.project_name,
      test_command: profile.test_command ?? undefined,
      ci: profile.ci,
    },
    spec_path: profile.spec_path,
    research_path: profile.research_path,
    session_retention_days: profile.session_retention_days,
    reviews: profileReviews,
    wm_version: getWmVersion(),
  }

  const wmYamlPath = getProjectWmConfigPath(projectRoot)
  if (!existsSync(wmYamlPath)) return fromProfile

  try {
    const raw = readFileSync(wmYamlPath, 'utf-8')
    const existing = jsYaml.load(raw) as WmConfig | null
    if (!existing || typeof existing !== 'object') {
      // Malformed YAML — warn and fall back to profile rather than silently overwriting
      process.stderr.write(
        `kata setup: warning: existing wm.yaml is malformed; using auto-detected defaults\n`,
      )
      return fromProfile
    }

    // Existing config wins for all fields; always bump wm_version
    return {
      ...fromProfile,
      ...existing,
      project: { ...fromProfile.project, ...existing.project },
      reviews: { ...fromProfile.reviews, ...existing.reviews },
      wm_version: getWmVersion(),
    }
  } catch {
    // Parse error — warn and fall back to profile
    process.stderr.write(
      `kata setup: warning: could not parse existing wm.yaml; using auto-detected defaults\n`,
    )
    return fromProfile
  }
}

/**
 * Read wm version from package.json
 */
function getWmVersion(): string {
  try {
    const pkgPath = join(getPackageRoot(), 'package.json')
    if (existsSync(pkgPath)) {
      const raw = readFileSync(pkgPath, 'utf-8')
      const parsed = JSON.parse(raw) as { version?: string }
      if (parsed.version) return parsed.version
    }
  } catch {
    // Fall through
  }
  return '0.0.0'
}

/**
 * Write wm.yaml to the kata config directory.
 * For new projects (.kata/ layout): .kata/wm.yaml
 * For existing projects (.claude/ layout): .claude/workflows/wm.yaml
 */
function writeWmYaml(cwd: string, content: string): void {
  const wmYamlPath = getProjectWmConfigPath(cwd)
  const dir = join(wmYamlPath, '..')
  mkdirSync(dir, { recursive: true })
  writeFileSync(wmYamlPath, content, 'utf-8')
}

/**
 * Resolve the project root for setup.
 * - Explicit --cwd always wins (user knows where they want to set up)
 * - Otherwise: walk up to find existing .claude/ directory (prevents nested .claude/)
 * - Fresh projects with no .claude/ yet: fall back to cwd
 */
function resolveProjectRoot(cwd: string, explicitCwd: boolean): string {
  if (explicitCwd) return cwd
  try {
    return findProjectDir()
  } catch {
    // Fresh project: no .claude/ yet, use provided cwd
    return cwd
  }
}

/**
 * Write config files and register hooks (full setup — used by --yes path).
 * Merges with existing wm.yaml so re-running does not lose custom config.
 */
function applySetup(cwd: string, profile: SetupProfile, explicitCwd: boolean): void {
  const projectRoot = resolveProjectRoot(cwd, explicitCwd)

  // Build merged config (existing wm.yaml fields win over auto-detected defaults)
  const config = buildWmConfig(projectRoot, profile)
  writeWmYaml(projectRoot, generateWmYaml(config))

  // For fresh projects (no .kata/ or .claude/ yet), create .kata/ (new layout).
  // For existing projects, getKataDir() detects the active layout.
  if (!existsSync(join(projectRoot, '.kata')) && !existsSync(join(projectRoot, '.claude', 'workflows'))) {
    mkdirSync(join(projectRoot, '.kata'), { recursive: true })
  }

  // Ensure sessions directory exists
  mkdirSync(getSessionsDir(projectRoot), { recursive: true })

  // Seed onboard.md so `kata enter onboard` works without --batteries
  const templatesDir = getProjectTemplatesDir(projectRoot)
  const onboardDest = join(templatesDir, 'onboard.md')
  if (!existsSync(onboardDest)) {
    const onboardSrc = join(getPackageRoot(), 'templates', 'onboard.md')
    if (existsSync(onboardSrc)) {
      mkdirSync(templatesDir, { recursive: true })
      copyFileSync(onboardSrc, onboardDest)
    }
  }

  // Register hooks in settings.json using absolute wm binary path
  const wmBin = resolveWmBin()
  const settings = readSettings(projectRoot)
  const wmHooks = buildHookEntries(profile.strict, wmBin)
  writeSettings(projectRoot, mergeHooksIntoSettings(settings, wmHooks))
}

/**
 * kata setup [--yes] [--strict] [--batteries] [--cwd=PATH]
 *
 * Pure configuration — writes wm.yaml, registers hooks, scaffolds content.
 * Always flag-driven; never enters an interactive session.
 *
 * For the guided setup interview, use: kata enter onboard
 *
 * Installs hooks in PROJECT-LEVEL .claude/settings.json only.
 * Bypasses findProjectDir() since .claude/ may not exist yet.
 */
export async function setup(args: string[]): Promise<void> {
  const parsed = parseArgs(args)
  // Resolve project root before auto-detecting profile so that running from a
  // subdirectory (e.g. apps/gateway/) doesn't stamp the wrong name/test command
  // into wm.yaml when .claude/ already exists at a higher level.
  const projectRoot = resolveProjectRoot(parsed.cwd, parsed.explicitCwd)
  const profile = getDefaultProfile(projectRoot)
  profile.strict = parsed.strict

  if (parsed.yes) {
    // --yes / --batteries: write everything with auto-detected defaults
    applySetup(parsed.cwd, profile, parsed.explicitCwd)

    // --batteries: scaffold full mode templates, agents, and spec templates
    if (parsed.batteries) {
      const { scaffoldBatteries } = await import('./scaffold-batteries.js')
      const result = scaffoldBatteries(projectRoot)

      const kd = getKataDir(projectRoot)
      process.stdout.write('kata setup --batteries complete:\n')
      process.stdout.write(`  Project: ${profile.project_name}\n`)
      process.stdout.write(`  Config: ${kd === '.kata' ? '.kata/wm.yaml' : '.claude/workflows/wm.yaml'}\n`)
      process.stdout.write(`  Hooks: .claude/settings.json\n`)
      process.stdout.write('\nBatteries scaffolded:\n')
      if (result.templates.length > 0) {
        const tmplRelDir = kd === '.kata' ? '.kata/templates' : '.claude/workflows/templates'
        process.stdout.write(`  Mode templates (${result.templates.length}):\n`)
        for (const t of result.templates) {
          process.stdout.write(`    ${tmplRelDir}/${t}\n`)
        }
      }
      if (result.agents.length > 0) {
        process.stdout.write(`  Agents (${result.agents.length}):\n`)
        for (const a of result.agents) {
          process.stdout.write(`    .claude/agents/${a}\n`)
        }
      }
      if (result.specTemplates.length > 0) {
        process.stdout.write(`  Spec templates (${result.specTemplates.length}):\n`)
        for (const s of result.specTemplates) {
          process.stdout.write(`    planning/spec-templates/${s}\n`)
        }
      }
      if (result.skipped.length > 0) {
        process.stdout.write(`  Skipped (already exist): ${result.skipped.join(', ')}\n`)
      }
    } else {
      // Plain --yes summary
      const kd2 = getKataDir(projectRoot)
      process.stdout.write('kata setup complete:\n')
      process.stdout.write(`  Project: ${profile.project_name}\n`)
      process.stdout.write(`  Test command: ${profile.test_command ?? 'none detected'}\n`)
      process.stdout.write(`  CI: ${profile.ci ?? 'none detected'}\n`)
      process.stdout.write(`  Config: ${kd2 === '.kata' ? '.kata/wm.yaml' : '.claude/workflows/wm.yaml'}\n`)
      process.stdout.write(`  Hooks: .claude/settings.json\n`)
      process.stdout.write(`    - SessionStart\n`)
      process.stdout.write(`    - UserPromptSubmit\n`)
      process.stdout.write(`    - Stop\n`)
      process.stdout.write(`    - PreToolUse (mode-gate)\n`)
      if (parsed.strict) {
        process.stdout.write(`    - PreToolUse (task-deps)\n`)
        process.stdout.write(`    - PreToolUse (task-evidence)\n`)
      }
    }

    process.stdout.write('\nOptional: add shorthand to package.json scripts:\n')
    process.stdout.write('  "kata": "kata"\n')
    process.stdout.write('Then use: pnpm kata <cmd>  or  npm run kata <cmd>\n')
    process.stdout.write('\nRun: kata doctor to verify setup\n')
    return
  }

  // No flags — show setup help
  process.stdout.write(`kata setup — configure kata in a project

Usage:
  kata setup --yes                Quick setup with auto-detected defaults
  kata setup --yes --strict       Setup + PreToolUse task enforcement hooks
  kata setup --batteries          Setup + scaffold batteries-included starter content
  kata setup --batteries --strict Setup + batteries + strict hooks

Flags:
  --yes         Write wm.yaml and register hooks using auto-detected defaults
  --batteries   Scaffold mode templates, agents, spec templates, and GitHub issue templates
                (implies --yes)
  --strict      Also register PreToolUse hooks: task-deps, task-evidence
  --cwd=PATH    Run setup in a different directory

For the guided setup interview, run:
  kata enter onboard
`)
}
