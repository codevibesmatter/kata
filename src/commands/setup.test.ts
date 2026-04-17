import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { mkdirSync, rmSync, existsSync, readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import * as os from 'node:os'
import jsYaml from 'js-yaml'

function makeTmpDir(): string {
  const dir = join(
    os.tmpdir(),
    `wm-setup-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  )
  mkdirSync(dir, { recursive: true })
  return dir
}

/**
 * Helper: capture stdout from setup()
 */
async function captureSetup(args: string[], cwd: string): Promise<string> {
  const { setup } = await import('./setup.js')
  let captured = ''
  const origWrite = process.stdout.write
  process.stdout.write = (chunk: string | Uint8Array): boolean => {
    captured += typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk)
    return true
  }
  try {
    await setup([...args, `--cwd=${cwd}`])
  } finally {
    process.stdout.write = origWrite
  }
  return captured
}

describe('setup --yes', () => {
  let tmpDir: string
  const origEnv = process.env.CLAUDE_PROJECT_DIR

  beforeEach(() => {
    tmpDir = makeTmpDir()
    // The setup command uses --cwd to determine target directory.
    // Set CLAUDE_PROJECT_DIR so findClaudeProjectDir resolves correctly after setup.
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

  it('creates directories and kata.yaml with default profile', async () => {
    const output = await captureSetup(['--yes'], tmpDir)

    // Check output indicates success
    expect(output).toContain('kata setup complete')

    // Check kata.yaml was created
    const kataYamlPath = join(tmpDir, '.kata', 'kata.yaml')
    expect(existsSync(kataYamlPath)).toBe(true)

    // Parse and verify kata.yaml content
    const raw = readFileSync(kataYamlPath, 'utf-8')
    const config = jsYaml.load(raw) as Record<string, unknown>
    expect(config).toBeDefined()
    expect(config.spec_path).toBe('planning/specs')
    expect(config.research_path).toBe('planning/research')

    // Check sessions directory was created
    expect(existsSync(join(tmpDir, '.kata', 'sessions'))).toBe(true)
  })

  it('creates settings.json with 3 default hooks', async () => {
    await captureSetup(['--yes'], tmpDir)

    const settingsPath = join(tmpDir, '.claude', 'settings.json')
    expect(existsSync(settingsPath)).toBe(true)

    const settings = JSON.parse(readFileSync(settingsPath, 'utf-8')) as {
      hooks: Record<string, unknown[]>
    }
    expect(settings.hooks).toBeDefined()
    expect(settings.hooks.SessionStart).toBeDefined()
    expect(settings.hooks.UserPromptSubmit).toBeDefined()
    expect(settings.hooks.Stop).toBeDefined()
  })

  it('registers PreToolUse hook by default', async () => {
    await captureSetup(['--yes'], tmpDir)

    const settingsPath = join(tmpDir, '.claude', 'settings.json')
    const settings = JSON.parse(readFileSync(settingsPath, 'utf-8')) as {
      hooks: Record<string, unknown[]>
    }

    // PreToolUse is always registered (consolidated into a single entry)
    expect(settings.hooks.PreToolUse).toBeDefined()
    expect(Array.isArray(settings.hooks.PreToolUse)).toBe(true)
    expect(settings.hooks.PreToolUse.length).toBe(1)
  })

  it('is idempotent (re-run preserves existing)', async () => {
    // First setup
    await captureSetup(['--yes'], tmpDir)

    const kataYamlPath = join(tmpDir, '.kata', 'kata.yaml')
    const firstContent = readFileSync(kataYamlPath, 'utf-8')

    // Second setup
    await captureSetup(['--yes'], tmpDir)

    const secondContent = readFileSync(kataYamlPath, 'utf-8')
    // Content should be the same (existing kata.yaml fields win)
    const firstConfig = jsYaml.load(firstContent) as Record<string, unknown>
    const secondConfig = jsYaml.load(secondContent) as Record<string, unknown>
    expect(secondConfig.spec_path).toBe(firstConfig.spec_path)
    expect(secondConfig.research_path).toBe(firstConfig.research_path)
  })

  it('preserves existing non-kata hooks', async () => {
    // Create a pre-existing settings.json with non-kata hooks
    // Use a command that does NOT match the kata hook pattern
    // (the pattern matches '\bhook (session-start|...)' so 'my-custom-hook session-start' would match)
    mkdirSync(join(tmpDir, '.claude'), { recursive: true })
    writeFileSync(
      join(tmpDir, '.claude', 'settings.json'),
      JSON.stringify({
        hooks: {
          SessionStart: [
            {
              hooks: [
                {
                  type: 'command',
                  command: 'my-custom-startup-script --init',
                },
              ],
            },
          ],
        },
      }),
    )

    await captureSetup(['--yes'], tmpDir)

    const settingsPath = join(tmpDir, '.claude', 'settings.json')
    const settings = JSON.parse(readFileSync(settingsPath, 'utf-8')) as {
      hooks: Record<string, Array<{ hooks: Array<{ command: string }> }>>
    }

    // Should have both custom hook and kata hook for SessionStart
    const sessionStartEntries = settings.hooks.SessionStart
    expect(sessionStartEntries.length).toBeGreaterThanOrEqual(2)

    // Custom hook should be preserved
    const hasCustomHook = sessionStartEntries.some((entry) =>
      entry.hooks?.some((h) => h.command === 'my-custom-startup-script --init'),
    )
    expect(hasCustomHook).toBe(true)

    // kata hook should be present
    const hasWmHook = sessionStartEntries.some((entry) =>
      entry.hooks?.some((h) => h.command.includes('hook session-start')),
    )
    expect(hasWmHook).toBe(true)
  })

  it('works without .kata/sessions/ existing', async () => {
    // Don't pre-create .kata/sessions/ - setup should create it
    const output = await captureSetup(['--yes'], tmpDir)
    expect(output).toContain('kata setup complete')
    expect(existsSync(join(tmpDir, '.kata', 'sessions'))).toBe(true)
  })

  it('auto-detects package.json name and test command', async () => {
    writeFileSync(
      join(tmpDir, 'package.json'),
      JSON.stringify({
        name: 'my-detected-project',
        scripts: { test: 'vitest run' },
      }),
    )

    const output = await captureSetup(['--yes'], tmpDir)
    expect(output).toContain('my-detected-project')

    // test_command should be saved in kata.yaml config
    const kataYamlPath = join(tmpDir, '.kata', 'kata.yaml')
    const config = jsYaml.load(readFileSync(kataYamlPath, 'utf-8')) as Record<string, unknown>
    const project = config.project as Record<string, unknown>
    expect(project.test_command).toBe('vitest run')
  })

  it('auto-detects CI config', async () => {
    mkdirSync(join(tmpDir, '.github', 'workflows'), { recursive: true })
    writeFileSync(join(tmpDir, '.github', 'workflows', 'ci.yml'), 'name: CI')

    const output = await captureSetup(['--yes'], tmpDir)
    expect(output).toContain('kata setup complete')

    // CI should be saved in kata.yaml config
    const kataYamlPath = join(tmpDir, '.kata', 'kata.yaml')
    const config = jsYaml.load(readFileSync(kataYamlPath, 'utf-8')) as Record<string, unknown>
    const project = config.project as Record<string, unknown>
    expect(project.ci).toBe('github-actions')
  })

  it('setup --yes scaffolds spec-templates and github templates (no project templates)', async () => {
    const output = await captureSetup(['--yes'], tmpDir)
    expect(output).toContain('kata setup complete')

    // Mode templates should NOT exist in .kata/templates/ (dual resolution from batteries)
    const templatesDir = join(tmpDir, '.kata', 'templates')
    expect(existsSync(templatesDir)).toBe(false)

    // Spec templates should exist in planning/spec-templates/
    const specTemplatesDir = join(tmpDir, 'planning', 'spec-templates')
    expect(existsSync(specTemplatesDir)).toBe(true)
    const specFiles = readdirSync(specTemplatesDir) as string[]
    expect(specFiles.length).toBeGreaterThan(0)

    // GitHub issue templates should exist in .github/ISSUE_TEMPLATE/
    const issueTemplateDir = join(tmpDir, '.github', 'ISSUE_TEMPLATE')
    expect(existsSync(issueTemplateDir)).toBe(true)
    const issueFiles = readdirSync(issueTemplateDir) as string[]
    expect(issueFiles.length).toBeGreaterThan(0)
  })

  it('setup --yes is idempotent with batteries content', async () => {
    // First setup
    await captureSetup(['--yes'], tmpDir)

    // Second setup should not error
    const output = await captureSetup(['--yes'], tmpDir)
    expect(output).toContain('kata setup complete')

    // Spec templates should still exist
    const specTemplatesDir = join(tmpDir, 'planning', 'spec-templates')
    expect(existsSync(specTemplatesDir)).toBe(true)
  })
})

describe('kata-config skill', () => {
  it('batteries includes kata-config skill', async () => {
    const { getPackageRoot } = await import('../session/lookup.js')
    const skillPath = join(getPackageRoot(), 'batteries', 'skills', 'kata-config', 'SKILL.md')
    expect(existsSync(skillPath)).toBe(true)
  })

  it('kata-config skill has valid frontmatter with description', async () => {
    const { parseYamlFrontmatter } = await import('../yaml/parser.js')
    const { getPackageRoot } = await import('../session/lookup.js')
    const skillPath = join(getPackageRoot(), 'batteries', 'skills', 'kata-config', 'SKILL.md')
    const frontmatter = parseYamlFrontmatter<{ description: string }>(skillPath)
    expect(frontmatter).not.toBeNull()
    expect(frontmatter!.description).toBeDefined()
    expect(typeof frontmatter!.description).toBe('string')
  })

  it('kata-config skill covers all 3 scenarios', async () => {
    const { readFileSync } = await import('node:fs')
    const { getPackageRoot } = await import('../session/lookup.js')
    const skillPath = join(getPackageRoot(), 'batteries', 'skills', 'kata-config', 'SKILL.md')
    const content = readFileSync(skillPath, 'utf-8')
    expect(content).toContain('Kata Source Repo')
    expect(content).toContain('Fresh Project')
    expect(content).toContain('Reconfigure')
  })

  it('setup --yes does not scaffold skills to project (user-scoped instead)', async () => {
    const tmpDir = makeTmpDir()
    try {
      await captureSetup(['--yes'], tmpDir)
      // Skills should NOT be in project .claude/skills/ (they go to ~/.claude/skills/kata-config/)
      const skillDest = join(tmpDir, '.claude', 'skills', 'kata-config', 'SKILL.md')
      expect(existsSync(skillDest)).toBe(false)
    } finally {
      rmSync(tmpDir, { recursive: true, force: true })
    }
  })
})

