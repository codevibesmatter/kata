import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { mkdirSync, rmSync, readFileSync, writeFileSync, existsSync, chmodSync } from 'node:fs'
import { join } from 'node:path'
import * as os from 'node:os'

import {
  appendEdit,
  readEditsSet,
  writeBaseline,
  readBaseline,
  parseGitStatusPaths,
  toGitRelative,
} from './edits-log.js'

let tmpDir: string

beforeEach(() => {
  tmpDir = join(os.tmpdir(), `edits-log-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  mkdirSync(tmpDir, { recursive: true })
})

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true })
})

describe('parseGitStatusPaths', () => {
  it('parses modified file', () => {
    expect(parseGitStatusPaths('M  foo.ts')).toEqual(['foo.ts'])
  })

  it('parses added file', () => {
    expect(parseGitStatusPaths('A  bar.ts')).toEqual(['bar.ts'])
  })

  it('skips untracked files', () => {
    expect(parseGitStatusPaths('?? untracked.ts')).toEqual([])
  })

  it('parses rename producing both paths', () => {
    expect(parseGitStatusPaths('R  old.ts -> new.ts')).toEqual(['old.ts', 'new.ts'])
  })

  // Regression: worktree-only modifications emit " M path" (leading space = empty index status).
  // Callers that stripped the git output with .trim() used to corrupt the first character
  // of the first dirty file. parseGitStatusPaths itself handles the line correctly;
  // this test guards the callers' expected input shape.
  it('parses worktree-only modification (leading space)', () => {
    expect(parseGitStatusPaths(' M README.md')).toEqual(['README.md'])
  })

  it('parses worktree-only deletion (leading space)', () => {
    expect(parseGitStatusPaths(' D gone.ts')).toEqual(['gone.ts'])
  })
})

describe('appendEdit + readEditsSet', () => {
  it('appends one edit and reads it back', () => {
    const ts = new Date().toISOString()
    appendEdit(tmpDir, { file: 'src/index.ts', tool: 'Edit', ts })
    const result = readEditsSet(tmpDir)
    expect(result.has('src/index.ts')).toBe(true)
    expect(result.size).toBe(1)
  })

  it('deduplicates the same file appended twice', () => {
    const ts = new Date().toISOString()
    appendEdit(tmpDir, { file: 'src/index.ts', tool: 'Edit', ts })
    appendEdit(tmpDir, { file: 'src/index.ts', tool: 'Write', ts })
    const result = readEditsSet(tmpDir)
    expect(result.has('src/index.ts')).toBe(true)
    expect(result.size).toBe(1)
  })

  it('returns empty Set for non-existent dir', () => {
    const result = readEditsSet(join(tmpDir, 'nonexistent'))
    expect(result.size).toBe(0)
  })

  it('persists multiple rapid sequential appends', () => {
    const ts = new Date().toISOString()
    for (let i = 0; i < 5; i++) {
      appendEdit(tmpDir, { file: `file-${i}.ts`, tool: 'Edit', ts })
    }
    const result = readEditsSet(tmpDir)
    expect(result.size).toBe(5)
    for (let i = 0; i < 5; i++) {
      expect(result.has(`file-${i}.ts`)).toBe(true)
    }
  })
})

describe('readEditsSet corrupt line resilience', () => {
  it('skips corrupt lines and returns valid entries', () => {
    const editsPath = join(tmpDir, 'edits.jsonl')
    const lines = [
      JSON.stringify({ file: 'a.ts', tool: 'Edit', ts: '2026-01-01T00:00:00Z' }),
      'this is not valid json {{{',
      JSON.stringify({ file: 'b.ts', tool: 'Write', ts: '2026-01-01T00:00:01Z' }),
    ]
    writeFileSync(editsPath, lines.join('\n') + '\n')
    const result = readEditsSet(tmpDir)
    expect(result.size).toBe(2)
    expect(result.has('a.ts')).toBe(true)
    expect(result.has('b.ts')).toBe(true)
  })
})

describe('writeBaseline + readBaseline', () => {
  it('writes and reads back baseline files as Set', () => {
    const files = ['src/a.ts', 'src/b.ts', 'src/c.ts']
    writeBaseline(tmpDir, files)
    const result = readBaseline(tmpDir)
    expect(result.size).toBe(3)
    for (const f of files) {
      expect(result.has(f)).toBe(true)
    }
  })

  it('returns empty Set for non-existent dir', () => {
    const result = readBaseline(join(tmpDir, 'nonexistent'))
    expect(result.size).toBe(0)
  })
})

describe('appendEdit silent failure', () => {
  it('does not throw when writing to an invalid path', () => {
    // /dev/null/impossible is not a valid directory
    expect(() => {
      appendEdit('/dev/null/impossible/path', { file: 'x.ts', tool: 'Edit', ts: new Date().toISOString() })
    }).not.toThrow()
  })
})

describe('toGitRelative', () => {
  it('converts absolute path under git root to relative', () => {
    // Use the actual project root for this test
    const projectRoot = '/data/projects/kata-wm'
    const abs = join(projectRoot, 'src', 'tracking', 'edits-log.ts')
    const rel = toGitRelative(abs)
    expect(rel).toBe('src/tracking/edits-log.ts')
  })
})
