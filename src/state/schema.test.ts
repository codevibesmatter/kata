import { describe, it, expect } from 'bun:test'
import { STOP_CONDITION_TYPES, VALID_CATEGORIES } from './schema.js'
import { KataModeConfigSchema } from '../config/kata-config.js'

describe('STOP_CONDITION_TYPES', () => {
  it('contains expected conditions', () => {
    expect(STOP_CONDITION_TYPES).toContain('tasks_complete')
    expect(STOP_CONDITION_TYPES).toContain('committed')
    expect(STOP_CONDITION_TYPES).toContain('pushed')
    expect(STOP_CONDITION_TYPES).toContain('tests_pass')
    expect(STOP_CONDITION_TYPES).toContain('feature_tests_added')
    expect(STOP_CONDITION_TYPES).toContain('spec_valid')
    expect(STOP_CONDITION_TYPES).toContain('doc_created')
  })
})

describe('VALID_CATEGORIES', () => {
  it('contains expected categories', () => {
    expect(VALID_CATEGORIES).toContain('planning')
    expect(VALID_CATEGORIES).toContain('implementation')
    expect(VALID_CATEGORIES).toContain('investigation')
    expect(VALID_CATEGORIES).toContain('management')
    expect(VALID_CATEGORIES).toContain('special')
    expect(VALID_CATEGORIES).toContain('system')
  })

  it('is importable from schema.ts', () => {
    expect(VALID_CATEGORIES.length).toBeGreaterThan(0)
  })
})

describe('KataModeConfigSchema stop_conditions validation', () => {
  const validMode = {
    template: 'test.md',
  }

  it('accepts valid stop conditions', () => {
    const data = {
      ...validMode,
      stop_conditions: ['tasks_complete', 'committed'],
    }

    const result = KataModeConfigSchema.safeParse(data)
    expect(result.success).toBe(true)
  })

  it('rejects unknown stop condition strings', () => {
    const data = {
      ...validMode,
      stop_conditions: ['tasks_complete', 'bogus'],
    }

    const result = KataModeConfigSchema.safeParse(data)
    expect(result.success).toBe(false)
  })

  it('accepts empty stop_conditions', () => {
    const data = {
      ...validMode,
      stop_conditions: [],
    }

    const result = KataModeConfigSchema.safeParse(data)
    expect(result.success).toBe(true)
  })
})

describe('KataModeConfigSchema does not have removed fields', () => {
  it('does not include strong_signals in schema shape', () => {
    const shape = KataModeConfigSchema.shape
    expect('strong_signals' in shape).toBe(false)
  })

  it('does not include behavior in schema shape', () => {
    const shape = KataModeConfigSchema.shape
    expect('behavior' in shape).toBe(false)
  })

  it('does not include category in schema shape', () => {
    const shape = KataModeConfigSchema.shape
    expect('category' in shape).toBe(false)
  })

  it('does not include notes_file_template in schema shape', () => {
    const shape = KataModeConfigSchema.shape
    expect('notes_file_template' in shape).toBe(false)
  })
})

describe('KataModeConfigSchema kept fields', () => {
  it('accepts issue_label', () => {
    const data = {
      template: 'test.md',
      issue_label: 'bug',
    }

    const result = KataModeConfigSchema.safeParse(data)
    expect(result.success).toBe(true)
  })

  it('accepts issue_handling', () => {
    const data = {
      template: 'test.md',
      issue_handling: 'required',
    }

    const result = KataModeConfigSchema.safeParse(data)
    expect(result.success).toBe(true)
  })
})
