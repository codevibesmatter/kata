/**
 * Claude provider — wraps @anthropic-ai/claude-agent-sdk query().
 *
 * Uses the Agent SDK's streaming query with no tools (text-only judge).
 * The SDK picks its own default model when none is specified.
 */

import type { AgentProvider, AgentRunOptions } from './types.js'

export const claudeProvider: AgentProvider = {
  name: 'claude',
  defaultModel: undefined,

  async run(prompt: string, options: AgentRunOptions): Promise<string> {
    // Dynamic import — claude-agent-sdk is a devDependency
    const { query } = (await import('@anthropic-ai/claude-agent-sdk')) as {
      query: (args: { prompt: string; options: Record<string, unknown> }) => AsyncIterable<{
        type: string
        message?: { content: Array<{ type: string; text?: string }> }
      }>
    }

    const env = options.env ?? buildCleanEnv()
    const timeoutMs = options.timeoutMs ?? 300_000

    const ac = new AbortController()
    const timer = setTimeout(() => ac.abort(), timeoutMs)

    const chunks: string[] = []

    try {
      for await (const message of query({
        prompt,
        options: {
          maxTurns: 3,
          allowedTools: [] as string[],
          permissionMode: 'bypassPermissions',
          allowDangerouslySkipPermissions: true,
          cwd: options.cwd,
          env,
          ...(options.model ? { model: options.model } : {}),
          abortController: ac,
        },
      })) {
        if (message.type === 'assistant' && message.message?.content) {
          for (const block of message.message.content) {
            if (block.type === 'text' && block.text) {
              chunks.push(block.text)
            }
          }
        }
      }
    } finally {
      clearTimeout(timer)
    }

    return chunks.join('\n')
  },
}

/** Build a filtered env stripping Claude-internal vars. */
function buildCleanEnv(): Record<string, string> {
  const clean: Record<string, string> = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (value === undefined) continue
    if (key.startsWith('CLAUDECODE')) continue
    if (key === 'CLAUDE_CODE_ENTRYPOINT') continue
    if (key === 'CLAUDE_PROJECT_DIR') continue
    clean[key] = value
  }
  return clean
}
