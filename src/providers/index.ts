/**
 * Provider registry — maps names to AgentProvider implementations.
 */

export type { AgentProvider, AgentRunOptions } from './types.js'
export { preparePrompt, loadPrompt, listPrompts } from './prompt.js'
export type { PreparedPrompt } from './prompt.js'
export { claudeProvider } from './claude.js'

import type { AgentProvider } from './types.js'
import { claudeProvider } from './claude.js'

const providers: Record<string, AgentProvider> = {
  claude: claudeProvider,
}

/**
 * Get a provider by name. Throws if not found.
 */
export function getProvider(name: string): AgentProvider {
  const p = providers[name]
  if (!p) {
    throw new Error(
      `Unknown provider: ${name}. Available: ${Object.keys(providers).join(', ')}`,
    )
  }
  return p
}

/**
 * Register a provider. Used by gemini/codex adapters to self-register.
 */
export function registerProvider(provider: AgentProvider): void {
  providers[provider.name] = provider
}

/**
 * List registered provider names.
 */
export function listProviders(): string[] {
  return Object.keys(providers)
}
