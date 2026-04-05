import type { SessionState } from '../../state/schema.js'
import type { KataConfig } from '../../config/kata-config.js'

export interface PlaceholderContext {
  session?: SessionState
  config?: KataConfig
  extra?: Record<string, string>
}

/**
 * Resolve {variable} placeholders from a three-source priority chain:
 * 1. Session state (higher priority)
 * 2. kata.yaml project config (lower priority)
 * 3. Extra vars (lowest priority)
 *
 * Unresolved placeholders remain as literal {variable} text.
 */
export function resolvePlaceholders(
  template: string,
  context: PlaceholderContext,
): string {
  return template.replace(/\{(\w+)\}/g, (_match, key: string) => {
    // Source 1: Session state
    if (context.session) {
      const sessionValue = resolveFromSession(key, context.session)
      if (sessionValue !== undefined) return sessionValue
    }

    // Source 2: kata.yaml config
    if (context.config) {
      const configValue = resolveFromConfig(key, context.config)
      if (configValue !== undefined) return configValue
    }

    // Source 3: Extra vars
    if (context.extra?.[key] !== undefined) {
      return context.extra[key]
    }

    // Unresolved — leave as-is, warn on stderr
    // biome-ignore lint/suspicious/noConsole: intentional CLI warning
    console.error(`Warning: unresolved placeholder {${key}}`)
    return `{${key}}`
  })
}

function resolveFromSession(key: string, session: SessionState): string | undefined {
  const map: Record<string, string | undefined> = {
    issue: session.issueNumber != null ? String(session.issueNumber) : undefined,
    workflow_id: session.workflowId,
    mode: session.currentMode,
    spec_path: session.specPath,
    phase: session.currentPhase ?? undefined,
  }
  return map[key]
}

function resolveFromConfig(key: string, config: KataConfig): string | undefined {
  const map: Record<string, string | undefined> = {
    test_command: config.project?.test_command,
    build_command: config.project?.build_command ?? undefined,
    typecheck_command: config.project?.typecheck_command ?? undefined,
    smoke_command: config.project?.smoke_command ?? undefined,
    spec_path_dir: config.spec_path,
    research_path: config.research_path,
    project_name: config.project?.name,
    diff_base: config.project?.diff_base,
  }
  return map[key]
}

/** All placeholder keys that can be resolved from session + config + known extras. */
const KNOWN_PLACEHOLDERS = new Set([
  // Session
  'issue', 'workflow_id', 'mode', 'spec_path', 'phase',
  // Config
  'test_command', 'build_command', 'typecheck_command', 'smoke_command',
  'spec_path_dir', 'research_path', 'project_name', 'diff_base',
  // Runtime-only (resolved during container expansion, not at enter time)
  'phase_name', 'phase_label', 'task_summary', 'reviewers',
  // Gate-only (resolved during gate evaluation)
  'exit_code', 'output',
  // Template metadata
  'issue-number', 'bug_keywords', 'task_description', 'topic', 'entry_point',
])

/**
 * Extract all {placeholder} references from gate bash commands in a template.
 * Only checks gates — these are the ones that MUST resolve at runtime.
 */
export function extractGatePlaceholders(
  phases: Array<{
    steps?: Array<{ gate?: { bash: string; on_fail?: string } }>
    subphase_pattern?: Array<{ gate?: { bash: string; on_fail?: string } }>
  }>,
): string[] {
  const placeholders = new Set<string>()

  for (const phase of phases) {
    for (const step of phase.steps ?? []) {
      if (step.gate?.bash) {
        for (const match of step.gate.bash.matchAll(/\{(\w+)\}/g)) {
          placeholders.add(match[1])
        }
      }
    }
    for (const sub of phase.subphase_pattern ?? []) {
      if (sub.gate?.bash) {
        for (const match of sub.gate.bash.matchAll(/\{(\w+)\}/g)) {
          placeholders.add(match[1])
        }
      }
    }
  }

  return [...placeholders]
}

/**
 * Validate that all gate placeholders can be resolved from the current config.
 * Returns an array of missing placeholder names (empty = all good).
 */
export function validateGatePlaceholders(
  phases: Array<{
    steps?: Array<{ gate?: { bash: string; on_fail?: string } }>
    subphase_pattern?: Array<{ gate?: { bash: string; on_fail?: string } }>
  }>,
  context: PlaceholderContext,
): string[] {
  const required = extractGatePlaceholders(phases)
  const missing: string[] = []

  for (const key of required) {
    // Skip runtime-only placeholders (resolved during container expansion, gate eval, or session setup)
    if (['phase_name', 'phase_label', 'task_summary', 'reviewers', 'exit_code', 'output', 'spec_path', 'issue'].includes(key)) {
      continue
    }

    // Try to resolve from session
    if (context.session) {
      const v = resolveFromSession(key, context.session)
      if (v !== undefined) continue
    }

    // Try to resolve from config
    if (context.config) {
      const v = resolveFromConfig(key, context.config)
      if (v !== undefined) continue
    }

    // Try extras
    if (context.extra?.[key] !== undefined) continue

    missing.push(key)
  }

  return missing
}
