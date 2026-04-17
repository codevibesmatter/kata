import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { join, relative, resolve } from 'node:path'

let cachedGitRoot: string | undefined

/**
 * Normalize an absolute path to git-root-relative.
 * Caches the git root to avoid repeated shell-outs.
 */
export function toGitRelative(absolutePath: string): string {
  if (!cachedGitRoot) {
    cachedGitRoot = execSync('git rev-parse --show-toplevel', { encoding: 'utf-8' }).trim()
  }
  return relative(cachedGitRoot, resolve(absolutePath))
}

/**
 * Parse a `git status --porcelain` line and extract file path(s).
 * Returns 1 path normally, or 2 paths for renames (status R, split on ` -> `).
 * Skips untracked lines (??).
 */
export function parseGitStatusPaths(line: string): string[] {
  const status = line.slice(0, 2)
  if (status === '??') return []
  const pathPart = line.slice(3)
  if (status.includes('R')) {
    return pathPart.split(' -> ')
  }
  return [pathPart]
}

/**
 * Append a JSON line to {sessionDir}/edits.jsonl.
 * Tracking failure must NEVER throw.
 */
export function appendEdit(sessionDir: string, entry: { file: string; tool: string; ts: string }): void {
  try {
    mkdirSync(sessionDir, { recursive: true })
    appendFileSync(join(sessionDir, 'edits.jsonl'), JSON.stringify(entry) + '\n')
  } catch {
    // Silently ignore — tracking failure must never throw
  }
}

/**
 * Read {sessionDir}/edits.jsonl, parse each line as JSON,
 * extract .file, return a Set<string> of unique file paths.
 * Handles missing file and corrupt lines gracefully.
 */
export function readEditsSet(sessionDir: string): Set<string> {
  const result = new Set<string>()
  try {
    const filePath = join(sessionDir, 'edits.jsonl')
    if (!existsSync(filePath)) return result
    const content = readFileSync(filePath, 'utf-8')
    for (const line of content.split('\n')) {
      if (!line.trim()) continue
      try {
        const parsed = JSON.parse(line)
        if (parsed.file) result.add(parsed.file)
      } catch {
        // Skip corrupt line
      }
    }
  } catch {
    // Return whatever we have so far
  }
  return result
}

/**
 * Write {sessionDir}/baseline.json as {"files": [...], "ts": "ISO"}.
 */
export function writeBaseline(sessionDir: string, files: string[]): void {
  try {
    mkdirSync(sessionDir, { recursive: true })
    writeFileSync(join(sessionDir, 'baseline.json'), JSON.stringify({ files, ts: new Date().toISOString() }))
  } catch {
    // Silently ignore
  }
}

/**
 * Read {sessionDir}/baseline.json, parse JSON, return Set<string> from the files array.
 * Handles missing/corrupt file by returning empty Set.
 */
export function readBaseline(sessionDir: string): Set<string> {
  try {
    const filePath = join(sessionDir, 'baseline.json')
    if (!existsSync(filePath)) return new Set()
    const content = readFileSync(filePath, 'utf-8')
    const parsed = JSON.parse(content)
    return new Set<string>(parsed.files ?? [])
  } catch {
    return new Set()
  }
}
