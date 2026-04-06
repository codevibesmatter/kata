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

describe('implementation.md has gates', () => {
  it('has gate on baseline read-spec step', () => {
    const path = join(batteriesDir, 'implementation.md')
    const result = parseTemplateYaml(path)
    const p0 = result?.phases?.find(p => p.id === 'p0')
    const readSpec = p0?.steps?.find(s => s.id === 'read-spec')
    expect(readSpec?.gate).toBeTruthy()
    expect(readSpec?.gate?.bash).toContain('spec_path')
  })

  it('has gate on impl subphase pattern', () => {
    const path = join(batteriesDir, 'implementation.md')
    const result = parseTemplateYaml(path)
    const p2 = result?.phases?.find(p => p.id === 'p2')
    expect(Array.isArray(p2?.subphase_pattern)).toBe(true)
    const patterns = p2!.subphase_pattern as Array<{ id_suffix: string; gate?: { expect_exit?: number } }>
    const implPattern = patterns.find(p => p.id_suffix === 'impl')
    expect(implPattern?.gate).toBeTruthy()
    expect(implPattern?.gate?.expect_exit).toBe(0)
  })
})

describe('planning.md has skill hints', () => {
  it('interview steps reference /interview skill in hints', () => {
    const path = join(batteriesDir, 'planning.md')
    const result = parseTemplateYaml(path)

    // Find steps with skill hints
    const allSteps = result?.phases?.flatMap(p => p.steps ?? []) ?? []
    const skillHintSteps = allSteps.filter(s =>
      s.hints?.some((h: any) => 'skill' in h && h.skill === 'interview')
    )

    // Should have at least requirements interview
    expect(skillHintSteps.length).toBeGreaterThanOrEqual(1)
  })
})

describe('skill resolution: every referenced skill has a SKILL.md', () => {
  for (const name of templates) {
    it(`${name}.md — mode_skill resolves to batteries/skills/{name}/SKILL.md`, () => {
      const path = join(batteriesDir, `${name}.md`)
      const result = parseTemplateYaml(path)
      if (result?.mode_skill) {
        const skillPath = join(skillsDir, result.mode_skill, 'SKILL.md')
        expect(existsSync(skillPath)).toBe(true)
      }
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
