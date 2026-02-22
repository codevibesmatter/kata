// kata modes — list available modes with entry commands
import { loadModesConfig } from '../config/cache.js'

/**
 * kata modes
 *
 * Outputs a formatted list of available modes for Claude to pick from.
 * Used by the UserPromptSubmit hook when no mode is active.
 */
export async function modes(_args: string[]): Promise<void> {
  const config = await loadModesConfig()

  const lines: string[] = []
  lines.push('**Pick the mode that matches the user intent, then enter it before responding:**')
  lines.push('')

  for (const [id, mode] of Object.entries(config.modes)) {
    if (mode.deprecated) continue
    // Skip system/utility modes that aren't for normal workflows
    if (['session-discovery', 'calibration', 'dedicated-testing', 'flow'].includes(id)) continue
    lines.push(`- \`pnpm kata enter ${id}\` — ${mode.description}`)
  }

  lines.push('')
  lines.push('Enter the mode first, then respond.')

  process.stdout.write(lines.join('\n') + '\n')
}
