import { describe, it, expect } from 'bun:test'
import {
  InterviewCategorySchema,
  InterviewRoundSchema,
  loadInterviewCategory,
  listCategories,
} from './interview.js'

describe('interview config parsing', () => {
  it('parses interview YAML config with rounds and options', () => {
    const result = InterviewCategorySchema.safeParse({
      name: 'Requirements',
      description: 'Clarify scope',
      rounds: [
        {
          header: 'Problem',
          question: 'What problem does this solve?',
          options: [
            { label: 'Performance', description: 'Too slow' },
            { label: 'Missing feature' },
          ],
        },
      ],
    })
    expect(result.success).toBe(true)
  })

  it('parses round with freeform flag', () => {
    const result = InterviewRoundSchema.safeParse({
      header: 'Happy Path',
      question: 'Describe the workflow',
      freeform: true,
    })
    expect(result.success).toBe(true)
  })

  it('parses round with multiSelect', () => {
    const result = InterviewRoundSchema.safeParse({
      header: 'Test Types',
      question: 'What tests?',
      options: [{ label: 'Unit' }, { label: 'Integration' }],
      multiSelect: true,
    })
    expect(result.success).toBe(true)
  })

  it('rejects category without rounds', () => {
    const result = InterviewCategorySchema.safeParse({
      name: 'Empty',
      rounds: [],
    })
    expect(result.success).toBe(false)
  })
})

describe('loadInterviewCategory', () => {
  it('loads requirements category from batteries', () => {
    const config = loadInterviewCategory('requirements')
    expect(config.name).toBe('Requirements')
    expect(config.rounds.length).toBeGreaterThan(0)
  })

  it('loads architecture category from batteries', () => {
    const config = loadInterviewCategory('architecture')
    expect(config.name).toBe('Architecture')
  })

  it('loads testing category from batteries', () => {
    const config = loadInterviewCategory('testing')
    expect(config.name).toBe('Testing Strategy')
  })

  it('loads design category from batteries', () => {
    const config = loadInterviewCategory('design')
    expect(config.name).toBe('UI Design')
  })

  it('throws for unknown category', () => {
    expect(() => loadInterviewCategory('nonexistent')).toThrow('Unknown interview category')
  })
})

describe('listCategories', () => {
  it('lists all battery categories', () => {
    const cats = listCategories()
    expect(cats).toContain('requirements')
    expect(cats).toContain('architecture')
    expect(cats).toContain('testing')
    expect(cats).toContain('design')
  })
})

describe('interview structured output', () => {
  it('loadInterviewCategory returns structured answers template', () => {
    const config = loadInterviewCategory('requirements')
    const answers = config.rounds.map(round => ({
      header: round.header,
      question: round.question,
      answer: '',
    }))
    expect(answers.length).toBeGreaterThan(0)
    expect(answers[0].header).toBeTruthy()
    expect(answers[0].question).toBeTruthy()
  })
})
