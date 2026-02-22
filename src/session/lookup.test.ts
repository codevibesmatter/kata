import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import * as os from 'node:os'
import { getUserConfigDir, getModesYamlPath } from './lookup.js'

function makeTmpDir(label: string): string {
  const dir = join(
    os.tmpdir(),
    `wm-lookup-test-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  )
  mkdirSync(dir, { recursive: true })
  return dir
}

describe('getUserConfigDir', () => {
  const origXdg = process.env.XDG_CONFIG_HOME
  const origHome = process.env.HOME

  afterEach(() => {
    if (origXdg !== undefined) {
      process.env.XDG_CONFIG_HOME = origXdg
    } else {
      delete process.env.XDG_CONFIG_HOME
    }
    if (origHome !== undefined) {
      process.env.HOME = origHome
    } else {
      delete process.env.HOME
    }
  })

  it('uses XDG_CONFIG_HOME when set', () => {
    process.env.XDG_CONFIG_HOME = '/custom/config'
    expect(getUserConfigDir()).toBe('/custom/config/kata')
  })

  it('falls back to ~/.config/kata when XDG_CONFIG_HOME is not set', () => {
    delete process.env.XDG_CONFIG_HOME
    const result = getUserConfigDir()
    expect(result).toMatch(/\.config\/kata$/)
  })

  it('returns path without creating directory', () => {
    const tmpDir = makeTmpDir('xdg')
    process.env.XDG_CONFIG_HOME = tmpDir
    const configDir = getUserConfigDir()
    expect(configDir).toBe(join(tmpDir, 'kata'))
    // Directory should NOT exist (getUserConfigDir doesn't create it)
    const { existsSync } = require('node:fs')
    expect(existsSync(configDir)).toBe(false)
    rmSync(tmpDir, { recursive: true, force: true })
  })
})

describe('getModesYamlPath', () => {
  const origProjectDir = process.env.CLAUDE_PROJECT_DIR
  const origXdg = process.env.XDG_CONFIG_HOME

  afterEach(() => {
    if (origProjectDir !== undefined) {
      process.env.CLAUDE_PROJECT_DIR = origProjectDir
    } else {
      delete process.env.CLAUDE_PROJECT_DIR
    }
    if (origXdg !== undefined) {
      process.env.XDG_CONFIG_HOME = origXdg
    } else {
      delete process.env.XDG_CONFIG_HOME
    }
  })

  it('returns packagePath always', () => {
    const paths = getModesYamlPath()
    expect(paths.packagePath).toMatch(/modes\.yaml$/)
  })

  it('returns userPath when user modes.yaml exists', () => {
    const tmpDir = makeTmpDir('user-modes')
    const kataDir = join(tmpDir, 'kata')
    mkdirSync(kataDir, { recursive: true })
    writeFileSync(join(kataDir, 'modes.yaml'), 'modes: {}')
    process.env.XDG_CONFIG_HOME = tmpDir

    const paths = getModesYamlPath()
    expect(paths.userPath).toBe(join(kataDir, 'modes.yaml'))

    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('returns null userPath when user config dir does not exist', () => {
    const tmpDir = makeTmpDir('no-user')
    process.env.XDG_CONFIG_HOME = join(tmpDir, 'nonexistent')

    const paths = getModesYamlPath()
    expect(paths.userPath).toBeNull()

    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('returns projectPath when project modes.yaml exists', () => {
    const tmpDir = makeTmpDir('project-modes')
    mkdirSync(join(tmpDir, '.claude', 'sessions'), { recursive: true })
    mkdirSync(join(tmpDir, '.claude', 'workflows'), { recursive: true })
    writeFileSync(join(tmpDir, '.claude', 'workflows', 'modes.yaml'), 'modes: {}')
    process.env.CLAUDE_PROJECT_DIR = tmpDir

    const paths = getModesYamlPath()
    expect(paths.projectPath).toBe(join(tmpDir, '.claude', 'workflows', 'modes.yaml'))

    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('returns null projectPath when project modes.yaml does not exist', () => {
    const tmpDir = makeTmpDir('no-project')
    mkdirSync(join(tmpDir, '.claude', 'sessions'), { recursive: true })
    process.env.CLAUDE_PROJECT_DIR = tmpDir

    const paths = getModesYamlPath()
    expect(paths.projectPath).toBeNull()

    rmSync(tmpDir, { recursive: true, force: true })
  })
})
