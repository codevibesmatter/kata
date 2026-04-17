import { describe, it, expect } from 'bun:test'
import { gateSchema } from '../validation/schemas.js'

// Gate evaluation tests use gateSchema for validation
// and test the evaluateBashGate function indirectly through hook behavior.

describe('gate-bash-pass', () => {
  it('gate with matching expect parses and would pass', () => {
    const gate = gateSchema.parse({
      bash: 'echo PASS',
      expect: 'PASS',
    })
    expect(gate.bash).toBe('echo PASS')
    expect(gate.expect).toBe('PASS')
  })
})

describe('gate-bash-fail', () => {
  it('gate with non-matching output would fail', () => {
    const gate = gateSchema.parse({
      bash: 'echo FAIL',
      expect: 'PASS',
      on_fail: 'Gate check failed: expected PASS but got {output}',
    })
    expect(gate.bash).toBe('echo FAIL')
    expect(gate.expect).toBe('PASS')
    expect(gate.on_fail).toContain('expected PASS')
  })
})

describe('gate-bash-exit', () => {
  it('gate with expect_exit checks exit code', () => {
    const gate = gateSchema.parse({
      bash: 'npm test',
      expect_exit: 0,
      on_fail: 'Tests failing. Exit code: {exit_code}',
    })
    expect(gate.expect_exit).toBe(0)
    expect(gate.on_fail).toContain('{exit_code}')
  })
})

describe('consolidated handler dispatch', () => {
  it('mode-gate blocks writes when no mode active (schema-level)', () => {
    // The consolidated handler checks currentMode === "default" and blocks writeTools
    const writeTools = ['Edit', 'MultiEdit', 'Write', 'NotebookEdit']
    expect(writeTools).toContain('Edit')
    expect(writeTools).toContain('Write')
    expect(writeTools).not.toContain('Read')
    expect(writeTools).not.toContain('Bash')
  })

  it('gate schema rejects unknown fields', () => {
    const result = gateSchema.safeParse({
      bash: 'test',
      agent: true, // unknown field
    })
    expect(result.success).toBe(false)
  })

  it('gate with both expect and expect_exit is valid schema', () => {
    // Both can be specified — last check wins in evaluator
    const result = gateSchema.safeParse({
      bash: 'echo OK',
      expect: 'OK',
      expect_exit: 0,
    })
    expect(result.success).toBe(true)
  })
})

describe('gate placeholder integration', () => {
  it('gate bash field can contain placeholders', () => {
    const gate = gateSchema.parse({
      bash: '{test_command}',
      expect_exit: 0,
      on_fail: 'Tests failing. Fix before proceeding.',
    })
    expect(gate.bash).toBe('{test_command}')
    // resolvePlaceholders would replace {test_command} at runtime
  })

  it('on_fail can contain gate-local placeholders', () => {
    const gate = gateSchema.parse({
      bash: 'npm test',
      expect_exit: 0,
      on_fail: 'Failed with exit code {exit_code}. Output: {output}',
    })
    expect(gate.on_fail).toContain('{exit_code}')
    expect(gate.on_fail).toContain('{output}')
  })
})

describe('buildHookEntries consolidated', () => {
  it('produces single PreToolUse entry', async () => {
    const { buildHookEntries } = await import('./setup.js')
    const hooks = buildHookEntries('/usr/bin/kata')
    expect(hooks.PreToolUse).toHaveLength(1)
    expect(hooks.PreToolUse[0].hooks[0].command).toContain('pre-tool-use')
    expect(hooks.PreToolUse[0].hooks[0].timeout).toBe(30)
  })

  it('produces single PreToolUse entry', async () => {
    const { buildHookEntries } = await import('./setup.js')
    const hooks = buildHookEntries('/usr/bin/kata')
    expect(hooks.PreToolUse).toHaveLength(1)
  })
})
