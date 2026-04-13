import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import * as os from 'node:os'
import jsYaml from 'js-yaml'

function makeTmpDir(label: string): string {
  const dir = join(
    os.tmpdir(),
    `wm-config-test-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  )
  mkdirSync(dir, { recursive: true })
  return dir
}

function writeKataYaml(dir: string, config: Record<string, unknown>): void {
  mkdirSync(join(dir, '.kata'), { recursive: true })
  writeFileSync(join(dir, '.kata', 'kata.yaml'), jsYaml.dump(config))
}

/**
 * Helper: capture stdout/stderr from config()
 */
async function captureConfig(args: string[]): Promise<{ stdout: string; stderr: string; exitCode: number | undefined }> {
  // Clear cached config
  const { clearKataConfigCache } = await import('../config/kata-config.js')
  clearKataConfigCache()

  const { config } = await import('./config.js')
  let stdout = ''
  let stderr = ''
  const origStdout = process.stdout.write
  const origStderr = process.stderr.write
  const origExitCode = process.exitCode

  process.stdout.write = (chunk: string | Uint8Array): boolean => {
    stdout += typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk)
    return true
  }
  process.stderr.write = (chunk: string | Uint8Array): boolean => {
    stderr += typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk)
    return true
  }
  // Reset exitCode before running — other test files may leave it set
  process.exitCode = 0

  try {
    await config(args)
    const capturedExitCode = process.exitCode
    return { stdout, stderr, exitCode: capturedExitCode }
  } finally {
    process.stdout.write = origStdout
    process.stderr.write = origStderr
    // Always reset to 0 so bun test runner doesn't see leftover exitCode
    process.exitCode = 0
  }
}

describe('config get', () => {
  let tmpDir: string
  const origEnv = process.env.CLAUDE_PROJECT_DIR

  beforeEach(() => {
    tmpDir = makeTmpDir('config-get')
    writeKataYaml(tmpDir, {
      spec_path: 'planning/specs',
      research_path: 'planning/research',
      session_retention_days: 7,
      project: {
        name: 'test-project',
        test_command: 'bun test',
      },
      modes: {
        implementation: {
          template: 'implementation.md',
          stop_conditions: ['tasks_complete', 'committed', 'pushed', 'tests_pass'],
        },
        task: {
          template: 'task.md',
          stop_conditions: ['tasks_complete', 'committed'],
        },
      },
    })
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

  it('returns scalar string value', async () => {
    const { stdout, exitCode } = await captureConfig(['get', 'spec_path'])
    expect(stdout.trim()).toBe('planning/specs')
    expect(exitCode).toBe(0)
  })

  it('returns nested value with dot notation', async () => {
    const { stdout } = await captureConfig(['get', 'project.test_command'])
    expect(stdout.trim()).toBe('bun test')
  })

  it('returns nested project name', async () => {
    const { stdout } = await captureConfig(['get', 'project.name'])
    expect(stdout.trim()).toBe('test-project')
  })

  it('returns array values as newline-separated', async () => {
    const { stdout } = await captureConfig(['get', 'modes.implementation.stop_conditions'])
    const lines = stdout.trim().split('\n')
    expect(lines).toContain('tasks_complete')
    expect(lines).toContain('committed')
    expect(lines).toContain('pushed')
    expect(lines).toContain('tests_pass')
  })

  it('returns mode template', async () => {
    const { stdout } = await captureConfig(['get', 'modes.implementation.template'])
    expect(stdout.trim()).toBe('implementation.md')
  })

  it('returns numeric value', async () => {
    const { stdout } = await captureConfig(['get', 'session_retention_days'])
    expect(stdout.trim()).toBe('7')
  })

  it('exits with code 1 for missing key', async () => {
    const { stderr, exitCode } = await captureConfig(['get', 'nonexistent.key'])
    expect(exitCode).toBe(1)
    expect(stderr).toContain('Key not found')
  })

  it('returns object as JSON for mode config', async () => {
    const { stdout } = await captureConfig(['get', 'modes.task'])
    const parsed = JSON.parse(stdout)
    expect(parsed.template).toBe('task.md')
  })
})
