/**
 * Planning Mode Eval — Auth Feature (from research)
 *
 * Realistic continuation: a prior research session produced
 * planning/research/RE-395c-0221-auth.md recommending Better Auth.
 * This scenario enters planning mode to spec the feature.
 *
 * Uses the tanstack-start eval-project which already has:
 * - kata batteries installed (hooks, templates, spec-templates)
 * - The auth research doc committed
 * - A local bare remote for git push
 *
 * The planning template's P0 step calls AskUserQuestion to clarify scope.
 * The prompt pre-answers those questions so the agent can run to completion.
 *
 * Asserts:
 * 1. Agent entered planning mode
 * 2. Spec file created at planning/specs/
 * 3. Spec has status: approved in frontmatter
 * 4. Spec has behavior sections (### B1:)
 * 5. Spec references Better Auth (from the research)
 * 6. New commits created
 * 7. Changes pushed
 */

import type { EvalScenario, EvalCheckpoint, EvalContext } from '../harness.js'
import { assertCurrentMode, assertNewCommit } from '../assertions.js'

function assertSpecFileCreated(): EvalCheckpoint {
  return {
    name: 'spec file created at planning/specs/',
    assert(ctx: EvalContext) {
      const files = ctx.listDir('planning/specs')
      const specFiles = files.filter((f) => f.endsWith('.md'))
      if (specFiles.length === 0) {
        return 'No spec files found in planning/specs/'
      }
      return null
    },
  }
}

function assertSpecApproved(): EvalCheckpoint {
  return {
    name: 'spec frontmatter: status: approved',
    assert(ctx: EvalContext) {
      const files = ctx.listDir('planning/specs')
      const specFiles = files.filter((f) => f.endsWith('.md'))
      if (specFiles.length === 0) return 'No spec files to check'

      for (const file of specFiles) {
        const content = ctx.readFile(`planning/specs/${file}`)
        if (content.includes('status: approved')) return null
      }
      return 'No spec file with status: approved found'
    },
  }
}

function assertSpecHasBehaviors(): EvalCheckpoint {
  return {
    name: 'spec contains behavior sections (### B1:)',
    assert(ctx: EvalContext) {
      const files = ctx.listDir('planning/specs')
      const specFiles = files.filter((f) => f.endsWith('.md'))
      if (specFiles.length === 0) return 'No spec files to check'

      for (const file of specFiles) {
        const content = ctx.readFile(`planning/specs/${file}`)
        if (/###\s+B\d+:/m.test(content)) return null
      }
      return 'No behavior sections (### B1:) found in spec'
    },
  }
}

function assertSpecReferencesBetterAuth(): EvalCheckpoint {
  return {
    name: 'spec references Better Auth (from research)',
    assert(ctx: EvalContext) {
      const files = ctx.listDir('planning/specs')
      const specFiles = files.filter((f) => f.endsWith('.md'))
      if (specFiles.length === 0) return 'No spec files to check'

      for (const file of specFiles) {
        const content = ctx.readFile(`planning/specs/${file}`)
        if (/better.?auth/i.test(content)) return null
      }
      return 'Spec does not reference Better Auth — should build on research findings'
    },
  }
}

function assertChangesPushed(): EvalCheckpoint {
  return {
    name: 'changes pushed to remote',
    assert(ctx: EvalContext) {
      const status = ctx.run('git status -sb')
      // If ahead of remote, changes aren't pushed
      if (status.includes('ahead')) {
        return `Unpushed commits: ${status.split('\n')[0]}`
      }
      return null
    },
  }
}

function assertPlanningPhasesComplete(): EvalCheckpoint {
  return {
    name: 'planning mode in session history',
    assert(ctx: EvalContext) {
      const state = ctx.getSessionState()
      if (!state) return 'Session state not found'
      const hasPlanning = state.modeHistory?.some((h) => h.mode === 'planning')
      if (!hasPlanning) {
        return `Planning mode not found in history: ${JSON.stringify(state.modeHistory)}`
      }
      return null
    },
  }
}

export const planningAuthScenario: EvalScenario = {
  id: 'planning-auth',
  name: 'Planning mode: Better Auth feature spec (from research)',
  templatePath: '.claude/workflows/templates/planning.md',
  // Use the tanstack-start fixture which has kata batteries + auth research doc
  fixture: 'tanstack-start',
  prompt: [
    'Plan user authentication for this TanStack Start app using Better Auth,',
    'based on the research findings in planning/research/RE-395c-0221-auth.md.',
    '',
    'Use kata planning mode. When P0 asks to clarify scope:',
    '- Feature type: New feature',
    '- GitHub issue: No — skip GitHub',
    '',
    'The spec should cover:',
    '- Better Auth setup with session-based auth',
    '- Login and signup pages as new routes',
    '- Route protection via beforeLoad guards',
    '- Auth context provider for client-side state',
    '',
    'Follow the spec template in planning/spec-templates/feature.md.',
    'Produce an approved spec and commit + push it.',
  ].join('\n'),
  timeoutMs: 15 * 60 * 1000,
  checkpoints: [
    assertCurrentMode('planning'),
    assertSpecFileCreated(),
    assertSpecApproved(),
    assertSpecHasBehaviors(),
    assertSpecReferencesBetterAuth(),
    assertNewCommit(),
    assertChangesPushed(),
    assertPlanningPhasesComplete(),
  ],
}
