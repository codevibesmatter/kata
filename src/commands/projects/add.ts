import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { isManagerInitialized } from '../../manager/paths.js'
import { isKataEnabled } from '../../manager/discovery.js'
import { readIndex, writeIndex, addProject as addToIndex } from '../../manager/registry.js'

/**
 * kata projects add <path> [--alias=<name>]
 *
 * Manually add a project to the registry.
 */
export async function addProject(args: string[]): Promise<void> {
  if (!isManagerInitialized()) {
    // biome-ignore lint/suspicious/noConsole: CLI output
    console.error('Manager not initialized. Run: kata projects init-manager')
    process.exitCode = 1
    return
  }

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
    console.error('Usage: kata projects add <path> [--alias=<name>]')
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

  const kataCheck = isKataEnabled(absPath)
  if (!kataCheck.enabled) {
    // biome-ignore lint/suspicious/noConsole: CLI output
    console.error(`Path is not kata-enabled: ${absPath}`)
    // biome-ignore lint/suspicious/noConsole: CLI output
    console.error('Expected .kata/kata.yaml')
    process.exitCode = 1
    return
  }

  const index = readIndex()
  const name = absPath.split('/').pop() || 'unknown'

  const result = addToIndex(index, {
    path: absPath,
    alias,
    name,
    kata_layout: kataCheck.layout,
    discovered_from: 'manual',
  })

  if (!result.added) {
    // biome-ignore lint/suspicious/noConsole: CLI output
    console.error(`Project already registered: ${absPath}`)
    // biome-ignore lint/suspicious/noConsole: CLI output
    console.error('Use --alias to update the alias for an existing project')
    process.exitCode = 1
    return
  }

  writeIndex(result.index)

  // biome-ignore lint/suspicious/noConsole: CLI output
  console.log(
    JSON.stringify({ action: 'added', path: absPath, alias: alias || name }, null, 2),
  )
}
