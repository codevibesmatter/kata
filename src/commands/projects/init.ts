import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { isManagerInitialized } from '../../manager/paths.js'
import { isKataEnabled } from '../../manager/discovery.js'
import { readIndex, writeIndex, addProject as addToIndex } from '../../manager/registry.js'

/**
 * kata projects init <path> [--alias=<name>]
 *
 * Initialize a new project at the given path with .kata/ structure,
 * then register it in the manager.
 */
export async function initProject(args: string[]): Promise<void> {
  let projectPath: string | null = null
  let alias: string | undefined

  for (const arg of args) {
    if (arg.startsWith('--alias=')) {
      alias = arg.slice('--alias='.length)
    } else if (!arg.startsWith('--')) {
      projectPath = arg
    }
  }

  if (!projectPath) {
    // biome-ignore lint/suspicious/noConsole: CLI output
    console.error('Usage: kata projects init <path> [--alias=<name>]')
    process.exitCode = 1
    return
  }

  const absPath = resolve(projectPath)

  if (!existsSync(absPath)) {
    // biome-ignore lint/suspicious/noConsole: CLI output
    console.error(`Path does not exist: ${absPath}`)
    process.exitCode = 1
    return
  }

  // Check if already initialized
  const kataCheck = isKataEnabled(absPath)
  if (kataCheck.enabled) {
    // biome-ignore lint/suspicious/noConsole: CLI output
    console.error(`Project already has kata config: ${absPath}`)
    // biome-ignore lint/suspicious/noConsole: CLI output
    console.error('Use `kata update --cwd=' + absPath + '` to update templates instead.')
    process.exitCode = 1
    return
  }

  // Run setup externally by calling the setup module
  // biome-ignore lint/suspicious/noConsole: CLI output
  console.error(`Initializing kata at: ${absPath}`)

  const { setup } = await import('../setup.js')
  await setup(['--yes', `--cwd=${absPath}`])

  // Register in manager if initialized
  if (isManagerInitialized()) {
    const index = readIndex()
    const name = absPath.split('/').pop() || 'unknown'

    const result = addToIndex(index, {
      path: absPath,
      alias,
      name,
      kata_layout: '.kata', // New projects always use .kata/
      discovered_from: 'manual',
    })

    if (result.added) {
      writeIndex(result.index)
      // biome-ignore lint/suspicious/noConsole: CLI output
      console.error(`Registered in manager: ${name}`)
    }
  }

  // biome-ignore lint/suspicious/noConsole: CLI output
  console.log(
    JSON.stringify(
      {
        action: 'initialized',
        path: absPath,
        alias: alias || absPath.split('/').pop(),
      },
      null,
      2,
    ),
  )
}
