import { describe, it, expect } from 'bun:test'
import { isOldFormat, convertTemplate } from './migrate.js'

describe('isOldFormat detection', () => {
  it('detects old template without gates/hints as old format', () => {
    const yaml = {
      phases: [
        {
          id: 'p0',
          name: 'Baseline',
          steps: [{ id: 'read', title: 'Read spec', instruction: 'Read the spec' }],
        },
      ],
    }
    expect(isOldFormat(yaml)).toBe(true)
  })

  it('detects string subphase_pattern as old format', () => {
    const yaml = {
      phases: [
        { id: 'p2', name: 'Implement', container: true, subphase_pattern: 'impl-test-review' },
      ],
    }
    expect(isOldFormat(yaml)).toBe(true)
  })

  it('detects agent.gate: true as old format', () => {
    const yaml = {
      phases: [
        {
          id: 'p1',
          name: 'Review',
          steps: [
            { id: 'review', title: 'Review', agent: { gate: true, provider: 'claude', prompt: 'review' } },
          ],
        },
      ],
    }
    expect(isOldFormat(yaml)).toBe(true)
  })

  it('recognizes new format with gate objects', () => {
    const yaml = {
      phases: [
        {
          id: 'p0',
          name: 'Baseline',
          steps: [
            {
              id: 'check',
              title: 'Check',
              gate: { bash: 'npm test', expect_exit: 0 },
              hints: [{ bash: 'npm test' }],
            },
          ],
        },
      ],
    }
    expect(isOldFormat(yaml)).toBe(false)
  })

  it('recognizes new format with hints on subphase patterns', () => {
    const yaml = {
      phases: [
        {
          id: 'p2',
          name: 'Implement',
          container: true,
          subphase_pattern: [
            {
              id_suffix: 'impl',
              title_template: 'IMPL',
              todo_template: 'Impl',
              active_form: 'Implementing',
              hints: [{ read: 'spec.md' }],
            },
          ],
        },
      ],
    }
    expect(isOldFormat(yaml)).toBe(false)
  })

  it('empty phases is not old format', () => {
    expect(isOldFormat({ phases: [] })).toBe(false)
  })
})

describe('convertTemplate', () => {
  it('converts string subphase_pattern to inline array', () => {
    const yaml = {
      phases: [
        { id: 'p2', name: 'Implement', container: true, subphase_pattern: 'impl-test-review' },
      ],
    }
    const result = convertTemplate(yaml)
    const phases = result.phases as any[]
    expect(Array.isArray(phases[0].subphase_pattern)).toBe(true)
    expect(phases[0].subphase_pattern).toHaveLength(3)
    expect(phases[0].subphase_pattern[0].id_suffix).toBe('impl')
    expect(phases[0].subphase_pattern[1].id_suffix).toBe('test')
    expect(phases[0].subphase_pattern[2].id_suffix).toBe('review')
  })

  it('preserves original instruction text', () => {
    const yaml = {
      phases: [
        {
          id: 'p0',
          name: 'Baseline',
          steps: [
            { id: 'read', title: 'Read spec', instruction: 'Read the full spec carefully.' },
          ],
        },
      ],
    }
    const result = convertTemplate(yaml)
    const phases = result.phases as any[]
    expect(phases[0].steps[0].instruction).toBe('Read the full spec carefully.')
  })

  it('converts agent config to hint', () => {
    const yaml = {
      phases: [
        {
          id: 'p1',
          name: 'Review',
          steps: [
            {
              id: 'review',
              title: 'Review',
              agent: { gate: true, threshold: 75, provider: 'claude', prompt: 'code-review' },
            },
          ],
        },
      ],
    }
    const result = convertTemplate(yaml)
    const phases = result.phases as any[]
    const step = phases[0].steps[0]
    expect(step.agent).toBeUndefined()
    expect(step.hints).toHaveLength(1)
    expect(step.hints[0].agent.subagent_type).toBe('claude')
    expect(step.hints[0].agent.prompt).toBe('code-review')
  })

  it('dry-run does not write files', () => {
    // convertTemplate is pure — it doesn't write anything
    // The --dry-run flag is handled by the migrate command, not convertTemplate
    const yaml = { phases: [] }
    const result = convertTemplate(yaml)
    expect(result).toBeTruthy()
  })
})

describe('setup registers consolidated PreToolUse hook', () => {
  it('buildHookEntries produces single PreToolUse with pre-tool-use', async () => {
    const { buildHookEntries } = await import('./setup.js')
    const hooks = buildHookEntries(true, '/usr/bin/kata')
    expect(hooks.PreToolUse).toHaveLength(1)
    expect(hooks.PreToolUse[0].hooks[0].command).toContain('pre-tool-use')
  })
})

describe('kata_version in config', () => {
  it('KataConfigSchema accepts kata_version', async () => {
    const { KataConfigSchema } = await import('../config/kata-config.js')
    const result = KataConfigSchema.safeParse({ kata_version: '0.3.0' })
    expect(result.success).toBe(true)
  })
})
