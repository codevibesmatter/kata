import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import * as os from 'node:os'
import jsYaml from 'js-yaml'
import {
  loadInterviewConfig,
  clearInterviewConfigCache,
  InterviewConfigSchema,
  InterviewCategorySchema,
  InterviewRoundSchema,
  InterviewOptionSchema,
} from './interviews.js'

function makeTmpDir(label: string): string {
  const dir = join(
    os.tmpdir(),
    `wm-interview-test-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  )
  mkdirSync(dir, { recursive: true })
  return dir
}

function writeInterviewsYaml(dir: string, config: Record<string, unknown>): string {
  const filePath = join(dir, 'interviews.yaml')
  writeFileSync(filePath, jsYaml.dump(config))
  return filePath
}

// ── Schema validation ──

describe('InterviewOptionSchema', () => {
  it('accepts valid option', () => {
    const result = InterviewOptionSchema.safeParse({
      label: 'User workflow gap',
      description: 'Missing capability in existing flow',
    })
    expect(result.success).toBe(true)
  })

  it('rejects empty label', () => {
    const result = InterviewOptionSchema.safeParse({
      label: '',
      description: 'Some description',
    })
    expect(result.success).toBe(false)
  })

  it('rejects missing description', () => {
    const result = InterviewOptionSchema.safeParse({ label: 'A label' })
    expect(result.success).toBe(false)
  })
})

describe('InterviewRoundSchema', () => {
  it('accepts valid round', () => {
    const result = InterviewRoundSchema.safeParse({
      header: 'Problem',
      question: 'What user problem does this solve?',
      options: [{ label: 'Workflow gap', description: 'Missing capability' }],
    })
    expect(result.success).toBe(true)
  })

  it('rejects empty options array', () => {
    const result = InterviewRoundSchema.safeParse({
      header: 'Problem',
      question: 'What?',
      options: [],
    })
    expect(result.success).toBe(false)
  })
})

describe('InterviewCategorySchema', () => {
  it('accepts valid category', () => {
    const result = InterviewCategorySchema.safeParse({
      name: 'Requirements',
      description: 'User journey, scope',
      rounds: [
        {
          header: 'Problem',
          question: 'What?',
          options: [{ label: 'Gap', description: 'Missing' }],
        },
      ],
    })
    expect(result.success).toBe(true)
  })

  it('rejects category with no rounds', () => {
    const result = InterviewCategorySchema.safeParse({
      name: 'Empty',
      description: 'No rounds',
      rounds: [],
    })
    expect(result.success).toBe(false)
  })
})

describe('InterviewConfigSchema', () => {
  it('accepts valid config with multiple categories', () => {
    const result = InterviewConfigSchema.safeParse({
      interview_categories: {
        requirements: {
          name: 'Requirements',
          description: 'Scope',
          rounds: [
            {
              header: 'Problem',
              question: 'What?',
              options: [{ label: 'Gap', description: 'Missing' }],
            },
          ],
        },
        testing: {
          name: 'Testing',
          description: 'Test strategy',
          rounds: [
            {
              header: 'Happy Path',
              question: 'What works?',
              options: [{ label: 'CRUD', description: 'Basic flows' }],
            },
          ],
        },
      },
    })
    expect(result.success).toBe(true)
  })

  it('rejects config missing interview_categories key', () => {
    const result = InterviewConfigSchema.safeParse({ categories: {} })
    expect(result.success).toBe(false)
  })
})

// ── 2-tier merge loader ──

describe('loadInterviewConfig 2-tier merge', () => {
  const origProjectDir = process.env.CLAUDE_PROJECT_DIR
  let tmpDirs: string[] = []

  beforeEach(() => {
    clearInterviewConfigCache()
    tmpDirs = []
  })

  afterEach(() => {
    for (const dir of tmpDirs) {
      rmSync(dir, { recursive: true, force: true })
    }
    if (origProjectDir !== undefined) {
      process.env.CLAUDE_PROJECT_DIR = origProjectDir
    } else {
      delete process.env.CLAUDE_PROJECT_DIR
    }
    clearInterviewConfigCache()
  })

  it('loads package config when no project override exists', async () => {
    // Point to a dir with .claude/ but no interviews.yaml
    const tmpDir = makeTmpDir('no-override')
    tmpDirs.push(tmpDir)
    const projDir = join(tmpDir, 'proj')
    mkdirSync(join(projDir, '.claude'), { recursive: true })
    process.env.CLAUDE_PROJECT_DIR = projDir

    const config = await loadInterviewConfig()
    // Should have package-level categories
    expect(config.interview_categories.requirements).toBeDefined()
    expect(config.interview_categories.architecture).toBeDefined()
    expect(config.interview_categories.testing).toBeDefined()
    expect(config.interview_categories.design).toBeDefined()
  })

  it('project config overrides a package category', async () => {
    const tmpDir = makeTmpDir('project-override')
    tmpDirs.push(tmpDir)

    // Create project with .kata/ layout and custom interviews.yaml
    const projDir = join(tmpDir, 'proj')
    mkdirSync(join(projDir, '.kata'), { recursive: true })
    writeInterviewsYaml(join(projDir, '.kata'), {
      interview_categories: {
        requirements: {
          name: 'Custom Requirements',
          description: 'Project-specific requirements',
          rounds: [
            {
              header: 'Custom Q',
              question: 'Project-specific question?',
              options: [{ label: 'Option A', description: 'Custom option' }],
            },
          ],
        },
      },
    })
    process.env.CLAUDE_PROJECT_DIR = projDir

    const config = await loadInterviewConfig()
    // Project override wins for requirements
    expect(config.interview_categories.requirements.name).toBe('Custom Requirements')
    expect(config.interview_categories.requirements.rounds).toHaveLength(1)
    // Other package categories still present
    expect(config.interview_categories.architecture).toBeDefined()
    expect(config.interview_categories.testing).toBeDefined()
    expect(config.interview_categories.design).toBeDefined()
  })

  it('project config adds new categories', async () => {
    const tmpDir = makeTmpDir('project-add')
    tmpDirs.push(tmpDir)

    const projDir = join(tmpDir, 'proj')
    mkdirSync(join(projDir, '.kata'), { recursive: true })
    writeInterviewsYaml(join(projDir, '.kata'), {
      interview_categories: {
        security: {
          name: 'Security',
          description: 'Auth and access control',
          rounds: [
            {
              header: 'Auth',
              question: 'What auth model?',
              options: [{ label: 'JWT', description: 'Token-based' }],
            },
          ],
        },
      },
    })
    process.env.CLAUDE_PROJECT_DIR = projDir

    const config = await loadInterviewConfig()
    // New category added
    expect(config.interview_categories.security).toBeDefined()
    expect(config.interview_categories.security.name).toBe('Security')
    // Package categories still present
    expect(config.interview_categories.requirements).toBeDefined()
    expect(config.interview_categories.architecture).toBeDefined()
  })

  it('handles invalid project interviews.yaml gracefully', async () => {
    const tmpDir = makeTmpDir('invalid-project')
    tmpDirs.push(tmpDir)

    const projDir = join(tmpDir, 'proj')
    mkdirSync(join(projDir, '.kata'), { recursive: true })
    writeFileSync(
      join(projDir, '.kata', 'interviews.yaml'),
      'this is not valid yaml: [[[{{{',
    )
    process.env.CLAUDE_PROJECT_DIR = projDir

    // Should not throw — falls back to package defaults
    const config = await loadInterviewConfig()
    expect(config.interview_categories.requirements).toBeDefined()
    expect(config.interview_categories.architecture).toBeDefined()
  })

  it('handles schema-invalid project interviews.yaml gracefully', async () => {
    const tmpDir = makeTmpDir('schema-invalid')
    tmpDirs.push(tmpDir)

    const projDir = join(tmpDir, 'proj')
    mkdirSync(join(projDir, '.kata'), { recursive: true })
    // Valid YAML but wrong schema (missing required fields)
    writeInterviewsYaml(join(projDir, '.kata'), {
      interview_categories: {
        bad: {
          name: 'Bad',
          // missing description and rounds
        },
      },
    })
    process.env.CLAUDE_PROJECT_DIR = projDir

    // Should not throw — falls back to package defaults
    const config = await loadInterviewConfig()
    expect(config.interview_categories.requirements).toBeDefined()
    // Bad category should NOT appear
    expect(config.interview_categories.bad).toBeUndefined()
  })

  it('cache returns same instance on repeated calls', async () => {
    const tmpDir = makeTmpDir('cache-hit')
    tmpDirs.push(tmpDir)
    const projDir = join(tmpDir, 'proj')
    mkdirSync(join(projDir, '.claude'), { recursive: true })
    process.env.CLAUDE_PROJECT_DIR = projDir

    const first = await loadInterviewConfig()
    const second = await loadInterviewConfig()
    expect(first).toBe(second) // same reference
  })

  it('clearInterviewConfigCache forces fresh load', async () => {
    const tmpDir = makeTmpDir('cache-clear')
    tmpDirs.push(tmpDir)
    const projDir = join(tmpDir, 'proj')
    mkdirSync(join(projDir, '.claude'), { recursive: true })
    process.env.CLAUDE_PROJECT_DIR = projDir

    const first = await loadInterviewConfig()
    clearInterviewConfigCache()
    const second = await loadInterviewConfig()
    // Same content but different reference
    expect(first).not.toBe(second)
    expect(first.interview_categories.requirements.name).toBe(
      second.interview_categories.requirements.name,
    )
  })

  it('loads from .kata/ layout', async () => {
    const tmpDir = makeTmpDir('kata-layout')
    tmpDirs.push(tmpDir)

    const projDir = join(tmpDir, 'proj')
    mkdirSync(join(projDir, '.kata'), { recursive: true })
    writeInterviewsYaml(join(projDir, '.kata'), {
      interview_categories: {
        requirements: {
          name: 'Kata Layout Requirements',
          description: 'Using .kata/ path',
          rounds: [
            {
              header: 'Q',
              question: 'Works?',
              options: [{ label: 'Yes', description: 'It works' }],
            },
          ],
        },
      },
    })
    process.env.CLAUDE_PROJECT_DIR = projDir

    const config = await loadInterviewConfig()
    expect(config.interview_categories.requirements.name).toBe('Kata Layout Requirements')
  })
})
