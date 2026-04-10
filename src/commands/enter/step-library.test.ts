import { describe, it, expect } from 'bun:test'
import { resolveStepRef } from './step-library.js'

describe('resolveStepRef', () => {
  const library = {
    'env-check': { title: 'Verify environment', instruction: 'Run git status' },
    'commit-push': { title: 'Commit and push', instruction: 'git add . && git commit -m "{message}"', skill: 'code-impl' },
  }

  it('resolves $ref with title from definition', () => {
    const result = resolveStepRef('env-check', { id: 'env-check' }, library)
    expect(result.title).toBe('Verify environment')
    expect(result.instruction).toBe('Run git status')
  })

  it('local title overrides definition title', () => {
    const result = resolveStepRef('env-check', { id: 'check', title: 'Custom title' }, library)
    expect(result.title).toBe('Custom title')
  })

  it('applies vars substitution', () => {
    const result = resolveStepRef('commit-push', { id: 'cp', vars: { message: 'feat: done' } }, library)
    expect(result.instruction).toContain('feat: done')
    expect(result.instruction).not.toContain('{message}')
  })

  it('throws on missing step ID', () => {
    expect(
      () => resolveStepRef('nonexistent', { id: 'test' }, library),
    ).toThrow(/does not exist in .kata\/steps.yaml/)
  })

  it('inherits skill from definition', () => {
    const result = resolveStepRef('commit-push', { id: 'cp', vars: { message: 'x' } }, library)
    expect(result.skill).toBe('code-impl')
  })

  it('local skill overrides definition skill', () => {
    const result = resolveStepRef('commit-push', { id: 'cp', skill: 'test-protocol', vars: { message: 'x' } }, library)
    expect(result.skill).toBe('test-protocol')
  })
})
