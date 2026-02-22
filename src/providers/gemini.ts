/**
 * Gemini provider — wraps Google's Gemini CLI.
 *
 * Spawns `gemini` with --yolo for autonomous execution.
 * Large prompts are written to a temp file and passed as file context.
 * Based on: baseplane/packages/agent-tools/src/gemini/index.ts
 */

import { spawnSync } from 'node:child_process'
import type { AgentProvider, AgentRunOptions } from './types.js'
import { preparePrompt } from './prompt.js'

export const geminiProvider: AgentProvider = {
  name: 'gemini',
  defaultModel: 'gemini-2.5-pro',

  async run(prompt: string, options: AgentRunOptions): Promise<string> {
    const model = options.model ?? this.defaultModel ?? 'gemini-2.5-pro'
    const timeoutMs = options.timeoutMs ?? 300_000

    // Use temp file for all prompts (uniform delivery)
    const prepared = preparePrompt(prompt, { thresholdChars: 0 })

    try {
      const args = ['-m', model, '--yolo']

      if (prepared.filePath) {
        // Pass prompt file as context, with a short instruction
        args.push('-p', 'Review and analyze the content of the provided file. Follow all instructions within it.')
        args.push(prepared.filePath)
      } else {
        args.push('-p', prompt)
      }

      const result = spawnSync('gemini', args, {
        cwd: options.cwd,
        stdio: ['pipe', 'pipe', 'pipe'],
        encoding: 'utf-8',
        timeout: timeoutMs,
        env: options.env ?? process.env as Record<string, string>,
      })

      if (result.error) {
        if ((result.error as NodeJS.ErrnoException).code === 'ENOENT') {
          throw new Error(
            'gemini CLI not found. Install: npm i -g @google/gemini-cli',
          )
        }
        throw new Error(`gemini: ${result.error.message}`)
      }

      if (result.status !== 0 && result.status !== null) {
        const stderr = result.stderr?.trim() || ''
        throw new Error(
          `gemini exited with code ${result.status}${stderr ? `: ${stderr}` : ''}`,
        )
      }

      return result.stdout || ''
    } finally {
      prepared.cleanup()
    }
  },
}
