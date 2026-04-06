// kata setup - Configure kata in a project (pure config, flag-driven)
// For the guided setup interview, use: kata enter onboard
// Hook registration uses 'kata hook <name>' commands in .claude/settings.json.
import { execSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import jsYaml from 'js-yaml'
import { getDefaultProfile, type SetupProfile } from '../config/setup-profile.js'
// WmConfig inlined — setup.ts generates kata.yaml
type WmConfig = Record<string, unknown> & {
  project?: { name?: string; test_command?: string; ci?: string | null }
  spec_path?: string
  research_path?: string
  session_retention_days?: number
  reviews?: { spec_review?: boolean; code_review?: boolean; code_reviewer?: string | null }
  wm_version?: string
}
import { getPackageRoot, findProjectDir, getSessionsDir, getProjectTemplatesDir, getProjectSkillsDir } from '../session/lookup.js'
import { getKataConfigPath, loadKataConfig } from '../config/kata-config.js'

/**
 * Resolve the absolute path to the kata binary.
 *
 * Resolution order:
 * 1. Explicit override (kata_binary from kata.yaml) — for A/B testing branches
 * 2. `which kata` — bin symlink that npm/pnpm update on upgrade
 * 3. Package-relative path — workspace / pnpm-link fallback
 */
export function resolveWmBin(override?: string): string {
  if (override) return override

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
export interface HookEntry {
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
export interface SettingsJson {
  hooks?: Record<string, HookEntry[]>
  [key: string]: unknown
}

/**
 * Build kata hook entries for .claude/settings.json.
 * Uses an absolute path to the kata binary so hooks work regardless of PATH
 * (both for globally-installed and locally-installed packages).
 * Registers a single consolidated PreToolUse hook (pre-tool-use) that handles
 * mode-gate, task-deps, gate evaluation, and task-evidence internally.
 */
export function buildHookEntries(_strict: boolean, wmBin: string): Record<string, HookEntry[]> {
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
    // Consolidated PreToolUse handler: mode-gate + task-deps + gate evaluation + task-evidence
    PreToolUse: [
      {
        hooks: [
          {
            type: 'command',
            command: `${bin} hook pre-tool-use`,
            timeout: 30,
          },
        ],
      },
    ],
  }

  return hooks
}

/**
 * Read existing .claude/settings.json or return empty structure
 * Uses cwd-based path since .kata/ may not exist yet
 */
export function readSettings(cwd: string): SettingsJson {
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
export function writeSettings(cwd: string, settings: SettingsJson): void {
  const claudeDir = join(cwd, '.claude')
  mkdirSync(claudeDir, { recursive: true })
  const settingsPath = join(claudeDir, 'settings.json')
  writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`, 'utf-8')
}

/**
 * Merge kata hook entries into existing settings
 * Preserves non-kata hooks, replaces kata hooks
 */
export function mergeHooksIntoSettings(
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

    // Filter out existing kata hook entries by matching known kata subcommand names.
    // Tolerates both bare `kata hook …` and quoted `"/path/kata" hook …` forms while
    // avoiding false positives from unrelated tools like lefthook or husky.
    const wmHookPattern =
      /\bhook (session-start|user-prompt|stop-conditions|mode-gate|task-deps|task-evidence|pre-tool-use)\b/
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
 * Generate kata.yaml content from a config object
 */
function generateKataYaml(config: Record<string, unknown>): string {
  return jsYaml.dump(config, { lineWidth: 120, noRefs: true })
}

/**
 * Build kata.yaml config from setup profile, merged with any existing kata.yaml.
 * Existing values win for project-level fields.
 * Modes come from existing kata.yaml or batteries/kata.yaml seed.
 */
function buildKataConfig(projectRoot: string, profile: SetupProfile): Record<string, unknown> {
  const profileReviews: WmConfig['reviews'] = {
    spec_review: profile.reviews.spec_review,
    code_reviewer: profile.reviews.code_reviewer,
    ...(profile.reviews.code_review ? { code_review: true } : {}),
  }

  const fromProfile: Record<string, unknown> = {
    project: {
      name: profile.project_name,
      test_command: profile.test_command ?? undefined,
      ci: profile.ci,
    },
    spec_path: profile.spec_path,
    research_path: profile.research_path,
    session_retention_days: profile.session_retention_days,
    reviews: profileReviews,
  }

  // Try existing kata.yaml first
  const kataYamlPath = getKataConfigPath(projectRoot)
  if (existsSync(kataYamlPath)) {
    try {
      const raw = readFileSync(kataYamlPath, 'utf-8')
      const existing = jsYaml.load(raw) as Record<string, unknown> | null
      if (existing && typeof existing === 'object') {
        return {
          ...fromProfile,
          ...existing,
          project: { ...(fromProfile.project as Record<string, unknown>), ...((existing.project as Record<string, unknown>) ?? {}) },
          reviews: { ...profileReviews, ...((existing.reviews as Record<string, unknown>) ?? {}) },
        }
      }
    } catch {
      process.stderr.write(`kata setup: warning: could not parse existing kata.yaml; using defaults\n`)
    }
  }

  // Stamp kata_version from package.json
  try {
    const pkgPath = join(getPackageRoot(), 'package.json')
    if (existsSync(pkgPath)) {
      const pkgJson = JSON.parse(readFileSync(pkgPath, 'utf-8')) as { version?: string }
      if (pkgJson.version) {
        fromProfile.kata_version = pkgJson.version
      }
    }
  } catch {
    // Version stamp is best-effort
  }

  // Seed modes from batteries/kata.yaml
  try {
    const seedPath = join(getPackageRoot(), 'batteries', 'kata.yaml')
    if (existsSync(seedPath)) {
      const raw = readFileSync(seedPath, 'utf-8')
      const seed = jsYaml.load(raw) as Record<string, unknown> | null
      if (seed && typeof seed === 'object' && seed.modes) {
        fromProfile.modes = seed.modes
      }
    }
  } catch {
    // No seed available
  }

  return fromProfile
}


/**
 * Write kata.yaml to the project config directory.
 */
function writeKataYaml(cwd: string, content: string): void {
  const kataYamlPath = getKataConfigPath(cwd)
  const dir = join(kataYamlPath, '..')
  mkdirSync(dir, { recursive: true })
  writeFileSync(kataYamlPath, content, 'utf-8')
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
 * Merges with existing kata.yaml so re-running does not lose custom config.
 */
function applySetup(cwd: string, profile: SetupProfile, explicitCwd: boolean): void {
  const projectRoot = resolveProjectRoot(cwd, explicitCwd)

  // Build merged config (existing kata.yaml fields win over auto-detected defaults)
  const config = buildKataConfig(projectRoot, profile)
  writeKataYaml(projectRoot, generateKataYaml(config))

  // Ensure .kata/ directory exists
  mkdirSync(join(projectRoot, '.kata'), { recursive: true })

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

  // Copy interview configs from batteries
  const batteriesInterviewsDir = join(getPackageRoot(), 'batteries', 'interviews')
  const projectInterviewsDir = join(projectRoot, '.kata', 'interviews')
  if (existsSync(batteriesInterviewsDir)) {
    mkdirSync(projectInterviewsDir, { recursive: true })
    for (const f of readdirSync(batteriesInterviewsDir)) {
      if (f.endsWith('.yaml')) {
        const dest = join(projectInterviewsDir, f)
        if (!existsSync(dest)) {
          copyFileSync(join(batteriesInterviewsDir, f), dest)
        }
      }
    }
  }

  // Copy skills from batteries (two-level: skills/<name>/SKILL.md)
  const skillsSrc = join(getPackageRoot(), 'batteries', 'skills')
  if (existsSync(skillsSrc)) {
    const skillsDest = getProjectSkillsDir(projectRoot)
    for (const entry of readdirSync(skillsSrc, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const skillSrcDir = join(skillsSrc, entry.name)
      const skillDestDir = join(skillsDest, entry.name)
      mkdirSync(skillDestDir, { recursive: true })
      for (const f of readdirSync(skillSrcDir)) {
        const src = join(skillSrcDir, f)
        const dest = join(skillDestDir, f)
        copyFileSync(src, dest)
      }
    }
  }

  // Register hooks in settings.json using absolute kata binary path
  // If kata_binary is set in kata.yaml, use it (for A/B testing branches)
  let binaryOverride: string | undefined
  try {
    const kataConfig = loadKataConfig(projectRoot)
    binaryOverride = kataConfig.kata_binary
  } catch {
    // Config may not exist yet during first setup
  }
  const wmBin = resolveWmBin(binaryOverride)
  const settings = readSettings(projectRoot)
  const wmHooks = buildHookEntries(profile.strict, wmBin)
  writeSettings(projectRoot, mergeHooksIntoSettings(settings, wmHooks))
}

/**
 * kata setup [--yes] [--strict] [--batteries] [--cwd=PATH]
 *
 * Pure configuration — writes kata.yaml, registers hooks, scaffolds content.
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
  // into kata.yaml when .claude/ already exists at a higher level.
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

      process.stdout.write('kata setup --batteries complete:\n')
      process.stdout.write(`  Project: ${profile.project_name}\n`)
      process.stdout.write(`  Config: .kata/kata.yaml\n`)
      process.stdout.write(`  Hooks: .claude/settings.json\n`)
      process.stdout.write('\nBatteries scaffolded:\n')
      if (result.templates.length > 0) {
        process.stdout.write(`  Mode templates (${result.templates.length}):\n`)
        for (const t of result.templates) {
          process.stdout.write(`    .kata/templates/${t}\n`)
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
      if (result.skills.length > 0) {
        process.stdout.write(`  Skills (${result.skills.length}):\n`)
        for (const s of result.skills) {
          process.stdout.write(`    .claude/skills/${s}\n`)
        }
      }
      if (result.skipped.length > 0) {
        process.stdout.write(`  Skipped (already exist): ${result.skipped.join(', ')}\n`)
      }
    } else {
      // Plain --yes summary
      process.stdout.write('kata setup complete:\n')
      process.stdout.write(`  Project: ${profile.project_name}\n`)
      process.stdout.write(`  Test command: ${profile.test_command ?? 'none detected'}\n`)
      process.stdout.write(`  CI: ${profile.ci ?? 'none detected'}\n`)
      process.stdout.write(`  Config: .kata/kata.yaml\n`)
      process.stdout.write(`  Hooks: .claude/settings.json\n`)
      process.stdout.write(`    - SessionStart\n`)
      process.stdout.write(`    - UserPromptSubmit\n`)
      process.stdout.write(`    - Stop\n`)
      process.stdout.write(`    - PreToolUse (consolidated: mode-gate + task-deps + gates + evidence)\n`)
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
  --yes         Write config and register hooks using auto-detected defaults
  --batteries   Scaffold mode templates, agents, spec templates, and GitHub issue templates
                (implies --yes)
  --strict      Also register PreToolUse hooks: task-deps, task-evidence
  --cwd=PATH    Run setup in a different directory

For the guided setup interview, run:
  kata enter onboard
`)
}
