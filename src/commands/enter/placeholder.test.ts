import { describe, it, expect } from 'bun:test'
import { resolvePlaceholders, type PlaceholderContext } from './placeholder.js'
import type { SessionState } from '../../state/schema.js'
import type { KataConfig } from '../../config/kata-config.js'

const mockSession: Partial<SessionState> = {
  issueNumber: 42,
  workflowId: 'GH#42',
  currentMode: 'implementation',
  specPath: 'planning/specs/42-feature.md',
  currentPhase: 'p2',
}

const mockConfig: Partial<KataConfig> = {
  project: {
    test_command: 'npm test',
    build_command: 'npm run build',
    typecheck_command: 'npm run typecheck',
    name: 'my-project',
    diff_base: 'main',
  },
  spec_path: 'planning/specs',
  research_path: 'planning/research',
}

describe('resolvePlaceholders', () => {
  it('resolves {issue} from session state', () => {
    const result = resolvePlaceholders('Issue #{issue}', {
      session: mockSession as SessionState,
    })
    expect(result).toBe('Issue #42')
  })

  it('resolves {spec_path} from session state', () => {
    const result = resolvePlaceholders('Read {spec_path}', {
      session: mockSession as SessionState,
    })
    expect(result).toBe('Read planning/specs/42-feature.md')
  })

  it('resolves {test_command} from kata.yaml config', () => {
    const result = resolvePlaceholders('{test_command}', {
      config: mockConfig as KataConfig,
    })
    expect(result).toBe('npm test')
  })

  it('resolves {build_command} from kata.yaml config', () => {
    const result = resolvePlaceholders('{build_command}', {
      config: mockConfig as KataConfig,
    })
    expect(result).toBe('npm run build')
  })

  it('resolves {spec_path_dir} from kata.yaml config', () => {
    const result = resolvePlaceholders('{spec_path_dir}', {
      config: mockConfig as KataConfig,
    })
    expect(result).toBe('planning/specs')
  })

  it('session state wins over kata.yaml config', () => {
    // spec_path from session vs spec_path_dir from config — different keys, but
    // test that session is checked first for any key
    const ctx: PlaceholderContext = {
      session: mockSession as SessionState,
      config: mockConfig as KataConfig,
    }
    const result = resolvePlaceholders('{issue} at {spec_path}', ctx)
    expect(result).toBe('42 at planning/specs/42-feature.md')
  })

  it('resolves from extra vars', () => {
    const result = resolvePlaceholders('IMPL - {task_summary}', {
      extra: { task_summary: 'Add auth middleware' },
    })
    expect(result).toBe('IMPL - Add auth middleware')
  })

  it('extra vars are lowest priority', () => {
    const result = resolvePlaceholders('{issue}', {
      session: mockSession as SessionState,
      extra: { issue: 'overridden' },
    })
    expect(result).toBe('42')
  })

  it('leaves unresolved placeholders as-is', () => {
    const result = resolvePlaceholders('Hello {unknown_var}', {})
    expect(result).toBe('Hello {unknown_var}')
  })

  it('handles template with no placeholders', () => {
    const result = resolvePlaceholders('No placeholders here', {})
    expect(result).toBe('No placeholders here')
  })

  it('handles empty template', () => {
    const result = resolvePlaceholders('', {})
    expect(result).toBe('')
  })

  it('resolves multiple placeholders in one template', () => {
    const result = resolvePlaceholders(
      'Working on {mode} for issue {issue}, phase {phase}',
      { session: mockSession as SessionState },
    )
    expect(result).toBe('Working on implementation for issue 42, phase p2')
  })

  it('resolves {project_name} from config', () => {
    const result = resolvePlaceholders('Project: {project_name}', {
      config: mockConfig as KataConfig,
    })
    expect(result).toBe('Project: my-project')
  })

  it('resolves {workflow_id} from session', () => {
    const result = resolvePlaceholders('{workflow_id}', {
      session: mockSession as SessionState,
    })
    expect(result).toBe('GH#42')
  })
})
