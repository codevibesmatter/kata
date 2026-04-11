import { describe, it, expect } from 'bun:test'
import { phaseSchema, subphasePatternSchema } from './schemas.js'

describe('inline subphase parsing', () => {
  it('parses template with inline subphase_pattern array', () => {
    const result = phaseSchema.safeParse({
      id: 'p2',
      name: 'Implement',
      stage: 'work',
      expansion: 'spec',
      subphase_pattern: [
        {
          id_suffix: 'impl',
          title_template: 'IMPL - {task_summary}',
          todo_template: 'Implement {task_summary}',
          active_form: 'Implementing {phase_name}',
          labels: ['impl'],
        },
        {
          id_suffix: 'test',
          title_template: 'TEST - {phase_name}',
          todo_template: 'Test {phase_name}',
          active_form: 'Testing {phase_name}',
          depends_on_previous: true,
        },
        {
          id_suffix: 'review',
          title_template: 'REVIEW - {reviewers}',
          todo_template: 'Review {phase_name}',
          active_form: 'Reviewing {phase_name}',
          depends_on_previous: true,
        },
      ],
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.subphase_pattern).toHaveLength(3)
    }
  })

  it('rejects string subphase_pattern reference', () => {
    const result = phaseSchema.safeParse({
      id: 'p2',
      name: 'Implement',
      stage: 'work',
      expansion: 'spec',
      subphase_pattern: 'impl-test-review',
    })
    expect(result.success).toBe(false)
  })

  it('accepts phase without subphase_pattern', () => {
    const result = phaseSchema.safeParse({
      id: 'p0',
      name: 'Baseline',
      stage: 'setup',
    })
    expect(result.success).toBe(true)
  })

  it('parses subphase pattern with gate and hints', () => {
    const result = subphasePatternSchema.safeParse({
      id_suffix: 'test',
      title_template: 'TEST - {phase_name}',
      todo_template: 'Test {phase_name}',
      active_form: 'Testing {phase_name}',
      depends_on_previous: true,
      gate: {
        bash: '{test_command}',
        expect_exit: 0,
        on_fail: 'Tests failing.',
      },
      hints: [{ bash: 'npm test' }],
    })
    expect(result.success).toBe(true)
  })
})

describe('buildSpecTasks with inline subphases', () => {
  it('creates correct tasks from inline subphases', async () => {
    const { buildSpecTasks } = await import('../commands/enter/task-factory.js')

    const specPhases = [
      { id: 'p1', name: 'Schema changes', tasks: ['Add gateSchema', 'Add hintSchema'] },
      { id: 'p2', name: 'Hook consolidation', tasks: ['Consolidate PreToolUse'] },
    ]

    const subphasePattern = [
      {
        id_suffix: 'impl',
        title_template: 'IMPL - {task_summary}',
        todo_template: 'Implement {task_summary}',
        active_form: 'Implementing {phase_name}',
        labels: ['impl'] as string[],
      },
      {
        id_suffix: 'test',
        title_template: 'TEST - {phase_name}',
        todo_template: 'Test {phase_name}',
        active_form: 'Testing {phase_name}',
        labels: ['test'] as string[],
        depends_on_previous: true,
      },
      {
        id_suffix: 'review',
        title_template: 'REVIEW - review-agent',
        todo_template: 'Review {phase_name}',
        active_form: 'Reviewing {phase_name}',
        labels: ['review'] as string[],
        depends_on_previous: true,
      },
    ]

    const tasks = buildSpecTasks(specPhases, 37, subphasePattern, 2)

    // 2 spec phases x 3 subphases = 6 tasks
    expect(tasks).toHaveLength(6)

    // Check task IDs
    expect(tasks[0].id).toBe('p2.1:impl')
    expect(tasks[1].id).toBe('p2.1:test')
    expect(tasks[2].id).toBe('p2.1:review')
    expect(tasks[3].id).toBe('p2.2:impl')
    expect(tasks[4].id).toBe('p2.2:test')
    expect(tasks[5].id).toBe('p2.2:review')

    // Check dependency chains
    expect(tasks[0].depends_on).toEqual([]) // first impl has no deps
    expect(tasks[1].depends_on).toEqual(['p2.1:impl']) // test depends on impl
    expect(tasks[2].depends_on).toEqual(['p2.1:test']) // review depends on test
    expect(tasks[3].depends_on).toEqual(['p2.1:review']) // next phase impl depends on prev phase review
    expect(tasks[4].depends_on).toEqual(['p2.2:impl'])
    expect(tasks[5].depends_on).toEqual(['p2.2:test'])
  })
})
