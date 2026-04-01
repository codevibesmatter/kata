import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import * as os from 'node:os'
import jsYaml from 'js-yaml'
import { loadKataConfig, clearKataConfigCache, resolveKataModeAlias, type KataConfig } from './kata-config.js'

function makeTmpDir(): string {
  const dir = join(
    os.tmpdir(),
    `kata-config-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  )
  mkdirSync(dir, { recursive: true })
  return dir
}

describe('loadKataConfig', () => {
  let tmpDir: string
  const origEnv = process.env.CLAUDE_PROJECT_DIR

  beforeEach(() => {
    clearKataConfigCache()
    tmpDir = makeTmpDir()
    // Create .kata structure so findProjectDir finds this
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
    clearKataConfigCache()
  })

  it('parses a valid kata.yaml without error', () => {
    const config = {
      project: {
        name: 'test-project',
        build_command: 'npm run build',
        test_command: 'npm test',
      },
      spec_path: 'planning/specs',
      research_path: 'planning/research',
      session_retention_days: 7,
      non_code_paths: ['.claude', '.kata', 'planning'],
      modes: {
        task: {
          template: 'task.md',
          stop_conditions: ['tasks_complete', 'committed'],
          intent_keywords: ['task:', 'chore'],
          aliases: ['chore', 'small'],
          workflow_prefix: 'TK',
        },
        planning: {
          template: 'planning.md',
          issue_handling: 'required',
          issue_label: 'feature',
          stop_conditions: ['tasks_complete', 'committed'],
          intent_keywords: ['plan feature', 'spec'],
        },
        freeform: {
          template: 'freeform.md',
          stop_conditions: [],
          intent_keywords: ['question', 'how does'],
          aliases: ['question', 'ask'],
        },
      },
    }
    writeFileSync(join(tmpDir, '.kata', 'kata.yaml'), jsYaml.dump(config))

    const result = loadKataConfig()
    expect(result.project?.name).toBe('test-project')
    expect(result.spec_path).toBe('planning/specs')
    expect(result.modes.task.template).toBe('task.md')
    expect(result.modes.task.stop_conditions).toEqual(['tasks_complete', 'committed'])
    expect(result.modes.task.aliases).toEqual(['chore', 'small'])
    expect(result.modes.planning.issue_handling).toBe('required')
    expect(result.modes.freeform.stop_conditions).toEqual([])
  })

  it('applies defaults for optional fields', () => {
    const config = {
      modes: {
        task: {
          template: 'task.md',
        },
      },
    }
    writeFileSync(join(tmpDir, '.kata', 'kata.yaml'), jsYaml.dump(config))

    const result = loadKataConfig()
    expect(result.spec_path).toBe('planning/specs')
    expect(result.research_path).toBe('planning/research')
    expect(result.session_retention_days).toBe(7)
    expect(result.non_code_paths).toEqual(['.claude', '.kata', 'planning'])
    expect(result.modes.task.stop_conditions).toEqual([])
  })

  it('throws descriptive error for invalid kata.yaml', () => {
    const config = {
      modes: {
        task: {
          // missing required 'template' field
          stop_conditions: ['invalid_condition'],
        },
      },
    }
    writeFileSync(join(tmpDir, '.kata', 'kata.yaml'), jsYaml.dump(config))

    expect(() => loadKataConfig()).toThrow(/invalid kata\.yaml/)
  })

  it('throws error with setup instructions when kata.yaml missing', () => {
    // .kata dir exists but no kata.yaml
    expect(() => loadKataConfig()).toThrow(/kata setup/)
  })

  it('throws migration hint when legacy wm.yaml exists but no kata.yaml', () => {
    // Create legacy wm.yaml
    writeFileSync(join(tmpDir, '.kata', 'wm.yaml'), 'project:\n  name: old\n')

    expect(() => loadKataConfig()).toThrow(/legacy wm\.yaml/)
  })

  it('throws migration hint when legacy modes.yaml exists but no kata.yaml', () => {
    writeFileSync(join(tmpDir, '.kata', 'modes.yaml'), 'modes:\n  task:\n    template: task.md\n')

    expect(() => loadKataConfig()).toThrow(/legacy wm\.yaml\/modes\.yaml/)
  })

  it('throws for empty YAML file', () => {
    writeFileSync(join(tmpDir, '.kata', 'kata.yaml'), '')

    expect(() => loadKataConfig()).toThrow(/empty or not a valid/)
  })

  it('throws for non-object YAML', () => {
    writeFileSync(join(tmpDir, '.kata', 'kata.yaml'), 'just a string')

    expect(() => loadKataConfig()).toThrow(/empty or not a valid/)
  })

  it('caches config on repeated calls', () => {
    const config = { modes: { task: { template: 'task.md' } } }
    writeFileSync(join(tmpDir, '.kata', 'kata.yaml'), jsYaml.dump(config))

    const first = loadKataConfig()
    const second = loadKataConfig()
    expect(first).toBe(second) // Same object reference
  })

  it('provides default task_rules and empty global_rules', () => {
    const config = { modes: {} }
    writeFileSync(join(tmpDir, '.kata', 'kata.yaml'), jsYaml.dump(config))

    const result = loadKataConfig()
    expect(result.task_rules.length).toBeGreaterThan(0)
    expect(result.task_rules[0]).toContain('TaskCreate')
    expect(result.global_rules).toEqual([])
  })

  it('allows overriding task_rules and global_rules', () => {
    const config = {
      global_rules: ['Always use TypeScript'],
      task_rules: ['Custom task rule'],
      modes: {},
    }
    writeFileSync(join(tmpDir, '.kata', 'kata.yaml'), jsYaml.dump(config))

    const result = loadKataConfig()
    expect(result.global_rules).toEqual(['Always use TypeScript'])
    expect(result.task_rules).toEqual(['Custom task rule'])
  })

  it('allows disabling task_rules with empty array', () => {
    const config = { task_rules: [], modes: {} }
    writeFileSync(join(tmpDir, '.kata', 'kata.yaml'), jsYaml.dump(config))

    const result = loadKataConfig()
    expect(result.task_rules).toEqual([])
  })

  it('handles reviews and providers sections', () => {
    const config = {
      reviews: {
        code_review: true,
        code_reviewer: 'codex',
      },
      providers: {
        default: 'claude',
        available: ['claude', 'codex'],
      },
      modes: {},
    }
    writeFileSync(join(tmpDir, '.kata', 'kata.yaml'), jsYaml.dump(config))

    const result = loadKataConfig()
    expect(result.reviews?.code_review).toBe(true)
    expect(result.reviews?.code_reviewer).toBe('codex')
    expect(result.providers?.default).toBe('claude')
    expect(result.providers?.available).toEqual(['claude', 'codex'])
  })
})

describe('resolveKataModeAlias', () => {
  const config: KataConfig = {
    spec_path: 'planning/specs',
    research_path: 'planning/research',
    session_retention_days: 7,
    non_code_paths: ['.claude', '.kata', 'planning'],
    modes: {
      task: {
        template: 'task.md',
        stop_conditions: ['tasks_complete'],
        aliases: ['chore', 'small'],
      },
      freeform: {
        template: 'freeform.md',
        stop_conditions: [],
        aliases: ['question', 'ask'],
      },
    },
  }

  it('returns canonical name when given canonical name', () => {
    expect(resolveKataModeAlias(config, 'task')).toBe('task')
  })

  it('resolves alias to canonical name', () => {
    expect(resolveKataModeAlias(config, 'chore')).toBe('task')
    expect(resolveKataModeAlias(config, 'question')).toBe('freeform')
  })

  it('returns input when no match found', () => {
    expect(resolveKataModeAlias(config, 'nonexistent')).toBe('nonexistent')
  })
})
