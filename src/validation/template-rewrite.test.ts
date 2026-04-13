import { describe, it, expect } from 'bun:test'
import { join } from 'node:path'
import { existsSync } from 'node:fs'
import { templateYamlSchema } from './schemas.js'

// Use dynamic import to get parseTemplateYaml
const { parseTemplateYaml } = await import('../commands/enter/template.js')

const batteriesDir = join(import.meta.dir, '../../batteries/templates')
const skillsDir = join(import.meta.dir, '../../batteries/skills')

const templates = [
  'implementation',
  'planning',
  'task',
  'research',
  'freeform',
  'verify',
  'debug',
  'stop-hook-test',
]

describe('all templates parse against templateYamlSchema', () => {
  for (const name of templates) {
    it(`${name}.md validates against Zod schema`, () => {
      const path = join(batteriesDir, `${name}.md`)
      const raw = parseTemplateYaml(path)
      expect(raw).toBeTruthy()
      // Validate against Zod schema — this catches missing/invalid gate/hint fields
      const result = templateYamlSchema.safeParse(raw)
      expect(result.success).toBe(true)
    })
  }
})

describe('implementation.md has inline steps and gates', () => {
  it('has read-spec step with inline title in p0', () => {
    const path = join(batteriesDir, 'implementation.md')
    const result = parseTemplateYaml(path)
    const p0 = result?.phases?.find(p => p.id === 'p0')
    const readSpec = p0?.steps?.find(s => s.id === 'read-spec')
    expect(readSpec?.title).toBeTruthy()
    expect(readSpec?.instruction).toBeTruthy()
  })

  it('has gate on final-checks step in close phase', () => {
    const path = join(batteriesDir, 'implementation.md')
    const result = parseTemplateYaml(path)
    const p3 = result?.phases?.find(p => p.id === 'p3')
    const finalChecks = p3?.steps?.find(s => s.id === 'final-checks')
    expect(finalChecks?.gate).toBeTruthy()
    expect(finalChecks?.gate?.expect_exit).toBe(0)
  })

  it('has subphase_pattern on p1 with expansion: spec', () => {
    const path = join(batteriesDir, 'implementation.md')
    const result = parseTemplateYaml(path)
    const p1 = result?.phases?.find(p => p.id === 'p1')
    expect(p1?.expansion).toBe('spec')
    expect(Array.isArray(p1?.subphase_pattern)).toBe(true)
  })
})

describe('planning.md has phase-level skill references', () => {
  it('has research skill on p0 phase', () => {
    const path = join(batteriesDir, 'planning.md')
    const result = parseTemplateYaml(path)

    const p0 = result?.phases?.find(p => p.id === 'p0')
    expect(p0?.skill).toBe('research')
  })

  it('has spec-writing skill on p2 phase', () => {
    const path = join(batteriesDir, 'planning.md')
    const result = parseTemplateYaml(path)

    const p2 = result?.phases?.find(p => p.id === 'p2')
    expect(p2?.skill).toBe('spec-writing')
  })
})

describe('skill resolution: every referenced skill has a SKILL.md', () => {
  for (const name of templates) {
    it(`${name}.md — no mode_skill field present`, () => {
      const path = join(batteriesDir, `${name}.md`)
      const result = parseTemplateYaml(path)
      expect((result as any)?.mode_skill).toBeUndefined()
    })

    it(`${name}.md — all step-level skill: refs resolve`, () => {
      const path = join(batteriesDir, `${name}.md`)
      const result = parseTemplateYaml(path)
      const allSteps = result?.phases?.flatMap(p => p.steps ?? []) ?? []
      for (const step of allSteps) {
        if (step.skill) {
          const skillPath = join(skillsDir, step.skill, 'SKILL.md')
          expect(existsSync(skillPath)).toBe(true)
        }
        // Also check skill hints
        if (step.hints) {
          for (const hint of step.hints) {
            if ('skill' in (hint as any) && (hint as any).skill) {
              const skillPath = join(skillsDir, (hint as any).skill, 'SKILL.md')
              expect(existsSync(skillPath)).toBe(true)
            }
          }
        }
      }
    })

    it(`${name}.md — all subphase_pattern skill: refs resolve`, () => {
      const path = join(batteriesDir, `${name}.md`)
      const result = parseTemplateYaml(path)
      const patterns = result?.phases?.flatMap(p =>
        Array.isArray(p.subphase_pattern) ? p.subphase_pattern : []
      ) ?? []
      for (const pattern of patterns) {
        if ((pattern as any).skill) {
          const skillPath = join(skillsDir, (pattern as any).skill, 'SKILL.md')
          expect(existsSync(skillPath)).toBe(true)
        }
      }
    })
  }
})
