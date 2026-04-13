import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { mkdirSync, rmSync, existsSync, writeFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import * as os from 'node:os'
import { installUserSkills, cleanLegacyFiles } from './scaffold-batteries.js'

function makeTmpDir(label: string): string {
  const dir = join(
    os.tmpdir(),
    `wm-scaffold-test-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  )
  mkdirSync(dir, { recursive: true })
  return dir
}

describe('installUserSkills', () => {
  let tmpHome: string

  beforeEach(() => {
    tmpHome = makeTmpDir('home')
  })

  afterEach(() => {
    rmSync(tmpHome, { recursive: true, force: true })
  })

  it('installs skills with kata- prefix', () => {
    const result = installUserSkills({ homeDir: tmpHome })
    expect(result.installed.length).toBeGreaterThan(0)
    // Check kata- prefix for a known batteries skill
    const skillDir = join(tmpHome, '.claude', 'skills', 'kata-code-impl')
    expect(existsSync(skillDir)).toBe(true)
  })

  it('all installed skills use kata- prefix', () => {
    const result = installUserSkills({ homeDir: tmpHome })
    for (const name of result.installed) {
      const prefixedDir = join(tmpHome, '.claude', 'skills', `kata-${name}`)
      expect(existsSync(prefixedDir)).toBe(true)
      // Bare name should NOT exist
      const bareDir = join(tmpHome, '.claude', 'skills', name)
      expect(existsSync(bareDir)).toBe(false)
    }
  })

  it('installs skill files with correct content', () => {
    installUserSkills({ homeDir: tmpHome })
    const skillFile = join(tmpHome, '.claude', 'skills', 'kata-code-impl', 'SKILL.md')
    expect(existsSync(skillFile)).toBe(true)
    const content = readFileSync(skillFile, 'utf-8')
    expect(content.length).toBeGreaterThan(0)
  })

  it('skips existing when update=false', () => {
    installUserSkills({ homeDir: tmpHome })
    const result = installUserSkills({ homeDir: tmpHome, update: false })
    expect(result.skipped.length).toBeGreaterThan(0)
    expect(result.installed.length).toBe(0)
  })

  it('overwrites when update=true', () => {
    installUserSkills({ homeDir: tmpHome })
    const result = installUserSkills({ homeDir: tmpHome, update: true })
    expect(result.updated.length).toBeGreaterThan(0)
    expect(result.installed.length).toBe(0)
  })
})

describe('cleanLegacyFiles', () => {
  let tmpDir: string
  const origEnv = process.env.CLAUDE_PROJECT_DIR

  beforeEach(() => {
    tmpDir = makeTmpDir('clean')
    mkdirSync(join(tmpDir, '.kata'), { recursive: true })
    process.env.CLAUDE_PROJECT_DIR = tmpDir
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
    if (origEnv !== undefined) {
      process.env.CLAUDE_PROJECT_DIR = origEnv
    } else {
      delete process.env.CLAUDE_PROJECT_DIR
    }
  })

  it('removes batteries-matching templates', () => {
    mkdirSync(join(tmpDir, '.kata', 'templates'), { recursive: true })
    writeFileSync(join(tmpDir, '.kata', 'templates', 'implementation.md'), 'old')
    const result = cleanLegacyFiles(tmpDir)
    expect(result.removedTemplates).toContain('implementation.md')
    expect(existsSync(join(tmpDir, '.kata', 'templates', 'implementation.md'))).toBe(false)
  })

  it('preserves custom templates', () => {
    mkdirSync(join(tmpDir, '.kata', 'templates'), { recursive: true })
    writeFileSync(join(tmpDir, '.kata', 'templates', 'my-custom.md'), 'custom')
    cleanLegacyFiles(tmpDir)
    expect(existsSync(join(tmpDir, '.kata', 'templates', 'my-custom.md'))).toBe(true)
  })

  it('removes bare-named skills matching batteries', () => {
    mkdirSync(join(tmpDir, '.claude', 'skills', 'code-impl'), { recursive: true })
    writeFileSync(join(tmpDir, '.claude', 'skills', 'code-impl', 'SKILL.md'), 'old')
    const result = cleanLegacyFiles(tmpDir)
    expect(result.removedSkills).toContain('code-impl')
    expect(existsSync(join(tmpDir, '.claude', 'skills', 'code-impl'))).toBe(false)
  })

  it('preserves kata-prefixed skills', () => {
    mkdirSync(join(tmpDir, '.claude', 'skills', 'kata-code-impl'), { recursive: true })
    writeFileSync(join(tmpDir, '.claude', 'skills', 'kata-code-impl', 'SKILL.md'), 'new')
    cleanLegacyFiles(tmpDir)
    expect(existsSync(join(tmpDir, '.claude', 'skills', 'kata-code-impl', 'SKILL.md'))).toBe(true)
  })

  it('preserves custom skills not in batteries', () => {
    mkdirSync(join(tmpDir, '.claude', 'skills', 'my-custom-skill'), { recursive: true })
    writeFileSync(join(tmpDir, '.claude', 'skills', 'my-custom-skill', 'SKILL.md'), 'custom')
    cleanLegacyFiles(tmpDir)
    expect(existsSync(join(tmpDir, '.claude', 'skills', 'my-custom-skill', 'SKILL.md'))).toBe(true)
  })

  it('handles missing templates and skills dirs gracefully', () => {
    // No .kata/templates/ or .claude/skills/ dirs — should not throw
    const result = cleanLegacyFiles(tmpDir)
    expect(result.removedTemplates).toEqual([])
    expect(result.removedSkills).toEqual([])
  })
})
