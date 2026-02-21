/**
 * Research Mode Eval
 *
 * Scenario: Pre-configured project, agent enters research mode and explores a topic.
 * Tests that hooks and templates properly control the agent — no maxTurns safety net.
 *
 * Asserts:
 * 1. Agent entered research mode (state.json shows research)
 * 2. Agent stayed in research mode (did NOT switch to planning/implementation)
 * 3. Research findings doc created in planning/research/
 * 4. No spec files created (research mode doesn't write specs)
 * 5. Changes committed
 * 6. kata can-exit passes
 */

import type { EvalScenario, EvalCheckpoint } from '../harness.js'

const assertResearchMode: EvalCheckpoint = {
  name: 'Agent entered research mode',
  assert: (ctx) => {
    const stateFiles = ctx.run(
      'find .claude/sessions -name state.json -type f 2>/dev/null | head -1',
    )
    if (!stateFiles) {
      return 'No session state.json found'
    }
    const content = ctx.readFile(stateFiles.trim())
    try {
      const state = JSON.parse(content)
      const wasResearch =
        state.sessionType === 'research' ||
        state.currentMode === 'research' ||
        state.modeHistory?.some((h: { mode: string }) => h.mode === 'research')
      if (!wasResearch) {
        return `Mode is ${state.currentMode || state.sessionType}, expected research (checked history too)`
      }
      return null
    } catch {
      return 'state.json is not valid JSON'
    }
  },
}

const assertStayedInResearch: EvalCheckpoint = {
  name: 'Agent stayed in research mode (no mode switch)',
  assert: (ctx) => {
    const stateFiles = ctx.run(
      'find .claude/sessions -name state.json -type f 2>/dev/null | head -1',
    )
    if (!stateFiles) return 'No state.json'
    const content = ctx.readFile(stateFiles.trim())
    try {
      const state = JSON.parse(content)
      const history: Array<{ mode: string }> = state.modeHistory ?? []
      const otherModes = history
        .map((h) => h.mode)
        .filter((m) => m !== 'research' && m !== 'default')
      if (otherModes.length > 0) {
        return `Agent switched to other modes: ${otherModes.join(', ')}`
      }
      return null
    } catch {
      return 'state.json is not valid JSON'
    }
  },
}

const assertFindingsDoc: EvalCheckpoint = {
  name: 'Research findings document created',
  assert: (ctx) => {
    const researchPath = ctx.run(
      "grep 'research_path:' .claude/workflows/wm.yaml 2>/dev/null | awk '{print $2}'",
    )?.trim() || 'planning/research'
    const docs = ctx.run(
      `find ${researchPath} -name "*.md" -type f 2>/dev/null | head -5`,
    )
    if (!docs || docs.trim().length === 0) {
      return `No research doc found in ${researchPath}/`
    }
    return null
  },
}

const assertNoSpecs: EvalCheckpoint = {
  name: 'No spec files created (research only)',
  assert: (ctx) => {
    const specs = ctx.run(
      'find planning/specs -name "*.md" -type f 2>/dev/null | head -5',
    )
    if (specs && specs.trim().length > 0) {
      return `Agent created spec files during research mode: ${specs.trim()}`
    }
    return null
  },
}

const assertChangesCommitted: EvalCheckpoint = {
  name: 'Changes committed',
  assert: (ctx) => {
    const commitCount = ctx.run('git rev-list --count HEAD 2>/dev/null')
    if (!commitCount || parseInt(commitCount.trim(), 10) < 2) {
      return 'No new commits beyond initial scaffold'
    }
    return null
  },
}

const assertCanExit: EvalCheckpoint = {
  name: 'kata can-exit passes',
  assert: (ctx) => {
    const result = ctx.run('kata can-exit 2>&1')
    if (!result || result.includes('BLOCKED')) {
      return `can-exit failed: ${result?.trim() || 'no output'}`
    }
    return null
  },
}

export const researchModeScenario: EvalScenario = {
  id: 'research-mode',
  name: 'Research mode — explore and document findings',
  templatePath: '.claude/workflows/templates/research.md',
  prompt:
    'research how this project could add database persistence — ' +
    'explore what ORM/driver options exist for a Node/Express app, ' +
    'what migration strategies work, and how to structure the data layer. ' +
    'Document findings.',
  timeoutMs: 15 * 60 * 1000,
  checkpoints: [
    assertResearchMode,
    assertStayedInResearch,
    assertFindingsDoc,
    assertNoSpecs,
    assertChangesCommitted,
    assertCanExit,
  ],
}
