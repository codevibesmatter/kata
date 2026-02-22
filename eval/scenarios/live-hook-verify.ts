/**
 * Live Hook Verify — quick smoke test for kata hooks in a real project.
 *
 * Requires --project flag pointing to a real, configured kata project.
 * Runs the agent briefly in research mode to verify hooks fire and
 * session state is created correctly.
 *
 * Asserts:
 * 1. Session state initialized with a mode
 * 2. Agent entered research mode
 * 3. Working tree is clean (or at least no uncommitted tracked changes)
 */

import type { EvalScenario } from '../harness.js'
import { assertSessionInitialized, assertCurrentMode, assertCleanWorkingTree } from '../assertions.js'

export const liveHookVerifyScenario: EvalScenario = {
  id: 'live-hook-verify',
  name: 'Live: hook smoke test',
  prompt:
    'Research how config management works in this project. ' +
    'Look at what config files exist, how they are loaded, and document your findings briefly.',
  maxTurns: 10,
  timeoutMs: 5 * 60 * 1000,
  checkpoints: [
    assertSessionInitialized(),
    assertCurrentMode('research'),
    assertCleanWorkingTree(),
  ],
}
