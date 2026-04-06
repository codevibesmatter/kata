import { describe, it, expect } from 'bun:test'
import {
  gateSchema,
  hintSchema,
  phaseStepSchema,
  subphasePatternSchema,
  agentStepConfigSchema,
  templateYamlSchema,
} from './schemas.js'

describe('gateSchema', () => {
  it('parses gate with bash/expect', () => {
    const result = gateSchema.safeParse({
      bash: 'echo PASS',
      expect: 'PASS',
    })
    expect(result.success).toBe(true)
  })

  it('parses gate with bash/expect_exit', () => {
    const result = gateSchema.safeParse({
      bash: 'npm test',
      expect_exit: 0,
    })
    expect(result.success).toBe(true)
  })

  it('parses gate with on_fail message', () => {
    const result = gateSchema.safeParse({
      bash: 'npm test',
      expect_exit: 0,
      on_fail: 'Tests failing. Fix before proceeding.',
    })
    expect(result.success).toBe(true)
  })

  it('rejects empty bash command', () => {
    const result = gateSchema.safeParse({ bash: '' })
    expect(result.success).toBe(false)
  })

  it('rejects unknown keys (strict mode)', () => {
    const result = gateSchema.safeParse({
      bash: 'echo test',
      unknown_field: true,
    })
    expect(result.success).toBe(false)
  })

  it('requires bash field', () => {
    const result = gateSchema.safeParse({ expect: 'PASS' })
    expect(result.success).toBe(false)
  })
})

describe('hintSchema', () => {
  it('parses all six hint types', () => {
    const hints = [
      { read: 'README.md' },
      { read: 'spec.md', section: '## Phase 1' },
      { bash: 'git status' },
      { search: 'handleAuth', glob: 'src/**/*.ts' },
      { agent: { subagent_type: 'Explore', prompt: 'Find patterns' } },
      { skill: 'interview', args: 'requirements' },
      { ask: { question: 'Ready?', options: [{ label: 'Yes' }] } },
    ]

    for (const hint of hints) {
      const result = hintSchema.safeParse(hint)
      expect(result.success).toBe(true)
    }
  })

  it('parses read hint without section', () => {
    const result = hintSchema.safeParse({ read: 'file.ts' })
    expect(result.success).toBe(true)
  })

  it('parses search hint without glob', () => {
    const result = hintSchema.safeParse({ search: 'function foo' })
    expect(result.success).toBe(true)
  })

  it('parses skill hint without args', () => {
    const result = hintSchema.safeParse({ skill: 'interview' })
    expect(result.success).toBe(true)
  })

  it('parses ask hint with multiSelect', () => {
    const result = hintSchema.safeParse({
      ask: {
        question: 'Pick frameworks',
        options: [{ label: 'React' }, { label: 'Vue' }],
        multiSelect: true,
      },
    })
    expect(result.success).toBe(true)
  })

  it('rejects empty read path', () => {
    const result = hintSchema.safeParse({ read: '' })
    expect(result.success).toBe(false)
  })

  it('rejects empty bash command', () => {
    const result = hintSchema.safeParse({ bash: '' })
    expect(result.success).toBe(false)
  })
})

describe('phaseStepSchema with gate and hints', () => {
  it('parses step with gate', () => {
    const result = phaseStepSchema.safeParse({
      id: 'check',
      title: 'Run check',
      gate: { bash: 'npm test', expect_exit: 0 },
    })
    expect(result.success).toBe(true)
  })

  it('parses step with hints', () => {
    const result = phaseStepSchema.safeParse({
      id: 'research',
      title: 'Research codebase',
      hints: [
        { read: 'README.md' },
        { search: 'handleAuth' },
      ],
    })
    expect(result.success).toBe(true)
  })

  it('parses step with gate, hints, and instruction', () => {
    const result = phaseStepSchema.safeParse({
      id: 'test',
      title: 'Run tests',
      instruction: 'Run the test suite',
      gate: { bash: '{test_command}', expect_exit: 0, on_fail: 'Tests failing' },
      hints: [{ bash: 'npm test' }],
    })
    expect(result.success).toBe(true)
  })

  it('parses step without gate or hints (backwards compat)', () => {
    const result = phaseStepSchema.safeParse({
      id: 'basic',
      title: 'Basic step',
      instruction: 'Do the thing',
    })
    expect(result.success).toBe(true)
  })
})

describe('subphasePatternSchema with gate and hints', () => {
  it('parses pattern with gate', () => {
    const result = subphasePatternSchema.safeParse({
      id_suffix: 'test',
      title_template: 'TEST - {phase_name}',
      todo_template: 'Test {phase_name}',
      active_form: 'Testing {phase_name}',
      depends_on_previous: true,
      gate: { bash: '{test_command}', expect_exit: 0 },
    })
    expect(result.success).toBe(true)
  })

  it('parses pattern with hints', () => {
    const result = subphasePatternSchema.safeParse({
      id_suffix: 'impl',
      title_template: 'IMPL - {task_summary}',
      todo_template: 'Implement {task_summary}',
      active_form: 'Implementing {phase_name}',
      hints: [{ read: '{spec_path}', section: '## Phase {phase_label}' }],
    })
    expect(result.success).toBe(true)
  })
})

describe('skill fields (issue #42)', () => {
  it('phaseStepSchema accepts optional skill field', () => {
    const result = phaseStepSchema.safeParse({
      id: 's1',
      title: 'Step with skill',
      skill: 'tdd',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.skill).toBe('tdd')
    }
  })

  it('phaseStepSchema parses without skill (backwards compat)', () => {
    const result = phaseStepSchema.safeParse({
      id: 's2',
      title: 'Step without skill',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.skill).toBeUndefined()
    }
  })

  it('subphasePatternSchema accepts optional skill field', () => {
    const result = subphasePatternSchema.safeParse({
      id_suffix: 'impl',
      title_template: 'IMPL - {task_summary}',
      todo_template: 'Implement {task_summary}',
      active_form: 'Implementing {phase_name}',
      skill: 'implementation',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.skill).toBe('implementation')
    }
  })

  it('templateYamlSchema accepts optional mode_skill field', () => {
    const result = templateYamlSchema.safeParse({
      id: 'task',
      mode: 'task',
      mode_skill: 'task',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.mode_skill).toBe('task')
    }
  })

  it('templateYamlSchema parses without mode_skill (backwards compat)', () => {
    const result = templateYamlSchema.safeParse({
      id: 'freeform',
      mode: 'freeform',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.mode_skill).toBeUndefined()
    }
  })
})

describe('agentStepConfigSchema no longer has gate/threshold', () => {
  it('does not have gate field', () => {
    expect('gate' in agentStepConfigSchema.shape).toBe(false)
  })

  it('does not have threshold field', () => {
    expect('threshold' in agentStepConfigSchema.shape).toBe(false)
  })
})
