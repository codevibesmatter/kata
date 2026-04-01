/**
 * Prompt helpers — temp file delivery for large prompts, saved prompt loading.
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { getPackageRoot, getProjectPromptsDir, findProjectDir } from '../session/lookup.js'

const DEFAULT_THRESHOLD = 4000

export interface PreparedPrompt {
  /** The original prompt text. */
  text: string
  /** Path to temp file if prompt exceeded threshold. */
  filePath?: string
  /** Call to clean up the temp file (no-op if none was created). */
  cleanup: () => void
}

/**
 * Write prompt to a temp file if it exceeds the char threshold.
 * All providers should use this for uniform large-prompt handling.
 */
export function preparePrompt(
  prompt: string,
  opts?: { thresholdChars?: number },
): PreparedPrompt {
  const threshold = opts?.thresholdChars ?? DEFAULT_THRESHOLD

  if (prompt.length <= threshold) {
    return { text: prompt, cleanup: () => {} }
  }

  const tempDir = join(tmpdir(), 'kata-prompts')
  mkdirSync(tempDir, { recursive: true })
  const filePath = join(tempDir, `prompt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.md`)
  writeFileSync(filePath, prompt, 'utf-8')

  return {
    text: prompt,
    filePath,
    cleanup: () => {
      try {
        unlinkSync(filePath)
      } catch {
        // Already cleaned up
      }
    },
  }
}

/**
 * Get the batteries (package-level) prompts directory.
 */
function getBatteriesPromptsDir(): string {
  return join(getPackageRoot(), 'batteries', 'prompts')
}

/**
 * Load a saved prompt template by name.
 * Checks project-level prompts first (.kata/prompts/),
 * then falls back to package batteries/prompts/.
 */
export function loadPrompt(name: string): string {
  // Check project-level first
  try {
    const projectDir = getProjectPromptsDir()
    const projectPath = join(projectDir, `${name}.md`)
    if (existsSync(projectPath)) {
      return readFileSync(projectPath, 'utf-8')
    }
  } catch {
    // No project dir found — fall through to batteries
  }

  // Fall back to package batteries
  const batteriesPath = join(getBatteriesPromptsDir(), `${name}.md`)
  if (!existsSync(batteriesPath)) {
    const available = listPrompts()
    throw new Error(
      `Prompt not found: ${name}. Available: ${available.join(', ')}`,
    )
  }
  return readFileSync(batteriesPath, 'utf-8')
}

/**
 * List available saved prompt template names.
 * Merges project-level and package-level prompts (project overrides package).
 */
export function listPrompts(): string[] {
  const names = new Set<string>()

  // Package batteries prompts
  const batteriesDir = getBatteriesPromptsDir()
  if (existsSync(batteriesDir)) {
    for (const f of readdirSync(batteriesDir)) {
      if (f.endsWith('.md')) names.add(f.replace(/\.md$/, ''))
    }
  }

  // Project-level prompts (may add new ones or override)
  try {
    const projectDir = getProjectPromptsDir()
    if (existsSync(projectDir)) {
      for (const f of readdirSync(projectDir)) {
        if (f.endsWith('.md')) names.add(f.replace(/\.md$/, ''))
      }
    }
  } catch {
    // No project dir
  }

  return [...names].sort()
}
