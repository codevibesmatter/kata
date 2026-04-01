import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import * as os from 'node:os'
import jsYaml from 'js-yaml'
import {
  loadSubphasePatterns,
  clearSubphasePatternCache,
  SubphasePatternConfigSchema,
  SubphasePatternDefinitionSchema,
} from './subphase-patterns.js'
import { subphasePatternSchema } from '../validation/schemas.js'

function makeTmpDir(label: string): string {
  const dir = join(
    os.tmpdir(),
    `wm-subphase-test-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  )
  mkdirSync(dir, { recursive: true })
  return dir
}

function writeSubphasePatternsYaml(dir: string, config: Record<string, unknown>): string {
  const filePath = join(dir, 'subphase-patterns.yaml')
  writeFileSync(filePath, jsYaml.dump(config))
  return filePath
}

// ── Schema validation ──

describe('subphasePatternSchema (step-level)', () => {
  it('accepts valid step', () => {
    const result = subphasePatternSchema.safeParse({
      id_suffix: 'impl',
      title_template: 'IMPL - {task_summary}',
      todo_template: 'Implement {task_summary}',
      active_form: 'Implementing {phase_name}',
      labels: ['impl'],
    })
    expect(result.success).toBe(true)
  })

  it('rejects empty id_suffix', () => {
    const result = subphasePatternSchema.safeParse({
      id_suffix: '',
      title_template: 'IMPL',
      todo_template: 'Implement',
      active_form: 'Implementing',
    })
    expect(result.success).toBe(false)
  })

  it('defaults labels to empty array', () => {
    const result = subphasePatternSchema.safeParse({
      id_suffix: 'impl',
      title_template: 'IMPL',
      todo_template: 'Implement',
      active_form: 'Implementing',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.labels).toEqual([])
    }
  })

  it('accepts depends_on_previous', () => {
    const result = subphasePatternSchema.safeParse({
      id_suffix: 'verify',
      title_template: 'VERIFY',
      todo_template: 'Verify',
      active_form: 'Verifying',
      depends_on_previous: true,
    })
    expect(result.success).toBe(true)
  })

  it('accepts instruction field', () => {
    const result = subphasePatternSchema.safeParse({
      id_suffix: 'verify',
      title_template: 'VERIFY',
      todo_template: 'Verify',
      active_form: 'Verifying',
      instruction: 'Run: kata check-phase {phase_label} --issue={issue}',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.instruction).toBe('Run: kata check-phase {phase_label} --issue={issue}')
    }
  })

  it('accepts agent field', () => {
    const result = subphasePatternSchema.safeParse({
      id_suffix: 'review',
      title_template: 'REVIEW',
      todo_template: 'Review',
      active_form: 'Reviewing',
      agent: {
        provider: 'codex',
        prompt: 'code-review',
        context: ['git_diff', 'spec'],
        gate: true,
        threshold: 80,
      },
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.agent?.provider).toBe('codex')
      expect(result.data.agent?.prompt).toBe('code-review')
      expect(result.data.agent?.gate).toBe(true)
      expect(result.data.agent?.threshold).toBe(80)
    }
  })

  it('accepts both instruction and agent together', () => {
    const result = subphasePatternSchema.safeParse({
      id_suffix: 'review',
      title_template: 'REVIEW',
      todo_template: 'Review',
      active_form: 'Reviewing',
      instruction: 'Review {phase_name} implementation',
      agent: {
        provider: 'gemini',
        prompt: 'code-review',
      },
    })
    expect(result.success).toBe(true)
  })
})

describe('SubphasePatternDefinitionSchema', () => {
  it('accepts valid definition with steps', () => {
    const result = SubphasePatternDefinitionSchema.safeParse({
      description: 'Implement then verify',
      steps: [
        {
          id_suffix: 'impl',
          title_template: 'IMPL',
          todo_template: 'Implement',
          active_form: 'Implementing',
        },
      ],
    })
    expect(result.success).toBe(true)
  })

  it('rejects empty steps', () => {
    const result = SubphasePatternDefinitionSchema.safeParse({
      description: 'No steps',
      steps: [],
    })
    expect(result.success).toBe(false)
  })

  it('rejects missing description', () => {
    const result = SubphasePatternDefinitionSchema.safeParse({
      steps: [
        {
          id_suffix: 'impl',
          title_template: 'IMPL',
          todo_template: 'Implement',
          active_form: 'Implementing',
        },
      ],
    })
    expect(result.success).toBe(false)
  })
})

describe('SubphasePatternConfigSchema', () => {
  it('accepts valid config with multiple patterns', () => {
    const result = SubphasePatternConfigSchema.safeParse({
      subphase_patterns: {
        'impl-verify': {
          description: 'Implement then verify',
          steps: [
            {
              id_suffix: 'impl',
              title_template: 'IMPL',
              todo_template: 'Implement',
              active_form: 'Implementing',
            },
            {
              id_suffix: 'verify',
              title_template: 'VERIFY',
              todo_template: 'Verify',
              active_form: 'Verifying',
              depends_on_previous: true,
            },
          ],
        },
        'impl-test-verify': {
          description: 'Implement, test, verify',
          steps: [
            {
              id_suffix: 'impl',
              title_template: 'IMPL',
              todo_template: 'Implement',
              active_form: 'Implementing',
            },
            {
              id_suffix: 'test',
              title_template: 'TEST',
              todo_template: 'Test',
              active_form: 'Testing',
              depends_on_previous: true,
            },
            {
              id_suffix: 'verify',
              title_template: 'VERIFY',
              todo_template: 'Verify',
              active_form: 'Verifying',
              depends_on_previous: true,
            },
          ],
        },
      },
    })
    expect(result.success).toBe(true)
  })

  it('rejects config missing subphase_patterns key', () => {
    const result = SubphasePatternConfigSchema.safeParse({ patterns: {} })
    expect(result.success).toBe(false)
  })
})

// ── 2-tier merge loader ──

describe('loadSubphasePatterns 2-tier merge', () => {
  const origProjectDir = process.env.CLAUDE_PROJECT_DIR
  let tmpDirs: string[] = []

  beforeEach(() => {
    clearSubphasePatternCache()
    tmpDirs = []
  })

  afterEach(() => {
    for (const dir of tmpDirs) {
      rmSync(dir, { recursive: true, force: true })
    }
    if (origProjectDir !== undefined) {
      process.env.CLAUDE_PROJECT_DIR = origProjectDir
    } else {
      delete process.env.CLAUDE_PROJECT_DIR
    }
    clearSubphasePatternCache()
  })

  it('loads package config when no project override exists', async () => {
    const tmpDir = makeTmpDir('no-override')
    tmpDirs.push(tmpDir)
    const projDir = join(tmpDir, 'proj')
    mkdirSync(join(projDir, '.claude'), { recursive: true })
    process.env.CLAUDE_PROJECT_DIR = projDir

    const config = await loadSubphasePatterns()
    expect(config.subphase_patterns['impl-verify']).toBeDefined()
    expect(config.subphase_patterns['impl-verify'].steps).toHaveLength(2)
    expect(config.subphase_patterns['impl-verify'].steps[0].id_suffix).toBe('impl')
    expect(config.subphase_patterns['impl-verify'].steps[1].id_suffix).toBe('check')
  })

  it('project config overrides a package pattern', async () => {
    const tmpDir = makeTmpDir('project-override')
    tmpDirs.push(tmpDir)

    const projDir = join(tmpDir, 'proj')
    mkdirSync(join(projDir, '.kata'), { recursive: true })
    writeSubphasePatternsYaml(join(projDir, '.kata'), {
      subphase_patterns: {
        'impl-verify': {
          description: 'Custom impl-verify',
          steps: [
            {
              id_suffix: 'implement',
              title_template: 'CUSTOM IMPL - {task_summary}',
              todo_template: 'Custom implement {task_summary}',
              active_form: 'Custom implementing {phase_name}',
              labels: ['custom'],
            },
          ],
        },
      },
    })
    process.env.CLAUDE_PROJECT_DIR = projDir

    const config = await loadSubphasePatterns()
    // Project override wins
    expect(config.subphase_patterns['impl-verify'].description).toBe('Custom impl-verify')
    expect(config.subphase_patterns['impl-verify'].steps).toHaveLength(1)
    expect(config.subphase_patterns['impl-verify'].steps[0].id_suffix).toBe('implement')
  })

  it('project config adds new patterns', async () => {
    const tmpDir = makeTmpDir('project-add')
    tmpDirs.push(tmpDir)

    const projDir = join(tmpDir, 'proj')
    mkdirSync(join(projDir, '.kata'), { recursive: true })
    writeSubphasePatternsYaml(join(projDir, '.kata'), {
      subphase_patterns: {
        'impl-test-verify': {
          description: 'Implement, test, then verify',
          steps: [
            {
              id_suffix: 'impl',
              title_template: 'IMPL',
              todo_template: 'Implement',
              active_form: 'Implementing',
            },
            {
              id_suffix: 'test',
              title_template: 'TEST',
              todo_template: 'Test',
              active_form: 'Testing',
              depends_on_previous: true,
            },
            {
              id_suffix: 'verify',
              title_template: 'VERIFY',
              todo_template: 'Verify',
              active_form: 'Verifying',
              depends_on_previous: true,
            },
          ],
        },
      },
    })
    process.env.CLAUDE_PROJECT_DIR = projDir

    const config = await loadSubphasePatterns()
    // New pattern added
    expect(config.subphase_patterns['impl-test-verify']).toBeDefined()
    expect(config.subphase_patterns['impl-test-verify'].steps).toHaveLength(3)
    // Package patterns still present
    expect(config.subphase_patterns['impl-verify']).toBeDefined()
  })

  it('handles invalid project subphase-patterns.yaml gracefully', async () => {
    const tmpDir = makeTmpDir('invalid-project')
    tmpDirs.push(tmpDir)

    const projDir = join(tmpDir, 'proj')
    mkdirSync(join(projDir, '.kata'), { recursive: true })
    writeFileSync(
      join(projDir, '.kata', 'subphase-patterns.yaml'),
      'this is not valid yaml: [[[{{{',
    )
    process.env.CLAUDE_PROJECT_DIR = projDir

    // Should not throw — falls back to package defaults
    const config = await loadSubphasePatterns()
    expect(config.subphase_patterns['impl-verify']).toBeDefined()
  })

  it('handles schema-invalid project config gracefully', async () => {
    const tmpDir = makeTmpDir('schema-invalid')
    tmpDirs.push(tmpDir)

    const projDir = join(tmpDir, 'proj')
    mkdirSync(join(projDir, '.kata'), { recursive: true })
    writeSubphasePatternsYaml(join(projDir, '.kata'), {
      subphase_patterns: {
        bad: {
          description: 'Bad pattern',
          // missing steps
        },
      },
    })
    process.env.CLAUDE_PROJECT_DIR = projDir

    // Should not throw — falls back to package defaults
    const config = await loadSubphasePatterns()
    expect(config.subphase_patterns['impl-verify']).toBeDefined()
    // Bad pattern should NOT appear
    expect(config.subphase_patterns.bad).toBeUndefined()
  })

  it('cache returns same instance on repeated calls', async () => {
    const tmpDir = makeTmpDir('cache-hit')
    tmpDirs.push(tmpDir)
    const projDir = join(tmpDir, 'proj')
    mkdirSync(join(projDir, '.claude'), { recursive: true })
    process.env.CLAUDE_PROJECT_DIR = projDir

    const first = await loadSubphasePatterns()
    const second = await loadSubphasePatterns()
    expect(first).toBe(second) // same reference
  })

  it('clearSubphasePatternCache forces fresh load', async () => {
    const tmpDir = makeTmpDir('cache-clear')
    tmpDirs.push(tmpDir)
    const projDir = join(tmpDir, 'proj')
    mkdirSync(join(projDir, '.claude'), { recursive: true })
    process.env.CLAUDE_PROJECT_DIR = projDir

    const first = await loadSubphasePatterns()
    clearSubphasePatternCache()
    const second = await loadSubphasePatterns()
    // Same content but different reference
    expect(first).not.toBe(second)
    expect(first.subphase_patterns['impl-verify'].steps[0].id_suffix).toBe(
      second.subphase_patterns['impl-verify'].steps[0].id_suffix,
    )
  })

  it('loads from .kata/ layout', async () => {
    const tmpDir = makeTmpDir('kata-layout')
    tmpDirs.push(tmpDir)

    const projDir = join(tmpDir, 'proj')
    mkdirSync(join(projDir, '.kata'), { recursive: true })
    writeSubphasePatternsYaml(join(projDir, '.kata'), {
      subphase_patterns: {
        'impl-verify': {
          description: 'Kata layout pattern',
          steps: [
            {
              id_suffix: 'impl',
              title_template: 'KATA IMPL',
              todo_template: 'Kata implement',
              active_form: 'Kata implementing',
            },
          ],
        },
      },
    })
    process.env.CLAUDE_PROJECT_DIR = projDir

    const config = await loadSubphasePatterns()
    expect(config.subphase_patterns['impl-verify'].description).toBe('Kata layout pattern')
  })
})

// ── buildSpecTasks instruction/agent propagation ──

import { buildSpecTasks, extractVerificationPlan, parseVpSteps } from '../commands/enter/task-factory.js'

const sampleSpecPhases = [
  { id: 'auth', name: 'Authentication', tasks: ['Add login endpoint'] },
]

describe('buildSpecTasks instruction/agent propagation', () => {
  it('propagates instruction with placeholder resolution', () => {
    const pattern = [
      {
        id_suffix: 'impl',
        title_template: 'IMPL - {task_summary}',
        todo_template: 'Implement {task_summary}',
        active_form: 'Implementing {phase_name}',
        labels: [],
      },
      {
        id_suffix: 'verify',
        title_template: 'VERIFY - {phase_name}',
        todo_template: 'Verify {phase_name}',
        active_form: 'Verifying {phase_name}',
        labels: [],
        depends_on_previous: true,
        instruction: 'Run: kata check-phase {phase_label} --issue={issue}',
      },
    ]

    const tasks = buildSpecTasks(sampleSpecPhases, 42, pattern)
    const verifyTask = tasks.find((t) => t.id === 'p2.1:verify')
    expect(verifyTask).toBeDefined()
    expect(verifyTask!.instruction).toBe('Run: kata check-phase P2.1 --issue=42')
  })

  it('propagates agent config as kata review command', () => {
    const pattern = [
      {
        id_suffix: 'review',
        title_template: 'REVIEW - {task_summary}',
        todo_template: 'Review {task_summary}',
        active_form: 'Reviewing {phase_name}',
        labels: [],
        agent: {
          provider: 'codex',
          prompt: 'code-review',
          gate: true,
          threshold: 80,
        },
      },
    ]

    const tasks = buildSpecTasks(sampleSpecPhases, 99, pattern)
    expect(tasks).toHaveLength(1)
    expect(tasks[0].instruction).toContain('kata review --prompt=code-review')
    expect(tasks[0].instruction).toContain('--provider=codex')
    expect(tasks[0].instruction).toContain('gate: score >= 80')
  })

  it('combines instruction and agent into single instruction', () => {
    const pattern = [
      {
        id_suffix: 'review',
        title_template: 'REVIEW - {task_summary}',
        todo_template: 'Review {task_summary}',
        active_form: 'Reviewing {phase_name}',
        labels: [],
        instruction: 'Review {phase_name} implementation',
        agent: {
          provider: 'gemini',
          prompt: 'code-review',
        },
      },
    ]

    const tasks = buildSpecTasks(sampleSpecPhases, 1, pattern)
    expect(tasks[0].instruction).toContain('Review Authentication implementation')
    expect(tasks[0].instruction).toContain('kata review --prompt=code-review --provider=gemini')
  })

  it('omits instruction when pattern has neither instruction nor agent', () => {
    const pattern = [
      {
        id_suffix: 'impl',
        title_template: 'IMPL - {task_summary}',
        todo_template: 'Implement {task_summary}',
        active_form: 'Implementing {phase_name}',
        labels: [],
      },
    ]

    const tasks = buildSpecTasks(sampleSpecPhases, 1, pattern)
    expect(tasks[0].instruction).toBeUndefined()
  })
})

// ── extractVerificationPlan ──

describe('extractVerificationPlan', () => {
  it('extracts VP section from spec with content after', () => {
    const spec = [
      '## Overview',
      'Some overview.',
      '',
      '## Verification Plan',
      '',
      '### VP1: Health check',
      'Steps:',
      '1. `curl http://localhost:3000/health`',
      '   Expected: 200 OK',
      '',
      '## Implementation Hints',
      'Some hints.',
    ].join('\n')

    const vp = extractVerificationPlan(spec)
    expect(vp).not.toBeNull()
    expect(vp).toContain('## Verification Plan')
    expect(vp).toContain('### VP1: Health check')
    expect(vp).toContain('curl http://localhost:3000/health')
    expect(vp).not.toContain('Implementation Hints')
  })

  it('extracts VP section at end of file', () => {
    const spec = [
      '## Overview',
      'Some overview.',
      '',
      '## Verification Plan',
      '',
      '### VP1: Smoke test',
      '1. `curl http://localhost:3000`',
      '   Expected: 200',
    ].join('\n')

    const vp = extractVerificationPlan(spec)
    expect(vp).not.toBeNull()
    expect(vp).toContain('### VP1: Smoke test')
  })

  it('returns null when no VP section exists', () => {
    const spec = [
      '## Overview',
      'Some overview.',
      '',
      '## Implementation Hints',
      'Some hints.',
    ].join('\n')

    expect(extractVerificationPlan(spec)).toBeNull()
  })
})

// ── parseVpSteps ──

describe('parseVpSteps', () => {
  it('extracts multiple VP steps from VP content', () => {
    const vpContent = [
      '## Verification Plan',
      '',
      '### VP1: Health check endpoint',
      '',
      'Steps:',
      '1. `curl http://localhost:3000/health`',
      '2. Confirm 200 OK response',
      'Expected: JSON with status "ok"',
      '',
      '### VP2: Login flow works',
      '',
      'Steps:',
      '1. POST /api/login with valid credentials',
      '2. Confirm JWT token returned',
      'Expected: 200 with token',
      '',
      '### VP3: Protected route requires auth',
      '',
      'Steps:',
      '1. GET /api/protected without token',
      '2. Confirm 401 Unauthorized',
      'Expected: 401 response',
    ].join('\n')

    const steps = parseVpSteps(vpContent)
    expect(steps).toHaveLength(3)

    expect(steps[0].id).toBe('VP1')
    expect(steps[0].title).toBe('Health check endpoint')
    expect(steps[0].instruction).toContain('curl http://localhost:3000/health')

    expect(steps[1].id).toBe('VP2')
    expect(steps[1].title).toBe('Login flow works')
    expect(steps[1].instruction).toContain('POST /api/login')

    expect(steps[2].id).toBe('VP3')
    expect(steps[2].title).toBe('Protected route requires auth')
    expect(steps[2].instruction).toContain('401 Unauthorized')
  })

  it('returns empty array when no VP step headings found', () => {
    const vpContent = [
      '## Verification Plan',
      '',
      'Some general verification notes without VP step headings.',
      '',
      'Just text, no ### VPn: sections.',
    ].join('\n')

    const steps = parseVpSteps(vpContent)
    expect(steps).toHaveLength(0)
  })

  it('returns empty array for empty string', () => {
    expect(parseVpSteps('')).toHaveLength(0)
  })

  it('handles single VP step', () => {
    const vpContent = [
      '### VP1: Smoke test',
      '',
      'Steps:',
      '1. `curl http://localhost:3000`',
      'Expected: 200',
    ].join('\n')

    const steps = parseVpSteps(vpContent)
    expect(steps).toHaveLength(1)
    expect(steps[0].id).toBe('VP1')
    expect(steps[0].title).toBe('Smoke test')
    expect(steps[0].instruction).toContain('curl http://localhost:3000')
  })

  it('preserves full instruction content including heading', () => {
    const vpContent = [
      '### VP1: Check API',
      'Line 1',
      'Line 2',
      '',
      '### VP2: Check DB',
      'Line 3',
    ].join('\n')

    const steps = parseVpSteps(vpContent)
    expect(steps[0].instruction).toMatch(/^### VP1: Check API/)
    expect(steps[0].instruction).toContain('Line 1')
    expect(steps[0].instruction).toContain('Line 2')
    expect(steps[0].instruction).not.toContain('Line 3')

    expect(steps[1].instruction).toMatch(/^### VP2: Check DB/)
    expect(steps[1].instruction).toContain('Line 3')
  })

  it('handles non-sequential VP numbers', () => {
    const vpContent = [
      '### VP2: Second step',
      'Content 2',
      '',
      '### VP5: Fifth step',
      'Content 5',
    ].join('\n')

    const steps = parseVpSteps(vpContent)
    expect(steps).toHaveLength(2)
    expect(steps[0].id).toBe('VP2')
    expect(steps[1].id).toBe('VP5')
  })

  it('ignores non-VP headings', () => {
    const vpContent = [
      '### Overview',
      'Some overview text.',
      '',
      '### VP1: Real step',
      'Step content.',
      '',
      '### Notes',
      'Some notes.',
    ].join('\n')

    const steps = parseVpSteps(vpContent)
    expect(steps).toHaveLength(1)
    expect(steps[0].id).toBe('VP1')
    // VP1 content goes up to ### Notes (next heading is not a VP heading,
    // but parseVpSteps splits on ### VPn: only)
    expect(steps[0].instruction).toContain('Step content.')
  })
})

// ── buildSpecTasks VP injection ──

describe('buildSpecTasks verification plan injection', () => {
  const vpPattern = [
    {
      id_suffix: 'impl',
      title_template: 'IMPL - {task_summary}',
      todo_template: 'Implement {task_summary}',
      active_form: 'Implementing {phase_name}',
      labels: [] as string[],
    },
    {
      id_suffix: 'test',
      title_template: 'TEST - {phase_name}',
      todo_template: 'Test {phase_name}',
      active_form: 'Testing {phase_name}',
      labels: [] as string[],
      depends_on_previous: true,
      instruction: 'Run: kata check-phase {phase_label} --issue={issue}',
    },
    {
      id_suffix: 'verify',
      title_template: 'VERIFY - {phase_name}',
      todo_template: 'Verify {phase_name}',
      active_form: 'Verifying {phase_name}',
      labels: [] as string[],
      depends_on_previous: true,
      instruction: 'Execute VP:\n{verification_plan}',
    },
  ]

  it('injects VP content into {verification_plan} placeholder', () => {
    const specContent = [
      '## Overview',
      'Test feature.',
      '',
      '## Verification Plan',
      '',
      '### VP1: Health check',
      '1. `curl http://localhost:3000/health`',
      '   Expected: 200 OK',
      '',
      '## Implementation Hints',
    ].join('\n')

    const tasks = buildSpecTasks(sampleSpecPhases, 42, vpPattern, 2, specContent)
    const verifyTask = tasks.find((t) => t.id === 'p2.1:verify')
    expect(verifyTask).toBeDefined()
    expect(verifyTask!.instruction).toContain('### VP1: Health check')
    expect(verifyTask!.instruction).toContain('curl http://localhost:3000/health')
    expect(verifyTask!.instruction).not.toContain('{verification_plan}')
  })

  it('uses fallback text when spec has no VP section', () => {
    const specContent = [
      '## Overview',
      'Test feature.',
      '',
      '## Implementation Hints',
    ].join('\n')

    const tasks = buildSpecTasks(sampleSpecPhases, 42, vpPattern, 2, specContent)
    const verifyTask = tasks.find((t) => t.id === 'p2.1:verify')
    expect(verifyTask).toBeDefined()
    expect(verifyTask!.instruction).toContain('No verification plan found in spec')
    expect(verifyTask!.instruction).not.toContain('{verification_plan}')
  })

  it('uses fallback text when specContent is not provided', () => {
    const tasks = buildSpecTasks(sampleSpecPhases, 42, vpPattern)
    const verifyTask = tasks.find((t) => t.id === 'p2.1:verify')
    expect(verifyTask).toBeDefined()
    expect(verifyTask!.instruction).toContain('No verification plan found in spec')
  })

  it('creates 3-step dependency chain (impl → test → verify)', () => {
    const tasks = buildSpecTasks(sampleSpecPhases, 42, vpPattern)
    const impl = tasks.find((t) => t.id === 'p2.1:impl')
    const test = tasks.find((t) => t.id === 'p2.1:test')
    const verify = tasks.find((t) => t.id === 'p2.1:verify')

    expect(impl).toBeDefined()
    expect(test).toBeDefined()
    expect(verify).toBeDefined()

    expect(impl!.depends_on).toEqual([])
    expect(test!.depends_on).toEqual(['p2.1:impl'])
    expect(verify!.depends_on).toEqual(['p2.1:test'])
  })
})
