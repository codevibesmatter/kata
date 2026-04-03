// Unified kata.yaml config — single file, no merge, no user tier
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import jsYaml from 'js-yaml'
import { z } from 'zod'
import { STOP_CONDITION_TYPES } from '../state/schema.js'
import { findProjectDir } from '../session/lookup.js'

/**
 * Per-mode config schema for kata.yaml `modes:` section.
 * Kept fields only — behavioral guidance moves to template markdown.
 */
export const KataModeConfigSchema = z.object({
  template: z.string(),
  stop_conditions: z.array(z.enum(STOP_CONDITION_TYPES)).default([]),
  issue_handling: z.enum(['required', 'none']).optional(),
  issue_label: z.string().optional(),
  intent_keywords: z.array(z.string()).optional(),
  aliases: z.array(z.string()).optional(),
  workflow_prefix: z.string().optional(),
  name: z.string().optional(),
  description: z.string().optional(),
  deprecated: z.boolean().optional(),
  redirect_to: z.string().optional(),
})

export type KataModeConfig = z.infer<typeof KataModeConfigSchema>

/**
 * Project section schema
 */
export const KataProjectSchema = z.object({
  name: z.string().optional(),
  build_command: z.string().nullable().optional(),
  test_command: z.string().optional(),
  typecheck_command: z.string().nullable().optional(),
  smoke_command: z.string().nullable().optional(),
  diff_base: z.string().optional(),
  test_file_pattern: z.string().optional(),
  ci: z.string().nullable().optional(),
  dev_server_command: z.string().nullable().optional(),
  dev_server_health: z.string().nullable().optional(),
})

/**
 * Reviews section schema
 */
export const KataReviewsSchema = z.object({
  spec_review: z.boolean().optional(),
  code_review: z.boolean().optional(),
  code_reviewer: z.string().nullable().optional(),
  code_reviewers: z.array(z.string()).optional(),
  spec_reviewer: z.string().nullable().optional(),
  spec_reviewers: z.array(z.string()).optional(),
})

/**
 * Providers section schema
 */
export const KataProvidersSchema = z.object({
  default: z.string().optional(),
  available: z.array(z.string()).optional(),
  judge_provider: z.string().optional(),
  judge_model: z.string().nullable().optional(),
})

/**
 * Unified kata.yaml schema — combines project settings + mode definitions.
 * Single file, no merge, no defaults for missing file.
 */
export const KataConfigSchema = z.object({
  project: KataProjectSchema.optional(),

  // Binary override — point hooks at a different kata build for A/B testing
  kata_binary: z.string().optional(),

  // Paths
  spec_path: z.string().default('planning/specs'),
  research_path: z.string().default('planning/research'),

  // Session
  session_retention_days: z.number().default(7),

  // Non-code paths
  non_code_paths: z.array(z.string()).default(['.claude', '.kata', 'planning']),

  // Reviews
  reviews: KataReviewsSchema.optional(),

  // Providers
  providers: KataProvidersSchema.optional(),

  // Global rules — injected into every mode's context
  global_rules: z.array(z.string()).default([]),

  // Task system rules — injected when mode has phases (tasks)
  task_rules: z.array(z.string()).default([
    'Tasks are pre-created by kata enter. Do NOT create new tasks with TaskCreate.',
    'Run TaskList FIRST to discover pre-created tasks and their dependency chains.',
    'Use TaskUpdate to mark tasks in_progress/completed. Never use TaskCreate.',
    'Follow the dependency chain — blocked tasks cannot start until dependencies complete.',
  ]),

  // Modes — the core section
  modes: z.record(KataModeConfigSchema).default({}),
})

export type KataConfig = z.infer<typeof KataConfigSchema>

/**
 * Singleton cache for kata.yaml configuration.
 * Keyed by file path to support tests with different project dirs.
 */
let cachedConfig: KataConfig | null = null
let cachedPath: string | null = null

/**
 * Get the path to kata.yaml for a project.
 */
export function getKataConfigPath(projectRoot: string): string {
  return join(projectRoot, '.kata', 'kata.yaml')
}

/**
 * Load and validate kata.yaml from the project directory.
 * Single file, no merge, no user tier. Missing file = hard error.
 *
 * @param projectRoot - Optional project root (auto-detected if omitted)
 * @returns Validated KataConfig
 * @throws Error if kata.yaml missing or invalid
 */
export function loadKataConfig(projectRoot?: string): KataConfig {
  const root = projectRoot ?? findProjectDir()
  const configPath = getKataConfigPath(root)

  // Check cache
  if (cachedConfig && cachedPath === configPath) {
    return cachedConfig
  }

  if (!existsSync(configPath)) {
    // Check for legacy config files to give a helpful migration hint
    const hasLegacyWm = existsSync(join(root, '.kata', 'wm.yaml'))
    const hasLegacyModes = existsSync(join(root, '.kata', 'modes.yaml'))

    if (hasLegacyWm || hasLegacyModes) {
      throw new Error(
        `kata: no kata.yaml found at ${configPath}\n` +
        `Found legacy wm.yaml/modes.yaml. Merge them into a single kata.yaml.\n` +
        `See: https://github.com/codevibesmatter/kata-wm/issues/30`
      )
    }

    throw new Error(
      `kata: no kata.yaml found. Run 'kata setup' to initialize this project.\n` +
      `Expected: ${configPath}`
    )
  }

  const raw = readFileSync(configPath, 'utf-8')
  const parsed = jsYaml.load(raw, { schema: jsYaml.CORE_SCHEMA })

  if (!parsed || typeof parsed !== 'object') {
    throw new Error(
      `kata: kata.yaml is empty or not a valid YAML object.\n` +
      `File: ${configPath}`
    )
  }

  const result = KataConfigSchema.safeParse(parsed)
  if (!result.success) {
    const issues = result.error.issues
      .map(i => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n')
    throw new Error(
      `kata: invalid kata.yaml at ${configPath}\n${issues}`
    )
  }

  // Cache and return
  cachedConfig = result.data
  cachedPath = configPath
  return result.data
}

/**
 * Clear the kata config cache (for testing).
 */
export function clearKataConfigCache(): void {
  cachedConfig = null
  cachedPath = null
}

/**
 * Resolve mode aliases to canonical mode name.
 * @param config - KataConfig with modes section
 * @param mode - Mode name or alias
 * @returns Canonical mode name
 */
export function resolveKataModeAlias(config: KataConfig, mode: string): string {
  // Check if already canonical
  if (config.modes[mode]) {
    return mode
  }

  // Check aliases
  for (const [canonical, modeConfig] of Object.entries(config.modes)) {
    if (modeConfig.aliases?.includes(mode)) {
      return canonical
    }
  }

  // Not found — return as-is (caller should validate)
  return mode
}
