import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import * as os from 'node:os'
import { resolveTemplatePath, resolveSpecTemplatePath, getCurrentSessionId, getStateFilePath } from './lookup.js'

function makeTmpDir(label: string): string {
  const dir = join(
    os.tmpdir(),
    `wm-lookup-test-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  )
  mkdirSync(dir, { recursive: true })
  return dir
}

describe('resolveTemplatePath', () => {
  const origProjectDir = process.env.CLAUDE_PROJECT_DIR
  let tmpDirs: string[] = []

  afterEach(() => {
    for (const dir of tmpDirs) rmSync(dir, { recursive: true, force: true })
    tmpDirs = []
    if (origProjectDir !== undefined) {
      process.env.CLAUDE_PROJECT_DIR = origProjectDir
    } else {
      delete process.env.CLAUDE_PROJECT_DIR
    }
  })

  it('resolves project-level template first', () => {
    const tmpDir = makeTmpDir('proj-tmpl')
    tmpDirs.push(tmpDir)
    mkdirSync(join(tmpDir, '.claude', 'workflows', 'templates'), { recursive: true })
    writeFileSync(join(tmpDir, '.claude', 'workflows', 'templates', 'task.md'), '# project task')
    process.env.CLAUDE_PROJECT_DIR = tmpDir

    const result = resolveTemplatePath('task.md')
    expect(result).toBe(join(tmpDir, '.claude', 'workflows', 'templates', 'task.md'))
  })

  it('falls back to package batteries template', () => {
    const tmpDir = makeTmpDir('pkg-fallback')
    tmpDirs.push(tmpDir)
    mkdirSync(join(tmpDir, '.claude', 'sessions'), { recursive: true })
    process.env.CLAUDE_PROJECT_DIR = tmpDir

    // task.md exists in batteries/templates/ (package level)
    const result = resolveTemplatePath('task.md')
    expect(result).toMatch(/batteries\/templates\/task\.md$/)
  })

  it('throws when template not found at any tier', () => {
    const tmpDir = makeTmpDir('not-found')
    tmpDirs.push(tmpDir)
    mkdirSync(join(tmpDir, '.claude', 'sessions'), { recursive: true })
    process.env.CLAUDE_PROJECT_DIR = tmpDir

    expect(() => resolveTemplatePath('does-not-exist.md')).toThrow('Template not found')
  })

  it('resolves absolute paths directly', () => {
    const tmpDir = makeTmpDir('abs-path')
    tmpDirs.push(tmpDir)
    const absPath = join(tmpDir, 'absolute.md')
    writeFileSync(absPath, '# absolute')

    const result = resolveTemplatePath(absPath)
    expect(result).toBe(absPath)
  })
})

describe('resolveSpecTemplatePath', () => {
  const origProjectDir = process.env.CLAUDE_PROJECT_DIR
  let tmpDirs: string[] = []

  afterEach(() => {
    for (const dir of tmpDirs) rmSync(dir, { recursive: true, force: true })
    tmpDirs = []
    if (origProjectDir !== undefined) {
      process.env.CLAUDE_PROJECT_DIR = origProjectDir
    } else {
      delete process.env.CLAUDE_PROJECT_DIR
    }
  })

  it('resolves project-level spec template first', () => {
    const tmpDir = makeTmpDir('proj-spec')
    tmpDirs.push(tmpDir)
    mkdirSync(join(tmpDir, '.claude', 'sessions'), { recursive: true })
    mkdirSync(join(tmpDir, 'planning', 'spec-templates'), { recursive: true })
    writeFileSync(join(tmpDir, 'planning', 'spec-templates', 'feature.md'), '# project feature')
    process.env.CLAUDE_PROJECT_DIR = tmpDir

    const result = resolveSpecTemplatePath('feature.md')
    expect(result).toBe(join(tmpDir, 'planning', 'spec-templates', 'feature.md'))
  })

  it('falls back to package batteries spec template', () => {
    const tmpDir = makeTmpDir('pkg-spec')
    tmpDirs.push(tmpDir)
    mkdirSync(join(tmpDir, '.claude', 'sessions'), { recursive: true })
    process.env.CLAUDE_PROJECT_DIR = tmpDir

    // feature.md exists in batteries/spec-templates/
    const result = resolveSpecTemplatePath('feature.md')
    expect(result).toMatch(/batteries\/spec-templates\/feature\.md$/)
  })

  it('throws when spec template not found at any tier', () => {
    const tmpDir = makeTmpDir('spec-not-found')
    tmpDirs.push(tmpDir)
    mkdirSync(join(tmpDir, '.claude', 'sessions'), { recursive: true })
    process.env.CLAUDE_PROJECT_DIR = tmpDir

    expect(() => resolveSpecTemplatePath('nonexistent.md')).toThrow('Spec template not found')
  })
})

describe('resolveTemplatePath — batteries fallback', () => {
  const origProjectDir = process.env.CLAUDE_PROJECT_DIR
  let tmpDirs: string[] = []

  afterEach(() => {
    for (const dir of tmpDirs) rmSync(dir, { recursive: true, force: true })
    tmpDirs = []
    if (origProjectDir !== undefined) {
      process.env.CLAUDE_PROJECT_DIR = origProjectDir
    } else {
      delete process.env.CLAUDE_PROJECT_DIR
    }
  })

  it('returns project template when .kata/templates/ has the file', () => {
    const tmpDir = makeTmpDir('proj-override')
    tmpDirs.push(tmpDir)
    mkdirSync(join(tmpDir, '.kata', 'templates'), { recursive: true })
    writeFileSync(join(tmpDir, '.kata', 'templates', 'implementation.md'), '---\nid: custom\n---\n# custom')
    process.env.CLAUDE_PROJECT_DIR = tmpDir

    const result = resolveTemplatePath('implementation.md')
    expect(result).toBe(join(tmpDir, '.kata', 'templates', 'implementation.md'))
  })

  it('falls back to batteries when project template does not exist', () => {
    const tmpDir = makeTmpDir('batteries-fb')
    tmpDirs.push(tmpDir)
    // Create .kata/ dir but NO templates subdir
    mkdirSync(join(tmpDir, '.kata'), { recursive: true })
    process.env.CLAUDE_PROJECT_DIR = tmpDir

    // implementation.md exists in batteries/templates/
    const result = resolveTemplatePath('implementation.md')
    expect(result).toMatch(/batteries\/templates\/implementation\.md$/)
  })

  it('error message lists both checked paths', () => {
    const tmpDir = makeTmpDir('err-msg')
    tmpDirs.push(tmpDir)
    mkdirSync(join(tmpDir, '.kata'), { recursive: true })
    process.env.CLAUDE_PROJECT_DIR = tmpDir

    expect(() => resolveTemplatePath('nonexistent-xyz.md')).toThrow(/Checked:/)
  })
})

describe('getCurrentSessionId', () => {
  const origProjectDir = process.env.CLAUDE_PROJECT_DIR
  let tmpDir: string

  beforeEach(() => {
    tmpDir = makeTmpDir('session-layout')
    mkdirSync(join(tmpDir, '.kata', 'sessions'), { recursive: true })
    process.env.CLAUDE_PROJECT_DIR = tmpDir
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
    if (origProjectDir !== undefined) {
      process.env.CLAUDE_PROJECT_DIR = origProjectDir
    } else {
      delete process.env.CLAUDE_PROJECT_DIR
    }
  })

  it('finds session in .kata/sessions/', async () => {
    const sessionId = '12345678-1234-4234-8234-123456789abc'
    mkdirSync(join(tmpDir, '.kata', 'sessions', sessionId), { recursive: true })
    writeFileSync(
      join(tmpDir, '.kata', 'sessions', sessionId, 'state.json'),
      JSON.stringify({ updatedAt: new Date().toISOString() }),
    )

    const result = await getCurrentSessionId()
    expect(result).toBe(sessionId)
  })

  it('finds session in .kata/sessions/ when it exists there', async () => {
    const sessionId = 'abcdef01-2345-4678-9abc-def012345678'
    mkdirSync(join(tmpDir, '.kata', 'sessions', sessionId), { recursive: true })
    writeFileSync(
      join(tmpDir, '.kata', 'sessions', sessionId, 'state.json'),
      JSON.stringify({ updatedAt: new Date().toISOString() }),
    )

    const result = await getCurrentSessionId()
    expect(result).toBe(sessionId)
  })
})

describe('getStateFilePath — layout-shift resilience', () => {
  const origProjectDir = process.env.CLAUDE_PROJECT_DIR
  let tmpDir: string

  beforeEach(() => {
    tmpDir = makeTmpDir('state-path')
    mkdirSync(join(tmpDir, '.claude', 'sessions'), { recursive: true })
    process.env.CLAUDE_PROJECT_DIR = tmpDir
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
    if (origProjectDir !== undefined) {
      process.env.CLAUDE_PROJECT_DIR = origProjectDir
    } else {
      delete process.env.CLAUDE_PROJECT_DIR
    }
  })

  it('returns .claude/ path when state.json exists only there despite .kata/ existing', async () => {
    const sessionId = '12345678-1234-4234-8234-123456789abc'
    mkdirSync(join(tmpDir, '.claude', 'sessions', sessionId), { recursive: true })
    writeFileSync(
      join(tmpDir, '.claude', 'sessions', sessionId, 'state.json'),
      JSON.stringify({ updatedAt: new Date().toISOString() }),
    )
    // .kata/ exists but has no sessions
    mkdirSync(join(tmpDir, '.kata', 'sessions'), { recursive: true })

    const result = await getStateFilePath(sessionId)
    expect(result).toBe(join(tmpDir, '.claude', 'sessions', sessionId, 'state.json'))
  })
})
