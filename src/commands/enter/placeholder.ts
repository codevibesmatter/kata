import type { SessionState } from '../../state/schema.js'
import type { KataConfig } from '../../config/kata-config.js'

export interface PlaceholderContext {
  session?: SessionState
  config?: KataConfig
  extra?: Record<string, string>
}

/**
 * Resolve {variable} placeholders from a two-source chain:
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

    // Unresolved — leave as-is
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
